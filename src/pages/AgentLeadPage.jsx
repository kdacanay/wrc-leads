// src/pages/AgentLeadPage.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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
  const { user } = useAuth();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

      const updateData = {
        firstAttemptDate: form.firstAttemptDate || null,
        engagementLevel: form.engagementLevel,
        nextEvaluationDate: form.nextEvaluationDate || null,
        relationshipRanking: form.relationshipRanking,
        urgencyRanking: form.urgencyRanking,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      };

      const trimmedNote = form.journalEntry?.trim();
      if (trimmedNote) {
        updateData.journalLastEntry = trimmedNote;
        updateData.journal = arrayUnion({
          id: crypto.randomUUID(),
          createdAt: new Date(), // array: must NOT use serverTimestamp
          createdBy: user.uid,
          createdByEmail: user.email,
          text: trimmedNote,
        });
      }

      await updateDoc(ref, updateData);
    } catch (err) {
      console.error("Error updating lead:", err);
      alert("Error updating lead. Check console for details.");
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

        {/* Status badges */}
        {/* <div className="flex flex-wrap gap-2">
          <LeadBadge
            value={lead.status}
            label={STATUS_LABELS[lead.status] || lead.status}
          />
          <LeadBadge
            value={lead.relationshipRanking}
            label={
              RELATIONSHIP_LABELS[lead.relationshipRanking] ||
              lead.relationshipRanking
            }
          />
          <LeadBadge
            value={lead.urgencyRanking}
            label={
              URGENCY_LABELS[lead.urgencyRanking] ||
              lead.urgencyRanking
            }
          />
        </div> */}
      </div>

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
      Next evaluation: {formatDate(lead.nextEvaluationDate) || "-"}
    </div>
  </div>
</div>


        <div>
          <h2 className="text-xs font-semibold text-gray-700 mb-1">
            Latest activity
          </h2>
          <div className="text-xs text-gray-800 space-y-0.5">
        <div className="text-xs text-gray-800 space-y-0.5">
  <div className="text-gray-700">
    {lead.journalLastEntry || (
      <span className="text-gray-400 italic">No recent note.</span>
    )}
  </div>
</div>

            <div className="text-gray-700">
              {lead.journalLastEntry || (
                <span className="text-gray-400 italic">
                  No recent note.
                </span>
              )}
            </div>
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
