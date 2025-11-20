// src/pages/AdminLeadPage.jsx
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
  deleteDoc,
} from "firebase/firestore";

import LeadBadge from "../components/LeadBadge";
import JournalTimeline from "../components/JournalTimeline";
import LeadFormAdmin from "../components/LeadFormAdmin";
import {
  STATUS_LABELS,
  RELATIONSHIP_LABELS,
  URGENCY_LABELS,
} from "../constants/leadOptions";

export default function AdminLeadPage() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);


  useEffect(() => {
    if (!leadId) return;
    const ref = doc(db, "leads", leadId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setLead({ id: snap.id, ...snap.data() });
        } else {
          setLead(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error loading lead:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [leadId]);

  async function handleAdminSave(form) {
    if (!lead) return;
    setSaving(true);

    try {
      const ref = doc(db, "leads", lead.id);

      const updateData = {
        ...form,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      };

      // if there’s a new journalLastEntry, append to journal array
      if (form.journalLastEntry && form.journalLastEntry.trim()) {
        updateData.journal = arrayUnion({
          id: crypto.randomUUID(),
          createdAt: new Date(), // not serverTimestamp in arrays
          createdBy: user.uid,
          createdByEmail: user.email,
          text: form.journalLastEntry.trim(),
        });
      }

      await updateDoc(ref, updateData);
    } catch (err) {
      console.error("Admin update error:", err);
      alert("Error saving. Check console.");
    }

    setSaving(false);
  }

  if (loading) {
    return <div className="text-sm text-gray-600">Loading lead...</div>;
  }

  if (!lead) {
    return <div className="text-sm text-red-600">Lead not found.</div>;
  }

  return (
    
    <div className="space-y-6 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
  <h1 className="text-lg font-semibold text-gray-900">
    Lead Details
  </h1>
  <button
    type="button"
    onClick={() => navigate("/admin")}
    className="text-xs px-3 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50"
  >
    ← Back to dashboard
  </button>
</div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            {lead.firstName} {lead.lastName}
          </h1>
          <p className="text-xs text-gray-500">
            Lead ID:{" "}
            <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">
              {lead.id}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
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
        </div>
      </div>

      {/* Admin form */}
      <div className="border border-gray-200 rounded-lg p-4 bg-white">
        <h2 className="text-sm font-semibold mb-2">Admin controls</h2>
        <LeadFormAdmin
          initialData={lead}
          onSave={handleAdminSave}
          saving={saving}
        />
      </div>

      {/* Journal */}
      <div className="border border-gray-200 rounded-lg p-4 bg-white">
        <h2 className="text-sm font-semibold mb-2">Journal</h2>
        <JournalTimeline entries={lead.journal} />
      </div>
    </div>
  );
}
