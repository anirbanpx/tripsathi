// Core domain types — must stay in sync with backend API contracts

export interface Activity {
  name: string;
  bookable: boolean;
  approx_cost: number | null;
  updated_in_refinement?: boolean;
}

export interface DayPlan {
  day_number: number;
  location: string;
  activities: Activity[];
  meals: { breakfast: string; lunch: string; dinner: string };
  notes: string;
  updated_in_refinement?: boolean;
  update_note?: string;
}

export interface Hotel {
  location: string;
  name: string;
  reasoning: string;
  approx_cost_per_night: number;
  content_source: "rag" | "general";
  bookable: boolean;
  updated_in_refinement?: boolean;
}

export interface BudgetBreakdown {
  accommodation: number;
  transport: number;
  activities: number;
  food: number;
  total: number;
}

export interface Plan {
  days: DayPlan[];
  hotels: Hotel[];
  budget_breakdown: BudgetBreakdown;
  warnings: string[];
  personalization_notes?: string[];
}

export interface PlanResponse {
  plan: Plan;
  thread_id: string;
  status: "awaiting_feedback" | "done";
  stage_label: string;
  refinement_count?: number;
  interpreted_change?: string;
}

export interface BookingResponse {
  confirmation_id: string;
  status: "confirmed" | "failed";
  provider: string;
  item_name: string;
  amount_charged: number;
  check_in: string;
  check_out: string;
  is_demo: boolean;
}

export interface UserProfile {
  name: string;
  age_range: string;
  home_city: string;
  persona_type: string;
  constraints: {
    kid_ages: number[];
    elderly: boolean;
    mobility_limited: boolean;
  };
}

export interface AuthResponse {
  user_id: string;
  auth_method: string;
  phone_number: string;
  is_authenticated: boolean;
  name: string;
}

export interface AuthUser {
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

export interface SavedTrip {
  id: string;
  destination: string;
  duration_days: number;
  saved_at: string;
}

export interface WishlistItem {
  id: string;
  item_type: "destination" | "activity";
  name: string;
  location: string | null;
  saved_at: string;
}

export interface SavedHotel {
  id: string;
  name: string;
  location: string;
  approx_cost_per_night: number | null;
  reasoning: string | null;
  content_source: string | null;
  saved_at: string;
}

export interface TripParameters {
  destination: string;
  start_date: string;
  duration_days: number;
  party_size: number;
  kid_ages: number[];
  elderly: boolean;
  budget_bracket: "budget" | "mid" | "premium";
  trip_style: string[];
  special_needs: string;
  traveler_notes?: string;
}

// UserContext — tracks live UI state (not persisted)
export type AppMode = "demo" | "authenticated";
export type AppStage =
  | "entry"
  | "onboarding"
  | "trip_input"
  | "generating"
  | "plan_display"
  | "booking";

export interface UserContext {
  mode: AppMode;
  user_id: string | null;
  auth_user: AuthUser | null;
  thread_id: string | null;
  current_stage: AppStage;
  generation_active: boolean;
  fake_stage_index: number;
  fake_stage_label: string;
  plan: Plan | null;
  refinement_count: number;
  refinement_warning_shown: boolean;
  interpreted_change: string | null;
  kid_ages: number[];
  destination: string;
  trip_params: TripParameters | null;
  seed_prompt?: string;
}
