// src/components/LeadFormAgent.jsx
import React, { useState } from "react";
import {
  ENGAGEMENT_LEVEL_OPTIONS,
  RELATIONSHIP_RANK_OPTIONS,
  URGENCY_OPTIONS,
} from "../constants/leadOptions";

const initialState = (lead) => ({
  firstAttemptDate: lead.firstAttemptDate || "",
  engagementLevel: lead.engagementLevel || "attempt_1",
  nextEvaluationDate: lead.nextEvaluationDate || "",
  relationshipRanking: lead.relationshipRanking || "18",
  urgencyRanking: lead.urgencyRanking || "unsure",
  journalEntry: "",
});

export default function LeadFormAgent({ lead, onSave, saving }) {
  const [form, setForm] = useState(initialState(lead));

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

 async function handleSubmit(e) {
  e.preventDefault();
  await onSave(form);

  // After a successful save, clear the note box
  setForm((prev) => ({
    ...prev,
    journalEntry: "",
  }));
}

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm">
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
  <label className="block text-xs font-semibold text-gray-700 mb-1">
    Next evaluation
  </label>

  <div className="text-xs text-gray-800">
    {form.nextEvaluationDate ? form.nextEvaluationDate : "-"}
  </div>
</div>


      </div>

      <div className="grid grid-cols-2 gap-3">
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
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">
          Journal entry
        </label>
        <textarea
          name="journalEntry"
          value={form.journalEntry}
          onChange={handleChange}
          placeholder="What did you do? Call, text, email, meeting notes..."
          className="w-full border rounded-lg px-2.5 py-1.5 min-h-[90px]"
        />
        <p className="mt-1 text-[11px] text-gray-500">
          This will be added to the running journal and shown to admins.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="bg-wrcBlack text-wrcYellow font-semibold px-4 py-2 rounded-lg text-sm hover:bg-black disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save update"}
        </button>
      </div>
    </form>
  );
}
