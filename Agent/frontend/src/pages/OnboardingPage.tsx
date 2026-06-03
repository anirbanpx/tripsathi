import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { onboard, getOrCreateUserId } from "../services/api";

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
    <div className="space-y-2">
      <label className="block text-sm font-medium text-white">{label}</label>
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 w-28 text-right">{leftLabel}</span>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-indigo-500"
        />
        <span className="text-xs text-slate-400 w-28">{rightLabel}</span>
      </div>
      <div className="flex justify-between px-8">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`text-xs w-5 text-center ${value === n ? "text-indigo-400 font-bold" : "text-slate-600"}`}
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  // Taste dimensions
  const [pace, setPace] = useState(3);
  const [crowdTolerance, setCrowdTolerance] = useState(3);
  const [foodAdventurousness, setFoodAdventurousness] = useState(3);

  // Interests checkboxes
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set());

  // Dietary restrictions
  const [selectedDietary, setSelectedDietary] = useState<Set<string>>(new Set());

  // Free text
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
      if (option === "None") {
        return new Set(["None"]);
      }
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

      const hard_avoids_list = hardAvoids
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const userId = getOrCreateUserId();

      const result = await onboard({
        user_id: userId,
        taste_data: {
          pace,
          crowd_tolerance: crowdTolerance,
          food_adventurousness: foodAdventurousness,
          interests: interestsMap,
          dietary_restrictions: dietary,
          hard_avoids: hard_avoids_list,
        },
      });

      // Persist returned user_id
      localStorage.setItem("tripsathi_user_id", result.user_id);

      navigate("/planner");
    } catch (err) {
      console.error("Onboarding submit failed:", err);
      // Don't block the user — navigate anyway
      navigate("/planner");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkip() {
    navigate("/planner");
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white">Tell us your travel style</h1>
          <p className="text-slate-400 text-sm">Takes about 90 seconds — helps us personalise your trips</p>
        </div>

        {/* Card: Pace */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
          <SliderField
            label="How do you like to travel?"
            leftLabel="Slow & relaxed"
            rightLabel="Packed with activities"
            value={pace}
            onChange={setPace}
          />
        </div>

        {/* Card: Crowd tolerance */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
          <SliderField
            label="Busy spots?"
            leftLabel="Avoid crowds"
            rightLabel="Fine with crowds"
            value={crowdTolerance}
            onChange={setCrowdTolerance}
          />
        </div>

        {/* Card: Food adventurousness */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
          <SliderField
            label="Eating habits?"
            leftLabel="Stick to safe"
            rightLabel="Love trying anything"
            value={foodAdventurousness}
            onChange={setFoodAdventurousness}
          />
        </div>

        {/* Card: Interests */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
          <p className="text-sm font-medium text-white">What do you love doing on a trip?</p>
          <div className="grid grid-cols-2 gap-2">
            {INTERESTS.map((interest) => (
              <button
                key={interest}
                type="button"
                onClick={() => toggleInterest(interest)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm capitalize transition-colors ${
                  selectedInterests.has(interest)
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-slate-700 border-slate-600 text-slate-300 hover:border-indigo-500"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs ${
                    selectedInterests.has(interest)
                      ? "bg-white border-white text-indigo-600"
                      : "border-slate-500"
                  }`}
                >
                  {selectedInterests.has(interest) ? "✓" : ""}
                </span>
                {interest}
              </button>
            ))}
          </div>
        </div>

        {/* Card: Dietary restrictions */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
          <p className="text-sm font-medium text-white">Dietary restrictions?</p>
          <div className="flex flex-wrap gap-2">
            {DIETARY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => toggleDietary(option)}
                className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                  selectedDietary.has(option)
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-slate-700 border-slate-600 text-slate-300 hover:border-indigo-500"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* Card: Hard avoids */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
          <label htmlFor="hard-avoids" className="block text-sm font-medium text-white">
            Anything else we should know?
          </label>
          <textarea
            id="hard-avoids"
            rows={3}
            placeholder="e.g. extreme heat, long bus rides, crowded markets..."
            value={hardAvoids}
            onChange={(e) => setHardAvoids(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 pb-8">
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
          >
            {submitting ? "Saving..." : "Save my preferences"}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="w-full py-2 text-slate-400 hover:text-slate-300 text-sm transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
