// src/components/LeadFormAdmin.jsx
import React, { useEffect, useMemo, useState } from "react";
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

const emptyDrafts = {
  journalNote: "",
};

function normalizeDateForInput(value) {
  if (!value) return "";
  if (value?.toDate) {
    const d = value.toDate();
    return d.toISOString().slice(0, 10);
  }
  if (typeof value === "string") return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function SectionTitle({ title, subtitle }) {
  return (
    <div className="mb-4">
      <h4 className="text-lg font-extrabold text-[var(--color-wrcBlack)]">
        {title}
      </h4>
      {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
    </div>
  );
}

function FieldLabel({ children, tone = "default" }) {
  const toneClass =
    tone === "danger" ? "text-red-700 font-semibold" : "text-gray-600";
  return <label className={`block text-sm mb-1 ${toneClass}`}>{children}</label>;
}

export default function LeadFormAdmin({
  initialData,
  onSave,
  saving,
  assignableAgents = [],
  assignedAgentId = "",
  onAssignedAgentChange = () => {},
  showAssignmentSection = true,
}) {
  const isEditMode = !!(initialData?.docId || initialData?.id);

  const initialFormState = useMemo(
    () => ({
      ...emptyForm,
      ...(initialData || {}),
      firstAttemptDate: normalizeDateForInput(initialData?.firstAttemptDate),
      nextEvaluationDate: normalizeDateForInput(initialData?.nextEvaluationDate),
      registrationDate:
        initialData?.registrationDate || initialData?.registeredDateRaw || "",
      level: initialData?.level ?? "1",
      schedulingPriorityLevel:
        Number(initialData?.schedulingPriorityLevel || initialData?.levelOfUrgency) || 1,
    }),
    [initialData]
  );

  const [form, setForm] = useState(initialFormState);
  const [drafts, setDrafts] = useState({ ...emptyDrafts });

  useEffect(() => {
    setForm(initialFormState);
    setDrafts({ ...emptyDrafts });
  }, [initialFormState]);

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

    await onSave({
      ...form,
      journalNote: (drafts.journalNote || "").trim(),
    });

    setDrafts({ ...emptyDrafts });
  }

  const selectedAgent = useMemo(() => {
    if (!assignedAgentId) return null;
    return Array.isArray(assignableAgents)
      ? assignableAgents.find((ag) => ag.id === assignedAgentId)
      : null;
  }, [assignableAgents, assignedAgentId]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-sm">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-2xl font-extrabold text-[var(--color-wrcBlack)]">
                {isEditMode ? "Edit Lead" : "Add Lead"}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {isEditMode
                  ? "Review and update lead details, rankings, and follow-up timing."
                  : "Create a new lead and optionally assign it immediately."}
              </p>
            </div>

            <div className="text-xs text-gray-500">Admin-only</div>
          </div>
        </div>

        <div className="px-5 py-5 space-y-8">
         {showAssignmentSection && (
  <section>
    <SectionTitle
      title="Assignment"
      subtitle="Choose a primary assigned agent, or leave the lead unassigned."
    />

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <FieldLabel>Assign agent (optional)</FieldLabel>
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
        <FieldLabel>Selected agent</FieldLabel>
        <div className="w-full min-h-[42px] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 bg-gray-50">
          {selectedAgent ? (
            <div>
              <div className="font-medium text-gray-800">
                {selectedAgent.fullName || selectedAgent.email || "Unnamed user"}
              </div>
              {selectedAgent.email ? (
                <div className="text-blue-700 text-xs">{selectedAgent.email}</div>
              ) : null}
            </div>
          ) : (
            "No agent selected yet."
          )}
        </div>
      </div>
    </div>
  </section>
)}

          <section>
            <SectionTitle
              title="Lead information"
              subtitle="Basic contact and classification details for this lead."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <FieldLabel>First name</FieldLabel>
                <input
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
                />
              </div>

              <div>
                <FieldLabel>Last name</FieldLabel>
                <input
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <FieldLabel>Phone</FieldLabel>
                <input
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
                />
              </div>

              <div>
                <FieldLabel>Email</FieldLabel>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <FieldLabel>Status</FieldLabel>
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
                <FieldLabel>Lead type</FieldLabel>
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
          </section>

          <section>
            <SectionTitle
              title="Follow-up timing"
              subtitle="Set the lead phase, scheduling priority, and next due date."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div>
                <FieldLabel>First attempt</FieldLabel>
                <input
                  type="date"
                  name="firstAttemptDate"
                  value={form.firstAttemptDate || ""}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
                />
              </div>

              <div>
                <FieldLabel>Phase</FieldLabel>
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
                <FieldLabel>Scheduling Priority Level</FieldLabel>
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
                <FieldLabel tone="danger">Due date</FieldLabel>
                <input
                  type="date"
                  name="nextEvaluationDate"
                  value={form.nextEvaluationDate || ""}
                  onChange={handleChange}
                  className="w-full border rounded-lg px-3 py-2 text-base border-red-400 bg-red-50"
                />
                <p className="mt-1 text-[10px] text-red-700">
                  This is the <span className="font-semibold">due date</span> for the next follow-up. Agents cannot change this.
                </p>
              </div>
            </div>
          </section>

          <section>
            <SectionTitle
              title="Rankings and source"
              subtitle="Track relationship strength, urgency, and where the lead came from."
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <FieldLabel>Relationship ranking</FieldLabel>
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
                <FieldLabel>Urgency ranking</FieldLabel>
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
                <FieldLabel>Source</FieldLabel>
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
          </section>

          <section>
            <SectionTitle
              title="Administrative notes"
              subtitle="Optional details that help keep the lead record complete and current."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Registration date</FieldLabel>
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

            <div className="mt-4">
              <FieldLabel>Journal (new note for this save)</FieldLabel>
              <textarea
                name="journalNote"
                value={drafts.journalNote}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[90px] text-base"
                placeholder="Optional note about this update..."
              />
            </div>
          </section>

          <div className="pt-2 flex items-center justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-3 rounded-md bg-black text-[#fff200] text-sm font-extrabold hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Saving..." : isEditMode ? "Save lead" : "Create lead"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}