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

  // 🔹 New: local state for action item editing
  const [actionItemDraft, setActionItemDraft] = useState("");
  const [savingActionItem, setSavingActionItem] = useState(false);
  const [actionItemJustSaved, setActionItemJustSaved] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    const ref = doc(db, "leads", leadId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() };
          setLead(data);

          // keep draft in sync when lead changes in Firestore
          setActionItemDraft(data.actionItem || "");
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

  // 🔹 New: save action item with journal + latestActivity
  async function handleSaveActionItem() {
    if (!lead) return;

    const trimmed = (actionItemDraft || "").trim();
    const ref = doc(db, "leads", lead.id);

    const text = trimmed
      ? `Admin updated action item: "${trimmed}"`
      : "Admin cleared action item.";

    setSavingActionItem(true);
    setActionItemJustSaved(false);

    try {
      await updateDoc(ref, {
        actionItem: trimmed || "",
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,

        journalLastEntry: text,
        journal: arrayUnion({
          id: crypto.randomUUID(),
          createdAt: new Date(),
          createdBy: user.uid,
          createdByEmail: user.email,
          text,
          type: "action-item",
        }),

        latestActivity: text,
      });

      setActionItemJustSaved(true);

      // little ✓ Saved badge disappears after ~2 seconds
      setTimeout(() => {
        setActionItemJustSaved(false);
      }, 2000);
    } catch (err) {
      console.error("Error saving action item:", err);
      alert("Error saving action item. Check console for details.");
    } finally {
      setSavingActionItem(false);
    }
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

      {/* Existing read-only banner (what agent sees) */}
      {lead.actionItem && (
        <div className="border-l-4 border-amber-400 bg-amber-50 p-3 rounded-md text-xs">
          <div className="font-semibold text-amber-800">
            Admin action item (visible to agent)
          </div>
          <div className="mt-1 text-amber-900 whitespace-pre-line">
            {lead.actionItem}
          </div>
        </div>
      )}

      {/* 🔹 NEW: Editable Action Item field for admin */}
      <div className="border border-amber-200 rounded-lg bg-amber-50 p-3 text-xs">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-amber-900">
            Edit action item for this lead
          </span>
          {actionItemJustSaved && (
            <span className="text-[11px] text-green-700 flex items-center gap-1">
              ✓ Saved
            </span>
          )}
        </div>
        <p className="text-[11px] text-amber-900 mb-2">
          This note will show in the agent&apos;s dashboard under
          &quot;Action item.&quot;
        </p>
        <textarea
          rows={3}
          className="w-full border border-amber-300 rounded px-2 py-1 text-[11px] bg-white"
          placeholder="Example: Call this lead by Friday to schedule a buyer consult..."
          value={actionItemDraft}
          onChange={(e) => setActionItemDraft(e.target.value)}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleSaveActionItem}
            disabled={savingActionItem}
            className="px-3 py-1.5 rounded-full border border-amber-400 bg-amber-100 text-[11px] font-medium text-amber-900 hover:bg-amber-200 disabled:opacity-60"
          >
            {savingActionItem ? "Saving..." : "Save action item"}
          </button>
          {!actionItemJustSaved && (
            <span className="text-[10px] text-amber-800">
              Updates journal + latest activity
            </span>
          )}
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
