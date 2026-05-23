import { useState } from "react";
import { Check, MapPin, Zap, AlertCircle, AlertTriangle, Download, Share2, Info, ArrowLeft } from "lucide-react";
import { bookItem } from "../../services/api";
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
      photoClass: h.location.toLowerCase().includes("alleppey") ? "beach" : h.location.toLowerCase().includes("kovalam") ? "beach" : "",
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
      .map((a, i) => ({ name: a.name, location: d.location, dayNum: d.day_number, idx: i }))
  );

  const [bookedItems, setBookedItems] = useState<Record<string, BookingResponse>>({});
  const [skippedItems, setSkippedItems] = useState<Set<string>>(new Set());
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());

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
            ? `tap "book demo" on each. nothing real gets charged — these go through a sandbox.`
            : `tap "book" on each item to confirm. prices are estimates.`}
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
          {bookableHotels
            .filter((item) => !skippedItems.has(item.name))
            .map((item) => (
              <ItemCard
                key={item.name}
                item={item}
                isDemo={isDemo}
                booking={bookedItems[item.name]}
                loading={loadingItems.has(item.name)}
                onBook={() => handleBook(item)}
                onSkip={() => handleSkip(item.name)}
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
          {bookableActivities
            .filter((item) => !skippedItems.has(item.name))
            .map((item) => (
              <ItemCard
                key={item.name}
                item={item}
                isDemo={isDemo}
                booking={bookedItems[item.name]}
                loading={loadingItems.has(item.name)}
                onBook={() => handleBook(item)}
                onSkip={() => handleSkip(item.name)}
              />
            ))}
        </div>
      )}

      {/* Plan to visit */}
      {planToVisit.length > 0 && (
        <div className="bs-section">
          <div className="label">
            <span>Plan to visit · {planToVisit.length}</span>
            <span className="line" />
            <span>no booking needed</span>
          </div>
          <div className="visit-list">
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
        <div className="done-card">
          <span className="scrib">all set ✦</span>
          <h3>your <i>demo</i> trip<br />is stamped. ✦</h3>
          <p className="lede">
            {isDemo
              ? "in sprint 3 these will route through real Booking.com and houseboat operator APIs. for now: enjoy the receipt."
              : "your bookings are confirmed. check your email for confirmations."}
          </p>
          <div className="done-actions">
            <button className="done-btn"><Download size={14} strokeWidth={2.5} />save as PDF</button>
            <button className="done-btn outline"><Share2 size={14} strokeWidth={2.5} />share</button>
          </div>
        </div>
      )}

      {isDemo && (
        <div className="footer-disc">
          <Info size={14} strokeWidth={2.5} />
          <span><b>Sprint 2 reminder —</b> all bookings are mocked. confirmation IDs are made up. nothing was charged.</span>
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}

interface ItemCardProps {
  item: BookableItem;
  isDemo: boolean;
  booking?: BookingResponse;
  loading: boolean;
  onBook: () => void;
  onSkip: () => void;
}

function ItemCard({ item, isDemo, booking, loading, onBook, onSkip }: ItemCardProps) {
  return (
    <div className={`item-card ${booking ? "confirmed" : ""}`}>
      {booking && isDemo && <div className="demo-watermark">DEMO</div>}
      <div className="item-head">
        <div className={`item-photo ${item.photoClass ?? ""}`} />
        <div>
          <div className="item-name">{item.name}</div>
          <div className="item-loc">
            <MapPin size={12} strokeWidth={2} />{item.location}
          </div>
          <div className="item-price">
            ~ ₹{item.approx_cost.toLocaleString()}
            <span className="per">/ {item.type === "hotel" ? "night" : "person"}</span>
          </div>
        </div>
      </div>

      {item.isGeneral && !booking && (
        <div className="item-disc">
          <AlertCircle size={12} strokeWidth={2.5} />
          <span>general recommendation — verify on Booking.com before confirming.</span>
        </div>
      )}
      {item.isHouseboat && !booking && (
        <div className="item-disc">
          <AlertTriangle size={12} strokeWidth={2.5} />
          <span>book through your hotel operator — never direct cold-approach (kerala houseboat trust gap).</span>
        </div>
      )}

      {booking ? (
        <div className="confirm-row">
          <div className="ic"><Check size={13} strokeWidth={3} /></div>
          <div>
            <div className="lab">confirmation</div>
            <div className="id">{booking.confirmation_id}</div>
          </div>
          <div className="right">
            <div className="small">via</div>
            <div className="big">{booking.provider}</div>
          </div>
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
  );
}
