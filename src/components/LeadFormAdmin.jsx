// src/components/LeadFormAdmin.jsx
import React, { useState, useEffect, useMemo } from "react";
import {
  STATUS_OPTIONS,
  LEAD_TYPE_OPTIONS,
  RELATIONSHIP_RANK_OPTIONS,
  URGENCY_OPTIONS,
  SOURCE_OPTIONS,
} from "../constants/leadOptions";
import { LEVEL_DROPDOWN_OPTIONS } from "../utils/phaseLevel";
import { SCHEDULING_PRIORITY_OPTIONS } from "../utils/schedulingPriority";

const emptyForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  status: "Identified",
  leadType: "buyer",
  firstAttemptDate: "",
  level: "1",
schedulingPriorityLevel: 1,
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

export default function LeadFormAdmin({
  initialData,
  onSave,
  saving,
  assignableAgents = [],
  assignedAgentId = "",
  onAssignedAgentChange = () => {},
}) {
  // ✅ Only the true lead-edit fields go in `form`
  const [form, setForm] = useState(() => ({
    ...emptyForm,
    ...(initialData || {}),
    firstAttemptDate: normalizeDateForInput(initialData?.firstAttemptDate),
    nextEvaluationDate: normalizeDateForInput(initialData?.nextEvaluationDate),
    registrationDate:
      initialData?.registrationDate || initialData?.registeredDateRaw || "",
      level: initialData?.level ?? "1",
schedulingPriorityLevel:
  Number(initialData?.schedulingPriorityLevel || initialData?.levelOfUrgency) || 1,
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
        level: initialData?.level ?? "1",
schedulingPriorityLevel:
  Number(initialData?.schedulingPriorityLevel || initialData?.levelOfUrgency) || 1,
        
    });

    // ✅ always clear note draft on lead refresh (prevents resubmits)
    setDrafts({ ...emptyDrafts });
  }, [initialData]);

function handleChange(e) {
  const { name, value } = e.target;

  if (name === "journalNote") {
    setDrafts((prev) => ({ ...prev, journalNote: value }));
    return;
  }

  setForm((prev) => ({
    ...prev,
    [name]: name === "schedulingPriorityLevel" ? Number(value) : value,
  }));
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
    <form onSubmit={handleSubmit} className="space-y-6 text-sm">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-2xl font-extrabold text-[var(--color-wrcBlack)]">
                Add Lead
              </h3>
              {/* <p className="text-sm text-gray-500">
                Quick create a new lead
              </p> */}
            </div>

            <div className="text-xs text-gray-500">Admin-only</div>
          </div>
        </div>

        <div className="px-5 py-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div>
    <label className="block text-sm text-gray-600 mb-1">
      Assign agent (optional)
    </label>
    <select
      value={assignedAgentId}
      onChange={(e) => onAssignedAgentChange(e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
    >
      <option value="">-- Leave unassigned --</option>
      {Array.isArray(assignableAgents) &&
        assignableAgents.map((a) => (
          <option key={a.id} value={a.id}>
            {(a.fullName || a.email || "Unnamed user") +
              (a.email ? ` (${a.email})` : "")}
          </option>
        ))}
    </select>
  </div>

  <div>
    <label className="block text-sm text-gray-600 mb-1">
      Selected agent
    </label>
    <div className="w-full min-h-[42px] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 bg-gray-50">
      {assignedAgentId
        ? (() => {
            const a =
              Array.isArray(assignableAgents) &&
              assignableAgents.find((ag) => ag.id === assignedAgentId);

            if (!a) return "No agent selected yet.";

            return (
              <div>
                <div className="font-medium text-gray-800">
                  {a.fullName || a.email || "Unnamed user"}
                </div>
                {a.email && (
                  <div className="text-blue-700 text-xs">{a.email}</div>
                )}
              </div>
            );
          })()
        : "No agent selected yet."}
    </div>
  </div>
</div>
      {/* Name */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">First name</label>
          <input
            name="firstName"
            value={form.firstName}
            onChange={handleChange}
            required
           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Last name</label>
          <input
            name="lastName"
            value={form.lastName}
            onChange={handleChange}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
          />
        </div>
      </div>

      {/* Contact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Phone</label>
          <input
            name="phone"
            value={form.phone}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
          />
        </div>
        <div>
         <label className="block text-sm text-gray-600 mb-1">Email</label>
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
          />
        </div>
      </div>

{/* Status + type */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div>
    <label className="block text-sm text-gray-600 mb-1">Status</label>
    <select
      name="status"
      value={form.status}
      onChange={handleChange}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
    >
      {STATUS_OPTIONS.map((opt) => {
        const value = typeof opt === "string" ? opt : opt.value;
        const label = typeof opt === "string" ? opt : opt.label;
        return (
          <option key={value} value={value}>
            {label}
          </option>
        );
      })}
    </select>
  </div>

  <div>
   <label className="block text-sm text-gray-600 mb-1">Lead type</label>
    <select
      name="leadType"
      value={form.leadType}
      onChange={handleChange}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
    >
      {LEAD_TYPE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
</div>

{/* Dates + phase + scheduling priority */}
<div className="grid grid-cols-4 gap-3">
  <div>
    <label className="block text-sm text-gray-600 mb-1">First attempt</label>
    <input
      type="date"
      name="firstAttemptDate"
      value={form.firstAttemptDate || ""}
      onChange={handleChange}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
    />
  </div>

  <div>
    <label className="block text-sm text-gray-600 mb-1">Phase</label>
    <select
      name="level"
      value={form.level}
      onChange={handleChange}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
    >
      {LEVEL_DROPDOWN_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>

  <div>
    <label className="block text-sm text-gray-600 mb-1">
      Scheduling Priority Level
    </label>
    <select
      name="schedulingPriorityLevel"
      value={form.schedulingPriorityLevel}
      onChange={handleChange}
     className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
    >
      {SCHEDULING_PRIORITY_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.dropdownLabel}
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
      className="w-full border rounded-lg px-3 py-2 text-base border-red-400 bg-red-50"
    />
    <p className="mt-1 text-[10px] text-red-700">
      This is the <span className="font-semibold">DUE DATE</span> for the next follow-up. Agents cannot change this.
    </p>
  </div>
</div>

      {/* Rankings + source */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Relationship ranking</label>
          <select
            name="relationshipRanking"
            value={form.relationshipRanking}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
          >
            {RELATIONSHIP_RANK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
         <label className="block text-sm text-gray-600 mb-1">Urgency ranking</label>
          <select
            name="urgencyRanking"
            value={form.urgencyRanking}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
          >
            {URGENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Source</label>
          <select
            name="source"
            value={form.source}
            onChange={handleChange}
           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
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
          <label className="block text-sm text-gray-600 mb-1">Registration date</label>
          <input
            type="text"
            name="registrationDate"
            placeholder="MM/DD/YYYY"
            value={form.registrationDate || ""}
            onChange={handleChange}
           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
          />
        </div>
      </div>

      {/* Journal note */}
      <div>
       <label className="block text-sm text-gray-600 mb-1">
          Journal (new note for this save)
        </label>
        <textarea
          name="journalNote"
          value={drafts.journalNote}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[90px] text-base"
          placeholder="Optional note about this update..."
        />
      </div>

      <div className="pt-2">
      <button
  type="submit"
  disabled={saving}
 className="px-5 py-3 rounded-md bg-black text-[#fff200] text-sm font-extrabold hover:opacity-90 disabled:opacity-60"
>
  {saving ? "Saving..." : "Save lead"}
</button>
      </div>
              </div>
      </div>
    </form>
    
  );
}
