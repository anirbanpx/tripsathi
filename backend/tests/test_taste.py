"""
Unit tests for taste.py — TasteProfile dataclass, merge_taste, taste_to_summary,
and SQLite persistence (load_taste / save_taste).

All tests use a temp DB — never touch the real data/taste.db.

Run:
    pytest tests/test_taste.py -v -m unit
"""

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _profile(**kwargs):
    from taste import TasteProfile
    return TasteProfile(user_id="test_user", **kwargs)


@pytest.fixture(autouse=True)
def _tmp_db(tmp_path, monkeypatch):
    """Redirect DB_PATH to a temp file for every test."""
    import taste
    monkeypatch.setattr(taste, "DB_PATH", tmp_path / "test_taste.db")


# ---------------------------------------------------------------------------
# TasteProfile defaults
# ---------------------------------------------------------------------------

class TestTasteProfileDefaults:

    @pytest.mark.unit
    def test_scalar_defaults_are_midpoint(self):
        from taste import TasteProfile
        p = TasteProfile(user_id="u1")
        for field in ("pace", "crowd_tolerance", "immersion_style",
                      "food_adventurousness", "walking_tolerance",
                      "planning_density", "accommodation_taste"):
            assert getattr(p, field) == 3, f"{field} default should be 3"

    @pytest.mark.unit
    def test_interests_default_all_half(self):
        from taste import TasteProfile
        p = TasteProfile(user_id="u1")
        assert all(v == 0.5 for v in p.interests.values())

    @pytest.mark.unit
    def test_confidence_default_all_low(self):
        from taste import TasteProfile
        p = TasteProfile(user_id="u1")
        assert all(v == 0.1 for v in p.confidence.values())

    @pytest.mark.unit
    def test_lists_default_empty(self):
        from taste import TasteProfile
        p = TasteProfile(user_id="u1")
        assert p.dietary_restrictions == []
        assert p.hard_avoids == []

    @pytest.mark.unit
    def test_decision_style_default(self):
        from taste import TasteProfile
        p = TasteProfile(user_id="u1")
        assert p.decision_style == "L2"


# ---------------------------------------------------------------------------
# merge_taste
# ---------------------------------------------------------------------------

