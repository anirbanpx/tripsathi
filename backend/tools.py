import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from opentelemetry import trace

logger = logging.getLogger(__name__)
_tracer = trace.get_tracer(__name__)

_tavily_client = None


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


def search_places(query: str) -> str:
    # Uses Places API (New) — POST endpoint, not the legacy Text Search GET endpoint.
    import requests
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not api_key:
        return "Google Maps data unavailable (GOOGLE_MAPS_API_KEY not set)."
    try:
        resp = requests.post(
            "https://places.googleapis.com/v1/places:searchText",
            headers={
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.formattedAddress",
                "Content-Type": "application/json",
            },
            json={"textQuery": query, "regionCode": "IN", "maxResultCount": 12},
            timeout=5,
        ).json()
        places = resp.get("places", [])
        if not places:
            return f"No places found for: {query}"
        lines = []
        for p in places:
            name = p.get("displayName", {}).get("text", "")
            rating = p.get("rating", "N/A")
            n_ratings = p.get("userRatingCount", 0)
            address = p.get("formattedAddress", "")
            lines.append(f"- {name} | Rating: {rating}/5 ({n_ratings} reviews) | {address}")
        return f"Places — '{query}':\n" + "\n".join(lines)
    except Exception as e:
        logger.warning("search_places failed query=%r: %s", query, e)
        return f"Places lookup failed: {e}"


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
