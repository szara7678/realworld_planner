window.GRAPH_SCHEMA = {
  version: "2.0",
  node_types: {
    Country: {},
    Region: {},
    Prefecture: {},
    City: {},
    District: {},
    TransitHub: {},
    Attraction: {},
    Restaurant: {},
    Cuisine: {},
    Lodging: {},
    SeasonalEvent: {},
    ExperienceTheme: {},
    TravelRule: {},
    PassProduct: {},
    PlannerSession: {},
    Constraint: {},
    Preference: {},
    CandidatePlan: {},
    PlanDay: {},
    TransportOption: {},
    StayOption: {},
    ActivityOption: {},
    BudgetSummary: {},
    Source: {},
    Observation: {}
  },
  edge_types: [
    { label: "CONTAINS" },
    { label: "LOCATED_IN" },
    { label: "NEAR" },
    { label: "CONNECTED_TO" },
    { label: "HAS_ATTRACTION" },
    { label: "HAS_RESTAURANT" },
    { label: "HAS_LODGING" },
    { label: "HAS_EVENT" },
    { label: "HAS_TRANSIT_HUB" },
    { label: "MATCHES_THEME" },
    { label: "SUBJECT_TO_RULE" },
    { label: "HAS_CONSTRAINT" },
    { label: "HAS_PREFERENCE" },
    { label: "GENERATED_PLAN" },
    { label: "HAS_DAY" },
    { label: "CHOOSES_TRANSPORT" },
    { label: "CHOOSES_STAY" },
    { label: "CHOOSES_ACTIVITY" },
    { label: "HAS_BUDGET" },
    { label: "SATISFIES" },
    { label: "CONFLICTS_WITH" },
    { label: "ALTERNATIVE_TO" },
    { label: "SUPPORTED_BY" },
    { label: "OBSERVED_FROM" },
    { label: "VALID_DURING" },
    { label: "SUPERSEDES" }
  ],
  constraint_types: [
    "origin",
    "depart_after",
    "return_depart_before",
    "total_budget_max",
    "nights_min",
    "nights_max",
    "must_use_airport",
    "must_avoid_area"
  ],
  preference_types: [
    "themes",
    "pace",
    "food_budget_level",
    "shopping_level",
    "nature_level",
    "onsen_level",
    "nightlife_level",
    "transport_tolerance"
  ]
};

window.GRAPH_SEED = {
  meta: {
    title: "Realworld Planner Fallback Seed",
    updatedAt: "2026-03-12T18:20:00+09:00",
    schema_version: "2.0",
    canonical_source: "seed",
    planner_ready: true,
    source: "Compact fallback graph"
  },
  nodes: [
    {
      id: "country_japan",
      type: "Country",
      title: "일본",
      x: 80,
      y: 120,
      properties: {
        country_code: "JP",
        canonical_name: "Japan"
      }
    },
    {
      id: "city_fukuoka",
      type: "City",
      title: "후쿠오카",
      x: 360,
      y: 80,
      tags: ["미식", "단기여행"],
      properties: {
        country_code: "JP",
        canonical_name: "Fukuoka"
      }
    },
    {
      id: "hub_fuk",
      type: "TransitHub",
      title: "후쿠오카공항 (FUK)",
      x: 640,
      y: 80,
      properties: {
        country_code: "JP",
        canonical_name: "Fukuoka Airport",
        hub_code: "FUK"
      }
    },
    {
      id: "theme_food",
      type: "ExperienceTheme",
      title: "미식",
      x: 640,
      y: 240,
      properties: {
        theme_code: "food"
      }
    },
    {
      id: "restaurant_ichiran",
      type: "Restaurant",
      title: "이치란 텐진점",
      x: 920,
      y: 80,
      properties: {
        place_ref: "city_fukuoka",
        category: "ramen",
        meal_budget_krw: 15000
      }
    },
    {
      id: "transport_icn_fuk",
      type: "TransportOption",
      title: "ICN -> FUK 직항",
      x: 920,
      y: 240,
      properties: {
        mode: "flight",
        from_ref: "hub_icn",
        to_ref: "hub_fuk",
        city_ref: "city_fukuoka"
      }
    }
  ],
  edges: [
    { id: "seed_e1", from: "country_japan", to: "city_fukuoka", label: "CONTAINS" },
    { id: "seed_e2", from: "city_fukuoka", to: "hub_fuk", label: "HAS_TRANSIT_HUB" },
    { id: "seed_e3", from: "city_fukuoka", to: "theme_food", label: "MATCHES_THEME" },
    { id: "seed_e4", from: "city_fukuoka", to: "restaurant_ichiran", label: "HAS_RESTAURANT" },
    { id: "seed_e5", from: "city_fukuoka", to: "transport_icn_fuk", label: "CONNECTED_TO" }
  ]
};
