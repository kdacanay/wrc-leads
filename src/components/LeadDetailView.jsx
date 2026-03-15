import React from "react";
import LeadBadge from "./LeadBadge";
import LeadFormAdmin from "./LeadFormAdmin";
import LeadFormAgent from "./LeadFormAgent";
import JournalTimeline from "./JournalTimeline";
import {
  STATUS_LABELS,
  RELATIONSHIP_LABELS,
  URGENCY_LABELS,
  SOURCE_LABELS,
  LEAD_TYPE_LABELS,
} from "../constants/leadOptions";

function InfoCard({ title, children, right }) {
  return (
    <section className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-[var(--color-wrcBlack)]">
          {title}
        </h2>
        {right}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function SmallInfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-sm font-semibold text-gray-900 text-right">{value || "—"}</div>
    </div>
  );
}
function InfoBlock({ label, value }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-1 text-sm text-gray-900 break-words">{value || "—"}</div>
    </div>
  );
}

function getPhaseLabel(lead) {
  if (lead?.phase) return lead.phase;

  const level = String(lead?.level ?? "");
  if (level === "0") return "DNC";
  if (level === "1") return "Engagement Phase";
  if (level === "2") return "Relationship Building Phase";
  if (level === "3") return "Sphere of Influence Phase";

  return "";
}

export default function LeadDetailView({
  mode = "agent",
  lead,
  saving = false,
  onBack,
  onAdminSave,
  onAgentSave,
  sharedJournal = [],
  canEditJournal = false,
  onDeleteJournalEntry,
  onEditJournalEntry,
  topBadges = [],
  sidebar = null,
  statusMessage = "",
  statusType = "",
  latestAgentJournalText = "",
}) {
  if (!lead) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-semibold text-gray-800">Lead not found</div>
          <div className="mt-2 text-sm text-gray-500">
            This lead could not be loaded.
          </div>
        </div>
      </div>
    );
  }
const isAgentMode = mode === "agent";
  const fullName =
    `${lead.firstName || ""} ${lead.lastName || ""}`.trim() ||
    lead.fullName ||
    lead.name ||
    "Unnamed Lead";

  const assignedAgentText =
    lead.assignedAgentName || lead.assignedAgentEmail || "Unassigned";

  const phaseLabel = getPhaseLabel(lead);

  const defaultBadges = [
    lead.status
      ? {
          value: lead.status,
          label: STATUS_LABELS[lead.status] || lead.status,
        }
      : null,
    lead.relationshipRanking
      ? {
          value: lead.relationshipRanking,
          label:
            RELATIONSHIP_LABELS[lead.relationshipRanking] ||
            lead.relationshipRanking,
        }
      : null,
    lead.urgencyRanking
      ? {
          value: lead.urgencyRanking,
          label: URGENCY_LABELS[lead.urgencyRanking] || lead.urgencyRanking,
        }
      : null,
    phaseLabel
      ? {
          value: phaseLabel,
          label: phaseLabel,
        }
      : null,
    lead.schedulingPriorityLevel
      ? {
          value: String(lead.schedulingPriorityLevel),
          label: `Priority ${lead.schedulingPriorityLevel}`,
        }
      : null,
  ].filter(Boolean);

  const badgesToRender = topBadges.length ? topBadges : defaultBadges;

  const statusTone =
    statusType === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : statusType === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-gray-200 bg-gray-50 text-gray-700";

if (isAgentMode) {
  return (
    <div className="min-h-full bg-[var(--color-wrcGray)]">
      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="text-3xl font-extrabold text-[var(--color-wrcBlack)]">
            Lead Detail
          </div>

          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-semibold hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <section className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="px-6 py-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-sm text-gray-500">Weichert Realtors Cornerstone</div>
                <h1 className="mt-1 text-4xl font-extrabold text-[var(--color-wrcBlack)]">
                  {fullName}
                </h1>

                <div className="mt-2 text-lg text-gray-700">
                  Lead ID: {lead.docId || lead.id || "—"}
                </div>

                <div className="mt-1 text-lg text-gray-700">
                  Assigned agent: {assignedAgentText}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {badgesToRender.map((badge, idx) => (
                    <LeadBadge
                      key={`${badge.value}-${idx}`}
                      value={badge.value}
                      label={badge.label}
                    />
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={onBack}
                className="px-5 py-3 rounded-full border border-gray-300 bg-white text-lg font-semibold hover:bg-gray-50"
              >
                ← Back
              </button>
            </div>

            <div className="mt-6 max-w-xl rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Latest activity
              </div>
              <div className="mt-2 text-2xl font-semibold text-gray-900">
                {lead.latestActivity || "No recent activity"}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="px-6 py-6 flex items-start justify-between gap-6">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Action item
              </div>
              <div className="mt-2 text-3xl font-extrabold text-[var(--color-wrcBlack)]">
                {lead.actionItem || "No action item set"}
              </div>
              <div className="mt-4 text-2xl text-gray-700">
                Next Required Follow-Up:{" "}
                {lead.nextEvaluationDate ? formatDate(lead.nextEvaluationDate) : "Not set"}
              </div>
            </div>

            <div className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-lg font-semibold text-red-700">
              Needs attention
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-8 space-y-6">
            <InfoCard title="Update This Lead">
              <LeadFormAgent
                initialData={lead}
                saving={saving}
                onSave={onAgentSave}
              />
            </InfoCard>

            <InfoCard
              title="Journal"
              right={
                <div className="text-sm text-gray-500">
                  Shared notes
                </div>
              }
            >
              <JournalTimeline entries={sharedJournal} />
            </InfoCard>
          </div>

          <div className="xl:col-span-4 space-y-6">
            <InfoCard title="Profile">
              <div className="space-y-4">
                <SmallInfoRow label="Lead type" value={LEAD_TYPE_LABELS[lead.leadType] || lead.leadType} />
                <SmallInfoRow label="Source" value={SOURCE_LABELS[lead.source] || lead.source} />
                <SmallInfoRow label="Relationship" value={RELATIONSHIP_LABELS[lead.relationshipRanking] || lead.relationshipRanking} />
                <SmallInfoRow label="Urgency" value={URGENCY_LABELS[lead.urgencyRanking] || lead.urgencyRanking} />
                <SmallInfoRow label="Phase" value={phaseLabel} />
                <SmallInfoRow
                  label="Scheduling priority"
                  value={lead.schedulingPriorityLevel ? `Level ${lead.schedulingPriorityLevel}` : "—"}
                />
              </div>
            </InfoCard>

            <InfoCard title="Contact">
              <div className="space-y-3">
                <div className="text-lg text-blue-700">{lead.phone || "—"}</div>
                <div className="text-lg text-blue-700">{lead.email || "—"}</div>
              </div>
            </InfoCard>

            <InfoCard title="Dates">
              <div className="space-y-4">
                <SmallInfoRow label="Registered" value={lead.registrationDate || lead.registeredDateRaw} />
                <SmallInfoRow label="Next follow-up" value={lead.nextEvaluationDate ? formatDate(lead.nextEvaluationDate) : "—"} />
                <SmallInfoRow label="First attempt" value={lead.firstAttemptDate ? formatDate(lead.firstAttemptDate) : "—"} />
              </div>
            </InfoCard>
          </div>
        </div>
      </div>
    </div>
  );
}
}