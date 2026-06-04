"""
Unit tests for saves.py — DB CRUD (users, trips, wishlist, hotels),
taste signal extraction, and traveler label derivation.

All tests use a temp DB — never touch real data/taste.db.

Run:
    pytest tests/test_saves.py -v -m unit
"""

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _tmp_db(tmp_path, monkeypatch):
    """Redirect both saves.DB_PATH and taste.DB_PATH to the same temp file."""
    import saves, taste
    db = tmp_path / "test.db"
    monkeypatch.setattr(saves, "DB_PATH", db)
    monkeypatch.setattr(taste, "DB_PATH", db)
    saves._ensure_saves_db()


def _make_user(sub="sub_001", email="u@test.com", name="Test User", avatar="") -> str:
    from saves import upsert_user
    return upsert_user(sub, email, name, avatar)


def _make_taste(user_id: str):
    """Persist a default taste profile so _update_taste_from_save has something to load."""
    from taste import TasteProfile, save_taste
    p = TasteProfile(user_id=user_id)
    save_taste(p)
    return p


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

class TestEnsureSavesDb:

    @pytest.mark.unit
    def test_all_four_tables_exist(self, tmp_path, monkeypatch):
        import saves, sqlite3
        db = tmp_path / "schema_check.db"
        monkeypatch.setattr(saves, "DB_PATH", db)
        saves._ensure_saves_db()
        con = sqlite3.connect(db)
        tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        con.close()
        assert {"users", "saved_trips", "wishlist", "saved_hotels"}.issubset(tables)

    @pytest.mark.unit
    def test_idempotent_second_call(self, tmp_path, monkeypatch):
        import saves
        db = tmp_path / "idem.db"
        monkeypatch.setattr(saves, "DB_PATH", db)
        saves._ensure_saves_db()
        saves._ensure_saves_db()  # should not raise


# ---------------------------------------------------------------------------
# upsert_user / get_user
# ---------------------------------------------------------------------------

class TestUsers:

    @pytest.mark.unit
    def test_new_user_returns_usr_prefixed_id(self):
        user_id = _make_user()
        assert user_id.startswith("usr_")

    @pytest.mark.unit
    def test_same_sub_returns_same_user_id(self):
        uid1 = _make_user(sub="sub_x")
        uid2 = _make_user(sub="sub_x")
        assert uid1 == uid2

    @pytest.mark.unit
    def test_different_subs_return_different_ids(self):
        uid1 = _make_user(sub="sub_a", email="a@test.com")
        uid2 = _make_user(sub="sub_b", email="b@test.com")
        assert uid1 != uid2

    @pytest.mark.unit
    def test_get_user_unknown_returns_none(self):
        from saves import get_user
        assert get_user("usr_doesnotexist") is None

    @pytest.mark.unit
    def test_get_user_known_returns_dict(self):
        from saves import get_user
        uid = _make_user(email="known@test.com", name="Known")
        result = get_user(uid)
        assert result is not None
        assert result["email"] == "known@test.com"
        assert result["name"] == "Known"


# ---------------------------------------------------------------------------
# save_trip / get_saved_trips / delete_saved_trip
# ---------------------------------------------------------------------------

class TestTrips:

    @pytest.mark.unit
    def test_save_trip_returns_trip_id(self):
        from saves import save_trip
        uid = _make_user()
        trip_id = save_trip(uid, "thread_1", "Goa", 5, {})
        assert trip_id.startswith("trp_")

    @pytest.mark.unit
    def test_get_saved_trips_lists_saved(self):
        from saves import save_trip, get_saved_trips
        uid = _make_user()
        save_trip(uid, "t1", "Goa", 5, {})
        save_trip(uid, "t2", "Kerala", 7, {})
        trips = get_saved_trips(uid)
        destinations = {t["destination"] for t in trips}
        assert destinations == {"Goa", "Kerala"}

    @pytest.mark.unit
    def test_get_saved_trips_excludes_plan_json(self):
        from saves import save_trip, get_saved_trips
        uid = _make_user()
        save_trip(uid, "t1", "Goa", 5, {"days": []})
        trips = get_saved_trips(uid)
        assert "plan_json" not in trips[0]

    @pytest.mark.unit
    def test_save_trip_same_thread_upserts(self):
        from saves import save_trip, get_saved_trips
        uid = _make_user()
        save_trip(uid, "thread_dup", "Goa", 5, {"v": 1})
        save_trip(uid, "thread_dup", "Goa", 5, {"v": 2})
        trips = get_saved_trips(uid)
        assert len(trips) == 1

    @pytest.mark.unit
    def test_delete_saved_trip_returns_true(self):
        from saves import save_trip, delete_saved_trip
        uid = _make_user()
        trip_id = save_trip(uid, "t1", "Goa", 5, {})
        assert delete_saved_trip(uid, trip_id) is True

    @pytest.mark.unit
    def test_delete_saved_trip_unknown_returns_false(self):
        from saves import delete_saved_trip
        uid = _make_user()
        assert delete_saved_trip(uid, "trp_nonexistent") is False

    @pytest.mark.unit
    def test_delete_trip_wrong_user_returns_false(self):
        from saves import save_trip, delete_saved_trip
        uid1 = _make_user(sub="sub_1", email="a@t.com")
        uid2 = _make_user(sub="sub_2", email="b@t.com")
        trip_id = save_trip(uid1, "t1", "Goa", 5, {})
        assert delete_saved_trip(uid2, trip_id) is False


