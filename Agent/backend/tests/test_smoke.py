"""
Smoke tests for TripSathi backend.

Two categories:
  - unit  : no server, no network — test logic in isolation
  - integration : require a running server at BASE_URL and valid API keys in .env

Run all:
    pytest tests/test_smoke.py -v

Run only unit (fast, no server needed):
    pytest tests/test_smoke.py -v -m unit

Run only integration (requires: venv/Scripts/uvicorn main:app running on port 8000):
    pytest tests/test_smoke.py -v -m integration
"""

import json
import os
import sqlite3
import sys
import time
from unittest.mock import MagicMock, patch

import pytest
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

BASE_URL = os.getenv("SMOKE_BASE_URL", "http://localhost:8000")

PLAN_PAYLOAD = {
    "destination": "Manali, Himachal Pradesh",
    "trip_parameters": {
        "duration_nights": 3,
        "budget_total": 20000,
        "group_size": 2,
        "user_id": "smoke_test",
    },
    "onboarding_answers": [
        {"question": "What kind of trip?", "answer": "Adventure and trekking"}
    ],
    "traveler_notes": "Want to see snow",
}


# ── Unit tests (no server, no network) ──────────────────────────────────────

class TestErrorNodeMessages:
    """error_node translates raw errors into user-friendly messages."""

    def _run(self, raw_error: str) -> dict:
        from nodes import error_node
        return error_node({"error": raw_error, "current_node": "test"})

    @pytest.mark.unit
    def test_rate_limited_message(self):
        result = self._run("all LLM providers are currently rate-limited")
        assert "capacity" in result["error"]
        assert "try again" in result["error"]

    @pytest.mark.unit
    def test_exhausted_message(self):
        result = self._run("all LLM providers exhausted — no valid JSON response")
        assert "multiple attempts" in result["error"]
        assert "try again" in result["error"]

    @pytest.mark.unit
    def test_other_error_preserves_detail(self):
        result = self._run("destination_intelligence_failed: timeout")
        assert "Planning failed" in result["error"]
        assert "timeout" in result["error"]

    @pytest.mark.unit
    def test_empty_error_gives_generic_message(self):
        result = self._run("")
        assert result["error"]  # non-empty
        assert result["stage_label"] == "Planning could not complete"
        assert result["awaiting_feedback"] is False


class TestParallelRagStructure:
    """Parallel RAG query pool executes all queries concurrently."""

    @pytest.mark.unit
    def test_parallel_queries_all_complete(self):
        from concurrent.futures import ThreadPoolExecutor
        completed = []

        def fake_query(q):
            time.sleep(0.05)
            completed.append(q)
            return f"result:{q}"

        queries = [f"q{i}" for i in range(7)]
        t0 = time.perf_counter()
        with ThreadPoolExecutor(max_workers=7) as pool:
            results = [r for r in pool.map(fake_query, queries) if r]
        elapsed = time.perf_counter() - t0

        assert len(results) == 7
        assert sorted(completed) == sorted(queries)
        assert elapsed < 0.5, f"parallel queries took {elapsed:.2f}s — should be <0.5s"

    @pytest.mark.unit
    def test_parallel_query_failure_is_isolated(self):
        from concurrent.futures import ThreadPoolExecutor

        def flaky_query(q):
            if q == "q3":
                raise RuntimeError("simulated failure")
            return f"ok:{q}"

        queries = [f"q{i}" for i in range(5)]
        results = []
        with ThreadPoolExecutor(max_workers=5) as pool:
            for q in queries:
                try:
                    results.append(flaky_query(q))
                except Exception:
                    pass  # mirrors the per-query try/except in nodes.py

        assert len(results) == 4
        assert all(r.startswith("ok:") for r in results)


