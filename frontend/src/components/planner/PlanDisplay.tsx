import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Share2, Bookmark, BookmarkCheck, AlertTriangle, Check,
  Loader2, BookOpen, AlertCircle, Bed, Car, Utensils, Sparkles, ArrowUp, Shuffle,
  GalleryHorizontal, LayoutList, Map, Hotel as HotelIcon,
} from "lucide-react";
import MapView, { haversineDist, driveTime } from "./MapView";
import DayJournalCard, { cleanName } from "./DayJournalCard";
import TripJournal from "./TripJournal";
import GoogleSignInButton from "../auth/GoogleSignInButton";
import { refinePlan, streamRegenerate, saveTrip, toggleHotel, getTasteProfile, googleSignIn } from "../../services/api";
import { isBookmarked, toggleBookmark } from "../../lib/bookmarks";
import { setAuthState } from "../../lib/auth";
import { getDestinationImageUrl } from "../../lib/destinationImage";
import { getCoordinates } from "../../lib/destinationCoordinates";
import type { UserContext, DayPlan, Hotel } from "../../types";

interface Props {
  ctx: UserContext;
  onSetContext: (patch: Partial<UserContext>) => void;
}

export default function PlanDisplay({ ctx, onSetContext }: Props) {
  const navigate = useNavigate();
  const plan = ctx.plan!;
  const [feedback, setFeedback] = useState("");
  const [refining, setRefining] = useState(false);
  const [activeDay, setActiveDay] = useState(0);
  const [dayView, setDayView] = useState<"swipe" | "list" | "map">("swipe");
  const [viewMode, setViewMode] = useState<"plan" | "journal">(() => {
    try { return (localStorage.getItem("ts_plan_view") as "plan" | "journal") ?? "plan"; }
    catch { return "plan"; }
  });
  const [mapDay, setMapDay] = useState(0); // 0 = all stops, 1-N = specific day
  const [saveFlash, setSaveFlash] = useState(false);
  const [tasteToast, setTasteToast] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hotelSaved, setHotelSaved] = useState<Record<string, boolean>>({});
  const [tasteProfile, setTasteProfile] = useState<Record<string, unknown> | null>(null);
  const [loginDismissed, setLoginDismissed] = useState(() => {
    try { return localStorage.getItem("ts_login_dismiss") === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (ctx.mode !== "authenticated" || !ctx.user_id) return;
    getTasteProfile(ctx.user_id).then(setTasteProfile).catch(() => {});
  }, [ctx.mode, ctx.user_id]);

  function deriveTasteChips(profile: Record<string, unknown>): string[] {
    const pace = (profile.pace as number) ?? 3;
    const archetype = pace <= 2 ? "Slow Explorer" : pace >= 4 ? "Active Adventurer" : "Balanced Wanderer";
    const interests = (profile.interests as Record<string, number>) ?? {};
    const top = Object.entries(interests)
      .filter(([, v]) => v >= 0.65)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k]) => k);
    return [archetype, ...top];
  }

  const saved = (() => {
    try {
      const s = localStorage.getItem("tripsathi_saved_plan");
      return s ? JSON.parse(s).thread_id === ctx.thread_id : false;
    } catch { return false; }
  })();

  async function handleSave() {
    if (ctx.mode === "authenticated") {
      try {
        await saveTrip({
          thread_id: ctx.thread_id,
          destination: plan.days[0]?.location.split(",")[0] ?? ctx.destination ?? "Unknown",
          duration_days: plan.days.length,
          plan_json: plan as unknown as object,
        });
        setSaveFlash(true);
        setTimeout(() => setSaveFlash(false), 2000);
      } catch (e) { console.error("saveTrip failed:", e); }
    } else {
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
  }

  async function handleHotelBookmark(hotel: Hotel) {
    const key = hotel.name + hotel.location;
    if (ctx.mode === "authenticated") {
      try {
        const added = await toggleHotel({
          name: hotel.name,
          location: hotel.location,
          approx_cost_per_night: hotel.approx_cost_per_night,
          reasoning: hotel.reasoning,
          content_source: hotel.content_source,
        });
        setHotelSaved((prev) => ({ ...prev, [key]: added }));
      } catch (e) { console.error("toggleHotel failed:", e); }
    } else {
      const next = !isBookmarked(hotel.name);
      toggleBookmark({ name: hotel.name, location: hotel.location, type: "hotel" });
      setHotelSaved((prev) => ({ ...prev, [key]: next }));
    }
  }

  async function handleEarnLogin(credential: string) {
    try {
      const data = await googleSignIn(credential);
      setAuthState(data);
      onSetContext({ mode: "authenticated", user_id: data.user.user_id, auth_user: data.user });
      setLoginDismissed(true);
    } catch (e) { console.error("earn-login sign in failed:", e); }
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
      setTasteToast(true);
      setTimeout(() => setTasteToast(false), 3000);
      setFeedback("");
    } finally {
      setRefining(false);
    }
  }

  async function handleRegenerate() {
    if (!ctx.thread_id) return;
    let stageIndex = 0;
    onSetContext({ current_stage: "generating", generation_active: true, fake_stage_index: 0, fake_stage_label: "Regenerating your itinerary..." });
    try {
      const res = await streamRegenerate(ctx.thread_id, (label) => {
        stageIndex = Math.min(stageIndex + 1, 4);
        onSetContext({ fake_stage_index: stageIndex, fake_stage_label: label });
      });
      onSetContext({
        current_stage: "plan_display",
        generation_active: false,
        plan: res.plan,
        refinement_count: 0,
        interpreted_change: null,
        fake_stage_label: "Done",
      });
    } catch {
      onSetContext({ current_stage: "plan_display", generation_active: false });
    }
  }

  function setView(m: "plan" | "journal") {
    setViewMode(m);
    try { localStorage.setItem("ts_plan_view", m); } catch { /* quota */ }
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
          {ctx.mode === "authenticated" && ctx.auth_user && (
            <button
              type="button"
              onClick={() => navigate("/profile")}
              title="My profile"
              style={{
                width: 36, height: 36, borderRadius: "50%", border: "1.5px solid var(--border)",
                padding: 0, cursor: "pointer", overflow: "hidden", background: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {ctx.auth_user.avatar_url ? (
                <img src={ctx.auth_user.avatar_url} alt={ctx.auth_user.name}
                  style={{ width: 36, height: 36, objectFit: "cover" }} />
              ) : (
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", background: "var(--accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                }}>
                  {ctx.auth_user.name.charAt(0).toUpperCase()}
                </div>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="cx">
      {/* Trip header — hidden in journal mode to free vertical space for nav */}
      {viewMode !== "journal" && (
      <div className="trip-head">
        <h1>your <span className="sw">{plan.days[0]?.location.split(",")[0] ?? "trip"}</span><br />plan, sketched.</h1>
        <div className="meta-pills" style={{ padding: 0, marginTop: 12 }}>
          {ctx.kid_ages.length > 0 && (
            <span className="meta-pill">family · {ctx.kid_ages.length} kid{ctx.kid_ages.length > 1 ? "s" : ""}</span>
          )}
          <span className="meta-pill">{plan.days.length} nights</span>
        </div>
        {tasteProfile && (() => {
          const chips = deriveTasteChips(tasteProfile);
          return chips.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
              {chips.map((c, i) => (
                <span key={c} style={{
                  fontSize: 10, padding: "3px 10px",
                  borderRadius: "var(--radius-pill)",
                  background: i === 0 ? "var(--ochre)" : "transparent",
                  color: i === 0 ? "var(--paper)" : "var(--fg-2)",
                  border: i === 0 ? "1.5px solid var(--ochre)" : "1.5px solid var(--border)",
                  fontFamily: "var(--font-body)", fontWeight: 700,
                  textTransform: "capitalize" as const,
                  letterSpacing: "0.04em",
                }}>
                  {c}
                </span>
              ))}
            </div>
          ) : null;
        })()}
        <div className="sub">↓ swipe through days, change anything, then book.</div>
      </div>
      )}

      {/* Plan ⇄ Journal toggle */}
      <div className="view-mode-toggle">
        <button className={viewMode === "plan" ? "active" : ""} onClick={() => setView("plan")}>✎ plan</button>
        <button className={viewMode === "journal" ? "active" : ""} onClick={() => setView("journal")}>journal</button>
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

      {viewMode === "journal" ? (
        <TripJournal plan={plan} />
      ) : (<>

      {/* Tailored for you */}
      {plan.personalization_notes && plan.personalization_notes.length > 0 && (
        <div style={{
          background: "linear-gradient(135deg, rgba(216,149,64,0.14), rgba(79,107,74,0.08))",
          border: "1.5px solid var(--ochre-deep)",
          borderRadius: 12,
          padding: "14px 16px",
          marginBottom: 16,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: "0.08em",
            color: "var(--ochre-deep)", marginBottom: 8,
            fontFamily: "var(--font-body)",
            textTransform: "uppercase",
          }}>
            ✦ tailored for you
          </div>
          <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
            {plan.personalization_notes.map((note, i) => (
              <li key={i} style={{
                fontSize: 13, color: "var(--fg-2)",
                fontFamily: "var(--font-body)", lineHeight: 1.5,
                marginBottom: i < plan.personalization_notes!.length - 1 ? 4 : 0,
              }}>
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {plan.warnings.length > 0 && <WarningsCarousel warnings={plan.warnings.slice(0, 5)} />}

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
                  <DayJournalCard key={day.day_number} day={day} />
                ))}
              </div>
            )}
            {dayView === "list" && (
              <div style={{ padding: "4px 0 8px", display: "flex", flexDirection: "column", gap: 12 }}>
                {plan.days.map((day) => (
                  <DayJournalCard key={day.day_number} day={day} listMode />
                ))}
              </div>
            )}
            {dayView === "map" && (
              <div style={{ padding: "4px 0 8px" }}>
                {/* Day selector tabs */}
                <div style={{
                  display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none",
                  paddingBottom: 10, alignItems: "center",
                }}>
                  {[{ n: 0, label: "all stops" }, ...plan.days.map(d => ({ n: d.day_number, label: `D${d.day_number} · ${d.location.split(",")[0]}` }))].map(({ n, label }) => (
                    <button
                      key={n}
                      onClick={() => setMapDay(n)}
                      style={{
                        padding: "5px 11px", borderRadius: 20, flexShrink: 0,
                        border: `1.5px solid ${mapDay === n ? "var(--accent)" : "var(--border-strong)"}`,
                        background: mapDay === n ? "var(--accent)" : "var(--surface)",
                        color: mapDay === n ? "var(--paper)" : "var(--fg-2)",
                        fontFamily: "var(--font-body)", fontWeight: 800, fontSize: 11,
                        cursor: "pointer", whiteSpace: "nowrap",
                        boxShadow: mapDay === n ? "0 2px 8px rgba(176,73,47,0.28)" : "none",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Split panel: map left + day card right */}
                <div className="map-split">
                  <MapView days={plan.days} hotels={plan.hotels} selectedDay={mapDay} />
                  <MapDayPanel
                    days={plan.days}
                    hotels={plan.hotels}
                    selectedDay={mapDay}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — hotels + budget (sticky on tablet+) */}
        <div className="plan-col-right">
          <div className="day-section" style={{ marginTop: 22 }}>
            <div className="label">
              <span>
                {plan.hotels.length} stay{plan.hotels.length !== 1 ? "s" : ""}
                {ctx.mode === "authenticated" ? " · matched for you" : ""}
              </span>
              <span className="line" />
            </div>
            <div className="hotel-shelf-wrap">
            <div style={{
              display: "flex", gap: 12, overflowX: "auto",
              paddingBottom: 4,
              scrollbarWidth: "none",
            } as React.CSSProperties}>
              {plan.hotels.map((h) => {
                const key = h.name + h.location;
                const bookmarked = hotelSaved[key] ?? isBookmarked(h.name);
                return (
                  <div key={h.name} style={{ position: "relative", flex: "0 0 260px" }}>
                    <HotelCard hotel={h} />
                    <button
                      onClick={() => handleHotelBookmark(h)}
                      title={bookmarked ? "Unsave hotel" : "Save hotel"}
                      style={{
                        position: "absolute", top: 10, right: 10,
                        background: "none", border: "none", cursor: "pointer",
                        color: bookmarked ? "var(--accent)" : "var(--fg-3)",
                        padding: 4, lineHeight: 0,
                      }}
                    >
                      {bookmarked
                        ? <BookmarkCheck size={16} strokeWidth={1.75} />
                        : <Bookmark size={16} strokeWidth={1.75} />}
                    </button>
                  </div>
                );
              })}
            </div>
            </div>{/* end .hotel-shelf-wrap */}
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

      {/* Earn-the-login card — after value is seen, before sticky bar */}
      {ctx.mode === "demo" && !loginDismissed && (
        <div style={{
          background: "linear-gradient(135deg, rgba(216,149,64,0.08), rgba(79,107,74,0.05))",
          border: "1.5px dashed var(--ochre-deep)",
          borderRadius: 12, padding: "14px 16px", marginTop: 24, marginBottom: 8,
          display: "flex", gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: "var(--font-script)", fontSize: 19, color: "var(--bark)", marginBottom: 4,
            }}>
              loved this plan? ✦
            </div>
            <div style={{
              fontSize: 12, color: "var(--fg-2)", lineHeight: 1.55,
              fontFamily: "var(--font-body)", marginBottom: 10,
            }}>
              sign in to save your journal, sync across devices, and get plans tuned to your taste.
            </div>
            <GoogleSignInButton onToken={handleEarnLogin} />
          </div>
          <button
            onClick={() => {
              setLoginDismissed(true);
              try { localStorage.setItem("ts_login_dismiss", "1"); } catch { /* quota */ }
            }}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--fg-3)", padding: 2, fontSize: 14,
              alignSelf: "flex-start", lineHeight: 1,
            }}
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      </>)}

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
      {tasteToast && (
        <div style={{
          position: "fixed", bottom: 88, right: 20, zIndex: 999,
          background: "var(--ink)", color: "var(--paper)",
          fontSize: 12, fontWeight: 700, fontFamily: "var(--font-body)",
          padding: "8px 14px", borderRadius: 20,
          border: "1.5px solid rgba(255,195,100,0.4)",
          letterSpacing: "0.04em", pointerEvents: "none",
          animation: "slideUp 0.3s ease",
        }}>
          ✦ your preferences have been noted
        </div>
      )}
    </div>
  );
}

function WarningsCarousel({ warnings }: { warnings: string[] }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);
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
          >
            <div
              style={!expanded ? {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 3,
                overflow: "hidden",
              } as React.CSSProperties : {}}
              dangerouslySetInnerHTML={{ __html: w.replace(/^([^—–:]+[—–:])/, "<b>$1</b>") }}
            />
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                marginTop: 6, background: "none", border: "none", padding: 0,
                fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 11,
                color: "var(--ochre-deep)", cursor: "pointer", letterSpacing: "0.04em",
              }}
            >
              {expanded ? "show less ↑" : "read more ↓"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function HotelCard({ hotel }: { hotel: Hotel }) {
  const imgUrl = getDestinationImageUrl(hotel.location);
  const [bookmarked, setBookmarked] = useState(() => isBookmarked(hotel.name));

  function handleBookmark() {
    const added = toggleBookmark({ name: hotel.name, type: "hotel", location: hotel.location });
    setBookmarked(added);
  }

  return (
    <div style={{
      borderRadius: 16, overflow: "hidden",
      border: "1.5px solid rgba(62,47,35,0.14)",
      boxShadow: "0 2px 0 rgba(62,47,35,.07), 0 8px 20px -10px rgba(62,47,35,.2)",
      background: "var(--surface)",
      marginBottom: 14,
    }}>
      {/* Photo — kraft paper frame */}
      <div style={{ position: "relative", margin: "10px 10px 0" }}>
        <div style={{
          height: 130, borderRadius: 10, overflow: "hidden",
          border: "3px solid var(--paper)",
          outline: "1px solid rgba(62,47,35,0.12)",
          boxShadow: "0 3px 14px rgba(62,47,35,0.18)",
          background: "var(--paper-3)",
          backgroundImage: imgUrl ? `url(${imgUrl})` : undefined,
          backgroundSize: "cover", backgroundPosition: "center",
        }}>
          {!imgUrl && (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--bark-3)" }}><HotelIcon size={30} strokeWidth={1.5} /></div>
          )}
        </div>
        {/* Tape tab on photo */}
        <div style={{
          position: "absolute", top: -5, left: "50%", transform: "translateX(-50%)",
          width: 36, height: 11, background: "var(--tape)", borderRadius: 2, zIndex: 2,
        }} />
        {/* Bookmark button */}
        <button
          onClick={handleBookmark}
          title={bookmarked ? "Remove bookmark" : "Bookmark hotel"}
          style={{
            position: "absolute", top: 8, right: 8,
            width: 30, height: 30, borderRadius: "50%",
            background: "rgba(244,236,219,0.9)", border: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", boxShadow: "0 1px 6px rgba(62,47,35,0.2)",
            color: bookmarked ? "var(--rust)" : "var(--bark-3)",
          }}
        >
          {bookmarked ? <BookmarkCheck size={14} strokeWidth={2} /> : <Bookmark size={14} strokeWidth={2} />}
        </button>
        {/* Source postmark stamp */}
        <div style={{
          position: "absolute", bottom: 8, right: 8,
          padding: "3px 8px", borderRadius: 20,
          border: `1.5px solid ${hotel.content_source === "rag" ? "var(--moss)" : "var(--bark-3)"}`,
          background: "rgba(244,236,219,0.92)",
          display: "flex", alignItems: "center", gap: 4,
          fontFamily: "var(--font-body)", fontWeight: 800, fontSize: 9,
          letterSpacing: "0.12em", textTransform: "uppercase",
          color: hotel.content_source === "rag" ? "var(--moss)" : "var(--bark-3)",
        }}>
          {hotel.content_source === "rag"
            ? <><BookOpen size={9} strokeWidth={2.5} />verified</>
            : <><AlertCircle size={9} strokeWidth={2.5} />general</>}
        </div>
      </div>

      {/* Content — journal entry */}
      <div style={{
        padding: "12px 14px 14px",
        backgroundImage: "repeating-linear-gradient(transparent,transparent 23px,rgba(62,47,35,0.06) 23px,rgba(62,47,35,0.06) 24px)",
        backgroundPositionY: "28px",
      }}>
        {/* Hotel name in script */}
        <div style={{ fontFamily: "var(--font-script)", fontSize: 22, color: "var(--bark)", lineHeight: 1.2, fontWeight: 700 }}>
          {hotel.name}
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--bark-3)", fontWeight: 600, marginBottom: 8 }}>
          {hotel.location}
        </div>

        {/* Reasoning in italic script */}
        <div style={{ fontFamily: "var(--font-script)", fontSize: 14, color: "var(--bark-2)", lineHeight: 1.55, marginBottom: 10, borderLeft: "3px solid var(--tape)", paddingLeft: 8 }}>
          {hotel.reasoning}
        </div>

        {hotel.updated_in_refinement && (
          <div style={{ fontSize: 10, color: "var(--rust)", marginBottom: 8, fontWeight: 700, fontFamily: "var(--font-body)" }}>
            ↻ updated in this refinement
          </div>
        )}

        {/* Price stamp */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
          <div style={{
            display: "inline-flex", alignItems: "baseline", gap: 3,
            padding: "4px 12px", borderRadius: 6,
            border: "2px solid var(--rust)",
            background: "rgba(176,73,47,0.06)",
          }}>
            <span style={{ fontFamily: "var(--font-script)", fontSize: 20, fontWeight: 700, color: "var(--rust)" }}>
              ₹{hotel.approx_cost_per_night.toLocaleString()}
            </span>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700, color: "var(--rust)", opacity: 0.7 }}>
              / night
            </span>
          </div>
          {hotel.content_source === "general" && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--bark-3)", fontFamily: "var(--font-body)", fontWeight: 600 }}>
              <AlertCircle size={11} strokeWidth={2} />
              verify on Booking.com
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Map split panel — right-side day detail card ──────────────────────────────

function MapDayPanel({ days, hotels, selectedDay }: { days: DayPlan[]; hotels: Hotel[]; selectedDay: number }) {
  const day = selectedDay > 0 ? days.find(d => d.day_number === selectedDay) ?? null : null;

  // Summary view (all stops)
  if (!day) {
    return (
      <div className="map-day-panel">
        <div className="map-day-panel-header">
          <div style={{ fontFamily: "var(--font-script)", fontSize: 22, fontWeight: 700, color: "var(--accent)", lineHeight: 1 }}>
            full journey ✦
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--fg-3)", fontWeight: 600, marginTop: 4 }}>
            {days.length} days · click a day tab to explore
          </div>
        </div>
        <div className="map-day-body">
          <div className="map-section-label">stops</div>
          <div className="map-summary">
            <div className="stop-list">
              {/* Deduplicate stops by location for summary */}
              {((): { loc: string; dayNums: number[] }[] => {
                const seen: { loc: string; dayNums: number[] }[] = [];
                for (const d of days) {
                  const base = d.location.split(",")[0];
                  const existing = seen.find(s => s.loc === base);
                  if (existing) existing.dayNums.push(d.day_number);
                  else seen.push({ loc: base, dayNums: [d.day_number] });
                }
                return seen;
              })().map(({ loc, dayNums }, i) => (
                <div key={loc} className="map-stop-row">
                  <div className="stop-num">{i + 1}</div>
                  <div className="stop-info">
                    <div className="stop-name">{loc}</div>
                    <div className="stop-days">
                      {dayNums.map(n => `Day ${n}`).join(" · ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="map-section-label" style={{ marginTop: 18 }}>accommodation</div>
          {hotels.map(h => (
            <div key={h.name} className="map-hotel-row" style={{ marginBottom: 8 }}>
              <div style={{ color: "var(--bark-2)", lineHeight: 0 }}><Bed size={16} strokeWidth={2} /></div>
              <div className="hname">{h.name}<br /><span style={{ fontWeight: 600, color: "var(--fg-3)", fontSize: 10 }}>{h.location}</span></div>
              <div className="hcost">₹{h.approx_cost_per_night.toLocaleString()}<span style={{ opacity: 0.5 }}>/n</span></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Specific day view
  const prevDay = days.find(d => d.day_number === selectedDay - 1) ?? null;
  const prevCoords = prevDay ? getCoordinates(prevDay.location) : null;
  const currCoords = getCoordinates(day.location);
  const legKm = prevCoords && currCoords
    ? haversineDist(prevCoords, currCoords)
    : null;
  const isSameLocation = legKm !== null && legKm < 5;

  const nightHotel = hotels.find(h => {
    const hLoc = h.location.split(",")[0].toLowerCase();
    const dLoc = day.location.split(",")[0].toLowerCase();
    return hLoc.includes(dLoc.split(" ")[0]) || dLoc.includes(hLoc.split(" ")[0]);
  }) ?? null;

  return (
    <div className="map-day-panel" key={selectedDay}>
      <div className="map-day-panel-header">
        <div className="day-num">{selectedDay}</div>
        <div className="day-loc">{day.location.split(",")[0]}</div>
        {day.updated_in_refinement && (
          <div style={{ marginTop: 4, fontSize: 10, color: "var(--rust)", fontFamily: "var(--font-body)", fontWeight: 700 }}>
            ↻ updated
          </div>
        )}
      </div>

      {/* Leg stat — drive from previous */}
      {prevDay && legKm !== null && !isSameLocation && (
        <div className="map-leg-stat">
          <span className="leg-pill">from {prevDay.location.split(",")[0]}</span>
          <span>{driveTime(legKm)} · {Math.round(legKm)} km</span>
        </div>
      )}
      {prevDay && isSameLocation && (
        <div className="map-leg-stat">
          <span className="leg-pill">same base</span>
          <span>no travel · explore more today</span>
        </div>
      )}
      {!prevDay && (
        <div className="map-leg-stat">
          <span className="leg-pill">Day 1</span>
          <span>arrival day</span>
        </div>
      )}

      <div className="map-day-body">
        <div className="map-section-label">activities</div>
        {day.activities.map((a, i) => (
          <div key={i} className="map-act-row">
            <div className="dot" />
            <div className="name">{cleanName(a.name)}</div>
            {a.approx_cost != null && (
              <div className="cost">~₹{a.approx_cost.toLocaleString()}</div>
            )}
          </div>
        ))}

        {nightHotel && (
          <>
            <div className="map-section-label">tonight's stay</div>
            <div className="map-hotel-row">
              <div style={{ color: "var(--bark-2)", lineHeight: 0 }}><Bed size={16} strokeWidth={2} /></div>
              <div className="hname">{nightHotel.name}</div>
              <div className="hcost">₹{nightHotel.approx_cost_per_night.toLocaleString()}<span style={{ opacity: 0.5 }}>/n</span></div>
            </div>
          </>
        )}

        <div className="map-section-label">meals</div>
        {([
          { label: "B", meal: day.meals.breakfast },
          { label: "L", meal: day.meals.lunch },
          { label: "D", meal: day.meals.dinner },
        ]).map(({ label, meal }) => (
          <div key={label} className="map-meal-row">
            <span className="mlabel">{label}</span>
            <span>{meal}</span>
          </div>
        ))}

        {day.notes && (
          <div style={{
            marginTop: 14,
            padding: "8px 10px",
            background: "rgba(216,149,64,0.08)",
            borderLeft: "3px solid var(--ochre)",
            borderRadius: "0 8px 8px 0",
            fontFamily: "var(--font-script)",
            fontSize: 13, color: "var(--bark)", lineHeight: 1.5,
          }}>
            {day.notes}
          </div>
        )}
      </div>
    </div>
  );
}
