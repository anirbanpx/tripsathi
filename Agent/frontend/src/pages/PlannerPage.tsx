import TripInputStepper from "../components/planner/TripInputStepper";
import GenerationProgress from "../components/planner/GenerationProgress";
import PlanDisplay from "../components/planner/PlanDisplay";
import BookingSection from "../components/booking/BookingSection";
import type { UserContext } from "../types";

interface Props {
  ctx: UserContext;
  onSetContext: (patch: Partial<UserContext>) => void;
}

export default function PlannerPage({ ctx, onSetContext }: Props) {
  return (
    <>
      {(ctx.current_stage === "entry" || ctx.current_stage === "trip_input" || ctx.current_stage === "generating") && (
        <TripInputStepper ctx={ctx} onSetContext={onSetContext} />
      )}
      {ctx.current_stage === "generating" && (
        <div style={{ position: "fixed", inset: 0, background: "var(--paper)", zIndex: 110, overflowY: "auto" }}>
          <GenerationProgress stageIndex={ctx.fake_stage_index} stageLabel={ctx.fake_stage_label} destination={ctx.destination} tripParams={ctx.trip_params} />
        </div>
      )}
      {ctx.current_stage === "plan_display" && ctx.plan && (
        <PlanDisplay ctx={ctx} onSetContext={onSetContext} />
      )}
      {ctx.current_stage === "booking" && ctx.plan && (
        <BookingSection ctx={ctx} onSetContext={onSetContext} />
      )}
    </>
  );
}
