// src/components/LeadFormAgent.jsx
import React, { useState, useEffect } from "react";
import {
  RELATIONSHIP_RANK_OPTIONS,
  URGENCY_OPTIONS,
} from "../constants/leadOptions";

export default function LeadFormAgent({ lead, onSave, saving }) {
  const [form, setForm] = useState({
    relationshipRanking: lead.relationshipRanking || "0",
    urgencyRanking: lead.urgencyRanking || "unsure",
    journalEntry: "",
  });

  // keep form in sync with live lead updates
  useEffect(() => {
    setForm({
      relationshipRanking: lead.relationshipRanking || "0",
      urgencyRanking: lead.urgencyRanking || "unsure",
      journalEntry: "",
    });
  }, [lead]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await onSave(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm">
      {/* Rankings only */}
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

      {/* Journal note */}
      <div>
        <label className="block text-xs font-medium mb-1">
          Journal note
        </label>
        <textarea
          name="journalEntry"
          value={form.journalEntry}
          onChange={handleChange}
          className="w-full border rounded-lg px-2.5 py-1.5 min-h-[70px]"
          placeholder="Add a brief update about your interaction..."
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="bg-wrcBlack text-wrcYellow font-semibold px-4 py-2 rounded-lg text-sm hover:bg-black disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}

