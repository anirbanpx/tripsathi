import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Globe, ShieldCheck, Lock, Mic, Loader2 } from "lucide-react";
import IndiaDestinationsMap from "../components/explore/IndiaDestinationsMap";
import GoogleSignInButton from "../components/auth/GoogleSignInButton";
import AuthNav from "../components/auth/AuthNav";
import { getDestinationImageUrl } from "../lib/destinationImage";
import { getSeasonalCards, getSeasonalChips, COMPOSER_PLACEHOLDER, COMPOSER_HELPER } from "../lib/examplePrompts";
import type { TripParameters } from "../types";
import {
  DoodleTell, DoodlePlan, DoodleBook,
  MountainRule,
} from "../components/planner/TravelIllustrations";
import type { UserContext } from "../types";
import { googleSignIn, getTasteProfile, transcribeAudio } from "../services/api";
import { setAuthState } from "../lib/auth";

interface Props {
  ctx: UserContext;
  onSetContext: (patch: Partial<UserContext>) => void;
}

const SEASON_LABEL: Record<string, string> = {
  summer: "summer escapes · Apr – Jun",
  monsoon: "monsoon picks · Jul – Sep",
  winter: "winter favourites · Oct – Mar",
};

function getCurrentSeasonLabel(): string {
  const m = new Date().getMonth() + 1;
  if (m >= 4 && m <= 6) return SEASON_LABEL.summer;
  if (m >= 7 && m <= 9) return SEASON_LABEL.monsoon;
  return SEASON_LABEL.winter;
}

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "good morning";
  if (h >= 12 && h < 17) return "good afternoon";
  return "good evening";
}