class TestMergeTaste:

    @pytest.mark.unit
    def test_scalar_field_updated(self):
        from taste import TasteProfile, merge_taste
        p = TasteProfile(user_id="u1")
        updated = merge_taste(p, {"pace": 5})
        assert updated.pace == 5

    @pytest.mark.unit
    def test_scalar_bumps_confidence_by_0_2(self):
        from taste import TasteProfile, merge_taste
        p = TasteProfile(user_id="u1")
        initial_conf = p.confidence["pace"]
        updated = merge_taste(p, {"pace": 4})
        assert abs(updated.confidence["pace"] - (initial_conf + 0.2)) < 1e-9

    @pytest.mark.unit
    def test_confidence_capped_at_1_0(self):
        from taste import TasteProfile, merge_taste
        from dataclasses import asdict
        p = TasteProfile(user_id="u1")
        p.confidence["pace"] = 0.95
        updated = merge_taste(p, {"pace": 4})
        assert updated.confidence["pace"] <= 1.0

    @pytest.mark.unit
    def test_interests_merge_only_provided_keys(self):
        from taste import TasteProfile, merge_taste
        p = TasteProfile(user_id="u1")
        original_heritage = p.interests["heritage"]
        updated = merge_taste(p, {"interests": {"nature": 0.9}})
        assert updated.interests["nature"] == 0.9
        assert updated.interests["heritage"] == original_heritage  # untouched

    @pytest.mark.unit
    def test_interests_bumps_confidence(self):
        from taste import TasteProfile, merge_taste
        p = TasteProfile(user_id="u1")
        initial = p.confidence["interests"]
        updated = merge_taste(p, {"interests": {"food": 0.8}})
        assert updated.confidence["interests"] > initial

    @pytest.mark.unit
    def test_dietary_restrictions_replaced(self):
        from taste import TasteProfile, merge_taste
        p = TasteProfile(user_id="u1", dietary_restrictions=["vegetarian"])
        updated = merge_taste(p, {"dietary_restrictions": ["vegan", "gluten-free"]})
        assert updated.dietary_restrictions == ["vegan", "gluten-free"]

    @pytest.mark.unit
    def test_hard_avoids_replaced(self):
        from taste import TasteProfile, merge_taste
        p = TasteProfile(user_id="u1", hard_avoids=["crowds"])
        updated = merge_taste(p, {"hard_avoids": ["extreme heat", "long walks"]})
        assert updated.hard_avoids == ["extreme heat", "long walks"]

    @pytest.mark.unit
    def test_decision_style_updated(self):
        from taste import TasteProfile, merge_taste
        p = TasteProfile(user_id="u1")
        updated = merge_taste(p, {"decision_style": "L3"})
        assert updated.decision_style == "L3"

    @pytest.mark.unit
    def test_user_id_in_updates_ignored(self):
        from taste import TasteProfile, merge_taste
        p = TasteProfile(user_id="u1")
        updated = merge_taste(p, {"user_id": "hacker"})
        assert updated.user_id == "u1"

    @pytest.mark.unit
    def test_unknown_key_silently_ignored(self):
        from taste import TasteProfile, merge_taste
        p = TasteProfile(user_id="u1")
        updated = merge_taste(p, {"nonexistent_field": "value"})
        assert updated.pace == 3  # unchanged

    @pytest.mark.unit
    def test_multiple_scalar_fields_at_once(self):
        from taste import TasteProfile, merge_taste
        p = TasteProfile(user_id="u1")
        updated = merge_taste(p, {"pace": 5, "crowd_tolerance": 1, "walking_tolerance": 4})
        assert updated.pace == 5
        assert updated.crowd_tolerance == 1
        assert updated.walking_tolerance == 4

    @pytest.mark.unit
    def test_original_profile_not_mutated(self):
        from taste import TasteProfile, merge_taste
        p = TasteProfile(user_id="u1")
        merge_taste(p, {"pace": 5})
        assert p.pace == 3  # original unchanged


# ---------------------------------------------------------------------------
# taste_to_summary
# ---------------------------------------------------------------------------

class TestTasteToSummary:

    @pytest.mark.unit
    def test_very_slow_pace(self):
        from taste import TasteProfile, taste_to_summary
        p = TasteProfile(user_id="u1", pace=1)
        assert "very slow-paced" in taste_to_summary(p)

    @pytest.mark.unit
    def test_packed_pace(self):
        from taste import TasteProfile, taste_to_summary
        p = TasteProfile(user_id="u1", pace=5)
        assert "packed" in taste_to_summary(p)

    @pytest.mark.unit
    def test_moderate_pace_label(self):
        from taste import TasteProfile, taste_to_summary
        p = TasteProfile(user_id="u1", pace=3)
        assert "moderate" in taste_to_summary(p)

    @pytest.mark.unit
    def test_crowd_avoider_mentioned(self):
        from taste import TasteProfile, taste_to_summary
        p = TasteProfile(user_id="u1", crowd_tolerance=1)
        assert "avoids crowds" in taste_to_summary(p).lower()

    @pytest.mark.unit
    def test_crowd_tolerant_mentioned(self):
        from taste import TasteProfile, taste_to_summary
        p = TasteProfile(user_id="u1", crowd_tolerance=5)
        assert "fine with crowds" in taste_to_summary(p).lower()

    @pytest.mark.unit
    def test_adventurous_food(self):
        from taste import TasteProfile, taste_to_summary
        p = TasteProfile(user_id="u1", food_adventurousness=5)
        assert "adventurous" in taste_to_summary(p).lower()

    @pytest.mark.unit
    def test_safe_food(self):
        from taste import TasteProfile, taste_to_summary
        p = TasteProfile(user_id="u1", food_adventurousness=1)
        assert "safe" in taste_to_summary(p).lower()

    @pytest.mark.unit
    def test_high_interest_appears_in_summary(self):
        from taste import TasteProfile, taste_to_summary
        p = TasteProfile(user_id="u1")
        p.interests["wildlife"] = 0.9
        p.interests["nature"] = 0.8
        summary = taste_to_summary(p)
        assert "wildlife" in summary or "nature" in summary

    @pytest.mark.unit
    def test_low_interest_omitted(self):
        from taste import TasteProfile, taste_to_summary
        p = TasteProfile(user_id="u1")
        # All interests at 0.5 — below 0.7 threshold
        summary = taste_to_summary(p)
        assert "general sightseeing" in summary

    @pytest.mark.unit
    def test_dietary_restrictions_in_summary(self):
        from taste import TasteProfile, taste_to_summary
        p = TasteProfile(user_id="u1", dietary_restrictions=["vegan"])
        assert "vegan" in taste_to_summary(p)

    @pytest.mark.unit
    def test_hard_avoids_in_summary(self):
        from taste import TasteProfile, taste_to_summary
        p = TasteProfile(user_id="u1", hard_avoids=["crowded markets"])
        assert "avoids" in taste_to_summary(p).lower()
        assert "crowded markets" in taste_to_summary(p)

    @pytest.mark.unit
    def test_returns_two_sentences(self):
        from taste import TasteProfile, taste_to_summary
        p = TasteProfile(user_id="u1")
        summary = taste_to_summary(p)
        assert isinstance(summary, str)
        assert len(summary) > 10


