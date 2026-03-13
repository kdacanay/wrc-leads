export const LEAD_PHASE_OPTIONS = [
  "DNC",
  "Engagement Phase",
  "Relationship Building Phase",
  "Sphere of Influence Phase",
];

export function normalizeLeadPhase(value = "") {
  const raw = String(value).trim().toLowerCase();

  if (!raw) return "";
  if (raw === "dnc") return "DNC";
  if (raw.includes("engagement")) return "Engagement Phase";
  if (raw.includes("relationship")) return "Relationship Building Phase";
  if (raw.includes("sphere")) return "Sphere of Influence Phase";

  return value;
}