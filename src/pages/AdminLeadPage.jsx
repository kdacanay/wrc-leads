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
  setDoc,
} from "firebase/firestore";

import LeadBadge from "../components/LeadBadge";
import JournalTimeline from "../components/JournalTimeline";
import LeadFormAdmin from "../components/LeadFormAdmin";
import {
  STATUS_LABELS,
  RELATIONSHIP_LABELS,
  URGENCY_LABELS,
} from "../constants/leadOptions";
import useAssignableAgents from "../hooks/useAssignableAgents";

// --------- Small helpers ----------

function normalizeDateForCompare(value) {
  if (!value) return null;
  if (value.toMillis) return value.toMillis();
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

function normalizeText(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * Build a human-readable summary of what the admin changed.
 * IMPORTANT: This does NOT handle assignment (that is handled separately).
 */
function buildAdminUpdateSummary(oldLead, newValues) {
  const changes = [];

  // Property address
  const oldProp = normalizeText(oldLead.propertyAddress);
  const newProp = normalizeText(newValues.propertyAddress);
  if (oldProp !== newProp) {
    if (newProp) {
      changes.push(`Admin updated the property address to: "${newProp}"`);
    } else {
      changes.push("Admin cleared the property address.");
    }
  }

  // Action item
  const oldAction = normalizeText(oldLead.actionItem);
  const newAction = normalizeText(newValues.actionItem);
  if (oldAction !== newAction) {
    if (newAction) {
      changes.push(`Admin updated the action item to: "${newAction}"`);
    } else {
      changes.push("Admin cleared the action item.");
    }
  }

  // First attempt date
  const oldFirst = normalizeDateForCompare(oldLead.firstAttemptDate);
  const newFirst = normalizeDateForCompare(newValues.firstAttemptDate);
  if (oldFirst !== newFirst) {
    if (newFirst) {
      changes.push("Admin updated the first attempt date.");
    } else {
      changes.push("Admin cleared the first attempt date.");
    }
  }

  // Due date (nextEvaluationDate)
  const oldDue = normalizeDateForCompare(oldLead.nextEvaluationDate);
  const newDue = normalizeDateForCompare(newValues.nextEvaluationDate);
  if (oldDue !== newDue) {
    if (newDue) {
      changes.push("Admin updated the due date.");
    } else {
      changes.push("Admin cleared the due date.");
    }
  }

  // Status
  if (oldLead.status !== newValues.status) {
    changes.push(
      `Admin changed status from "${oldLead.status || "unset"}" to "${
        newValues.status || "unset"
      }".`
    );
  }

  // Relationship ranking
  if (oldLead.relationshipRanking !== newValues.relationshipRanking) {
    changes.push(
      `Admin updated relationship ranking from "${
        oldLead.relationshipRanking || "unset"
      }" to "${newValues.relationshipRanking || "unset"}".`
    );
  }

  // Urgency ranking
  if (oldLead.urgencyRanking !== newValues.urgencyRanking) {
    changes.push(
      `Admin updated urgency ranking from "${
        oldLead.urgencyRanking || "unset"
      }" to "${newValues.urgencyRanking || "unset"}".`
    );
  }

  // Optional admin note
  if (
    "journalLastEntry" in newValues &&
    normalizeText(newValues.journalLastEntry) &&
    normalizeText(newValues.journalLastEntry) !==
      normalizeText(oldLead.journalLastEntry)
  ) {
    changes.push(
      `Admin added note: "${normalizeText(newValues.journalLastEntry)}"`
    );
  }

  return changes;
}

function formatDate(value) {
  if (!value) return "";
  if (value.toDate) {
    const d = value.toDate();
    return d.toISOString().split("T")[0];
  }

  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toISOString().split("T")[0];
}

function emailAssignedAgent(lead, subject, body) {
  if (!lead?.assignedAgentEmail) {
    alert("This lead does not have an assigned agent email.");
    return;
  }

  const mailto = `mailto:${encodeURIComponent(
    lead.assignedAgentEmail
  )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  window.location.href = mailto;
}

// ---------- Main component ----------

export default function AdminLeadPage() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentEmail, setNewAgentEmail] = useState("");

  // Action item editing
  const [actionItemDraft, setActionItemDraft] = useState("");
  const [savingActionItem, setSavingActionItem] = useState(false);
  const [actionItemJustSaved, setActionItemJustSaved] = useState(false);

  // Property address editing
  const [propertyAddressDraft, setPropertyAddressDraft] = useState("");

  const [savingAgentEmail, setSavingAgentEmail] = useState(false);
  const [manualAgentEmail, setManualAgentEmail] = useState("");

  const { agents: assignableAgents, loading: agentsLoading } =
    useAssignableAgents();

  const [selectedAgentId, setSelectedAgentId] = useState("");

  // Build a merged list of agents:
  // - registered from "users" via useAssignableAgents()
  // - plus current unregistered agent (from lead) if it doesn't exist yet
  const allAssignableAgents = React.useMemo(() => {
    const base = Array.isArray(assignableAgents) ? [...assignableAgents] : [];

    if (lead && lead.assignedAgentName && !lead.assignedAgentId) {
      const cleanLeadName = lead.assignedAgentName
        .replace(/\s\*$/, "")
        .trim()
        .toLowerCase();

      const exists = base.some((a) => {
        const clean = (a.name || "")
          .replace(/\s\*$/, "")
          .trim()
          .toLowerCase();
        return clean === cleanLeadName;
      });

      if (!exists) {
        base.push({
          id: `unreg:from-lead:${lead.id}`,
          name: `${lead.assignedAgentName}`.replace(/\s\*$/, " *"),
          email: lead.assignedAgentEmail || "",
          isPlaceholder: true,
        });
      }
    }

    base.sort((a, b) =>
      (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())
    );

    return base;
  }, [assignableAgents, lead]);

  // Keep selectedAgentId in sync with lead
  useEffect(() => {
    if (lead?.assignedAgentId) {
      setSelectedAgentId(lead.assignedAgentId);
    } else {
      setSelectedAgentId("");
    }
  }, [lead]);

  // Firestore subscription for this lead
  useEffect(() => {
    if (!leadId) return;
    const ref = doc(db, "leads", leadId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() };
          setLead(data);
          setActionItemDraft(data.actionItem || "");
          setPropertyAddressDraft(data.propertyAddress || "");
          setManualAgentEmail(data.assignedAgentEmail || "");
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

  async function handleCreateAndAssignAgent() {
    if (!lead) return;

    const name = newAgentName.trim();
    const email = newAgentEmail.trim();

    if (!name) {
      alert("Please enter an agent name.");
      return;
    }

    const slug = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    try {
      // 1) Create / update unregistered agent
      const unregRef = doc(db, "unregisteredAgents", slug);

      await setDoc(
        unregRef,
        {
          name,
          email: email || "",
          source: "manual-admin-entry",
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 2) Assign to lead
      const text = `Admin assigned lead to ${name} (unregistered).`;

      await updateDoc(doc(db, "leads", lead.id), {
        assignedAgentId: null,
        assignedAgentName: name,
        assignedAgentEmail: email || null,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        latestActivity: text,
        journalLastEntry: text,
        journal: arrayUnion({
          id: crypto.randomUUID(),
          createdAt: new Date(),
          createdBy: user.uid,
          createdByEmail: user.email,
          text,
          type: "admin-update",
        }),
      });

      setNewAgentName("");
      setNewAgentEmail("");
    } catch (err) {
      console.error("Error creating agent:", err);
      alert("Failed to create and assign agent.");
    }
  }

  async function handleSaveAgentEmail() {
    if (!lead) return;

    const trimmed = (manualAgentEmail || "").trim();
    const ref = doc(db, "leads", lead.id);

    const text = trimmed
      ? `Admin updated assigned agent email to ${trimmed}.`
      : "Admin cleared assigned agent email.";

    if (!trimmed) {
      const ok = window.confirm(
        "You are about to clear the assigned agent email for this lead. Continue?"
      );
      if (!ok) return;
    }

    setSavingAgentEmail(true);

    try {
      // Update the lead
      await updateDoc(ref, {
        assignedAgentEmail: trimmed || null,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        journalLastEntry: text,
        journal: arrayUnion({
          id: crypto.randomUUID(),
          createdAt: new Date(),
          createdBy: user.uid,
          createdByEmail: user.email,
          text,
          type: "admin-update",
        }),
        latestActivity: text,
      });

      // Save/update in global unregisteredAgents roster, which will auto-create the collection
      const name = (lead.assignedAgentName || "").trim();
      if (name && !lead.assignedAgentId && trimmed) {
        const slug = name
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9\-]/g, "");

        const unregRef = doc(db, "unregisteredAgents", slug || name);

        await setDoc(
          unregRef,
          {
            name,
            email: trimmed,
            source: "manual-entry",
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (err) {
      console.error("Error saving agent email:", err);
      alert("Error saving agent email. Check console for details.");
    } finally {
      setSavingAgentEmail(false);
    }
  }

  // Unified save handler used by <LeadFormAdmin />
  async function handleAdminSave(form) {
    if (!lead) return;
    setSaving(true);

    try {
      const ref = doc(db, "leads", lead.id);

      const trimmedActionItem = (actionItemDraft || "").trim();
      const trimmedPropertyAddress = (propertyAddressDraft || "").trim();

      const trimmedNote =
        typeof form.journalLastEntry === "string"
          ? form.journalLastEntry.trim()
          : "";

      // 1) Build core change descriptions
      const changes = buildAdminUpdateSummary(lead, {
        ...lead,
        ...form,
        actionItem: trimmedActionItem,
        propertyAddress: trimmedPropertyAddress,
        journalLastEntry: trimmedNote,
      });

      // 2) Assignment changes
      let assignedAgentId = lead.assignedAgentId || null;
      let assignedAgentName = lead.assignedAgentName || null;
      let assignedAgentEmail = lead.assignedAgentEmail || null;
      let assignmentChangeText = "";

      // 🔴 Detect unassignment
      if (!selectedAgentId && (lead.assignedAgentId || lead.assignedAgentName)) {
        const oldName = lead.assignedAgentName || lead.assignedAgentEmail || "previous agent";

        assignedAgentId = null;
        assignedAgentName = null;
        assignedAgentEmail = null;

        assignmentChangeText = `Admin unassigned the lead from ${oldName}.`;
        changes.push(assignmentChangeText);
      }

      if (selectedAgentId && Array.isArray(allAssignableAgents)) {
        const newAgent = allAssignableAgents.find((a) => a.id === selectedAgentId);

        if (newAgent) {
          const oldName = lead.assignedAgentName || lead.assignedAgentEmail || "Unassigned";
          const cleanName = (newAgent.name || "").replace(/\s\*$/, "");
          const newName = cleanName || newAgent.email || "Unnamed user";

          if (newAgent.isPlaceholder) {
            // Unregistered placeholder agent: keep id null
            assignedAgentId = null;
            assignedAgentName = newName;
            assignedAgentEmail = newAgent.email || null;

            if (!lead.assignedAgentName && !lead.assignedAgentId) {
              assignmentChangeText = `Admin assigned lead to ${newName} (unregistered).`;
            } else {
              assignmentChangeText = `Admin updated assignment to ${newName} (unregistered).`;
            }
          } else {
            // Registered agent
            assignedAgentId = newAgent.id;
            assignedAgentName = newName;
            assignedAgentEmail = newAgent.email || null;

            if (!lead.assignedAgentId) {
              assignmentChangeText = `Admin assigned lead to ${newName}.`;
            } else if (lead.assignedAgentId !== newAgent.id) {
              assignmentChangeText = `Admin reassigned lead from ${oldName} to ${newName}.`;
            } else {
              assignmentChangeText = `Admin updated assignment for ${newName}.`;
            }
          }

          if (assignmentChangeText) {
            changes.push(assignmentChangeText);
          }
        }
      }

      // 3) Build final activity text
      let activityText = "";

      if (changes.length === 0 && !trimmedNote) {
        activityText = "Admin saved lead with no field changes.";
      } else {
        if (changes.length > 0) {
          activityText = changes.join(" ");
        }
        if (trimmedNote) {
          activityText += (activityText ? " " : "") + `Admin added note: "${trimmedNote}".`;
        }
      }

      // 4) Build Firestore update payload
      const baseUpdate = {
        ...form,
        firstAttemptDate: form.firstAttemptDate || null,
        nextEvaluationDate: form.nextEvaluationDate || null,
        registrationDate: form.registrationDate || "",
        registeredDateRaw: form.registrationDate || lead.registeredDateRaw || "",
        actionItem: trimmedActionItem || "",
        propertyAddress: trimmedPropertyAddress || "",
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
        latestActivity: activityText,
        journalLastEntry: activityText,
      };

      if (assignmentChangeText) {
        baseUpdate.assignedAgentId = assignedAgentId;
        baseUpdate.assignedAgentName = assignedAgentName;
        baseUpdate.assignedAgentEmail = assignedAgentEmail;
      }

      await updateDoc(ref, {
        ...baseUpdate,
        journal: arrayUnion({
          id: crypto.randomUUID(),
          createdAt: new Date(),
          createdBy: user.uid,
          createdByEmail: user.email,
          text: activityText,
          type: trimmedNote ? "admin-note" : "admin-update",
        }),
      });
    } catch (err) {
      console.error("Error saving lead:", err);
      alert("Error saving lead. Check console for details.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteJournalEntry(entryId) {
    if (!lead || !Array.isArray(lead.journal)) return;

    const entry = lead.journal.find((e) => e.id === entryId);
    if (!entry) return;

    const ok = window.confirm(
      `Are you sure you want to delete this journal entry?\n\n"${entry.text || ""}"`
    );
    if (!ok) return;

    try {
      const ref = doc(db, "leads", lead.id);

      const newJournal = lead.journal.filter((e) => e.id !== entryId);

      let latestText = "";
      let latestTime = 0;

      if (newJournal.length > 0) {
        for (const e of newJournal) {
          if (!e) continue;
          const createdAt = e.createdAt;
          const t = createdAt?.toMillis
            ? createdAt.toMillis()
            : createdAt
            ? new Date(createdAt).getTime()
            : 0;

          if (t >= latestTime && e.text) {
            latestTime = t;
            latestText = e.text;
          }
        }
      }

      await updateDoc(ref, {
        journal: newJournal,
        journalLastEntry: latestText || "",
        latestActivity: latestText || "",
      });
    } catch (err) {
      console.error("Error deleting journal entry:", err);
      alert("Error deleting journal entry. Check console for details.");
    }
  }

  async function handleEditJournalEntry(entryId, newText) {
    if (!lead || !Array.isArray(lead.journal)) return;

    const trimmed = (newText || "").trim();
    const entry = lead.journal.find((e) => e.id === entryId);
    if (!entry) return;

    if (!trimmed) {
      const ok = window.confirm(
        "You are about to clear the text for this journal entry. Continue?"
      );
      if (!ok) return;
    }

    try {
      const ref = doc(db, "leads", lead.id);

      const newJournal = lead.journal.map((e) =>
        e.id === entryId
          ? {
              ...e,
              text: trimmed,
              editedAt: new Date(),
              editedBy: user.uid,
              editedByEmail: user.email,
            }
          : e
      );

      let latestText = "";
      let latestTime = 0;

      if (newJournal.length > 0) {
        for (const e of newJournal) {
          if (!e) continue;
          const createdAt = e.createdAt;
          const t = createdAt?.toMillis
            ? createdAt.toMillis()
            : createdAt
            ? new Date(createdAt).getTime()
            : 0;

          if (t >= latestTime && e.text) {
            latestTime = t;
            latestText = e.text;
          }
        }
      }

      await updateDoc(ref, {
        journal: newJournal,
        journalLastEntry: latestText || "",
      });
    } catch (err) {
      console.error("Error editing journal entry:", err);
      alert("Error editing journal entry. Check console for details.");
    }
  }

  function handleEmailAgentInvite() {
    if (!lead) return;

    const email = lead.assignedAgentEmail;
    if (!email) {
      alert("No agent email is set for this lead.");
      return;
    }

    const appUrl = `${window.location.origin}`;
    const subject = "You're invited to use the WRC Lead Dashboard";

    const bodyLines = [
      `Hi ${lead.assignedAgentName || ""},`,
      "",
      "You have leads assigned to you in the WRC Lead Dashboard.",
      "Please register or log in to the app so you can view and update your leads.",
      "",
      `App link: ${appUrl}`,
      "",
      "If you have any questions, just reply to this email.",
      "",
      "Thank you,",
      user?.email || "WRC Leads Admin",
    ];

    const body = bodyLines.join("\n");

    const mailto = `mailto:${encodeURIComponent(
      email
    )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    window.location.href = mailto;
  }

  function handleEmailAgentAboutLatest() {
    if (!lead) return;

    if (!lead.assignedAgentEmail) {
      alert("This lead does not have an assigned agent email.");
      return;
    }

    const url = `${window.location.origin}/agent/${lead.id}`;
    const subject = `Update to your lead: ${lead.firstName || ""} ${lead.lastName || ""}`.trim();

    const summary =
      lead.latestActivity ||
      lead.journalLastEntry ||
      "There has been an update to this lead in the WRC Lead Dashboard.";

    const bodyLines = [
      `Hi ${lead.assignedAgentName || ""},`,
      "",
      "There has been an update to your lead in the WRC Lead Dashboard.",
      "",
      `Update summary: ${summary}`,
      "",
      "You can view and update the lead using the link below:",
      url,
      "",
      "Thank you,",
      "WRC Leads",
    ];

    const body = bodyLines.join("\n");

    const mailto = `mailto:${encodeURIComponent(
      lead.assignedAgentEmail
    )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    window.location.href = mailto;
  }

  // Can we email this lead's agent?
  const canEmailAgent = !!lead && !!lead.assignedAgentEmail;

  // ---------- Render ----------

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
        <h1 className="text-lg font-semibold text-gray-900">Lead Details</h1>
        <button
          type="button"
          onClick={() => navigate("/admin")}
          className="text-xs px-3 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          ← Back to dashboard
        </button>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-gray-700 mb-1">Lead details</h2>
        <div className="text-xs text-gray-800 space-y-0.5">
          <div>
            Registered:{" "}
            {lead.registrationDate
              ? lead.registrationDate
              : lead.registeredDateRaw
              ? lead.registeredDateRaw
              : "No registration date"}
          </div>
          <div>
            First attempt:{" "}
            {lead.firstAttemptDate
              ? formatDate(lead.firstAttemptDate)
              : "No first attempt yet"}
          </div>
          <div>
            Due date:{" "}
            {lead.nextEvaluationDate ? formatDate(lead.nextEvaluationDate) : "No due date"}
          </div>

          <div>
            Property:{" "}
            {lead.propertyAddress?.trim() ? (
              <span className="font-medium">{lead.propertyAddress}</span>
            ) : (
              <span className="italic text-gray-500">Not provided yet</span>
            )}
          </div>
        </div>
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
          <LeadBadge value={lead.status} label={STATUS_LABELS[lead.status] || lead.status} />
          <LeadBadge
            value={lead.relationshipRanking}
            label={RELATIONSHIP_LABELS[lead.relationshipRanking] || lead.relationshipRanking}
          />
          <LeadBadge
            value={lead.urgencyRanking}
            label={URGENCY_LABELS[lead.urgencyRanking] || lead.urgencyRanking}
          />
        </div>
      </div>

      {lead.propertyAddress?.trim() && (
        <div className="border-l-4 border-blue-400 bg-blue-50 p-3 rounded-md text-xs">
          <div className="font-semibold text-blue-800">Property Address (visible to agent)</div>
          <div className="mt-1 text-blue-900 whitespace-pre-line">{lead.propertyAddress}</div>
        </div>
      )}

      {lead.actionItem && (
        <div className="border-l-4 border-amber-400 bg-amber-50 p-3 rounded-md text-xs">
          <div className="font-semibold text-amber-800">Admin action item (visible to agent)</div>
          <div className="mt-1 text-amber-900 whitespace-pre-line">{lead.actionItem}</div>
        </div>
      )}

      <div className="border border-amber-200 rounded-lg bg-amber-50 p-3 text-xs">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-amber-900">Edit action item for this lead</span>
        </div>
        <p className="text-[11px] text-amber-900 mb-2">
          This note will show in the agent&apos;s dashboard under &quot;Action item.&quot;
        </p>
        <textarea
          rows={3}
          className="w-full border border-amber-300 rounded px-2 py-1 text-[11px] bg-white"
          placeholder="Example: Call this lead by Friday to schedule a buyer consult..."
          value={actionItemDraft}
          onChange={(e) => setActionItemDraft(e.target.value)}
        />
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px] text-amber-800">
            Changes to this action item will be saved when you click{" "}
            <span className="font-semibold">"Save lead"</span> below.
          </span>
        </div>
      </div>

      {/* Property Address editor */}
      <div className="border border-gray-200 rounded-lg bg-white p-3 text-xs">
        <div className="font-semibold text-gray-700 mb-1">
          Property address the lead is asking about (visible to agent)
        </div>
        <input
          type="text"
          value={propertyAddressDraft}
          onChange={(e) => setPropertyAddressDraft(e.target.value)}
          placeholder='e.g., "123 Main St, West Chester, PA 19382"'
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-[11px]"
        />
        <p className="mt-1 text-[10px] text-gray-500">
          This will save when you click <span className="font-semibold">"Save lead"</span> below.
        </p>
      </div>

      <div className="border border-gray-200 rounded-lg p-4 bg-white space-y-4">
        <div>
          <h2 className="text-sm font-semibold mb-2">Admin controls</h2>
        </div>

        {/* Assign / change agent */}
        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
          <div className="text-xs font-semibold text-gray-700">Assign / change agent</div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full sm:w-1/2 border border-gray-300 rounded px-2 py-1.5 text-[11px]"
            >
              <option value="">— Unassigned —</option>
              <option value="">-- Keep current assignment / unassigned --</option>

              {Array.isArray(allAssignableAgents) &&
                allAssignableAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {(a.name || a.email || "Unnamed user") + (a.email ? ` (${a.email})` : "")}
                  </option>
                ))}
            </select>

            <div className="text-[11px] text-gray-600">
              {selectedAgentId ? (
                (() => {
                  const a =
                    Array.isArray(allAssignableAgents) &&
                    allAssignableAgents.find((ag) => ag.id === selectedAgentId);
                  if (!a) return null;
                  return (
                    <>
                      <div className="font-medium">{a.name || a.email || "Unnamed user"}</div>
                      {a.email && <div className="text-blue-700">{a.email}</div>}
                    </>
                  );
                })()
              ) : lead.assignedAgentName ? (
                <>
                  <div className="font-medium">{lead.assignedAgentName}</div>
                  {lead.assignedAgentEmail && (
                    <div className="text-blue-700">{lead.assignedAgentEmail}</div>
                  )}
                </>
              ) : (
                <span className="italic text-gray-400">Currently unassigned</span>
              )}
            </div>
          </div>

          <div className="mt-3 border-t pt-3">
            <div className="text-xs font-semibold text-gray-700 mb-1">Assign unregistered agent</div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Agent full name"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                className="w-full sm:w-1/3 border border-gray-300 rounded px-2 py-1.5 text-[11px]"
              />

              <input
                type="email"
                placeholder="Email (optional)"
                value={newAgentEmail}
                onChange={(e) => setNewAgentEmail(e.target.value)}
                className="w-full sm:w-1/3 border border-gray-300 rounded px-2 py-1.5 text-[11px]"
              />

              <button
                type="button"
                onClick={handleCreateAndAssignAgent}
                className="px-3 py-1.5 rounded-full border border-gray-300 text-[11px] hover:bg-gray-100"
              >
                Create & assign
              </button>
            </div>
          </div>

          {canEmailAgent && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleEmailAgentAboutLatest}
                className="inline-flex items-center px-3 py-1.5 rounded-full border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-100"
              >
                Email agent about latest update
              </button>
              <button
                type="button"
                onClick={handleEmailAgentInvite}
                className="inline-flex items-center px-3 py-1.5 rounded-full border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-100"
              >
                Email invite to register
              </button>
            </div>
          )}

          <p className="mt-1 text-[10px] text-gray-500">
            Changes to this assignment will be saved when you click{" "}
            <span className="font-semibold">"Save lead"</span> below.
          </p>
        </div>

        {/* Manual agent email */}
        <div className="mt-3 border-t border-gray-200 pt-3">
          <div className="text-xs font-semibold text-gray-700 mb-1">
            Manually set assigned agent email
          </div>
          <p className="text-[11px] text-gray-500 mb-2">
            Use this when a lead was imported with an agent name but no email. This email will be
            used for notifications and invites.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input
              type="email"
              value={manualAgentEmail}
              onChange={(e) => setManualAgentEmail(e.target.value)}
              placeholder="agent@example.com"
              className="w-full sm:w-1/2 border border-gray-300 rounded px-2 py-1.5 text-[11px]"
            />
            <button
              type="button"
              onClick={handleSaveAgentEmail}
              disabled={savingAgentEmail}
              className="inline-flex items-center px-3 py-1.5 rounded-full border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-100 disabled:opacity-60"
            >
              {savingAgentEmail ? "Saving..." : "Save agent email"}
            </button>
          </div>
        </div>

        <LeadFormAdmin initialData={lead} onSave={handleAdminSave} saving={saving} />
      </div>

      <div className="border border-gray-200 rounded-lg p-4 bg-white">
        <h2 className="text-sm font-semibold mb-2">Journal</h2>
        <JournalTimeline
          entries={lead.journal}
          canEdit
          onDeleteEntry={handleDeleteJournalEntry}
          onEditEntry={handleEditJournalEntry}
        />
      </div>
    </div>
  );
}
