import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { onboard, getUserId, parseTaste, transcribeAudio } from "../services/api";
import PageTransition from "../components/shared/PageTransition";

const INTERESTS = [
  "nature", "heritage", "food", "adventure",
  "photography", "spiritual", "wildlife", "shopping",
  "wellness", "nightlife",
] as const;

const DIETARY_OPTIONS = ["Vegetarian", "Vegan", "Jain", "Halal", "Gluten-free", "None"] as const;

type ArchetypeKey = "slow" | "balanced" | "adventurer";

const ARCHETYPES: { key: ArchetypeKey; title: string; subtitle: string; emoji: string; preset: Record<string, number> }[] = [
  {
    key: "slow",
    title: "The Slow Explorer",
    subtitle: "Hidden cafés, long mornings, no alarm clocks",
    emoji: "☕",
    preset: { pace: 2, crowd_tolerance: 2, accommodation_taste: 4, walking_tolerance: 3 },
  },
  {
    key: "balanced",
    title: "The Balanced Traveler",
    subtitle: "Mix of must-sees and off-path discoveries",
    emoji: "🎒",
    preset: { pace: 3, crowd_tolerance: 3, accommodation_taste: 3, walking_tolerance: 3 },
  },
  {
    key: "adventurer",
    title: "The Packed Adventurer",
    subtitle: "Sunrise hikes, full days, sleep when home",
    emoji: "⛺",
    preset: { pace: 5, crowd_tolerance: 4, accommodation_taste: 2, walking_tolerance: 5 },
  },
];

function inferArchetype(parsed: Record<string, unknown>): ArchetypeKey | null {
  const pace = parsed.pace as number | undefined;
  if (!pace) return null;
  if (pace <= 2) return "slow";
  if (pace >= 4) return "adventurer";
  return "balanced";
}

