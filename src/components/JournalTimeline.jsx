// src/components/JournalTimeline.jsx
import React from "react";

function formatEntryDate(value) {
  if (!value) return "";
  if (value.toDate) {
    const d = value.toDate();
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function JournalTimeline({ entries, onDeleteEntry }) {
  const safeEntries = Array.isArray(entries) ? entries : [];

  // 🔹 Hide soft-deleted entries
  const visible = safeEntries.filter((e) => !e?.isDeleted);

  if (!visible.length) {
    return (
      <div className="text-xs text-gray-500 italic">
        No journal entries yet.
      </div>
    );
  }

  const sorted = [...visible].sort((a, b) => {
    const ta = a?.createdAt?.toMillis
      ? a.createdAt.toMillis()
      : a?.createdAt
      ? new Date(a.createdAt).getTime()
      : 0;
    const tb = b?.createdAt?.toMillis
      ? b.createdAt.toMillis()
      : b?.createdAt
      ? new Date(b.createdAt).getTime()
      : 0;
    return tb - ta; // newest first
  });

  return (
    <div className="space-y-3">
      {sorted.map((entry) => (
        <div
          key={entry.id || `${entry.createdAt}-${entry.text}`}
          className="border border-gray-200 rounded-lg p-3 text-xs bg-gray-50 flex flex-col gap-1"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-gray-600">
              {formatEntryDate(entry.createdAt) || "Unknown time"}
            </div>
            <div className="flex items-center gap-2">
              {entry.type && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-200 text-[10px] text-gray-700">
                  {entry.type}
                </span>
              )}

              {/* 🔥 Delete button only when onDeleteEntry is provided */}
              {onDeleteEntry && entry.id && (
                <button
                  type="button"
                  onClick={() => onDeleteEntry(entry.id)}
                  className="text-[10px] px-2 py-0.5 rounded-full border border-red-300 text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          {entry.createdByEmail && (
            <div className="text-[11px] text-gray-500">
              By: {entry.createdByEmail}
            </div>
          )}

          <div className="text-[13px] text-gray-800 whitespace-pre-line">
            {entry.text}
          </div>
        </div>
      ))}
    </div>
  );
}

