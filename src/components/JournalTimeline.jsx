// src/components/JournalTimeline.jsx
import React from "react";

function formatDateTime(value) {
  if (!value) return "";
  let d;
  // Firestore Timestamp
  if (value.toDate) {
    d = value.toDate();
  } else if (value instanceof Date) {
    d = value;
  } else {
    // fall back
    d = new Date(value);
  }

  if (Number.isNaN(d.getTime())) return "";

  const date = d.toLocaleDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

export default function JournalTimeline({ entries }) {
  if (!entries || entries.length === 0) {
    return (
      <div className="text-xs text-gray-500 italic">
        No journal entries yet.
      </div>
    );
  }

  // newest first
  const ordered = [...entries].sort((a, b) => {
    const da = a.createdAt?.toMillis
      ? a.createdAt.toMillis()
      : new Date(a.createdAt).getTime();
    const db = b.createdAt?.toMillis
      ? b.createdAt.toMillis()
      : new Date(b.createdAt).getTime();
    return db - da;
  });

  return (
    <ul className="space-y-3 text-xs">
      {ordered.map((entry) => (
        <li
          key={entry.id}
          className="border border-gray-200 rounded-lg p-2.5 bg-gray-50"
        >
          <div className="flex justify-between items-center mb-1.5">
            <span className="font-medium">
              {entry.createdByEmail || "Unknown"}
            </span>
            <span className="text-[11px] text-gray-500">
              {formatDateTime(entry.createdAt)}
            </span>
          </div>
          <div className="whitespace-pre-wrap text-gray-800">
            {entry.text}
          </div>
        </li>
      ))}
    </ul>
  );
}
