// src/components/LeadBadge.jsx
import React from "react";

const DEFAULT_STYLES = {
  default: "bg-gray-100 border-gray-300 text-gray-800",

  // status
  engagement: "bg-blue-100 border-blue-300 text-blue-800",
  relationship: "bg-purple-100 border-purple-300 text-purple-800",
  short_term: "bg-yellow-100 border-yellow-300 text-yellow-800",
  long_term: "bg-emerald-100 border-emerald-300 text-emerald-800",
  do_not_call: "bg-red-100 border-red-300 text-red-800",

  // relationship %
  "18": "bg-gray-100 border-gray-300 text-gray-800",
  "34": "bg-sky-100 border-sky-300 text-sky-800",
  "56": "bg-amber-100 border-amber-300 text-amber-800",
  "78": "bg-lime-100 border-lime-300 text-lime-800",
  "100": "bg-green-100 border-green-300 text-green-800",

  // urgency
  very_low: "bg-gray-100 border-gray-300 text-gray-800",
  low: "bg-slate-100 border-slate-300 text-slate-800",
  unsure: "bg-zinc-100 border-zinc-300 text-zinc-800",
  likely: "bg-orange-100 border-orange-300 text-orange-800",
  very_likely: "bg-red-100 border-red-300 text-red-800",
};

export default function LeadBadge({ value, label, styles = DEFAULT_STYLES }) {
  const cls = styles[value] || styles.default;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium border rounded-full ${cls}`}
    >
      {label || value}
    </span>
  );
}
