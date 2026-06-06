"""
Quick unit tests for the Gemini native-SDK refactor in nodes.py.

Run from backend/:
    python test_gemini.py

Tests:
  1. Pure helpers  — no API key needed
  2. Routing logic — mocks ensure _GeminiProvider calls _call_gemini_json,
                     _Provider still calls provider.client.chat.completions.create
  3. Live smoke    — skipped if FALLBACK2_LLM_API_KEY is not set
"""

import json
import os
import sys
import types as builtin_types
import unittest
from unittest.mock import MagicMock, patch

# ---------------------------------------------------------------------------
# Bootstrap: we need nodes.py importable without loading the full LangGraph
# stack. Stub out heavy deps that aren't needed for these tests.
# ---------------------------------------------------------------------------
for mod in [
    "langgraph", "langgraph.types", "state", "prompts",
    "tools", "mem0", "openinference", "arize", "phoenix",
    "llama_index", "langchain_core",
]:
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()

# Stub langgraph.types.interrupt
sys.modules["langgraph.types"].interrupt = MagicMock()

# Stub state.TripSathiState
sys.modules["state"].TripSathiState = dict

# Stub all prompts as empty strings
prompts_stub = MagicMock()
for attr in [
    "CANDIDATE_GEN_SYSTEM", "CLARIFY_SYSTEM", "CRITIC_SYSTEM",
    "PERSONA_CLASSIFICATION_SYSTEM", "TASTE_DELTA_SYSTEM",
    "QUERY_EXPANSION_SYSTEM", "RESEARCH_SYNTHESIS_SYSTEM",
    "PLAN_GENERATION_SYSTEM", "PLAN_REFINEMENT_SYSTEM", "PLAN_REGENERATE_SYSTEM",
]:
    setattr(prompts_stub, attr, "")
sys.modules["prompts"] = prompts_stub

import nodes  # noqa: E402  (import after stubs)
from nodes import (
    _GeminiProvider,
    _Provider,
    _classify_gemini_error,
    _gemini_tokens,
    _openai_tools_to_gemini,
    _call_llm,
    _call_llm_with_tools,
    _disabled_until,
    _PROVIDERS,
)

# ---------------------------------------------------------------------------
# 1. Pure helper tests
# ---------------------------------------------------------------------------

class TestClassifyGeminiError(unittest.TestCase):
    def test_429_in_message(self):
        self.assertEqual(_classify_gemini_error(Exception("HTTP 429 resource_exhausted")), "quota")

    def test_403_permission_denied(self):
        self.assertEqual(_classify_gemini_error(Exception("403 permission_denied")), "quota")

    def test_denied_access(self):
        self.assertEqual(_classify_gemini_error(Exception("Your project has been denied access")), "quota")

    def test_context_too_long(self):
        self.assertEqual(_classify_gemini_error(Exception("input token count too long")), "context")

    def test_other(self):
        self.assertEqual(_classify_gemini_error(Exception("network error")), "other")


class TestGeminiTokens(unittest.TestCase):
    def test_reads_usage_metadata(self):
        resp = MagicMock()
        resp.usage_metadata.total_token_count = 123
        self.assertEqual(_gemini_tokens(resp), 123)

    def test_missing_metadata_returns_zero(self):
        resp = MagicMock(spec=[])  # no attributes
        self.assertEqual(_gemini_tokens(resp), 0)


