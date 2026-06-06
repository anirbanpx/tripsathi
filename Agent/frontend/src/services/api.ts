import type { PlanResponse, BookingResponse, AuthResponse, TripParameters, SavedTrip, WishlistItem, SavedHotel, AuthUser, YouTubeVideo, FetchedHotel, LunchMeal, DinnerOption } from "../types";
import { getAuthHeaders, getAuthState } from "../lib/auth";

import mockPlan from "../mocks/plan.json";
import mockRefine from "../mocks/refine.json";
import mockBooking from "../mocks/booking.json";
import mockAuth from "../mocks/auth.json";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const API_BASE = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_URL || "https://tripsathi-production.up.railway.app");

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      traveler_notes: params.traveler_notes || "",
    }),
  });
  if (!res.ok) throw new Error(`/api/plan failed: ${res.status}`);
  return res.json();
}

export async function streamPlan(
  params: TripParameters,
  onStage: (label: string) => void,
  onDetail?: (text: string) => void,
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
      traveler_notes: params.traveler_notes || "",
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
              } else if (data.type === "detail") {
                onDetail?.(data.text);
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

export async function streamRegenerate(
  threadId: string,
  onStage: (label: string) => void,
): Promise<PlanResponse> {
  if (USE_MOCK) {
    await delay(200);
    onStage("Regenerating your itinerary...");
    await delay(400);
    return mockPlan as PlanResponse;
  }

  const res = await fetch(`${API_BASE}/api/regenerate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thread_id: threadId }),
  });
  if (!res.ok) throw new Error(`/api/regenerate/stream failed: ${res.status}`);
  if (!res.body) throw new Error("No response body from stream");

  return new Promise((resolve, reject) => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

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
              if (data.type === "stage") {
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

export function getOrCreateUserId(): string {
  let userId = localStorage.getItem("tripsathi_user_id");
  if (!userId) {
    userId = `anon_${Math.random().toString(36).slice(2, 14)}`;
    localStorage.setItem("tripsathi_user_id", userId);
  }
  return userId;
}

export function getUserId(): string {
  return getAuthState()?.user.user_id ?? getOrCreateUserId();
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function googleSignIn(idToken: string): Promise<{ access_token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });
  if (!res.ok) throw new Error(`/api/auth/google failed: ${res.status}`);
  return res.json();
}

export async function getProfile(): Promise<{ user_id: string; name: string; email: string; avatar_url: string | null; traveler_type_label: string; taste_summary: string | null }> {
  const res = await fetch(`${API_BASE}/api/profile`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`/api/profile failed: ${res.status}`);
  return res.json();
}

export async function updatePreferences(tasteData: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${API_BASE}/api/profile/preferences`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ taste_data: tasteData }),
  });
  if (!res.ok) throw new Error(`/api/profile/preferences failed: ${res.status}`);
}

// ── Saves: trips ─────────────────────────────────────────────────────────────

export async function saveTrip(params: { thread_id: string | null; destination: string; duration_days: number; plan_json: object }): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/api/saves/trips`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`/api/saves/trips failed: ${res.status}`);
  return res.json();
}

export async function getSavedTrips(): Promise<SavedTrip[]> {
  const res = await fetch(`${API_BASE}/api/saves/trips`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`/api/saves/trips failed: ${res.status}`);
  return res.json();
}

export async function deleteSavedTrip(tripId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/saves/trips/${tripId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`/api/saves/trips DELETE failed: ${res.status}`);
}

// ── Saves: wishlist ──────────────────────────────────────────────────────────

export async function toggleWishlistItem(params: { item_type: "destination" | "activity"; name: string; location?: string; metadata?: object }): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/saves/wishlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`/api/saves/wishlist failed: ${res.status}`);
  const data = await res.json();
  return data.added as boolean;
}

export async function getWishlist(): Promise<WishlistItem[]> {
  const res = await fetch(`${API_BASE}/api/saves/wishlist`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`/api/saves/wishlist failed: ${res.status}`);
  return res.json();
}

export async function deleteWishlistItem(itemId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/saves/wishlist/${itemId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`/api/saves/wishlist DELETE failed: ${res.status}`);
}

// ── Saves: hotels ────────────────────────────────────────────────────────────

export async function toggleHotel(params: { name: string; location: string; approx_cost_per_night?: number; reasoning?: string; content_source?: string }): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/saves/hotels`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`/api/saves/hotels failed: ${res.status}`);
  const data = await res.json();
  return data.added as boolean;
}

