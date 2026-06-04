"""
Unit tests for tools.py — all external calls mocked, no live network.

Run:
    pytest tests/test_tools.py -v -m unit
"""

import os
import sys
from unittest.mock import MagicMock, patch, call

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tavily_result(title="Result", content="Some info", url="https://example.com"):
    return {"results": [{"title": title, "content": content, "url": url}]}


def _ddg_result(title="DDG Result", body="DDG body", href="https://ddg.example.com"):
    return [{"title": title, "body": body, "href": href}]


def _owm_geo():
    return [{"lat": 11.0, "lon": 76.0}]


def _owm_forecast():
    slot = {
        "main": {"temp": 28.0, "humidity": 80},
        "weather": [{"description": "light rain"}],
    }
    return {"list": [slot] * 16}


def _places_response(name="Cafe Sunrise", rating=4.5, n=200, address="MG Road, Munnar"):
    return {
        "places": [
            {
                "displayName": {"text": name},
                "rating": rating,
                "userRatingCount": n,
                "formattedAddress": address,
            }
        ]
    }


# ---------------------------------------------------------------------------
# web_search
# ---------------------------------------------------------------------------

class TestWebSearch:
    @pytest.mark.unit
    def test_tavily_success(self):
        from tools import web_search
        mock_client = MagicMock()
        mock_client.search.return_value = _tavily_result("Manali Hotels", "Great stay", "https://t.co/1")
        with patch("tools._get_tavily", return_value=mock_client), \
             patch("opentelemetry.trace.get_tracer") as mock_tracer:
            mock_tracer.return_value.start_as_current_span.return_value.__enter__ = lambda s, *a: MagicMock()
            mock_tracer.return_value.start_as_current_span.return_value.__exit__ = lambda s, *a: False
            result = web_search("best hotels in Manali")
        assert "Manali Hotels" in result
        assert "Great stay" in result
        assert "https://t.co/1" in result

    @pytest.mark.unit
    def test_tavily_failure_falls_back_to_duckduckgo(self):
        from tools import web_search
        with patch("tools._get_tavily", side_effect=RuntimeError("quota exceeded")), \
             patch("tools._duckduckgo_search", return_value="DDG fallback result") as mock_ddg, \
             patch("opentelemetry.trace.get_tracer") as mock_tracer:
            mock_tracer.return_value.start_as_current_span.return_value.__enter__ = lambda s, *a: MagicMock()
            mock_tracer.return_value.start_as_current_span.return_value.__exit__ = lambda s, *a: False
            result = web_search("Goa beach season")
        mock_ddg.assert_called_once_with("Goa beach season")
        assert result == "DDG fallback result"

    @pytest.mark.unit
    def test_both_providers_fail_returns_graceful_string(self):
        from tools import web_search
        with patch("tools._get_tavily", side_effect=RuntimeError("tavily down")), \
             patch("tools._duckduckgo_search", side_effect=Exception("ddg down")), \
             patch("opentelemetry.trace.get_tracer") as mock_tracer:
            mock_tracer.return_value.start_as_current_span.return_value.__enter__ = lambda s, *a: MagicMock()
            mock_tracer.return_value.start_as_current_span.return_value.__exit__ = lambda s, *a: False
            result = web_search("anything")
        assert "unavailable" in result.lower() or "failed" in result.lower()

    @pytest.mark.unit
    def test_tavily_empty_results(self):
        from tools import web_search
        mock_client = MagicMock()
        mock_client.search.return_value = {"results": []}
        with patch("tools._get_tavily", return_value=mock_client), \
             patch("opentelemetry.trace.get_tracer") as mock_tracer:
            mock_tracer.return_value.start_as_current_span.return_value.__enter__ = lambda s, *a: MagicMock()
            mock_tracer.return_value.start_as_current_span.return_value.__exit__ = lambda s, *a: False
            result = web_search("obscure query")
        assert result == "No results found."


# ---------------------------------------------------------------------------
# _duckduckgo_search
# ---------------------------------------------------------------------------

