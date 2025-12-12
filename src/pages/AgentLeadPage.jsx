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
import LeadFormAgent from "../components/LeadFormAgent";
import JournalTimeline from "../components/JournalTimeline";

const ADMIN_ALERT_EMAIL =
  import.meta.env.VITE_ADMIN_ALERT_EMAIL || "admin@example.com";

function emailAdminAboutLeadUpdate(
  lead,
  activityText,
  agentUser,
  adminEmail = ADMIN_ALERT_EMAIL
) {
  if (!adminEmail) return;

  const url = `${window.location.origin}/admin/lead/${lead.id}`;
  const subject = `Lead updated by ${agentUser?.email || "agent"}: ${(
    (lead.firstName || "") +
    " " +
    (lead.lastName || "")
  ).trim()}`.trim();

  const bodyLines = [
    `Hi,`,
    "",
    `An agent has updated a lead in the WRC Lead Dashboard.`,
    "",
    `Agent: ${agentUser?.email || "(unknown agent)"}`,
    `Lead: ${((lead.firstName || "") + " " + (lead.lastName || "")).trim()} (ID: ${lead.id})`,
    "",
    `Summary of latest activity:`,
    activityText || "(no summary available)",
    "",
    `View the lead in your admin dashboard:`,
    url,
    "",
    "Thank you.",
  ];

  const mailto = `mailto:${encodeURIComponent(
    adminEmail
  )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    bodyLines.join("\n")
  )}`;

  window.location.href = mailto;
}

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
    changes.push(`relationship to "${after.relationshipRanking || "-"}"`);
  }
  if (before.urgencyRanking !== after.urgencyRanking) {
    changes.push(`urgency to "${after.urgencyRanking || "-"}"`);
  }

  const hasAnyDiff = JSON.stringify(before) !== JSON.stringify(after);
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

function isActionItemJournalEntry(entry) {
  const type = String(entry?.type || "").toLowerCase().trim();
  const text = String(entry?.text || "").toLowerCase().trim();

  // Hide action item updates even if older entries were written with a weird type
  if (type === "action-item") return true;

  return (
    text.startsWith("admin updated action item") ||
    text.startsWith("admin cleared action item") ||
    text.includes("updated action item") ||
    text.includes("cleared action item")
  );
}

function getLatestNonActionItemText(lead, filteredJournal) {
  let latestText = "";
  let latestTime = 0;

  // Use filtered journal so action item updates can't become "Latest activity"
  if (Array.isArray(filteredJournal) && filteredJournal.length > 0) {
    for (const entry of filteredJournal) {
      if (!entry?.text) continue;

      const ca = entry.createdAt;
      const t = ca?.toMillis
        ? ca.toMillis()
        : ca instanceof Date
        ? ca.getTime()
        : typeof ca === "string"
        ? new Date(ca).getTime()
        : typeof ca === "number"
        ? ca
        : 0;

      if (!Number.isNaN(t) && t >= latestTime) {
        latestTime = t;
        latestText = entry.text;
      }
    }
  }

  // fallback (these might still be action-item-ish, but the above protects most cases)
  if (!latestText && lead.journalLastEntry) latestText = lead.journalLastEntry;
  if (!latestText && lead.latestActivity) latestText = lead.latestActivity;

  return latestText;
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

  // ✅ Filter out action-item journal entries for AGENT view
  const agentJournal = Array.isArray(lead?.journal)
    ? lead.journal.filter((e) => !isActionItemJournalEntry(e))
    : [];

  const latestActivityText = lead ? getLatestNonActionItemText(lead, agentJournal) : "";

  async function handleAgentSave(form) {
    if (!lead) return;
    setSaving(true);
    setStatus({ type: "", message: "" });

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

      await updateDoc(ref, {
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
      });

      // Optional: email admin on update (if you want it)
      // emailAdminAboutLeadUpdate(lead, activityText, user);

      setStatus({ type: "success", message: "Saved!" });
      setTimeout(() => setStatus({ type: "", message: "" }), 2000);
    } catch (err) {
      console.error("Error saving lead:", err);
      setStatus({ type: "error", message: "Error saving. Check console." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-600">Loading lead details...</div>;
  }

  if (error || !lead) {
    return (
      <div className="text-sm text-red-600">{error || "Lead not found."}</div>
    );
  }

  return (
    <div className="space-y-5 text-sm">
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
                <span className="font-medium">{lead.assignedAgentName}</span>
                {lead.assignedAgentEmail && (
                  <> &middot; {lead.assignedAgentEmail}</>
                )}
              </>
            ) : (
              <span className="italic text-gray-400">Unassigned</span>
            )}
          </p>
        </div>
      </div>

      {/* Property address banner (admin-controlled, visible to agent) */}
      {lead.propertyAddress?.trim() && (
        <div className="border-l-4 border-blue-400 bg-blue-50 p-3 rounded-md text-xs">
          <div className="font-semibold text-blue-800">
            Property Address (set by admin)
          </div>
          <div className="mt-1 text-blue-900 whitespace-pre-line">
            {lead.propertyAddress}
          </div>
        </div>
      )}

      {/* Admin action item banner stays visible */}
      {lead.actionItem && (
        <div className="border-l-4 border-amber-400 bg-amber-50 p-3 rounded-md text-xs">
          <div className="font-semibold text-amber-800">Admin action item</div>
          <div className="mt-1 text-amber-900 whitespace-pre-line">
            {lead.actionItem}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4 border border-gray-200 rounded-lg p-3 bg-gray-50">
        <div>
          <h2 className="text-xs font-semibold text-gray-700 mb-1">Contact</h2>
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

            {/* Property address also visible here */}
            <div className="mt-1">
              <span className="font-semibold text-gray-700">Property:</span>{" "}
              {lead.propertyAddress?.trim() ? (
                <span className="text-gray-900">{lead.propertyAddress}</span>
              ) : (
                <span className="italic text-gray-400">Not provided yet</span>
              )}
            </div>

            <div className="mt-1">
              <span className="font-semibold text-red-700">Due date:</span>{" "}
              <span className="text-xs text-gray-900">
                {formatDate(lead.nextEvaluationDate) || "-"}
              </span>
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Set by admin. This is the{" "}
              <span className="font-semibold">DUE DATE</span> for your next
              follow-up.
            </p>
          </div>
        </div>

        <div>
          <h2 className="text-xs font-semibold text-gray-700 mb-1">
            Latest activity
          </h2>
          <div className="text-xs text-gray-800 space-y-0.5">
            {latestActivityText ? (
              <span className="text-gray-700">{latestActivityText}</span>
            ) : (
              <span className="text-gray-400 italic">No recent activity.</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            Update this lead
          </h2>
          <LeadFormAgent lead={lead} onSave={handleAgentSave} saving={saving} />
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Journal</h2>
          {/* ✅ Agents see journal WITHOUT action-item entries */}
          <JournalTimeline entries={agentJournal} />
        </div>
      </div>
    </div>
  );
}
