import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DemoEntryPage from "./pages/DemoEntryPage";
import PlannerPage from "./pages/PlannerPage";
import OnboardingPage from "./pages/OnboardingPage";
import type { UserContext } from "./types";

const INITIAL_CONTEXT: UserContext = {
  mode: "demo",
  user_id: null,
  thread_id: null,
  current_stage: "entry",
  generation_active: false,
  fake_stage_index: 0,
  fake_stage_label: "",
  plan: null,
  refinement_count: 0,
  refinement_warning_shown: false,
  interpreted_change: null,
  kid_ages: [],
};

export default function App() {
  const [ctx, setCtx] = useState<UserContext>(INITIAL_CONTEXT);

  function handleSetContext(patch: Partial<UserContext>) {
    setCtx((prev) => ({ ...prev, ...patch }));
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DemoEntryPage onSetContext={handleSetContext} />} />
        <Route path="/planner" element={<PlannerPage ctx={ctx} onSetContext={handleSetContext} />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
