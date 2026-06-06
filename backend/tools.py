import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from opentelemetry import trace

logger = logging.getLogger(__name__)
_tracer = trace.get_tracer(__name__)

_tavily_client = None
_youtube_videos_cache: dict | None = None


def _get_tavily():
    global _tavily_client
    if _tavily_client is None:
        from tavily import TavilyClient
        api_key = os.environ.get("TAVILY_API_KEY")
        if not api_key:
            raise RuntimeError("TAVILY_API_KEY not set")
        _tavily_client = TavilyClient(api_key=api_key)
    return _tavily_client


def _duckduckgo_search(query: str) -> str:
    from ddgs import DDGS
    with DDGS() as ddgs:
        results = list(ddgs.text(query, max_results=5))
    snippets = [
        f"[{r['title']}]\n{r['body']}\nSource: {r['href']}"
        for r in results
    ]
    return "\n\n".join(snippets) if snippets else "No results found."


def web_search(query: str) -> str:
    # Try Tavily first; fall back to DuckDuckGo if unavailable or quota exceeded.
    with _tracer.start_as_current_span("web_search") as span:
        span.set_attribute("openinference.span.kind", "TOOL")
        span.set_attribute("tool.name", "tavily")
        span.set_attribute("input.value", query)
        try:
            client = _get_tavily()
            result = client.search(query, max_results=5, search_depth="basic")
            snippets = []
            for r in result.get("results", []):
                title = r.get("title", "")
                content = r.get("content", "")
                url = r.get("url", "")
                snippets.append(f"[{title}]\n{content}\nSource: {url}")
            output = "\n\n".join(snippets) if snippets else "No results found."
            span.set_attribute("output.value", output[:2000])
            span.set_attribute("search.result_count", len(snippets))
            return output
        except Exception as tavily_err:
            logger.warning("Tavily failed query=%r (%s) — falling back to DuckDuckGo", query, tavily_err)
            span.set_attribute("tool.name", "duckduckgo")
            span.record_exception(tavily_err)
            try:
                output = _duckduckgo_search(query)
                span.set_attribute("output.value", output[:2000])
                return output
            except Exception as ddg_err:
                logger.warning("DuckDuckGo also failed query=%r: %s", query, ddg_err)
                span.record_exception(ddg_err)
                span.set_status(trace.StatusCode.ERROR, str(ddg_err))
                return f"Search unavailable: {ddg_err}"


def get_weather(destination: str, travel_dates: str = "") -> str:
    import requests
    api_key = os.environ.get("OPENWEATHER_API_KEY")
    if not api_key:
        return "Weather data unavailable (OPENWEATHER_API_KEY not set)."
    try:
        # Geocode destination to lat/lon
        geo = requests.get(
            "http://api.openweathermap.org/geo/1.0/direct",
            params={"q": f"{destination},IN", "limit": 1, "appid": api_key},
            timeout=5,
        ).json()
        if not geo:
            return f"Could not geocode '{destination}' for weather lookup."
        lat, lon = geo[0]["lat"], geo[0]["lon"]

        # 5-day / 3-hour forecast (free tier)
        fc = requests.get(
            "https://api.openweathermap.org/data/2.5/forecast",
            params={"lat": lat, "lon": lon, "appid": api_key, "units": "metric", "cnt": 16},
            timeout=5,
        ).json()
        slots = fc.get("list", [])
        if not slots:
            return "No forecast data returned."

        temps = [s["main"]["temp"] for s in slots]
        conditions = list({s["weather"][0]["description"] for s in slots})
        rain_slots = sum(1 for s in slots if "rain" in s.get("weather", [{}])[0].get("description", "").lower())
        humidity = round(sum(s["main"]["humidity"] for s in slots) / len(slots))

        return (
            f"Weather forecast for {destination}:\n"
            f"  Temperature: {min(temps):.0f}°C – {max(temps):.0f}°C\n"
            f"  Conditions: {', '.join(conditions[:4])}\n"
            f"  Rain likelihood: {'High' if rain_slots > 5 else 'Low–moderate'} ({rain_slots}/16 windows)\n"
            f"  Avg humidity: {humidity}%\n"
            f"  Travel dates: {travel_dates or 'not specified'}"
        )
    except Exception as e:
        logger.warning("get_weather failed destination=%r: %s", destination, e)
        return f"Weather lookup failed: {e}"


