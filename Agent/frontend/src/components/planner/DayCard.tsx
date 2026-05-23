import type { DayPlan } from "../../types";

interface Props {
  day: DayPlan;
}

export default function DayCard({ day }: Props) {
  return (
    // TODO: replace with Claude Design output from design-reference/PlanDisplay.html (day card section)
    <div
      className={`rounded-xl border p-4 ${
        day.updated_in_refinement ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
          Day {day.day_number}
        </span>
        <span className="font-semibold text-slate-800">{day.location}</span>
        {day.updated_in_refinement && (
          <span className="text-xs text-blue-600 ml-auto">↻ {day.update_note ?? "Updated"}</span>
        )}
      </div>

      <ul className="flex flex-col gap-1.5 mb-3">
        {day.activities.map((a) => (
          <li key={a.name} className="flex items-start justify-between gap-2">
            <span className="text-sm text-slate-700">{a.name}</span>
            <div className="flex-shrink-0 text-right">
              {a.bookable ? (
                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                  Bookable
                </span>
              ) : (
                <span className="text-xs text-slate-400">Plan to visit</span>
              )}
              {a.approx_cost != null && (
                <p className="text-xs text-slate-500">~₹{a.approx_cost.toLocaleString()}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {day.notes && (
        <p className="text-xs text-slate-500 border-t border-slate-100 pt-2 mt-2">{day.notes}</p>
      )}
    </div>
  );
}
