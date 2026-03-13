import React from "react";
import LeadFormAdmin from "./LeadFormAdmin";
import LeadFormAgent from "./LeadFormAgent";
import LeadJournal from "./LeadJournal";
import LeadActivityFeed from "./LeadActivityFeed";
import LeadBadge from "./LeadBadge";

export default function LeadDetailView({
  lead,
  isAdmin = false,
  onLeadUpdated,
  onClose,
}) {
  if (!lead) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="text-lg font-semibold text-gray-800">Lead not found</div>
        <div className="mt-2 text-sm text-gray-500">
          This lead could not be loaded.
        </div>
      </div>
    );
  }

  const fullName =
    lead.fullName ||
    [lead.firstName, lead.lastName].filter(Boolean).join(" ") ||
    lead.name ||
    "Unnamed Lead";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{fullName}</h1>

            <div className="mt-2 space-y-1 text-sm text-gray-600">
              <div>
                <span className="font-semibold text-gray-800">Email:</span>{" "}
                {lead.email || "—"}
              </div>
              <div>
                <span className="font-semibold text-gray-800">Phone:</span>{" "}
                {lead.phone || "—"}
              </div>
              <div>
                <span className="font-semibold text-gray-800">Source:</span>{" "}
                {lead.source || "—"}
              </div>
              <div>
                <span className="font-semibold text-gray-800">Assigned Agent:</span>{" "}
                {lead.assignedAgentName || lead.assignedAgentEmail || "Unassigned"}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <LeadBadge label="Status" value={lead.status || "—"} />
            <LeadBadge label="Phase" value={lead.phase || "—"} />
            <LeadBadge
              label="Relationship"
              value={lead.relationshipRanking || lead.relationshipRank || "—"}
            />
            <LeadBadge
              label="Urgency"
              value={lead.urgencyRanking || lead.urgencyRank || "—"}
            />
            <LeadBadge
              label="Priority"
              value={lead.schedulingPriority || lead.schedulingPriorityLevel || "—"}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 text-lg font-semibold text-gray-900">
              {isAdmin ? "Admin lead details" : "Lead details"}
            </div>

            {isAdmin ? (
              <LeadFormAdmin
                lead={lead}
                onLeadUpdated={onLeadUpdated}
              />
            ) : (
              <LeadFormAgent
                lead={lead}
                onLeadUpdated={onLeadUpdated}
              />
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 text-lg font-semibold text-gray-900">
              Journal
            </div>
            <LeadJournal lead={lead} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 text-lg font-semibold text-gray-900">
              Activity
            </div>
            <LeadActivityFeed lead={lead} />
          </div>

          {onClose ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Close
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}