# ---------------------------------------------------------------------------
# SQLite persistence — load_taste / save_taste
# ---------------------------------------------------------------------------

class TestSQLitePersistence:

    @pytest.mark.unit
    def test_load_nonexistent_returns_none(self):
        from taste import load_taste
        assert load_taste("no_such_user") is None

    @pytest.mark.unit
    def test_save_then_load_round_trip(self):
        from taste import TasteProfile, save_taste, load_taste
        p = TasteProfile(user_id="u1", pace=5, crowd_tolerance=1,
                         dietary_restrictions=["vegan"],
                         hard_avoids=["crowds"])
        save_taste(p)
        loaded = load_taste("u1")
        assert loaded is not None
        assert loaded.user_id == "u1"
        assert loaded.pace == 5
        assert loaded.crowd_tolerance == 1
        assert loaded.dietary_restrictions == ["vegan"]
        assert loaded.hard_avoids == ["crowds"]

    @pytest.mark.unit
    def test_save_upserts_on_second_call(self):
        from taste import TasteProfile, save_taste, load_taste
        p = TasteProfile(user_id="u1", pace=2)
        save_taste(p)
        p2 = TasteProfile(user_id="u1", pace=5)
        save_taste(p2)
        loaded = load_taste("u1")
        assert loaded.pace == 5  # latest wins

    @pytest.mark.unit
    def test_multiple_users_independent(self):
        from taste import TasteProfile, save_taste, load_taste
        save_taste(TasteProfile(user_id="alice", pace=1))
        save_taste(TasteProfile(user_id="bob", pace=5))
        assert load_taste("alice").pace == 1
        assert load_taste("bob").pace == 5

    @pytest.mark.unit
    def test_interests_survive_round_trip(self):
        from taste import TasteProfile, save_taste, load_taste
        p = TasteProfile(user_id="u1")
        p.interests["wildlife"] = 0.9
        save_taste(p)
        loaded = load_taste("u1")
        assert abs(loaded.interests["wildlife"] - 0.9) < 1e-6

    @pytest.mark.unit
    def test_confidence_survives_round_trip(self):
        from taste import TasteProfile, save_taste, load_taste
        p = TasteProfile(user_id="u1")
        p.confidence["pace"] = 0.7
        save_taste(p)
        loaded = load_taste("u1")
        assert abs(loaded.confidence["pace"] - 0.7) < 1e-6
