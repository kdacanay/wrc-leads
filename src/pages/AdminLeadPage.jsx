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
import useAgents from "../hooks/useAgents";

function formatDate(value) {
  if (!value) return "";
  if (value.toDate) {
    const d = value.toDate();
    return d.toISOString().split("T")[0];
  }

  const d = new Date(value);
  if (isNaN(d.getTime())) return value; // fallback if not a valid date
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

  window.location.href = mailto; // or window.open(mailto, "_blank");
}

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
const [assigning, setAssigning] = useState(false);
const { agents } = useAgents();
const [selectedAgentId, setSelectedAgentId] = useState("");

useEffect(() => {
  if (lead?.assignedAgentId) {
    setSelectedAgentId(lead.assignedAgentId);
  } else {
    setSelectedAgentId("");
  }
}, [lead]);

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

function buildAdminActivitySummary(oldLead, form) {
  const changes = [];

  if (oldLead.status !== form.status) {
    changes.push(`status to "${form.status || "-"}"`);
  }
  if (oldLead.leadType !== form.leadType) {
    changes.push(`type to "${form.leadType || "-"}"`);
  }
  if (oldLead.relationshipRanking !== form.relationshipRanking) {
    changes.push(`relationship to "${form.relationshipRanking || "-"}"`);
  }
  if (oldLead.urgencyRanking !== form.urgencyRanking) {
    changes.push(`urgency to "${form.urgencyRanking || "-"}"`);
  }
  if (oldLead.firstAttemptDate !== form.firstAttemptDate) {
    changes.push("first attempt date");
  }
  if (oldLead.nextEvaluationDate !== form.nextEvaluationDate) {
    changes.push("next evaluation date");
  }
  if (oldLead.source !== form.source) {
    changes.push(`source to "${form.source || "-"}"`);
  }

  if (changes.length === 0) {
    return "";
  }

  return `Admin updated ${changes.join(", ")}.`;
}

async function handleAdminSave(form) {
  if (!lead) return;
  setSaving(true);

  try {
    const ref = doc(db, "leads", lead.id);

    const changes = [];

    // 1) Track main lead field changes (similar to old buildAdminActivitySummary)
    if (lead.status !== form.status) {
      changes.push(`status to "${form.status || "-"}"`);
    }
    if (lead.leadType !== form.leadType) {
      changes.push(`type to "${form.leadType || "-"}"`);
    }
    if (lead.relationshipRanking !== form.relationshipRanking) {
      changes.push(`relationship to "${form.relationshipRanking || "-"}"`);
    }
    if (lead.urgencyRanking !== form.urgencyRanking) {
      changes.push(`urgency to "${form.urgencyRanking || "-"}"`);
    }
    if (lead.firstAttemptDate !== form.firstAttemptDate) {
      changes.push("first attempt date");
    }
    if (lead.nextEvaluationDate !== form.nextEvaluationDate) {
      changes.push("next evaluation date");
    }
    if (lead.source !== form.source) {
      changes.push(`source to "${form.source || "-"}"`);
    }

    // 2) Assignment changes via selectedAgentId
    let assignedAgentId = lead.assignedAgentId || null;
    let assignedAgentName = lead.assignedAgentName || null;
    let assignedAgentEmail = lead.assignedAgentEmail || null;
    let assignmentChangeText = "";

    if (selectedAgentId && Array.isArray(agents)) {
      const newAgent = agents.find((a) => a.id === selectedAgentId);

      if (newAgent) {
        const oldName =
          lead.assignedAgentName ||
          lead.assignedAgentEmail ||
          "Unassigned";
        const newName = newAgent.fullName || newAgent.email || "Unnamed user";

        assignedAgentId = newAgent.id;
        assignedAgentName = newName;
        assignedAgentEmail = newAgent.email || null;

        if (!lead.assignedAgentId) {
          assignmentChangeText = `assigned lead to ${newName}`;
        } else if (lead.assignedAgentId !== newAgent.id) {
          assignmentChangeText = `reassigned lead from ${oldName} to ${newName}`;
        } else {
          assignmentChangeText = `updated assignment for ${newName}`;
        }

        changes.push(`assignment (${assignmentChangeText})`);
      }
    }

    // 3) Action item change via actionItemDraft
    const trimmedActionItem = (actionItemDraft || "").trim();
    let actionItemChangeText = "";

    if (trimmedActionItem !== (lead.actionItem || "").trim()) {
      actionItemChangeText = trimmedActionItem
        ? "updated action item"
        : "cleared action item";
      changes.push(actionItemChangeText);
    }

    // 4) Optional admin journal note from the form
    const trimmedNote =
      typeof form.journalLastEntry === "string"
        ? form.journalLastEntry.trim()
        : "";

    let activityText = "";

if (changes.length === 0 && !trimmedNote) {
  activityText = "Admin saved lead with no field changes.";
} else {
  if (changes.length > 0) {
    activityText = `Admin updated ${changes.join(", ")}.`;
  }
  if (trimmedNote) {
    activityText += (activityText ? " " : "") + `Note: "${trimmedNote}"`;
  }
}

    // 5) Build the Firestore update payload
    const baseUpdate = {
      ...form,
      // normalize dates
      firstAttemptDate: form.firstAttemptDate || null,
      nextEvaluationDate: form.nextEvaluationDate || null,
      // ✅ registration date is a string the admin controls
      registrationDate: form.registrationDate || "",
      // ✅ keep your old field up to date too (for backward compatibility)
      registeredDateRaw:
        form.registrationDate ||
        lead.registeredDateRaw ||
        "",
      // action item lives here
      actionItem: trimmedActionItem || "",

      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
      latestActivity: activityText,
      journalLastEntry: activityText,
    };

    // Only overwrite assignment if we actually changed it
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
        type: "admin-update",
      }),
    });
  } catch (err) {
    console.error(err);
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

    // 1) Remove the entry
    const newJournal = lead.journal.filter((e) => e.id !== entryId);

    // 2) Recompute latest activity from remaining journal
    let latestText = "";
    let latestTime = 0;

    if (Array.isArray(newJournal) && newJournal.length > 0) {
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

    const updatePayload = {
      journal: newJournal,
      journalLastEntry: latestText || "",
      latestActivity: latestText || "",
    };

    await updateDoc(ref, updatePayload);
    // onSnapshot will update `lead` automatically
  } catch (err) {
    console.error("Error deleting journal entry:", err);
    alert("Error deleting journal entry. Check console for details.");
  }
}


