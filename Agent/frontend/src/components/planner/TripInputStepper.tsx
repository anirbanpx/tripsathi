import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapPin, Calendar, Users, Wallet, Sparkles, Accessibility,
  Home, Heart, User, Baby, Ear, ArrowRight, Pencil,
} from "lucide-react";
import { streamPlan, parseIntent } from "../../services/api";
import { PROGRESS_STAGES } from "../../lib/fakeProgress";
import { getDestinationImageUrl } from "../../lib/destinationImage";
import type { UserContext, TripParameters } from "../../types";
import DatePicker from "./DatePicker";

// ── demo / stepper constants ──────────────────────────────────────────────────

const DEMO_PARAMS: TripParameters = {
  destination: "Kerala",
  start_date: "2026-06-10",
  duration_days: 5,
  party_size: 2,
  kid_ages: [5],
  elderly: false,
  budget_bracket: "mid",
  trip_style: ["nature", "culture"],
  special_needs: "",
};

interface Props {
  ctx: UserContext;
  onSetContext: (patch: Partial<UserContext>) => void;
}

const STEP_ICONS = [MapPin, Calendar, Users, Wallet, Sparkles, Accessibility];
const STEP_LABELS = ["where", "when", "who", "budget", "style", "needs"];

// ── component ─────────────────────────────────────────────────────────────────

