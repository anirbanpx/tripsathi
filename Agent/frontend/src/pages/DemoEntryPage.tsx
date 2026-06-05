import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Globe, ShieldCheck, Lock } from "lucide-react";
import IndiaDestinationsMap from "../components/explore/IndiaDestinationsMap";
import GoogleSignInButton from "../components/auth/GoogleSignInButton";
import AuthNav from "../components/auth/AuthNav";
import { getDestinationImageUrl } from "../lib/destinationImage";
import { EXAMPLE_PROMPTS, COMPOSER_PLACEHOLDER, COMPOSER_HELPER } from "../lib/examplePrompts";
import {
  HeroScene, DoodleTell, DoodlePlan, DoodleBook,
  MountainRule, DottedPathRule,
} from "../components/planner/TravelIllustrations";
import type { UserContext } from "../types";
import { googleSignIn, getTasteProfile } from "../services/api";
import { setAuthState } from "../lib/auth";

interface Props {
  ctx: UserContext;
  onSetContext: (patch: Partial<UserContext>) => void;
}

const CURATED_DESTINATIONS = [
  { slug: "kerala",     name: "Kerala",     hook: "backwaters, spice trails & hill mist" },
  { slug: "goa",        name: "Goa",        hook: "beaches, forts & afternoon sunsets" },
  { slug: "jaipur",     name: "Jaipur",     hook: "pink city, palaces & desert edge" },
  { slug: "udaipur",    name: "Udaipur",    hook: "lake palaces & Rajput romance" },
  { slug: "manali",     name: "Manali",     hook: "snow peaks, treks & riverside calm" },
  { slug: "leh",        name: "Ladakh",     hook: "high roads & big, starlit skies" },
  { slug: "varanasi",   name: "Varanasi",   hook: "ancient ghats & dawn on the Ganga" },
  { slug: "andaman",    name: "Andamans",   hook: "turquoise water & world-class beaches" },
  { slug: "darjeeling", name: "Darjeeling", hook: "tea estates & Himalayan horizons" },
  { slug: "hampi",      name: "Hampi",      hook: "boulder ruins & Vijayanagara grandeur" },
];

export default function DemoEntryPage({ ctx, onSetContext }: Props) {
  const navigate = useNavigate();
  const [composerText, setComposerText] = useState("");
  const [signingIn, setSigningIn] = useState(false);

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

  function handleDemo() {
    onSetContext({ mode: "demo", current_stage: "trip_input" });
    navigate("/planner");
  }

  async function handleGoogleToken(credential: string) {
    setSigningIn(true);
    try {
      const data = await googleSignIn(credential);
      setAuthState(data);
      onSetContext({
        mode: "authenticated",
        user_id: data.user.user_id,
        auth_user: data.user,
        current_stage: "onboarding",
      });
      navigate("/onboarding");
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
                  <h1>hey {firstName},<br />where are<br /><span className="sw">we headed?</span></h1>
                ) : (
                  <h1>ooh, where<br />are we<br /><span className="sw">off to? ✦</span></h1>
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
                    rows={3}
                  />
                </div>
                <div style={{
                  fontSize: 12, color: "var(--fg-3)", fontFamily: "var(--font-body)",
                  fontWeight: 600, marginTop: 7, paddingLeft: 2,
                }}>
                  {COMPOSER_HELPER}
                </div>

                {/* Example chips — only shown when composer is empty */}
                {!composerText && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {EXAMPLE_PROMPTS.map(s => (
                      <span
                        key={s}
                        className="chip"
                        onClick={() => setComposerText(s)}
                        style={{ fontSize: 11, cursor: "pointer" }}
                      >
                        {s}
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

                <button className="entry-cta-secondary" onClick={handleDemo}>
                  <span style={{ fontSize: 12, letterSpacing: "0.04em" }}>
                    or try the Kerala sample →
                  </span>
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

            {/* Right — illustrated hero scene */}
            <div className="entry-right">
              <div style={{ width: "100%", maxWidth: 420 }}>
                <HeroScene />
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

      {/* ── Destination shelf ── */}
      <div className="cx" style={{ paddingTop: 28, paddingBottom: 10 }}>
        <div style={{
          display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
            textTransform: "uppercase", color: "var(--fg-3)",
          }}>
            Popular destinations
          </div>
          {isAuth && (
            <div style={{
              fontFamily: "var(--font-script)", fontSize: 15, color: "var(--secondary)",
            }}>
              {topInterest ? `because you like ${topInterest} ✦` : "tailored for you ✦"}
            </div>
          )}
        </div>

        <div className="dest-shelf">
          {CURATED_DESTINATIONS.map(({ slug, name, hook }) => {
            const img = getDestinationImageUrl(slug);
            return (
              <div
                key={slug}
                className="dest-shelf-card"
                onClick={() => setComposerText(`${name} trip`)}
                title={`Start a ${name} plan`}
              >
                {img && (
                  <img
                    src={img}
                    alt={name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                )}
                <div className="dest-shelf-overlay" />
                <div className="dest-shelf-content">
                  <div className="dest-shelf-name">{name}</div>
                  <div className="dest-shelf-hook">{hook}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-body)",
          fontWeight: 600, marginBottom: 24,
        }}>
          ↑ tap any destination to start a plan
        </div>
      </div>

      <div className="cx"><DottedPathRule /></div>

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
