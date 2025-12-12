
import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db, deleteUserByUid } from "../firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  writeBatch,
  where,
  limit,
} from "firebase/firestore";
import LeadBadge from "../components/LeadBadge";
import LeadFormAdmin from "../components/LeadFormAdmin";
import {
  STATUS_LABELS,
  LEAD_TYPE_LABELS,
  RELATIONSHIP_LABELS,
  URGENCY_LABELS,
  SOURCE_LABELS,
} from "../constants/leadOptions";
// import useAgents from "../hooks/useAgents";
import useAssignableAgents from "../hooks/useAssignableAgents";
import { Link, useNavigate } from "react-router-dom";
// import { normName, normEmail } from "../utils/normalize";
import { useVirtualizer } from "@tanstack/react-virtual";

// ---------- Small helpers ----------
function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normEmail(s) {
  return String(s || "").toLowerCase().trim();
}

function formatDate(tsOrString) {
  if (!tsOrString) return "";
  if (tsOrString.toDate) {
    const d = tsOrString.toDate();
    return d.toISOString().split("T")[0];
  }
  return tsOrString;
}

function formatDateTimeFromMillis(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function agentKeyForLead(lead) {
  // Registered assignment
  if (lead.assignedAgentId) return `reg:${lead.assignedAgentId}`;

  // Unregistered assignment by name (normalized)
  const nm = normName(String(lead.assignedAgentName || "").replace(/\s\*$/, ""));
  if (nm) return `unreg:${nm}`;

  return "none";
}

// ---------- UI helpers (CSS-only facelift) ----------
const cx = (...arr) => arr.filter(Boolean).join(" ");

function StatCard({ label, value, sublabel }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
      {sublabel ? (
        <div className="mt-1 text-[11px] text-gray-500">{sublabel}</div>
      ) : null}
    </div>
  );
}

function Chip({ children, onRemove }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] text-gray-700">
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full px-1 text-gray-500 hover:text-gray-900"
          aria-label="Remove filter"
          title="Remove"
        >
          ✕
        </button>
      ) : null}
    </span>
  );
}