_PLACES_FIELD_MASK = (
    "places.displayName,places.rating,places.userRatingCount,"
    "places.formattedAddress,places.websiteUri,"
    "places.nationalPhoneNumber,places.googleMapsUri"
)


def _search_places_structured(query: str, price_levels: list[str] | None = None) -> list[dict]:
    """Raw Places API call returning structured dicts with all fields."""
    import requests
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not api_key:
        return []
    body: dict = {"textQuery": query, "regionCode": "IN", "maxResultCount": 5}
    if price_levels:
        body["priceLevels"] = price_levels
    try:
        resp = requests.post(
            "https://places.googleapis.com/v1/places:searchText",
            headers={
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": _PLACES_FIELD_MASK,
                "Content-Type": "application/json",
            },
            json=body,
            timeout=8,
        ).json()
        results = []
        for p in resp.get("places", []):
            results.append({
                "name": p.get("displayName", {}).get("text", ""),
                "rating": str(p.get("rating", "N/A")),
                "user_rating_count": p.get("userRatingCount", 0),
                "address": p.get("formattedAddress", ""),
                "website_url": p.get("websiteUri"),
                "phone": p.get("nationalPhoneNumber"),
                "maps_url": p.get("googleMapsUri"),
            })
        return results
    except Exception as e:
        logger.warning("_search_places_structured failed query=%r: %s", query, e)
        return []


def search_places(query: str, price_levels: list[str] | None = None) -> str:
    # Uses Places API (New) — POST endpoint, not the legacy Text Search GET endpoint.
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not api_key:
        return "Google Maps data unavailable (GOOGLE_MAPS_API_KEY not set)."
    places = _search_places_structured(query, price_levels)
    if not places:
        return f"No places found for: {query}"
    lines = []
    for p in places:
        lines.append(
            f"- {p['name']} | Rating: {p['rating']}/5 ({p['user_rating_count']} reviews) | {p['address']}"
        )
    return f"Places — '{query}':\n" + "\n".join(lines)


def youtube_best_video(destination: str) -> dict | None:
    """Return pre-ingested YouTube video metadata for a destination, or None."""
    import pathlib
    global _youtube_videos_cache
    if _youtube_videos_cache is None:
        videos_path = pathlib.Path(__file__).parent / "rag" / "destination_videos.json"
        try:
            with open(videos_path, encoding="utf-8") as f:
                _youtube_videos_cache = json.load(f)
        except FileNotFoundError:
            _youtube_videos_cache = {}
        except Exception as e:
            logger.warning("Failed to load destination_videos.json: %s", e)
            _youtube_videos_cache = {}

    dest_lower = destination.lower()
    for key, value in _youtube_videos_cache.items():
        if key.lower() == dest_lower:
            return value

    # Live fallback if YOUTUBE_API_KEY is set and destination not in cache
    api_key = os.environ.get("YOUTUBE_API_KEY")
    if not api_key:
        return None
    try:
        import requests
        from datetime import datetime, timedelta, timezone
        published_after = (datetime.now(timezone.utc) - timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%SZ")
        search_resp = requests.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "part": "snippet",
                "q": f"{destination} top places to visit travel guide",
                "type": "video",
                "videoCategoryId": "19",
                "videoDefinition": "high",
                "maxResults": 5,
                "publishedAfter": published_after,
                "key": api_key,
            },
            timeout=8,
        ).json()
        video_ids = [item["id"]["videoId"] for item in search_resp.get("items", [])]
        if not video_ids:
            return None
        details_resp = requests.get(
            "https://www.googleapis.com/youtube/v3/videos",
            params={"part": "contentDetails,statistics,snippet", "id": ",".join(video_ids), "key": api_key},
            timeout=8,
        ).json()
        candidates = []
        for item in details_resp.get("items", []):
            dur_str = item.get("contentDetails", {}).get("duration", "PT0S")
            dur_s = _parse_iso8601_duration(dur_str)
            views = int(item.get("statistics", {}).get("viewCount", 0))
            if dur_s < 300 or views < 50000:
                continue
            snip = item.get("snippet", {})
            candidates.append({
                "video_id": item["id"],
                "title": snip.get("title", ""),
                "view_count": views,
                "duration_seconds": dur_s,
                "published_at": snip.get("publishedAt", "")[:10],
                "description": snip.get("description", "")[:300],
                "tags": snip.get("tags", [])[:10],
                "thumbnail_url": f"https://img.youtube.com/vi/{item['id']}/maxresdefault.jpg",
            })
        candidates.sort(key=lambda x: x["view_count"], reverse=True)
        return candidates[0] if candidates else None
    except Exception as e:
        logger.warning("youtube_best_video live fallback failed destination=%r: %s", destination, e)
        return None


