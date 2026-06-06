import { RefreshCw, Coffee, Soup, UtensilsCrossed } from "lucide-react";
import { getIllustration } from "./TravelIllustrations";
import { getDestinationImageUrl } from "../../lib/destinationImage";
import { getPlaceImageUrl } from "../../lib/placeImage";
import type { DayPlan, LunchMeal, DinnerOption } from "../../types";

export function cleanName(name: string): string {
  return name
    .replace(/\s*\)\s*—\s*.+$/i, "")
    .replace(/\s*—\s*(check|verify|note|confirm|see)\b.+$/i, "")
    .replace(/\s*\(LWD\s+\w+\)/i, "")
    .trim();
}

interface Props {
  day: DayPlan;
  listMode?: boolean;
}

export default function DayJournalCard({ day, listMode = false }: Props) {
  const imgUrl = getDestinationImageUrl(day.location);
  const illustration = getIllustration(day.location);

  return (
    <div
      className="day-swipe-card"
      style={{
        ...(listMode ? { flex: "none", width: "100%" } : {}),
        backgroundImage: "repeating-linear-gradient(transparent,transparent 27px,rgba(62,47,35,0.07) 27px,rgba(62,47,35,0.07) 28px)",
        backgroundPositionY: "80px",
        position: "relative",
        overflow: "hidden",
        padding: "0 0 16px",
      }}
    >
      {/* Washi tape strip across top */}
      <div style={{
        height: 14, background: "var(--tape)",
        margin: "0 -16px 0", borderBottom: "1px solid rgba(166,112,29,0.3)",
      }} />

      {/* Header: day stamp + location + illustration */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px 0", marginBottom: 12 }}>
        {/* Ink stamp circle */}
        <div style={{
          width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
          border: "2.5px solid var(--bark)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "transparent",
        }}>
          <span style={{ fontFamily: "var(--font-script)", fontSize: 30, fontWeight: 700, color: "var(--bark)", lineHeight: 1 }}>
            {day.day_number}
          </span>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 7, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--bark-2)", marginTop: 1 }}>
            DAY
          </span>
        </div>

        {/* Location + refinement tag */}
        <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
          <div style={{ fontFamily: "var(--font-script)", fontSize: 22, color: "var(--rust)", lineHeight: 1.15, fontWeight: 700 }}>
            {day.location.split(",")[0]}
          </div>
          {day.location.includes(",") && (
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--bark-3)", fontWeight: 600, marginTop: 1 }}>
              {day.location.split(",").slice(1).join(",").trim()}
            </div>
          )}
          {day.updated_in_refinement && (
            <span className="updated-tag" style={{ marginTop: 4, display: "inline-flex" }}>
              <RefreshCw size={10} strokeWidth={3} />updated
            </span>
          )}
        </div>

        {/* Illustration */}
        <div style={{ flexShrink: 0, opacity: 0.85, marginTop: -4 }}>
          {illustration}
        </div>
      </div>

      {/* Photo strip with tape tabs */}
      {imgUrl && (
        <div style={{ position: "relative", margin: "0 16px 14px" }}>
          <div style={{
            position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)",
            width: 40, height: 12, background: "var(--tape)",
            borderRadius: 2, zIndex: 2,
          }} />
          <div style={{
            borderRadius: 6, overflow: "hidden", height: 90,
            boxShadow: "0 3px 12px rgba(62,47,35,0.2)",
            border: "3px solid var(--paper)",
            outline: "1px solid rgba(62,47,35,0.12)",
          }}>
            <img
              src={imgUrl}
              alt={day.location}
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
              onError={e => { (e.currentTarget.parentElement!.parentElement as HTMLElement).style.display = "none"; }}
            />
          </div>
        </div>
      )}

      {/* Notes callout */}
      {day.notes && (
        <div style={{
          margin: "0 16px 10px",
          padding: "8px 12px",
          background: "rgba(216,149,64,0.12)",
          border: "1.5px dashed var(--ochre-deep)",
          borderRadius: 8,
          display: "flex", gap: 7, alignItems: "flex-start",
        }}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>✎</span>
          <span style={{ fontFamily: "var(--font-script)", fontSize: 14, color: "var(--bark)", lineHeight: 1.5 }}>
            {day.notes}
          </span>
        </div>
      )}

      {/* Activities — journal entry style */}
      <div style={{ padding: "0 16px" }}>
        {day.activities.map((a, i) => {
          const placeImg = getPlaceImageUrl(a.name, day.location.split(",")[0]);
          return (
          <div key={a.name} style={{
            display: "flex", gap: 10, alignItems: "flex-start",
            padding: "9px 0",
            borderTop: i === 0 ? "none" : "1px dashed rgba(62,47,35,0.1)",
          }}>
            <span style={{
              fontFamily: "var(--font-script)", fontSize: 16, fontWeight: 700,
              color: a.bookable ? "var(--moss)" : "var(--bark-3)",
              lineHeight: 1, flexShrink: 0, width: 18, textAlign: "center", paddingTop: 1,
            }}>
              {i + 1}.
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13.5, color: "var(--fg)", lineHeight: 1.3 }}>
                {cleanName(a.name)}
              </div>
              {a.approx_cost != null && (
                <div style={{ fontFamily: "var(--font-script)", fontSize: 13, color: "var(--rust)", marginTop: 1 }}>
                  ~₹{a.approx_cost.toLocaleString()} / person
                </div>
              )}
              <div className="act-badges" style={{ marginTop: 4 }}>
                {a.bookable
                  ? <span className="badge bookable">bookable</span>
                  : <span className="badge">plan to visit</span>}
              </div>
            </div>
            {placeImg && (
              <img
                src={placeImg}
                alt={a.name}
                style={{
                  width: 52, height: 52, borderRadius: 8, objectFit: "cover",
                  flexShrink: 0, border: "2px solid var(--paper)",
                  boxShadow: "0 2px 6px rgba(62,47,35,0.18)",
                }}
              />
            )}
          </div>
          );
        })}
      </div>

      {/* Meals — postage-stamp style row */}
      <div style={{
        margin: "10px 16px 0",
        padding: "10px 0 0",
        borderTop: "1.5px solid rgba(62,47,35,0.12)",
        display: "flex", gap: 8,
      }}>
        {/* Breakfast */}
        <MealStamp Icon={Coffee} label="B" text={day.meals.breakfast} />
        {/* Lunch */}
        <LunchStamp lunch={day.meals.lunch} />
        {/* Dinner */}
        <DinnerStamp dinner={day.meals.dinner} />
      </div>
    </div>
  );
}

