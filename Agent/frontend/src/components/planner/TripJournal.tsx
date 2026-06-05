import { useState, useRef } from "react";
import { ChevronLeft, ChevronRight, Bed, Car, Utensils, Sparkles, AlertCircle } from "lucide-react";
import DayJournalCard from "./DayJournalCard";
import PageTransition from "../shared/PageTransition";
import { getDestinationImageUrl } from "../../lib/destinationImage";
import type { Plan } from "../../types";

interface Props {
  plan: Plan;
}

export default function TripJournal({ plan }: Props) {
  // pages: 0 = cover, 1..N = days, N+1 = closing
  const totalPages = plan.days.length + 2;
  const [page, setPage] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const destName = plan.days[0]?.location.split(",")[0] ?? "your trip";
  const heroImg = getDestinationImageUrl(plan.days[0]?.location ?? "");

  function goTo(next: number) {
    setPage(Math.max(0, Math.min(totalPages - 1, next)));
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) goTo(dx < 0 ? page + 1 : page - 1);
    touchStartX.current = null;
  }

  return (
    <div className="trip-journal" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <PageTransition stepKey={page}>
        <div className="journal-page-content">
          {page === 0 && (
            <JournalCover destName={destName} heroImg={heroImg} nights={plan.days.length} />
          )}
          {page >= 1 && page <= plan.days.length && (
            <div className="journal-day-page">
              <DayJournalCard day={plan.days[page - 1]} listMode />
            </div>
          )}
          {page === totalPages - 1 && (
            <JournalClosing plan={plan} />
          )}
        </div>
      </PageTransition>

      {/* Navigation */}
      <div className="journal-nav">
        <button
          className="journal-nav-btn"
          onClick={() => goTo(page - 1)}
          disabled={page === 0}
          aria-label="Previous page"
        >
          <ChevronLeft size={20} strokeWidth={2} />
        </button>

        <div className="journal-dots">
          {Array.from({ length: totalPages }).map((_, i) => (
            <div
              key={i}
              className={`journal-dot${i === page ? " active" : ""}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>

        <button
          className="journal-nav-btn"
          onClick={() => goTo(page + 1)}
          disabled={page === totalPages - 1}
          aria-label="Next page"
        >
          <ChevronRight size={20} strokeWidth={2} />
        </button>
      </div>

      <div className="journal-page-label">
        {page === 0
          ? "cover ✦"
          : page === totalPages - 1
          ? "closing ✦"
          : `day ${page} of ${plan.days.length}`}
      </div>
    </div>
  );
}

function JournalCover({ destName, heroImg, nights }: {
  destName: string;
  heroImg: string | null;
  nights: number;
}) {
  return (
    <div className="journal-cover">
      {heroImg && (
        <div className="journal-cover-img-wrap">
          <img src={heroImg} alt={destName} className="journal-cover-img" />
          <div className="journal-cover-img-overlay" />
        </div>
      )}
      <div className="journal-cover-body">
        <div className="journal-cover-tape" />
        <div className="journal-cover-title">{destName} ✦</div>
        <div className="journal-cover-nights">{nights} nights</div>
        <div className="journal-cover-cue">flip through your days →</div>
      </div>
    </div>
  );
}

function JournalClosing({ plan }: { plan: Plan }) {
  return (
    <div className="journal-closing">
      <div className="journal-closing-heading">your journey ✦</div>

      <div className="journal-closing-section">
        <div className="journal-closing-label">estimated budget</div>
        <div className="journal-closing-total">
          ~₹{plan.budget_breakdown.total.toLocaleString()}
        </div>
        <div className="journal-closing-rows">
          {([
            ["accommodation", Bed, plan.budget_breakdown.accommodation],
            ["transport", Car, plan.budget_breakdown.transport],
            ["food", Utensils, plan.budget_breakdown.food],
            ["activities", Sparkles, plan.budget_breakdown.activities],
          ] as const).map(([key, Icon, val]) => (
            <div key={key} className="journal-closing-row">
              <span className="jcr-lab"><Icon size={12} strokeWidth={2} />{key}</span>
              <span className="jcr-val">₹{(val as number).toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="journal-closing-disc">
          <AlertCircle size={11} strokeWidth={2} />
          estimates only — book to see actual prices.
        </div>
      </div>

      {plan.hotels.length > 0 && (
        <div className="journal-closing-section">
          <div className="journal-closing-label">where you'll stay</div>
          {plan.hotels.map(h => (
            <div key={h.name} className="journal-closing-hotel">
              <Bed size={13} strokeWidth={2} style={{ color: "var(--bark-2)", flexShrink: 0 }} />
              <div className="jch-info">
                <div className="jch-name">{h.name}</div>
                <div className="jch-loc">{h.location}</div>
              </div>
              <div className="jch-cost">
                ₹{h.approx_cost_per_night.toLocaleString()}<span>/n</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="journal-closing-cta">looks good — ready to book ✦</div>
    </div>
  );
}