def _parse_iso8601_duration(duration: str) -> int:
    """Parse ISO 8601 duration string (e.g. PT9M42S) to seconds."""
    import re
    match = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration)
    if not match:
        return 0
    h, m, s = (int(x or 0) for x in match.groups())
    return h * 3600 + m * 60 + s


def knowledge_base_query(query: str, destination: str = "") -> str:
    try:
        from rag.indexer import get_index
        from llama_index.core.vector_stores import MetadataFilters, MetadataFilter

        index = get_index()
        filters = (
            MetadataFilters(filters=[MetadataFilter(key="destination", value=destination.lower())])
            if destination
            else None
        )
        retriever = index.as_retriever(similarity_top_k=5, filters=filters)
        nodes = retriever.retrieve(query)
        text = "\n\n".join(n.text for n in nodes).strip()
        return text if text else "No results in knowledge base."
    except Exception as e:
        logger.warning("knowledge_base_query failed query=%r destination=%r: %s", query, destination, e)
        return f"Knowledge base unavailable: {e}"


def batch_knowledge_query(queries: list[str], destination: str = "") -> list[str]:
    """Run multiple knowledge_base_query calls concurrently and return non-empty results."""
    results = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(knowledge_base_query, q, destination): q for q in queries}
        for future in as_completed(futures):
            result = future.result()
            if result and "unavailable" not in result:
                results.append(result)
    return results


TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": (
                "Get current weather forecast for an Indian destination. "
                "Returns temperature range, conditions, rain likelihood, and humidity. "
                "Use to surface seasonal warnings in the research synthesis."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "destination": {"type": "string", "description": "City or region name, e.g. 'Munnar'"},
                    "travel_dates": {"type": "string", "description": "Approximate travel period, e.g. 'June 2026'"}
                },
                "required": ["destination"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_places",
            "description": (
                "Search Google Maps for restaurants, hotels, attractions, or temples at a destination. "
                "Returns real ratings, review counts, and addresses. "
                "Use for specific place recommendations (e.g. 'kid-friendly restaurants in Munnar')."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query, e.g. 'vegetarian restaurants Alleppey Kerala'"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Search the web for current travel information: prices, reviews, "
                "seasonal conditions, transport options, hotel recommendations, "
                "recent traveller experiences at Indian destinations."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Specific search query, e.g. 'Alleppey houseboat operator prices 2024'"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "knowledge_base_query",
            "description": (
                "Query the curated local travel knowledge base for verified destination "
                "content: local risks, pricing norms, logistics, insider tips. "
                "Use alongside web_search for comprehensive coverage. "
                "Pass destination (e.g. 'kerala') to scope results to that destination only."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Retrieval query, e.g. 'Alleppey houseboat toddler safety'"
                    },
                    "destination": {
                        "type": "string",
                        "description": "Optional destination slug to filter results, e.g. 'kerala', 'goa'"
                    }
                },
                "required": ["query"]
            }
        }
    }
]


def execute_tool(name: str, args: dict) -> str:
    if name == "get_weather":
        return get_weather(args.get("destination", ""), args.get("travel_dates", ""))
    if name == "search_places":
        return search_places(args.get("query", ""))
    if name == "web_search":
        return web_search(args.get("query", ""))
    if name == "knowledge_base_query":
        return knowledge_base_query(args.get("query", ""), args.get("destination", ""))
    return f"Unknown tool: {name}"
