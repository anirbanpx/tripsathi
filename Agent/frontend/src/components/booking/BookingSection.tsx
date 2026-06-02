import { useState } from "react";
import { Check, MapPin, Zap, AlertCircle, AlertTriangle, Download, Share2, Info, ArrowLeft, BadgeCheck, Bookmark, BookmarkCheck } from "lucide-react";
import { bookItem } from "../../services/api";
import { isBookmarked, toggleBookmark } from "../../lib/bookmarks";
import { getDestinationImageUrl } from "../../lib/destinationImage";
import type { UserContext, BookingResponse } from "../../types";

interface Props {
  ctx: UserContext;
  onSetContext: (patch: Partial<UserContext>) => void;
}

interface BookableItem {
  name: string;
  location: string;
  type: "hotel" | "activity";
  approx_cost: number;
  isGeneral?: boolean;
  isHouseboat?: boolean;
  photoClass?: string;
}

export default function BookingSection({ ctx, onSetContext }: Props) {
  const plan = ctx.plan!;
  const isDemo = ctx.mode === "demo";
  const userId = ctx.user_id ?? "usr_demo_001";

  const bookableHotels: BookableItem[] = plan.hotels
    .filter((h) => h.bookable)
    .map((h) => ({
      name: h.name,
      location: h.location,
      type: "hotel",
      approx_cost: h.approx_cost_per_night,
      isGeneral: h.content_source === "general",
      photoClass: h.location.toLowerCase().includes("alleppey") || h.location.toLowerCase().includes("kovalam") ? "beach" : "",
    }));

  const bookableActivities: BookableItem[] = plan.days.flatMap((d) =>
    d.activities
      .filter((a) => a.bookable && a.approx_cost != null)
      .map((a) => ({
        name: a.name,
        location: d.location,
        type: "activity" as const,
        approx_cost: a.approx_cost!,
        isHouseboat: a.name.toLowerCase().includes("houseboat"),
        photoClass: a.name.toLowerCase().includes("houseboat") ? "water" : "nature",
      }))
  );

  const planToVisit = plan.days.flatMap((d) =>
    d.activities
      .filter((a) => !a.bookable)
      .map((a) => ({ name: a.name, location: d.location, dayNum: d.day_number }))
  );

  const [bookedItems, setBookedItems] = useState<Record<string, BookingResponse>>({});
  const [skippedItems, setSkippedItems] = useState<Set<string>>(new Set());
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
  const [shareFlash, setShareFlash] = useState(false);

  function handlePrint() {
    window.print();
  }

  async function handleShare() {
    const dest = plan.days[0]?.location.split(",")[0] ?? "trip";
    const lines = [
      `🗺 ${dest} trip · ${plan.days.length} nights`,
      `💰 ~₹${plan.budget_breakdown.total.toLocaleString()} total`,
      ...Object.entries(bookedItems).map(([name, b]) => `✓ ${name} — ${b.confirmation_id}`),
      `\nplanned on tripsathi`,
    ];
    const text = lines.join("\n");
    if (navigator.share) {
      try { await navigator.share({ title: `tripsathi · ${dest}`, text }); return; } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareFlash(true);
      setTimeout(() => setShareFlash(false), 2000);
    } catch { /* blocked */ }
  }

  const totalBookable = bookableHotels.length + bookableActivities.length;
  const bookedCount = Object.keys(bookedItems).length;
  const bookedTotal = Object.values(bookedItems).reduce((s, b) => s + b.amount_charged, 0);
  const allDone = bookedCount + skippedItems.size === totalBookable;

  async function handleBook(item: BookableItem) {
    setLoadingItems((s) => new Set(s).add(item.name));
    try {
      const res = await bookItem(userId, { name: item.name, location: item.location, type: item.type });
      setBookedItems((prev) => ({ ...prev, [item.name]: res }));
    } finally {
      setLoadingItems((s) => { const n = new Set(s); n.delete(item.name); return n; });
    }
  }

  function handleSkip(name: string) {
    setSkippedItems((s) => new Set(s).add(name));
  }

  function handleUndo(name: string) {
    setSkippedItems((s) => { const n = new Set(s); n.delete(name); return n; });
  }

  return (
    <div className="screen" style={{ minHeight: "unset" }}>
      {isDemo && (
        <div className="demo-banner">
          <span className="tag">Demo</span>
          no real bookings will be made — pinky promise
        </div>
      )}

      <div className="topbar">
        <button className="back" onClick={() => onSetContext({ current_stage: "plan_display" })}>
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
        <div className="brand-mini"><span className="word">trip<i>sathi</i></span></div>
        <div style={{ width: 36 }} />
      </div>

      <div className="cx">
      <div className="approved-banner">
        <div className="ic"><Check size={14} strokeWidth={3} /></div>
        <div className="body">
          plan finalised ✦ ready to book
          <small>{plan.days.length} nights · ~₹{plan.budget_breakdown.total.toLocaleString()} estimated</small>
        </div>
      </div>

      <div className="page-head">
        <h1>let's <span className="sw">book</span><br />your trip.</h1>
        <p className="sub">
          {isDemo
            ? `tap "book demo" on each pass. nothing real gets charged.`
            : `tap "book" on each pass to confirm. prices are estimates.`}
        </p>
      </div>

      {/* Progress summary */}
      <div className="booking-summary">
        <div className="row total">
          <span className="lab">booked so far</span>
          <span className="val">₹{bookedTotal.toLocaleString()}</span>
        </div>
        <div className="row">
          <span className="lab">remaining</span>
          <span className="val">₹{(plan.budget_breakdown.total - bookedTotal).toLocaleString()}</span>
        </div>
        <div className="progress-row">
          <div className="progress-lab">
            <span>{bookedCount} of {totalBookable} booked</span>
            <span>{totalBookable > 0 ? Math.round((bookedCount / totalBookable) * 100) : 0}%</span>
          </div>
          <div className="progress-bar">
            <span className="fill" style={{ width: `${totalBookable > 0 ? (bookedCount / totalBookable) * 100 : 0}%` }} />
          </div>
        </div>
      </div>

      {/* Hotels */}
      {bookableHotels.length > 0 && (
        <div className="bs-section">
          <div className="label">
            <span>Hotels · {bookableHotels.length}</span>
            <span className="line" />
            <span>{bookableHotels.filter((h) => bookedItems[h.name]).length} booked</span>
          </div>
          {bookableHotels.map((item) => (
            <BoardingPass
              key={item.name}
              item={item}
              isDemo={isDemo}
              booking={bookedItems[item.name]}
              loading={loadingItems.has(item.name)}
              skipped={skippedItems.has(item.name)}
              onBook={() => handleBook(item)}
              onSkip={() => handleSkip(item.name)}
              onUndo={() => handleUndo(item.name)}
            />
          ))}
        </div>
      )}

      {/* Activities */}
      {bookableActivities.length > 0 && (
        <div className="bs-section">
          <div className="label">
            <span>Activities · {bookableActivities.length} bookable</span>
            <span className="line" />
            <span>{bookableActivities.filter((a) => bookedItems[a.name]).length} booked</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {bookableActivities.map((item) => (
              <ActivityRow
                key={item.name}
                item={item}
                isDemo={isDemo}
                booking={bookedItems[item.name]}
                loading={loadingItems.has(item.name)}
                skipped={skippedItems.has(item.name)}
                onBook={() => handleBook(item)}
                onSkip={() => handleSkip(item.name)}
                onUndo={() => handleUndo(item.name)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Plan to visit */}
      {planToVisit.length > 0 && (
        <div className="bs-section" style={{ opacity: 0.75 }}>
          <div className="label">
            <span>Plan to visit · {planToVisit.length}</span>
            <span className="line" />
            <span style={{ fontStyle: "italic" }}>just show up · no booking</span>
          </div>
          <div className="visit-list" style={{ background: "var(--paper-2)", borderColor: "var(--border)" }}>
            {planToVisit.map((a) => (
              <div key={a.name} className="visit-row">
                <span className="num">D{a.dayNum}</span>
                <div>
                  <div className="vname">{a.name}</div>
                  <div className="vmeta">{a.location} · just show up</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All done */}
      {allDone && (
        <div className="done-card-v2">
          <div className="done-stamp-wrap">
            <div className="done-stamp">
              <BadgeCheck size={30} strokeWidth={2} />
              <span className="done-stamp-label">booked</span>
            </div>
          </div>
          <h2>your trip is <span className="sw">stamped</span>. ✦</h2>
          <p className="lede">
            {isDemo
              ? "this was a demo — nothing was charged. your plan is ready to take to real booking."
              : "your bookings are confirmed. check your email for confirmations."}
          </p>

          {Object.keys(bookedItems).length > 0 && (
            <div className="done-items">
              {Object.entries(bookedItems).map(([name, booking]) => (
                <div key={name} className="done-item-row">
                  <Check size={12} />
                  <span className="done-item-name">{name}</span>
                  <span className="done-item-ref">{booking.confirmation_id}</span>
                </div>
              ))}
            </div>
          )}

          <div className="done-total">
            total charged <span>₹{bookedTotal.toLocaleString()}</span>
          </div>

          <div className="done-actions" style={{ marginTop: 20 }}>
            <button className="done-btn" onClick={handlePrint}>
              <Download size={14} strokeWidth={2.5} />save as PDF
            </button>
            <button className="done-btn outline" onClick={handleShare} style={{ position: "relative" }}>
              <Share2 size={14} strokeWidth={2.5} />share
              {shareFlash && (
                <span style={{
                  position: "absolute", top: -30, left: "50%", transform: "translateX(-50%)",
                  whiteSpace: "nowrap", background: "var(--paper)", color: "var(--ink)",
                  fontSize: 11, fontWeight: 700, padding: "3px 9px",
                  borderRadius: 6, fontFamily: "var(--font-body)",
                  pointerEvents: "none",
                }}>
                  copied ✦
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {isDemo && (
        <div className="footer-disc">
          <Info size={14} strokeWidth={2.5} />
          <span><b>Demo mode —</b> all bookings are mocked. confirmation IDs are made up. nothing was charged.</span>
        </div>
      )}

      <div style={{ height: 40 }} />
      </div>{/* end .cx */}
    </div>
  );
}

interface BoardingPassProps {
  item: BookableItem;
  isDemo: boolean;
  booking?: BookingResponse;
  loading: boolean;
  skipped: boolean;
  onBook: () => void;
  onSkip: () => void;
  onUndo: () => void;
}

function BoardingPass({ item, isDemo, booking, loading, skipped, onBook, onSkip, onUndo }: BoardingPassProps) {
  const typeLabel = item.type === "hotel" ? "HOTEL" : "ACTIVITY";
  const unitLabel = item.type === "hotel" ? "night" : "person";
  const [bookmarked, setBookmarked] = useState(() => isBookmarked(item.name));
  const imgUrl = getDestinationImageUrl(item.location);

  function handleBookmark(e: React.MouseEvent) {
    e.stopPropagation();
    const added = toggleBookmark({ name: item.name, type: item.type, location: item.location });
    setBookmarked(added);
  }

  if (skipped) {
    return (
      <div className="bp-card skipped">
        <div className="bp-top">
          <div className="bp-eyebrow">
            <span>{typeLabel} · SKIPPED</span>
          </div>
          <div className="bp-main">
            <div className={`item-photo ${item.photoClass ?? ""}`} />
            <div>
              <div className="bp-name" style={{ textDecoration: "line-through", opacity: 0.6 }}>{item.name}</div>
              <div className="bp-loc"><MapPin size={11} strokeWidth={2} />{item.location}</div>
            </div>
          </div>
        </div>
        <div className="bp-tear" />
        <div className="bp-stub">
          <button className="skip-btn" style={{ width: "100%", textAlign: "center" }} onClick={onUndo}>
            undo skip
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bp-card ${booking ? "confirmed" : ""}`}>
      <div className="bp-top">
        <div className="bp-eyebrow">
          <span>{typeLabel} · {item.location.toUpperCase()}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button className={`bp-bm-btn ${bookmarked ? "saved" : ""}`} onClick={handleBookmark} title={bookmarked ? "Remove bookmark" : "Bookmark"}>
              {bookmarked ? <BookmarkCheck size={13} strokeWidth={2} /> : <Bookmark size={13} strokeWidth={2} />}
            </button>
            <span className={`bp-type-tag ${booking ? "confirmed-tag" : ""}`}>
              {booking ? "BOOKED" : item.type === "hotel" ? "STAY" : "EXPERIENCE"}
            </span>
          </div>
        </div>

        <div className="bp-main">
          <div className={`item-photo ${item.photoClass ?? ""}`} style={imgUrl ? { backgroundImage: `url(${imgUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : {}} />
          <div>
            <div className="bp-name">{item.name}</div>
            <div className="bp-loc"><MapPin size={11} strokeWidth={2} />{item.location}</div>
            {!booking && (
              <div className="bp-price">
                ~ ₹{item.approx_cost.toLocaleString()}
                <span className="per">/ {unitLabel}</span>
              </div>
            )}
          </div>
        </div>

        {item.isGeneral && !booking && (
          <div className="item-disc" style={{ marginTop: 10 }}>
            <AlertCircle size={12} strokeWidth={2.5} />
            <span>general recommendation — verify on Booking.com before confirming.</span>
          </div>
        )}
        {item.isHouseboat && !booking && (
          <div className="item-disc" style={{ marginTop: 10 }}>
            <AlertTriangle size={12} strokeWidth={2.5} />
            <span>book through your hotel operator — never direct cold-approach.</span>
          </div>
        )}
      </div>

      <div className="bp-tear" />

      <div className="bp-stub">
        {booking ? (
          <div className="bp-confirm">
            <div className="bp-confirm-ic"><Check size={13} strokeWidth={3} /></div>
            <div className="bp-confirm-info">
              <div className="bp-confirm-ref">{booking.confirmation_id}</div>
              <div className="bp-confirm-via">via {booking.provider}</div>
            </div>
            <div className="bp-confirm-stamp">{isDemo ? "DEMO" : "CONFIRMED"}</div>
          </div>
        ) : (
          <div className="item-actions">
            <button className="book-btn" onClick={onBook} disabled={loading}>
              {loading ? <span className="btn-spinner" /> : <Zap size={14} strokeWidth={2.5} />}
              {loading ? "booking…" : isDemo ? "book demo" : "book"}
            </button>
            <button className="skip-btn" onClick={onSkip}>skip</button>
          </div>
        )}
      </div>
    </div>
  );
}

interface ActivityRowProps {
  item: BookableItem;
  isDemo: boolean;
  booking?: BookingResponse;
  loading: boolean;
  skipped: boolean;
  onBook: () => void;
  onSkip: () => void;
  onUndo: () => void;
}

function ActivityRow({ item, isDemo, booking, loading, skipped, onBook, onSkip, onUndo }: ActivityRowProps) {
  if (skipped) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", borderRadius: 12,
        background: "var(--surface)", border: "1.5px dashed var(--border)",
        opacity: 0.45,
      }}>
        <Zap size={13} strokeWidth={2} style={{ color: "var(--fg-3)", flexShrink: 0 }} />
        <span style={{ flex: 1, fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 13, color: "var(--fg)", textDecoration: "line-through" }}>{item.name}</span>
        <button className="skip-btn" style={{ padding: "5px 10px", fontSize: 11 }} onClick={onUndo}>undo</button>
      </div>
    );
  }

  if (booking) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", borderRadius: 12,
        background: "var(--moss)", color: "var(--paper)",
      }}>
        <Check size={13} strokeWidth={3} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13 }}>{item.name}</span>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 11, opacity: 0.7 }}>{booking.confirmation_id}</span>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px", borderRadius: 12,
      background: "var(--surface)", border: "1.5px solid var(--border)",
    }}>
      <Zap size={13} strokeWidth={2} style={{ color: "var(--accent)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13, color: "var(--fg)", lineHeight: 1.3 }}>{item.name}</div>
        <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 11, color: "var(--fg-3)", marginTop: 1 }}>{item.location}</div>
      </div>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--accent)", flexShrink: 0 }}>~₹{item.approx_cost.toLocaleString()}</span>
      <button className="book-btn" style={{ flex: "none", padding: "7px 12px", fontSize: 12 }} onClick={onBook} disabled={loading}>
        {loading ? <span className="btn-spinner" /> : isDemo ? "book demo" : "book"}
      </button>
      <button className="skip-btn" style={{ padding: "7px 10px", fontSize: 12 }} onClick={onSkip}>skip</button>
    </div>
  );
}
