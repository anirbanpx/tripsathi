import type { PlanResponse, BookingResponse, UserProfile, AuthResponse, TripParameters } from "../types";

import mockPlan from "../mocks/plan.json";
import mockRefine from "../mocks/refine.json";
import mockBooking from "../mocks/booking.json";
import mockAuth from "../mocks/auth.json";
import mockProfile from "../mocks/profile.json";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generatePlan(params: TripParameters): Promise<PlanResponse> {
  if (USE_MOCK) {
    await delay(200);
    return mockPlan as PlanResponse;
  }
  const res = await fetch(`${API_BASE}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`/api/plan failed: ${res.status}`);
  return res.json();
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
