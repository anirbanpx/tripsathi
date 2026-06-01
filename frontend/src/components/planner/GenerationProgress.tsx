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
          {/* Doodle area — destination photo backdrop when available */}
          <div className="doodle-area" style={{ position: "relative", overflow: "hidden" }}>
            {imgUrl && (
              <>
                <img
                  src={imgUrl}
                  alt={destination}
                  style={{
                    position: "absolute", inset: 0,
                    width: "100%", height: "100%", objectFit: "cover", objectPosition: "center",
                    opacity: 0.55,
                    animation: "fadeIn 1s ease",
                  }}
                />
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(to bottom, rgba(244,236,219,0.15) 0%, rgba(244,236,219,0.7) 100%)",
                }} />
              </>
            )}
            <svg className="scribble" viewBox="0 0 300 180" preserveAspectRatio="none" style={{ position: "relative" }}>
              <path d="M 70 36 Q 110 60, 150 70 T 230 70" stroke="#3E2F23" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="4 5" />
              <path d="M 150 70 Q 130 100, 115 115" stroke="#3E2F23" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="4 5" />
              <path d="M 115 115 Q 160 130, 210 140" stroke="#B0492F" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeDasharray="3 5">
                <animate attributeName="stroke-dashoffset" from="0" to="-32" dur="1.6s" repeatCount="indefinite" />
              </path>
            </svg>
            {[0, 1].map((i) => (
              <div key={i} className={`pin p${i + 1}`} style={{ position: "relative" }}>
                <Check size={11} strokeWidth={3} />
              </div>
            ))}
            <div className="pin p3" style={{ position: "relative" }}>
              <MapPin size={9} strokeWidth={3} />
            </div>
            <div className="pin p4" style={{ position: "relative" }} />
            {destination && (
              <div style={{
                position: "absolute", bottom: 10, right: 14,
                fontFamily: "var(--font-display)", fontSize: 13,
                color: "var(--bark)", opacity: 0.75, letterSpacing: "0.02em",
              }}>
                {destination} ✦
              </div>
            )}
          </div>

          <div className="stage-head">
            <h1>sketching your<br /><span className="sw">plan</span></h1>
            <div className="now">
              <span className="spinner" />
              {PROGRESS_STAGES[stageIndex]?.label ?? "finalising..."}
            </div>
          </div>

          <div className="stages">
            {PROGRESS_STAGES.map((stage, i) => (
              <div
                key={stage.label}
                className={`stage-row ${i < stageIndex ? "done" : i === stageIndex ? "current" : "todo"}`}
              >
                <span className="dot">
                  {i < stageIndex && <Check size={11} strokeWidth={3} />}
                </span>
                <span className="name">{stage.label}</span>
                <span className="time">{STAGE_TIMES[i]}</span>
              </div>
            ))}
          </div>

          <div className="eta">
            <Clock size={14} strokeWidth={2} />
            <span>typical plans take <b>about a minute</b> — yours is going well.</span>
          </div>

          {showLongWait && (
            <div className="scribble-note">↑ kerala is a long one, hold tight ✦</div>
          )}
        </div>
        </div>{/* end .cx */}
      </div>
    </div>
  );
}
