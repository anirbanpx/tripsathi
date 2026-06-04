"""
Unit tests for pure helper functions in main.py:
  - _plan_response      — response shaping + HTTPException on error
  - _build_initial_state — initial LangGraph state construction
  - _register_thread    — SQLite thread registry insert
  - _cleanup_expired_threads — TTL-based thread deletion

main.py checks for LLM_API_KEY and imports graph at module level, so we set
the env var and mock the graph module before importing.

Run:
    pytest tests/test_main_helpers.py -v -m unit
"""

import os
import sqlite3
import sys
import time
from unittest.mock import MagicMock

import pytest

# Must happen before main is imported anywhere in this process
os.environ.setdefault("LLM_API_KEY", "test-key-for-testing")

# Stub out the graph module so main.py's `from graph import graph` doesn't
# compile the real LangGraph (which would open checkpoints.db and run nodes)
_mock_graph = MagicMock()
sys.modules.setdefault("graph", _mock_graph)

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_db(path: str) -> None:
    """Create the minimal tables that main.py's helpers operate on."""
    conn = sqlite3.connect(path)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS thread_registry "
        "(thread_id TEXT PRIMARY KEY, created_at REAL NOT NULL)"
    )
    conn.execute("CREATE TABLE IF NOT EXISTS checkpoints (thread_id TEXT)")
    conn.execute("CREATE TABLE IF NOT EXISTS writes (thread_id TEXT)")
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# _plan_response
# ---------------------------------------------------------------------------

class TestPlanResponse:

    @pytest.mark.unit
    def test_error_state_raises_http_exception(self):
        from fastapi import HTTPException
        import main as m
        with pytest.raises(HTTPException) as exc_info:
            m._plan_response({"error": "planning failed: quota exceeded"}, "tid-1")
        assert exc_info.value.status_code == 500
        assert "quota" in exc_info.value.detail

    @pytest.mark.unit
    def test_awaiting_feedback_status(self):
        import main as m
        result = m._plan_response({"awaiting_feedback": True, "plan": {"days": []}}, "tid-1")
        assert result["status"] == "awaiting_feedback"
        assert result["thread_id"] == "tid-1"

    @pytest.mark.unit
    def test_done_status_when_not_awaiting(self):
        import main as m
        result = m._plan_response({"awaiting_feedback": False, "plan": {}}, "tid-2")
        assert result["status"] == "done"

    @pytest.mark.unit
    def test_plan_passed_through(self):
        import main as m
        plan = {"days": [{"day": 1}], "hotels": []}
        result = m._plan_response({"plan": plan}, "tid-3")
        assert result["plan"] == plan

    @pytest.mark.unit
    def test_refinement_count_defaults_to_zero(self):
        import main as m
        result = m._plan_response({}, "tid-4")
        assert result["refinement_count"] == 0

    @pytest.mark.unit
    def test_stage_label_passed_through(self):
        import main as m
        result = m._plan_response({"stage_label": "Generating your itinerary"}, "tid-5")
        assert result["stage_label"] == "Generating your itinerary"


# ---------------------------------------------------------------------------
# _build_initial_state
# ---------------------------------------------------------------------------

