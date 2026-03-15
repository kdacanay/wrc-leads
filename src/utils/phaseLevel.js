export function normalizeLevel(v) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (s === "") return "";
  if (["0", "1", "2", "3"].includes(s)) return s;
  return "";
}

export function levelToPhase(v) {
  const s = normalizeLevel(v);
  if (s === "") return "—";
  if (s === "0") return "DNC";
  if (s === "1") return "Engagement Phase";
  if (s === "2") return "Relationship Building Phase";
  if (s === "3") return "Sphere of Influence";
  return "—";
}

export const LEVEL_DROPDOWN_OPTIONS = [
  { value: "", label: "— Select phase —" },
  { value: "0", label: "DNC" },
  { value: "1", label: "Engagement Phase" },
  { value: "2", label: "Relationship Building Phase" },
  { value: "3", label: "Sphere of Influence" },
];