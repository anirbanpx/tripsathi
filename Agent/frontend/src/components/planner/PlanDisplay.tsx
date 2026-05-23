import { useState } from "react";
import {
  ArrowLeft, Share2, Bookmark, AlertTriangle, Info, RefreshCw, Check,
  Loader2, BookOpen, AlertCircle, Bed, Car, Utensils, Sparkles, ArrowUp, Shuffle, ChevronDown,
} from "lucide-react";
import { refinePlan, regeneratePlan } from "../../services/api";
import { startFakeProgress } from "../../lib/fakeProgress";
import type { UserContext, DayPlan, Hotel } from "../../types";

interface Props {
  ctx: UserContext;
  onSetContext: (patch: Partial<UserContext>) => void;
}

export default function PlanDisplay({ ctx, onSetContext }: Props) {
  const plan = ctx.plan!;
  const [feedback, setFeedback] = useState("");
  const [refining, setRefining] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1, 2]));

  function toggleDay(n: number) {
    setExpandedDays((s) => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  }

  async function handleRefine() {
    if (!feedback.trim() || !ctx.thread_id) return;
    setRefining(true);
    try {
      const res = await refinePlan(ctx.thread_id, feedback);
      onSetContext({
        plan: res.plan,
        refinement_count: res.refinement_count ?? ctx.refinement_count + 1,
        interpreted_change: res.interpreted_change ?? null,
        refinement_warning_shown:
          (res.refinement_count ?? ctx.refinement_count + 1) >= 4 || ctx.refinement_warning_shown,
      });
      setFeedback("");
    } finally {
      setRefining(false);
    }
  }

  async function handleRegenerate() {
    if (!ctx.thread_id) return;
    const handle = startFakeProgress(
      (index, label) => onSetContext({ fake_stage_index: index, fake_stage_label: label }),
      () => {}
    );
    onSetContext({ current_stage: "generating", generation_active: true });
    try {
      const res = await regeneratePlan(ctx.thread_id);
      handle.stop();
      onSetContext({
        current_stage: "plan_display",
        generation_active: false,
        plan: res.plan,
        refinement_count: 0,
        interpreted_change: null,
        fake_stage_label: "Done",
      });
    } catch {
      handle.stop();
      onSetContext({ current_stage: "plan_display", generation_active: false });
    }
  }

  return (
    <div className="screen" style={{ minHeight: "unset", paddingBottom: 160 }}>
      {ctx.mode === "demo" && (
        <div className="demo-banner">
          <span className="tag">Demo</span>
          sample Kerala trip — no booking will be made
        </div>
      )}

      <div className="topbar">
        <button className="back" onClick={() => onSetContext({ current_stage: "trip_input" })}>
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
        <div className="brand-mini"><span className="word">trip<i>sathi</i></span></div>
        <div className="icons">
          <button className="iconbtn"><Share2 size={18} strokeWidth={1.75} /></button>
          <button className="iconbtn"><Bookmark size={18} strokeWidth={1.75} /></button>
        </div>
      </div>

      {/* Trip header */}
      <div className="trip-head">
        <h1>your <span className="sw">{plan.days[0]?.location.split(",")[0] ?? "trip"}</span><br />plan, sketched.</h1>
        <div className="meta-pills" style={{ padding: 0, marginTop: 12 }}>
          {ctx.kid_ages.length > 0 && (
            <span className="meta-pill">family · {ctx.kid_ages.length} kid{ctx.kid_ages.length > 1 ? "s" : ""}</span>
          )}
          <span className="meta-pill">{plan.days.length} nights</span>
        </div>
        <div className="sub">↓ read it, change anything, then book.</div>
      </div>

      {/* Interpreted change banner */}
      {ctx.interpreted_change && (
        <div className="interp">
          <div className="ic"><Loader2 size={14} strokeWidth={2.5} /></div>
          <div className="body">
            <span className="lab">
              applying your change <span className="dots"><span /><span /><span /></span>
            </span>
            {ctx.interpreted_change}
          </div>
        </div>
      )}

      {/* Warnings */}
      {plan.warnings.map((w) => (
        <div key={w} className="warning">
          <AlertTriangle size={14} strokeWidth={2.5} />
          <span dangerouslySetInnerHTML={{
            __html: w.replace(/^([^—–:]+[—–:])/, "<b>$1</b>")
          }} />
        </div>
      ))}

      {/* Days */}
      {plan.days.map((day) => (
        <DaySection key={day.day_number} day={day} expanded={expandedDays.has(day.day_number)} onToggle={() => toggleDay(day.day_number)} />
      ))}

      {/* Hotels section */}
      <div className="day-section" style={{ marginTop: 22 }}>
        <div className="label"><span>Accommodation</span><span className="line" /></div>
        {plan.hotels.map((h) => <HotelCard key={h.name} hotel={h} />)}
      </div>

      {/* Budget */}
      <div className="budget">
        <h3>budget <span className="total">~ ₹{plan.budget_breakdown.total.toLocaleString()}</span></h3>
        <div className="budget-bar">
          <div className="seg acc" style={{ flex: plan.budget_breakdown.accommodation }} />
          <div className="seg tra" style={{ flex: plan.budget_breakdown.transport }} />
          <div className="seg foo" style={{ flex: plan.budget_breakdown.food }} />
          <div className="seg act" style={{ flex: plan.budget_breakdown.activities }} />
        </div>
        <div className="budget-rows">
          {([
            ["accommodation", Bed, plan.budget_breakdown.accommodation],
            ["transport", Car, plan.budget_breakdown.transport],
            ["food", Utensils, plan.budget_breakdown.food],
            ["activities", Sparkles, plan.budget_breakdown.activities],
          ] as const).map(([key, Icon, val]) => (
            <div key={key} className="budget-row">
              <span className="lab"><Icon size={13} strokeWidth={2} />{key}</span>
              <span className="val">₹{(val as number).toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="budget-disc">
          <AlertCircle size={12} strokeWidth={2} />
          estimates only — book to see actual prices.
        </div>
      </div>

      {/* Sticky bottom controls */}
      <div className="plan-bottom">
        <div className="inner">
          {ctx.refinement_warning_shown && (
            <div className="refinement-warning">try regenerating for a fresh approach if you're not converging</div>
          )}
          <div className="composer">
            <input
              placeholder="want a change? type it here…"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleRefine()}
              disabled={refining}
            />
            <button className="send" onClick={handleRefine} disabled={!feedback.trim() || refining}>
              <ArrowUp size={14} strokeWidth={2.5} />
            </button>
          </div>
          <div className="row-actions">
            <button className="regenerate-btn" onClick={handleRegenerate} disabled={refining}>
              <Shuffle size={14} strokeWidth={2} />regenerate plan
            </button>
            <button className="approve-btn" onClick={() => onSetContext({ current_stage: "booking" })}>
              <Check size={15} strokeWidth={2.5} />looks good — book it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DaySection({ day, expanded, onToggle }: { day: DayPlan; expanded: boolean; onToggle: () => void }) {
  if (!expanded) {
    return (
      <div className="day-section">
        <div className="day-mini" onClick={onToggle}>
          <span className="num">{String(day.day_number).padStart(2, "0")}</span>
          <div className="meta">
            <div className="ttl">{day.location}</div>
            <div className="preview">{day.activities.map((a) => a.name).join(" · ")}</div>
          </div>
          <span className="chev"><ChevronDown size={16} strokeWidth={2} /></span>
        </div>
      </div>
    );
  }

  return (
    <div className="day-section">
      <div className="label">
        <span>Day {day.day_number}</span>
        <span className="line" />
      </div>
      <div className="day">
        <div className="day-head" onClick={onToggle} style={{ cursor: "pointer" }}>
          <div>
            <div className="day-no">Day {String(day.day_number).padStart(2, "0")}</div>
            <div className="day-ttl">{day.location}</div>
          </div>
          {day.updated_in_refinement && (
            <span className="updated-tag">
              <RefreshCw size={10} strokeWidth={3} />updated
            </span>
          )}
        </div>

        {day.notes && (
          <div className="note">
            <Info size={13} strokeWidth={2} />
            <span>{day.notes}</span>
          </div>
        )}

        <div className="acts">
          {day.activities.map((a) => (
            <div key={a.name} className="act">
              <div className="when"><b>{a.bookable ? "book" : "visit"}</b></div>
              <div>
                <div className="name">{a.name}</div>
                {a.approx_cost != null && (
                  <div className="meta">~₹{a.approx_cost.toLocaleString()} per person</div>
                )}
                <div className="badges">
                  {a.bookable && <span className="badge bookable">bookable</span>}
                  {!a.bookable && <span className="badge">plan to visit</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="meals">
          <span className="meal">🍳 <b>B</b> {day.meals.breakfast}</span>
          <span className="meal">🥘 <b>L</b> {day.meals.lunch}</span>
          <span className="meal">🍛 <b>D</b> {day.meals.dinner}</span>
        </div>
      </div>
    </div>
  );
}

function HotelCard({ hotel }: { hotel: Hotel }) {
  return (
    <div className={`hotel-card ${hotel.content_source === "general" ? "general" : ""}`}>
      <div className={`hotel-photo ${hotel.location.toLowerCase().includes("kovalam") || hotel.location.toLowerCase().includes("alleppey") ? "beach" : ""}`} />
      <div className="hotel-info">
        <div className="hotel-name">{hotel.name}</div>
        <div className="hotel-loc">{hotel.location}</div>
        <div className="hotel-reason">{hotel.reasoning}</div>
        <span className={`hotel-source ${hotel.content_source}`}>
          {hotel.content_source === "rag"
            ? <><BookOpen size={11} strokeWidth={2.5} />sourced from our guide</>
            : <><AlertCircle size={11} strokeWidth={2.5} />general suggestion</>}
        </span>
        {hotel.updated_in_refinement && (
          <span style={{ display: "block", fontSize: 10, color: "var(--accent)", marginTop: 4, fontWeight: 700 }}>
            ↻ Updated in this refinement
          </span>
        )}
      </div>
      <div className="hotel-price-row">
        <span className="hotel-price">~ ₹{hotel.approx_cost_per_night.toLocaleString()}<span className="per">/ night</span></span>
      </div>
      {hotel.content_source === "general" && (
        <div className="hotel-disclaimer">
          <AlertCircle size={12} strokeWidth={2.5} />
          <span>general recommendation — verify on Booking.com before booking. price may vary.</span>
        </div>
      )}
    </div>
  );
}
