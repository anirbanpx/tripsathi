import type { TripParameters } from "../types";

// One canonical TripParameters per templated destination — keyed by lowercase destination name.
// Each entry maps exactly to a template in backend/templates/ so clicks always hit the fast-path.
export const TEMPLATE_PARAMS: Record<string, TripParameters> = {
  andaman:    { destination: "Andaman",    start_date: "", duration_days: 6,  party_size: 2, kid_ages: [],   elderly: false, budget_bracket: "premium", trip_style: ["beaches", "nature"],              special_needs: "" },
  coorg:      { destination: "Coorg",      start_date: "", duration_days: 4,  party_size: 2, kid_ages: [],   elderly: false, budget_bracket: "mid",     trip_style: ["nature", "wellness"],             special_needs: "" },
  darjeeling: { destination: "Darjeeling", start_date: "", duration_days: 5,  party_size: 2, kid_ages: [10], elderly: false, budget_bracket: "mid",     trip_style: ["heritage", "nature"],             special_needs: "" },
  dharamsala: { destination: "Dharamsala", start_date: "", duration_days: 5,  party_size: 1, kid_ages: [],   elderly: false, budget_bracket: "budget",  trip_style: ["nature", "spiritual"],            special_needs: "" },
  hampi:      { destination: "Hampi",      start_date: "", duration_days: 4,  party_size: 2, kid_ages: [],   elderly: false, budget_bracket: "budget",  trip_style: ["heritage", "photography"],        special_needs: "" },
  jaisalmer:  { destination: "Jaisalmer",  start_date: "", duration_days: 4,  party_size: 2, kid_ages: [],   elderly: false, budget_bracket: "mid",     trip_style: ["desert", "heritage"],             special_needs: "" },
  kodaikanal: { destination: "Kodaikanal", start_date: "", duration_days: 4,  party_size: 2, kid_ages: [],   elderly: false, budget_bracket: "budget",  trip_style: ["nature", "romance"],              special_needs: "" },
  kutch:      { destination: "Kutch",      start_date: "", duration_days: 4,  party_size: 4, kid_ages: [],   elderly: false, budget_bracket: "mid",     trip_style: ["culture", "desert"],              special_needs: "" },
  manali:     { destination: "Manali",     start_date: "", duration_days: 6,  party_size: 3, kid_ages: [],   elderly: false, budget_bracket: "mid",     trip_style: ["adventure", "nature"],            special_needs: "" },
  munnar:     { destination: "Munnar",     start_date: "", duration_days: 4,  party_size: 2, kid_ages: [],   elderly: false, budget_bracket: "mid",     trip_style: ["nature", "tea"],                  special_needs: "" },
  mussoorie:  { destination: "Mussoorie",  start_date: "", duration_days: 4,  party_size: 2, kid_ages: [],   elderly: false, budget_bracket: "mid",     trip_style: ["nature", "romance"],              special_needs: "" },
  mysore:     { destination: "Mysore",     start_date: "", duration_days: 4,  party_size: 2, kid_ages: [10], elderly: false, budget_bracket: "mid",     trip_style: ["food", "heritage"],               special_needs: "" },
  nainital:   { destination: "Nainital",   start_date: "", duration_days: 5,  party_size: 2, kid_ages: [7],  elderly: false, budget_bracket: "mid",     trip_style: ["lake", "nature"],                 special_needs: "" },
  rishikesh:  { destination: "Rishikesh",  start_date: "", duration_days: 5,  party_size: 1, kid_ages: [],   elderly: false, budget_bracket: "budget",  trip_style: ["adventure", "spiritual"],         special_needs: "" },
  shimla:     { destination: "Shimla",     start_date: "", duration_days: 5,  party_size: 2, kid_ages: [8],  elderly: false, budget_bracket: "mid",     trip_style: ["heritage", "nature"],             special_needs: "" },
  spiti:      { destination: "Spiti",      start_date: "", duration_days: 7,  party_size: 3, kid_ages: [],   elderly: false, budget_bracket: "budget",  trip_style: ["adventure", "roadtrip"],          special_needs: "" },
  thekkady:   { destination: "Thekkady",   start_date: "", duration_days: 4,  party_size: 2, kid_ages: [9],  elderly: false, budget_bracket: "mid",     trip_style: ["nature", "wildlife"],             special_needs: "" },
  udaipur:    { destination: "Udaipur",    start_date: "", duration_days: 5,  party_size: 2, kid_ages: [],   elderly: false, budget_bracket: "premium", trip_style: ["heritage", "romance"],            special_needs: "" },
  varkala:    { destination: "Varkala",    start_date: "", duration_days: 5,  party_size: 1, kid_ages: [],   elderly: false, budget_bracket: "budget",  trip_style: ["beaches", "wellness"],            special_needs: "" },
  wayanad:    { destination: "Wayanad",    start_date: "", duration_days: 4,  party_size: 2, kid_ages: [],   elderly: false, budget_bracket: "mid",     trip_style: ["nature", "wildlife"],             special_needs: "" },
};

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
