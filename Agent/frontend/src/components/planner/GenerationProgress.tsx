import { useEffect, useState } from "react";
import { Check, Clock, MapPin } from "lucide-react";
import { PROGRESS_STAGES } from "../../lib/fakeProgress";
import { getDestinationImageUrl } from "../../lib/destinationImage";

interface Props {
  stageIndex: number;
  stageLabel: string; // reserved for Sprint 3 SSE
  destination?: string;
}

const STAGE_TIMES = ["4s", "12s", "6s", "~25s", "8s"];

export default function GenerationProgress({ stageIndex, stageLabel: _stageLabel, destination = "" }: Props) {
  const [showLongWait, setShowLongWait] = useState(false);
  const imgUrl = getDestinationImageUrl(destination);

  useEffect(() => {
    const t = setTimeout(() => setShowLongWait(true), 60000);
    return () => clearTimeout(t);
  }, []);

  const stageList = (
    <>
      <div className="stage-head">
        <h1>sketching your<br /><span className="sw">plan</span></h1>
        <div className="now">
          <span className="spinner" />
          {PROGRESS_STAGES[stageIndex]?.label ?? "finalising..."}
        </div>
      </div>
      <div className="stages">
        {PROGRESS_STAGES.map((stage, i) => (
          <div key={stage.label} className={`stage-row ${i < stageIndex ? "done" : i === stageIndex ? "current" : "todo"}`}>
            <span className="dot">{i < stageIndex && <Check size={11} strokeWidth={3} />}</span>
            <span className="name">{stage.label}</span>
            <span className="time">{STAGE_TIMES[i]}</span>
          </div>
        ))}
      </div>
      <div className="eta">
        <Clock size={14} strokeWidth={2} />
        <span>typical plans take <b>about a minute</b> — yours is going well.</span>
      </div>
      {showLongWait && <div className="scribble-note">↑ {destination || "kerala"} is a long one, hold tight ✦</div>}
    </>
  );

  // ── Full-bleed layout when destination image is available ──────────
  if (imgUrl) {
    return (
      <div style={{ width: "100%", height: "100svh", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Background image */}
        <img src={imgUrl} alt={destination} style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", objectPosition: "center",
          animation: "fadeIn 0.8s ease",
        }} />
        {/* Gradient: dark top for topbar → transparent middle → paper at bottom for sheet */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(62,47,35,0.55) 0%, rgba(62,47,35,0.05) 38%, rgba(244,236,219,0.88) 68%, var(--paper) 84%)",
        }} />

        {/* Topbar on image — paper text */}
        <div className="topbar centered" style={{ position: "relative", zIndex: 1 }}>
          <div className="brand-mini">
            <span className="word" style={{ color: "var(--paper)" }}>trip<i style={{ color: "rgba(255,195,100,0.95)" }}>sathi</i></span>
          </div>
        </div>

        {/* Route animation centered over the image */}
        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "relative", width: "72%", maxWidth: 270 }}>
            <svg viewBox="0 0 300 180" style={{ width: "100%", height: "auto", display: "block" }} preserveAspectRatio="xMidYMid meet">
              <path d="M 70 36 Q 110 60, 150 70 T 230 70" stroke="rgba(244,236,219,0.65)" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="4 5" />
              <path d="M 150 70 Q 130 100, 115 115" stroke="rgba(244,236,219,0.65)" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="4 5" />
              <path d="M 115 115 Q 160 130, 210 140" stroke="rgba(255,170,80,0.9)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeDasharray="3 5">
                <animate attributeName="stroke-dashoffset" from="0" to="-32" dur="1.6s" repeatCount="indefinite" />
              </path>
            </svg>
            {[0, 1].map((i) => (
              <div key={i} className={`pin p${i + 1}`}><Check size={11} strokeWidth={3} /></div>
            ))}
            <div className="pin p3"><MapPin size={9} strokeWidth={3} /></div>
            <div className="pin p4" />
          </div>
          {destination && (
            <div style={{
              position: "absolute", bottom: "6%", right: "10%",
              fontFamily: "var(--font-display)", fontSize: 18,
              color: "var(--paper)", letterSpacing: "0.01em",
              textShadow: "0 2px 10px rgba(62,47,35,0.5)",
            }}>
              {destination} ✦
            </div>
          )}
        </div>

        {/* Bottom sheet slides up */}
        <div className="progress-sheet">
          <div className="cx" style={{ padding: 0 }}>
            {stageList}
          </div>
        </div>
      </div>
    );
  }

  // ── Fallback card layout (no image) ───────────────────────────────
  return (
    <div className="screen" style={{ minHeight: "unset" }}>
      <div className="topbar centered">
        <div className="brand-mini">
          <span className="word">trip<i>sathi</i></span>
        </div>
      </div>
      <div className="stage" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "30px 0" }}>
        <div className="cx" style={{ width: "100%" }}>
          <div className="progress-card" style={{ width: "100%" }}>
            <div className="doodle-area">
              <svg className="scribble" viewBox="0 0 300 180" preserveAspectRatio="none">
                <path d="M 70 36 Q 110 60, 150 70 T 230 70" stroke="#3E2F23" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="4 5" />
                <path d="M 150 70 Q 130 100, 115 115" stroke="#3E2F23" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="4 5" />
                <path d="M 115 115 Q 160 130, 210 140" stroke="#B0492F" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeDasharray="3 5">
                  <animate attributeName="stroke-dashoffset" from="0" to="-32" dur="1.6s" repeatCount="indefinite" />
                </path>
              </svg>
              {[0, 1].map((i) => (
                <div key={i} className={`pin p${i + 1}`}><Check size={11} strokeWidth={3} /></div>
              ))}
              <div className="pin p3"><MapPin size={9} strokeWidth={3} /></div>
              <div className="pin p4" />
            </div>
            {stageList}
          </div>
        </div>
      </div>
    </div>
  );
}
