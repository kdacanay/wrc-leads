import React, { useEffect, useMemo, useState } from "react";
import {
  STATUS_OPTIONS,
  RELATIONSHIP_RANK_OPTIONS,
  URGENCY_OPTIONS,
  SOURCE_OPTIONS,
} from "../constants/leadOptions";
import { LEVEL_DROPDOWN_OPTIONS } from "../utils/phaseLevel";
import { SCHEDULING_PRIORITY_OPTIONS } from "../utils/schedulingPriority";

function normalizeStatus(value) {
  return String(value || "").trim();
}

export default function LeadFormAgent({ initialData, onSave, saving }) {
  const lead = initialData || null;

  const [form, setForm] = useState({
    status: normalizeStatus(lead?.status) || "Identified",
    relationshipRanking: lead?.relationshipRanking || "0",
    urgencyRanking: lead?.urgencyRanking || "unsure",
    level: lead?.level || "1",
    schedulingPriorityLevel:
      Number(lead?.schedulingPriorityLevel || lead?.levelOfUrgency) || 1,
    journalEntry: "",
    requestReject: !!lead?.rejectionRequested,
    rejectionReason: lead?.rejectionReason || "",
  });

  const [isDirty, setIsDirty] = useState(false);

  const agentStatusOptions = useMemo(() => {
    if (!Array.isArray(STATUS_OPTIONS)) return [];
    return STATUS_OPTIONS.filter((opt) => opt !== "bad_lead");
  }, []);

  useEffect(() => {
    if (!lead?.docId && !lead?.id) return;
    if (isDirty) return;

    setForm({
      status: normalizeStatus(lead?.status) || "Identified",
      relationshipRanking: lead?.relationshipRanking || "0",
      urgencyRanking: lead?.urgencyRanking || "unsure",
      level: lead?.level || "1",
      schedulingPriorityLevel:
        Number(lead?.schedulingPriorityLevel || lead?.levelOfUrgency) || 1,
      journalEntry: "",
      requestReject: !!lead?.rejectionRequested,
      rejectionReason: lead?.rejectionReason || "",
    });
  }, [
    lead?.docId,
    lead?.id,
    lead?.status,
    lead?.relationshipRanking,
    lead?.urgencyRanking,
    lead?.level,
    lead?.schedulingPriorityLevel,
    lead?.levelOfUrgency,
    lead?.rejectionRequested,
    lead?.rejectionReason,
    isDirty,
  ]);

  function handleChange(e) {
    const { name, value } = e.target;
    setIsDirty(true);
    setForm((prev) => ({
      ...prev,
      [name]:
        name === "schedulingPriorityLevel" ? Number(value) : value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!onSave) return;

    await onSave(form);

    setIsDirty(false);
    setForm((prev) => ({ ...prev, journalEntry: "" }));
  }

  const sourceValue = lead?.source || "";

  return (
    <form onSubmit={handleSubmit} className="space-y-5 text-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">
            Relationship ranking
          </label>
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
          <label className="block text-sm text-gray-600 mb-1">
            Urgency ranking
          </label>
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
        <div className="flex items-center justify-between">
          <label className="block text-sm text-gray-600 mb-1">
            Scheduling Priority Level
          </label>
        </div>
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
        <label className="block text-sm text-gray-600 mb-1">Status</label>
        <select
          name="status"
          value={form.status}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
        >
          {agentStatusOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div className="text-xs text-gray-500">
        Source:{" "}
        <span className="font-medium text-gray-700">
          {SOURCE_OPTIONS.find((opt) => opt.value === sourceValue)?.label || sourceValue || "—"}
        </span>
      </div>

      <div className="border-t border-gray-200 pt-4">
  <div className="text-sm text-gray-600 mb-2">
    Add a journal note for this update.
  </div>
</div>

<div>
  <label className="block text-sm text-gray-600 mb-1">Journal note</label>
  <textarea
    name="journalEntry"
    value={form.journalEntry}
    onChange={handleChange}
    className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[90px] text-base"
    placeholder="Add a brief update about your interaction..."
  />
</div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="bg-black text-[#fff200] font-extrabold px-5 py-3 rounded-lg text-sm hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}