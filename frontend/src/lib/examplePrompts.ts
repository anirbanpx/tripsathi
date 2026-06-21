import type { TripParameters } from "../types";

export type TemplateSpec = {
  destination: string;
  slug: string;
  params: TripParameters;
  tier: "static" | "dynamic";
  season?: "summer" | "monsoon" | "winter";
  hook: string;
  chipLabel: string;
};

export const ALL_TEMPLATE_SPECS: TemplateSpec[] = [
  // ── STATIC (always shown) ────────────────────────────────────────────────
  {
    destination: "Mysore", slug: "mysore", tier: "static",
    hook: "palaces, silk bazaars & Chamundi hills",
    chipLabel: "Mysore · couple · 3N heritage",
    params: { destination: "Mysore", start_date: "", duration_days: 4, party_size: 2, kid_ages: [10], elderly: false, budget_bracket: "mid", trip_style: ["heritage", "food"], special_needs: "" },
  },
  {
    destination: "Hampi", slug: "hampi", tier: "static",
    hook: "boulder ruins & Vijayanagara grandeur",
    chipLabel: "Hampi · couple · 3N budget heritage",
    params: { destination: "Hampi", start_date: "", duration_days: 4, party_size: 2, kid_ages: [], elderly: false, budget_bracket: "budget", trip_style: ["heritage", "photography"], special_needs: "" },
  },
  {
    destination: "Udaipur", slug: "udaipur", tier: "static",
    hook: "lake palaces & Rajput romance",
    chipLabel: "Udaipur · couple · 4N premium romance",
    params: { destination: "Udaipur", start_date: "", duration_days: 5, party_size: 2, kid_ages: [], elderly: false, budget_bracket: "premium", trip_style: ["heritage", "romance"], special_needs: "" },
  },
  {
    destination: "Munnar", slug: "munnar", tier: "static",
    hook: "tea-garden mist & Kerala high ranges",
    chipLabel: "Munnar · couple · 3N nature",
    params: { destination: "Munnar", start_date: "", duration_days: 4, party_size: 2, kid_ages: [], elderly: false, budget_bracket: "mid", trip_style: ["nature", "tea"], special_needs: "" },
  },
  {
    destination: "Rishikesh", slug: "rishikesh", tier: "static",
    hook: "Ganga ghats, yoga & white-water rush",
    chipLabel: "Rishikesh · solo · 4N budget adventure",
    params: { destination: "Rishikesh", start_date: "", duration_days: 5, party_size: 1, kid_ages: [], elderly: false, budget_bracket: "budget", trip_style: ["adventure", "spiritual"], special_needs: "" },
  },
  // ── SUMMER (Apr–Jun) ─────────────────────────────────────────────────────
  {
    destination: "Manali", slug: "manali", tier: "dynamic", season: "summer",
    hook: "snow peaks, treks & riverside calm",
    chipLabel: "Manali · group · 5N adventure",
    params: { destination: "Manali", start_date: "", duration_days: 6, party_size: 3, kid_ages: [], elderly: false, budget_bracket: "mid", trip_style: ["adventure", "nature"], special_needs: "" },
  },
  {
    destination: "Shimla", slug: "shimla", tier: "dynamic", season: "summer",
    hook: "colonial hills, apple orchards & ridge walks",
    chipLabel: "Shimla · couple · 4N nature",
    params: { destination: "Shimla", start_date: "", duration_days: 5, party_size: 2, kid_ages: [8], elderly: false, budget_bracket: "mid", trip_style: ["heritage", "nature"], special_needs: "" },
  },
  {
    destination: "Nainital", slug: "nainital", tier: "dynamic", season: "summer",
    hook: "lake reflections & cool Kumaon air",
    chipLabel: "Nainital · couple · 4N lake",
    params: { destination: "Nainital", start_date: "", duration_days: 5, party_size: 2, kid_ages: [7], elderly: false, budget_bracket: "mid", trip_style: ["nature", "lake"], special_needs: "" },
  },
  {
    destination: "Mussoorie", slug: "mussoorie", tier: "dynamic", season: "summer",
    hook: "queen of hills & cedar forest trails",
    chipLabel: "Mussoorie · couple · 3N nature romance",
    params: { destination: "Mussoorie", start_date: "", duration_days: 4, party_size: 2, kid_ages: [], elderly: false, budget_bracket: "mid", trip_style: ["nature", "romance"], special_needs: "" },
  },
  {
    destination: "Dharamsala", slug: "dharamsala", tier: "dynamic", season: "summer",
    hook: "monasteries, pine air & Dhauladhar views",
    chipLabel: "Dharamsala · solo · 4N budget spiritual",
    params: { destination: "Dharamsala", start_date: "", duration_days: 5, party_size: 1, kid_ages: [], elderly: false, budget_bracket: "budget", trip_style: ["nature", "spiritual"], special_needs: "" },
  },
  // ── MONSOON (Jul–Sep) ────────────────────────────────────────────────────
  {
    destination: "Wayanad", slug: "wayanad", tier: "dynamic", season: "monsoon",
    hook: "misty coffee estates & wild Kerala",
    chipLabel: "Wayanad · couple · 3N wildlife",
    params: { destination: "Wayanad", start_date: "", duration_days: 4, party_size: 2, kid_ages: [], elderly: false, budget_bracket: "mid", trip_style: ["nature", "wildlife"], special_needs: "" },
  },
  {
    destination: "Spiti", slug: "spiti", tier: "dynamic", season: "monsoon",
    hook: "high-altitude desert & ancient gompas",
    chipLabel: "Spiti · group · 6N budget roadtrip",
    params: { destination: "Spiti", start_date: "", duration_days: 7, party_size: 3, kid_ages: [], elderly: false, budget_bracket: "budget", trip_style: ["adventure", "roadtrip"], special_needs: "" },
  },
  {
    destination: "Coorg", slug: "coorg", tier: "dynamic", season: "monsoon",
    hook: "coffee hills, waterfalls & elephant camps",
    chipLabel: "Coorg · couple · 3N wellness",
    params: { destination: "Coorg", start_date: "", duration_days: 4, party_size: 2, kid_ages: [], elderly: false, budget_bracket: "mid", trip_style: ["nature", "wellness"], special_needs: "" },
  },
  {
    destination: "Thekkady", slug: "thekkady", tier: "dynamic", season: "monsoon",
    hook: "Periyar lake & wildlife at the forest edge",
    chipLabel: "Thekkady · family · 3N wildlife",
    params: { destination: "Thekkady", start_date: "", duration_days: 4, party_size: 2, kid_ages: [9], elderly: false, budget_bracket: "mid", trip_style: ["nature", "wildlife"], special_needs: "" },
  },
  {
    destination: "Kodaikanal", slug: "kodaikanal", tier: "dynamic", season: "monsoon",
    hook: "misty lake town & honeymoon hills",
    chipLabel: "Kodaikanal · couple · 3N budget romance",
    params: { destination: "Kodaikanal", start_date: "", duration_days: 4, party_size: 2, kid_ages: [], elderly: false, budget_bracket: "budget", trip_style: ["nature", "romance"], special_needs: "" },
  },
  // ── WINTER (Oct–Mar) ─────────────────────────────────────────────────────
  {
    destination: "Andaman", slug: "andaman", tier: "dynamic", season: "winter",
    hook: "turquoise water & world-class beaches",
    chipLabel: "Andaman · couple · 5N premium beaches",
    params: { destination: "Andaman", start_date: "", duration_days: 6, party_size: 2, kid_ages: [], elderly: false, budget_bracket: "premium", trip_style: ["beaches", "nature"], special_needs: "" },
  },
  {
    destination: "Kutch", slug: "kutch", tier: "dynamic", season: "winter",
    hook: "white salt desert & the Rann festival",
    chipLabel: "Kutch · family · 3N culture desert",
    params: { destination: "Kutch", start_date: "", duration_days: 4, party_size: 4, kid_ages: [], elderly: false, budget_bracket: "mid", trip_style: ["culture", "desert"], special_needs: "" },
  },
  {
    destination: "Varkala", slug: "varkala", tier: "dynamic", season: "winter",
    hook: "cliff-top sunsets & Kerala wellness retreats",
    chipLabel: "Varkala · solo · 4N budget beaches",
    params: { destination: "Varkala", start_date: "", duration_days: 5, party_size: 1, kid_ages: [], elderly: false, budget_bracket: "budget", trip_style: ["beaches", "wellness"], special_needs: "" },
  },
  {
    destination: "Darjeeling", slug: "darjeeling", tier: "dynamic", season: "winter",
    hook: "tea estates, toy train & Himalayan horizons",
    chipLabel: "Darjeeling · couple · 4N nature heritage",
    params: { destination: "Darjeeling", start_date: "", duration_days: 5, party_size: 2, kid_ages: [10], elderly: false, budget_bracket: "mid", trip_style: ["heritage", "nature"], special_needs: "" },
  },
  {
    destination: "Jaisalmer", slug: "jaisalmer", tier: "dynamic", season: "winter",
    hook: "sand dunes, golden fort & camel at dusk",
    chipLabel: "Jaisalmer · couple · 3N desert heritage",
    params: { destination: "Jaisalmer", start_date: "", duration_days: 4, party_size: 2, kid_ages: [], elderly: false, budget_bracket: "mid", trip_style: ["desert", "heritage"], special_needs: "" },
  },
];

