import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { onboard, getUserId } from "../services/api";

const INTERESTS = [
  "nature", "heritage", "food", "adventure",
  "photography", "spiritual", "wildlife", "shopping",
  "wellness", "nightlife",
] as const;

const DIETARY_OPTIONS = ["Vegetarian", "Vegan", "Jain", "Halal", "Gluten-free", "None"] as const;

function SliderField({
  label,
  leftLabel,
  rightLabel,
  value,
  onChange,
}: {
  label: string;
  leftLabel: string;
  rightLabel: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13, color: "var(--fg-1)" }}>
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--fg-3)", width: 90, textAlign: "right", flexShrink: 0 }}>
          {leftLabel}
        </span>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--accent)" }}
        />
        <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--fg-3)", width: 90, flexShrink: 0 }}>
          {rightLabel}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "0 90px 0 100px" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            style={{
              fontFamily: "var(--font-body)", fontSize: 11,
              color: value === n ? "var(--accent)" : "var(--fg-3)",
              fontWeight: value === n ? 800 : 400,
            }}
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

const CARD_STYLE: React.CSSProperties = {
  background: "var(--surface)",
  border: "1.5px solid var(--border)",
  borderRadius: 16,
  padding: "18px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const [pace, setPace] = useState(3);
  const [crowdTolerance, setCrowdTolerance] = useState(3);
  const [foodAdventurousness, setFoodAdventurousness] = useState(3);
  const [walkingTolerance, setWalkingTolerance] = useState(3);
  const [accommodationTaste, setAccommodationTaste] = useState(3);

  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set());
  const [selectedDietary, setSelectedDietary] = useState<Set<string>>(new Set());
  const [hardAvoids, setHardAvoids] = useState("");

  function toggleInterest(interest: string) {
    setSelectedInterests((prev) => {
      const next = new Set(prev);
      if (next.has(interest)) next.delete(interest);
      else next.add(interest);
      return next;
    });
  }

  function toggleDietary(option: string) {
    setSelectedDietary((prev) => {
      const next = new Set(prev);
      if (option === "None") return new Set(["None"]);
      next.delete("None");
      if (next.has(option)) next.delete(option);
      else next.add(option);
      return next;
    });
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const interestsMap: Record<string, number> = {};
      for (const interest of INTERESTS) {
        interestsMap[interest] = selectedInterests.has(interest) ? 0.9 : 0.1;
      }
      const dietary = Array.from(selectedDietary).filter((d) => d !== "None").map((d) => d.toLowerCase());
      const hard_avoids_list = hardAvoids.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
      const userId = getUserId();

      const result = await onboard({
        user_id: userId,
        taste_data: {
          pace,
          crowd_tolerance: crowdTolerance,
          food_adventurousness: foodAdventurousness,
          walking_tolerance: walkingTolerance,
          accommodation_taste: accommodationTaste,
          interests: interestsMap,
          dietary_restrictions: dietary,
          hard_avoids: hard_avoids_list,
        },
      });

      localStorage.setItem("tripsathi_user_id", result.user_id);
      navigate("/planner");
    } catch (err) {
      console.error("Onboarding submit failed:", err);
      navigate("/planner");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100svh", background: "var(--paper)", display: "flex", justifyContent: "center", padding: "40px 16px 60px" }}>
      <div style={{ width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Skip link — always visible */}
        <div style={{ textAlign: "right" }}>
          <button
            type="button"
            onClick={() => navigate("/planner")}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: "var(--font-body)", fontSize: 13, color: "var(--fg-3)",
              fontWeight: 600, padding: "4px 0",
            }}
          >
            Skip for now →
          </button>
        </div>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div className="brand-mini" style={{ marginBottom: 12 }}>
            <span className="word">trip<i>sathi</i></span>
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "var(--ink)", marginBottom: 6, fontWeight: 700 }}>
            your travel <span style={{ fontStyle: "italic" }}>DNA</span>
          </h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--fg-2)", margin: 0 }}>
            90 seconds · shapes every plan we build for you
          </p>
        </div>

        {/* Card: Pace */}
        <div style={CARD_STYLE}>
          <SliderField
            label="How do you like to travel?"
            leftLabel="Slow & relaxed"
            rightLabel="Packed with activities"
            value={pace}
            onChange={setPace}
          />
        </div>

        {/* Card: Crowd tolerance */}
        <div style={CARD_STYLE}>
          <SliderField
            label="Busy spots?"
            leftLabel="Avoid crowds"
            rightLabel="Fine with crowds"
            value={crowdTolerance}
            onChange={setCrowdTolerance}
          />
        </div>

        {/* Card: Food adventurousness */}
        <div style={CARD_STYLE}>
          <SliderField
            label="Eating habits?"
            leftLabel="Stick to safe"
            rightLabel="Love trying anything"
            value={foodAdventurousness}
            onChange={setFoodAdventurousness}
          />
        </div>

        {/* Card: Walking tolerance */}
        <div style={CARD_STYLE}>
          <SliderField
            label="How much walking?"
            leftLabel="Car everywhere"
            rightLabel="Love long walks"
            value={walkingTolerance}
            onChange={setWalkingTolerance}
          />
        </div>

        {/* Card: Accommodation taste */}
        <div style={CARD_STYLE}>
          <SliderField
            label="Where do you like to stay?"
            leftLabel="Major chain hotel"
            rightLabel="Homestay / camping"
            value={accommodationTaste}
            onChange={setAccommodationTaste}
          />
        </div>

        {/* Card: Interests */}
        <div style={CARD_STYLE}>
          <p style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13, color: "var(--fg-1)", margin: 0 }}>
            What do you love doing on a trip?
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {INTERESTS.map((interest) => {
              const active = selectedInterests.has(interest);
              return (
                <button
                  key={interest}
                  type="button"
                  onClick={() => toggleInterest(interest)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "9px 12px", borderRadius: 10,
                    border: `1.5px solid ${active ? "var(--accent)" : "var(--border-strong)"}`,
                    background: active ? "rgba(176,73,47,0.08)" : "var(--paper)",
                    color: active ? "var(--accent)" : "var(--fg-2)",
                    fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13,
                    cursor: "pointer", textTransform: "capitalize", textAlign: "left",
                    transition: "all 0.15s",
                  }}
                >
                  <span style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                    border: `1.5px solid ${active ? "var(--accent)" : "var(--border-strong)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, color: active ? "var(--accent)" : "transparent",
                    background: active ? "rgba(176,73,47,0.12)" : "transparent",
                  }}>
                    {active ? "✓" : ""}
                  </span>
                  {interest}
                </button>
              );
            })}
          </div>
        </div>

        {/* Card: Dietary restrictions */}
        <div style={CARD_STYLE}>
          <p style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13, color: "var(--fg-1)", margin: 0 }}>
            Dietary restrictions?
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {DIETARY_OPTIONS.map((option) => {
              const active = selectedDietary.has(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleDietary(option)}
                  style={{
                    padding: "6px 14px", borderRadius: 999,
                    border: `1.5px solid ${active ? "var(--accent)" : "var(--border-strong)"}`,
                    background: active ? "rgba(176,73,47,0.08)" : "var(--paper)",
                    color: active ? "var(--accent)" : "var(--fg-2)",
                    fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12,
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        {/* Card: Hard avoids */}
        <div style={CARD_STYLE}>
          <label style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13, color: "var(--fg-1)" }}>
            Anything else we should know?
          </label>
          <textarea
            rows={3}
            placeholder="e.g. extreme heat, long bus rides, crowded markets..."
            value={hardAvoids}
            onChange={(e) => setHardAvoids(e.target.value)}
            style={{
              width: "100%", background: "var(--paper-3)", border: "1.5px solid var(--border-strong)",
              borderRadius: 10, padding: "10px 12px", color: "var(--fg-1)",
              fontFamily: "var(--font-body)", fontSize: 13, resize: "none", outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 16 }}>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            style={{
              width: "100%", padding: "14px", borderRadius: "var(--radius-pill)",
              background: "var(--ink)", color: "var(--paper)",
              fontFamily: "var(--font-body)", fontWeight: 800, fontSize: 14,
              border: "none", cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.6 : 1, letterSpacing: "0.04em",
            }}
          >
            {submitting ? "saving..." : "save my travel DNA ✦"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/planner")}
            style={{
              width: "100%", padding: "10px",
              background: "none", border: "none",
              fontFamily: "var(--font-body)", fontSize: 13, color: "var(--fg-3)",
              cursor: "pointer",
            }}
          >
            skip for now
          </button>
        </div>

      </div>
    </div>
  );
}
