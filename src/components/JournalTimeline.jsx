// src/components/JournalTimeline.jsx
import React, { useMemo, useState } from "react";

function getEntryMillis(entry) {
  if (!entry) return 0;

  // ✅ Prefer normalized millis (what AdminLeadPage builds)
  if (typeof entry.createdAtMillis === "number" && entry.createdAtMillis > 0) {
    return entry.createdAtMillis;
  }

  const v = entry.createdAt;

  // Firestore Timestamp
  if (v?.toMillis) return v.toMillis();
  if (v?.seconds != null) return v.seconds * 1000;

  // Number
  if (typeof v === "number") return v;

  // Date
  if (v instanceof Date) return v.getTime();

  // String
  if (typeof v === "string") {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? 0 : t;
  }

  return 0;
}

function formatEntryDate(entry) {
  const ms = getEntryMillis(entry);
  if (!ms) return "";
  return new Date(ms).toLocaleString();
}


export default function JournalTimeline({
  entries = [],
  canEdit = false,
  onDeleteEntry,
  onEditEntry,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const sortedEntries = useMemo(() => {
    const list = Array.isArray(entries) ? [...entries] : [];
    // newest first
return list.sort((a, b) => getEntryMillis(b) - getEntryMillis(a));

  }, [entries]);

  function startEdit(entry) {
    setEditingId(entry.id);
    setEditText(entry.text || "");
  }

  async function handleSaveEdit() {
    if (!editingId || !onEditEntry) {
      setEditingId(null);
      setEditText("");
      return;
    }

    await onEditEntry(editingId, editText);
    setEditingId(null);
    setEditText("");
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  if (!sortedEntries.length) {
    return (
      <div className="text-xs text-gray-500 italic">
        No journal entries yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sortedEntries.map((entry) => {
        const isEditing = editingId === entry.id;

        return (
          <div
            key={entry.id}
            className="border border-gray-200 rounded-lg px-3 py-2 text-xs bg-gray-50"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] text-gray-500">
                 {formatEntryDate(entry)}

                </div>
                {entry.createdByEmail && (
                  <div className="text-[11px] text-gray-500">
                    by {entry.createdByEmail}
                    {entry._from === "array" && (
  <div className="text-[10px] text-gray-400">(imported)</div>
)}

                  </div>
                )}
              </div>

              {canEdit && (onEditEntry || onDeleteEntry) && (
                <div className="flex items-center gap-1">
                  {onEditEntry && (
                    <>
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => startEdit(entry)}
                          className="px-2 py-1 border border-gray-300 rounded-full text-[10px] text-gray-700 hover:bg-gray-100"
                        >
                          Edit
                        </button>
                      )}
                    </>
                  )}

                  {onDeleteEntry && !isEditing && (
                    <button
                      type="button"
                      onClick={() => onDeleteEntry(entry.id)}
                      className="px-2 py-1 border border-red-300 rounded-full text-[10px] text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-2">
              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-[11px]"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="px-2 py-1 border border-gray-300 rounded-full text-[10px] text-gray-700 hover:bg-gray-100"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-2 py-1 border border-gray-300 rounded-full text-[10px] text-gray-500 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="whitespace-pre-wrap text-gray-800">
                  {entry.text}
                  {entry.editedAt && (
                    <span className="ml-2 text-[10px] text-gray-400 italic">
                      (edited)
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
