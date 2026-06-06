import { useState, useEffect, useRef } from "react";
import TripInputStepper from "../components/planner/TripInputStepper";
import GenerationProgress from "../components/planner/GenerationProgress";
import PlanDisplay from "../components/planner/PlanDisplay";
import SelectionScreen from "../components/planner/SelectionScreen";
import BookingScreen from "../components/planner/BookingScreen";
import { fetchYouTubePreview, streamPlaces } from "../services/api";
import type { UserContext, YouTubeVideo, FetchedHotel, LunchMeal, DinnerOption } from "../types";

interface DayPlacesData {
  day_number: number;
  lunch: LunchMeal;
  dinner: DinnerOption[];
}

interface ConfirmedChoices {
  hotel: FetchedHotel;
  dinnerChoices: Record<number, DinnerOption>;
}

interface Props {
  ctx: UserContext;
  onSetContext: (patch: Partial<UserContext>) => void;
}

export default function PlannerPage({ ctx, onSetContext }: Props) {
  const [youtubeVideo, setYoutubeVideo] = useState<YouTubeVideo | null>(null);
  const [fetchedHotels, setFetchedHotels] = useState<FetchedHotel[]>([]);
  const [daysPlaces, setDaysPlaces] = useState<DayPlacesData[]>([]);
  const [placesReady, setPlacesReady] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmedChoices | null>(null);

  // Track which plan/destination we've already fetched for (avoid double-fetching on re-renders)
  const ytFetchedRef = useRef<string>("");
  const placesFetchedRef = useRef<string>("");

  // Fetch YouTube video when generation starts (destination is known)
  useEffect(() => {
    const dest = ctx.destination;
    if (!dest || ytFetchedRef.current === dest) return;
    ytFetchedRef.current = dest;
    fetchYouTubePreview(dest).then((video) => setYoutubeVideo(video));
  }, [ctx.destination]);

  // Stream places when plan first arrives
  useEffect(() => {
    if (ctx.current_stage !== "plan_display") return;
    const plan = ctx.plan;
    if (!plan || !ctx.destination) return;

    const planKey = `${ctx.destination}:${plan.thread_id ?? ""}`;
    if (placesFetchedRef.current === planKey) return;
    placesFetchedRef.current = planKey;

    // Reset places state for new plan
    setFetchedHotels([]);
    setDaysPlaces([]);
    setPlacesReady(false);
    setConfirmed(null);

    const tripParams = ctx.trip_params;
    streamPlaces(
      ctx.destination,
      plan.plan.days.map((d) => ({ day_number: d.day_number })),
      {},
      tripParams
        ? { budget: tripParams.budget_bracket, kid_ages: tripParams.kid_ages, elderly: tripParams.elderly }
        : {},
      {
        onHotels: (hotels) => setFetchedHotels(hotels),
        onDayMeals: (dayNumber, lunch, dinner) =>
          setDaysPlaces((prev) => [...prev.filter((d) => d.day_number !== dayNumber), { day_number: dayNumber, lunch, dinner }]),
        onDone: () => setPlacesReady(true),
      },
    );
  }, [ctx.current_stage, ctx.plan, ctx.destination, ctx.trip_params]);

  const userName = ctx.auth_user?.name;

  return (
    <>
      {(ctx.current_stage === "entry" || ctx.current_stage === "onboarding" || ctx.current_stage === "trip_input" || ctx.current_stage === "generating") && (
        <TripInputStepper ctx={ctx} onSetContext={onSetContext} />
      )}
      {ctx.current_stage === "generating" && (
        <div style={{ position: "fixed", inset: 0, background: "var(--paper)", zIndex: 110, overflowY: "auto" }}>
          <GenerationProgress
            stageIndex={ctx.fake_stage_index}
            stageLabel={ctx.fake_stage_label}
            destination={ctx.destination}
            tripParams={ctx.trip_params}
            youtubeVideo={youtubeVideo}
          />
        </div>
      )}
      {ctx.current_stage === "plan_display" && ctx.plan && (
        <PlanDisplay
          ctx={ctx}
          onSetContext={onSetContext}
          fetchedHotels={fetchedHotels}
          placesReady={placesReady}
        />
      )}
      {ctx.current_stage === "selection" && ctx.plan && ctx.trip_params && (
        <SelectionScreen
          destination={ctx.destination}
          tripParams={ctx.trip_params}
          userName={userName}
          fetchedHotels={fetchedHotels}
          daysPlaces={daysPlaces.sort((a, b) => a.day_number - b.day_number)}
          onBack={() => onSetContext({ current_stage: "plan_display" })}
          onConfirm={(hotel, dinnerChoices) => {
            setConfirmed({ hotel, dinnerChoices });
            onSetContext({ current_stage: "booking" });
          }}
        />
      )}
      {ctx.current_stage === "booking" && ctx.plan && ctx.trip_params && confirmed && (
        <BookingScreen
          destination={ctx.destination}
          tripParams={ctx.trip_params}
          userName={userName}
          hotel={confirmed.hotel}
          diningChoices={daysPlaces
            .sort((a, b) => a.day_number - b.day_number)
            .map((d) => ({ day_number: d.day_number, dinner: confirmed.dinnerChoices[d.day_number] ?? d.dinner[0] }))}
          onBack={() => onSetContext({ current_stage: "selection" })}
        />
      )}
    </>
  );
}