class TestOpenaiToolsToGemini(unittest.TestCase):
    OPENAI_TOOLS = [
        {
            "type": "function",
            "function": {
                "name": "search_places",
                "description": "Search for places",
                "parameters": {
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
            },
        }
    ]

    def test_converts_function_declarations(self):
        result = _openai_tools_to_gemini(self.OPENAI_TOOLS)
        self.assertEqual(len(result), 1)
        self.assertIn("function_declarations", result[0])
        decl = result[0]["function_declarations"][0]
        self.assertEqual(decl["name"], "search_places")
        self.assertEqual(decl["description"], "Search for places")
        self.assertIn("parameters", decl)

    def test_empty_tools_returns_empty(self):
        self.assertEqual(_openai_tools_to_gemini([]), [])

    def test_non_function_type_skipped(self):
        self.assertEqual(_openai_tools_to_gemini([{"type": "retrieval"}]), [])


# ---------------------------------------------------------------------------
# 2. Routing tests — verify _call_llm branches correctly
# ---------------------------------------------------------------------------

class TestCallLlmRouting(unittest.TestCase):
    """_call_llm must route _GeminiProvider to _call_gemini_json,
       and _Provider to provider.client.chat.completions.create."""

    def _make_openai_provider(self, name="groq"):
        p = MagicMock(spec=_Provider)
        p.name = name
        p.model = "test-model"
        p.client = MagicMock()
        # Simulate a valid JSON response
        fake_resp = MagicMock()
        fake_resp.usage = None
        fake_resp.choices[0].message.content = '{"ok": true}'
        p.client.chat.completions.create.return_value = fake_resp
        return p

    def _make_gemini_provider(self):
        return _GeminiProvider(name="gemini", api_key="fake-key", model="gemini-2.5-flash")

    def test_gemini_provider_calls_call_gemini_json(self):
        gp = self._make_gemini_provider()
        with patch.object(nodes, "_PROVIDERS", [gp]), \
             patch.object(nodes, "_disabled_until", {}), \
             patch("nodes._call_gemini_json", return_value={"ok": True}) as mock_gemini:
            result = _call_llm("sys", "user", task="default")
        mock_gemini.assert_called_once_with(gp, "sys", "user", 4096)
        self.assertEqual(result, {"ok": True})

    def test_openai_provider_calls_client_create(self):
        op = self._make_openai_provider()
        with patch.object(nodes, "_PROVIDERS", [op]), \
             patch.object(nodes, "_disabled_until", {}):
            result = _call_llm("sys", "user", task="default")
        op.client.chat.completions.create.assert_called_once()
        self.assertEqual(result, {"ok": True})

    def test_gemini_quota_error_falls_through_to_openai(self):
        gp = self._make_gemini_provider()
        op = self._make_openai_provider()
        with patch.object(nodes, "_PROVIDERS", [gp, op]), \
             patch.object(nodes, "_disabled_until", {}), \
             patch("nodes._call_gemini_json", side_effect=Exception("429 quota")):
            result = _call_llm("sys", "user", task="default")
        op.client.chat.completions.create.assert_called_once()
        self.assertEqual(result, {"ok": True})

    def test_task_chain_gemini_only_skips_openai(self):
        gp = self._make_gemini_provider()
        op = self._make_openai_provider()
        with patch.object(nodes, "_PROVIDERS", [gp, op]), \
             patch.object(nodes, "_disabled_until", {}), \
             patch("nodes._call_gemini_json", return_value={"only": "gemini"}) as mock_gemini:
            result = _call_llm("sys", "user", task="gemini_only")
        mock_gemini.assert_called_once()
        op.client.chat.completions.create.assert_not_called()
        self.assertEqual(result, {"only": "gemini"})


class TestCallLlmWithToolsRouting(unittest.TestCase):
    def _make_openai_provider(self):
        p = MagicMock(spec=_Provider)
        p.name = "groq"
        p.model = "test-model"
        p.client = MagicMock()
        fake_resp = MagicMock()
        fake_resp.usage = None
        fake_resp.choices[0].message.tool_calls = None
        fake_resp.choices[0].message.content = '{"ok": true}'
        p.client.chat.completions.create.return_value = fake_resp
        return p

    def _make_gemini_provider(self):
        return _GeminiProvider(name="gemini", api_key="fake-key", model="gemini-2.5-flash")

    def test_gemini_provider_calls_call_gemini_with_tools(self):
        gp = self._make_gemini_provider()
        tools = [{"type": "function", "function": {"name": "test"}}]
        with patch.object(nodes, "_PROVIDERS", [gp]), \
             patch.object(nodes, "_disabled_until", {}), \
             patch("nodes._call_gemini_with_tools", return_value={"ok": True}) as mock_gwt:
            result = _call_llm_with_tools("sys", "user", tools, task="default")
        mock_gwt.assert_called_once_with(gp, "sys", "user", tools, 4096, 4)
        self.assertEqual(result, {"ok": True})

    def test_openai_provider_path_unaffected(self):
        op = self._make_openai_provider()
        with patch.object(nodes, "_PROVIDERS", [op]), \
             patch.object(nodes, "_disabled_until", {}):
            result = _call_llm_with_tools("sys", "user", [], task="default")
        op.client.chat.completions.create.assert_called_once()
        self.assertEqual(result, {"ok": True})


# ---------------------------------------------------------------------------
# 3. Live smoke test — skipped if no key
# ---------------------------------------------------------------------------

GEMINI_KEY = os.environ.get("FALLBACK2_LLM_API_KEY") or os.environ.get("GEMINI_API_KEY")

@unittest.skipUnless(GEMINI_KEY, "FALLBACK2_LLM_API_KEY not set — skipping live test")
class TestGeminiLive(unittest.TestCase):
    def test_live_json_call(self):
        from nodes import _call_gemini_json, _GeminiProvider
        model = os.environ.get("FALLBACK2_LLM_MODEL", "gemini-2.5-flash")
        provider = _GeminiProvider(name="gemini", api_key=GEMINI_KEY, model=model)
        result = _call_gemini_json(
            provider,
            system="You are a helpful assistant. Always respond with valid JSON.",
            user_message='Return {"status": "ok", "value": 42}',
            max_tokens=256,
        )
        self.assertIsNotNone(result)
        self.assertIsInstance(result, dict)
        print(f"\n  live Gemini response: {result}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
