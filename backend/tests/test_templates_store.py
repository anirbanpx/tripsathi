"""Unit tests for templates_store — canonical_key(), match(), template_count()."""
import pytest

pytestmark = pytest.mark.unit

from templates_store import canonical_key, match, template_count


# ── canonical_key ────────────────────────────────────────────────────────────

def test_canonical_key_basic():
    key = canonical_key("Munnar", {"duration_nights": 3, "party_size": 2, "kid_ages": [], "elderly": False, "budget": "mid", "trip_style": ["nature", "tea"]})
    assert key == "munnar_3n_p2_nokids_fit_mid_nature_tea"


def test_canonical_key_duration_days_frontend_format():
    # frontend sends duration_days; backend must derive nights = days - 1
    key = canonical_key("Munnar", {"duration_days": 4, "party_size": 2, "kid_ages": [], "elderly": False, "budget_bracket": "mid", "trip_style": ["nature", "tea"]})
    assert key == "munnar_3n_p2_nokids_fit_mid_nature_tea"


def test_canonical_key_budget_bracket_alias():
    # budget_bracket (frontend) and budget (backend) must produce the same key
    key_bracket = canonical_key("Hampi", {"duration_nights": 3, "party_size": 2, "kid_ages": [], "elderly": False, "budget_bracket": "budget", "trip_style": ["heritage", "photography"]})
    key_budget  = canonical_key("Hampi", {"duration_nights": 3, "party_size": 2, "kid_ages": [], "elderly": False, "budget": "budget",         "trip_style": ["heritage", "photography"]})
    assert key_bracket == key_budget == "hampi_3n_p2_nokids_fit_budget_heritage_photography"


def test_canonical_key_with_kid_ages():
    key = canonical_key("Darjeeling", {"duration_nights": 4, "party_size": 2, "kid_ages": [10], "elderly": False, "budget": "mid", "trip_style": ["heritage", "nature"]})
    assert key == "darjeeling_4n_p2_k10_fit_mid_heritage_nature"


def test_canonical_key_styles_sorted():
    # trip_style order must not affect the key
    key_ab = canonical_key("Udaipur", {"duration_nights": 4, "party_size": 2, "kid_ages": [], "elderly": False, "budget": "premium", "trip_style": ["heritage", "romance"]})
    key_ba = canonical_key("Udaipur", {"duration_nights": 4, "party_size": 2, "kid_ages": [], "elderly": False, "budget": "premium", "trip_style": ["romance", "heritage"]})
    assert key_ab == key_ba == "udaipur_4n_p2_nokids_fit_premium_heritage_romance"


def test_canonical_key_spaces_in_destination():
    key = canonical_key("Jim Corbett", {"duration_nights": 3, "party_size": 2, "kid_ages": [], "elderly": False, "budget": "mid", "trip_style": ["nature", "wildlife"]})
    assert key.startswith("jim_corbett_")


# ── match ────────────────────────────────────────────────────────────────────

def test_match_hit_returns_template():
    params = {"duration_days": 4, "party_size": 2, "kid_ages": [], "elderly": False, "budget_bracket": "mid", "trip_style": ["nature", "tea"]}
    result = match("Munnar", params)
    assert result is not None
    assert "plan" in result
    assert result.get("key") == "munnar_3n_p2_nokids_fit_mid_nature_tea"


def test_match_miss_unknown_destination():
    params = {"duration_nights": 3, "party_size": 2, "kid_ages": [], "elderly": False, "budget": "mid", "trip_style": ["nature"]}
    assert match("Atlantis", params) is None


def test_match_miss_wrong_party_size():
    # Munnar template is party=2; party=4 should miss
    params = {"duration_days": 4, "party_size": 4, "kid_ages": [], "elderly": False, "budget_bracket": "mid", "trip_style": ["nature", "tea"]}
    assert match("Munnar", params) is None


def test_match_blocked_by_traveler_notes():
    params = {"duration_days": 4, "party_size": 2, "kid_ages": [], "elderly": False, "budget_bracket": "mid", "trip_style": ["nature", "tea"]}
    assert match("Munnar", params, traveler_notes="avoid tourist traps") is None


def test_match_whitespace_only_notes_still_hits():
    params = {"duration_days": 4, "party_size": 2, "kid_ages": [], "elderly": False, "budget_bracket": "mid", "trip_style": ["nature", "tea"]}
    assert match("Munnar", params, traveler_notes="   ") is not None


def test_match_onboarding_answers_not_a_signal():
    # onboarding_answers should never block a template hit
    params = {"duration_days": 4, "party_size": 2, "kid_ages": [], "elderly": False, "budget_bracket": "mid", "trip_style": ["nature", "tea"]}
    assert match("Munnar", params, onboarding_answers=[{"q": "pace", "a": "relaxed"}]) is not None


# ── template_count ───────────────────────────────────────────────────────────

def test_template_count_is_20():
    assert template_count() == 20
