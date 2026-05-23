import { useState } from "react";
import { refinePlan, regeneratePlan } from "../../services/api";
import { startFakeProgress } from "../../lib/fakeProgress";
import type { UserContext } from "../../types";

interface Props {
  ctx: UserContext;
  onSetContext: (patch: Partial<UserContext>) => void;
}

export default function RefinementInput({ ctx, onSetContext }: Props) {
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);

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
    const progressHandle = startFakeProgress(
      (index, label) => onSetContext({ fake_stage_index: index, fake_stage_label: label }),
      () => {}
    );
    onSetContext({ current_stage: "generating", generation_active: true });
    try {
      const response = await regeneratePlan(ctx.thread_id);
      progressHandle.stop();
      onSetContext({
        current_stage: "plan_display",
        generation_active: false,
        plan: response.plan,
        refinement_count: 0,
        interpreted_change: null,
        fake_stage_label: "Done",
      });
    } catch {
      progressHandle.stop();
      onSetContext({ current_stage: "plan_display", generation_active: false });
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3">
      {ctx.refinement_warning_shown && (
        <p className="text-xs text-slate-400">
          Heads up: try regenerating for a fresh approach if you're not converging.
        </p>
      )}
      <div className="flex gap-2">
        <input
          className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900"
          placeholder="Suggest a change... (e.g. change day 3 hotel)"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleRefine()}
          disabled={loading}
        />
        <button
          onClick={handleRefine}
          disabled={!feedback.trim() || loading}
          className="px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium disabled:opacity-40"
        >
          Send
        </button>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleRegenerate}
          disabled={loading}
          className="px-4 py-2 border border-slate-300 text-slate-600 rounded-xl text-sm font-medium disabled:opacity-40"
        >
          Regenerate
        </button>
        <button
          onClick={() => onSetContext({ current_stage: "booking" })}
          className="ml-auto px-5 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold"
        >
          Approve &amp; Book
        </button>
      </div>
    </div>
  );
}