class TestBuildInitialState:

    def _make_req(self, destination="Munnar", trip_params=None, answers=None, notes=""):
        import main as m
        return m.PlanRequest(
            destination=destination,
            trip_parameters=trip_params or {"duration": 3},
            onboarding_answers=answers or [],
            traveler_notes=notes,
        )

    @pytest.mark.unit
    def test_destination_set_correctly(self):
        import main as m
        state = m._build_initial_state(self._make_req(destination="Goa"))
        assert state["destination"] == "Goa"

    @pytest.mark.unit
    def test_trip_parameters_passed_through(self):
        import main as m
        params = {"duration": 5, "budget": "mid-range"}
        state = m._build_initial_state(self._make_req(trip_params=params))
        assert state["trip_parameters"] == params

    @pytest.mark.unit
    def test_onboarding_answers_passed_through(self):
        import main as m
        answers = [{"question": "pace?", "answer": "slow"}]
        state = m._build_initial_state(self._make_req(answers=answers))
        assert state["onboarding_answers"] == answers

    @pytest.mark.unit
    def test_empty_notes_become_none(self):
        import main as m
        state = m._build_initial_state(self._make_req(notes=""))
        assert state["traveler_notes"] is None

    @pytest.mark.unit
    def test_nonempty_notes_preserved(self):
        import main as m
        state = m._build_initial_state(self._make_req(notes="I want beaches"))
        assert state["traveler_notes"] == "I want beaches"

    @pytest.mark.unit
    def test_nullable_fields_start_as_none(self):
        import main as m
        state = m._build_initial_state(self._make_req())
        for field in ("user_profile", "research_synthesis", "plan",
                      "user_feedback", "taste_profile", "candidates", "ranked_candidates"):
            assert state[field] is None, f"{field} should start as None"

    @pytest.mark.unit
    def test_counters_start_at_zero(self):
        import main as m
        state = m._build_initial_state(self._make_req())
        assert state["refinement_count"] == 0
        assert state["critic_passes"] == 0
        assert state["refinement_history"] == []

    @pytest.mark.unit
    def test_flags_start_false(self):
        import main as m
        state = m._build_initial_state(self._make_req())
        assert state["awaiting_feedback"] is False
        assert state["regenerate_requested"] is False

    @pytest.mark.unit
    def test_entry_node_is_persona_classification(self):
        import main as m
        state = m._build_initial_state(self._make_req())
        assert state["current_node"] == "persona_classification"


# ---------------------------------------------------------------------------
# _register_thread + _cleanup_expired_threads
# ---------------------------------------------------------------------------

class TestThreadRegistry:

    @pytest.fixture(autouse=True)
    def _patch_db(self, tmp_path, monkeypatch):
        db = str(tmp_path / "checkpoints.db")
        _make_db(db)
        import main as m
        monkeypatch.setattr(m, "_CHECKPOINTS_DB", db)
        self._db = db

    @pytest.mark.unit
    def test_register_thread_inserts_row(self):
        import main as m
        m._register_thread("thread-abc")
        conn = sqlite3.connect(self._db)
        row = conn.execute(
            "SELECT thread_id FROM thread_registry WHERE thread_id = ?", ("thread-abc",)
        ).fetchone()
        conn.close()
        assert row is not None

    @pytest.mark.unit
    def test_register_thread_is_idempotent(self):
        import main as m
        m._register_thread("dup-thread")
        m._register_thread("dup-thread")  # INSERT OR IGNORE — must not raise
        conn = sqlite3.connect(self._db)
        count = conn.execute(
            "SELECT COUNT(*) FROM thread_registry WHERE thread_id = ?", ("dup-thread",)
        ).fetchone()[0]
        conn.close()
        assert count == 1

    @pytest.mark.unit
    def test_cleanup_removes_expired_threads(self):
        import main as m
        old_ts = time.time() - m._SESSION_TTL_SECONDS - 60
        conn = sqlite3.connect(self._db)
        conn.execute(
            "INSERT INTO thread_registry VALUES (?, ?)", ("old-thread", old_ts)
        )
        conn.commit()
        conn.close()

        m._cleanup_expired_threads()

        conn = sqlite3.connect(self._db)
        row = conn.execute(
            "SELECT thread_id FROM thread_registry WHERE thread_id = ?", ("old-thread",)
        ).fetchone()
        conn.close()
        assert row is None

    @pytest.mark.unit
    def test_cleanup_keeps_fresh_threads(self):
        import main as m
        conn = sqlite3.connect(self._db)
        conn.execute(
            "INSERT INTO thread_registry VALUES (?, ?)", ("fresh-thread", time.time())
        )
        conn.commit()
        conn.close()

        m._cleanup_expired_threads()

        conn = sqlite3.connect(self._db)
        row = conn.execute(
            "SELECT thread_id FROM thread_registry WHERE thread_id = ?", ("fresh-thread",)
        ).fetchone()
        conn.close()
        assert row is not None

    @pytest.mark.unit
    def test_cleanup_does_not_raise_on_empty_registry(self):
        import main as m
        m._cleanup_expired_threads()  # empty table — must not raise
