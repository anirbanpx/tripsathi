"""
SSE timing harness for the /api/plan/stream endpoint.

Usage (from repo root):
    cd backend
    PHOENIX_ENABLED=false .\\venv\\Scripts\\python.exe time_plan.py

Set PHOENIX_ENABLED=false to suppress OTEL spam so LLM call logs are readable.
Edit PAYLOAD below to change destination / trip parameters.
"""
import httpx, time, json

PAYLOAD = {
    "destination": "Goa",
    "trip_parameters": {
        "duration": 5,
        "travel_style": "beach relaxation",
        "budget": "mid-range",
        "group_type": "couple",
        "special_requirements": "",
    },
    "onboarding_answers": [
        {"question": "What kind of trip are you looking for?", "answer": "Beach relaxation with some sightseeing"},
        {"question": "Who are you traveling with?", "answer": "My partner"},
        {"question": "What's your budget?", "answer": "Mid-range"},
    ],
    "traveler_notes": "",
}

url = "http://localhost:8000/api/plan/stream"
print(f"POST {url}")
print(f"Payload: {json.dumps(PAYLOAD)}\n")

t0 = time.monotonic()
last_stage = None
events = []

with httpx.Client(timeout=600) as client:
    with client.stream("POST", url, json=PAYLOAD) as resp:
        for line in resp.iter_lines():
            if not line.startswith("data:"):
                continue
            raw = line[5:].strip()
            if not raw:
                continue
            try:
                ev = json.loads(raw)
            except json.JSONDecodeError:
                continue
            elapsed = time.monotonic() - t0
            etype = ev.get("type", "?")
            stage = ev.get("stage", "")
            events.append((elapsed, etype, stage))
            label = f"[{elapsed:6.1f}s] type={etype:<20} stage={stage}"
            print(label)
            if etype == "done":
                print(f"\n  plan_days={ev.get('plan_days', '?')}")
                break

total = time.monotonic() - t0
print(f"\nTotal: {total:.0f}s | Events: {len(events)}")