async function handleAssignAgentFromAdminPage() {
  if (!lead) return;
  if (!selectedAgentId) {
    alert("Please choose an agent.");
    return;
  }

  const agent =
    Array.isArray(agents) && agents.find((a) => a.id === selectedAgentId);

  if (!agent) {
    alert("Selected agent not found.");
    return;
  }

  try {
    setAssigning(true);
    const ref = doc(db, "leads", lead.id);

    const oldName =
      lead.assignedAgentName ||
      lead.assignedAgentEmail ||
      "Unassigned";
    const newName = agent.fullName || agent.email || "Unnamed user";

    let text;
    if (!lead.assignedAgentId) {
      text = `Admin assigned lead to ${newName}.`;
    } else if (lead.assignedAgentId !== agent.id) {
      text = `Admin reassigned lead from ${oldName} to ${newName}.`;
    } else {
      text = `Admin updated assignment for ${newName}.`;
    }

    await updateDoc(ref, {
      assignedAgentId: agent.id,
      assignedAgentName: agent.fullName || agent.email,
      assignedAgentEmail: agent.email || null,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,

      latestActivity: text,
      journalLastEntry: text,
 journal: arrayUnion({
  id: crypto.randomUUID(),
  createdAt: new Date(),          // ✅ regular Date object
  createdBy: user.uid,
  createdByEmail: user.email,
  text,
  type: "assignment",
}),

    });
  } catch (err) {
    console.error("Error assigning agent:", err);
    alert("Error assigning agent. Check console for details.");
  } finally {
    setAssigning(false);
  }
}