type MicState = "idle" | "recording" | "transcribing";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [storyText, setStoryText] = useState("");
  const [micState, setMicState] = useState<MicState>("idle");
  const [parsing, setParsing] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Step 2 state — populated from parsed or user choice
  const [archetype, setArchetype] = useState<ArchetypeKey | null>(null);
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set());

  // Step 3 state
  const [selectedDietary, setSelectedDietary] = useState<Set<string>>(new Set());
  const [hardAvoids, setHardAvoids] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function toggleMic() {
    if (micState === "idle") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        chunksRef.current = [];
        rec.ondataavailable = (e) => chunksRef.current.push(e.data);
        rec.onstop = async () => {
          setMicState("transcribing");
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          stream.getTracks().forEach((t) => t.stop());
          try {
            const text = await transcribeAudio(blob);
            if (text) setStoryText(text);
          } catch { /* silent */ }
          setMicState("idle");
        };
        rec.start();
        mediaRef.current = rec;
        setMicState("recording");
      } catch { /* no mic permission — stay idle */ }
    } else if (micState === "recording") {
      mediaRef.current?.stop();
    }
  }

  async function handleStep1Next() {
    if (!storyText.trim()) {
      setStep(2);
      return;
    }
    setParsing(true);
    try {
      const parsed = await parseTaste(storyText, getUserId());
      const inferredKey = inferArchetype(parsed);
      if (inferredKey) setArchetype(inferredKey);

      const interests = parsed.interests as Record<string, number> | undefined;
      if (interests) {
        const topInterests = Object.entries(interests)
          .filter(([, v]) => v >= 0.6)
          .map(([k]) => k);
        if (topInterests.length) setSelectedInterests(new Set(topInterests));
      }
    } catch { /* silently proceed */ }
    setParsing(false);
    setStep(2);
  }

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
      const preset = archetype
        ? ARCHETYPES.find((a) => a.key === archetype)!.preset
        : { pace: 3, crowd_tolerance: 3, accommodation_taste: 3, walking_tolerance: 3 };

      const interestsMap: Record<string, number> = {};
      for (const interest of INTERESTS) {
        interestsMap[interest] = selectedInterests.has(interest) ? 0.9 : 0.1;
      }
      const dietary = Array.from(selectedDietary).filter((d) => d !== "None").map((d) => d.toLowerCase());
      const hard_avoids_list = hardAvoids.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);

      const result = await onboard({
        user_id: getUserId(),
        taste_data: {
          ...preset,
          food_adventurousness: 3,
          interests: interestsMap,
          dietary_restrictions: dietary,
          hard_avoids: hard_avoids_list,
        },
      });

      localStorage.setItem("tripsathi_user_id", result.user_id);
      navigate("/planner");
    } catch {
      navigate("/planner");
    } finally {
      setSubmitting(false);
    }
  }

  const micColor = micState === "recording" ? "var(--accent)" : "var(--fg-2)";
  const micBg = micState === "recording" ? "rgba(176,73,47,0.12)" : "var(--surface)";
  const micBoxShadow = micState === "recording" ? "0 0 0 6px rgba(176,73,47,0.2)" : "none";

  return (
    <div style={{ minHeight: "100svh", background: "var(--paper)", display: "flex", justifyContent: "center", padding: "40px 16px 60px" }}>
      <div style={{ width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", gap: 0 }}>

        {/* Top row: step indicator + skip */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                style={{
                  width: n === step ? 24 : 8, height: 8, borderRadius: 4,
                  background: n === step ? "var(--ink)" : n < step ? "var(--fg-3)" : "var(--border-strong)",
                  transition: "all 0.3s ease",
                }}
              />
            ))}
          </div>
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

        {/* Brand header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
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

        <PageTransition stepKey={step}>
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{
                background: "var(--surface)", border: "1.5px solid var(--border)",
                borderRadius: 16, padding: "24px 20px",
                display: "flex", flexDirection: "column", gap: 16,
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <p style={{
                    fontFamily: "var(--font-display)", fontSize: 17, color: "var(--ink)",
                    fontStyle: "italic", margin: 0, lineHeight: 1.4,
                  }}>
                    "Tell me about a trip you loved — or one that disappointed you."
                  </p>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--fg-3)", margin: 0 }}>
                    We'll read between the lines to understand what kind of traveler you are.
                  </p>
                </div>

                {/* Mic button */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <button
                    type="button"
                    onClick={toggleMic}
                    disabled={micState === "transcribing"}
                    style={{
                      width: 64, height: 64, borderRadius: "50%",
                      border: `2px solid ${micColor}`,
                      background: micBg, cursor: micState === "transcribing" ? "not-allowed" : "pointer",
                      fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.2s ease", boxShadow: micBoxShadow,
                      color: micColor,
                    }}
                  >
                    {micState === "transcribing" ? "⏳" : micState === "recording" ? "⏹" : "🎙"}
                  </button>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--fg-3)" }}>
                    {micState === "recording" ? "Recording… tap to stop" : micState === "transcribing" ? "Transcribing…" : "Hold to record"}
                  </span>
                </div>

                {/* Text area */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--fg-3)", fontWeight: 600 }}>
                    or type instead
                  </label>
                  <textarea
                    rows={4}
                    placeholder="e.g. We went to Coorg last monsoon — loved the misty mornings but hated the tourist crowds at Abbey Falls..."
                    value={storyText}
                    onChange={(e) => setStoryText(e.target.value)}
                    style={{
                      width: "100%", background: "var(--paper)", border: "1.5px solid var(--border-strong)",
                      borderRadius: 10, padding: "10px 12px", color: "var(--fg-1)",
                      fontFamily: "var(--font-body)", fontSize: 13, resize: "none", outline: "none",
                      boxSizing: "border-box", lineHeight: 1.5,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  type="button"
                  disabled={parsing}
                  onClick={handleStep1Next}
                  style={{
                    width: "100%", padding: "14px", borderRadius: "var(--radius-pill)",
                    background: "var(--ink)", color: "var(--paper)",
                    fontFamily: "var(--font-body)", fontWeight: 800, fontSize: 14,
                    border: "none", cursor: parsing ? "not-allowed" : "pointer",
                    opacity: parsing ? 0.6 : 1, letterSpacing: "0.04em",
                  }}
                >
                  {parsing ? "reading your story..." : storyText.trim() ? "analyse my story →" : "skip this step →"}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{
                background: "var(--surface)", border: "1.5px solid var(--border)",
                borderRadius: 16, padding: "24px 20px",
                display: "flex", flexDirection: "column", gap: 16,
              }}>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13, color: "var(--fg-1)", margin: 0 }}>
                  Which traveler are you?
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {ARCHETYPES.map((a) => {
                    const active = archetype === a.key;
                    return (
                      <button
                        key={a.key}
                        type="button"
                        onClick={() => setArchetype(a.key)}
                        style={{
                          display: "flex", alignItems: "center", gap: 14,
                          padding: "14px 16px", borderRadius: 12, textAlign: "left",
                          border: `2px solid ${active ? "var(--ink)" : "var(--border-strong)"}`,
                          background: active ? "rgba(26,21,14,0.05)" : "var(--paper)",
                          cursor: "pointer", transition: "all 0.15s",
                        }}
                      >
                        <span style={{ fontSize: 28, flexShrink: 0 }}>{a.emoji}</span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{
                            fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 800,
                            color: active ? "var(--ink)" : "var(--fg-1)",
                          }}>
                            {a.title}
                          </span>
                          <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--fg-3)" }}>
                            {a.subtitle}
                          </span>
                        </div>
                        {active && (
                          <span style={{
                            marginLeft: "auto", fontSize: 16, color: "var(--ink)", flexShrink: 0,
                          }}>✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{
                background: "var(--surface)", border: "1.5px solid var(--border)",
                borderRadius: 16, padding: "20px",
                display: "flex", flexDirection: "column", gap: 12,
              }}>
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

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  style={{
                    flex: 1, padding: "12px", borderRadius: "var(--radius-pill)",
                    background: "none", border: "1.5px solid var(--border-strong)",
                    fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13,
                    color: "var(--fg-2)", cursor: "pointer",
                  }}
                >
                  ← back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  style={{
                    flex: 2, padding: "12px", borderRadius: "var(--radius-pill)",
                    background: "var(--ink)", color: "var(--paper)",
                    fontFamily: "var(--font-body)", fontWeight: 800, fontSize: 14,
                    border: "none", cursor: "pointer", letterSpacing: "0.04em",
                  }}
                >
                  next →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{
                background: "var(--surface)", border: "1.5px solid var(--border)",
                borderRadius: 16, padding: "24px 20px",
                display: "flex", flexDirection: "column", gap: 16,
              }}>
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

              <div style={{
                background: "var(--surface)", border: "1.5px solid var(--border)",
                borderRadius: 16, padding: "20px",
                display: "flex", flexDirection: "column", gap: 12,
              }}>
                <label style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13, color: "var(--fg-1)" }}>
                  Anything we should avoid?
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. extreme heat, long bus rides, crowded markets..."
                  value={hardAvoids}
                  onChange={(e) => setHardAvoids(e.target.value)}
                  style={{
                    width: "100%", background: "var(--paper)", border: "1.5px solid var(--border-strong)",
                    borderRadius: 10, padding: "10px 12px", color: "var(--fg-1)",
                    fontFamily: "var(--font-body)", fontSize: 13, resize: "none", outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  style={{
                    flex: 1, padding: "12px", borderRadius: "var(--radius-pill)",
                    background: "none", border: "1.5px solid var(--border-strong)",
                    fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13,
                    color: "var(--fg-2)", cursor: "pointer",
                  }}
                >
                  ← back
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  style={{
                    flex: 2, padding: "12px", borderRadius: "var(--radius-pill)",
                    background: "var(--ink)", color: "var(--paper)",
                    fontFamily: "var(--font-body)", fontWeight: 800, fontSize: 14,
                    border: "none", cursor: submitting ? "not-allowed" : "pointer",
                    opacity: submitting ? 0.6 : 1, letterSpacing: "0.04em",
                  }}
                >
                  {submitting ? "saving..." : "start planning ✦"}
                </button>
              </div>
            </div>
          )}
        </PageTransition>

      </div>
    </div>
  );
}