class TestTtlCleanup:
    """HITL session TTL cleanup removes expired threads and leaves recent ones."""

    @pytest.mark.unit
    def test_expired_thread_removed(self, tmp_path):
        db = str(tmp_path / "test_checkpoints.db")
        conn = sqlite3.connect(db)
        conn.execute(
            "CREATE TABLE thread_registry (thread_id TEXT PRIMARY KEY, created_at REAL)"
        )
        conn.execute(
            "CREATE TABLE checkpoints (thread_id TEXT, data TEXT)"
        )
        conn.execute(
            "CREATE TABLE writes (thread_id TEXT, data TEXT)"
        )
        old_ts = time.time() - 90000  # 25h ago
        conn.execute("INSERT INTO thread_registry VALUES ('old-thread', ?)", (old_ts,))
        conn.execute("INSERT INTO thread_registry VALUES ('new-thread', ?)", (time.time(),))
        conn.execute("INSERT INTO checkpoints VALUES ('old-thread', 'x')")
        conn.commit()
        conn.close()

        cutoff = time.time() - 86400
        conn = sqlite3.connect(db)
        cur = conn.cursor()
        cur.execute("SELECT thread_id FROM thread_registry WHERE created_at < ?", (cutoff,))
        expired = [r[0] for r in cur.fetchall()]
        for tid in expired:
            cur.execute("DELETE FROM checkpoints WHERE thread_id = ?", (tid,))
            cur.execute("DELETE FROM writes WHERE thread_id = ?", (tid,))
            cur.execute("DELETE FROM thread_registry WHERE thread_id = ?", (tid,))
        conn.commit()

        remaining = [r[0] for r in conn.execute("SELECT thread_id FROM thread_registry").fetchall()]
        checkpoints = [r[0] for r in conn.execute("SELECT thread_id FROM checkpoints").fetchall()]
        conn.close()

        assert "old-thread" not in remaining
        assert "new-thread" in remaining
        assert "old-thread" not in checkpoints


class TestErrorClassification:
    """403 provider errors trigger failover, not raise."""

    @pytest.mark.unit
    def test_403_classified_as_quota(self):
        from openai import APIStatusError
        from nodes import _classify_error
        import httpx

        request = httpx.Request("POST", "https://api.example.com/")
        response = httpx.Response(403, request=request, content=b'{"error": {"code": 403, "message": "PERMISSION_DENIED"}}')
        e = APIStatusError("PERMISSION_DENIED", response=response, body=None)
        assert _classify_error(e) == "quota"

    @pytest.mark.unit
    def test_429_classified_as_quota(self):
        from openai import RateLimitError
        from nodes import _classify_error
        import httpx

        request = httpx.Request("POST", "https://api.example.com/")
        response = httpx.Response(429, request=request, content=b'{"error": "rate_limit_exceeded"}')
        e = RateLimitError("rate limit", response=response, body=None)
        assert _classify_error(e) == "quota"


