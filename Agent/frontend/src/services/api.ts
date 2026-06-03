import type { PlanResponse, BookingResponse, UserProfile, AuthResponse, TripParameters } from "../types";

import mockPlan from "../mocks/plan.json";
import mockRefine from "../mocks/refine.json";
import mockBooking from "../mocks/booking.json";
import mockAuth from "../mocks/auth.json";
import mockProfile from "../mocks/profile.json";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const API_BASE = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_URL || "https://tripsathi-production.up.railway.app");

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOrCreateUserId(): string {
  const key = "tripsathi_user_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export async function parseIntent(text: string): Promise<TripParameters & { onboarding_summary: string }> {
  const res = await fetch(`${API_BASE}/api/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`/api/parse failed: ${res.status}`);
  return res.json();
}

export async function generatePlan(params: TripParameters): Promise<PlanResponse> {
  if (USE_MOCK) {
    await delay(200);
    return mockPlan as PlanResponse;
  }

  const kidPart = params.kid_ages.length > 0
    ? ` with ${params.kid_ages.length} child${params.kid_ages.length > 1 ? "ren" : ""} aged ${params.kid_ages.join(", ")}`
    : "";
  const groupAnswer = `${params.party_size} adult${params.party_size > 1 ? "s" : ""}${kidPart}`;

  const onboarding_answers = [
    { question: "Trip style preferences", answer: params.trip_style.length ? params.trip_style.join(", ") : "general sightseeing" },
    { question: "Group composition", answer: groupAnswer },
    ...(params.special_needs ? [{ question: "Special needs or requirements", answer: params.special_needs }] : []),
  ];

  const res = await fetch(`${API_BASE}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      destination: params.destination,
      trip_parameters: {
        duration_days: params.duration_days,
        start_date: params.start_date,
        party_size: params.party_size,
        kid_ages: params.kid_ages,
        elderly: params.elderly,
        budget: params.budget_bracket,
        trip_style: params.trip_style,
        user_id: getOrCreateUserId(),
      },
      onboarding_answers,
    }),
  });
  if (!res.ok) throw new Error(`/api/plan failed: ${res.status}`);
  return res.json();
}

export async function streamPlan(
  params: TripParameters,
  onStage: (label: string) => void,
): Promise<PlanResponse> {
  if (USE_MOCK) {
    await delay(200);
    onStage("Understanding your profile...");
    await delay(400);
    onStage("Researching destinations & logistics...");
    await delay(400);
    return mockPlan as PlanResponse;
  }

  const kidPart = params.kid_ages.length > 0
    ? ` with ${params.kid_ages.length} child${params.kid_ages.length > 1 ? "ren" : ""} aged ${params.kid_ages.join(", ")}`
    : "";
  const groupAnswer = `${params.party_size} adult${params.party_size > 1 ? "s" : ""}${kidPart}`;
  const onboarding_answers = [
    { question: "Trip style preferences", answer: params.trip_style.length ? params.trip_style.join(", ") : "general sightseeing" },
    { question: "Group composition", answer: groupAnswer },
    ...(params.special_needs ? [{ question: "Special needs or requirements", answer: params.special_needs }] : []),
  ];

  const res = await fetch(`${API_BASE}/api/plan/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      destination: params.destination,
      trip_parameters: {
        duration_days: params.duration_days,
        start_date: params.start_date,
        party_size: params.party_size,
        kid_ages: params.kid_ages,
        elderly: params.elderly,
        budget: params.budget_bracket,
        trip_style: params.trip_style,
        user_id: getOrCreateUserId(),
      },
      onboarding_answers,
    }),
  });

  if (!res.ok) throw new Error(`/api/plan/stream failed: ${res.status}`);
  if (!res.body) throw new Error("No response body from stream");

  return new Promise((resolve, reject) => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let threadId = "";

    async function pump() {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { reject(new Error("Stream closed without completion event")); return; }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "thread_id") {
                threadId = data.thread_id;
              } else if (data.type === "stage") {
                onStage(data.stage_label);
              } else if (data.type === "done") {
                resolve({ plan: data.plan, thread_id: threadId, status: "awaiting_feedback", stage_label: data.stage_label, refinement_count: data.refinement_count ?? 0 });
                return;
              } else if (data.type === "error") {
                reject(new Error(data.detail));
                return;
              }
            } catch { /* ignore malformed SSE lines */ }
          }
        }
      } catch (e) {
        reject(e);
      }
    }
    pump();
  });
}

export async function refinePlan(threadId: string, userFeedback: string): Promise<PlanResponse> {
  if (USE_MOCK) {
    await delay(200);
    return mockRefine as PlanResponse;
  }
  const res = await fetch(`${API_BASE}/api/refine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thread_id: threadId, user_feedback: userFeedback }),
  });
  if (!res.ok) throw new Error(`/api/refine failed: ${res.status}`);
  return res.json();
}

export async function regeneratePlan(threadId: string): Promise<PlanResponse> {
  if (USE_MOCK) {
    await delay(200);
    return mockPlan as PlanResponse;
  }
  const res = await fetch(`${API_BASE}/api/regenerate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thread_id: threadId }),
  });
  if (!res.ok) throw new Error(`/api/regenerate failed: ${res.status}`);
  return res.json();
}

export async function bookItem(
  userId: string,
  item: { name: string; location: string; type: "hotel" | "activity" }
): Promise<BookingResponse> {
  if (USE_MOCK) {
    await delay(200);
    return { ...mockBooking, item_name: item.name } as BookingResponse;
  }
  const res = await fetch(`${API_BASE}/api/book`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, item }),
  });
  if (!res.ok) throw new Error(`/api/book failed: ${res.status}`);
  return res.json();
}

export async function onboard(params: {
  name: string;
  age_range: string;
  home_city: string;
  persona_type: string;
  kid_ages: number[];
}): Promise<{ user_id: string; user_profile: UserProfile }> {
  if (USE_MOCK) {
    await delay(200);
    return {
      user_id: mockAuth.user_id,
      user_profile: mockProfile.user_profile as UserProfile,
    };
  }
  const res = await fetch(`${API_BASE}/api/onboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`/api/onboard failed: ${res.status}`);
  return res.json();
}

export async function verifyOTP(phone: string, otp: string): Promise<AuthResponse> {
  if (USE_MOCK) {
    await delay(200);
    return mockAuth as AuthResponse;
  }
  const res = await fetch(`${API_BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, otp }),
  });
  if (!res.ok) throw new Error(`/api/auth/verify failed: ${res.status}`);
  return res.json();
}

export async function writeEpisode(episode: {
  user_id: string;
  thread_id: string;
  trip_parameters: TripParameters;
  plan_summary: string;
}): Promise<void> {
  if (USE_MOCK) return;
  await fetch(`${API_BASE}/api/memory/episode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(episode),
  });
}