// Safe millis helper for Firestore Timestamp | Date | string
function toMillis(value) {
  if (!value) return null;
  if (value?.toMillis) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

function clamp2Style() {
  // avoids needing tailwind line-clamp plugin
  return {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  };
}

// ---------- Assign Agent Modal ----------

function AssignAgentModal({ lead, agents, onClose, onAssign, assigning }) {
  const [selectedId, setSelectedId] = React.useState("");
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    if (lead?.assignedAgentId) {
      setSelectedId(lead.assignedAgentId);
    } else {
      setSelectedId("");
    }
  }, [lead]);

  const filteredAgents = React.useMemo(() => {
    if (!Array.isArray(agents)) return [];

    const term = search.trim().toLowerCase();
    const base = agents.slice().sort((a, b) => {
      const aName = (a.name || a.email || "").toLowerCase();
      const bName = (b.name || b.email || "").toLowerCase();
      return aName.localeCompare(bName);
    });

    if (!term) return base;

    return base.filter((a) => {
      const name = (a.name || "").toLowerCase();
      const email = (a.email || "").toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [agents, search]);


  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full mx-4 p-4 sm:p-5 text-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Assign agent</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-800"
          >
            ✕ Close
          </button>
        </div>

        <p className="text-xs text-gray-600 mb-3">
          Lead:{" "}
          <span className="font-semibold">
            {lead.firstName} {lead.lastName}
          </span>
        </p>

        {!Array.isArray(agents) || agents.length === 0 ?(
          <div className="text-xs text-gray-500">
            No agents found. Make sure agents create an account first.
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!selectedId) return;
              onAssign(selectedId);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-medium mb-1">
                Search agents
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type name or email..."
                className="w-full border rounded-lg px-2.5 py-1.5 text-xs"
              />
              <div className="mt-1 text-[10px] text-gray-400">
                Showing {filteredAgents.length} of {assignableAgents.length} agents
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                Select agent
              </label>
              {filteredAgents.length === 0 ? (
                <div className="text-[11px] text-gray-500 border rounded-lg px-2.5 py-2 bg-gray-50">
                  No agents match your search.
                </div>
              ) : (
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="w-full border rounded-lg px-2.5 py-1.5 text-sm"
                >
                  <option value="">Choose an agent...</option>
                  {filteredAgents.map((a) => (
                  <option key={a.id} value={a.id}>
  {(a.name || a.fullName || a.email || "Unnamed user") +
    (a.email ? ` (${a.email})` : "")}
</option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selectedId || assigning}
                className="px-3 py-1.5 text-xs bg-wrcBlack text-wrcYellow rounded-lg font-semibold disabled:opacity-60"
              >
                {assigning ? "Assigning..." : "Assign"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------- Email Agent Modal ----------

function EmailAgentModal({ lead, onClose }) {
  if (!lead) return null;

  const url = `${window.location.origin}/agent/${lead.id}`;
  const to = lead.assignedAgentEmail || "";
  const subject = `New lead assigned to you: ${lead.firstName} ${lead.lastName}`;
  const body = `Hi ${lead.assignedAgentName || ""},

A new lead has been assigned to you in the WRC Lead Dashboard.

Click this link to view and update the lead:
${url}

Thank you.
`;

  async function copyText(text, label) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      alert(`${label} copied to clipboard.`);
    } catch (err) {
      console.error("Copy error:", err);
      alert(`${label} could not be copied. You can select and copy manually.`);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-lg w-full mx-4 p-4 sm:p-5 text-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Email agent link
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-800"
          >
            ✕ Close
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <div className="font-semibold text-gray-700 mb-0.5">To</div>
            <div className="px-2 py-1 border border-gray-200 rounded bg-gray-50">
              {to || <span className="italic text-gray-400">No email set</span>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="font-semibold text-gray-700">Subject</span>
              <button
                type="button"
                onClick={() => copyText(subject, "Subject")}
                className="text-[11px] px-2 py-1 border border-gray-300 rounded-full hover:bg-gray-50"
              >
                Copy subject
              </button>
            </div>
            <textarea
              readOnly
              rows={2}
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-gray-50"
              value={subject}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="font-semibold text-gray-700">Body</span>
              <button
                type="button"
                onClick={() => copyText(body, "Body")}
                className="text-[11px] px-2 py-1 border border-gray-300 rounded-full hover:bg-gray-50"
              >
                Copy body
              </button>
            </div>
            <textarea
              readOnly
              rows={6}
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-gray-50"
              value={body}
            />
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <a
            href={`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
              subject
            )}&body=${encodeURIComponent(body)}`}
            className="block text-center bg-wrcBlack text-wrcYellow px-3 py-2 rounded-lg text-xs font-semibold hover:bg-black"
          >
            Open email client
          </a>

          <div className="text-[11px] text-gray-500 text-center">
            Or copy subject/body above and paste manually.
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Main Admin Dashboard ----------

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

    // UI facelift controls
  const [filtersOpen, setFiltersOpen] = useState(false);

  // CSV preview state
  const [csvPreview, setCsvPreview] = useState(null);
  const [csvSelectedRowIds, setCsvSelectedRowIds] = useState([]);
  const [csvPreviewOpen, setCsvPreviewOpen] = useState(false);
  const [csvSort, setCsvSort] = useState({
    field: null,
    direction: "asc",
  });

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
const { agents: assignableAgents, loading: agentsLoading } = useAssignableAgents();

  const [assigningLead, setAssigningLead] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [emailLead, setEmailLead] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [relationshipFilter, setRelationshipFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const [dateQuickFilter, setDateQuickFilter] = useState("all");
  const [search, setSearch] = useState("");

  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  // Bulk selection
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [bulkAssignAgentId, setBulkAssignAgentId] = useState("");
  const [bulkWorking, setBulkWorking] = useState(false);

  // Action items
  const [lastSavedActionItemId, setLastSavedActionItemId] = useState(null);
  const [actionItemDrafts, setActionItemDrafts] = useState({});
  const [savingActionItemId, setSavingActionItemId] = useState(null);

  // New lead assignment
  const [newLeadAssignedAgentId, setNewLeadAssignedAgentId] = useState("");

  // UI tweaks
  const [dense, setDense] = useState(false);

  const [agentLeadsOpen, setAgentLeadsOpen] = useState(false);
const [agentLeadsTarget, setAgentLeadsTarget] = useState(null); 
// { key, name, email, isPlaceholder }

  // Sort config
  const [sortConfig, setSortConfig] = useState({
    field: null,
    direction: "asc",
  });

  const headerPad = dense ? "py-1" : "py-2";
  const cellPad = dense ? "py-1" : "py-2";

  // Notifications
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "adminNotifications"),
      where("isRead", "==", false),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = [];
        snap.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() });
        });
        setNotifications(items);
      },
      (err) => {
        console.error("Error loading admin notifications:", err);
      }
    );

    return () => unsub();
  }, [user]);

  async function handleNotificationClick(n) {
    try {
      const ref = doc(db, "adminNotifications", n.id);
      await updateDoc(ref, { isRead: true });
    } catch (err) {
      console.error("Error marking notification read:", err);
    }

    if (n.leadId) {
      navigate(`/admin/lead/${n.leadId}`);
    }
  }
async function handleDeleteUnregisteredAgent(agentRow) {
  // agentRow is one row from agentStats
  // We expect: { id, name, isPlaceholder: true, ... }

  const display = agentRow?.name || "Unregistered agent";

  // figure out which leads are currently assigned to this placeholder
  const affected = (Array.isArray(leads) ? leads : []).filter((l) => {
    // Only unregistered-style leads: no assignedAgentId, but name matches
    if (l.assignedAgentId) return false;
    const k = agentKeyForLead(l);
    const agentKey =
      agentRow.id?.startsWith("unreg:") ? agentRow.id : `unreg:${normName(display.replace(/\s\*$/, ""))}`;
    return k === agentKey;
  });

  const msg =
    `Delete "${display}"?\n\n` +
    `Leads currently assigned to this unregistered agent: ${affected.length}\n\n` +
    `OK = Delete + unassign those leads\nCancel = Do nothing`;

  const confirmed = window.confirm(msg);
  if (!confirmed) return;

  try {
    const batch = writeBatch(db);

    // 1) Unassign leads so the agent truly disappears
    affected.forEach((l) => {
      const ref = doc(db, "leads", l.id);

      const text = `Admin deleted unregistered agent "${display}" and unassigned this lead.`;

      batch.update(ref, {
        assignedAgentId: null,
        assignedAgentName: null,
        assignedAgentEmail: null,
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
          type: "unregistered-agent-deleted",
        }),
      });
    });

    // 2) Delete the placeholder doc (ONLY if it exists in your DB)
    // If your placeholder docs live in "unregisteredAgents":
    // agentRow.id might be a Firestore doc id OR your synthetic "unreg:john smith"
    // If you created docs with real ids, delete those. If not, skip safely.
    if (agentRow.id && !agentRow.id.startsWith("unreg:")) {
      batch.delete(doc(db, "unregisteredAgents", agentRow.id));
    }

    await batch.commit();

    alert(`Deleted "${display}" and unassigned ${affected.length} lead(s).`);
  } catch (err) {
    console.error("Delete unregistered agent error:", err);
    alert("Error deleting unregistered agent. Check console.");
  }
}

  async function handleMarkNotificationsRead() {
    if (!notifications.length) return;

    try {
      const batch = writeBatch(db);
      notifications.forEach((n) => {
        const ref = doc(db, "adminNotifications", n.id);
        batch.update(ref, { isRead: true });
      });
      await batch.commit();
    } catch (err) {
      console.error("Error marking notifications as read:", err);
      alert("Error marking notifications as read. See console.");
    }
  }
function openAgentLeads(agentRow) {
  // Build a stable key to filter leads
  const key = agentRow.isPlaceholder
    ? (agentRow.id?.startsWith("unreg:") ? agentRow.id : `unreg:${normName(String(agentRow.name || "").replace(/\s\*$/, ""))}`)
    : `reg:${agentRow.id}`;

  setAgentLeadsTarget({
    key,
    name: agentRow.name,
    email: agentRow.email || "",
    isPlaceholder: !!agentRow.isPlaceholder,
  });
  setAgentLeadsOpen(true);
}

  // ---------- Table sorting helpers ----------

  function handleSort(field) {
    setSortConfig((prev) => {
      if (prev.field === field) {
        return {
          field,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { field, direction: "asc" };
    });
  }

  function getSortValue(lead, field) {
    switch (field) {
      case "name":
        return `${lead.firstName || ""} ${lead.lastName || ""}`
          .trim()
          .toLowerCase();

      case "nextEvaluationDate": {
        const d = lead.nextEvaluationDate;
        if (!d) return null;
        if (d.toMillis) return d.toMillis();
        const t = new Date(d).getTime();
        return Number.isNaN(t) ? null : t;
      }

      case "registeredDateRaw": {
        const v = lead.registeredDateRaw;
        if (!v) return null;
        if (v.toMillis) return v.toMillis();
        const t = new Date(v).getTime();
        return Number.isNaN(t) ? null : t;
      }

      case "status":
        return (STATUS_LABELS[lead.status] || lead.status || "").toLowerCase();

      case "leadType":
        return (
          LEAD_TYPE_LABELS[lead.leadType] || lead.leadType || ""
        ).toLowerCase();

      case "relationshipRanking":
        return Number(lead.relationshipRanking || 0);

      case "urgencyRanking":
        return (
          URGENCY_LABELS[lead.urgencyRanking] ||
          lead.urgencyRanking ||
          ""
        ).toLowerCase();

      case "source":
        return (SOURCE_LABELS[lead.source] || lead.source || "").toLowerCase();

      case "assignedAgent":
        return (
          lead.assignedAgentName || lead.assignedAgentEmail || ""
        ).toLowerCase();

      default:
        return null;
    }
  }

  const SortHeader = ({ label, field }) => {
    const isActive = sortConfig.field === field;
    const arrow = !isActive
      ? "↕"
      : sortConfig.direction === "asc"
      ? "▲"
      : "▼";

    return (
      <button
        type="button"
        onClick={() => handleSort(field)}
        className="flex items-center gap-1 hover:text-gray-900"
      >
        <span>{label}</span>
        <span className="text-[10px]">{arrow}</span>
      </button>
    );
  };

  // ---------- Firestore subscription ----------

  useEffect(() => {
    const q = query(collection(db, "leads"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setLeads(items);
        setLoading(false);
      },
      (err) => {
        console.error("Error loading leads:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  // ---------- Bulk selection helpers ----------

  function toggleSelectOne(id) {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (selectedLeadIds.length === sortedLeads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(sortedLeads.map((lead) => lead.id));
    }
  }

  // ---------- Bulk actions ----------

  async function handleBulkDelete() {
    if (selectedLeadIds.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedLeadIds.length} lead(s)? This cannot be undone.`
    );
    if (!confirmed) return;

    setBulkWorking(true);

    try {
      let batch = writeBatch(db);
      let count = 0;

      for (const id of selectedLeadIds) {
        const ref = doc(db, "leads", id);
        batch.delete(ref);
        count++;

        if (count === 450) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
      }

      setSelectedLeadIds([]);
      alert("Selected leads deleted.");
    } catch (err) {
      console.error("Bulk delete error:", err);
      alert("Error deleting leads. Check console for details.");
    } finally {
      setBulkWorking(false);
    }
  }

  async function handleBulkAssign() {
    if (selectedLeadIds.length === 0) return;
    if (!bulkAssignAgentId) {
      alert("Please choose an agent to assign.");
      return;
    }

    const agent =
      Array.isArray(assignableAgents) && assignableAgents.find((a) => a.id === bulkAssignAgentId);
    if (!agent) {
      alert("Selected agent not found.");
      return;
      
    }

    const confirmed = window.confirm(
      `Assign ${selectedLeadIds.length} selected lead(s) to ${
        agent.fullName || agent.email
      }?`
    );
    if (!confirmed) return;

    setBulkWorking(true);

    try {
      let batch = writeBatch(db);
      let count = 0;

      selectedLeadIds.forEach((id) => {
        const lead = leads.find((l) => l.id === id);
        if (!lead) return;

        const ref = doc(db, "leads", id);

        const oldName =
          lead.assignedAgentName ||
          lead.assignedAgentEmail ||
          "Unassigned";
        const newName = agent.fullName || agent.email || "Unnamed user";

        let text;
        if (!lead.assignedAgentId) {
          text = `Admin bulk assigned lead to ${newName}.`;
        } else if (lead.assignedAgentId !== agent.id) {
          text = `Admin bulk reassigned lead from ${oldName} to ${newName}.`;
        } else {
          text = `Admin bulk confirmed assignment for ${newName}.`;
        }

        batch.update(ref, {
        assignedAgentId: agent.isPlaceholder ? null : agent.id,
assignedAgentName: agent.isPlaceholder
  ? agent.name.replace(/\s\*$/, "").trim()
  : agent.fullName || agent.email,
assignedAgentEmail: agent.email || null,

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
            type: "bulk-assignment",
          }),
        });

        count++;

        if (count === 450) {
          batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      });

      if (count > 0) {
        await batch.commit();
      }

      setBulkAssignAgentId("");
      setSelectedLeadIds([]);
      alert("Selected leads assigned.");
    } catch (err) {
      console.error("Bulk assign error:", err);
      alert("Error assigning leads. Check console for details.");
    } finally {
      setBulkWorking(false);
    }
  }

  // ---------- New lead creation ----------

  async function handleCreateLead(formData) {
    setSaving(true);
    try {
      const {
        firstAttemptDate,
        nextEvaluationDate,
        journalLastEntry,
        ...rest
      } = formData;

  const selectedAgent =
  newLeadAssignedAgentId && Array.isArray(assignableAgents)
    ? assignableAgents.find((a) => a.id === newLeadAssignedAgentId)
    : null;


      const assignedAgentName = selectedAgent
        ? selectedAgent.fullName || selectedAgent.email
        : null;

      const assignedAgentEmail = selectedAgent ? selectedAgent.email || null : null;

      const baseActivity = "Lead created by admin.";
      const activityWithAssignment = selectedAgent
        ? `${baseActivity} Assigned to ${assignedAgentName}.`
        : baseActivity;

      const payload = {
        ...rest,

        relationshipRanking: rest.relationshipRanking || "0",
        urgencyRanking: rest.urgencyRanking || "unsure",
        firstAttemptDate: firstAttemptDate || null,
        nextEvaluationDate: nextEvaluationDate || null,

        journalLastEntry: journalLastEntry || "",
        journal: journalLastEntry
          ? [
              {
                id: crypto.randomUUID(),
                createdAt: new Date(),
                createdBy: user.uid,
                createdByEmail: user.email,
                text: `Admin added note: "${journalLastEntry.trim()}"`,
                type: "admin-note",
              },
            ]
          : [],

        assignedAgentId: selectedAgent ? selectedAgent.id : null,
        assignedAgentName,
        assignedAgentEmail,

        status: rest.status || "engagement",
        leadType: rest.leadType || "buyer",
        source: rest.source || "import-csv",

        createdAt: serverTimestamp(),
        createdBy: user.uid,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,

        latestActivity: activityWithAssignment,
      };

      await addDoc(collection(db, "leads"), payload);

      setShowNew(false);
      setNewLeadAssignedAgentId("");
    } catch (err) {
      console.error("Error creating lead:", err);
      alert("Error creating lead. Check console for details.");
    } finally {
      setSaving(false);
    }
  }

  // ---------- Assign one lead ----------

  function handleOpenAssign(lead) {
    setAssigningLead(lead);
  }

  function handleCloseAssign() {
    setAssigningLead(null);
    setAssigning(false);
  }

  async function handleAssignSave(agentId) {
    if (!assigningLead) return;

      const agent =
    Array.isArray(assignableAgents) &&
    assignableAgents.find((a) => a.id === agentId);
    if (!agent) {
      alert("Agent not found.");
      return;
    }

    try {
      setAssigning(true);
      const ref = doc(db, "leads", assigningLead.id);

      const oldName =
        assigningLead.assignedAgentName ||
        assigningLead.assignedAgentEmail ||
        "Unassigned";
      const newName = agent.fullName || agent.email;

      let text;
      if (!assigningLead.assignedAgentId) {
        text = `Admin assigned lead to ${newName}.`;
      } else if (assigningLead.assignedAgentId !== agent.id) {
        text = `Admin reassigned lead from ${oldName} to ${newName}.`;
      } else {
        text = `Admin updated assignment for ${newName}.`;
      }

let assignedAgentId = null;
let assignedAgentName = null;
let assignedAgentEmail = null;

if (agent.isPlaceholder) {
  assignedAgentId = null;
  assignedAgentName = agent.name.replace(/\s\*$/, "").trim();
  assignedAgentEmail = agent.email || null;
} else {
  assignedAgentId = agent.id;
  assignedAgentName = agent.fullName || agent.email;
  assignedAgentEmail = agent.email || null;
}

await updateDoc(ref, {
  assignedAgentId: agent.id,
  assignedAgentName: agent.fullName || agent.email,
  assignedAgentEmail: agent.email || null,
  assignedAgentNameNorm: normName(agent.fullName || agent.email),
  assignedAgentEmailNorm: normEmail(agent.email),
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
    type: "assignment",
  }),
});


      handleCloseAssign();
    } catch (err) {
      console.error("Error assigning agent:", err);
      alert("Error assigning agent. Check console for details.");
      setAssigning(false);
    }
  }

  // ---------- Agent link / email helpers ----------

  function getAgentUrl(lead) {
    return `${window.location.origin}/agent/${lead.id}`;
  }

  async function handleCopyAgentLink(lead) {
    const url = getAgentUrl(lead);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      alert(`Agent link copied:\n\n${url}`);
    } catch (err) {
      console.error("Clipboard error:", err);
      alert(`Could not auto-copy. Here is the link:\n\n${url}`);
    }
  }

  function handleEmailAgent(lead) {
    if (!lead.assignedAgentEmail) {
      alert("No agent email on this lead.");
      return;
    }
    setEmailLead(lead);
  }

  async function handleDeleteLead(lead) {
    const confirmMsg = `Are you sure you want to delete this lead?\n\n${lead.firstName} ${
      lead.lastName
    } (${lead.email || "no email"})`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteDoc(doc(db, "leads", lead.id));
    } catch (err) {
      console.error("Error deleting lead:", err);
      alert("Error deleting lead. Check console for details.");
    }
  }

  // ---------- Filters & search ----------

  const normalizedSearch = search.trim().toLowerCase();

  const filteredLeads = leads.filter((lead) => {
    if (statusFilter && lead.status !== statusFilter) {
      return false;
    }
    if (sourceFilter && lead.source !== sourceFilter) {
      return false;
    }
    if (
      relationshipFilter &&
      lead.relationshipRanking !== relationshipFilter
    ) {
      return false;
    }
    if (urgencyFilter && lead.urgencyRanking !== urgencyFilter) {
      return false;
    }

    // Quick filters for nextEvaluationDate ("Due date")
    if (dateQuickFilter !== "all") {
      let nextEvalMs = null;
      const d = lead.nextEvaluationDate;

      if (d) {
        if (d.toMillis) {
          nextEvalMs = d.toMillis();
        } else {
          const t = new Date(d).getTime();
          if (!Number.isNaN(t)) {
            nextEvalMs = t;
          }
        }
      }

      if (nextEvalMs == null) {
        return false;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayMs = today.getTime();

      const end = new Date(today);
      end.setDate(end.getDate() + 7);
      end.setHours(23, 59, 59, 999);
      const endMs = end.getTime();

      if (dateQuickFilter === "overdue") {
        if (!(nextEvalMs < todayMs)) return false;
      }

      if (dateQuickFilter === "thisWeek") {
        if (!(nextEvalMs >= todayMs && nextEvalMs <= endMs)) return false;
      }
    }

    if (!normalizedSearch) return true;

    const haystack = [
      lead.firstName,
      lead.lastName,
      lead.email,
      lead.phone,
      STATUS_LABELS[lead.status] || lead.status,
      LEAD_TYPE_LABELS[lead.leadType] || lead.leadType,
      SOURCE_LABELS[lead.source] || lead.source,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });

  const sortedLeads = React.useMemo(() => {
    const data = [...filteredLeads];
    if (!sortConfig.field) return data;

    return data.sort((a, b) => {
      const aVal = getSortValue(a, sortConfig.field);
      const bVal = getSortValue(b, sortConfig.field);

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal);
      const bStr = String(bVal);

      if (aStr < bStr) return sortConfig.direction === "asc" ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredLeads, sortConfig]);

    const dashboardStats = React.useMemo(() => {
    const all = Array.isArray(leads) ? leads : [];

    const total = all.length;
    const unassigned = all.filter((l) => !l.assignedAgentName && !l.assignedAgentId).length;

    const hot = all.filter(
      (l) => l.relationshipRanking === "78" || l.relationshipRanking === "100"
    ).length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const end7 = new Date(today);
    end7.setDate(end7.getDate() + 7);
    end7.setHours(23, 59, 59, 999);
    const end7Ms = end7.getTime();

    let overdue = 0;
    let dueNext7 = 0;

    for (const l of all) {
      const ms = toMillis(l.nextEvaluationDate);
      if (ms == null) continue;
      if (ms < todayMs) overdue += 1;
      if (ms >= todayMs && ms <= end7Ms) dueNext7 += 1;
    }

    return { total, unassigned, hot, overdue, dueNext7 };
  }, [leads]);

  // ---------- Agent stats ----------

 const agentStats = React.useMemo(() => {
  // NOTE: don't early-return just because leads is empty;
  // we still want to see registered/unregistered agents with 0 leads.
  if (!Array.isArray(assignableAgents)) {
    return [];
  }

  const registeredCounts = {};
  const unregisteredCounts = {};

  // 1) Scan all leads and count by registered ID and by unregistered name
  (Array.isArray(leads) ? leads : []).forEach((lead) => {
    // Registered: counted by assignedAgentId
    if (lead.assignedAgentId) {
      const id = lead.assignedAgentId;
      if (!registeredCounts[id]) {
        registeredCounts[id] = { total: 0, hot: 0 };
      }
      registeredCounts[id].total += 1;

      if (
        lead.relationshipRanking === "78" ||
        lead.relationshipRanking === "100"
      ) {
        registeredCounts[id].hot += 1;
      }
    }
    // Unregistered: counted by plain name
    else if (lead.assignedAgentName) {
      const key = String(lead.assignedAgentName)
        .replace(/\s\*$/, "")
        .trim()
        .toLowerCase();
      if (!key) return;

      if (!unregisteredCounts[key]) {
        unregisteredCounts[key] = { total: 0, hot: 0 };
      }
      unregisteredCounts[key].total += 1;

      if (
        lead.relationshipRanking === "78" ||
        lead.relationshipRanking === "100"
      ) {
        unregisteredCounts[key].hot += 1;
      }
    }
  });

  const statsByKey = new Map();

  // Helper: find an email for an unregistered agent by name from leads
  function findEmailForName(normalizedName) {
    const lowerName = (normalizedName || "").toLowerCase();
    const match = (Array.isArray(leads) ? leads : []).find((lead) => {
      const ln = String(lead.assignedAgentName || "")
        .replace(/\s\*$/, "")
        .trim()
        .toLowerCase();
      return ln === lowerName && !!lead.assignedAgentEmail;
    });
    return match ? match.assignedAgentEmail : "";
  }

  // 2) Registered agents from assignableAgents (users collection)
  assignableAgents
    .filter((a) => !a.isPlaceholder) // real registered users
    .forEach((a) => {
      const st = registeredCounts[a.id] || { total: 0, hot: 0 };
      const row = {
        id: a.id,
        name: a.name || a.fullName || a.email || "Unknown",
        email: a.email || "",
        total: st.total,
        hot: st.hot,
        isPlaceholder: false,
      };
      statsByKey.set(`reg:${a.id}`, row);
    });

  // 3) Any *placeholders* from unregisteredAgents that match our counts
  assignableAgents
    .filter((a) => a.isPlaceholder)
    .forEach((a) => {
      const key = (a.name || "")
        .replace(/\s\*$/, "")
        .trim()
        .toLowerCase();

      const st = unregisteredCounts[key] || { total: 0, hot: 0 };

      // email priority:
      //   1) email stored on unregisteredAgents doc
      //   2) first lead that has this assignedAgentName + assignedAgentEmail
      const derivedEmail = findEmailForName(key);
      const email = a.email || derivedEmail || "";

      const row = {
        id: a.id,
        name: a.name, // already includes *
        email,
        total: st.total,
        hot: st.hot,
        isPlaceholder: true,
      };

      statsByKey.set(`unreg:${key}`, row);
    });

  // 4) Extra unregistered names that only exist on leads (no doc in unregisteredAgents)
  Object.entries(unregisteredCounts).forEach(([key, st]) => {
    const already = statsByKey.has(`unreg:${key}`);
    if (already) return;

    // Turn "john smith" into "John Smith *"
    const displayName =
      key
        .split(" ")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ")
        .trim() + " *";

    const email = findEmailForName(key);

    statsByKey.set(`unreg:${key}`, {
      id: `unreg:${key}`,
      name: displayName,
      email,
      total: st.total,
      hot: st.hot,
      isPlaceholder: true,
    });
  });

  // 5) Sort by name for nice UI
  return Array.from(statsByKey.values()).sort((a, b) =>
    (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())
  );
}, [assignableAgents, leads]);


  // ---------- Action item save ----------

  function handleActionItemChange(leadId, value) {
    setActionItemDrafts((prev) => ({
      ...prev,
      [leadId]: value,
    }));
  }

  async function handleSaveActionItem(lead) {
    const draft = actionItemDrafts[lead.id] ?? lead.actionItem ?? "";
    const trimmed = draft.trim();

    setSavingActionItemId(lead.id);

    try {
      const ref = doc(db, "leads", lead.id);

      const text = trimmed
        ? `Admin updated action item: "${trimmed}"`
        : "Admin cleared action item.";

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

      setLastSavedActionItemId(lead.id);

      setTimeout(() => {
        setLastSavedActionItemId((current) =>
          current === lead.id ? null : current
        );
      }, 2000);
    } catch (err) {
      console.error("Error saving action item:", err);
      alert("Error saving action item. Check console for details.");
    } finally {
      setSavingActionItemId(null);
    }
  }

  // ---------- Delete user (agent) ----------

  async function handleDeleteUser(agent) {
    if (!agent?.id) {
      alert("Cannot delete: user ID missing.");
      return;
    }

    const msg = `Are you sure you want to delete this user?\n\n${
      agent.fullName || agent.email
    }\n\nThis will delete their Firebase Auth account and their Firestore profile (users/${
      agent.id
    }).\n\nLeads will NOT be deleted.`;

    if (!window.confirm(msg)) return;

    try {
      const result = await deleteUserByUid({ uid: agent.id });

      if (result?.data?.success) {
        alert(`User deleted:\n${agent.fullName || agent.email}`);
      } else {
        alert("Delete function did not confirm success. Check console.");
      }
    } catch (err) {
      console.error("Error deleting user:", err);
      alert("Error deleting user (see console).");
    }
  }

  // ---------- Export CSV ----------

  function formatDateForCsv(value) {
    if (!value) return "";
    if (value.toDate) {
      const d = value.toDate();
      return d.toISOString();
    }
    return String(value);
  }

  function handleExportCsv() {
    const rows = filteredLeads.length ? filteredLeads : leads;

    if (!rows.length) {
      alert("No leads to export.");
      return;
    }

    const headers = [
      "Lead ID",
      "First Name",
      "Last Name",
      "Phone",
      "Email",
      "Contact",
      "Status",
      "Lead Type",
      "Relationship Ranking",
      "Urgency Ranking",
      "Source",
      "Assigned Agent Name",
      "Assigned Agent Email",
      "First Attempt Date",
      "Due Date",
      "Created At",
      "Updated At",
    ];

    const lines = [headers.join(",")];

    rows.forEach((lead) => {
      const row = [
        lead.id || "",
        lead.firstName || "",
        lead.lastName || "",
        lead.phone || "",
        lead.email || "",
        lead.contact || "",
        lead.status || "",
        lead.leadType || "",
        lead.relationshipRanking || "",
        lead.urgencyRanking || "",
        lead.source || "",
        lead.assignedAgentName || "",
        lead.assignedAgentEmail || "",
        formatDateForCsv(lead.firstAttemptDate),
        formatDateForCsv(lead.nextEvaluationDate),
        formatDateForCsv(lead.createdAt),
        formatDateForCsv(lead.updatedAt),
      ];

      const escaped = row.map((value) =>
        `"${String(value).replace(/"/g, '""')}"`
      );
      lines.push(escaped.join(","));
    });

    const csv = lines.join("\r\n");
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `wrc-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- CSV parsing ----------

  function detectDelimiter(rawText) {
    let inQuotes = false;
    let commaCount = 0;
    let semicolonCount = 0;

    for (let i = 0; i < rawText.length; i++) {
      const ch = rawText[i];
      const next = rawText[i + 1];

      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (!inQuotes && (ch === "\n" || ch === "\r")) {
        break;
      }

      if (!inQuotes) {
        if (ch === ",") commaCount++;
        if (ch === ";") semicolonCount++;
      }
    }

    if (semicolonCount > commaCount) return ";";
    return ",";
  }

  function parseCsv(rawText) {
    const delimiter = detectDelimiter(rawText);
    const rows = [];

    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < rawText.length; i++) {
      const ch = rawText[i];
      const next = rawText[i + 1];

      if (ch === '"') {
        if (inQuotes && next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (!inQuotes && ch === delimiter) {
        row.push(field);
        field = "";
        continue;
      }

      if (!inQuotes && (ch === "\n" || ch === "\r")) {
        if (ch === "\r" && next === "\n") {
          i++;
        }
        row.push(field);
        field = "";

        if (row.some((f) => f.trim().length > 0)) {
          rows.push(row);
        }

        row = [];
        continue;
      }

      field += ch;
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      if (row.some((f) => f.trim().length > 0)) {
        rows.push(row);
      }
    }

    return { rows, delimiter };
  }

  async function handleCsvFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();

      const { rows } = parseCsv(text);

      if (!rows || rows.length < 2) {
        alert("CSV looks empty or missing data rows.");
        return;
      }

      const rawHeaders = rows[0].map((h) => h.trim());
      const dataRows = rows.slice(1).map((cols, idx) => ({
        id: String(idx),
        cols: cols.map((c) => c.trim()),
      }));

      setCsvPreview({
        headers: rawHeaders,
        rows: dataRows,
      });

      setCsvSelectedRowIds(dataRows.map((r) => r.id));
      setCsvPreviewOpen(true);
    } catch (err) {
      console.error("Error parsing CSV:", err);
      alert("Error reading CSV. Check console for details.");
    } finally {
      e.target.value = "";
    }
  }

  function toggleCsvRow(id) {
    setCsvSelectedRowIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleCsvSelectAll() {
    if (!csvPreview) return;
    if (csvSelectedRowIds.length === csvPreview.rows.length) {
      setCsvSelectedRowIds([]);
    } else {
      setCsvSelectedRowIds(csvPreview.rows.map((r) => r.id));
    }
  }

  async function handleConfirmCsvImport() {
    if (!csvPreview) return;

    const { headers, rows } = csvPreview;
    const selectedRows = rows.filter((r) => csvSelectedRowIds.includes(r.id));

    if (selectedRows.length === 0) {
      alert("No rows selected to import.");
      return;
    }

    setImporting(true);

    try {
      const lowerHeaders = headers.map((h) => String(h).trim().toLowerCase());

      // NAME
      const fullNameIdx = lowerHeaders.findIndex((h) =>
        ["full name", "name", "fullname", "contact name"].includes(h)
      );
      const firstNameIdx = lowerHeaders.findIndex((h) =>
        ["first name", "firstname", "first"].includes(h)
      );
      const lastNameIdx = lowerHeaders.findIndex((h) =>
        ["last name", "lastname", "last"].includes(h)
      );

      // PHONE
      const phoneIdx = lowerHeaders.findIndex((h) =>
        [
          "phone",
          "phone number",
          "primary phone",
          "mobile",
          "cell",
          "cell phone",
          "home phone",
          "work phone",
          "phone (mobile)",          // Zillow
        ].includes(h)
      );

      // EMAIL
      const emailIdx = lowerHeaders.findIndex((h) =>
        [
          "email",
          "e-mail",
          "email address",
          "e-mail address",
          "email (personal)",        // Zillow
        ].includes(h)
      );

      // SOURCE
      const sourceIdx = lowerHeaders.findIndex((h) =>
        ["source", "lead source"].includes(h)
      );

      // REGISTERED / CREATE DATE
      const registeredIdx = lowerHeaders.findIndex((h) =>
        [
          "registered",
          "registration date",
          "reg date",
          "registered date",
          "create date",             // Zillow
        ].includes(h)
      );

      // NOTES (Zillow "note")
      const agentNotesIdx = lowerHeaders.findIndex((h) =>
        [
          "agent notes",
          "agent note",
          "note",                    // Zillow
          "notes",
          "comments",
          "contact history",
          "lead notes",
        ].includes(h)
      );

      // LEAD TYPE (Zillow "contact type")
      const leadTypeIdx = lowerHeaders.findIndex((h) =>
        [
          "type",
          "lead type",
          "deal type",
          "dealtype",
          "transaction type",
          "contact type",            // Zillow
        ].includes(h)
      );

      // EXTRA ZILLOW FIELDS TO PUSH INTO JOURNAL
      const contactTypeIdx = lowerHeaders.findIndex((h) =>
        ["contact type"].includes(h)
      );
      const statusIdx = lowerHeaders.findIndex((h) =>
        ["status", "lead status"].includes(h)
      );
      const teamMemberIdx = lowerHeaders.findIndex((h) =>
        ["team member assignment", "assigned to", "team member"].includes(h)
      );
      const connectionStatusIdx = lowerHeaders.findIndex((h) =>
        ["connection status"].includes(h)
      );
      const timeframeIdx = lowerHeaders.findIndex((h) =>
        ["timeframe", "time frame"].includes(h)
      );
      const priceIdx = lowerHeaders.findIndex((h) =>
        ["price", "max price", "min price", "price range"].includes(h)
      );
      const zipIdx = lowerHeaders.findIndex((h) =>
        ["zip", "zip code", "zipcode", "postal code"].includes(h)
      );


      const phoneRegex =
        /(\+?1?[\s\-.(]*\d{3}[\s\-.)]*\d{3}[\s\-.,]*\d{4})/;

      function extractPhoneFromText(text) {
        if (!text) return "";
        const s = String(text);

        const match = s.match(phoneRegex);
        if (match) {
          return match[1].trim();
        }

        const digitsRun = s.match(/\d{7,15}/);
        if (digitsRun) {
          return digitsRun[0];
        }

        return "";
      }

      function extractEmailFromText(text) {
        if (!text) return "";
        const emailMatch = String(text).match(
          /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
        );
        return emailMatch ? emailMatch[0].trim() : "";
      }

      let createdCount = 0;

      for (const row of selectedRows) {
        const cols = row.cols;
        if (!cols || cols.length === 0) continue;

        let firstName = "";
        let lastName = "";
        let phone = "";
        let email = "";
        let source = "import-csv";
        let registeredRaw = "";
        let agentNotes = "";
        let leadType = "buyer";

        // NAME
        if (fullNameIdx >= 0 && cols[fullNameIdx]) {
          const parts = String(cols[fullNameIdx]).split(/\s+/);
          firstName = parts[0] || "";
          lastName = parts.slice(1).join(" ") || "";
        } else {
          if (firstNameIdx >= 0 && cols[firstNameIdx]) {
            firstName = String(cols[firstNameIdx]);
          }
          if (lastNameIdx >= 0 && cols[lastNameIdx]) {
            lastName = String(cols[lastNameIdx]);
          }
        }

        // DIRECT PHONE/EMAIL
        if (phoneIdx >= 0 && cols[phoneIdx]) {
          phone = extractPhoneFromText(cols[phoneIdx]);
        }

        if (emailIdx >= 0 && cols[emailIdx]) {
          const directEmail = extractEmailFromText(cols[emailIdx]);
          if (directEmail) {
            email = directEmail;
          } else if (String(cols[emailIdx]).length < 80) {
            email = String(cols[emailIdx]).trim();
          }
        }

        // SOURCE
        if (sourceIdx >= 0 && cols[sourceIdx]) {
          source = String(cols[sourceIdx]) || "import-csv";
        }

        // REGISTERED DATE
        if (registeredIdx >= 0 && cols[registeredIdx]) {
          registeredRaw = String(cols[registeredIdx]);
        }

        // LEAD TYPE / DEAL TYPE
        if (leadTypeIdx >= 0 && cols[leadTypeIdx]) {
          const rawType = String(cols[leadTypeIdx]).toLowerCase();

          const hasBuyer = rawType.includes("buyer");
          const hasSeller = rawType.includes("seller");
          const hasRenter = rawType.includes("renter");

          if (hasBuyer && hasSeller) {
            leadType = "buyer-seller";
          } else if (hasBuyer && hasRenter) {
            leadType = "buyer-renter";
          } else if (hasSeller) {
            leadType = "seller";
          } else if (hasBuyer) {
            leadType = "buyer";
          } else if (hasRenter) {
            leadType = "renter";
          } else {
            leadType = "buyer";
          }
        }

        // AGENT NOTES
        // AGENT NOTES / ZILLOW NOTE
        if (agentNotesIdx >= 0 && cols[agentNotesIdx]) {
          agentNotes = String(cols[agentNotesIdx]);
        }

        if (!phone && agentNotes) {
          phone = extractPhoneFromText(agentNotes);
        }

        if (!email && agentNotes) {
          email = extractEmailFromText(agentNotes);
        }

        // Fallback scan all cols for email/phone if still missing
        if (!email) {
          for (const c of cols) {
            const e = extractEmailFromText(c);
            if (e) {
              email = e;
              break;
            }
          }
        }

        if (!phone) {
          for (const c of cols) {
            const p = extractPhoneFromText(c);
            if (p) {
              phone = p;
              break;
            }
          }
        }

        // Skip row if no usable contact
        if (!firstName && !lastName && !email && !phone) {
          console.log("[CSV Import] Skipping row (no usable contact):", cols);
          continue;
        }

        // CONTACT field in your app (phone + email)
        const contactParts = [];
        if (phone) contactParts.push(phone);
        if (email) contactParts.push(email);
        const contact = contactParts.join(" • ");

        // --- Build extra Zillow info for the journal ---
                // --- Build extra Zillow info for the journal ---
        const extraJournalLines = [];

        // We'll also map this to assignedAgentName
        let importedAssignedAgentName = null;

        if (contactTypeIdx >= 0 && cols[contactTypeIdx]) {
          extraJournalLines.push(`Contact type: ${cols[contactTypeIdx]}`);
        }
        if (statusIdx >= 0 && cols[statusIdx]) {
          extraJournalLines.push(`Zillow status: ${cols[statusIdx]}`);
        }
        if (connectionStatusIdx >= 0 && cols[connectionStatusIdx]) {
          extraJournalLines.push(
            `Connection status: ${cols[connectionStatusIdx]}`
          );
        }
        if (timeframeIdx >= 0 && cols[timeframeIdx]) {
          extraJournalLines.push(`Timeframe: ${cols[timeframeIdx]}`);
        }
        if (priceIdx >= 0 && cols[priceIdx]) {
          extraJournalLines.push(`Price: ${cols[priceIdx]}`);
        }
        if (zipIdx >= 0 && cols[zipIdx]) {
          extraJournalLines.push(`ZIP: ${cols[zipIdx]}`);
        }
        if (teamMemberIdx >= 0 && cols[teamMemberIdx]) {
          const tm = String(cols[teamMemberIdx]).trim();
          if (tm) {
            importedAssignedAgentName = tm; // 👈 this is what will show as Assigned agent
            extraJournalLines.push(`Original team member assignment: ${tm}`);
          }
        }
let matchedAssignedAgentId = null;
let matchedAssignedAgentEmail = null;
let matchedAssignedAgentName = null;

const importedName = normName(importedAssignedAgentName);

// assignableAgents should include BOTH registered + unregistered placeholders
if (importedName && Array.isArray(assignableAgents)) {
  const match = assignableAgents.find((a) => {
    const aName = normName((a.name || a.fullName || "").replace(/\s\*$/, ""));
    return aName && aName === importedName;
  });

  if (match) {
    if (match.isPlaceholder) {
      // unregistered agent placeholder
      matchedAssignedAgentId = null;
      matchedAssignedAgentEmail = match.email || null;
      matchedAssignedAgentName = (match.name || "").replace(/\s\*$/, "").trim() || importedAssignedAgentName;
    } else {
      // registered user
      matchedAssignedAgentId = match.id;
      matchedAssignedAgentEmail = match.email || null;
      matchedAssignedAgentName = match.name || match.fullName || match.email || importedAssignedAgentName;
    }
  } else {
    // OPTIONAL: auto-create unregistered agent doc so it shows up next time
    // (You can skip this block if you only want creation via AdminLeadPage)
    const slug = importedName.replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, "-");
    await setDoc(doc(db, "unregisteredAgents", slug), { name: importedAssignedAgentName, email: "", createdAt: serverTimestamp() }, { merge: true });
    matchedAssignedAgentId = null;
    matchedAssignedAgentEmail = null;
    matchedAssignedAgentName = importedAssignedAgentName;
  }
}

        // --- Final journal text (notes + Zillow extras) ---
        const journalLines = ["Imported from CSV (selected row)."];

        if (agentNotes) {
          journalLines.push("");
          journalLines.push("Notes from CSV:");
          journalLines.push(agentNotes);
        }

        if (extraJournalLines.length > 0) {
          journalLines.push("");
          journalLines.push("Additional import details:");
          for (const line of extraJournalLines) {
            journalLines.push(line);
          }
        }

        const journalText = journalLines.join("\n");

        const payload = {
          firstName,
          lastName,
          phone,
          email,
          contact,
          status: "engagement-phase",        // you can map Zillow status later if you like
          leadType,
          relationshipRanking: "0",
          urgencyRanking: "not-sure",
          source: source || "import-csv",
          firstAttemptDate: null,
          nextEvaluationDate: null,

          registeredDateRaw: registeredRaw || null,

          journalLastEntry: journalText,
          journal: [
            {
              id: crypto.randomUUID(),
              createdAt: new Date(),
              createdBy: user.uid,
              createdByEmail: user.email,
              text: journalText,
              type: "import",
            },
          ],

          
          // Assignment from Zillow:
          // - name only (no id/email yet)
         assignedAgentId: matchedAssignedAgentId,
assignedAgentName: matchedAssignedAgentName || null,
assignedAgentEmail: matchedAssignedAgentEmail || null,


          createdAt: serverTimestamp(),
          createdBy: user.uid,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          latestActivity: "Lead imported from CSV (selected row).",
        };



        await addDoc(collection(db, "leads"), payload);
        createdCount++;
      }

      alert(`Import complete. Created ${createdCount} lead(s).`);

      setCsvPreview(null);
      setCsvSelectedRowIds([]);
      setCsvPreviewOpen(false);
    } catch (err) {
      console.error("Error importing selected CSV rows:", err);
      alert("Error importing selected CSV rows. Check console for details.");
    } finally {
      setImporting(false);
    }
  }

  // ---------- Render ----------

  return (
    <div className="space-y-4 text-sm w-full px-2 sm:px-4 lg:px-6">
      {/* Header */}
{/* Page shell */}
<div className="max-w-[1600px] mx-auto space-y-6">
  {/* Header / toolbar */}
  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">
          Admin Lead Dashboard
        </h1>
        <p className="text-xs text-gray-600">
          Signed in as <span className="font-medium">{user?.email}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
          className="border border-gray-300 text-xs px-3 py-2 rounded-full text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {importing ? "Importing..." : "Import CSV"}
        </button>

        <button
          type="button"
          onClick={handleExportCsv}
          className="border border-gray-300 text-xs px-3 py-2 rounded-full text-gray-700 hover:bg-gray-50"
        >
          Export CSV
        </button>

        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className="border border-gray-300 text-xs px-3 py-2 rounded-full text-gray-700 hover:bg-gray-50"
        >
          Filters
        </button>

        <button
          onClick={() => setShowNew(true)}
          className="bg-wrcBlack text-wrcYellow text-xs font-semibold px-4 py-2 rounded-full hover:bg-black"
        >
          + New lead
        </button>
      </div>
    </div>

    {/* Search + density */}
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="w-full sm:max-w-md">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, phone, status, source..."
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDense((d) => !d)}
          className="text-[11px] px-3 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50"
        >
          Row density: <span className="font-medium">{dense ? "Compact" : "Comfortable"}</span>
        </button>
      </div>
    </div>

    {/* Filters panel */}
    {filtersOpen && (
      <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <div className="flex items-center gap-1 mr-2">
            <button
              type="button"
              onClick={() => setDateQuickFilter("all")}
              className={cx(
                "px-3 py-1 rounded-full border text-[11px]",
                dateQuickFilter === "all"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "border-gray-300 text-gray-700 hover:bg-white"
              )}
            >
              All
            </button>

            <button
              type="button"
              onClick={() => setDateQuickFilter("overdue")}
              className={cx(
                "px-3 py-1 rounded-full border text-[11px]",
                dateQuickFilter === "overdue"
                  ? "bg-rose-600 text-white border-rose-600"
                  : "border-gray-300 text-gray-700 hover:bg-white"
              )}
            >
              Overdue
            </button>

            <button
              type="button"
              onClick={() => setDateQuickFilter("thisWeek")}
              className={cx(
                "px-3 py-1 rounded-full border text-[11px]",
                dateQuickFilter === "thisWeek"
                  ? "bg-amber-500 text-white border-amber-500"
                  : "border-gray-300 text-gray-700 hover:bg-white"
              )}
            >
              Next 7 days
            </button>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-xl px-2 py-2 bg-white"
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="border border-gray-300 rounded-xl px-2 py-2 bg-white"
          >
            <option value="">All sources</option>
            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={relationshipFilter}
            onChange={(e) => setRelationshipFilter(e.target.value)}
            className="border border-gray-300 rounded-xl px-2 py-2 bg-white"
          >
            <option value="">All relationship ranks</option>
            {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
            className="border border-gray-300 rounded-xl px-2 py-2 bg-white"
          >
            <option value="">All urgency levels</option>
            {Object.entries(URGENCY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setStatusFilter("");
              setSourceFilter("");
              setRelationshipFilter("");
              setUrgencyFilter("");
              setDateQuickFilter("all");
              setSearch("");
            }}
            className="ml-auto px-3 py-2 rounded-xl border border-gray-300 text-[11px] text-gray-700 hover:bg-white"
          >
            Clear all
          </button>
        </div>

        {/* Active chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          {dateQuickFilter !== "all" && (
            <Chip onRemove={() => setDateQuickFilter("all")}>
              Due: {dateQuickFilter === "overdue" ? "Overdue" : "Next 7 days"}
            </Chip>
          )}
          {statusFilter && (
            <Chip onRemove={() => setStatusFilter("")}>
              Status: {STATUS_LABELS[statusFilter] || statusFilter}
            </Chip>
          )}
          {sourceFilter && (
            <Chip onRemove={() => setSourceFilter("")}>
              Source: {SOURCE_LABELS[sourceFilter] || sourceFilter}
            </Chip>
          )}
          {relationshipFilter && (
            <Chip onRemove={() => setRelationshipFilter("")}>
              Relationship: {RELATIONSHIP_LABELS[relationshipFilter] || relationshipFilter}
            </Chip>
          )}
          {urgencyFilter && (
            <Chip onRemove={() => setUrgencyFilter("")}>
              Urgency: {URGENCY_LABELS[urgencyFilter] || urgencyFilter}
            </Chip>
          )}
          {search.trim() && (
            <Chip onRemove={() => setSearch("")}>Search: “{search.trim()}”</Chip>
          )}
        </div>
      </div>
    )}
  </div>

  {/* Stats row */}
  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
    <StatCard label="Total leads" value={dashboardStats.total} />
    <StatCard label="Unassigned" value={dashboardStats.unassigned} />
    <StatCard label="Overdue" value={dashboardStats.overdue} />
    <StatCard label="Due next 7 days" value={dashboardStats.dueNext7} />
    <StatCard label="Hot leads" value={dashboardStats.hot} sublabel="Relationship 78% or 100%" />
  </div>

  {/* (Keep the rest of your page content below, unchanged) */}

      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleCsvFileChange}
      />

      {/* Notifications banner */}
      {notifications.length > 0 && (
        <div className="mb-4 border border-amber-300 bg-amber-50 rounded-lg p-3 text-xs">
          <div className="flex items-center justify-between mb-1">
            <div className="font-semibold text-amber-900">
              {notifications.length} lead
              {notifications.length > 1 ? "s" : ""} updated by agents
            </div>
            <button
              type="button"
              onClick={handleMarkNotificationsRead}
              className="text-[11px] px-2 py-1 rounded-full border border-amber-300 text-amber-900 hover:bg-amber-100"
            >
              Mark all as read
            </button>
          </div>

          <div className="space-y-1 max-h-40 overflow-y-auto">
            {notifications.map((n) => (
              <div
                key={n.id}
                className="flex items-start justify-between gap-2 border-b border-amber-100 pb-1 last:border-b-0"
              >
                <div>
                  <div className="font-medium text-amber-900">
                    {n.leadName}{" "}
                    <span className="text-[10px] text-amber-700">
                      ({n.leadId})
                    </span>
                  </div>
                  <div className="text-[11px] text-amber-900">
                    {n.latestActivity}
                  </div>
                  <div className="text-[10px] text-amber-700">
                    Updated by: {n.updatedByName}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleNotificationClick(n)}
                  className="text-[10px] px-2 py-1 rounded-full border border-amber-300 text-amber-900 hover:bg-amber-100 flex-shrink-0"
                >
                  View lead
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent summary */}
{agentStats.length > 0 && (
  <div className="border border-gray-200 rounded-lg bg-white p-3 text-xs">
    <div className="flex items-center justify-between mb-2">
      <span className="font-semibold text-gray-700">Agent summary</span>
      <span className="text-[11px] text-gray-500">
        Based on current leads
      </span>
    </div>

    <div className="overflow-auto">
      <table className="min-w-full text-[11px]">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr className="uppercase tracking-wide text-gray-500">
            <th className="px-2 py-1 text-left">Agent</th>
            <th className="px-2 py-1 text-left">Email</th>
            <th className="px-2 py-1 text-right">Total leads</th>
            <th className="px-2 py-1 text-right">Hot leads</th>
            <th className="px-2 py-1 text-right">Delete</th>
          </tr>
        </thead>
        <tbody>
          {agentStats.map((a) => (
            <tr key={a.id} className="border-b border-gray-100">
              <td className="px-2 py-1">
               <button
  type="button"
  onClick={() => openAgentLeads(a)}
  className="text-left text-blue-700 hover:underline"
  title="View all leads for this agent"
>
  <span className={a.isPlaceholder ? "italic" : ""}>{a.name}</span>
</button>

                {a.isPlaceholder && (
                  <span className="ml-1 text-[10px] text-gray-500">
                    (unregistered)
                  </span>
                )}
              </td>
              <td className="px-2 py-1 text-blue-700">
                {a.email || (
                  <span className="text-gray-400">
                    {a.isPlaceholder ? "No email on file" : "—"}
                  </span>
                )}
              </td>
              <td className="px-2 py-1 text-right">{a.total}</td>
              <td className="px-2 py-1 text-right">
                {a.hot > 0 ? (
                  <span className="font-semibold text-amber-700">
                    {a.hot}
                  </span>
                ) : (
                  <span className="text-gray-400">0</span>
                )}
              </td>
              <td className="px-2 py-1 text-right">
          {a.isPlaceholder ? (
  <button
    type="button"
    onClick={() => handleDeleteUnregisteredAgent(a)}
    className="px-2 py-1 border border-rose-300 text-rose-700 rounded-full text-[10px] hover:bg-rose-50"
  >
    Delete unregistered
  </button>
) : (
  <button
    type="button"
    onClick={() => handleDeleteUser(a)}
    className="px-2 py-1 border border-red-300 text-red-700 rounded-full text-[10px] hover:bg-red-50"
  >
    Delete user
  </button>
)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}


      {/* Leads list card */}
      <div className="border border-gray-200 rounded-lg bg-white">
        {/* Top bar */}
        <div className="border-b border-gray-200 px-3 py-2 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-700">
                Leads ({filteredLeads.length}
                {filteredLeads.length !== leads.length &&
                  ` of ${leads.length}`}
                )
              </span>
              {loading && (
                <span className="text-[11px] text-gray-500">Loading...</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDense((d) => !d)}
                className="text-[11px] px-2 py-1 border border-gray-300 rounded-full text-gray-700 hover:bg-gray-50"
              >
                Row density:{" "}
                <span className="font-medium">
                  {dense ? "Compact" : "Comfortable"}
                </span>
              </button>

              <div className="w-full max-w-xs">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, email, phone, status, source..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-[11px]"
                />
              </div>
            </div>
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <div className="flex items-center gap-1 mr-2">
              <button
                type="button"
                onClick={() => setDateQuickFilter("all")}
                className={`px-2 py-1 rounded-full border text-[11px] ${
                  dateQuickFilter === "all"
                    ? "bg-gray-900 text-white border-gray-900"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                All
              </button>

              <button
                type="button"
                onClick={() => setDateQuickFilter("overdue")}
                className={`px-2 py-1 rounded-full border text-[11px] ${
                  dateQuickFilter === "overdue"
                    ? "bg-rose-600 text-white border-rose-600"
                    : "border-gray-300 text-gray-700 hover:bg-rose-50"
                }`}
              >
                Overdue
              </button>

              <button
                type="button"
                onClick={() => setDateQuickFilter("thisWeek")}
                className={`px-2 py-1 rounded-full border text-[11px] ${
                  dateQuickFilter === "thisWeek"
                    ? "bg-amber-500 text-white border-amber-500"
                    : "border-gray-300 text-gray-700 hover:bg-amber-50"
                }`}
              >
                Next 7 days
              </button>
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1"
            >
              <option value="">All statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1"
            >
              <option value="">All sources</option>
              {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={relationshipFilter}
              onChange={(e) => setRelationshipFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1"
            >
              <option value="">All relationship ranks</option>
              {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1"
            >
              <option value="">All urgency levels</option>
              {Object.entries(URGENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Bulk bar */}
        {selectedLeadIds.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-200 bg-amber-50 flex flex-wrap items-center gap-3 text-[11px]">
            <span className="font-semibold text-amber-900">
              {selectedLeadIds.length} lead(s) selected
            </span>

            {Array.isArray(assignableAgents) && assignableAgents.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={bulkAssignAgentId}
                  onChange={(e) => setBulkAssignAgentId(e.target.value)}
                  className="border border-amber-300 rounded px-2 py-1"
                >
                  <option value="">Assign to agent...</option>
                  {assignableAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.fullName || a.email || "Unnamed user") +
                        (a.email ? ` (${a.email})` : "")}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleBulkAssign}
                  disabled={!bulkAssignAgentId || bulkWorking}
                  className="px-3 py-1.5 rounded-full border border-amber-400 bg-amber-100 text-amber-900 font-medium disabled:opacity-60"
                >
                  {bulkWorking ? "Assigning..." : "Bulk assign"}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkWorking}
              className="px-3 py-1.5 rounded-full border border-red-300 bg-red-50 text-red-700 font-medium disabled:opacity-60"
            >
              {bulkWorking ? "Working..." : "Delete selected"}
            </button>
          </div>
        )}

        {/* Leads table */}
        {/* Leads table */}
<VirtualAdminLeadGrid
  leads={sortedLeads}
  loading={loading}
  allLeadsCount={leads.length}
  filteredCount={filteredLeads.length}
  dense={dense}
  selectedLeadIds={selectedLeadIds}
  onToggleSelectAll={toggleSelectAll}
  onToggleSelectOne={toggleSelectOne}
  isAllSelected={sortedLeads.length > 0 && selectedLeadIds.length === sortedLeads.length}
  SortHeader={SortHeader}
  headerPad={headerPad}
  cellPad={cellPad}
  formatDate={formatDate}
  assignableAgents={assignableAgents}
  handleOpenAssign={handleOpenAssign}
  handleCopyAgentLink={handleCopyAgentLink}
  handleEmailAgent={handleEmailAgent}
  actionItemDrafts={actionItemDrafts}
  handleActionItemChange={handleActionItemChange}
  handleSaveActionItem={handleSaveActionItem}
  savingActionItemId={savingActionItemId}
  lastSavedActionItemId={lastSavedActionItemId}
  handleDeleteLead={handleDeleteLead}
  formatDateTimeFromMillis={formatDateTimeFromMillis}
  Link={Link}
  LeadBadge={LeadBadge}
  labels={{ STATUS_LABELS, LEAD_TYPE_LABELS, RELATIONSHIP_LABELS, URGENCY_LABELS, SOURCE_LABELS }}
/>


      </div>

      {/* New Lead Modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-2xl w-full mx-4 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">
                New lead
              </h2>
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                ✕ Close
              </button>
            </div>

            <div className="mb-4 border border-gray-200 rounded-lg p-3 bg-gray-50">
              <h3 className="text-xs font-semibold text-gray-700 mb-2">
                Assign agent (optional)
              </h3>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <select
                  value={newLeadAssignedAgentId}
                  onChange={(e) => setNewLeadAssignedAgentId(e.target.value)}
                  className="w-full sm:w-1/2 border border-gray-300 rounded px-2 py-1.5 text-[11px]"
                >
                  <option value="">-- Leave unassigned --</option>
                  {Array.isArray(assignableAgents) &&
                   assignableAgents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {(a.fullName || a.email || "Unnamed user") +
                          (a.email ? ` (${a.email})` : "")}
                      </option>
                    ))}
                </select>

                <div className="text-[11px] text-gray-600">
                  {newLeadAssignedAgentId
                    ? (() => {
                        const a =
                          Array.isArray(assignableAgents) &&
                          assignableAgents.find(
                            (ag) => ag.id === newLeadAssignedAgentId
                          );
                        if (!a) return null;
                        return (
                          <>
                            <div className="font-medium">
                              {a.fullName || a.email || "Unnamed user"}
                            </div>
                            {a.email && (
                              <div className="text-blue-700">
                                {a.email}
                              </div>
                            )}
                          </>
                        );
                      })()
                    : "No agent selected yet."}
                </div>
              </div>
            </div>

            <LeadFormAdmin onSave={handleCreateLead} saving={saving} />
          </div>
        </div>
      )}

      {/* Assign Agent Modal */}
      {assigningLead && (
    <AssignAgentModal
  lead={assigningLead}
  agents={assignableAgents || []}
  assigning={assigning}
  onClose={handleCloseAssign}
  onAssign={handleAssignSave}
/>

      )}
{agentLeadsOpen && agentLeadsTarget && (
  <AgentLeadsModal
    target={agentLeadsTarget}
    leads={leads}
    onClose={() => {
      setAgentLeadsOpen(false);
      setAgentLeadsTarget(null);
    }}
    onOpenLead={(id) => navigate(`/admin/lead/${id}`)}
  />
)}

      {/* Email Agent Modal */}
      {emailLead && (
        <EmailAgentModal lead={emailLead} onClose={() => setEmailLead(null)} />
      )}

      {/* CSV Preview Modal */}
      {csvPreviewOpen &&
        csvPreview &&
        (() => {
          const { headers, rows } = csvPreview;
          const lowerHeaders = headers.map((h) => h.toLowerCase());

          const findIdx = (candidates) =>
            lowerHeaders.findIndex((h) => candidates.includes(h));

          // NAME
          const fullNameIdx = findIdx([
            "full name",
            "name",
            "fullname",
            "contact name",
          ]);
          const firstNameIdx = findIdx([
            "first name",
            "firstname",
            "first",
          ]);
          const lastNameIdx = findIdx(["last name", "lastname", "last"]);

          // PHONE (includes Zillow "phone (mobile)")
          const phoneIdx = findIdx([
            "phone",
            "phone number",
            "primary phone",
            "mobile",
            "cell",
            "cell phone",
            "home phone",
            "work phone",
            "phone (mobile)", // Zillow
          ]);

          // EMAIL (includes Zillow "email (personal)")
          const emailIdx = findIdx([
            "email",
            "e-mail",
            "email address",
            "e-mail address",
            "email (personal)", // Zillow
          ]);

          // SOURCE
          const sourceIdx = findIdx([
            "source",
            "lead source",
            "source name",
          ]);

          // REGISTERED / CREATE DATE (Zillow "create date")
          const registrationIdx = findIdx([
            "registration date",
            "registered",
            "date registered",
            "reg date",
            "create date", // Zillow
          ]);

          // NOTES (include Zillow "note")
          const notesIdx = findIdx([
            "agent notes",
            "agent note",
            "note", // Zillow
            "notes",
            "comments",
          ]);


          function getName(cols) {
            let firstName = "";
            let lastName = "";

            if (fullNameIdx >= 0 && cols[fullNameIdx]) {
              const parts = cols[fullNameIdx].split(" ");
              firstName = parts[0] || "";
              lastName = parts.slice(1).join(" ") || "";
            } else {
              if (firstNameIdx >= 0 && cols[firstNameIdx]) {
                firstName = cols[firstNameIdx];
              }
              if (lastNameIdx >= 0 && cols[lastNameIdx]) {
                lastName = cols[lastNameIdx];
              }
            }

            const full = `${firstName} ${lastName}`.trim();
            if (full) return full;

            return cols.find((c) => c && c.trim()) || "";
          }

          function getEmail(cols) {
            if (emailIdx >= 0 && cols[emailIdx]) return cols[emailIdx];
            const candidate = cols.find((c) => c && c.includes("@"));
            return candidate || "";
          }

          function getPhone(cols) {
            if (phoneIdx >= 0 && cols[phoneIdx]) return cols[phoneIdx];
            const candidate = cols.find(
              (c) => c && /\d/.test(c) && c.replace(/\D/g, "").length >= 7
            );
            return candidate || "";
          }

          function getSource(cols) {
            if (sourceIdx >= 0 && cols[sourceIdx]) return cols[sourceIdx];
            return "import-csv";
          }

          function getRegistration(cols) {
            if (registrationIdx >= 0 && cols[registrationIdx]) {
              const raw = cols[registrationIdx].trim();
              if (!raw) return "";

              const d = new Date(raw);
              if (!Number.isNaN(d.getTime())) {
                return d.toISOString().split("T")[0];
              }
              return raw;
            }
            return "";
          }

          function getNotes(cols) {
            if (notesIdx >= 0 && cols[notesIdx]) return cols[notesIdx];
            return "";
          }

          let rowsToRender = rows;

          if (csvSort.field === "registered") {
            rowsToRender = [...rows].sort((a, b) => {
              const aReg = getRegistration(a.cols) || "";
              const bReg = getRegistration(b.cols) || "";

              const aTime = Date.parse(aReg);
              const bTime = Date.parse(bReg);

              if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) {
                return csvSort.direction === "asc"
                  ? aTime - bTime
                  : bTime - aTime;
              }

              if (aReg < bReg)
                return csvSort.direction === "asc" ? -1 : 1;
              if (aReg > bReg)
                return csvSort.direction === "asc" ? 1 : -1;
              return 0;
            });
          }

          return (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-4xl w-full mx-4 p-4 text-xs">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-900">
                    CSV preview – select rows to import
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setCsvPreviewOpen(false);
                      setCsvPreview(null);
                      setCsvSelectedRowIds([]);
                      setCsvSort({ field: null, direction: "asc" });
                    }}
                    className="text-[11px] text-gray-500 hover:text-gray-800"
                  >
                    ✕ Close
                  </button>
                </div>

                <div className="mb-2 text-[11px] text-gray-600">
                  Showing only the columns that will be imported:
                  <span className="font-semibold">
                    {" "}
                    Name, Email, Phone, Source, Registered, Agent notes
                  </span>
                  .
                </div>

                <div className="border border-gray-200 rounded-lg max-h-80 overflow-x-auto overflow-y-auto">
  <table className="min-w-[900px] text-[11px]">

                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr className="text-gray-600">
                        <th className="px-2 py-1 text-left">
                          <input
                            type="checkbox"
                            checked={
                              rows.length > 0 &&
                              csvSelectedRowIds.length === rows.length
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setCsvSelectedRowIds(rows.map((r) => r.id));
                              } else {
                                setCsvSelectedRowIds([]);
                              }
                            }}
                          />
                        </th>
                        <th className="px-2 py-1 text-left">Name</th>
                        <th className="px-2 py-1 text-left">Email</th>
                        <th className="px-2 py-1 text-left">Phone</th>
                        <th className="px-2 py-1 text-left">Source</th>
                        <th
                          className={`px-2 py-1 text-left cursor-pointer select-none`}
                          onClick={() =>
                            setCsvSort((prev) => ({
                              field: "registered",
                              direction:
                                prev.field === "registered" &&
                                prev.direction === "asc"
                                  ? "desc"
                                  : "asc",
                            }))
                          }
                        >
                          Registered
                          {csvSort.field === "registered" && (
                            <span className="ml-1 text-[10px]">
                              {csvSort.direction === "asc" ? "▲" : "▼"}
                            </span>
                          )}
                        </th>
                        <th className="px-2 py-1 text-left">Agent notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowsToRender.map((row) => {
                        const cols = row.cols;
                        const checked = csvSelectedRowIds.includes(row.id);
                        return (
                          <tr
                            key={row.id}
                            className={`border-b border-gray-100 ${
                              checked ? "bg-amber-50" : ""
                            }`}
                          >
                            <td className="px-2 py-1 align-top">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCsvRow(row.id)}
                              />
                            </td>
                            <td className="px-2 py-1 align-top">
                              {getName(cols)}
                            </td>
                            <td className="px-2 py-1 align-top">
                              {getEmail(cols)}
                            </td>
                            <td className="px-2 py-1 align-top">
                              {getPhone(cols)}
                            </td>
                            <td className="px-2 py-1 align-top">
                              {getSource(cols)}
                            </td>
                            <td className="px-2 py-1 align-top">
                              {getRegistration(cols)}
                            </td>
                            <td className="px-2 py-1 align-top max-w-xs truncate">
                              {getNotes(cols)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="text-[11px] text-gray-600">
                    Selected rows:{" "}
                    <span className="font-semibold">
                      {csvSelectedRowIds.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={importing || csvSelectedRowIds.length === 0}
                    onClick={handleConfirmCsvImport}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-wrcBlack text-wrcYellow disabled:opacity-60"
                  >
                    {importing ? "Importing..." : "Import selected rows"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
function VirtualAdminLeadGrid({
  leads,
  loading,
  dense,
  selectedLeadIds,
  onToggleSelectAll,
  onToggleSelectOne,
  isAllSelected,
  SortHeader,
  headerPad,
  cellPad,
  formatDate,
  assignableAgents,
  handleOpenAssign,
  handleCopyAgentLink,
  handleEmailAgent,
  actionItemDrafts,
  handleActionItemChange,
  handleSaveActionItem,
  savingActionItemId,
  lastSavedActionItemId,
  handleDeleteLead,
  formatDateTimeFromMillis,
  Link,
  LeadBadge,
  labels,
}) {
  const parentRef = React.useRef(null);

  const rowVirtualizer = useVirtualizer({
    count: leads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (dense ? 56 : 74), // tweak if needed
    overscan: 12,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  // Sticky column widths (match your old sticky layout)
  const CHECK_W = 44;     // checkbox col
  const NAME_W = 300;     // name col
  const CONTACT_W = 240;  // contact col

  // Other columns
  const STATUS_W = 140;
  const TYPE_W = 110;
  const REL_W = 150;
  const URG_W = 140;
  const SOURCE_W = 160;
  const REG_W = 140;
  const DUE_W = 140;
  const AGENT_W = 220;
  const ACTION_W = 320;
  const ACTIVITY_W = 360;
  const DELETE_W = 110;

  const gridTemplateColumns = `${CHECK_W}px ${NAME_W}px ${CONTACT_W}px ${STATUS_W}px ${TYPE_W}px ${REL_W}px ${URG_W}px ${SOURCE_W}px ${REG_W}px ${DUE_W}px ${AGENT_W}px ${ACTION_W}px ${ACTIVITY_W}px ${DELETE_W}px`;

  const headerCell =
    `px-3 ${headerPad} text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-gray-50`;
  const cell =
    `px-3 ${cellPad} text-[11px] border-b border-gray-100 bg-white`;

  const {
    STATUS_LABELS,
    LEAD_TYPE_LABELS,
    RELATIONSHIP_LABELS,
    URGENCY_LABELS,
    SOURCE_LABELS,
  } = labels;

  return (
    <div className="max-h-[70vh] overflow-auto" ref={parentRef}>
      {/* Header row (sticky) */}
      <div
        className="sticky top-0 z-30"
        style={{ display: "grid", gridTemplateColumns, minWidth: 1600 }}
      >
        <div className={`${headerCell} sticky left-0 z-40`}>
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={onToggleSelectAll}
          />
        </div>

        <div
          className={`${headerCell} sticky z-40`}
          style={{ left: CHECK_W }}
        >
          <SortHeader label="Name" field="name" />
        </div>

        <div
          className={`${headerCell} sticky z-40`}
          style={{ left: CHECK_W + NAME_W }}
        >
          Contact
        </div>

        <div className={headerCell}>
          <SortHeader label="Status" field="status" />
        </div>
        <div className={headerCell}>
          <SortHeader label="Type" field="leadType" />
        </div>
        <div className={headerCell}>
          <SortHeader label="Relationship" field="relationshipRanking" />
        </div>
        <div className={headerCell}>
          <SortHeader label="Urgency" field="urgencyRanking" />
        </div>
        <div className={headerCell}>
          <SortHeader label="Source" field="source" />
        </div>
        <div className={headerCell}>
          <SortHeader label="Reg. date" field="registeredDateRaw" />
        </div>
        <div className={`${headerCell} text-red-700`}>
          <SortHeader label="Due date" field="nextEvaluationDate" />
        </div>
        <div className={headerCell}>
          <SortHeader label="Assigned agent" field="assignedAgent" />
        </div>
        <div className={`${headerCell} min-w-[260px]`}>Action item</div>
        <div className={headerCell}>Latest activity</div>
        <div className={headerCell}>Delete</div>
      </div>

      {/* Virtualized body spacer */}
      <div style={{ height: totalSize, position: "relative", minWidth: 1600 }}>
        {/* Empty states */}
        {!loading && leads.length === 0 && (
          <div className="p-6 text-xs text-gray-500">No leads yet.</div>
        )}

        {virtualItems.map((vi) => {
          const lead = leads[vi.index];

          return (
            <div
              key={lead.id}
              className="hover:bg-gray-50"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                transform: `translateY(${vi.start}px)`,
                width: "100%",
                display: "grid",
                gridTemplateColumns,
              }}
            >
              {/* Checkbox (sticky) */}
              <div className={`${cell} sticky left-0 z-20`}>
                <input
                  type="checkbox"
                  checked={selectedLeadIds.includes(lead.id)}
                  onChange={() => onToggleSelectOne(lead.id)}
                />
              </div>

              {/* Name (sticky) */}
              <div className={`${cell} sticky z-20`} style={{ left: CHECK_W }}>
                <div className="font-medium text-xs text-gray-900 whitespace-nowrap">
                  <Link
                    to={`/admin/lead/${lead.id}`}
                    className="text-blue-700 hover:underline"
                  >
                    {lead.firstName} {lead.lastName}
                  </Link>
                </div>
                <div className="text-[11px] text-gray-500">
                  Created: {formatDate(lead.createdAt)}
                </div>
              </div>

              {/* Contact (sticky) */}
              <div
                className={`${cell} sticky z-20`}
                style={{ left: CHECK_W + NAME_W }}
              >
                {lead.phone && <div>{lead.phone}</div>}
                {lead.email && <div className="text-blue-700">{lead.email}</div>}
              </div>

              {/* Status */}
              <div className={cell}>
                <LeadBadge
                  value={lead.status}
                  label={STATUS_LABELS[lead.status] || lead.status}
                />
              </div>

              {/* Type */}
              <div className={cell}>
                {LEAD_TYPE_LABELS[lead.leadType] || lead.leadType}
              </div>

              {/* Relationship */}
              <div className={cell}>
                <LeadBadge
                  value={lead.relationshipRanking}
                  label={
                    RELATIONSHIP_LABELS[lead.relationshipRanking] ||
                    lead.relationshipRanking
                  }
                />
              </div>

              {/* Urgency */}
              <div className={cell}>
                <LeadBadge
                  value={lead.urgencyRanking}
                  label={URGENCY_LABELS[lead.urgencyRanking] || lead.urgencyRanking}
                />
              </div>

              {/* Source */}
              <div className={cell}>
                {SOURCE_LABELS[lead.source] || lead.source}
              </div>

              {/* Reg date */}
              <div className={cell}>
                {lead.registeredDateRaw ? (
                  <span className="text-gray-800">
                    {formatDate(lead.registeredDateRaw)}
                  </span>
                ) : (
                  <span className="text-gray-400 italic">No Registered Date</span>
                )}
              </div>

              {/* Due date */}
              <div className={cell}>
                {(() => {
                  const label = formatDate(lead.nextEvaluationDate);
                  if (!label) return <span className="text-gray-400 italic">No due date</span>;

                  let isOverdue = false;
                  try {
                    if (lead.nextEvaluationDate?.toMillis) {
                      isOverdue = lead.nextEvaluationDate.toMillis() < Date.now();
                    } else if (typeof lead.nextEvaluationDate === "string") {
                      const t = new Date(lead.nextEvaluationDate).getTime();
                      if (!Number.isNaN(t)) isOverdue = t < Date.now();
                    }
                  } catch {}

                  return (
                    <span className={isOverdue ? "text-red-700 font-semibold" : "text-gray-800"}>
                      {label}
                    </span>
                  );
                })()}
              </div>

              {/* Assigned agent */}
              <div className={cell}>
                {lead.assignedAgentName ? (
                  <>
                    <div className="font-medium text-gray-900">
                      {lead.assignedAgentName}
                    </div>
                    {lead.assignedAgentEmail && (
                      <div className="text-blue-700">{lead.assignedAgentEmail}</div>
                    )}
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyAgentLink(lead)}
                        className="px-2 py-1 border border-gray-300 rounded-full text-[10px] text-gray-700 hover:bg-gray-50"
                      >
                        Copy agent link
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEmailAgent(lead)}
                        className="px-2 py-1 border border-gray-300 rounded-full text-[10px] text-gray-700 hover:bg-gray-50"
                      >
                        Email link
                      </button>
                    </div>
                  </>
                ) : (
                  <div>
                    <span className="text-gray-400 italic">Unassigned</span>
                    <div className="mt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenAssign(lead)}
                        className="px-2 py-1 border border-gray-300 rounded-full text-[10px] text-gray-700 hover:bg-gray-50"
                      >
                        Assign
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Action item */}
              <div className={cell}>
                <textarea
                  rows={dense ? 2 : 3}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-[11px]"
                  placeholder="Action item for agent..."
                  value={actionItemDrafts[lead.id] ?? lead.actionItem ?? ""}
                  onChange={(e) => handleActionItemChange(lead.id, e.target.value)}
                />
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveActionItem(lead)}
                    disabled={savingActionItemId === lead.id}
                    className="px-2 py-1 border border-gray-300 rounded-full text-[10px] text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {savingActionItemId === lead.id ? "Saving..." : "Save"}
                  </button>
                  {lastSavedActionItemId === lead.id && (
                    <span className="text-[10px] text-green-600">✓ Saved</span>
                  )}
                </div>
              </div>

              {/* Latest activity */}
              <div className={cell}>
                {(() => {
                  let latestEntry = null;
                  let latestTime = 0;

                  if (Array.isArray(lead.journal)) {
                    for (const entry of lead.journal) {
                      if (!entry || !entry.text) continue;

                      let ts = 0;
                      const ca = entry.createdAt;

                      if (ca?.toMillis) ts = ca.toMillis();
                      else if (ca instanceof Date) ts = ca.getTime();
                      else if (typeof ca === "number") ts = ca;
                      else if (typeof ca === "string") ts = new Date(ca).getTime();

                      if (!isNaN(ts) && ts >= latestTime) {
                        latestTime = ts;
                        latestEntry = entry;
                      }
                    }
                  }

                  if (!latestEntry && lead.latestActivity) {
                    latestEntry = { text: lead.latestActivity };
                  }

                  if (!latestEntry) return <span className="text-gray-400 italic">No activity yet</span>;

                  return (
                    <div className="text-gray-800">
                      <div>{latestEntry.text}</div>
                      {latestTime > 0 && (
                        <div className="text-[10px] text-gray-500 mt-1">
                          {formatDateTimeFromMillis(latestTime)}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Delete */}
              <div className={cell}>
                <button
                  type="button"
                  onClick={() => handleDeleteLead(lead)}
                  className="px-2 py-1 border border-red-300 text-red-700 rounded-full text-[10px] hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function AgentLeadsModal({ target, leads, onClose, onOpenLead }) {
  const [search, setSearch] = React.useState("");

  const normalizedSearch = search.trim().toLowerCase();

  const agentLeads = React.useMemo(() => {
    const rows = (Array.isArray(leads) ? leads : []).filter((l) => {
      const k = agentKeyForLead(l);
      return k === target.key;
    });

    if (!normalizedSearch) return rows;

    return rows.filter((l) => {
      const hay = [
        l.firstName,
        l.lastName,
        l.email,
        l.phone,
        l.latestActivity,
        l.journalLastEntry,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(normalizedSearch);
    });
  }, [leads, target.key, normalizedSearch]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-5xl w-full mx-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {target.name}
              {target.isPlaceholder && (
                <span className="ml-2 text-xs text-gray-500 italic">
                  (unregistered)
                </span>
              )}
            </div>
            <div className="text-xs text-gray-600">
              {agentLeads.length} lead(s)
              {target.email ? ` • ${target.email}` : ""}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-800"
          >
            ✕ Close
          </button>
        </div>

        <div className="mb-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this agent’s leads..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs"
          />
        </div>

        <div className="border border-gray-200 rounded-lg overflow-auto max-h-[60vh]">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 text-left">Lead</th>
                <th className="px-3 py-2 text-left">Contact</th>
                <th className="px-3 py-2 text-left">Due date</th>
                <th className="px-3 py-2 text-left">Latest activity</th>
                <th className="px-3 py-2 text-left">Open</th>
              </tr>
            </thead>
            <tbody>
              {agentLeads.map((l) => (
                <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">
                      {l.firstName} {l.lastName}
                    </div>
                    <div className="text-[11px] text-gray-500 font-mono">
                      {l.id}
                    </div>
                  </td>

                  <td className="px-3 py-2 text-[11px] text-gray-700">
                    {l.phone && <div>{l.phone}</div>}
                    {l.email && <div className="text-blue-700">{l.email}</div>}
                  </td>

                  <td className="px-3 py-2 text-[11px]">
                    {formatDate(l.nextEvaluationDate) || (
                      <span className="text-gray-400 italic">Not set</span>
                    )}
                  </td>

                  <td className="px-3 py-2 text-[11px] text-gray-700">
                    {l.latestActivity || l.journalLastEntry || (
                      <span className="text-gray-400 italic">No activity yet</span>
                    )}
                  </td>

                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onOpenLead(l.id)}
                      className="px-3 py-1 border border-gray-300 rounded-full text-[10px] text-gray-700 hover:bg-gray-50"
                    >
                      Open lead
                    </button>
                  </td>
                </tr>
              ))}

              {agentLeads.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-xs text-gray-500">
                    No leads found for this agent.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-[11px] text-gray-500">
          Tip: This is filtering by {target.isPlaceholder ? "assignedAgentName" : "assignedAgentId"}.
        </div>
      </div>
    </div>
  );
}