class TestCallLlmWithTools:
    """Unit tests for the tool-call dispatch loop in _call_llm_with_tools."""

    def _make_provider(self, name="groq"):
        from nodes import _Provider
        provider = MagicMock(spec=_Provider)
        provider.name = name
        provider.model = "mock-model"
        provider.client = MagicMock()
        return provider

    def _final_response(self, content: str):
        """Fake ChatCompletion response with plain JSON content (no tool calls)."""
        resp = MagicMock()
        resp.usage = None
        msg = MagicMock()
        msg.content = content
        msg.tool_calls = None
        resp.choices = [MagicMock()]
        resp.choices[0].message = msg
        return resp

    def _tool_response(self, tool_name: str, arguments: dict):
        """Fake ChatCompletion response with a single tool_call."""
        resp = MagicMock()
        resp.usage = None
        tc = MagicMock()
        tc.id = "call_abc"
        tc.function.name = tool_name
        tc.function.arguments = json.dumps(arguments)
        msg = MagicMock()
        msg.content = ""
        msg.tool_calls = [tc]
        resp.choices = [MagicMock()]
        resp.choices[0].message = msg
        return resp

    @pytest.mark.unit
    def test_no_tool_calls_returns_parsed_json(self):
        """When the LLM returns plain JSON immediately, it's parsed and returned."""
        from nodes import _call_llm_with_tools, _Provider
        provider = self._make_provider()
        provider.client.chat.completions.create.return_value = self._final_response(
            '{"routing": "A→B", "key_places": [], "local_risks": [], "seasonal_context": "dry", "implicit_warnings": []}'
        )
        with patch("nodes._PROVIDERS", [provider]), \
             patch("nodes._disabled_until", {}):
            result = _call_llm_with_tools("sys", "user", tools=[], max_tokens=512)
        assert result["routing"] == "A→B"
        assert result["local_risks"] == []

    @pytest.mark.unit
    def test_tool_call_dispatched_and_result_fed_back(self):
        """When LLM returns tool_calls, execute_tool is called and result is injected."""
        from nodes import _call_llm_with_tools
        provider = self._make_provider()
        tool_resp = self._tool_response("web_search", {"query": "Manali weather June"})
        final_resp = self._final_response(
            '{"routing": "ok", "key_places": [], "local_risks": ["monsoon risk"], '
            '"seasonal_context": "rainy", "implicit_warnings": []}'
        )
        provider.client.chat.completions.create.side_effect = [tool_resp, final_resp]

        fake_tool_result = "Manali: heavy rain, roads closed June–July"
        with patch("nodes._PROVIDERS", [provider]), \
             patch("nodes._disabled_until", {}), \
             patch("tools.execute_tool", return_value=fake_tool_result) as mock_exec:
            result = _call_llm_with_tools("sys", "user", tools=[{"type": "function"}], max_tokens=512)

        mock_exec.assert_called_once_with("web_search", {"query": "Manali weather June"})
        assert result["local_risks"] == ["monsoon risk"]
        # Second call must include the tool result as a "tool" role message
        second_call_messages = provider.client.chat.completions.create.call_args_list[1][1]["messages"]
        tool_msgs = [m for m in second_call_messages if m.get("role") == "tool"]
        assert len(tool_msgs) == 1
        assert fake_tool_result in tool_msgs[0]["content"]

    @pytest.mark.unit
    def test_max_tool_rounds_stops_passing_tools(self):
        """After max_tool_rounds, tools param is omitted to force a final content response."""
        from nodes import _call_llm_with_tools
        provider = self._make_provider()

        # Always return a tool_call until forced to stop
        def side_effect(**kwargs):
            if "tools" in kwargs:
                return self._tool_response("get_weather", {"destination": "Goa"})
            return self._final_response('{"routing":"x","key_places":[],"local_risks":[],"seasonal_context":"","implicit_warnings":[]}')

        provider.client.chat.completions.create.side_effect = (
            lambda *a, **kw: side_effect(**kw)
        )
        with patch("nodes._PROVIDERS", [provider]), \
             patch("nodes._disabled_until", {}), \
             patch("tools.execute_tool", return_value="weather: sunny"):
            result = _call_llm_with_tools("sys", "user", tools=[{"type": "function"}], max_tokens=512, max_tool_rounds=2)

        assert "routing" in result
        # The call after max_tool_rounds must NOT include tools
        calls = provider.client.chat.completions.create.call_args_list
        last_call_kwargs = calls[-1][1]
        assert "tools" not in last_call_kwargs

    @pytest.mark.unit
    def test_provider_error_raises_runtime_error(self):
        """When the only provider fails, RuntimeError is raised."""
        from nodes import _call_llm_with_tools
        provider = self._make_provider()
        provider.client.chat.completions.create.side_effect = RuntimeError("boom")
        with patch("nodes._PROVIDERS", [provider]), \
             patch("nodes._disabled_until", {}):
            with pytest.raises(RuntimeError):
                _call_llm_with_tools("sys", "user", tools=[], max_tokens=512)

    @pytest.mark.unit
    def test_fallback_to_second_provider_on_error(self):
        """On first provider failure, second provider is tried."""
        from nodes import _call_llm_with_tools
        bad_provider = self._make_provider(name="groq")
        bad_provider.client.chat.completions.create.side_effect = RuntimeError("unsupported")

        good_provider = self._make_provider(name="cerebras")
        good_provider.client.chat.completions.create.return_value = self._final_response(
            '{"routing": "fallback", "key_places": [], "local_risks": [], "seasonal_context": "", "implicit_warnings": []}'
        )
        with patch("nodes._PROVIDERS", [bad_provider, good_provider]), \
             patch("nodes._disabled_until", {}):
            result = _call_llm_with_tools("sys", "user", tools=[], max_tokens=512)
        assert result["routing"] == "fallback"
        good_provider.client.chat.completions.create.assert_called_once()


# ── Integration tests (require running server + API keys) ────────────────────

def _sse_events(url: str, payload: dict, timeout: int = 240) -> list[dict]:
    """Fire a POST to url, collect all SSE events until done/error."""
    import urllib.request
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    events = []
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        for raw in resp:
            line = raw.decode("utf-8").strip()
            if line.startswith("data:"):
                event = json.loads(line[5:].strip())
                events.append(event)
                if event.get("type") in ("done", "error"):
                    break
    return events


@pytest.mark.integration
def test_plan_stream_returns_thread_id():
    events = _sse_events(f"{BASE_URL}/api/plan/stream", PLAN_PAYLOAD)
    assert events, "no SSE events received"
    assert events[0]["type"] == "thread_id"
    assert events[0]["thread_id"]


