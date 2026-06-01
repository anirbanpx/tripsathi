import { useState, useRef } from "react";
import {
  ArrowLeft, Share2, Bookmark, BookmarkCheck, AlertTriangle, Info, RefreshCw, Check,
  Loader2, BookOpen, AlertCircle, Bed, Car, Utensils, Sparkles, ArrowUp, Shuffle,
  GalleryHorizontal, LayoutList, Map,
} from "lucide-react";
import MapView from "./MapView";
import { refinePlan, regeneratePlan } from "../../services/api";
import { startFakeProgress } from "../../lib/fakeProgress";
import { isBookmarked, toggleBookmark } from "../../lib/bookmarks";
import { getDestinationImageUrl } from "../../lib/destinationImage";
import type { UserContext, DayPlan, Hotel } from "../../types";

interface Props {
  ctx: UserContext;
  onSetContext: (patch: Partial<UserContext>) => void;
}

export default function PlanDisplay({ ctx, onSetContext }: Props) {
  const plan = ctx.plan!;
  const [feedback, setFeedback] = useState("");
  const [refining, setRefining] = useState(false);
  const [activeDay, setActiveDay] = useState(0);
  const [dayView, setDayView] = useState<"swipe" | "list" | "map">("swipe");
  const [saveFlash, setSaveFlash] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const saved = (() => {
    try {
      const s = localStorage.getItem("tripsathi_saved_plan");
      return s ? JSON.parse(s).thread_id === ctx.thread_id : false;
    } catch { return false; }
  })();

  function handleSave() {
    try {
      localStorage.setItem("tripsathi_saved_plan", JSON.stringify({
        plan: ctx.plan,
        thread_id: ctx.thread_id,
        kid_ages: ctx.kid_ages,
        savedAt: new Date().toISOString(),
      }));
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 2000);
    } catch { /* storage quota */ }
  }

  async function handleShare() {
    const dest = plan.days[0]?.location.split(",")[0] ?? "trip";
    const text = `My ${dest} plan — ${plan.days.length} nights, ~₹${plan.budget_breakdown.total.toLocaleString()} · planned on tripsathi`;
    if (navigator.share) {
      try { await navigator.share({ title: `tripsathi · ${dest}`, text }); return; } catch { /* user cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      setSaveFlash(true); // reuse flash for "copied" feedback
      setTimeout(() => setSaveFlash(false), 2000);
    } catch { /* clipboard blocked */ }
  }

  function onScroll() {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    const maxScroll = scrollWidth - clientWidth;
    const index = maxScroll > 0
      ? Math.round((scrollLeft / maxScroll) * (plan.days.length - 1))
      : 0;
    setActiveDay(Math.max(0, Math.min(plan.days.length - 1, index)));
  }

  function scrollToDay(i: number) {
    if (!scrollRef.current) return;
    const { scrollWidth, clientWidth } = scrollRef.current;
    const perCard = (scrollWidth - clientWidth) / Math.max(plan.days.length - 1, 1);
    scrollRef.current.scrollTo({ left: i * perCard, behavior: "smooth" });
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
    <div className="screen" style={{ minHeight: "unset", paddingBottom: 200 }}>
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
          <button className="iconbtn" onClick={handleShare} title="Share plan">
            <Share2 size={18} strokeWidth={1.75} />
          </button>
          <button className="iconbtn" onClick={handleSave} title="Save plan" style={{ position: "relative" }}>
            {saved
              ? <BookmarkCheck size={18} strokeWidth={1.75} style={{ color: "var(--accent)" }} />
              : <Bookmark size={18} strokeWidth={1.75} />}
            {saveFlash && (
              <span style={{
                position: "absolute", top: -30, right: 0, whiteSpace: "nowrap",
                background: "var(--ink)", color: "var(--paper)",
                fontSize: 11, fontWeight: 700, padding: "3px 9px",
                borderRadius: 6, fontFamily: "var(--font-body)",
                pointerEvents: "none", letterSpacing: "0.02em",
              }}>
                saved ✦
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="cx">
      {/* Trip header */}
      <div className="trip-head">
        <h1>your <span className="sw">{plan.days[0]?.location.split(",")[0] ?? "trip"}</span><br />plan, sketched.</h1>
        <div className="meta-pills" style={{ padding: 0, marginTop: 12 }}>
          {ctx.kid_ages.length > 0 && (
            <span className="meta-pill">family · {ctx.kid_ages.length} kid{ctx.kid_ages.length > 1 ? "s" : ""}</span>
          )}
          <span className="meta-pill">{plan.days.length} nights</span>
        </div>
        <div className="sub">↓ swipe through days, change anything, then book.</div>
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
      {plan.warnings.length > 0 && <WarningsCarousel warnings={plan.warnings} />}

      {/* Two-column layout on tablet+ */}
      <div className="plan-two-col">

        {/* LEFT — days */}
        <div className="plan-col-left">
          <div style={{ marginTop: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div className="days-swiper-label">
                {dayView === "swipe"
                  ? <>{`Day ${activeDay + 1}`} <span style={{ opacity: 0.45 }}>/ {plan.days.length}</span></>
                  : <>{plan.days.length} <span style={{ opacity: 0.45 }}>days</span></>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {dayView === "swipe" && (
                  <div className="days-dot-row">
                    {plan.days.map((_, i) => (
                      <div key={i} className={`day-dot ${i === activeDay ? "active" : ""}`} onClick={() => scrollToDay(i)} />
                    ))}
                  </div>
                )}
                <div className="view-toggle">
                  <button className={dayView === "swipe" ? "active" : ""} onClick={() => setDayView("swipe")} title="Swipe view">
                    <GalleryHorizontal size={14} strokeWidth={2} />
                  </button>
                  <button className={dayView === "list" ? "active" : ""} onClick={() => setDayView("list")} title="List view">
                    <LayoutList size={14} strokeWidth={2} />
                  </button>
                  <button className={dayView === "map" ? "active" : ""} onClick={() => setDayView("map")} title="Map view">
                    <Map size={14} strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>

            {dayView === "swipe" && (
              <div className="days-swiper" ref={scrollRef} onScroll={onScroll}>
                {plan.days.map((day) => (
                  <SwipeCard key={day.day_number} day={day} />
                ))}
              </div>
            )}
            {dayView === "list" && (
              <div style={{ padding: "4px 0 8px", display: "flex", flexDirection: "column", gap: 12 }}>
                {plan.days.map((day) => (
                  <SwipeCard key={day.day_number} day={day} listMode />
                ))}
              </div>
            )}
            {dayView === "map" && (
              <div style={{ padding: "4px 0 8px" }}>
                <MapView days={plan.days} hotels={plan.hotels} />
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — hotels + budget (sticky on tablet+) */}
        <div className="plan-col-right">
          <div className="day-section" style={{ marginTop: 22 }}>
            <div className="label"><span>Accommodation</span><span className="line" /></div>
            {plan.hotels.map((h) => <HotelCard key={h.name} hotel={h} />)}
          </div>

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
        </div>

      </div>{/* end .plan-two-col */}

      </div>{/* end .cx */}

      {/* Sticky bottom controls */}
      <div className="plan-bottom">
        <div className="inner">
          {ctx.refinement_warning_shown && (
            <div className="refinement-warning">try regenerating for a fresh approach if you're not converging</div>
          )}
          {!feedback && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {["cheaper hotels", "add a beach day", "better for kids", "more local food", "slower pace"].map(s => (
                <span
                  key={s}
                  onClick={() => setFeedback(s)}
                  style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: "var(--radius-pill)",
                    border: "1.5px solid var(--border-strong)", color: "var(--fg-2)",
                    cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 700,
                    background: "var(--surface)", whiteSpace: "nowrap",
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
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
          <button className="approve-btn" style={{ width: "100%", marginTop: 8 }} onClick={() => onSetContext({ current_stage: "booking" })}>
            <Check size={15} strokeWidth={2.5} />looks good — book it
          </button>
          <button className="regenerate-btn" style={{ width: "100%", marginTop: 6 }} onClick={handleRegenerate} disabled={refining}>
            <Shuffle size={14} strokeWidth={2} />regenerate plan
          </button>
        </div>
      </div>
    </div>
  );
}

function WarningsCarousel({ warnings }: { warnings: string[] }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  function onScroll() {
    if (!trackRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = trackRef.current;
    const maxScroll = scrollWidth - clientWidth;
    const idx = maxScroll > 0 ? Math.round((scrollLeft / maxScroll) * (warnings.length - 1)) : 0;
    setActiveIdx(Math.max(0, Math.min(warnings.length - 1, idx)));
  }

  function scrollTo(i: number) {
    if (!trackRef.current) return;
    trackRef.current.scrollTo({ left: i * trackRef.current.clientWidth, behavior: "smooth" });
  }

  return (
    <div style={{ margin: "14px 0 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ochre-deep)" }}>
          <AlertTriangle size={12} strokeWidth={2.5} />
          heads up
        </div>
        {warnings.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {warnings.map((_, i) => (
                <div
                  key={i}
                  onClick={() => scrollTo(i)}
                  style={{
                    height: 5, borderRadius: 999, cursor: "pointer",
                    width: i === activeIdx ? 16 : 5,
                    background: i === activeIdx ? "var(--ochre-deep)" : "rgba(166,112,29,0.28)",
                    transition: "all 250ms var(--ease-out)",
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ochre-deep)", opacity: 0.65 }}>
              {activeIdx + 1}/{warnings.length}
            </span>
          </div>
        )}
      </div>

      <div
        ref={trackRef}
        onScroll={onScroll}
        style={{
          display: "flex",
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch" as never,
          borderRadius: 13,
        } as React.CSSProperties}
      >
        {warnings.map((w, i) => (
          <div
            key={i}
            style={{
              flex: "0 0 100%",
              scrollSnapAlign: "start",
              background: "rgba(216,149,64,0.1)",
              border: "1.5px solid var(--ochre-deep)",
              borderLeft: "4px solid var(--ochre-deep)",
              borderRadius: 13,
              padding: "12px 14px",
              fontFamily: "var(--font-body)",
              fontWeight: 600, fontSize: 13,
              color: "var(--bark)", lineHeight: 1.5,
            }}
            dangerouslySetInnerHTML={{ __html: w.replace(/^([^—–:]+[—–:])/, "<b>$1</b>") }}
          />
        ))}
      </div>
    </div>
  );
}

function SwipeCard({ day, listMode = false }: { day: DayPlan; listMode?: boolean }) {
  const imgUrl = getDestinationImageUrl(day.location);
  return (
    <div className="day-swipe-card" style={listMode ? { flex: "none", width: "100%" } : {}}>
      {imgUrl && (
        <div style={{
          width: "calc(100% + 32px)", margin: "-18px -16px 14px",
          height: 100, borderRadius: "18px 18px 0 0", overflow: "hidden",
        }}>
          <img src={imgUrl} alt={day.location}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
            onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
          />
        </div>
      )}
      <div className="dsc-head">
        <div className="dsc-num">Day {String(day.day_number).padStart(2, "0")}</div>
        <div className="dsc-loc">{day.location}</div>
        {day.updated_in_refinement && (
          <span className="updated-tag" style={{ marginTop: 6 }}>
            <RefreshCw size={10} strokeWidth={3} />updated
          </span>
        )}
      </div>

      {day.notes && (
        <div className="dsc-note">
          <Info size={12} strokeWidth={2} />
          <span>{day.notes}</span>
        </div>
      )}

      <div className="dsc-acts">
        {day.activities.map((a) => (
          <div key={a.name} className="dsc-act">
            <div className="dsc-act-dot" style={{ background: a.bookable ? "var(--moss)" : "var(--paper-3)" }} />
            <div style={{ minWidth: 0 }}>
              <div className="dsc-act-name">{a.name}</div>
              {a.approx_cost != null && (
                <div className="dsc-act-cost">~₹{a.approx_cost.toLocaleString()} / person</div>
              )}
              <div className="act-badges">
                {a.bookable
                  ? <span className="badge bookable">bookable</span>
                  : <span className="badge">plan to visit</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="dsc-meals">
        <div className="dsc-meal"><span className="dsc-meal-icon">🍳</span><b>B</b>{day.meals.breakfast}</div>
        <div className="dsc-meal"><span className="dsc-meal-icon">🥘</span><b>L</b>{day.meals.lunch}</div>
        <div className="dsc-meal"><span className="dsc-meal-icon">🍛</span><b>D</b>{day.meals.dinner}</div>
      </div>
    </div>
  );
}

function HotelCard({ hotel }: { hotel: Hotel }) {
  const photoClass = hotel.location.toLowerCase().includes("kovalam") || hotel.location.toLowerCase().includes("alleppey") ? "beach" : "";
  const imgUrl = getDestinationImageUrl(hotel.location);
  const [bookmarked, setBookmarked] = useState(() => isBookmarked(hotel.name));

  function handleBookmark() {
    const added = toggleBookmark({ name: hotel.name, type: "hotel", location: hotel.location });
    setBookmarked(added);
  }

  return (
    <div className={`hotel-card ${hotel.content_source === "general" ? "general" : ""}`}>
      <div className={`hotel-photo ${photoClass}`} style={{
        position: "relative",
        ...(imgUrl ? { backgroundImage: `url(${imgUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
      }}>
        <button className={`hotel-bm-btn ${bookmarked ? "saved" : ""}`} onClick={handleBookmark} title={bookmarked ? "Remove bookmark" : "Bookmark hotel"}>
          {bookmarked ? <BookmarkCheck size={14} strokeWidth={2} /> : <Bookmark size={14} strokeWidth={2} />}
        </button>
      </div>
      <div className="hotel-content">
        <div className="hotel-top-row">
          <div>
            <div className="hotel-name">{hotel.name}</div>
            <div className="hotel-loc">{hotel.location}</div>
          </div>
          <span className={`hotel-source ${hotel.content_source}`}>
            {hotel.content_source === "rag"
              ? <><BookOpen size={11} strokeWidth={2.5} />guide</>
              : <><AlertCircle size={11} strokeWidth={2.5} />general</>}
          </span>
        </div>
        <div className="hotel-reason">{hotel.reasoning}</div>
        {hotel.updated_in_refinement && (
          <div style={{ fontSize: 10, color: "var(--accent)", marginTop: 6, fontWeight: 700 }}>
            ↻ Updated in this refinement
          </div>
        )}
        <div className="hotel-price-row">
          <span className="hotel-price">
            ~ ₹{hotel.approx_cost_per_night.toLocaleString()}
            <span className="per">/ night</span>
          </span>
          {hotel.content_source === "general" && (
            <div className="hotel-disclaimer">
              <AlertCircle size={12} strokeWidth={2.5} />
              <span>verify on Booking.com — price may vary.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