class TestDuckDuckGoSearch:
    @pytest.mark.unit
    def test_formats_snippets_correctly(self):
        from tools import _duckduckgo_search
        ddg_results = _ddg_result("Kerala Tips", "Travel info", "https://ddg.co/1")
        mock_ddgs = MagicMock()
        mock_ddgs.__enter__ = lambda s: s
        mock_ddgs.__exit__ = MagicMock(return_value=False)
        mock_ddgs.text.return_value = ddg_results
        with patch("duckduckgo_search.DDGS", return_value=mock_ddgs):
            result = _duckduckgo_search("Kerala travel")
        assert "Kerala Tips" in result
        assert "Travel info" in result
        assert "https://ddg.co/1" in result

    @pytest.mark.unit
    def test_empty_results(self):
        from tools import _duckduckgo_search
        mock_ddgs = MagicMock()
        mock_ddgs.__enter__ = lambda s: s
        mock_ddgs.__exit__ = MagicMock(return_value=False)
        mock_ddgs.text.return_value = []
        with patch("duckduckgo_search.DDGS", return_value=mock_ddgs):
            result = _duckduckgo_search("nothing found query")
        assert result == "No results found."


# ---------------------------------------------------------------------------
# get_weather
# ---------------------------------------------------------------------------

class TestGetWeather:
    @pytest.mark.unit
    def test_no_api_key_returns_unavailable(self):
        from tools import get_weather
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("OPENWEATHER_API_KEY", None)
            result = get_weather("Munnar")
        assert "unavailable" in result.lower()

    @pytest.mark.unit
    def test_geocode_empty_returns_message(self):
        from tools import get_weather
        mock_resp = MagicMock()
        mock_resp.json.return_value = []  # empty geocode
        with patch.dict(os.environ, {"OPENWEATHER_API_KEY": "testkey"}), \
             patch("requests.get", return_value=mock_resp):
            result = get_weather("Nonexistent Place")
        assert "could not geocode" in result.lower()

    @pytest.mark.unit
    def test_success_contains_key_fields(self):
        from tools import get_weather
        geo_resp = MagicMock()
        geo_resp.json.return_value = _owm_geo()
        fc_resp = MagicMock()
        fc_resp.json.return_value = _owm_forecast()
        with patch.dict(os.environ, {"OPENWEATHER_API_KEY": "testkey"}), \
             patch("requests.get", side_effect=[geo_resp, fc_resp]):
            result = get_weather("Munnar", "June 2026")
        assert "Munnar" in result
        assert "°C" in result
        assert "humidity" in result.lower()
        assert "June 2026" in result

    @pytest.mark.unit
    def test_request_exception_returns_graceful_string(self):
        from tools import get_weather
        with patch.dict(os.environ, {"OPENWEATHER_API_KEY": "testkey"}), \
             patch("requests.get", side_effect=Exception("timeout")):
            result = get_weather("Manali")
        assert "failed" in result.lower() or "unavailable" in result.lower()

    @pytest.mark.unit
    def test_empty_forecast_list(self):
        from tools import get_weather
        geo_resp = MagicMock()
        geo_resp.json.return_value = _owm_geo()
        fc_resp = MagicMock()
        fc_resp.json.return_value = {"list": []}
        with patch.dict(os.environ, {"OPENWEATHER_API_KEY": "testkey"}), \
             patch("requests.get", side_effect=[geo_resp, fc_resp]):
            result = get_weather("Munnar")
        assert "no forecast" in result.lower()


# ---------------------------------------------------------------------------
# search_places
# ---------------------------------------------------------------------------

class TestSearchPlaces:
    @pytest.mark.unit
    def test_no_api_key_returns_unavailable(self):
        from tools import search_places
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("GOOGLE_MAPS_API_KEY", None)
            result = search_places("restaurants in Munnar")
        assert "unavailable" in result.lower()

    @pytest.mark.unit
    def test_success_formats_place_fields(self):
        from tools import search_places
        mock_resp = MagicMock()
        mock_resp.json.return_value = _places_response()
        with patch.dict(os.environ, {"GOOGLE_MAPS_API_KEY": "testkey"}), \
             patch("requests.post", return_value=mock_resp):
            result = search_places("cafes in Munnar")
        assert "Cafe Sunrise" in result
        assert "4.5" in result
        assert "MG Road" in result

    @pytest.mark.unit
    def test_empty_places_response(self):
        from tools import search_places
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"places": []}
        with patch.dict(os.environ, {"GOOGLE_MAPS_API_KEY": "testkey"}), \
             patch("requests.post", return_value=mock_resp):
            result = search_places("obscure restaurant")
        assert "no places found" in result.lower()

    @pytest.mark.unit
    def test_request_exception_returns_graceful_string(self):
        from tools import search_places
        with patch.dict(os.environ, {"GOOGLE_MAPS_API_KEY": "testkey"}), \
             patch("requests.post", side_effect=Exception("network error")):
            result = search_places("restaurants")
        assert "failed" in result.lower()