export default function TripInputStepper({ ctx, onSetContext }: Props) {
  const navigate = useNavigate();
  const [isDemoMode] = useState(ctx.mode === "demo" && !ctx.seed_prompt);

  const [step, setStep] = useState(isDemoMode ? 2 : 0);
  const [groupType, setGroupType] = useState<string | null>(null);
  const [params, setParams] = useState<TripParameters>(
    isDemoMode ? DEMO_PARAMS : {
      destination: "",
      start_date: "",
      duration_days: 5,
      party_size: 2,
      kid_ages: [],
      elderly: false,
      budget_bracket: "mid",
      trip_style: [],
      special_needs: "",
    }
  );

  function patch(u: Partial<TripParameters>) {
    setParams((p) => ({ ...p, ...u }));
  }

  function toggleStyle(s: string) {
    patch({
      trip_style: params.trip_style.includes(s)
        ? params.trip_style.filter((x) => x !== s)
        : [...params.trip_style, s],
    });
  }

  async function fireGenerate(finalParams: TripParameters) {
    let stageIndex = 0;
    onSetContext({
      current_stage: "generating",
      generation_active: true,
      destination: finalParams.destination,
      fake_stage_index: 0,
      fake_stage_label: "Understanding your profile...",
      trip_params: finalParams,
    });
    try {
      const res = await streamPlan(finalParams, (label) => {
        stageIndex = Math.min(stageIndex + 1, PROGRESS_STAGES.length - 1);
        onSetContext({ fake_stage_index: stageIndex, fake_stage_label: label });
      }, (text) => {
        const enq = (window as unknown as Record<string, unknown>).__gpEnqueue as ((lines: string[]) => void) | undefined;
        enq?.([text]);
      });
      if (!res.plan) throw new Error("Plan generation failed — please try again");
      onSetContext({
        current_stage: "plan_display",
        generation_active: false,
        plan: res.plan,
        thread_id: res.thread_id,
        kid_ages: finalParams.kid_ages,
        fake_stage_label: "Done",
      });
    } catch (err) {
      onSetContext({ current_stage: "trip_input", generation_active: false });
      alert(`Something went wrong: ${err instanceof Error ? err.message : "please try again"}`);
    }
  }

  async function handleGenerate() {
    if (ctx.generation_active) return;
    onSetContext({ current_stage: "generating", generation_active: true, kid_ages: params.kid_ages, destination: params.destination, fake_stage_index: 0, fake_stage_label: "Understanding your profile...", trip_params: params });
    let stageIndex = 0;
    try {
      const res = await streamPlan(params, (label) => {
        stageIndex = Math.min(stageIndex + 1, PROGRESS_STAGES.length - 1);
        onSetContext({ fake_stage_index: stageIndex, fake_stage_label: label });
      }, (text) => {
        const enq = (window as unknown as Record<string, unknown>).__gpEnqueue as ((lines: string[]) => void) | undefined;
        enq?.([text]);
      });
      if (!res.plan) throw new Error("Plan generation failed — please try again");
      onSetContext({
        current_stage: "plan_display",
        generation_active: false,
        plan: res.plan,
        thread_id: res.thread_id,
        fake_stage_label: "Done",
      });
    } catch (err) {
      onSetContext({ current_stage: "trip_input", generation_active: false });
      alert(`Something went wrong: ${err instanceof Error ? err.message : "please try again"}`);
    }
  }

  function recapLabel(i: number): string {
    if (i === 0) return params.destination;
    if (i === 1) return `${params.start_date} · ${params.duration_days} nights`;
    if (i === 2) {
      const base = groupType ? `${groupType} · ` : "";
      const kids = params.kid_ages.length > 0 ? ` + ${params.kid_ages.length} kid${params.kid_ages.length > 1 ? "s" : ""}` : "";
      return `${base}${params.party_size} adults${kids}`;
    }
    if (i === 3) return params.budget_bracket;
    if (i === 4) return params.trip_style.join(", ") || "—";
    return "";
  }

  const canProceed = step < 5
    ? (step === 0 ? !!params.destination : step === 1 ? !!params.start_date : true)
    : true;

  useEffect(() => {
    if (step === 5 || (step === 2 && params.kid_ages.length > 0)) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [step]);

  useEffect(() => {
    if (step === 2 && params.kid_ages.length > 0) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
  }, [params.kid_ages.length]);

  // Auto-fire generation when arriving from the homepage composer.
  // Switch to "generating" stage immediately so the stepper never flashes.
  useEffect(() => {
    if (!ctx.seed_prompt) return;
    const text = ctx.seed_prompt;
    onSetContext({
      seed_prompt: undefined,
      current_stage: "generating",
      generation_active: true,
      fake_stage_index: 0,
      fake_stage_label: "Understanding your trip...",
    });
    parseIntent(text).then(parsed => {
      if (parsed.destination) onSetContext({ destination: parsed.destination });
      fireGenerate({
        destination:    parsed.destination || "",
        start_date:     parsed.start_date || "",
        duration_days:  parsed.duration_days || 4,
        party_size:     parsed.party_size || 2,
        kid_ages:       parsed.kid_ages || [],
        elderly:        parsed.elderly || false,
        budget_bracket: parsed.budget_bracket || "mid",
        trip_style:     parsed.trip_style || [],
        special_needs:  parsed.special_needs || "",
        traveler_notes: text,
      });
    }).catch(() => {
      onSetContext({ current_stage: "trip_input", generation_active: false });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter") return;
      if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
      if (!canProceed) return;
      if (step < 5) setStep(s => s + 1);
      else handleGenerate();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, canProceed, params]);

  const destImgUrl = getDestinationImageUrl(params.destination);

  return (
    <div className="stepper-grid">

      {/* ── Left column — form ── */}
      <div className="stepper-left">
      {isDemoMode && (
        <div className="demo-banner">
          <span className="tag">Demo</span>
          using a sample Kerala trip — no login needed
        </div>
      )}

      <div className="topbar">
        <div style={{ width: 36 }} />
        <div className="brand-mini">
          <span className="word">trip<i>sathi</i></span>
        </div>
        {ctx.mode === "authenticated" && ctx.auth_user ? (
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
        ) : (
          <div style={{ width: 36 }} />
        )}
      </div>

      {/* Destination band — mobile only */}
      {params.destination && step >= 1 && destImgUrl && (
        <div className="dest-band">
          <img src={destImgUrl} alt={params.destination} />
          <div className="dest-band-overlay" />
          <div className="dest-band-label">{params.destination} ✦</div>
        </div>
      )}

      <div className="cx" style={{ flex: 1, display: "flex", flexDirection: "column" }}>

      <div className="stepper">
        {STEP_LABELS.map((_, i) => (
          <span
            key={i}
            className={`b ${i < step ? "done" : i === step ? "active" : ""}`}
          />
        ))}
      </div>
      <div className="stepper-meta">
        <span>Step {step + 1} of 6</span>
        <span>{step < 4 ? "keep going ✦" : "almost there ✦"}</span>
      </div>

      {step > 0 && step <= 3 && (
        <div className="recap">
          {Array.from({ length: step }).map((_, i) => (
            <div key={i} className="recap-item">
              <span className="ink-stamp">✓</span>
              <span className="label">{STEP_LABELS[i]}</span>
              <span className="val">{recapLabel(i)}</span>
              <span className="edit" onClick={() => setStep(i)}>
                <Pencil size={12} strokeWidth={2.5} />edit
              </span>
            </div>
          ))}
        </div>
      )}
      {step > 3 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "14px 0 0" }}>
          {Array.from({ length: step }).map((_, i) => (
            <span
              key={i}
              onClick={() => setStep(i)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "5px 11px", borderRadius: 999,
                background: "var(--surface)", border: "1.5px solid var(--border)",
                fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 11,
                color: "var(--fg)", cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--fg-3)" }}>{STEP_LABELS[i]}</span>
              <span style={{ color: "var(--accent)" }}>✓</span>
              {recapLabel(i)}
            </span>
          ))}
        </div>
      )}

      <div className="question">
        <div className="q-eyebrow">
          {(() => { const Icon = STEP_ICONS[step]; return <Icon size={13} strokeWidth={2.5} />; })()}
          step {step + 1} · {step === 0 ? "destination" : step === 1 ? "dates" : step === 2 ? "who's coming" : step === 3 ? "budget" : step === 4 ? "trip style" : "anything special?"}
        </div>

        {step === 0 && (
          <>
            <h1>where are<br />you <span className="sw">headed</span>?</h1>
            <div className="hint">↓ type or pick a destination</div>
            <div className="qsec">
              <input
                className="age-input"
                style={{ width: "100%", textAlign: "left", padding: "12px 14px", fontSize: 16, borderRadius: 14 }}
                placeholder="e.g. Kerala, Puri, Guwahati"
                value={params.destination}
                onChange={(e) => patch({ destination: e.target.value })}
                autoFocus
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {["Kerala", "Goa", "Rajasthan", "Manali", "Ladakh", "Andaman"].map(d => (
                  <span
                    key={d}
                    className={`chip ${params.destination === d ? "active" : ""}`}
                    onClick={() => patch({ destination: d })}
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1>when are<br />you <span className="sw">going</span>?</h1>
            <div className="hint">↓ pick dates + duration</div>
            <div className="qsec">
              <div className="qsec-label"><Calendar size={13} strokeWidth={2} />start date</div>
              <div className="chip-row">
                <DatePicker
                  value={params.start_date}
                  onChange={(val) => patch({ start_date: val })}
                  placeholder="tap to pick a date"
                />
              </div>
            </div>
            <div className="qsec">
              <div className="qsec-label"><Calendar size={13} strokeWidth={2} />how many nights?</div>
              <div className="chip-row">
                {[3, 5, 7, 10].map((n) => (
                  <span
                    key={n}
                    className={`chip ${params.duration_days === n ? "active" : ""}`}
                    onClick={() => patch({ duration_days: n })}
                  >
                    {n} nights
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>who's <span className="sw">coming</span><br />with you?</h1>
            <div className="hint">↓ pick one + add ages of any kids</div>
            <div className="qsec">
              <div className="qsec-label"><User size={13} strokeWidth={2} />type of trip</div>
              <div className="chip-row">
                {[
                  { label: "solo", icon: <User size={13} />, size: 1 },
                  { label: "couple", icon: <Heart size={13} />, size: 2 },
                  { label: "family", icon: <Home size={13} />, size: 2 },
                  { label: "friends", icon: <Users size={13} />, size: 4 },
                ].map(({ label, icon, size }) => (
                  <span
                    key={label}
                    className={`chip ${groupType === label ? "active" : ""}`}
                    onClick={() => {
                      setGroupType(label);
                      const isFamily = label === "family";
                      patch({
                        party_size: size,
                        kid_ages: isFamily && params.kid_ages.length === 0 ? [5] : isFamily ? params.kid_ages : [],
                      });
                    }}
                  >
                    {icon}{label}
                  </span>
                ))}
              </div>
            </div>
            <div className="qsec">
              <div className="qsec-label"><User size={13} strokeWidth={2} />adults</div>
              <div className="chip-row">
                <div className="counter">
                  <button onClick={() => patch({ party_size: Math.max(1, params.party_size - 1) })}>−</button>
                  <span className="v">{params.party_size}</span>
                  <button onClick={() => patch({ party_size: params.party_size + 1 })}>+</button>
                </div>
                <span
                  className={`chip ${params.elderly ? "active" : ""}`}
                  onClick={() => patch({ elderly: !params.elderly })}
                >
                  <Ear size={13} />any elderly?
                </span>
              </div>
            </div>
            <div className="qsec">
              <div className="qsec-label"><Baby size={13} strokeWidth={2} />kids</div>
              <div className="chip-row">
                <div className="counter">
                  <button onClick={() => {
                    if (params.kid_ages.length > 0) patch({ kid_ages: params.kid_ages.slice(0, -1) });
                  }}>−</button>
                  <span className="v">{params.kid_ages.length}</span>
                  <button onClick={() => patch({ kid_ages: [...params.kid_ages, 5] })}>+</button>
                </div>
              </div>
              {params.kid_ages.map((age, i) => (
                <div key={i} className="age-row">
                  <span className="age-label">kid {i + 1} age</span>
                  <input
                    type="number"
                    className="age-input"
                    value={age}
                    min={0}
                    max={17}
                    onChange={(e) => {
                      const next = [...params.kid_ages];
                      next[i] = Number(e.target.value);
                      patch({ kid_ages: next });
                    }}
                  />
                  <span className="age-label" style={{ color: "var(--fg-3)" }}>years old ✦</span>
                </div>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1>what's your<br /><span className="sw">budget</span>?</h1>
            <div className="hint">↓ rough range for the trip</div>
            <div className="qsec">
              <div className="chip-row">
                {[
                  { value: "budget", label: "budget", sub: "₹30–50k" },
                  { value: "mid", label: "mid-range", sub: "₹50k–1.5L" },
                  { value: "premium", label: "premium", sub: "₹1.5L+" },
                ].map(({ value, label, sub }) => (
                  <span
                    key={value}
                    className={`chip ${params.budget_bracket === value ? "active" : ""}`}
                    onClick={() => patch({ budget_bracket: value as TripParameters["budget_bracket"] })}
                  >
                    {label}
                    <span style={{ fontSize: 10, opacity: 0.7 }}>{sub}</span>
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1>what kind of<br /><span className="sw">trip</span> is this?</h1>
            <div className="hint">↓ pick all that fit</div>
            <div className="qsec">
              <div className="chip-row">
                {["nature", "culture", "adventure", "relaxation", "food", "religious", "beaches", "hills"].map((s) => (
                  <span
                    key={s}
                    className={`chip ${params.trip_style.includes(s) ? "active" : ""}`}
                    onClick={() => toggleStyle(s)}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <h1>anything<br /><span className="sw">special</span><br />to know?</h1>
            <div className="hint">↓ optional — accessibility, diet, pace</div>
            <div className="qsec">
              <textarea
                style={{
                  width: "100%", border: "1.5px dashed var(--border-strong)", borderRadius: 14,
                  padding: "12px 14px", background: "var(--paper)", fontFamily: "var(--font-body)",
                  fontWeight: 600, fontSize: 14, color: "var(--fg)", resize: "none", outline: "none",
                  marginTop: 10,
                }}
                rows={3}
                placeholder="e.g. wheelchair-friendly routes, vegetarian meals, slow pace for elderly..."
                value={params.special_needs}
                onChange={(e) => patch({ special_needs: e.target.value })}
              />
            </div>
          </>
        )}
      </div>

      <div className="bottom-bar">
        <div className="inner">
          {step > 0 ? (
            <span className="back-link" onClick={() => setStep((s) => s - 1)}>← back</span>
          ) : (
            <span />
          )}
          {step < 5 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {canProceed && <span style={{ fontSize: 10, color: "var(--fg-3)", letterSpacing: "0.02em" }}>↵ enter</span>}
              <button
                className="cta-primary"
                disabled={!canProceed}
                onClick={() => setStep((s) => s + 1)}
              >
                next <ArrowRight size={15} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button className="cta-primary" onClick={handleGenerate}>
              sketch my plan <ArrowRight size={15} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      <div className="stepper-spacer" style={{ height: 180 }} />
      </div>
      </div>

      {/* ── Right column — destination panel (tablet+) ── */}
      <div className="stepper-dest-panel">
        {destImgUrl && step >= 1 ? (
          <>
            <img src={destImgUrl} alt={params.destination} />
            <div className="stepper-dest-overlay" />
            <div className="stepper-dest-label">
              <h2>{params.destination} ✦</h2>
              <span className="dest-sub">your trip awaits</span>
            </div>
          </>
        ) : (
          <div className="stepper-dest-placeholder">
            <span>where are<br />you headed? ✦</span>
          </div>
        )}
      </div>

    </div>
  );
}
