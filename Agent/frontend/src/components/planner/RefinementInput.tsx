import { useState } from "react";
import { Send, RefreshCw, CheckCircle, CornerDownLeft } from "lucide-react";
import { refinePlan, streamRegenerate } from "../../services/api";
import type { UserContext } from "../../types";

interface Props {
  ctx: UserContext;
  onSetContext: (patch: Partial<UserContext>) => void;
}

export default function RefinementInput({ ctx, onSetContext }: Props) {
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  async function handleRefine() {
    if (!feedback.trim() || !ctx.thread_id) return;
    setLoading(true);
    try {
      const response = await refinePlan(ctx.thread_id, feedback);
      onSetContext({
        plan: response.plan,
        refinement_count: response.refinement_count ?? ctx.refinement_count + 1,
        interpreted_change: response.interpreted_change ?? null,
        refinement_warning_shown:
          (response.refinement_count ?? ctx.refinement_count + 1) >= 4
            ? true
            : ctx.refinement_warning_shown,
      });
      setFeedback("");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerate() {
    if (!ctx.thread_id) return;
    let stageIndex = 0;
    onSetContext({ current_stage: "generating", generation_active: true, fake_stage_index: 0, fake_stage_label: "Regenerating your itinerary..." });
    try {
      const response = await streamRegenerate(ctx.thread_id, (label) => {
        stageIndex = Math.min(stageIndex + 1, 4);
        onSetContext({ fake_stage_index: stageIndex, fake_stage_label: label });
      });
      onSetContext({
        current_stage: "plan_display",
        generation_active: false,
        plan: response.plan,
        refinement_count: 0,
        interpreted_change: null,
        fake_stage_label: "Done",
      });
    } catch {
      onSetContext({ current_stage: "plan_display", generation_active: false });
    }
  }

  const canSend = !!feedback.trim() && !loading;

  return (
    <div style={{
      background: "var(--surface)",
      border: "1.5px solid var(--border-strong)",
      borderRadius: "var(--radius-lg)",
      padding: "14px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>

      {ctx.refinement_warning_shown && (
        <p style={{ fontSize: 11, color: "var(--fg-3)", margin: 0, fontFamily: "var(--font-body)" }}>
          Not converging? Try regenerating for a completely fresh approach.
        </p>
      )}

      {/* Input row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: "var(--paper)",
        border: `1.5px solid ${focused ? "var(--accent)" : "var(--border-strong)"}`,
        borderRadius: "var(--radius)",
        padding: "10px 12px",
        transition: "border-color var(--dur-fast)",
      }}>
        <input
          style={{
            flex: 1, border: "none", outline: "none", background: "transparent",
            fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 14,
            color: "var(--fg)",
          }}
          placeholder="suggest a change… e.g. swap day 3 hotel"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleRefine()}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={loading}
        />

        {/* Enter hint — shown when focused and has text */}
        {focused && feedback.trim() && (
          <span style={{
            display: "flex", alignItems: "center", gap: 3,
            fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
            color: "var(--accent)", whiteSpace: "nowrap",
            fontFamily: "var(--font-body)",
          }}>
            <CornerDownLeft size={11} strokeWidth={2.5} />
            enter
          </span>
        )}

        <button
          onClick={handleRefine}
          disabled={!canSend}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 32, height: 32, borderRadius: "var(--radius-sm)",
            background: canSend ? "var(--accent)" : "var(--border)",
            border: "none", cursor: canSend ? "pointer" : "default",
            color: canSend ? "var(--paper)" : "var(--fg-3)",
            flexShrink: 0, transition: "background var(--dur-fast)",
          }}
        >
          <Send size={14} strokeWidth={2.5} />
        </button>
      </div>

      {/* Action row */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={handleRegenerate}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "8px 14px",
            background: "transparent",
            border: "1.5px solid var(--border-strong)",
            borderRadius: "var(--radius-pill)",
            fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12,
            color: "var(--fg-2)", cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.4 : 1,
          }}
        >
          <RefreshCw size={12} strokeWidth={2.5} />
          regenerate
        </button>

        <button
          onClick={() => onSetContext({ current_stage: "booking" })}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            marginLeft: "auto",
            padding: "8px 18px",
            background: "var(--secondary)",
            border: "none", borderRadius: "var(--radius-pill)",
            fontFamily: "var(--font-body)", fontWeight: 800, fontSize: 13,
            color: "var(--paper)", cursor: "pointer",
          }}
        >
          <CheckCircle size={14} strokeWidth={2.5} />
          approve & book
        </button>
      </div>
    </div>
  );
}
