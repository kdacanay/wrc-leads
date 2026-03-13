// src/components/LeadFormAgent.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  STATUS_OPTIONS,
  RELATIONSHIP_RANK_OPTIONS,
  URGENCY_OPTIONS,
  SOURCE_OPTIONS,
} from "../constants/leadOptions";

export default function LeadFormAgent({ lead, onSave, saving }) {
  const [form, setForm] = useState({
    status: lead?.status || "",
    relationshipRanking: lead?.relationshipRanking || "0",
    urgencyRanking: lead?.urgencyRanking || "unsure",
    journalEntry: "",
    requestReject: !!lead?.rejectionRequested,
    rejectionReason: lead?.rejectionReason || "",
  });

  // ✅ Prevent live snapshot updates from overwriting what the agent is typing
  const [isDirty, setIsDirty] = useState(false);

  // Filter out admin-only "bad_lead" from agent-facing status dropdown
  const agentStatusOptions = useMemo(() => {
    if (!Array.isArray(STATUS_OPTIONS)) return null;
    return STATUS_OPTIONS.filter((opt) => opt.value !== "bad_lead");
  }, []);

  // keep form in sync with live lead updates (but don't clobber local edits)
  useEffect(() => {
    if (!lead?.docId && !lead?.id) return;
    if (isDirty) return;

    setForm({
      status: lead?.status || "",
      relationshipRanking: lead?.relationshipRanking || "0",
      urgencyRanking: lead?.urgencyRanking || "unsure",
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
    lead?.rejectionRequested,
    lead?.rejectionReason,
    isDirty,
  ]);

  function handleChange(e) {
    const { name, value } = e.target;
    setIsDirty(true);
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!onSave) return;

    await onSave(form);

    // ✅ Let the form re-sync from Firestore after save
    setIsDirty(false);

    // Optional: clear journal box after save (UI-only)
    setForm((prev) => ({ ...prev, journalEntry: "" }));
  }

  const sourceValue = lead?.source || "";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm">
      {/* Status + Source */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Status</label>
          <select
            name="status"
            value={form.status}
            onChange={handleChange}
            className="w-full border rounded-lg px-2.5 py-1.5"
          >
            {agentStatusOptions ? (
              agentStatusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            ) : (
              <>
                <option value="">Unset</option>
                <option value="new">New</option>
                <option value="engagement">Engagement phase</option>
                <option value="in_pipeline">In pipeline</option>
                <option value="closed">Closed</option>
              </>
            )}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">
            Source (read-only)
          </label>
          <select
            value={sourceValue}
            disabled
            className="w-full border rounded-lg px-2.5 py-1.5 bg-gray-50 text-gray-700 cursor-not-allowed"
            title="Source is set by admin"
          >
            {Array.isArray(SOURCE_OPTIONS) ? (
              SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            ) : (
              <option value={sourceValue}>{sourceValue || "—"}</option>
            )}
          </select>

          <div className="mt-1 text-[11px] text-gray-500">Source is set by admin.</div>
        </div>
      </div>

      {/* Rankings */}
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
      </div>

      {/* Journal note */}
      <div>
        <label className="block text-xs font-medium mb-1">Journal note</label>
        <textarea
          name="journalEntry"
          value={form.journalEntry}
          onChange={handleChange}
          className="w-full border rounded-lg px-2.5 py-1.5 min-h-[70px]"
          placeholder="Add a brief update about your interaction..."
        />
      </div>

{/* Rejection request */}
<div className="border border-gray-200 rounded-xl p-3 bg-gray-50">
  <label className="flex items-start gap-2 text-xs font-medium text-gray-800">
    <input
      type="checkbox"
      name="requestReject"
      checked={!!form.requestReject}
      onChange={(e) =>
        setForm((prev) => ({
          ...prev,
          requestReject: e.target.checked,
          rejectionReason: e.target.checked ? (prev.rejectionReason || "") : "",
        }))
      }
      className="mt-0.5"
    />
    Request Rejection (Bad Lead)
  </label>

  <div className="mt-2 text-[11px] text-gray-600">
    This does not remove the lead. Admin will review and approve/deny.
  </div>

  {form.requestReject ? (
    <div className="mt-2">
      <label className="block text-xs font-medium mb-1">
        Why should this lead be rejected?
      </label>
      <textarea
        name="rejectionReason"
        value={form.rejectionReason || ""}
        onChange={(e) =>
          setForm((prev) => ({ ...prev, rejectionReason: e.target.value }))
        }
        className="w-full border rounded-lg px-2.5 py-1.5 min-h-[70px]"
        placeholder="Ex: disconnected number, spam inquiry, wrong location, already working with another agent, etc."
      />
    </div>
  ) : null}
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
