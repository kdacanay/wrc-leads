// src/pages/AdminLeadPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  setDoc,
  query,
  collection,
  orderBy,
  addDoc,
  deleteDoc,
  arrayUnion,
} from "firebase/firestore";
import { getApp } from "firebase/app";
import LeadBadge from "../components/LeadBadge";
import JournalTimeline from "../components/JournalTimeline";
import LeadFormAdmin from "../components/LeadFormAdmin";
import {
  STATUS_LABELS,
  RELATIONSHIP_LABELS,
  URGENCY_LABELS,
} from "../constants/leadOptions";
import useAssignableAgents from "../hooks/useAssignableAgents";
import LeadDetailView from "../components/LeadDetailView";


function safeId() {
  return `unreg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// --------- Small helpers ----------
function normEmail(v) {
  return (v || "").toLowerCase().trim();
}

function uniqStrings(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function normalizeDateForCompare(value) {
  if (!value) return null;
  if (value?.toMillis) return value.toMillis();
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

function normalizeText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function toMillisSafe(v) {
  if (!v) return 0;

  // Firestore Timestamp
  if (v?.toMillis) return v.toMillis();
  if (v?.seconds != null) return v.seconds * 1000;

  // Number
  if (typeof v === "number") return v;

  // Date
  if (v instanceof Date) return v.getTime();

  // String date
  if (typeof v === "string") {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? 0 : t;
  }

  return 0;
}

function normTextForKey(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
/**
 * IMPORTANT:
 * Your form currently sends `journal` as an ARRAY (imported history).
 * We should NEVER treat it as a typed note.
 * This helper tries to find a typed note string from common keys.
 */
function extractTypedNote(form) {
  const candidates = [
    form?.journalNote,
    form?.note,
    form?.newNote,
    form?.newJournalEntry,
    form?.journalEntry,
    form?.adminNote,
    form?.message,
    form?.comment,
  ];

  for (const v of candidates) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object" && typeof v.text === "string" && v.text.trim()) {
      return v.text.trim();
    }
  }

  return "";
}

/**
 * Returns: Array<{ type: "admin-update" | "action-item", text: string }>
 */
function buildAdminUpdateSummary(oldLead, newValues) {
  const changes = [];

  const oldProp = normalizeText(oldLead.propertyAddress);
  const newProp = normalizeText(newValues.propertyAddress);
  if (oldProp !== newProp) {
    changes.push({
      type: "admin-update",
      text: newProp
        ? `Admin updated the property address to: "${newProp}"`
        : "Admin cleared the property address.",
    });
  }

  const oldAction = normalizeText(oldLead.actionItem);
  const newAction = normalizeText(newValues.actionItem);
  if (oldAction !== newAction) {
    changes.push({
      type: "action-item",
      visibility: "admin",
      text: newAction
        ? `Admin updated the action item to: "${newAction}"`
        : "Admin cleared the action item.",
    });
  }

  const oldFirst = normalizeDateForCompare(oldLead.firstAttemptDate);
  const newFirst = normalizeDateForCompare(newValues.firstAttemptDate);
  if (oldFirst !== newFirst) {
    changes.push({
      type: "admin-update",
      text: newFirst
        ? "Admin updated the first attempt date."
        : "Admin cleared the first attempt date.",
    });
  }

  const oldDue = normalizeDateForCompare(oldLead.nextEvaluationDate);
  const newDue = normalizeDateForCompare(newValues.nextEvaluationDate);
  if (oldDue !== newDue) {
    changes.push({
      type: "admin-update",
      text: newDue ? "Admin updated the due date." : "Admin cleared the due date.",
    });
  }

  if (oldLead.status !== newValues.status) {
    changes.push({
      type: "admin-update",
      text: `Admin changed status from "${oldLead.status || "unset"}" to "${newValues.status || "unset"}".`,
    });
  }

  if (oldLead.relationshipRanking !== newValues.relationshipRanking) {
    changes.push({
      type: "admin-update",
      text: `Admin updated relationship ranking from "${oldLead.relationshipRanking || "unset"}" to "${newValues.relationshipRanking || "unset"}".`,
    });
  }

  if (oldLead.urgencyRanking !== newValues.urgencyRanking) {
    changes.push({
      type: "admin-update",
      text: `Admin updated urgency ranking from "${oldLead.urgencyRanking || "unset"}" to "${newValues.urgencyRanking || "unset"}".`,
    });
  }

  return changes;
}

console.log("🔥 FIREBASE RUNTIME PROJECT:", getApp().options.projectId);

export default function AdminLeadPage() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
const [closing, setClosing] = useState(false);
  const [lead, setLead] = useState(null);

  // Subcollection journal (shared view for agent/admin)
  const [journal, setJournal] = useState([]);

  // Imported journal array on the lead doc
  const [importedJournal, setImportedJournal] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentEmail, setNewAgentEmail] = useState("");

  const [actionItemDraft, setActionItemDraft] = useState("");
  const [propertyAddressDraft, setPropertyAddressDraft] = useState("");

  const [savingAgentEmail, setSavingAgentEmail] = useState(false);
  const [manualAgentEmail, setManualAgentEmail] = useState("");

  const { agents: assignableAgents } = useAssignableAgents();
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [secondaryAgentId, setSecondaryAgentId] = useState("");
  const [updatingAssignments, setUpdatingAssignments] = useState(false);

  // Lead subscription
  useEffect(() => {
    if (!leadId) return;

    const ref = doc(db, "leads", leadId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = { docId: snap.id, ...snap.data() };
          setLead(data);

          setActionItemDraft(data.actionItem || "");
          setPropertyAddressDraft(data.propertyAddress || "");
          setManualAgentEmail(data.assignedAgentEmail || "");

   if (data.assignedAgentId) setSelectedAgentId(data.assignedAgentId);
else setSelectedAgentId("");

// ✅ 1) Grab the imported array journal safely
const arrayJournal = Array.isArray(data.journal) ? data.journal : [];

// ✅ 2) Pick a good base timestamp for fallbacks
const leadBaseMs =
  toMillisSafe(data.updatedAt) ||
  toMillisSafe(data.latestActivityAt) ||
  toMillisSafe(data.createdAt) ||
  Date.now();

// ✅ 3) Normalize imported entries so they get real timestamps + sort correctly
setImportedJournal(
  arrayJournal
    .map((e, idx) => {
      const entryMs =
        toMillisSafe(e.createdAt) ||
        toMillisSafe(e.timestamp) ||
        toMillisSafe(e.date) ||
        // fallback: spread them out slightly so they don't all share the same time
        (leadBaseMs - idx * 1000);

      return {
        id: e.id || `array:${idx}`,
        ...e,
        // IMPORTANT: JournalTimeline should use this
        createdAtMillis: entryMs,
        _from: "array",
        // normalize to match your subcollection naming
        text: typeof e.text === "string" ? e.text : (e.comment || e.note || e.message || ""),
      };
    })
    .filter((e) => String(e.text || "").trim()) // drop empty
    .sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0))
);


        } else {
          setLead(null);
          setImportedJournal([]);
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

  // Journal subcollection subscription (agent/admin shared)
  useEffect(() => {
    if (!leadId) return;

    const q = query(
      collection(db, "leads", leadId, "journal"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setJournal(
          snap.docs.map((d) => {
            const v = d.data();
            return {
              id: d.id,
              ...v,
              createdAtMillis: toMillisSafe(v.createdAt),
              _from: "subcollection",
            };
          })
        );
      },
      (err) => console.error("Admin journal listener error:", err)
    );

    return () => unsub();
  }, [leadId]);

  // Merge journals for display
const sharedJournal = useMemo(() => {
  const sub = Array.isArray(journal) ? journal : [];
  const arr = Array.isArray(importedJournal) ? importedJournal : [];

  // Only shared items from subcollection (imported ones are treated as shared)
const visibleSub = sub.filter((e) => {
  const v = e.visibility || "shared";
  return v === "shared" || v === "admin"; // ✅ admin can see both
});
const all = [...visibleSub, ...arr];


  // Dedup: text + type + minute bucket; prefer subcollection over imported
// Dedup: type + normalized text; prefer subcollection over imported
const seen = new Map();
const out = [];

function normalizeJournalText(raw) {
  let s = String(raw || "").trim();

  // collapse whitespace
  s = s.replace(/\s+/g, " ");

  // normalize common "label:" patterns
  s = s.replace(/\s*:\s*/g, ": ");

  // fix common url typo "https//"
  s = s.replace(/\bhttps\/\/\b/gi, "https://");

  // normalize vocaroo links that might have protocol missing
  s = s.replace(/\bvoca\.ro\/?/gi, "voca.ro/");

  return s.toLowerCase();
}

for (const e of all) {
  const textKey = normalizeJournalText(e.text || "");
  if (!textKey) continue;

  const typeKey = normalizeJournalText(e.type || "note");

  // ✅ stable key (no time bucket)
  const key = `${typeKey}__${textKey}`;

  if (!seen.has(key)) {
    seen.set(key, e);
    out.push(e);
    continue;
  }

  // prefer subcollection entries if collision
  const existing = seen.get(key);
  const existingScore = existing?._from === "subcollection" ? 2 : 1;
  const incomingScore = e?._from === "subcollection" ? 2 : 1;

  if (incomingScore > existingScore) {
    const idx = out.findIndex((x) => x === existing);
    if (idx >= 0) out[idx] = e;
    seen.set(key, e);
  }
}


  out.sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
  return out;
}, [journal, importedJournal]);



  const secondaryAssignedAgents = useMemo(() => {
    return Array.isArray(lead?.assignedAgents) ? lead.assignedAgents : [];
  }, [lead]);

  // Merge registered agents + current unregistered from lead
  const allAssignableAgents = useMemo(() => {
    const base = Array.isArray(assignableAgents) ? [...assignableAgents] : [];

    if (lead && lead.assignedAgentName && !lead.assignedAgentId) {
      const cleanLeadName = (lead.assignedAgentName || "")
        .replace(/\s\*$/, "")
        .trim()
        .toLowerCase();

      const exists = base.some((a) => {
        const clean = (a.name || "").replace(/\s\*$/, "").trim().toLowerCase();
        return clean === cleanLeadName;
      });

      if (!exists) {
        base.push({
          id: `unreg:from-lead:${leadId}`,
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

  async function addAdminNotification(message) {
    const trimmed = String(message || "").trim();
    if (!trimmed) return;

    const leadName =
      `${lead?.firstName || ""} ${lead?.lastName || ""}`.trim() || "(No name)";

    await addDoc(collection(db, "adminNotifications"), {
      leadId,
      leadName,
      latestActivity: trimmed,
      updatedBy: user?.uid || "",
      updatedByName: user?.displayName || user?.email || "Admin",
      isRead: false,
      createdAt: serverTimestamp(),
    });
  }

  async function addJournalEntry(text, type = "note", visibility = "shared") {
    const trimmed = String(text || "").trim();
    if (!trimmed) return;

    await addDoc(collection(db, "leads", leadId, "journal"), {
      text: trimmed,
      type,
      visibility, // shared = agent + admin can see
      createdAt: serverTimestamp(),
      createdBy: user?.uid || "",
      createdByEmail: user?.email || "",
      createdByRole: "admin",
    });
  }

async function handleEditJournalEntry(entryDocId, newText) {
  const entry = sharedJournal.find((e) => e.id === entryDocId);


  if (entry?._from === "array") {
    alert("Imported notes (stored on the lead doc) cannot be edited.");
    return;
  }

  const trimmed = String(newText || "").trim();
  if (!trimmed) return;

  try {
    await updateDoc(doc(db, "leads", leadId, "journal", entryDocId), {
      text: trimmed,
      editedAt: serverTimestamp(),
      editedBy: user?.uid || "",
      editedByEmail: user?.email || "",
      editedByRole: "admin", // optional; agents will set their own role in AgentLeadPage
    });

    // Optional: lightweight notification (no journal spam)
    await addAdminNotification("A shared journal entry was edited.");
  } catch (err) {
    console.error("handleEditJournalEntry error:", err);
    alert("Error editing journal entry. Check console.");
  }
}


async function handleDeleteJournalEntry(entryDocId) {
  const entry = sharedJournal.find((e) => e.id === entryDocId);


  if (entry?._from === "array") {
    alert("Imported notes cannot be deleted.");
    return;
  }

  const ok = window.confirm("Delete this journal entry?");
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "leads", leadId, "journal", entryDocId));
    await addAdminNotification("A shared journal entry was deleted.");
  } catch (err) {
    console.error("handleDeleteJournalEntry error:", err);
    alert("Error deleting journal entry. Check console.");
  }
}


  async function handleAddSecondaryAgent() {
    if (!lead) return;
    if (!secondaryAgentId) return;

    const agent = allAssignableAgents.find((a) => a.id === secondaryAgentId);
    if (!agent || agent.isPlaceholder) {
      alert("Please select a registered agent to add.");
      return;
    }

    if (lead.assignedAgentId && lead.assignedAgentId === agent.id) {
      alert("That agent is already the primary assignment.");
      return;
    }

    const agentObj = {
      id: agent.id,
      name: (agent.name || agent.fullName || agent.email || "").replace(/\s\*$/, ""),
      email: agent.email || "",
      emailNorm: normEmail(agent.email),
    };

    const currentAssignedAgents = Array.isArray(lead.assignedAgents) ? lead.assignedAgents : [];
    if (currentAssignedAgents.some((a) => a.id === agentObj.id)) {
      alert("That agent is already assigned as an additional agent.");
      return;
    }

    const nextAssignedAgents = [...currentAssignedAgents, agentObj];

    const currentIds = Array.isArray(lead.assignedAgentIds) ? lead.assignedAgentIds : [];
    const currentEmailNorms = Array.isArray(lead.assignedAgentEmailNorms) ? lead.assignedAgentEmailNorms : [];

    const nextIds = uniqStrings([...currentIds, agentObj.id, lead.assignedAgentId].filter(Boolean));
    const nextEmailNorms = uniqStrings([
      ...currentEmailNorms,
      agentObj.emailNorm,
      normEmail(lead.assignedAgentEmail),
    ].filter(Boolean));

    const ref = doc(db, "leads", leadId);

    try {
      setUpdatingAssignments(true);

      const msg = `Admin added ${agentObj.name || agentObj.email} to this lead.`;

      await updateDoc(ref, {
        assignedAgents: nextAssignedAgents,
        assignedAgentIds: nextIds,
        assignedAgentEmailNorms: nextEmailNorms,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || "",
        latestActivity: msg,
        journalLastEntry: msg,
      });

      await addJournalEntry(msg, "admin-update", "shared");
      await addAdminNotification(msg);

      setSecondaryAgentId("");
    } catch (err) {
      console.error("handleAddSecondaryAgent error:", err);
      alert("Error adding secondary agent. Check console for details.");
    } finally {
      setUpdatingAssignments(false);
    }
  }

  async function handleRemoveSecondaryAgent(agentObj) {
    if (!lead) return;

    const ok = window.confirm(`Remove ${agentObj?.name || agentObj?.email || "this agent"} from this lead?`);
    if (!ok) return;

    const currentAssignedAgents = Array.isArray(lead.assignedAgents) ? lead.assignedAgents : [];
    const nextAssignedAgents = currentAssignedAgents.filter((a) => a.id !== agentObj.id);

    const currentIds = Array.isArray(lead.assignedAgentIds) ? lead.assignedAgentIds : [];
    const currentEmailNorms = Array.isArray(lead.assignedAgentEmailNorms) ? lead.assignedAgentEmailNorms : [];

    const nextIds = uniqStrings(
      currentIds.filter((id) => id !== agentObj.id).concat(lead.assignedAgentId ? [lead.assignedAgentId] : [])
    );

    const nextEmailNorms = uniqStrings(
      currentEmailNorms
        .filter((e) => e !== normEmail(agentObj.email))
        .concat(lead.assignedAgentEmail ? [normEmail(lead.assignedAgentEmail)] : [])
    );

    const ref = doc(db, "leads", leadId);
    const msg = `Admin removed ${agentObj?.name || agentObj?.email || "agent"} from this lead.`;

    try {
      setUpdatingAssignments(true);

      await updateDoc(ref, {
        assignedAgents: nextAssignedAgents,
        assignedAgentIds: nextIds,
        assignedAgentEmailNorms: nextEmailNorms,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || "",
        latestActivity: msg,
        journalLastEntry: msg,
      });

      await addJournalEntry(msg, "admin-update", "shared");
      await addAdminNotification(msg);
    } catch (err) {
      console.error("handleRemoveSecondaryAgent error:", err);
      alert("Error removing secondary agent. Check console for details.");
    } finally {
      setUpdatingAssignments(false);
    }
  }

  // Unified save handler used by <LeadFormAdmin />
async function handleAdminSave(form) {
  if (!lead) return;
  setSaving(true);

  // ✅ LeadFormAdmin sends typed note as `journalNote`
  const { journalNote: typedNoteRaw, ...formWithoutNote } = form || {};
  const typedNote = String(typedNoteRaw || "").trim();

  try {
    const ref = doc(db, "leads", leadId);

    const trimmedActionItem = (actionItemDraft || "").trim();
    const trimmedPropertyAddress = (propertyAddressDraft || "").trim();

    // 2) Determine assignment update (ONLY log if changed)
    let assignedAgentId = lead.assignedAgentId || null;
    let assignedAgentName = lead.assignedAgentName || null;
    let assignedAgentEmail = lead.assignedAgentEmail || null;

    let assignmentChangeText = "";
    const prevAssignedId = String(lead.assignedAgentId || "");
    const nextSelectedId = String(selectedAgentId || "");

    // unassign
    if (!nextSelectedId && (lead.assignedAgentId || lead.assignedAgentName)) {
      const oldName = lead.assignedAgentName || lead.assignedAgentEmail || "previous agent";
      assignedAgentId = null;
      assignedAgentName = null;
      assignedAgentEmail = null;

      // ✅ only log if it was actually assigned before
      assignmentChangeText = `Admin unassigned the lead from ${oldName}.`;
    }

    // assign / change
    if (nextSelectedId) {
      const newAgent = allAssignableAgents.find((a) => a.id === nextSelectedId);
      if (newAgent) {
        const cleanName = (newAgent.name || "").replace(/\s\*$/, "");
        const newName = cleanName || newAgent.email || "Unnamed user";

        if (newAgent.isPlaceholder) {
          assignedAgentId = null;
          assignedAgentName = newName;
          assignedAgentEmail = newAgent.email || null;

          // ✅ only log if something changed
          if (prevAssignedId !== "") {
            assignmentChangeText = `Admin updated assignment to ${newName} (unregistered).`;
          }
        } else {
          assignedAgentId = newAgent.id;
          assignedAgentName = newName;
          assignedAgentEmail = newAgent.email || null;

          // ✅ log ONLY if changed
          if (prevAssignedId !== newAgent.id) {
            const oldName = lead.assignedAgentName || "Unassigned";
            assignmentChangeText = `Admin reassigned lead from ${oldName} to ${newName}.`;
          }
        }
      }
    }

    // 3) Build change summary (DO NOT include the typed note here)
    const changes = buildAdminUpdateSummary(lead, {
      ...lead,
      ...formWithoutNote,
      actionItem: trimmedActionItem,
      propertyAddress: trimmedPropertyAddress,
    });

    if (assignmentChangeText) {
      changes.push({ type: "admin-update", text: assignmentChangeText });
    }

    const meaningfulChanges = changes.filter((c) => c.type !== "action-item");
const actionOnlyChanged = changes.length > 0 && meaningfulChanges.length === 0;
const hasNote = !!typedNote;
const hasAssignmentChange = !!assignmentChangeText;

// If ONLY action item changed, and no note, and no assignment change → silent save
// If ONLY action item changed, and no note, and no assignment change →
// ✅ silent rollups, but still journal it for admin
if (actionOnlyChanged && !hasNote && !hasAssignmentChange) {
  await updateDoc(ref, {
    ...formWithoutNote,
    actionItem: trimmedActionItem || "",
    propertyAddress: trimmedPropertyAddress || "",
    updatedBy: user?.uid || "",
    updatedByEmail: user?.email || "",
    updatedByName: user?.displayName || user?.email || "",
    updatedByRole: "admin",
    updatedAt: serverTimestamp(),
    // ✅ intentionally NO latestActivity / journalLastEntry / latestActivityAt
  });

  // ✅ write admin-only journal entry for the action item change
  for (const c of changes) {
    await addJournalEntry(
      c.text,
      c.type || "admin-update",
      c.visibility || "shared" // action-item is "admin"
    );
  }

  // optional: no admin notification if you want it truly quiet
  // await addAdminNotification("Admin updated action item.");

  setSaving(false);
  return;
}


    // ✅ Activity summary should reflect field changes only (not the note text)
    const summaryText =
      changes
        .filter((c) => c.type !== "action-item")
        .map((c) => c.text)
        .join(" ")
        .trim() || "Admin saved lead.";

    // 4) Update lead doc (IMPORTANT: spread formWithoutNote, not form)
    const baseUpdate = {
      ...formWithoutNote,

      updatedByEmail: user?.email || "",
      updatedByName: user?.displayName || user?.email || "",
      updatedByRole: "admin",

      firstAttemptDate: formWithoutNote.firstAttemptDate || null,
      nextEvaluationDate: formWithoutNote.nextEvaluationDate || null,
      registrationDate: formWithoutNote.registrationDate || "",
      registeredDateRaw: formWithoutNote.registrationDate || lead.registeredDateRaw || "",

      actionItem: trimmedActionItem || "",
      propertyAddress: trimmedPropertyAddress || "",

      assignedAgentId,
      assignedAgentName,
      assignedAgentEmail,
      assignedAgentEmailNorm: normEmail(assignedAgentEmail) || null,

      updatedBy: user?.uid || "",
      updatedAt: serverTimestamp(),

      // rollups
      latestActivity: summaryText,
      journalLastEntry: typedNote ? typedNote : summaryText,
      latestActivityAt: serverTimestamp(),
    };

    await updateDoc(ref, baseUpdate);

    // 5) Write journal entries
    // ✅ Write field changes as separate entries
for (const c of changes) {
  await addJournalEntry(
    c.text,
    c.type || "admin-update",
    c.visibility || "shared" // ✅ default shared, action-item becomes admin
  );
}


    // ✅ Write the typed note as its own entry (THIS is what you want to see)
   if (typedNote) {
  await addJournalEntry(typedNote, "note", "shared");
}


    // ✅ One clean notification (not 5+ noisy ones)
    await addAdminNotification(typedNote ? `Admin note: ${typedNote}` : summaryText);
  } catch (err) {
    console.error("Error saving lead:", err);
    alert("Error saving lead. Check console for details.");
  } finally {
    setSaving(false);
  }
}


function handleClosePanel() {
  setClosing(true);
  setTimeout(() => {
    navigate("/admin");
  }, 250);
}
async function handleCreateAndAssignAgent() {
  if (!lead) return;

  const name = (newAgentName || "").trim();
  const email = (newAgentEmail || "").trim();

  if (!name) {
    alert("Please enter an agent name.");
    return;
  }

  const slug =
    name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || null;

  if (!slug) {
    alert("Please enter a name with letters/numbers (or add an email).");
    return;
  }

  try {
    const unregRef = doc(db, "unregisteredAgents", slug);

    await setDoc(
      unregRef,
      { name, email: email || "", source: "manual-admin-entry", createdAt: serverTimestamp() },
      { merge: true }
    );

    // ✅ FIX: use leadId (or lead.docId), NOT lead.id
    await updateDoc(doc(db, "leads", leadId), {
      assignedAgentId: null,
      assignedAgentName: name,
      assignedAgentEmail: email || null,
      assignedAgentEmailNorm: email ? normEmail(email) : null,
      updatedAt: serverTimestamp(),
      updatedBy: user?.uid || "",
    });

    const msg = `Admin assigned lead to ${name} (unregistered).`;
    await addJournalEntry(msg, "admin-update", "shared");
    await addAdminNotification(msg);

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
    const text = trimmed
      ? `Admin updated assigned agent email to ${trimmed}.`
      : "Admin cleared assigned agent email.";

    if (!trimmed) {
      const ok = window.confirm("You are about to clear the assigned agent email. Continue?");
      if (!ok) return;
    }

    const ref = doc(db, "leads", leadId);

    try {
      setSavingAgentEmail(true);

      await updateDoc(ref, {
        assignedAgentEmail: trimmed || null,
        assignedAgentEmailNorm: trimmed ? normEmail(trimmed) : null,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || "",
        latestActivity: text,
        journalLastEntry: text,
      });

      await addJournalEntry(text, "admin-update", "shared");
      await addAdminNotification(text);
    } catch (err) {
      console.error("Error saving agent email:", err);
      alert("Error saving agent email. Check console for details.");
    } finally {
      setSavingAgentEmail(false);
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

    const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(bodyLines.join("\n"))}`;

    window.location.href = mailto;
  }

