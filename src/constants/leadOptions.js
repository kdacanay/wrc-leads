// src/constants/leadOptions.js

export const STATUS_OPTIONS = [
  { value: "engagement", label: "Engagement phase" },
  { value: "relationship", label: "Relationship phase" },
  { value: "short_term", label: "Short-term management" },
  { value: "long_term", label: "Long-term management" },
  { value: "do_not_call", label: "Do Not Call" },
];

export const LEAD_TYPE_OPTIONS = [
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
  { value: "buyer_seller", label: "Buyer & Seller" },
  { value: "renter", label: "Renter" },
];

export const ENGAGEMENT_LEVEL_OPTIONS = [
  { value: "identified",        label: "Identified" },
  { value: "contacted",         label: "Contacted" },
  { value: "meeting_scheduled", label: "Meeting scheduled" },
  { value: "meeting_completed", label: "Meeting completed" },
  { value: "in_pipeline",       label: "In pipeline" },
];


export const RELATIONSHIP_RANK_OPTIONS = [
    {value: "0", label: "0% or new lead" },
  { value: "18", label: "18% likelihood" },
  { value: "34", label: "34% likelihood" },
  { value: "56", label: "56% likelihood" },
  { value: "78", label: "78% likelihood" },
  { value: "100", label: "100% likelihood" },
];

export const URGENCY_OPTIONS = [
  { value: "very_low", label: "Very low likelihood" },
  { value: "low", label: "Low likelihood" },
  { value: "unsure", label: "Not sure" },
  { value: "likely", label: "Likely" },
  { value: "very_likely", label: "Very likely" },
];

export const SOURCE_OPTIONS = [
  { value: "fsbo", label: "FSBO" },
  { value: "cold_call", label: "Cold calling" },
  { value: "referral_past_client", label: "Referral - past client" },
  { value: "referral_agent", label: "Referral - agent" },
  { value: "website", label: "Website" },
  { value: "social_media", label: "Social media" },
  { value: "expired", label: "Expired listing" },
  { value: "zillow", label: "Zillow" },
  { value: "wln", label: "WLN (Weichert Lead Network)" },
  { value: "weichert_com", label: "Weichert.com" },
  { value: "open_house", label: "Open house" },
  { value: "walk_in", label: "Walk-in" },
  { value: "sphere", label: "Sphere of influence" },
  { value: "other", label: "Other" },
];

// label maps for quick lookup
export const STATUS_LABELS = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label])
);
export const RELATIONSHIP_LABELS = Object.fromEntries(
  RELATIONSHIP_RANK_OPTIONS.map((o) => [o.value, o.label])
);
export const URGENCY_LABELS = Object.fromEntries(
  URGENCY_OPTIONS.map((o) => [o.value, o.label])
);
export const SOURCE_LABELS = Object.fromEntries(
  SOURCE_OPTIONS.map((o) => [o.value, o.label])
);
export const LEAD_TYPE_LABELS = Object.fromEntries(
  LEAD_TYPE_OPTIONS.map((o) => [o.value, o.label])
);
