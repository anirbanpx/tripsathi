"""
Memory tests for TripSathi backend (Mem0 integration).

Unit tests validate guards and graceful degradation — no network needed.
Integration tests do a real write→read round-trip against Mem0 Cloud.

Run unit only (fast):
    pytest tests/test_memory.py -v -m unit

Run all (needs MEM0_API_KEY in .env):
    pytest tests/test_memory.py -v
"""

import os
import sys
import uuid
from unittest.mock import MagicMock, patch

import pytest
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# ── Unit tests ───────────────────────────────────────────────────────────────

class TestReadMemoriesGuards:

    @pytest.mark.unit
    def test_empty_user_id_returns_empty_string(self):
        from memory import read_memories
        assert read_memories("") == ""

    @pytest.mark.unit
    def test_api_failure_returns_empty_string(self):
        """read_memories must degrade silently — never raise to the caller."""
        with patch("memory._get_memory") as mock_get:
            mock_get.return_value.search.side_effect = RuntimeError("Mem0 unreachable")
            from memory import read_memories
            result = read_memories("any_user")
        assert result == ""

    @pytest.mark.unit
    def test_empty_results_returns_empty_string(self):
        with patch("memory._get_memory") as mock_get:
            mock_get.return_value.search.return_value = {"results": []}
            from memory import read_memories
            result = read_memories("user123")
        assert result == ""

    @pytest.mark.unit
    def test_results_formatted_as_bullet_list(self):
        with patch("memory._get_memory") as mock_get:
            mock_get.return_value.search.return_value = {
                "results": [
                    {"memory": "Prefers slow pace"},
                    {"memory": "Avoids crowds"},
                ]
            }
            from memory import read_memories
            result = read_memories("user123")
        assert "Past user travel preferences:" in result
        assert "- Prefers slow pace" in result
        assert "- Avoids crowds" in result


class TestWriteMemoryGuards:

    @pytest.mark.unit
    def test_empty_user_id_is_noop(self):
        """write_memory must not call Mem0 if user_id is empty."""
        with patch("memory._get_memory") as mock_get:
            from memory import write_memory
            write_memory("", "some summary")
        mock_get.assert_not_called()

    @pytest.mark.unit
    def test_empty_summary_is_noop(self):
        with patch("memory._get_memory") as mock_get:
            from memory import write_memory
            write_memory("user123", "")
        mock_get.assert_not_called()

    @pytest.mark.unit
    def test_api_failure_does_not_raise(self):
        """write_memory must fail silently — never propagate exceptions."""
        with patch("memory._get_memory") as mock_get:
            mock_get.return_value.add.side_effect = RuntimeError("Mem0 down")
            from memory import write_memory
            write_memory("user123", "Trip to Manali: liked trekking")  # must not raise

    @pytest.mark.unit
    def test_summary_passed_as_user_message(self):
        """write_memory must pass the summary as a user-role message."""
        with patch("memory._get_memory") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            from memory import write_memory
            write_memory("user123", "Trip to Goa: beach lover, mid-range budget")

        call_args = mock_client.add.call_args
        messages, kwargs = call_args[0][0], call_args[1]
        assert messages[0]["role"] == "user"
        assert "Goa" in messages[0]["content"]
        assert kwargs.get("user_id") == "user123"


class TestWriteMemorySignature:

    @pytest.mark.unit
    def test_signature_matches_nodes_call(self):
        """Regression: write_memory must accept (user_id: str, summary: str).
        Previously had (user_id, plan, trip_parameters, user_profile) which
        caused a silent TypeError every time nodes.py called it."""
        import inspect
        from memory import write_memory
        sig = inspect.signature(write_memory)
        params = list(sig.parameters.keys())
        assert params == ["user_id", "summary"], (
            f"write_memory signature changed — nodes.py expects (user_id, summary), got {params}"
        )


# ── Integration tests (require MEM0_API_KEY) ─────────────────────────────────

def _requires_mem0():
    if not os.getenv("MEM0_API_KEY"):
        pytest.skip("MEM0_API_KEY not set")


@pytest.mark.integration
def test_write_then_read_round_trip():
    """Write a memory, then read it back — verifies Mem0 Cloud connectivity."""
    _requires_mem0()
    import memory as mem_module
    mem_module._memory = None  # reset singleton

    user_id = f"smoke_mem_{uuid.uuid4().hex[:8]}"
    summary = f"Test trip to Leh Ladakh. Liked offbeat routes and camping. Budget: mid. User: {user_id}"

    from memory import write_memory, read_memories
    write_memory(user_id, summary)

    # Mem0 Cloud is eventually consistent — poll up to 20s
    import time
    result = ""
    for _ in range(4):
        time.sleep(5)
        result = read_memories(user_id)
        if result:
            break

    assert result != "", (
        f"read_memories returned empty after write+20s wait — "
        f"Mem0 round-trip failed for user_id={user_id}"
    )
    assert "Past user travel preferences:" in result


@pytest.mark.integration
def test_read_memories_unknown_user_returns_empty():
    """Reading for a user with no history must return empty string, not raise."""
    _requires_mem0()
    import memory as mem_module
    mem_module._memory = None

    from memory import read_memories
    result = read_memories(f"no_such_user_{uuid.uuid4().hex}")
    assert result == ""


@pytest.mark.integration
def test_persona_classification_uses_memories():
    """Smoke: persona_classification node injects past memories into the LLM prompt.
    Verified by confirming read_memories is called with the correct user_id."""
    _requires_mem0()
    import memory as mem_module
    mem_module._memory = None

    calls = []
    original_read = mem_module.read_memories

    def spy_read(user_id):
        calls.append(user_id)
        return original_read(user_id)

    # read_memories is imported locally inside persona_classification via
    # `from memory import read_memories` — patch the source module
    with patch("memory.read_memories", side_effect=spy_read):
        import sys
        sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
        from nodes import persona_classification

        state = {
            "destination": "Manali",
            "trip_parameters": {"user_id": "smoke_persona_user"},
            "onboarding_answers": [{"question": "What kind?", "answer": "Adventure"}],
            "traveler_notes": None,
            "session_tokens": 0,
        }
        try:
            persona_classification(state)
        except Exception:
            pass  # LLM may fail — we only care that read_memories was called

    assert "smoke_persona_user" in calls, "persona_classification did not call read_memories"
