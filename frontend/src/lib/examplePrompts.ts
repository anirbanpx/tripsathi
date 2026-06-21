import type { TripParameters } from "../types";

// Explore chips — pre-baked params that bypass parseIntent and hit the template fast-path.
// Each entry maps exactly to a template in backend/templates/.
export const EXPLORE_CHIPS: { label: string; params: TripParameters }[] = [
  {
    label: "Munnar · couple · 3N nature",
    params: {
      destination: "Munnar", start_date: "", duration_days: 4,
      party_size: 2, kid_ages: [], elderly: false,
      budget_bracket: "mid", trip_style: ["nature", "tea"], special_needs: "",
    },
  },
  {
    label: "Hampi · couple · 3N budget heritage",
    params: {
      destination: "Hampi", start_date: "", duration_days: 4,
      party_size: 2, kid_ages: [], elderly: false,
      budget_bracket: "budget", trip_style: ["heritage", "photography"], special_needs: "",
    },
  },
  {
    label: "Udaipur · couple · 4N premium romance",
    params: {
      destination: "Udaipur", start_date: "", duration_days: 5,
      party_size: 2, kid_ages: [], elderly: false,
      budget_bracket: "premium", trip_style: ["heritage", "romance"], special_needs: "",
    },
  },
  {
    label: "Rishikesh · solo · 4N budget adventure",
    params: {
      destination: "Rishikesh", start_date: "", duration_days: 5,
      party_size: 1, kid_ages: [], elderly: false,
      budget_bracket: "budget", trip_style: ["adventure", "spiritual"], special_needs: "",
    },
  },
];

// A single, well-crafted static placeholder for the composer empty state.
export const COMPOSER_PLACEHOLDER =
  "e.g. 5-night Kerala trip, wife + toddler, ₹80k, vegetarian, backwaters + nature…";

// Helper line shown beneath the composer — teaches what can be said.
export const COMPOSER_HELPER =
  "↳ i can do dates, group, budget, diet, pace — say it however you like.";