async function handleAdminSave(form) {
  if (!lead) return;
  setSaving(true);

  try {
    const ref = doc(db, "leads", lead.id);

    const summary = buildAdminActivitySummary(lead, form);
    const trimmedNote =
      typeof form.journalLastEntry === "string"
        ? form.journalLastEntry.trim()
        : "";

    let activityText;

    if (trimmedNote) {
      activityText = `Admin added note: "${trimmedNote}"`;
    } else {
      activityText = summary;
    }

    const updateData = {
      ...form,
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),

      latestActivity: activityText,
      journalLastEntry: activityText,

      journal: arrayUnion({
        id: crypto.randomUUID(),
        createdAt: new Date(),    // <-- NEW timestamp always
        createdBy: user.uid,
        createdByEmail: user.email,
        text: activityText,
        type: trimmedNote ? "admin-note" : "admin-update",
      }),
    };

    await updateDoc(ref, updateData);
  } catch (err) {
    console.error(err);
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

    // ✅ Ask if we should email the assigned agent about this action item
    if (lead.assignedAgentEmail) {
      const shouldEmail = window.confirm(
        "Action item saved. Do you want to email the assigned agent about this action item?"
      );

      if (shouldEmail) {
        const url = `${window.location.origin}/agent/${lead.id}`;
        const subject = `New action item for lead: ${
          lead.firstName || ""
        } ${lead.lastName || ""}`.trim();

        const bodyLines = [
          `Hi ${lead.assignedAgentName || ""},`,
          "",
          "An action item has been added or updated for one of your leads in the WRC Lead Dashboard.",
          "",
          `Action item: ${trimmed || "(cleared)"}`,
          "",
          `Summary (journal): ${text}`,
          "",
          `You can view and update the lead here:`,
          url,
          "",
          "Thank you.",
        ];

        const body = bodyLines.join("\n");
        emailAssignedAgent(lead, subject, body);
      }
    }

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

function handleEmailAgentAboutLatest() {
  if (!lead) return;

  if (!lead.assignedAgentEmail) {
    alert("This lead does not have an assigned agent email.");
    return;
  }

  const url = `${window.location.origin}/agent/${lead.id}`;

  const subject = `Update on lead: ${
    lead.firstName || ""
  } ${lead.lastName || ""}`.trim();

  // Use latestActivity or fall back to something
  const summary =
    lead.latestActivity ||
    lead.journalLastEntry ||
    "An update was made to this lead in the WRC Lead Dashboard.";

  const bodyLines = [
    `Hi ${lead.assignedAgentName || ""},`,
    "",
    "There has been an update to one of your leads in the WRC Lead Dashboard.",
    "",
    `Summary: ${summary}`,
    "",
    `You can view and update the lead here:`,
    url,
    "",
    "Thank you.",
  ];

  const body = bodyLines.join("\n");
  emailAssignedAgent(lead, subject, body);
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
    <div>
      First attempt:{" "}
      {lead.firstAttemptDate
        ? formatDate(lead.firstAttemptDate)
        : "No first attempt yet"}
    </div>
    <div>
      Due date:{" "}
      {lead.nextEvaluationDate
        ? formatDate(lead.nextEvaluationDate)
        : "No due date"}
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

      {/* 🔹 Editable Action Item field for admin */}
      <div className="border border-amber-200 rounded-lg bg-amber-50 p-3 text-xs">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-amber-900">
            Edit action item for this lead
          </span>
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
          <span className="text-[10px] text-amber-800">
            Changes to this action item will be saved when you click{" "}
            <span className="font-semibold">"Save lead"</span> below.
          </span>
        </div>
      </div>

      {/* Admin form */}
      <div className="border border-gray-200 rounded-lg p-4 bg-white space-y-4">
        <div>
          <h2 className="text-sm font-semibold mb-2">Admin controls</h2>
        </div>

        {/* 🔽 Assign / change agent via dropdown */}
        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
          <div className="text-xs font-semibold text-gray-700">
            Assign / change agent
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full sm:w-1/2 border border-gray-300 rounded px-2 py-1.5 text-[11px]"
            >
              <option value="">
                {lead.assignedAgentId
                  ? "Keep current assignment"
                  : "-- Select an agent --"}
              </option>
              {Array.isArray(agents) &&
                agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {(a.fullName || a.email || "Unnamed user") +
                      (a.email ? ` (${a.email})` : "")}
                  </option>
                ))}
            </select>

            <div className="text-[11px] text-gray-600">
              {selectedAgentId ? (
                (() => {
                  const a =
                    Array.isArray(agents) &&
                    agents.find((ag) => ag.id === selectedAgentId);
                  if (!a) return null;
                  return (
                    <>
                      <div className="font-medium">
                        {a.fullName || a.email || "Unnamed user"}
                      </div>
                      {a.email && (
                        <div className="text-blue-700">{a.email}</div>
                      )}
                    </>
                  );
                })()
              ) : lead.assignedAgentName ? (
                <>
                  <div className="font-medium">
                    {lead.assignedAgentName}
                  </div>
                  {lead.assignedAgentEmail && (
                    <div className="text-blue-700">
                      {lead.assignedAgentEmail}
                    </div>
                  )}
                </>
              ) : (
                <span className="italic text-gray-400">
                  Currently unassigned
                </span>
              )}
            </div>
          </div>

          {lead.assignedAgentEmail && (
            <div className="mt-2">
              <button
                type="button"
                onClick={handleEmailAgentAboutLatest}
                className="inline-flex items-center px-3 py-1.5 rounded-full border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-100"
              >
                Email agent about latest update
              </button>
            </div>
          )}

          <p className="mt-1 text-[10px] text-gray-500">
            Changes to this assignment will be saved when you click{" "}
            <span className="font-semibold">"Save lead"</span> below.
          </p>
        </div>

        {/* Existing admin fields */}
        <LeadFormAdmin
          initialData={lead}
          onSave={handleAdminSave}
          saving={saving}
        />
      </div>

   {/* Journal */}
<div className="border border-gray-200 rounded-lg p-4 bg-white">
  <h2 className="text-sm font-semibold mb-2">Journal</h2>
  <JournalTimeline
    entries={lead.journal}
    onDeleteEntry={handleDeleteJournalEntry}  // 👈 this makes the button appear
  />
</div>

    </div>
  );
}