function handleEmailAgentAboutLatest() {
  if (!lead) return;

  if (!lead.assignedAgentEmail) {
    alert("This lead does not have an assigned agent email.");
    return;
  }

  // IMPORTANT: verify your real route here
  const url = `${window.location.origin}/agent/${encodeURIComponent(leadId)}`;

  const subject = `Update to your lead: ${(lead.firstName || "").trim()} ${(lead.lastName || "").trim()}`.trim();

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
  "You can view and update the lead using the link below.",
  "Please log in to update your lead.",
  "",
  url,
  "",         // blank line helps
  "(If the link is not clickable, copy and paste it into your browser.)",
  "",
  "Thank you,",
  "WRC Leads",
];



  // Choose Outlook Web (best) vs mailto fallback
  const useOutlook = window.confirm(
    "Click OK to open Outlook Web (recommended).\nClick Cancel to use your default email app."
  );

  if (useOutlook) {
    const outlookUrl =
      "https://outlook.office.com/mail/deeplink/compose" +
      `?to=${encodeURIComponent(lead.assignedAgentEmail)}` +
      `&subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(bodyLines.join("\n"))}`;

    window.open(outlookUrl, "_blank", "noopener,noreferrer");
    return;
  }

  const mailto =
    `mailto:${encodeURIComponent(lead.assignedAgentEmail)}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(bodyLines.join("\n"))}`;

  window.location.href = mailto;
}


  const canEmailAgent = !!lead?.assignedAgentEmail;

  if (loading) return <div className="text-sm text-gray-600">Loading lead...</div>;
  if (!lead) return <div className="text-sm text-red-600">Lead not found.</div>;

    const adminBadges = [
    { value: lead.status, label: STATUS_LABELS[lead.status] || lead.status },
    {
      value: lead.relationshipRanking,
      label: RELATIONSHIP_LABELS[lead.relationshipRanking] || lead.relationshipRanking,
    },
    {
      value: lead.urgencyRanking,
      label: URGENCY_LABELS[lead.urgencyRanking] || lead.urgencyRanking,
    },
  ];

