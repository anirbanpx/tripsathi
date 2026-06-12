# Tests

Unit and integration tests for the backend. ~150 tests across 8 files.

---

## Coverage

| File | What it tests |
|---|---|
| `test_auth.py` | Google OAuth token exchange, JWT encode/decode, token expiry |
| `test_graph.py` | LangGraph state machine transitions, node routing, retry logic |
| `test_main_helpers.py` | FastAPI route handler utilities, request parsing |
| `test_memory.py` | LangGraph session checkpointing, TTL cleanup of stale sessions |
| `test_saves.py` | Save/load/delete for trips, wishlist, and hotels endpoints |
| `test_smoke.py` | Full pipeline smoke tests with mocked LLM responses |
| `test_taste.py` | Taste/preference extraction from user input |
| `test_tools.py` | Tool integrations — web search (Tavily), weather (OpenWeather), places |

---

## Running Tests

```bash
# From backend/ directory

# Run all tests
pytest tests/

# Verbose output
pytest tests/ -v

# Single file
pytest tests/test_graph.py -v

# Stop on first failure
pytest tests/ -x
```

---

## Notes

- `test_tools.py` includes integration tests that hit live APIs — ensure `TAVILY_API_KEY`, `OPENWEATHER_API_KEY`, and `GOOGLE_MAPS_API_KEY` are set in `.env`
- `test_smoke.py` mocks all LLM calls, so it runs without any API keys
- Config is in `pytest.ini` (sets test paths and markers)
