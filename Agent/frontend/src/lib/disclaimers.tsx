
// Inline contextual disclaimer renderers — shown at point of decision, not in a static panel.

export function PriceDisclaimer() {
  return (
    <span className="text-xs text-amber-600">
      Prices approximate — verify before booking
    </span>
  );
}

export function GeneralSourceDisclaimer() {
  return (
    <div className="mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
      Not RAG-verified — confirm availability and pricing directly with property
    </div>
  );
}

export function DemoBookingDisclaimer() {
  return (
    <div className="text-xs text-slate-500 italic">
      No real booking made — Sprint 3 connects live APIs
    </div>
  );
}

export function HouseboatDisclaimer() {
  return (
    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
      Book through hotel operator — do not approach direct
    </div>
  );
}