function MealStamp({ Icon, label, text }: { Icon: (props: { size?: number; strokeWidth?: number }) => JSX.Element; label: string; text: string }) {
  return (
    <div style={{ flex: 1, padding: "6px 8px", background: "rgba(244,236,219,0.8)", border: "1px solid rgba(62,47,35,0.12)", borderRadius: 8 }}>
      <div style={{ marginBottom: 3, color: "var(--bark-2)", lineHeight: 0 }}><Icon size={13} strokeWidth={2} /></div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 800, color: "var(--bark-3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-script)", fontSize: 12, color: "var(--bark)", lineHeight: 1.3 }}>{text}</div>
    </div>
  );
}

function LunchStamp({ lunch }: { lunch: LunchMeal | string }) {
  // Handle legacy string format gracefully
  if (typeof lunch === "string") {
    return <MealStamp Icon={Soup} label="L" text={lunch} />;
  }
  return (
    <div style={{ flex: 1, padding: "6px 8px", background: "rgba(244,236,219,0.8)", border: "1px solid rgba(62,47,35,0.12)", borderRadius: 8 }}>
      <div style={{ marginBottom: 3, color: "var(--bark-2)", lineHeight: 0 }}><Soup size={13} strokeWidth={2} /></div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 800, color: "var(--bark-3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>L</div>
      <div style={{ fontFamily: "var(--font-script)", fontSize: 12, color: "var(--bark)", lineHeight: 1.3 }}>{lunch.description}</div>
      {lunch.location_note && (
        <div style={{ fontFamily: "var(--font-body)", fontSize: 9, color: "var(--bark-3)", marginTop: 2 }}>{lunch.location_note}</div>
      )}
      {lunch.restaurant_name && (
        <div style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, color: "var(--moss)", marginTop: 1 }}>{lunch.restaurant_name}</div>
      )}
    </div>
  );
}

function DinnerStamp({ dinner }: { dinner: DinnerOption[] | string }) {
  // Handle legacy string format gracefully
  if (typeof dinner === "string") {
    return <MealStamp Icon={UtensilsCrossed} label="D" text={dinner} />;
  }
  const local = dinner.find(d => d.cuisine_tag === "local");
  return (
    <div style={{ flex: 1, padding: "6px 8px", background: "rgba(244,236,219,0.8)", border: "1px solid rgba(62,47,35,0.12)", borderRadius: 8 }}>
      <div style={{ marginBottom: 3, color: "var(--bark-2)", lineHeight: 0 }}><UtensilsCrossed size={13} strokeWidth={2} /></div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 800, color: "var(--bark-3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>D</div>
      {local ? (
        <div style={{ fontFamily: "var(--font-script)", fontSize: 12, color: "var(--bark)", lineHeight: 1.3 }}>{local.description}</div>
      ) : (
        <div style={{ fontFamily: "var(--font-script)", fontSize: 12, color: "var(--bark)", lineHeight: 1.3 }}>{dinner[0]?.description ?? ""}</div>
      )}
      <div style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, color: "var(--rust)", marginTop: 2 }}>
        3 options →
      </div>
    </div>
  );
}