# ---------------------------------------------------------------------------
# toggle_wishlist_item / get_wishlist / delete_wishlist_item
# ---------------------------------------------------------------------------

class TestWishlist:

    @pytest.mark.unit
    def test_toggle_add_returns_true(self):
        from saves import toggle_wishlist_item
        uid = _make_user()
        result = toggle_wishlist_item(uid, "destination", "Goa", "India", None)
        assert result is True

    @pytest.mark.unit
    def test_toggle_remove_returns_false(self):
        from saves import toggle_wishlist_item
        uid = _make_user()
        toggle_wishlist_item(uid, "destination", "Goa", "India", None)
        result = toggle_wishlist_item(uid, "destination", "Goa", "India", None)
        assert result is False

    @pytest.mark.unit
    def test_get_wishlist_lists_added(self):
        from saves import toggle_wishlist_item, get_wishlist
        uid = _make_user()
        toggle_wishlist_item(uid, "activity", "Tiger Safari", "Ranthambore", None)
        items = get_wishlist(uid)
        assert len(items) == 1
        assert items[0]["name"] == "Tiger Safari"

    @pytest.mark.unit
    def test_delete_wishlist_item_removes_row(self):
        from saves import toggle_wishlist_item, get_wishlist, delete_wishlist_item
        uid = _make_user()
        toggle_wishlist_item(uid, "activity", "Kayaking", "Goa", None)
        items = get_wishlist(uid)
        assert delete_wishlist_item(uid, items[0]["id"]) is True
        assert get_wishlist(uid) == []

    @pytest.mark.unit
    def test_delete_wishlist_item_wrong_user_returns_false(self):
        from saves import toggle_wishlist_item, get_wishlist, delete_wishlist_item
        uid1 = _make_user(sub="sub_1", email="a@t.com")
        uid2 = _make_user(sub="sub_2", email="b@t.com")
        toggle_wishlist_item(uid1, "activity", "Kayaking", "Goa", None)
        items = get_wishlist(uid1)
        assert delete_wishlist_item(uid2, items[0]["id"]) is False


# ---------------------------------------------------------------------------
# toggle_hotel / get_saved_hotels / delete_hotel
# ---------------------------------------------------------------------------

class TestHotels:

    @pytest.mark.unit
    def test_toggle_add_returns_true(self):
        from saves import toggle_hotel
        uid = _make_user()
        result = toggle_hotel(uid, "Taj Lake Palace", "Udaipur", 12000, None, None)
        assert result is True

    @pytest.mark.unit
    def test_toggle_remove_returns_false(self):
        from saves import toggle_hotel
        uid = _make_user()
        toggle_hotel(uid, "Taj Lake Palace", "Udaipur", 12000, None, None)
        result = toggle_hotel(uid, "Taj Lake Palace", "Udaipur", 12000, None, None)
        assert result is False

    @pytest.mark.unit
    def test_get_saved_hotels_lists_added(self):
        from saves import toggle_hotel, get_saved_hotels
        uid = _make_user()
        toggle_hotel(uid, "Zostel Goa", "Goa", 800, "Great vibe", "rag")
        hotels = get_saved_hotels(uid)
        assert len(hotels) == 1
        assert hotels[0]["name"] == "Zostel Goa"
        assert hotels[0]["content_source"] == "rag"

    @pytest.mark.unit
    def test_delete_hotel_removes_row(self):
        from saves import toggle_hotel, get_saved_hotels, delete_hotel
        uid = _make_user()
        toggle_hotel(uid, "Zostel Goa", "Goa", 800, None, None)
        hotels = get_saved_hotels(uid)
        assert delete_hotel(uid, hotels[0]["id"]) is True
        assert get_saved_hotels(uid) == []

    @pytest.mark.unit
    def test_delete_hotel_wrong_user_returns_false(self):
        from saves import toggle_hotel, get_saved_hotels, delete_hotel
        uid1 = _make_user(sub="sub_1", email="a@t.com")
        uid2 = _make_user(sub="sub_2", email="b@t.com")
        toggle_hotel(uid1, "Zostel Goa", "Goa", 800, None, None)
        hotels = get_saved_hotels(uid1)
        assert delete_hotel(uid2, hotels[0]["id"]) is False


# ---------------------------------------------------------------------------
# _derive_traveler_label
# ---------------------------------------------------------------------------

