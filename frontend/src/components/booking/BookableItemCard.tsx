import { useState } from "react";
import { bookItem } from "../../services/api";
import { DemoBookingDisclaimer, PriceDisclaimer } from "../../lib/disclaimers";
import type { BookingResponse } from "../../types";

interface BookableItem {
  name: string;
  location: string;
  type: "hotel" | "activity";
  approx_cost: number;
}

interface Props {
  item: BookableItem;
  userId: string;
  isDemo: boolean;
}

export default function BookableItemCard({ item, userId, isDemo }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "booked" | "skipped">("idle");
  const [confirmation, setConfirmation] = useState<BookingResponse | null>(null);

  async function handleBook() {
    setState("loading");
    try {
      const res = await bookItem(userId, {
        name: item.name,
        location: item.location,
        type: item.type,
      });
      setConfirmation(res);
      setState("booked");
    } catch {
      setState("idle");
    }
  }

  if (state === "skipped") {
    return null;
  }

  return (
    // TODO: replace with Claude Design output from design-reference/BookingSection.html (item card)
    <div
      className={`relative rounded-xl border p-4 overflow-hidden ${
        state === "booked" ? "border-green-300 bg-green-50" : "border-slate-200 bg-white"
      }`}
    >
      {state === "booked" && isDemo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-4xl font-black text-green-200 rotate-[-20deg] opacity-40 select-none">
            DEMO
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-2 relative">
        <div>
          <p className="font-semibold text-slate-900">{item.name}</p>
          <p className="text-sm text-slate-500">{item.location}</p>
          <div className="mt-1">
            <PriceDisclaimer />
          </div>
        </div>
        <p className="text-sm font-medium text-slate-800 flex-shrink-0">
          ~₹{item.approx_cost.toLocaleString()}
        </p>
      </div>

      {state === "booked" && confirmation ? (
        <div className="mt-3 relative">
          <p className="text-sm font-semibold text-green-700">
            Booked ✓ · {confirmation.confirmation_id}
          </p>
          <DemoBookingDisclaimer />
        </div>
      ) : (
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleBook}
            disabled={state === "loading"}
            className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {state === "loading" ? "Booking..." : isDemo ? "Book Demo" : "Book"}
          </button>
          <button
            onClick={() => setState("skipped")}
            className="px-4 py-2 border border-slate-200 text-slate-500 rounded-xl text-sm"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
