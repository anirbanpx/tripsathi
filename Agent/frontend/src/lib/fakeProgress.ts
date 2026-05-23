// Fake-progress stages calibrated to typical LangGraph node durations.
// Sprint 3: replace by reading stage_label from real SSE stream.

export interface ProgressStage {
  label: string;
  durationMs: number;
}

export const PROGRESS_STAGES: ProgressStage[] = [
  { label: "Understanding your profile...", durationMs: 4000 },
  { label: "Researching destinations & logistics...", durationMs: 12000 },
  { label: "Checking local conditions & accessibility...", durationMs: 6000 },
  { label: "Building your itinerary...", durationMs: 25000 },
  { label: "Finalising budget & recommendations...", durationMs: 8000 },
];

const MIN_STAGE_MS = 1500;
const LONG_WAIT_THRESHOLD_MS = 60000;

export interface FakeProgressHandle {
  stop: () => void;
}

export function startFakeProgress(
  onStageChange: (index: number, label: string) => void,
  onLongWait: () => void
): FakeProgressHandle {
  let stageIndex = 0;
  let elapsed = 0;
  let stopped = false;
  let longWaitFired = false;

  function advance() {
    if (stopped) return;

    const stage = PROGRESS_STAGES[stageIndex];
    const duration = Math.max(stage.durationMs, MIN_STAGE_MS);

    onStageChange(stageIndex, stage.label);
    elapsed += duration;

    if (elapsed >= LONG_WAIT_THRESHOLD_MS && !longWaitFired) {
      longWaitFired = true;
      onLongWait();
    }

    const nextIndex = stageIndex + 1;
    if (nextIndex < PROGRESS_STAGES.length) {
      stageIndex = nextIndex;
      setTimeout(advance, duration);
    }
    // If on last stage, stay there until stop() is called
  }

  setTimeout(advance, 0);

  return {
    stop: () => {
      stopped = true;
    },
  };
}