const adminSidebar = (
  
  <div className="xl:sticky xl:top-[88px] space-y-6">
  <section className="bg-amber-50 rounded-2xl shadow-lg border border-amber-200 overflow-hidden">
  <div className="px-5 py-4 border-b border-amber-200">
    <h3 className="text-lg font-extrabold text-amber-900">
      Action item (agent-visible)
    </h3>
  </div>

  <div className="px-5 py-5 space-y-3">
    <p className="text-sm text-amber-900/80">
      This shows on the agent dashboard under “Next Action Item.”
    </p>

    <textarea
      rows={4}
      className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white"
      placeholder="Example: Call by Friday to schedule a buyer consult…"
      value={actionItemDraft}
      onChange={(e) => setActionItemDraft(e.target.value)}
    />

    <p className="text-[11px] text-amber-900/70">
      Saves when you click <span className="font-semibold">Save lead</span>.
    </p>
  </div>
</section>
    <section className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 bg-white">
        <h3 className="text-lg font-extrabold text-[var(--color-wrcBlack)]">
          Agent & notifications
        </h3>
      </div>

      <div className="px-5 py-5 space-y-5">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">
            Current assignment
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            {lead.assignedAgentName ? (
              <>
                <div className="font-semibold text-gray-900">
                  {lead.assignedAgentName}
                </div>
                {lead.assignedAgentEmail ? (
                  <div className="text-blue-700 text-sm mt-1">
                    {lead.assignedAgentEmail}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400 mt-1">No email on file</div>
                )}
              </>
            ) : (
              <div className="italic text-gray-400">Unassigned</div>
            )}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">
            Assign / change agent
          </div>

          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">— Unassigned —</option>
            {allAssignableAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {(a.name || a.email || "Unnamed user") + (a.email ? ` (${a.email})` : "")}
              </option>
            ))}
          </select>

          <p className="mt-2 text-[11px] text-gray-500">
            Assignment changes save when you click <span className="font-semibold">Save lead</span>.
          </p>
        </div>

        <div className="pt-4 border-t border-gray-200">
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">
            Also assigned agents
          </div>

          <div className="flex gap-2">
            <select
              value={secondaryAgentId}
              onChange={(e) => setSecondaryAgentId(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— Add additional agent —</option>
              {allAssignableAgents
                .filter((a) => !a.isPlaceholder)
                .filter((a) => a.id !== (lead.assignedAgentId || ""))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {(a.name || a.email || "Unnamed user") + (a.email ? ` (${a.email})` : "")}
                  </option>
                ))}
            </select>

            <button
              type="button"
              onClick={handleAddSecondaryAgent}
              disabled={!secondaryAgentId || updatingAssignments}
              className="px-4 py-2 rounded-lg bg-black text-[#fff200] text-sm font-bold disabled:opacity-60"
            >
              {updatingAssignments ? "..." : "Add"}
            </button>
          </div>

          {secondaryAssignedAgents.length > 0 ? (
            <div className="mt-3 space-y-2">
              {secondaryAssignedAgents.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">
                      {a.name || a.email}
                    </div>
                    {a.email ? (
                      <div className="text-xs text-gray-500 truncate">{a.email}</div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveSecondaryAgent(a)}
                    disabled={updatingAssignments}
                    className="text-xs px-3 py-1 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-sm text-gray-500">No additional agents assigned.</div>
          )}
        </div>

        <div className="pt-4 border-t border-gray-200">
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">
            Assign unregistered agent
          </div>

          <div className="space-y-2">
            <input
              type="text"
              placeholder="Agent full name"
              value={newAgentName}
              onChange={(e) => setNewAgentName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="email"
              placeholder="Email (optional)"
              value={newAgentEmail}
              onChange={(e) => setNewAgentEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleCreateAndAssignAgent}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold hover:bg-gray-50"
            >
              Create & assign
            </button>
          </div>
        </div>

        {canEmailAgent && (
          <div className="pt-4 border-t border-gray-200 space-y-2">
            <button
              type="button"
              onClick={handleEmailAgentAboutLatest}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold hover:bg-gray-50"
            >
              Email agent about latest update
            </button>
            <button
              type="button"
              onClick={handleEmailAgentInvite}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold hover:bg-gray-50"
            >
              Email invite to register
            </button>
          </div>
        )}
      </div>
    </section>

    <section className="bg-red-50 rounded-2xl shadow-lg border border-red-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-red-200">
        <h3 className="text-lg font-extrabold text-red-900">
          Bad Lead (Admin Only)
        </h3>
      </div>

      <div className="px-5 py-5 space-y-4">
        <p className="text-sm text-red-900/80">
          Use this only after reviewing the rejection request.
        </p>

        <button
          type="button"
          onClick={async () => {
            const ok = window.confirm("Mark this lead as BAD LEAD? This is admin-only.");
            if (!ok) return;

            const msg = "🚫 Admin marked this lead as BAD LEAD.";

            await updateDoc(doc(db, "leads", leadId), {
              status: "bad_lead",
              rejectionStatus: "approved",
              updatedAt: serverTimestamp(),
              updatedBy: user?.uid || "",
              latestActivity: msg,
              latestActivityAt: serverTimestamp(),
              journalLastEntry: msg,
            });

            await addJournalEntry(msg, "admin-update", "shared");
            await addAdminNotification(msg);
          }}
          className="w-full px-4 py-3 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700"
        >
          Mark Bad Lead
        </button>

        {lead?.rejectionRequested ? (
          <div className="text-sm text-red-900 whitespace-pre-wrap">
            <span className="font-semibold">Agent reason:</span>{" "}
            {lead.rejectionReason || "—"}
          </div>
        ) : null}
      </div>
    </section>

    <section className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 bg-white">
        <h3 className="text-lg font-extrabold text-[var(--color-wrcBlack)]">
          Assigned agent email
        </h3>
      </div>

      <div className="px-5 py-5 space-y-3">
        <p className="text-sm text-gray-500">
          Use this when a lead was imported with an agent name but no email.
        </p>

        <input
          type="email"
          value={manualAgentEmail}
          onChange={(e) => setManualAgentEmail(e.target.value)}
          placeholder="agent@example.com"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />

        <button
          type="button"
          onClick={handleSaveAgentEmail}
          disabled={savingAgentEmail}
          className="w-full px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60"
        >
          {savingAgentEmail ? "Saving..." : "Save agent email"}
        </button>
      </div>
    </section>



    <section className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 bg-white">
        <h3 className="text-lg font-extrabold text-[var(--color-wrcBlack)]">
          Property address (agent-visible)
        </h3>
      </div>

      <div className="px-5 py-5 space-y-3">
        <p className="text-sm text-gray-500">
          This is the address the lead is asking about.
        </p>

        <input
          type="text"
          value={propertyAddressDraft}
          onChange={(e) => setPropertyAddressDraft(e.target.value)}
          placeholder='e.g., "123 Main St, West Chester, PA 19382"'
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />

        <p className="text-[11px] text-gray-500">
          Saves when you click <span className="font-semibold">Save lead</span>.
        </p>
      </div>
    </section>
  </div>
);

return (
  <div className="fixed inset-0 z-50">
    <div
      className="absolute inset-0 bg-black/40"
      onClick={handleClosePanel}
    />

    <div
      className={`absolute inset-y-0 right-0 w-full max-w-[1200px] bg-[var(--color-wrcGray)] shadow-2xl border-l border-gray-200 overflow-y-auto ${
        closing
          ? "animate-[slideOutRight_.25s_ease-in]"
          : "animate-[slideInRight_.25s_ease-out]"
      }`}
    >
      <LeadDetailView
        mode="admin"
        lead={lead}
        saving={saving}
        onBack={handleClosePanel}
        onAdminSave={handleAdminSave}
        sharedJournal={sharedJournal}
        canEditJournal
        onDeleteJournalEntry={handleDeleteJournalEntry}
        onEditJournalEntry={handleEditJournalEntry}
        topBadges={adminBadges}
        sidebar={adminSidebar}
      />
    </div>
  </div>
);
}