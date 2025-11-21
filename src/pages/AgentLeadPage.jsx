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

function buildAgentActivitySummary(oldLead, form) {
  const changes = [];

  if (oldLead.engagementLevel !== form.engagementLevel) {
    changes.push(`engagement to "${form.engagementLevel || "-"}"`);
  }
  if (oldLead.firstAttemptDate !== form.firstAttemptDate) {
    changes.push("first attempt date");
  }

  // 🔒 Do NOT track nextEvaluationDate changes from the agent anymore
  // if (oldLead.nextEvaluationDate !== form.nextEvaluationDate) {
  //   changes.push("next evaluation date");
  // }

  if (oldLead.relationshipRanking !== form.relationshipRanking) {
    changes.push(`relationship to "${form.relationshipRanking || "-"}"`);
  }
  if (oldLead.urgencyRanking !== form.urgencyRanking) {
    changes.push(`urgency to "${form.urgencyRanking || "-"}"`);
  }

  if (changes.length === 0) {
    return "Agent saved lead with no field changes.";
  }

  return `Agent updated ${changes.join(", ")}.`;
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
  setStatus({ type: "", message: "" });

  try {
    const ref = doc(db, "leads", lead.id);

    // Build a summary of what changed
    const summary = buildAgentActivitySummary(lead, form);

    const updateData = {
      firstAttemptDate: form.firstAttemptDate || null,
      engagementLevel: form.engagementLevel,
      // nextEvaluationDate is admin-only now, so we skip it
      relationshipRanking: form.relationshipRanking,
      urgencyRanking: form.urgencyRanking,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
      latestActivity: summary,
    };

    const trimmedNote = form.journalEntry?.trim();

    if (trimmedNote && trimmedNote !== lead.journalLastEntry) {
      updateData.journalLastEntry = trimmedNote;
      updateData.journal = arrayUnion({
        id: crypto.randomUUID(),
        createdAt: new Date(),
        createdBy: user.uid,
        createdByEmail: user.email,
        text: trimmedNote,
        type: "note",
      });

      updateData.latestActivity = `Agent added note: "${trimmedNote}"`;
    }

    await updateDoc(ref, updateData);

    setStatus({ type: "success", message: "Changes saved." });
    setTimeout(() => {
      setStatus({ type: "", message: "" });
    }, 3000);
  } catch (err) {
    console.error("Error updating lead:", err);
    alert("Error updating lead. Check console for details.");
    setStatus({ type: "error", message: "Error saving changes." });
  } finally {
    setSaving(false);
  }
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
              First attempt: {formatDate(lead.firstAttemptDate) || "-"}
            </div>
            <div>
              {/* 🔒 This is now purely display — still pulled from Firestore, but never changed by this page */}
              Next evaluation: {formatDate(lead.nextEvaluationDate) || "-"}
            </div>
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