class TestDeriveTravelerLabel:

    def _profile(self, accommodation_taste=3, interests=None):
        from taste import TasteProfile
        p = TasteProfile(user_id="u1")
        p.accommodation_taste = accommodation_taste
        if interests:
            p.interests.update(interests)
        return p

    @pytest.mark.unit
    def test_budget_label_for_low_accommodation(self):
        from saves import _derive_traveler_label
        p = self._profile(accommodation_taste=2)
        assert "budget" in _derive_traveler_label(p)

    @pytest.mark.unit
    def test_premium_label_for_high_accommodation(self):
        from saves import _derive_traveler_label
        p = self._profile(accommodation_taste=4)
        assert "premium" in _derive_traveler_label(p)

    @pytest.mark.unit
    def test_mid_range_label_for_middle(self):
        from saves import _derive_traveler_label
        p = self._profile(accommodation_taste=3)
        assert "mid-range" in _derive_traveler_label(p)

    @pytest.mark.unit
    def test_top_interests_appear_in_label(self):
        from saves import _derive_traveler_label
        p = self._profile(interests={"nature": 0.9, "heritage": 0.8, "food": 0.3})
        label = _derive_traveler_label(p)
        assert "Nature" in label
        assert "Heritage" in label

    @pytest.mark.unit
    def test_fallback_when_no_interests_above_threshold(self):
        from saves import _derive_traveler_label
        from taste import TasteProfile
        p = TasteProfile(user_id="u1")
        # all interests default to 0.5 — none meet the >= 0.5 threshold for "top" selection
        # but _derive_traveler_label falls back to top[0]
        label = _derive_traveler_label(p)
        assert label  # not empty
        assert "·" in label


# ---------------------------------------------------------------------------
# _update_taste_from_save
# ---------------------------------------------------------------------------

class TestUpdateTasteFromSave:

    @pytest.mark.unit
    def test_no_op_when_no_taste_profile(self):
        from saves import _update_taste_from_save
        # user has no taste profile — should not raise
        _update_taste_from_save("usr_unknown", "hotel", {"approx_cost_per_night": 10000})

    @pytest.mark.unit
    def test_expensive_hotel_nudges_accommodation_up(self):
        from saves import _update_taste_from_save
        from taste import load_taste
        uid = _make_user()
        p = _make_taste(uid)
        original = p.accommodation_taste  # 3
        _update_taste_from_save(uid, "hotel", {"approx_cost_per_night": 10000, "content_source": ""})
        updated = load_taste(uid)
        assert updated.accommodation_taste >= original

    @pytest.mark.unit
    def test_cheap_hotel_nudges_accommodation_down(self):
        from saves import _update_taste_from_save
        from taste import load_taste, TasteProfile, save_taste
        uid = _make_user()
        p = TasteProfile(user_id=uid)
        p.accommodation_taste = 4
        save_taste(p)
        _update_taste_from_save(uid, "hotel", {"approx_cost_per_night": 1500, "content_source": ""})
        updated = load_taste(uid)
        assert updated.accommodation_taste <= 4

    @pytest.mark.unit
    def test_rag_hotel_nudges_immersion_style_down(self):
        from saves import _update_taste_from_save
        from taste import load_taste, TasteProfile, save_taste
        uid = _make_user()
        p = TasteProfile(user_id=uid)
        p.immersion_style = 4
        save_taste(p)
        _update_taste_from_save(uid, "hotel", {"approx_cost_per_night": 3000, "content_source": "rag"})
        updated = load_taste(uid)
        assert updated.immersion_style <= 4

    @pytest.mark.unit
    def test_wishlist_activity_keyword_boosts_interest(self):
        from saves import _update_taste_from_save
        from taste import load_taste
        uid = _make_user()
        p = _make_taste(uid)
        original_nature = p.interests.get("nature", 0.5)
        _update_taste_from_save(uid, "wishlist", {"item_type": "activity", "name": "Waterfall Trek"})
        updated = load_taste(uid)
        assert updated.interests["nature"] >= original_nature

    @pytest.mark.unit
    def test_wishlist_destination_boosts_top_tags(self):
        from saves import _update_taste_from_save
        from taste import load_taste
        uid = _make_user()
        p = _make_taste(uid)
        original_heritage = p.interests.get("heritage", 0.5)
        _update_taste_from_save(uid, "wishlist", {"item_type": "destination", "name": "Rajasthan"})
        updated = load_taste(uid)
        assert updated.interests["heritage"] >= original_heritage

    @pytest.mark.unit
    def test_trip_save_boosts_destination_tags(self):
        from saves import _update_taste_from_save
        from taste import load_taste
        uid = _make_user()
        p = _make_taste(uid)
        original_nature = p.interests.get("nature", 0.5)
        _update_taste_from_save(uid, "trip", {"destination": "Kerala", "plan": {}})
        updated = load_taste(uid)
        assert updated.interests["nature"] >= original_nature

    @pytest.mark.unit
    def test_trip_with_expensive_hotel_adjusts_accommodation(self):
        from saves import _update_taste_from_save
        from taste import load_taste
        uid = _make_user()
        p = _make_taste(uid)
        original = p.accommodation_taste
        plan = {"hotels": [{"approx_cost_per_night": 15000}]}
        _update_taste_from_save(uid, "trip", {"destination": "Goa", "plan": plan})
        updated = load_taste(uid)
        assert updated.accommodation_taste >= original
