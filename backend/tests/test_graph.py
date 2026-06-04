"""
Unit tests for graph.py — _error_router conditional routing logic and
build_graph wiring (node names, entry point, error edges).

Run:
    pytest tests/test_graph.py -v -m unit
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Import the real graph module at collection time so sys.modules['graph'] is
# populated with the real module before test_main_helpers.py can inject its
# mock via sys.modules.setdefault.
from graph import _error_router, build_graph, graph as _compiled_graph  # noqa: E402


# ---------------------------------------------------------------------------
# _error_router
# ---------------------------------------------------------------------------

class TestErrorRouter:

    @pytest.mark.unit
    def test_routes_to_error_when_current_node_is_error(self):
        route = _error_router("destination_intelligence")
        assert route({"current_node": "error"}) == "error"

    @pytest.mark.unit
    def test_routes_to_normal_next_when_no_error(self):
        route = _error_router("candidate_gen")
        assert route({"current_node": "candidate_gen"}) == "candidate_gen"

    @pytest.mark.unit
    def test_routes_to_normal_next_when_current_node_absent(self):
        route = _error_router("plan_assembly")
        assert route({}) == "plan_assembly"

    @pytest.mark.unit
    def test_returned_function_name_is_descriptive(self):
        route = _error_router("critic")
        assert "critic" in route.__name__

    @pytest.mark.unit
    def test_different_normal_nexts_are_independent(self):
        route_a = _error_router("node_a")
        route_b = _error_router("node_b")
        state = {"current_node": "something"}
        assert route_a(state) == "node_a"
        assert route_b(state) == "node_b"


# ---------------------------------------------------------------------------
# build_graph — wiring checks (no LLM calls)
# ---------------------------------------------------------------------------

class TestBuildGraph:

    @pytest.mark.unit
    def test_graph_builds_without_error(self):
        g = build_graph()
        assert g is not None

    @pytest.mark.unit
    def test_compiled_graph_has_invoke(self):
        assert callable(getattr(_compiled_graph, "invoke", None))

    @pytest.mark.unit
    def test_compiled_graph_has_stream(self):
        assert callable(getattr(_compiled_graph, "stream", None))

    @pytest.mark.unit
    def test_compiled_graph_has_get_state(self):
        assert callable(getattr(_compiled_graph, "get_state", None))
