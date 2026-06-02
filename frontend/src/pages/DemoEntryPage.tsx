import { useNavigate } from "react-router-dom";
import { ArrowRight, MessageCircle, Globe, ShieldCheck, Lock } from "lucide-react";
import IndiaDestinationsMap from "../components/explore/IndiaDestinationsMap";
import { getDestinationImageUrl } from "../lib/destinationImage";
import type { UserContext } from "../types";

interface Props {
  onSetContext: (patch: Partial<UserContext>) => void;
}

export default function DemoEntryPage({ onSetContext }: Props) {
  const navigate = useNavigate();

  function handleDemo() {
    onSetContext({ mode: "demo", current_stage: "trip_input" });
    navigate("/planner");
  }

  function handleSignIn() {
    onSetContext({ mode: "authenticated", current_stage: "trip_input" });
    navigate("/planner");
  }

  return (
    <div className="entry-screen" style={{ padding: 0 }}>

      {/* Above-fold hero — always fills exactly one viewport */}
      <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column" }}>
        <div className="cx" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div className="topbar entry">
            <div className="brand">
              <span className="word">trip<i>sathi</i></span>
            </div>
            <button className="lang-btn">
              <Globe size={12} strokeWidth={2} />
              EN · हिं
            </button>
          </div>

          <div className="entry-grid">
            <div className="entry-left">
              <div className="hero">
                <div className="hero-eyebrow">Travel AI · for India</div>
                <h1>plan Indian<br />trips, the<br /><span className="sw">kind way</span>.</h1>
                <p className="lede">
                  tell me where, when, and who's coming. i'll sketch a real plan you can actually book — hotels, days, the lot.
                </p>
                <div className="sathi-note">↑ namaste, i'm sathi ✦</div>
              </div>

              <div className="entry-ctas">
                <button className="entry-cta-primary" onClick={handleDemo}>
                  <div className="cta-stack">
                    <span>Try the demo</span>
                    <span className="sub">SAMPLE KERALA TRIP · NO LOGIN</span>
                  </div>
                  <ArrowRight size={16} strokeWidth={2.5} />
                </button>
                <button className="entry-cta-secondary" onClick={handleSignIn}>
                  <MessageCircle size={16} strokeWidth={2} />
                  Sign in to plan your own
                </button>
              </div>

              <div className="entry-trust">
                <ShieldCheck size={13} strokeWidth={1.75} />
                <span>no spam</span>
                <span className="dot" />
                <Lock size={13} strokeWidth={1.75} />
                <span>your numbers stay yours</span>
              </div>

              <div className="footer-note">made for Indian trips, in India ✦</div>
            </div>

            <div className="entry-right">
              <div className="polaroid">
                <div className="postcard-stamp">INDIA</div>
                <div className="photo" style={{ padding: 0, overflow: "hidden", background: "none", border: "none" }}>
                  <img
                    src={getDestinationImageUrl("kerala") ?? ""}
                    alt="Kerala backwaters"
                    style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block", borderRadius: 4 }}
                  />
                </div>
                <div className="caption">Kerala backwaters ✦</div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll cue — anchored at the bottom of the viewport */}
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 0 22px" }}>
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 10,
            letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--fg-3)",
            animation: "bounce-cue 1.8s ease-in-out infinite",
          }}>
            <span>explore destinations</span>
            <span style={{ fontSize: 16 }}>↓</span>
          </div>
        </div>
      </div>

      {/* Below-fold map section */}
      <div className="cx" style={{ paddingTop: 28, paddingBottom: 30 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
          color: "var(--fg-3)", marginBottom: 12,
        }}>
          Explore India · 50+ destinations
        </div>
        <IndiaDestinationsMap />
      </div>

    </div>
  );
}
