import { useNavigate } from "react-router-dom";
import { ArrowRight, MessageCircle, Globe, ShieldCheck, Lock } from "lucide-react";
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
    <div className="entry-screen">
      <div className="topbar entry">
        <div className="brand">
          <span className="word">trip<i>sathi</i></span>
        </div>
        <button className="lang-btn">
          <Globe size={12} strokeWidth={2} />
          EN · हिं
        </button>
      </div>

      <div className="hero">
        <div className="hero-eyebrow">Travel AI · for India</div>
        <h1>plan Indian<br />trips, the<br /><span className="sw">kind way</span>.</h1>
        <p className="lede">
          tell me where, when, and who's coming. i'll sketch a real plan you can actually book — hotels, days, the lot.
        </p>
        <div className="sathi-note">↑ namaste, i'm sathi ✦</div>
      </div>

      <div className="polaroid">
        <div className="photo">
          <div className="sun" />
          <div className="silhouette" />
          <div className="boat" />
          <div className="water" />
        </div>
        <div className="caption">Kerala backwaters ✦</div>
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
  );
}