# ---------------------------------------------------------------------------
# knowledge_base_query
# ---------------------------------------------------------------------------

class TestKnowledgeBaseQuery:
    @pytest.mark.unit
    def test_rag_unavailable_returns_graceful_string(self):
        from tools import knowledge_base_query
        with patch("rag.indexer.get_index", side_effect=Exception("index not found")):
            result = knowledge_base_query("houseboat safety", "kerala")
        assert "unavailable" in result.lower() or "failed" in result.lower()

    @pytest.mark.unit
    def test_success_returns_node_text(self):
        from tools import knowledge_base_query
        mock_node = MagicMock()
        mock_node.text = "Houseboat safety tip: avoid overnight with toddlers."
        mock_index = MagicMock()
        mock_index.as_retriever.return_value.retrieve.return_value = [mock_node]
        with patch("rag.indexer.get_index", return_value=mock_index):
            result = knowledge_base_query("houseboat toddler", "kerala")
        assert "toddler" in result

    @pytest.mark.unit
    def test_empty_nodes_returns_no_results(self):
        from tools import knowledge_base_query
        mock_index = MagicMock()
        mock_index.as_retriever.return_value.retrieve.return_value = []
        with patch("rag.indexer.get_index", return_value=mock_index):
            result = knowledge_base_query("obscure query", "kerala")
        assert "no results" in result.lower()


# ---------------------------------------------------------------------------
# execute_tool dispatch
# ---------------------------------------------------------------------------

class TestExecuteTool:
    @pytest.mark.unit
    def test_dispatches_get_weather(self):
        from tools import execute_tool
        with patch("tools.get_weather", return_value="weather ok") as m:
            result = execute_tool("get_weather", {"destination": "Munnar", "travel_dates": "June"})
        m.assert_called_once_with("Munnar", "June")
        assert result == "weather ok"

    @pytest.mark.unit
    def test_dispatches_search_places(self):
        from tools import execute_tool
        with patch("tools.search_places", return_value="places ok") as m:
            result = execute_tool("search_places", {"query": "restaurants"})
        m.assert_called_once_with("restaurants")
        assert result == "places ok"

    @pytest.mark.unit
    def test_dispatches_web_search(self):
        from tools import execute_tool
        with patch("tools.web_search", return_value="search ok") as m:
            result = execute_tool("web_search", {"query": "Goa beaches"})
        m.assert_called_once_with("Goa beaches")
        assert result == "search ok"

    @pytest.mark.unit
    def test_dispatches_knowledge_base_query(self):
        from tools import execute_tool
        with patch("tools.knowledge_base_query", return_value="kb ok") as m:
            result = execute_tool("knowledge_base_query", {"query": "houseboat", "destination": "kerala"})
        m.assert_called_once_with("houseboat", "kerala")
        assert result == "kb ok"

    @pytest.mark.unit
    def test_unknown_tool_returns_error_string(self):
        from tools import execute_tool
        result = execute_tool("nonexistent_tool", {})
        assert "unknown tool" in result.lower()

    @pytest.mark.unit
    def test_get_weather_defaults_missing_args(self):
        from tools import execute_tool
        with patch("tools.get_weather", return_value="ok") as m:
            execute_tool("get_weather", {})
        m.assert_called_once_with("", "")

    @pytest.mark.unit
    def test_knowledge_base_query_defaults_missing_destination(self):
        from tools import execute_tool
        with patch("tools.knowledge_base_query", return_value="ok") as m:
            execute_tool("knowledge_base_query", {"query": "temples"})
        m.assert_called_once_with("temples", "")