export async function getSavedHotels(): Promise<SavedHotel[]> {
  const res = await fetch(`${API_BASE}/api/saves/hotels`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`/api/saves/hotels failed: ${res.status}`);
  return res.json();
}

export async function deleteHotel(hotelId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/saves/hotels/${hotelId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`/api/saves/hotels DELETE failed: ${res.status}`);
}

export async function fetchYouTubePreview(destination: string): Promise<YouTubeVideo | null> {
  try {
    const res = await fetch(`${API_BASE}/api/youtube/${encodeURIComponent(destination)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.video_id ? (data as YouTubeVideo) : null;
  } catch {
    return null;
  }
}

interface PlacesCallbacks {
  onHotels: (hotels: FetchedHotel[]) => void;
  onDayMeals: (dayNumber: number, lunch: LunchMeal, dinner: DinnerOption[]) => void;
  onDone: () => void;
}

export function streamPlaces(
  destination: string,
  planDays: { day_number: number }[],
  userProfile: Record<string, unknown>,
  tripParameters: Record<string, unknown>,
  callbacks: PlacesCallbacks,
): void {
  fetch(`${API_BASE}/api/places/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination, plan_days: planDays, user_profile: userProfile, trip_parameters: tripParameters }),
  }).then(async (res) => {
    if (!res.ok || !res.body) { callbacks.onDone(); return; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "hotels") callbacks.onHotels(data.hotels);
          else if (data.type === "day_meals") callbacks.onDayMeals(data.day_number, data.lunch, data.dinner);
          else if (data.type === "done") callbacks.onDone();
        } catch { /* ignore malformed */ }
      }
    }
    callbacks.onDone();
  }).catch(() => callbacks.onDone());
}

export async function parseTaste(text: string, userId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/api/parse-taste`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, user_id: userId }),
  });
  if (!res.ok) return {};
  return res.json();
}

export async function onboard(params: {
  user_id: string;
  taste_data: Record<string, unknown>;
  story_text?: string;
}): Promise<{ user_id: string; taste_profile: Record<string, unknown> | null }> {
  if (USE_MOCK) {
    await delay(200);
    return {
      user_id: params.user_id || mockAuth.user_id,
      taste_profile: null,
    };
  }
  const res = await fetch(`${API_BASE}/api/onboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: params.user_id, taste_data: params.taste_data, story_text: params.story_text ?? "" }),
  });
  if (!res.ok) throw new Error(`/api/onboard failed: ${res.status}`);
  return res.json();
}

export async function getClarifyQuestions(userId: string, destination: string): Promise<string[]> {
  if (USE_MOCK) return [];
  try {
    const res = await fetch(
      `${API_BASE}/api/clarify/questions?user_id=${encodeURIComponent(userId)}&destination=${encodeURIComponent(destination)}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.questions) ? data.questions : [];
  } catch {
    return [];  // non-fatal — skip clarify on network error
  }
}

export async function transcribeAudio(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", blob, "recording.webm");
  const res = await fetch(`${API_BASE}/api/transcribe`, { method: "POST", body: form });
  if (!res.ok) throw new Error("transcription_failed");
  const data = await res.json();
  return (data.text as string) ?? "";
}

export async function getTasteProfile(userId: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${API_BASE}/api/taste/${encodeURIComponent(userId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`/api/taste failed: ${res.status}`);
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
