import type { TripParameters } from "../../types";

type Screen = "itinerary" | "selection" | "booking";

interface Props {
  destination: string;
  tripParams: TripParameters;
  userName?: string;
  screen: Screen;
  chosenHotelName?: string;
}

function personaLabel(p: TripParameters): string {
  const { party_size: ps, kid_ages: ka, elderly: el } = p;
  const kids = ka?.length ?? 0;
  if (ka?.some(a => a <= 3)) return "family";
  if (kids > 0) return "family";
  if (el) return "senior";
  if (ps === 1) return "solo";
  if (ps === 2) return "couple";
  return "group";
}

function affirmationCopy(dest: string, persona: string, name: string): string {
  const you = name || "you";
  switch (persona) {
    case "family": return `The perfect ${dest} family adventure, crafted just for ${you}`;
    case "couple": return `A romantic ${dest} escape, personalized for ${you}`;
    case "solo":   return `Your solo ${dest} journey, built around what you love, ${you}`;
    case "senior": return `A comfortable, unhurried ${dest} trip, crafted for ${you}`;
    default:       return `Your perfect ${dest} getaway, planned just for ${you}`;
  }
}

function budgetLabel(b: string | undefined): string {
  if (b === "budget") return "Budget";
  if (b === "premium") return "Premium";
  return "Mid-range";
}

export default function TripSummaryBanner({ destination, tripParams, userName, screen, chosenHotelName }: Props) {
  const dest = destination.split(",")[0].trim();
  const persona = personaLabel(tripParams);
  const copy = affirmationCopy(dest, persona, userName || "");
  const budget = budgetLabel(tripParams.budget_bracket);
  const nights = tripParams.duration_days ?? 0;

  const steps: { label: string; done: boolean; active: boolean; value?: string }[] = [
    { label: "Itinerary", done: true, active: false },
    {
      label: screen === "booking" ? `Hotel: ${chosenHotelName ? chosenHotelName.slice(0, 18) + (chosenHotelName.length > 18 ? "…" : "") : "chosen"}` : "Choose hotel",
      done: screen === "booking",
      active: screen === "selection",
    },
    { label: "Dining", done: screen === "booking", active: false },
    { label: "Book", done: false, active: screen === "booking" },
  ];

  return (
    <div style={{
      background: "var(--paper-2)",
      border: "1.5px solid rgba(62,47,35,0.14)",
      borderRadius: 14,
      padding: "14px 16px",
      marginBottom: 16,
      boxShadow: "0 2px 8px rgba(62,47,35,0.06)",
    }}>
      {/* Affirmation copy */}
      <div style={{
        fontFamily: "var(--font-script)",
        fontSize: 18,
        color: "var(--bark)",
        lineHeight: 1.3,
        marginBottom: 8,
      }}>
        {copy} ✦
      </div>

      {/* Meta pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
        {[dest, `${nights} nights`, persona, budget].map(chip => (
          <span key={chip} style={{
            fontSize: 10, fontWeight: 700, padding: "3px 9px",
            borderRadius: "var(--radius-pill)",
            border: "1.5px solid var(--border-strong)",
            color: "var(--fg-2)", fontFamily: "var(--font-body)",
            textTransform: "capitalize",
          }}>
            {chip}
          </span>
        ))}
      </div>

      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
        {steps.map((step, i) => (
          <div key={step.label} style={{ display: "flex", alignItems: "center" }}>
            {i > 0 && (
              <span style={{ color: "var(--border-strong)", fontSize: 11, margin: "0 4px" }}>›</span>
            )}
            <span style={{
              fontSize: 10, fontWeight: 700, fontFamily: "var(--font-body)",
              color: step.done ? "var(--moss)" : step.active ? "var(--bark)" : "var(--fg-3)",
              letterSpacing: "0.03em",
            }}>
              {step.done ? "✓ " : step.active ? "◎ " : "◌ "}
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
