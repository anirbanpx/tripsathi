import { useState } from "react";
import {
  MapPin, Calendar, Users, Wallet, Sparkles, Accessibility,
  Home, Heart, User, Baby, Ear, ArrowRight, Pencil,
} from "lucide-react";
import { generatePlan } from "../../services/api";
import { startFakeProgress } from "../../lib/fakeProgress";
import type { UserContext, TripParameters } from "../../types";

const DEMO_PARAMS: TripParameters = {
  destination: "Kerala",
  start_date: "2026-06-10",
  duration_days: 5,
  party_size: 2,
  kid_ages: [5],
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

export default function TripInputStepper({ ctx, onSetContext }: Props) {
  const [step, setStep] = useState(ctx.mode === "demo" ? 2 : 0);
  const [params, setParams] = useState<TripParameters>(
    ctx.mode === "demo" ? DEMO_PARAMS : {
      destination: "",
      start_date: "",
      duration_days: 5,
      party_size: 2,
      kid_ages: [],
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

  async function handleGenerate() {
    const handle = startFakeProgress(
      (index, label) => onSetContext({ fake_stage_index: index, fake_stage_label: label }),
      () => {}
    );
    onSetContext({ current_stage: "generating", generation_active: true, kid_ages: params.kid_ages });
    try {
      const res = await generatePlan(params);
      handle.stop();
      onSetContext({
        current_stage: "plan_display",
        generation_active: false,
        plan: res.plan,
        thread_id: res.thread_id,
        fake_stage_label: "Done",
      });
    } catch {
      handle.stop();
      onSetContext({ current_stage: "trip_input", generation_active: false });
    }
  }

  function recapLabel(i: number): string {
    if (i === 0) return params.destination;
    if (i === 1) return `${params.start_date} · ${params.duration_days} nights`;
    if (i === 2) {
      const kids = params.kid_ages.length > 0 ? ` + ${params.kid_ages.length} (${params.kid_ages.join(", ")}y)` : "";
      return `${params.party_size} adults${kids}`;
    }
    if (i === 3) return params.budget_bracket;
    if (i === 4) return params.trip_style.join(", ") || "—";
    return "";
  }

  const canProceed = step < 5
    ? (step === 0 ? !!params.destination : step === 1 ? !!params.start_date : true)
    : true;

  return (
    <div className="screen" style={{ minHeight: "unset" }}>
      {ctx.mode === "demo" && (
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
        <div style={{ width: 36 }} />
      </div>

      {/* Stepper bar */}
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

      {/* Recap of completed steps */}
      {step > 0 && (
        <div className="recap">
          {Array.from({ length: step }).map((_, i) => (
            <div key={i} className="recap-item">
              <span className="label">{STEP_LABELS[i]}</span>
              <span className="val">{recapLabel(i)}</span>
              <span className="edit" onClick={() => setStep(i)}>
                <Pencil size={12} strokeWidth={2.5} />edit
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Current question */}
      <div className="question">
        <div className="q-eyebrow">
          {(() => { const Icon = STEP_ICONS[step]; return <Icon size={13} strokeWidth={2.5} />; })()}
          step {step + 1} · {step === 0 ? "destination" : step === 1 ? "dates" : step === 2 ? "who's coming" : step === 3 ? "budget" : step === 4 ? "trip style" : "anything special?"}
        </div>

        {step === 0 && (
          <>
            <h1>where are<br />you <span className="sw">headed</span>?</h1>
            <div className="hint">↓ type a destination</div>
            <div className="qsec">
              <input
                className="age-input"
                style={{ width: "100%", textAlign: "left", padding: "12px 14px", fontSize: 16, borderRadius: 14 }}
                placeholder="e.g. Kerala, Puri, Guwahati"
                value={params.destination}
                onChange={(e) => patch({ destination: e.target.value })}
                autoFocus
              />
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
                <input
                  type="date"
                  className="age-input"
                  style={{ width: "auto", padding: "10px 12px" }}
                  value={params.start_date}
                  onChange={(e) => patch({ start_date: e.target.value })}
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
                  { label: "solo", icon: <User size={13} /> },
                  { label: "couple", icon: <Heart size={13} /> },
                  { label: "family", icon: <Home size={13} /> },
                  { label: "friends", icon: <Users size={13} /> },
                ].map(({ label, icon }) => (
                  <span
                    key={label}
                    className={`chip ${params.trip_style.includes(label) || (label === "family" && params.kid_ages.length > 0) ? "active" : ""}`}
                    onClick={() => {
                      if (label === "family") {
                        if (params.kid_ages.length === 0) patch({ kid_ages: [5] });
                      }
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
                <span className="chip"><Ear size={13} />any elderly?</span>
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

      {/* Sticky bottom */}
      <div className="bottom-bar">
        <div className="inner">
          {step > 0 ? (
            <span className="back-link" onClick={() => setStep((s) => s - 1)}>← back</span>
          ) : (
            <span />
          )}
          {step < 5 ? (
            <button
              className="cta-primary"
              disabled={!canProceed}
              onClick={() => setStep((s) => s + 1)}
            >
              next <ArrowRight size={15} strokeWidth={2.5} />
            </button>
          ) : (
            <button className="cta-primary" onClick={handleGenerate}>
              sketch my plan <ArrowRight size={15} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {/* Spacer so content isn't hidden behind sticky bar */}
      <div style={{ height: 90 }} />
    </div>
  );
}
