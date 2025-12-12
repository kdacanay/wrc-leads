// src/utils/normalize.js
export function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s\*$/, ""); // strip trailing "*"
}

export function normEmail(s) {
  return String(s || "").toLowerCase().trim();
}
