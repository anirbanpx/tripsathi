import { GeneralSourceDisclaimer, PriceDisclaimer } from "../../lib/disclaimers";
import type { Hotel } from "../../types";

interface Props {
  hotel: Hotel;
}

export default function HotelCard({ hotel }: Props) {
  return (
    // TODO: replace with Claude Design output from design-reference/PlanDisplay.html (hotel card section)
    <div
      className={`rounded-xl border p-4 ${
        hotel.updated_in_refinement ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{hotel.name}</p>
          <p className="text-sm text-slate-500">{hotel.location}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-medium text-slate-800">
            ₹{hotel.approx_cost_per_night.toLocaleString()}/night
          </p>
          <PriceDisclaimer />
        </div>
      </div>
      <p className="text-sm text-slate-600 mt-2">{hotel.reasoning}</p>
      {hotel.content_source === "general" && <GeneralSourceDisclaimer />}
      {hotel.updated_in_refinement && (
        <p className="text-xs text-blue-600 mt-1">↻ Updated in this refinement</p>
      )}
    </div>
  );
}
