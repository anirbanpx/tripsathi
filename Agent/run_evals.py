import anthropic
import csv
import os
import time
from datetime import date

CSV_PATH = "data/evaluations_data.csv"
MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = (
    "You are an expert Indian travel planner. "
    "When given a trip request, produce a structured plan covering: "
    "routing rationale, day-by-day itinerary, specific hotel recommendations with reasoning, "
    "meal options per stop, and any important warnings or logistics the traveler should know. "
    "Be specific to the Indian travel context — IRCTC, tier-2 cities, pilgrimage routes, "
    "regional food, local transport. Surface unstated risks a knowledgeable local would flag."
)

def run_test_case(client, row):
    input_data = row["input_data"].strip()
    if not input_data:
        return row

    print(f"  Running {row['test_case_id']}...", end=" ", flush=True)
    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": input_data}],
        )
        output = message.content[0].text
        row["actual_output"] = output
        row["completed_date"] = date.today().isoformat()
        print("done")
    except Exception as e:
        row["actual_output"] = f"ERROR: {e}"
        print(f"ERROR: {e}")
    return row


def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise SystemExit("ANTHROPIC_API_KEY not set. Run: $env:ANTHROPIC_API_KEY='sk-...'")

    client = anthropic.Anthropic(api_key=api_key)

    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    fieldnames = list(rows[0].keys())

    print(f"Running {len(rows)} test cases against {MODEL}\n")
    updated = []
    for i, row in enumerate(rows, 1):
        print(f"[{i}/{len(rows)}]", end=" ")
        updated.append(run_test_case(client, row))
        if i < len(rows):
            time.sleep(1)  # avoid rate limits

    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(updated)

    print(f"\nDone. Results saved to {CSV_PATH}")


if __name__ == "__main__":
    main()