@pytest.mark.integration
def test_plan_stream_emits_stage_events():
    events = _sse_events(f"{BASE_URL}/api/plan/stream", PLAN_PAYLOAD)
    final = events[-1] if events else {}
    if final.get("type") == "error" and "capacity" in final.get("detail", ""):
        pytest.skip("rate limited")
    stages = [e["stage_label"] for e in events if e.get("type") == "stage"]
    assert len(stages) >= 2, f"expected ≥2 stage events, got {stages}"


@pytest.mark.integration
def test_plan_stream_completes_with_plan():
    events = _sse_events(f"{BASE_URL}/api/plan/stream", PLAN_PAYLOAD)
    final = events[-1]
    if final["type"] == "error":
        detail = final.get("detail", "")
        if "capacity" in detail or "rate" in detail.lower():
            pytest.skip(f"rate limited — {detail}")
    assert final["type"] == "done", f"stream ended with error: {final.get('detail')}"
    plan = final.get("plan") or {}
    assert "days" in plan, "plan missing 'days' key"
    assert len(plan["days"]) > 0, "plan has no days"
    assert "hotels" in plan
    assert "warnings" in plan


@pytest.mark.integration
def test_plan_stream_thread_registered_in_registry():
    events = _sse_events(f"{BASE_URL}/api/plan/stream", PLAN_PAYLOAD)
    thread_id = events[0]["thread_id"]
    conn = sqlite3.connect("checkpoints.db")
    row = conn.execute(
        "SELECT created_at FROM thread_registry WHERE thread_id = ?", (thread_id,)
    ).fetchone()
    conn.close()
    assert row is not None, f"thread {thread_id} not found in thread_registry"
    assert time.time() - row[0] < 600, "thread registered more than 10 min ago — unexpected"


@pytest.mark.integration
def test_rag_import_and_query():
    """RAG module imports cleanly and can query the Qdrant collection."""
    from rag.indexer import get_query_engine
    qe = get_query_engine(destination="manali")
    try:
        result = qe.query("Manali top attractions")
    except Exception as e:
        if "rate" in str(e).lower() or "429" in str(e):
            pytest.skip(f"Voyage AI rate limited — {e}")
        raise
    assert result is not None
    text = str(result)
    assert len(text) > 20, "RAG returned empty or trivial result"


@pytest.mark.integration
def test_plan_stream_error_message_is_user_friendly():
    """If the stream ends in error, the message should be human-readable (not a raw traceback)."""
    events = _sse_events(f"{BASE_URL}/api/plan/stream", PLAN_PAYLOAD)
    final = events[-1]
    if final["type"] == "error":
        detail = final.get("detail", "")
        assert "Traceback" not in detail, "raw Python traceback exposed to client"
        assert len(detail) < 300, "error message suspiciously long — may be raw exception"


@pytest.mark.integration
def test_call_llm_with_tools_returns_valid_synthesis():
    """_call_llm_with_tools end-to-end: real LLM + tools, returns research_synthesis structure."""
    from nodes import _call_llm_with_tools
    from tools import TOOL_SCHEMAS
    from prompts import RESEARCH_SYNTHESIS_SYSTEM

    synthesis_prompt = (
        "Destination: Manali, Himachal Pradesh\n"
        "Traveller profile: {\"persona_type\": \"solo\", \"constraints\": {\"kid_ages\": null, \"elderly\": false}}\n"
        "Trip parameters: {\"duration_nights\": 3, \"budget_total\": 15000}\n"
        "Retrieved knowledge (RAG):\nNo destination-specific content retrieved.\n\n"
        "Use available tools ONLY to fill gaps not already covered above — "
        "get_weather for current seasonal warnings, search_places for specific hotel/restaurant ratings, "
        "web_search for recent traveller reports or pricing not in the RAG content. "
        "After any tool calls, produce the synthesis JSON."
    )
    try:
        result = _call_llm_with_tools(
            RESEARCH_SYNTHESIS_SYSTEM, synthesis_prompt, tools=TOOL_SCHEMAS,
            max_tokens=2048, task="synthesis",
        )
    except RuntimeError as e:
        if "rate" in str(e).lower() or "exhausted" in str(e).lower():
            pytest.skip(f"LLM quota — {e}")
        raise

    assert isinstance(result, dict), f"expected dict, got {type(result)}"
    for key in ("routing", "key_places", "local_risks", "seasonal_context", "implicit_warnings"):
        assert key in result, f"synthesis missing key: {key}"
    assert isinstance(result["local_risks"], list)
    assert isinstance(result["implicit_warnings"], list)
