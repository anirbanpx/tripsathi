import urllib.request, json, time

payload = json.dumps({
    "destination": "Goa",
    "trip_parameters": {"duration_days": 3, "budget": "mid-range", "travel_style": "beach"},
    "onboarding_answers": [],
    "traveler_notes": "Beach and seafood trip"
}).encode()

req = urllib.request.Request(
    "http://localhost:8000/api/plan/stream",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST"
)

events = []
start = time.time()
try:
    with urllib.request.urlopen(req, timeout=120) as resp:
        for raw_line in resp:
            line = raw_line.decode("utf-8").strip()
            if line.startswith("data:"):
                data = json.loads(line[5:].strip())
                elapsed = round(time.time() - start, 1)
                print(f"[+{elapsed}s] {data.get('type','?')}: {data.get('stage_label') or data.get('detail','') or ''}", flush=True)
                events.append(data)
                if data.get("type") in ("done", "error"):
                    break
except Exception as e:
    print(f"ERROR: {e}")

print(f"\nTotal events: {len(events)}")
if events and events[-1].get("type") == "done":
    plan = events[-1].get("plan") or {}
    print(f"Plan keys: {list(plan.keys())[:8]}")
    print(f"Thread ID: {events[-1].get('thread_id')}")
    print(f"Refinement count: {events[-1].get('refinement_count')}")
elif events and events[-1].get("type") == "error":
    print(f"PIPELINE ERROR: {events[-1].get('detail')}")
