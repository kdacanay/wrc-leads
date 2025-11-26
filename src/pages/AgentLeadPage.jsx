// src/pages/AgentLeadPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import LeadBadge from "../components/LeadBadge";
import LeadFormAgent from "../components/LeadFormAgent";
import JournalTimeline from "../components/JournalTimeline";
import {
  STATUS_LABELS,
  LEAD_TYPE_LABELS,
  RELATIONSHIP_LABELS,
  URGENCY_LABELS,
  SOURCE_LABELS,
} from "../constants/leadOptions";

// You can set this in your .env as VITE_ADMIN_ALERT_EMAIL="you@yourdomain.com"
const ADMIN_ALERT_EMAIL =
  import.meta.env.VITE_ADMIN_ALERT_EMAIL || "admin@example.com";

function emailAdminAboutLeadUpdate(lead, activityText, agentUser, adminEmail = ADMIN_ALERT_EMAIL) {
  if (!adminEmail) {
    alert(
      "Admin alert email is not configured. Set VITE_ADMIN_ALERT_EMAIL in your .env file."
    );
    return;
  }

  const url = `${window.location.origin}/admin/lead/${lead.id}`;

  const subject = `Lead updated by ${
    agentUser?.email || "agent"
  }: ${(lead.firstName || "") + " " + (lead.lastName || "")}`.trim();

  const bodyLines = [
    `Hi,`,
    "",
    `An agent has updated a lead in the WRC Lead Dashboard.`,
    "",
    `Agent: ${agentUser?.email || "(unknown agent)"}`,
    `Lead: ${(lead.firstName || "") + " " + (lead.lastName || "")} (ID: ${lead.id})`,
    "",
    `Summary of latest activity:`,
    activityText || "(no summary available)",
    "",
    `View the lead in your admin dashboard:`,
    url,
    "",
    "Thank you.",
  ];

  const body = bodyLines.join("\n");

  const mailto = `mailto:${encodeURIComponent(
    adminEmail
  )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  window.location.href = mailto;
}

// 🔔 Change this to whatever email should receive agent updates
// const ADMIN_NOTIFY_EMAIL = "your.email@weichertcr.com";

// function emailAdminAboutLeadUpdate(lead, activityText, agentUser) {
//   if (!ADMIN_NOTIFY_EMAIL || ADMIN_NOTIFY_EMAIL === "kdacanay@weichertcr.com") {
//     console.warn(
//       "ADMIN_NOTIFY_EMAIL is not configured. Update it at the top of AgentLeadPage.jsx."
//     );
//     return;
//   }

//   if (!lead) return;

//   const adminUrl = `${window.location.origin}/admin/lead/${lead.id}`;
//   const agentNameOrEmail =
//     agentUser?.displayName || agentUser?.email || "Unknown agent";

//   const subject = `Agent update on lead: ${
//     lead.firstName || ""
//   } ${lead.lastName || ""}`.trim();

//   const bodyLines = [
//     `Hi,`,
//     "",
//     `An agent has updated a lead in the WRC Leads app.`,
//     "",
//     `Agent: ${agentNameOrEmail}`,
//     "",
//     `Lead: ${lead.firstName || ""} ${lead.lastName || ""}`.trim(),
//     `Lead ID: ${lead.id}`,
//     "",
//     `Summary of change:`,
//     activityText || "(No activity summary provided.)",
//     "",
//     `You can view this lead in the admin view here:`,
//     adminUrl,
//     "",
//     "This email was generated from the WRC Leads app.",
//   ];

//   const mailto = `mailto:${encodeURIComponent(
//     ADMIN_NOTIFY_EMAIL
//   )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
//     bodyLines.join("\n")
//   )}`;

//   window.location.href = mailto;
// }

function buildAgentActivityChanges(oldLead, form) {
  const changes = [];

  const before = {
    relationshipRanking: oldLead.relationshipRanking || "",
    urgencyRanking: oldLead.urgencyRanking || "",
  };

  const after = {
    relationshipRanking: form.relationshipRanking || "",
    urgencyRanking: form.urgencyRanking || "",
  };

  if (before.relationshipRanking !== after.relationshipRanking) {
    changes.push(
      `relationship to "${after.relationshipRanking || "-"}"`
    );
  }

  if (before.urgencyRanking !== after.urgencyRanking) {
    changes.push(`urgency to "${after.urgencyRanking || "-"}"`);
  }

  const hasAnyDiff =
    JSON.stringify(before) !== JSON.stringify(after);

  return { changes, hasAnyDiff };
}




function formatDate(value) {
  if (!value) return "";
  if (value.toDate) {
    const d = value.toDate();
    return d.toISOString().split("T")[0];
  }
  return value;
}

export default function AgentLeadPage() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
const [status, setStatus] = useState({ type: "", message: "" });
  useEffect(() => {
    if (!leadId) return;
    const ref = doc(db, "leads", leadId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setError("Lead not found.");
          setLead(null);
        } else {
          setLead({ id: snap.id, ...snap.data() });
          setError("");
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error loading lead:", err);
        setError("Error loading lead.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [leadId]);

async function handleAgentSave(form) {
  if (!lead) return;
  setSaving(true);

  try {
    const ref = doc(db, "leads", lead.id);

    const { changes, hasAnyDiff } = buildAgentActivityChanges(lead, form);
    const trimmedNote = form.journalEntry?.trim() || "";

    let activityText = "";

    if (!hasAnyDiff && !trimmedNote) {
      activityText = "Agent saved lead with no field changes.";
    } else {
      if (changes.length > 0) {
        activityText = `Agent updated ${changes.join(", ")}.`;
      } else if (hasAnyDiff) {
        activityText = "Agent updated lead fields.";
      }

      if (trimmedNote) {
        activityText += (activityText ? " " : "") + `Note: "${trimmedNote}"`;
      }
    }

    const updateData = {
      // ❌ no firstAttemptDate
      // ❌ no engagementLevel
      // ❌ no nextEvaluationDate

      relationshipRanking: form.relationshipRanking,
      urgencyRanking: form.urgencyRanking,

      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
      latestActivity: activityText,
      journalLastEntry: activityText,

      journal: arrayUnion({
        id: crypto.randomUUID(),
        createdAt: new Date(),
        createdBy: user.uid,
        createdByEmail: user.email,
        text: activityText,
        type: trimmedNote ? "note" : "agent-update",
      }),
    };

    await updateDoc(ref, updateData);

    // keep your "email admin about update?" logic here if you already added it
  } catch (err) {
    console.error("Error:", err);
    alert("Error saving lead. Check console for details.");
  }

  setSaving(false);
}



  if (loading) {
    return (
      <div className="text-sm text-gray-600">
        Loading lead details...
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="text-sm text-red-600">
        {error || "Lead not found."}
      </div>
    );
  }

  return (
    <div className="space-y-5 text-sm">
      {/* Back button */}
      <div>
        <button
          type="button"
          onClick={() => navigate("/agent")}
          className="inline-flex items-center text-xs text-gray-600 hover:text-gray-900 hover:underline mb-2"
        >
          ← Back to My Leads
        </button>
      </div>
{status.message && (
  <div
    className={`text-xs px-3 py-2 rounded border ${
      status.type === "success"
        ? "border-green-200 bg-green-50 text-green-700"
        : "border-red-200 bg-red-50 text-red-700"
    }`}
  >
    {status.message}
  </div>
)}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        {/* Left: header info */}
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            {lead.firstName} {lead.lastName}
          </h1>
          <p className="text-xs text-gray-600">
            Lead ID:{" "}
            <span className="font-mono text-[11px] bg-gray-100 px-1.5 py-0.5 rounded">
              {lead.id}
            </span>
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Assigned agent:{" "}
            {lead.assignedAgentName ? (
              <>
                <span className="font-medium">
                  {lead.assignedAgentName}
                </span>
                {lead.assignedAgentEmail && (
                  <> &middot; {lead.assignedAgentEmail}</>
                )}
              </>
            ) : (
              <span className="italic text-gray-400">Unassigned</span>
            )}
          </p>
        </div>

        {/* Status badges still optional here */}
      </div>

      {/* 🔶 Admin Action Item banner (read-only) */}
      {lead.actionItem && (
        <div className="border-l-4 border-amber-400 bg-amber-50 p-3 rounded-md text-xs">
          <div className="font-semibold text-amber-800">
            Admin action item
          </div>
          <div className="mt-1 text-amber-900 whitespace-pre-line">
            {lead.actionItem}
          </div>
        </div>
      )}

      {/* Contact & meta */}
      <div className="grid md:grid-cols-3 gap-4 border border-gray-200 rounded-lg p-3 bg-gray-50">
        <div>
          <h2 className="text-xs font-semibold text-gray-700 mb-1">
            Contact
          </h2>
          <div className="text-xs text-gray-800 space-y-0.5">
            {lead.phone && <div>📞 {lead.phone}</div>}
            {lead.email && (
              <div>
                ✉️{" "}
                <a
                  href={`mailto:${lead.email}`}
                  className="text-blue-700 hover:underline"
                >
                  {lead.email}
                </a>
              </div>
            )}
          </div>
        </div>

<div>
  <h2 className="text-xs font-semibold text-gray-700 mb-1">
    Lead details
  </h2>
  <div className="text-xs text-gray-800 space-y-0.5">
    <div>
      Registered:{" "}
      {lead.registrationDate
        ? lead.registrationDate
        : lead.registeredDateRaw
        ? lead.registeredDateRaw
        : "No registration date"}
    </div>
    {/* <div>
      Due date: {formatDate(lead.nextEvaluationDate) || "No due date"}
    </div> */}
  </div>

          <div className="text-xs text-gray-800 space-y-0.5">
            {/* <div>
              First attempt: {formatDate(lead.firstAttemptDate) || "-"}
            </div> */}
         <div>
            
  <span className="font-semibold text-red-700">Due date:</span>{" "}
  <span className="text-xs text-gray-900">
    {formatDate(lead.nextEvaluationDate) || "-"}
  </span>
</div>
<p className="text-[10px] text-gray-500 mt-0.5">
  Set by admin. This is the <span className="font-semibold">DUE DATE</span> for your next follow-up.
</p>

          </div>
        </div>

        <div>
          <h2 className="text-xs font-semibold text-gray-700 mb-1">
            Latest activity
          </h2>
          <div className="text-xs text-gray-800 space-y-0.5">
            {(() => {
              let latestText = "";
              let latestTime = 0;

              // 1) Most recent journal entry by createdAt
              if (Array.isArray(lead.journal) && lead.journal.length > 0) {
                for (const entry of lead.journal) {
                  if (!entry) continue;

                  const createdAt = entry.createdAt;
                  const t = createdAt?.toMillis
                    ? createdAt.toMillis()
                    : createdAt
                    ? new Date(createdAt).getTime()
                    : 0;

                  if (t >= latestTime && entry.text) {
                    latestTime = t;
                    latestText = entry.text;
                  }
                }
              }

              // 2) Fallback to journalLastEntry
              if (!latestText && lead.journalLastEntry) {
                latestText = lead.journalLastEntry;
              }

              // 3) Fallback to latestActivity
              if (!latestText && lead.latestActivity) {
                latestText = lead.latestActivity;
              }

              if (!latestText) {
                return (
                  <span className="text-gray-400 italic">
                    No recent activity.
                  </span>
                );
              }

              return <span className="text-gray-700">{latestText}</span>;
            })()}
          </div>
        </div>
      </div>

      {/* Two-column layout: agent form + journal */}
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            Update this lead
          </h2>
          <LeadFormAgent
            lead={lead}
            onSave={handleAgentSave}
            saving={saving}
          />
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            Journal
          </h2>
          <JournalTimeline entries={lead.journal} />
        </div>
      </div>
    </div>
  );
}