export default function DemoEntryPage({ ctx, onSetContext }: Props) {
  const navigate = useNavigate();
  const [composerText, setComposerText] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [micState, setMicState] = useState<"idle" | "recording" | "transcribing">("idle");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function toggleMic() {
    if (micState === "idle") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        chunksRef.current = [];
        rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        rec.onstop = async () => {
          setMicState("transcribing");
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          stream.getTracks().forEach(t => t.stop());
          try {
            const text = await transcribeAudio(blob);
            if (text) setComposerText(prev => prev ? `${prev} ${text}` : text);
          } catch { /* silent */ }
          setMicState("idle");
        };
        rec.start();
        mediaRef.current = rec;
        setMicState("recording");
      } catch { setMicState("idle"); }
    } else if (micState === "recording") {
      mediaRef.current?.stop();
    }
  }

  const isAuth = ctx.mode === "authenticated";
  const firstName = ctx.auth_user?.name?.split(" ")[0] ?? null;
  const [topInterest, setTopInterest] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuth || !ctx.user_id) return;
    getTasteProfile(ctx.user_id).then((profile) => {
      if (!profile) return;
      const interests = (profile.interests as Record<string, number>) ?? {};
      const top = Object.entries(interests)
        .filter(([, v]) => v >= 0.65)
        .sort((a, b) => b[1] - a[1])[0];
      if (top) setTopInterest(top[0]);
    }).catch(() => {});
  }, [isAuth, ctx.user_id]);

  function handleComposerSubmit() {
    const text = composerText.trim();
    if (!text) return;
    onSetContext({
      mode: isAuth ? "authenticated" : "demo",
      seed_prompt: text,
      current_stage: "trip_input",
    });
    navigate("/planner");
  }

  function handleChipPlan(params: TripParameters) {
    onSetContext({
      mode: isAuth ? "authenticated" : "demo",
      seed_params: params,
      current_stage: "trip_input",
    });
    navigate("/planner");
  }

  async function handleGoogleToken(credential: string) {
    setSigningIn(true);
    try {
      const data = await googleSignIn(credential);
      setAuthState(data);
      const seen = !!localStorage.getItem(`tripsathi_onboarded_${data.user.user_id}`);
      onSetContext({
        mode: "authenticated",
        user_id: data.user.user_id,
        auth_user: data.user,
        current_stage: seen ? "entry" : "onboarding",
      });
      navigate(seen ? "/planner" : "/onboarding");
    } catch (e) {
      console.error("Google sign-in failed:", e);
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className="entry-screen" style={{ padding: 0 }}>

      {/* ── Above-fold hero ── */}
      <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column" }}>
        <div className="cx" style={{ flex: 1, display: "flex", flexDirection: "column" }}>

          {/* Topbar */}
          <div className="topbar entry">
            <div className="brand">
              <span className="word">trip<i>sathi</i></span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isAuth && ctx.auth_user ? (
                <AuthNav user={ctx.auth_user} onSetContext={onSetContext} />
              ) : (
                <button className="lang-btn">
                  <Globe size={12} strokeWidth={2} />
                  EN · हिं
                </button>
              )}
            </div>
          </div>

          {/* Hero grid */}
          <div className="entry-grid">

            {/* Left — headline + live composer */}
            <div className="entry-left">
              <div className="hero">
                <div className="hero-eyebrow">Travel AI · for India</div>
                {firstName ? (
                  <h1>{getTimeGreeting()}, {firstName} — <span className="sw">where to? ✦</span></h1>
                ) : (
                  <h1>ooh, where are we <span className="sw">off to? ✦</span></h1>
                )}
                <div className="sathi-note">↑ namaste, i'm sathi — tell me anything</div>
              </div>

              {/* Composer */}
              <div style={{ marginTop: 20 }}>
                <div className="journal-page">
                  <div className="journal-page-header">
                    <span className="journal-title">your trip ✦</span>
                    <span className="journal-badge">open journal</span>
                  </div>
                  <textarea
                    className="journal-textarea"
                    placeholder={COMPOSER_PLACEHOLDER}
                    value={composerText}
                    onChange={e => setComposerText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleComposerSubmit();
                      }
                    }}
                    rows={4}
                  />
                  <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, paddingBottom: 4 }}>
                    <button
                      type="button"
                      onClick={toggleMic}
                      disabled={micState === "transcribing"}
                      title={micState === "recording" ? "Stop recording" : micState === "transcribing" ? "Transcribing..." : "Voice input"}
                      style={{
                        background: micState === "recording" ? "rgba(176,73,47,0.12)" : "var(--surface)",
                        border: `1.5px solid ${micState === "recording" ? "var(--accent)" : "var(--border-strong)"}`,
                        borderRadius: "50%", width: 44, height: 44,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: micState === "transcribing" ? "not-allowed" : "pointer",
                        opacity: micState === "transcribing" ? 0.5 : 1,
                        color: micState === "recording" ? "var(--accent)" : "var(--fg-2)",
                        boxShadow: micState === "recording" ? "0 0 0 5px rgba(176,73,47,0.15)" : "0 2px 8px rgba(0,0,0,0.08)",
                        transition: "all 0.2s",
                      }}
                    >
                      {micState === "transcribing"
                        ? <Loader2 size={18} strokeWidth={2.5} style={{ animation: "spin 1s linear infinite" }} />
                        : <Mic size={18} strokeWidth={2} />}
                    </button>
                  </div>
                </div>
                <div style={{
                  fontSize: 12, color: "var(--fg-3)", fontFamily: "var(--font-body)",
                  fontWeight: 600, marginTop: 7, paddingLeft: 2,
                }}>
                  {COMPOSER_HELPER}
                </div>

                {/* Seasonal chips — cross-season teasers, instant fast-path */}
                {!composerText && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {getSeasonalChips().map((spec) => (
                      <span
                        key={spec.destination}
                        className="chip"
                        onClick={() => handleChipPlan(spec.params)}
                        style={{ fontSize: 11, cursor: "pointer" }}
                        title="Tap to instantly plan this trip"
                      >
                        {spec.chipLabel}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* CTAs */}
              <div className="entry-ctas" style={{ marginTop: 18 }}>
                <button
                  className="entry-cta-primary"
                  disabled={!composerText.trim()}
                  onClick={handleComposerSubmit}
                  style={{ opacity: composerText.trim() ? 1 : 0.5 }}
                >
                  <div className="cta-stack">
                    <span>sketch my plan</span>
                    <span className="sub">no card · no login · plan in ~30s</span>
                  </div>
                  <ArrowRight size={16} strokeWidth={2.5} />
                </button>

                {!isAuth && (
                  <GoogleSignInButton onToken={handleGoogleToken} loading={signingIn} />
                )}
                {isAuth && ctx.auth_user && (
                  <button className="entry-cta-secondary" onClick={() => navigate("/planner")}>
                    <ArrowRight size={16} strokeWidth={2} />
                    Plan your next trip
                  </button>
                )}
              </div>

              <div className="entry-trust">
                <ShieldCheck size={13} strokeWidth={1.75} />
                <span>no spam</span>
                <span className="dot" />
                <Lock size={13} strokeWidth={1.75} />
                <span>your data stays yours</span>
              </div>

              <div className="footer-note">made for Indian trips, in India ✦</div>
            </div>

            {/* Right — seasonal destination cards (fast-path) */}
            <div className="entry-right" style={{ alignItems: "start" }}>
              <div style={{ width: "100%" }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.16em",
                  textTransform: "uppercase", color: "var(--fg-3)", marginBottom: 10,
                  display: "flex", alignItems: "baseline", gap: 8,
                }}>
                  {getCurrentSeasonLabel()}
                  {isAuth && topInterest && (
                    <span style={{ fontFamily: "var(--font-script)", fontSize: 14, color: "var(--secondary)", textTransform: "none", letterSpacing: 0 }}>
                      because you like {topInterest} ✦
                    </span>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                  {getSeasonalCards().map((spec, i) => {
                    const img = getDestinationImageUrl(spec.slug);
                    const nights = spec.params.duration_days - 1;
                    const tags = [
                      `${nights}N`,
                      spec.params.budget_bracket,
                      spec.params.trip_style[0],
                    ];
                    return (
                      <div
                        key={spec.destination}
                        className={`dest-shelf-card${i >= 6 ? " dest-shelf-card-extra" : ""}`}
                        onClick={() => handleChipPlan(spec.params)}
                        title={`Instant plan: ${spec.destination}`}
                        style={{ width: "100%", height: 96, cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s" }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLDivElement).style.transform = "scale(1.03)";
                          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 24px rgba(62,47,35,0.28)";
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLDivElement).style.transform = "scale(1)";
                          (e.currentTarget as HTMLDivElement).style.boxShadow = "";
                        }}
                      >
                        {img && (
                          <img src={img} alt={spec.destination}
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        )}
                        {/* ⚡ badge */}
                        <div style={{
                          position: "absolute", top: 5, right: 5,
                          background: "rgba(26,17,8,0.72)", backdropFilter: "blur(4px)",
                          borderRadius: 4, padding: "2px 5px",
                          fontSize: 8, fontWeight: 800, letterSpacing: "0.06em",
                          color: "#F4ECDB", fontFamily: "var(--font-body)",
                        }}>
                          ⚡ instant
                        </div>
                        <div className="dest-shelf-overlay" />
                        <div className="dest-shelf-content">
                          <div className="dest-shelf-name">{spec.destination}</div>
                          <div className="dest-shelf-hook">{spec.hook}</div>
                          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                            {tags.map(t => (
                              <span key={t} style={{
                                fontSize: 8, fontWeight: 700, letterSpacing: "0.04em",
                                background: "rgba(255,255,255,0.18)", borderRadius: 3,
                                padding: "1px 4px", color: "rgba(244,236,219,0.9)",
                                fontFamily: "var(--font-body)",
                              }}>{t}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{
                  fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-body)",
                  fontWeight: 600, marginTop: 8,
                }}>
                  ⚡ tap any card — instant plan, no wait
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Scroll cue */}
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 0 22px" }}>
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 10,
            letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--fg-3)",
            animation: "bounce-cue 1.8s ease-in-out infinite",
          }}>
            <span>how it works</span>
            <span style={{ fontSize: 16 }}>↓</span>
          </div>
        </div>
      </div>

      {/* ── How it works strip ── */}
      <div className="cx" style={{ paddingTop: 36, paddingBottom: 36 }}>
        <div className="how-it-works">
          {([
            {
              Doodle: DoodleTell,
              label: "1 · tell me",
              desc: "type your trip in plain words — destination, dates, who's coming, budget",
            },
            {
              Doodle: DoodlePlan,
              label: "2 · i plan it",
              desc: "i research, build a day-by-day arc, and pick hotels that actually fit you",
            },
            {
              Doodle: DoodleBook,
              label: "3 · you book",
              desc: "get a full plan you can refine and actually book — nothing fake or generic",
            },
          ] as const).map(({ Doodle, label, desc }) => (
            <div key={label} className="how-it-works-step">
              <Doodle size={52} />
              <div className="q-eyebrow" style={{ marginTop: 10, justifyContent: "center" }}>
                {label}
              </div>
              <p style={{
                fontSize: 13, color: "var(--fg-2)", lineHeight: 1.55,
                margin: "6px 0 0",
              }}>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="cx"><MountainRule /></div>

      {/* ── Map section ── */}
      <div className="cx" style={{ paddingTop: 28, paddingBottom: 30 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
          color: "var(--fg-3)", marginBottom: 12,
        }}>
          Explore India · 50+ destinations
        </div>
        <IndiaDestinationsMap isAuthenticated={isAuth} />
      </div>

    </div>
  );
}