function getCurrentSeason(): "summer" | "monsoon" | "winter" {
  const m = new Date().getMonth() + 1;
  if (m >= 4 && m <= 6) return "summer";
  if (m >= 7 && m <= 9) return "monsoon";
  return "winter";
}

// 10 cards: 5 static + 5 current-season dynamic
export function getSeasonalCards(): TemplateSpec[] {
  const season = getCurrentSeason();
  const statics = ALL_TEMPLATE_SPECS.filter((s) => s.tier === "static");
  const seasonal = ALL_TEMPLATE_SPECS.filter((s) => s.season === season);
  return [...statics, ...seasonal];
}

// 4 chips: 2 from each of the other two seasons (cross-season teasers)
export function getSeasonalChips(): TemplateSpec[] {
  const season = getCurrentSeason();
  const others = ALL_TEMPLATE_SPECS.filter(
    (s) => s.tier === "dynamic" && s.season !== season
  );
  const seasons = (["summer", "monsoon", "winter"] as const).filter((s) => s !== season);
  return seasons.flatMap((s) => others.filter((x) => x.season === s).slice(0, 2));
}

// TEMPLATE_PARAMS kept for map lookup (destination name → params)
export const TEMPLATE_PARAMS: Record<string, TripParameters> = Object.fromEntries(
  ALL_TEMPLATE_SPECS.map((s) => [s.destination.toLowerCase(), s.params])
);

// Kept for any remaining imports — now wraps getSeasonalChips at module load time
export const EXPLORE_CHIPS = getSeasonalChips().map((s) => ({
  label: s.chipLabel,
  params: s.params,
}));

export const COMPOSER_PLACEHOLDER =
  "e.g. 5-night Kerala trip, wife + toddler, ₹80k, vegetarian, backwaters + nature…";

export const COMPOSER_HELPER =
  "↳ i can do dates, group, budget, diet, pace — say it however you like.";
