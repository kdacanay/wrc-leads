// src/components/LeadFormAdmin.jsx
import React, { useState, useEffect, useMemo } from "react";
import {
  STATUS_OPTIONS,
  LEAD_TYPE_OPTIONS,
  ENGAGEMENT_LEVEL_OPTIONS,
  RELATIONSHIP_RANK_OPTIONS,
  URGENCY_OPTIONS,
  SOURCE_OPTIONS,
} from "../constants/leadOptions";

const emptyForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  status: "engagement",
  leadType: "buyer",
  firstAttemptDate: "",
  engagementLevel: "identified",
  nextEvaluationDate: "",
  relationshipRanking: "0",
  urgencyRanking: "unsure",
  source: "other",
  registrationDate: "",
};

// ✅ keep “note draft” separate from the lead fields entirely
const emptyDrafts = {
  journalNote: "",
};

function normalizeDateForInput(value) {
  if (!value) return "";
  // Firestore Timestamp
  if (value?.toDate) {
    const d = value.toDate();
    return d.toISOString().slice(0, 10);
  }
  // ISO or yyyy-mm-dd string
  if (typeof value === "string") return value;
  // Fallback Date
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function LeadFormAdmin({ initialData, onSave, saving }) {
  // ✅ Only the true lead-edit fields go in `form`
  const [form, setForm] = useState(() => ({
    ...emptyForm,
    ...(initialData || {}),
    firstAttemptDate: normalizeDateForInput(initialData?.firstAttemptDate),
    nextEvaluationDate: normalizeDateForInput(initialData?.nextEvaluationDate),
    registrationDate:
      initialData?.registrationDate || initialData?.registeredDateRaw || "",
  }));

  // ✅ Draft-only fields (not written to lead doc)
  const [drafts, setDrafts] = useState(() => ({
    ...emptyDrafts,
  }));

  // 🔁 Re-sync whenever the lead changes (Firestore onSnapshot)
  useEffect(() => {
    setForm({
      ...emptyForm,
      ...(initialData || {}),
      firstAttemptDate: normalizeDateForInput(initialData?.firstAttemptDate),
      nextEvaluationDate: normalizeDateForInput(initialData?.nextEvaluationDate),
      registrationDate:
        initialData?.registrationDate || initialData?.registeredDateRaw || "",
    });

    // ✅ always clear note draft on lead refresh (prevents resubmits)
    setDrafts({ ...emptyDrafts });
  }, [initialData]);

  function handleChange(e) {
    const { name, value } = e.target;

    // route draft fields
    if (name === "journalNote") {
      setDrafts((prev) => ({ ...prev, journalNote: value }));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // ✅ pass lead fields + the note separately
    await onSave({
      ...form,
      journalNote: (drafts.journalNote || "").trim(),
    });

    // ✅ clear after save so it doesn't re-send
    setDrafts({ ...emptyDrafts });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm">
      {/* Name */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">First name</label>
          <input
            name="firstName"
            value={form.firstName}
            onChange={handleChange}
            required
            className="w-full border rounded-lg px-2.5 py-1.5"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Last name</label>
          <input
            name="lastName"
            value={form.lastName}
            onChange={handleChange}
            required
            className="w-full border rounded-lg px-2.5 py-1.5"
          />
        </div>
      </div>

      {/* Contact */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Phone</label>
          <input
            name="phone"
            value={form.phone}
            onChange={handleChange}
            className="w-full border rounded-lg px-2.5 py-1.5"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Email</label>
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            className="w-full border rounded-lg px-2.5 py-1.5"
          />
        </div>
      </div>

      {/* Status + type */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Status</label>
          <select
            name="status"
            value={form.status}
            onChange={handleChange}
            className="w-full border rounded-lg px-2.5 py-1.5"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Lead type</label>
          <select
            name="leadType"
            value={form.leadType}
            onChange={handleChange}
            className="w-full border rounded-lg px-2.5 py-1.5"
          >
            {LEAD_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Dates + engagement */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">First attempt</label>
          <input
            type="date"
            name="firstAttemptDate"
            value={form.firstAttemptDate || ""}
            onChange={handleChange}
            className="w-full border rounded-lg px-2.5 py-1.5"
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Engagement level</label>
          <select
            name="engagementLevel"
            value={form.engagementLevel}
            onChange={handleChange}
            className="w-full border rounded-lg px-2.5 py-1.5"
          >
            {ENGAGEMENT_LEVEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1 text-red-700">
            Due date
          </label>
          <input
            type="date"
            name="nextEvaluationDate"
            value={form.nextEvaluationDate || ""}
            onChange={handleChange}
            className="w-full border rounded-lg px-2.5 py-1.5 border-red-400 bg-red-50"
          />
          <p className="mt-1 text-[10px] text-red-700">
            This is the <span className="font-semibold">DUE DATE</span> for the next follow-up. Agents cannot change this.
          </p>
        </div>
      </div>

      {/* Rankings + source */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Relationship ranking</label>
          <select
            name="relationshipRanking"
            value={form.relationshipRanking}
            onChange={handleChange}
            className="w-full border rounded-lg px-2.5 py-1.5"
          >
            {RELATIONSHIP_RANK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Urgency ranking</label>
          <select
            name="urgencyRanking"
            value={form.urgencyRanking}
            onChange={handleChange}
            className="w-full border rounded-lg px-2.5 py-1.5"
          >
            {URGENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Source</label>
          <select
            name="source"
            value={form.source}
            onChange={handleChange}
            className="w-full border rounded-lg px-2.5 py-1.5"
          >
            {SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Registration date */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Registration date</label>
          <input
            type="text"
            name="registrationDate"
            placeholder="MM/DD/YYYY"
            value={form.registrationDate || ""}
            onChange={handleChange}
            className="w-full border rounded-lg px-2.5 py-1.5"
          />
        </div>
      </div>

      {/* Journal note */}
      <div>
        <label className="block text-xs font-medium mb-1">
          Journal (new note for this save)
        </label>
        <textarea
          name="journalNote"
          value={drafts.journalNote}
          onChange={handleChange}
          className="w-full border rounded-lg px-2.5 py-1.5 min-h-[70px]"
          placeholder="Optional note about this update..."
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-wrcBlack text-wrcYellow font-semibold px-4 py-2 rounded-lg text-sm hover:bg-black disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save lead"}
        </button>
      </div>
    </form>
  );
}
