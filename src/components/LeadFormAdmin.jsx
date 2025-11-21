// src/components/LeadFormAdmin.jsx
import React, { useState } from "react";
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
  engagementLevel: "attempt_1",
  nextEvaluationDate: "",
  relationshipRanking: "0",
  urgencyRanking: "unsure",
  source: "other",
  assignedAgentName: "",
  assignedAgentEmail: "",
  journalLastEntry: "",
};

export default function LeadFormAdmin({ initialData, onSave, saving }) {
  const [form, setForm] = useState({
    ...emptyForm,
    ...(initialData || {}),
    firstAttemptDate: initialData?.firstAttemptDate || "",
    nextEvaluationDate: initialData?.nextEvaluationDate || "",
  });

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await onSave(form);
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
          <label className="block text-xs font-medium mb-1">
            First attempt
          </label>
          <input
            type="date"
            name="firstAttemptDate"
            value={form.firstAttemptDate || ""}
            onChange={handleChange}
            className="w-full border rounded-lg px-2.5 py-1.5"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">
            Engagement level
          </label>
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
          <label className="block text-xs font-medium mb-1">
            Next evaluation
          </label>
          <input
            type="date"
            name="nextEvaluationDate"
            value={form.nextEvaluationDate || ""}
            onChange={handleChange}
            className="w-full border rounded-lg px-2.5 py-1.5"
          />
        </div>
      </div>

      {/* Rankings + source */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">
            Relationship ranking
          </label>
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
          <label className="block text-xs font-medium mb-1">
            Urgency ranking
          </label>
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

      {/* Assigned agent */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">
            Assigned agent name
          </label>
          <input
            name="assignedAgentName"
            value={form.assignedAgentName}
            onChange={handleChange}
            className="w-full border rounded-lg px-2.5 py-1.5"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">
            Assigned agent email
          </label>
          <input
            name="assignedAgentEmail"
            value={form.assignedAgentEmail}
            onChange={handleChange}
            className="w-full border rounded-lg px-2.5 py-1.5"
          />
        </div>
      </div>

      {/* Journal seed */}
      <div>
        <label className="block text-xs font-medium mb-1">
          Journal (initial note)
        </label>
        <textarea
          name="journalLastEntry"
          value={form.journalLastEntry}
          onChange={handleChange}
          className="w-full border rounded-lg px-2.5 py-1.5 min-h-[70px]"
          placeholder="Optional first note about this lead..."
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
