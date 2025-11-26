// src/pages/AdminDashboard.jsx
import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db, deleteUserByUid } from "../firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  writeBatch,
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
import useAgents from "../hooks/useAgents";
import { Link } from "react-router-dom";

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


// Modal to assign an agent to a lead
function AssignAgentModal({ lead, agents, onClose, onAssign, assigning }) {
  const [selectedId, setSelectedId] = React.useState("");
  const [search, setSearch] = React.useState("");

  // Preselect currently assigned agent when modal opens
  React.useEffect(() => {
    if (lead?.assignedAgentId) {
      setSelectedId(lead.assignedAgentId);
    } else {
      setSelectedId("");
    }
  }, [lead]);
// 🔧 CSV dedupe helpers
const MANUAL_REVIEW_DUPLICATES = false; 
// Set to true if you want a prompt for each duplicate row.

function normalizeEmail(email) {
  if (!email) return "";
  return String(email).trim().toLowerCase();
}

function normalizePhone(phone) {
  if (!phone) return "";
  // keep only digits so formats like (484) 716-3788 == 4847163788
  return String(phone).replace(/\D/g, "");
}

  const filteredAgents = React.useMemo(() => {
    if (!Array.isArray(agents)) return [];

    const term = search.trim().toLowerCase();
    const base = agents.slice().sort((a, b) => {
      const aName = (a.fullName || a.email || "").toLowerCase();
      const bName = (b.fullName || b.email || "").toLowerCase();
      return aName.localeCompare(bName);
    });

    if (!term) return base;

    return base.filter((a) => {
      const name = (a.fullName || "").toLowerCase();
      const email = (a.email || "").toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [agents, search]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full mx-4 p-4 sm:p-5 text-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Assign agent
          </h2>
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

        {agents.length === 0 ? (
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
            {/* Search box */}
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
                Showing {filteredAgents.length} of {agents.length} agents
              </div>
            </div>

            {/* Results dropdown */}
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
                      {(a.fullName || a.email) ?? "Unnamed user"}{" "}
                      {a.email ? `(${a.email})` : ""}
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


// Modal to help admin email the agent link (copyable subject/body)
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

export default function AdminDashboard() {

    const [csvPreview, setCsvPreview] = useState(null);
// shape: { headers: string[], rows: Array<{ id: number, cols: string[] }> }

const [csvSelectedRowIds, setCsvSelectedRowIds] = useState([]);
const [csvPreviewOpen, setCsvPreviewOpen] = useState(false);
const [csvSort, setCsvSort] = useState({
  columnIndex: null,
  direction: "asc", // "asc" | "desc"
});

  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const { agents } = useAgents();
  const [assigningLead, setAssigningLead] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [emailLead, setEmailLead] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [relationshipFilter, setRelationshipFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const [dateQuickFilter, setDateQuickFilter] = useState("all"); 
// "all" | "overdue" | "thisWeek"
  const [search, setSearch] = useState("");
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
const [bulkAssignAgentId, setBulkAssignAgentId] = useState("");
const [bulkWorking, setBulkWorking] = useState(false);

  const [lastSavedActionItemId, setLastSavedActionItemId] = useState(null);
  const [actionItemDrafts, setActionItemDrafts] = useState({});
  const [savingActionItemId, setSavingActionItemId] = useState(null);
const [newLeadAssignedAgentId, setNewLeadAssignedAgentId] = useState("");
const [dense, setDense] = useState(false);
const [creating, setCreating] = useState(false);

  // sort config state
  const [sortConfig, setSortConfig] = useState({
    field: null,
    direction: "asc",
  });
function handleCsvSort(columnIndex) {
  setCsvSort((prev) => {
    if (prev.columnIndex === columnIndex) {
      // toggle direction
      return {
        columnIndex,
        direction: prev.direction === "asc" ? "desc" : "asc",
      };
    }
    return { columnIndex, direction: "asc" };
  });
}

const sortedCsvRows = React.useMemo(() => {
  if (!csvPreview) return [];
  const base = [...csvPreview.rows];
  const { columnIndex, direction } = csvSort;

  if (columnIndex == null) return base;

  return base.sort((a, b) => {
    const av = (a.cols[columnIndex] || "").toString().toLowerCase();
    const bv = (b.cols[columnIndex] || "").toString().toLowerCase();

    if (av < bv) return direction === "asc" ? -1 : 1;
    if (av > bv) return direction === "asc" ? 1 : -1;
    return 0;
  });
}, [csvPreview, csvSort]);

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

  function handleOpenAssign(lead) {
  setAssigningLead(lead);
}
  function handleCloseAssign() {
    setAssigningLead(null);
    setAssigning(false);
  }
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
      if (v.toMillis) return v.toMillis(); // just in case you ever store as Timestamp
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
          lead.assignedAgentName ||
          lead.assignedAgentEmail ||
          ""
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

  useEffect(() => {
    const q = query(collection(db, "leads"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
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

      // Firestore batch hard limit is 500 writes; stay a bit under
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
    Array.isArray(agents) && agents.find((a) => a.id === bulkAssignAgentId);
  if (!agent) {
    alert("Selected agent not found.");
    return;
  }

  const confirmed = window.confirm(
    `Assign ${selectedLeadIds.length} selected lead(s) to ${agent.fullName || agent.email}?`
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
        assignedAgentId: agent.id,
        assignedAgentName: agent.fullName || agent.email,
        assignedAgentEmail: agent.email || null,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,

        latestActivity: text,
        journalLastEntry: text,
        journal: arrayUnion({
          id: crypto.randomUUID(),
          createdAt: new Date(), // ✅ plain Date, not serverTimestamp()
          createdBy: user.uid,
          createdByEmail: user.email,
          text,
          type: "bulk-assignment",
        }),
      });

      count++;

      if (count === 450) {
        // Commit batch and start a new one if we ever get this large
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

// AdminDashboard.jsx (inside your component)
async function handleCreateLead(formData) {
  setSaving(true);
  try {
    const {
      firstAttemptDate,
      nextEvaluationDate,
      journalLastEntry,
      ...rest
    } = formData;

    // 🔍 Look up the selected agent (if any) from the dropdown
    const selectedAgent =
      newLeadAssignedAgentId && Array.isArray(agents)
        ? agents.find((a) => a.id === newLeadAssignedAgentId)
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

      // defaults
      relationshipRanking: rest.relationshipRanking || "0",
      urgencyRanking: rest.urgencyRanking || "unsure",
      firstAttemptDate: firstAttemptDate || null,
      nextEvaluationDate: nextEvaluationDate || null,

      // journal seed
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

      // 👇 assignment from dropdown
      assignedAgentId: selectedAgent ? selectedAgent.id : null,
      assignedAgentName,
      assignedAgentEmail,

      // meta
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

    // reset modal + dropdown for next time
    setShowNew(false);
    setNewLeadAssignedAgentId("");
  } catch (err) {
    console.error("Error creating lead:", err);
    alert("Error creating lead. Check console for details.");
  } finally {
    setSaving(false);
  }
}



  async function handleAssignSave(agentId) {
    if (!assigningLead) return;

    const agent = agents.find((a) => a.id === agentId);
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

      await updateDoc(ref, {
        assignedAgentId: agent.id,
        assignedAgentName: agent.fullName || agent.email,
        assignedAgentEmail: agent.email,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,

        latestActivity: text,

        // journal logging
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
    const confirmMsg = `Are you sure you want to delete this lead?\n\n${lead.firstName} ${lead.lastName} (${lead.email || "no email"})`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteDoc(doc(db, "leads", lead.id));
    } catch (err) {
      console.error("Error deleting lead:", err);
      alert("Error deleting lead. Check console for details.");
    }
  }

  const normalizedSearch = search.trim().toLowerCase();

  const filteredLeads = leads.filter((lead) => {
    // Dropdown filters
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
  if (urgencyFilter && lead.urgencyRanking !== urgencyFilter) {
    return false;
  }

  // 1b) Quick filters for nextEvaluationDate
  if (dateQuickFilter !== "all") {
    let nextEvalMs = null;
    const d = lead.nextEvaluationDate;

    if (d) {
      if (d.toMillis) {
        // Firestore Timestamp
        nextEvalMs = d.toMillis();
      } else {
        const t = new Date(d).getTime();
        if (!Number.isNaN(t)) {
          nextEvalMs = t;
        }
      }
    }

    // If there is no date at all, we exclude it when a date filter is applied
    if (nextEvalMs == null) {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const end = new Date(today);
    end.setDate(end.getDate() + 7); // Next 7 days
    end.setHours(23, 59, 59, 999);
    const endMs = end.getTime();

    if (dateQuickFilter === "overdue") {
      // strictly before today
      if (!(nextEvalMs < todayMs)) return false;
    }

    if (dateQuickFilter === "thisWeek") {
      // today through +7 days
      if (!(nextEvalMs >= todayMs && nextEvalMs <= endMs)) return false;
    }
  }

  // 2) Text search
  if (!normalizedSearch) return true;

    // Text search
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

      // nulls last
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      // numeric compare
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
      }

      // string compare
      const aStr = String(aVal);
      const bStr = String(bVal);

      if (aStr < bStr) return sortConfig.direction === "asc" ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredLeads, sortConfig]);

  const agentStats = (() => {
    if (!Array.isArray(agents) || agents.length === 0) return [];

    const countsById = {};

    leads.forEach((lead) => {
      const id = lead.assignedAgentId;
      if (!id) return;

      if (!countsById[id]) {
        countsById[id] = { total: 0, hot: 0 };
      }

      countsById[id].total += 1;

      if (lead.relationshipRanking === "78" || lead.relationshipRanking === "100") {
        countsById[id].hot += 1;
      }
    });

    return agents
      .map((agent) => {
        const stats = countsById[agent.id] || { total: 0, hot: 0 };
        return {
          id: agent.id,
          name: agent.fullName || agent.email || "Unknown",
          email: agent.email || "",
          total: stats.total,
          hot: stats.hot,
        };
      })
      .sort((a, b) =>
        (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())
      );
  })();

  function handleActionItemChange(leadId, value) {
    setActionItemDrafts((prev) => ({
      ...prev,
      [leadId]: value,
    }));
  }
async function handleDeleteUser(agent) {
  if (!agent?.id) {
    alert("Cannot delete: user ID missing.");
    return;
  }

  const msg = `Are you sure you want to delete this user?\n\n${
    agent.fullName || agent.email
  }\n\nThis will delete their Firebase Auth account and their Firestore profile (users/${agent.id}).\n\nLeads will NOT be deleted.`;
  
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

  // Detect delimiter (comma vs semicolon) looking only at the first line, ignoring quoted parts
function detectDelimiter(rawText) {
  let inQuotes = false;
  let commaCount = 0;
  let semicolonCount = 0;

  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      break; // end of header row
    }

    if (!inQuotes) {
      if (ch === ",") commaCount++;
      if (ch === ";") semicolonCount++;
    }
  }

  // default to comma if tie / none
  if (semicolonCount > commaCount) return ";";
  return ",";
}

// Parse CSV into rows of fields, respecting quotes and embedded newlines
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
        // Escaped quote ("")
        field += '"';
        i++; // skip next
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      // end of field
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      // end of row
      // handle CRLF (\r\n) by skipping the \n if we've already seen \r
      if (ch === "\r" && next === "\n") {
        i++;
      }
      row.push(field);
      field = "";

      // Only push non-empty rows (at least one non-empty field)
      if (row.some((f) => f.trim().length > 0)) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    field += ch;
  }

  // Last field / row (if file doesn’t end with newline)
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

    // Use the robust parser
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

    // For debugging / sanity check
    console.log("[CSV] Parsed rows total:", rows.length);
    console.log("[CSV] Header columns:", rawHeaders.length);
    console.log("[CSV] Data rows:", dataRows.length);

    setCsvPreview({
      headers: rawHeaders,
      rows: dataRows,
    });

    // Default: all selected
    setCsvSelectedRowIds(dataRows.map((r) => r.id));
    setCsvPreviewOpen(true);
  } catch (err) {
    console.error("Error parsing CSV:", err);
    alert("Error reading CSV. Check console for details.");
  } finally {
    // allow re-uploading same file again
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

    const fullNameIdx = lowerHeaders.findIndex((h) =>
      ["full name", "name", "fullname", "contact name"].includes(h)
    );
    const firstNameIdx = lowerHeaders.findIndex((h) =>
      ["first name", "firstname", "first"].includes(h)
    );
    const lastNameIdx = lowerHeaders.findIndex((h) =>
      ["last name", "lastname", "last"].includes(h)
    );
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
      ].includes(h)
    );
    const emailIdx = lowerHeaders.findIndex((h) =>
      ["email", "e-mail", "email address", "e-mail address"].includes(h)
    );
    const sourceIdx = lowerHeaders.findIndex((h) =>
      ["source", "lead source"].includes(h)
    );
    const registeredIdx = lowerHeaders.findIndex((h) =>
      ["registered", "registration date", "reg date", "registered date"].includes(h)
    );
    const agentNotesIdx = lowerHeaders.findIndex((h) =>
      [
        "agent notes",
        "agent note",
        "notes",
        "comments",
        "contact history",
        "lead notes",
      ].includes(h)
    );

    // ✅ Regex for standard phone formats
    const phoneRegex =
      /(\+?1?[\s\-.(]*\d{3}[\s\-.)]*\d{3}[\s\-.,]*\d{4})/;

    function extractPhoneFromText(text) {
      if (!text) return "";
      const s = String(text);

      // 1) Try to grab a formatted number (###-###-####, (###) ###-####, etc.)
      const match = s.match(phoneRegex);
      if (match) {
        return match[1].trim();
      }

      // 2) Fallback: look for ANY 7–15 digit run inside the text (for numbers like 6106620693)
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

      // --- NAME ---
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

      // --- DIRECT PHONE / EMAIL COLUMNS ---
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

      // --- SOURCE ---
      if (sourceIdx >= 0 && cols[sourceIdx]) {
        source = String(cols[sourceIdx]) || "import-csv";
      }

      // --- REGISTERED DATE ---
      if (registeredIdx >= 0 && cols[registeredIdx]) {
        registeredRaw = String(cols[registeredIdx]);
      }

      // --- AGENT NOTES (full blob, for journal only) ---
      if (agentNotesIdx >= 0 && cols[agentNotesIdx]) {
        agentNotes = String(cols[agentNotesIdx]);
      }

      // 🔍 IF STILL NO PHONE, try from agent notes (number only)
      if (!phone && agentNotes) {
        phone = extractPhoneFromText(agentNotes);
      }

      // 🔍 IF STILL NO EMAIL, try from agent notes
      if (!email && agentNotes) {
        email = extractEmailFromText(agentNotes);
      }

      // 🔍 EXTRA fallback: scan ALL columns for phone/email, but only store the extracted number/email
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

      // If we truly have no usable identity at all, skip the row
      if (!firstName && !lastName && !email && !phone) {
        console.log("[CSV Import] Skipping row (no usable contact):", cols);
        continue;
      }

      // ✅ CONTACT STRING = ONLY phone + email
      const contactParts = [];
      if (phone) contactParts.push(phone);
      if (email) contactParts.push(email);
      const contact = contactParts.join(" • ");

      // ✅ JOURNAL TEXT = import line + full agent notes
      const journalLines = ["Imported from CSV (selected row)."];
      if (agentNotes) {
        journalLines.push("");
        journalLines.push("Agent notes:");
        journalLines.push(agentNotes);
      }
      const journalText = journalLines.join("\n");

      const payload = {
        firstName,
        lastName,
        phone,
        email,
        contact,
        status: "engagement-phase",
        leadType: "buyer",
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
        assignedAgentId: null,
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






const headerPad = dense ? "py-1" : "py-2";
const cellPad = dense ? "py-1" : "py-2";

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            Admin Lead Dashboard
          </h1>
          <p className="text-xs text-gray-600">
            Signed in as <span className="font-medium">{user?.email}</span>. This
            view is your SharePoint-style lead list.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
            className="border border-gray-300 text-xs px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {importing ? "Importing..." : "Import CSV"}
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="border border-gray-300 text-xs px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Export CSV
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="bg-wrcBlack text-wrcYellow text-xs font-semibold px-3 py-2 rounded-lg hover:bg-black"
          >
            + New lead
          </button>
        </div>
      </div>

      {/* Hidden file input for CSV */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleCsvFileChange}
      />

      {agentStats.length > 0 && (
        <div className="border border-gray-200 rounded-lg bg-white p-3 text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-gray-700">
              Agent summary
            </span>
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
    <tr
      key={a.id}
      className="border-b border-gray-100"
    >
      <td className="px-2 py-1">{a.name}</td>
      <td className="px-2 py-1 text-blue-700">
        {a.email || <span className="text-gray-400">—</span>}
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
        <button
          type="button"
          onClick={() => handleDeleteUser(a)}
          className="px-2 py-1 border border-red-300 text-red-700 rounded-full text-[10px] hover:bg-red-50"
        >
          Delete user
        </button>
      </td>
    </tr>
  ))}
</tbody>


            </table>
          </div>
        </div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
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
      {/* Row density toggle */}
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

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
  {/* Quick filters for Next Evaluation Date */}
  <div className="flex items-center gap-1 mr-2">
    <span className="text-[11px] font-semibold text-red-700">
  {/* Due date: */}
</span>


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

  {/* Existing dropdown filters */}
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
{selectedLeadIds.length > 0 && (
  <div className="px-3 py-2 border-b border-gray-200 bg-amber-50 flex flex-wrap items-center gap-3 text-[11px]">
    <span className="font-semibold text-amber-900">
      {selectedLeadIds.length} lead(s) selected
    </span>

    {/* Bulk assign */}
    {Array.isArray(agents) && agents.length > 0 && (
      <div className="flex items-center gap-2">
        <select
          value={bulkAssignAgentId}
          onChange={(e) => setBulkAssignAgentId(e.target.value)}
          className="border border-amber-300 rounded px-2 py-1"
        >
          <option value="">Assign to agent...</option>
          {agents.map((a) => (
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

    {/* Bulk delete */}
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

      <div className="overflow-auto max-h-[70vh]">
  <table className="min-w-full text-xs">
    <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr className="text-[11px] uppercase tracking-wide text-gray-500">
                <th className={`px-3 ${headerPad} text-left`}>
  <input
    type="checkbox"
    checked={
      sortedLeads.length > 0 &&
      selectedLeadIds.length === sortedLeads.length
    }
    onChange={toggleSelectAll}
  />
</th>

                <th className={`px-3 ${headerPad} text-left`}>
                  <SortHeader label="Name" field="name" />
                </th>
                <th className="px-3 py-2 text-left">Contact</th>
                <th className={`px-3 ${headerPad} text-left`}>
                  <SortHeader label="Status" field="status" />
                </th>
                <th className={`px-3 ${headerPad} text-left`}>
                  <SortHeader label="Type" field="leadType" />
                </th>
                <th className={`px-3 ${headerPad} text-left`}>
                  <SortHeader
                    label="Relationship"
                    field="relationshipRanking"
                  />
                </th>
               <th className={`px-3 ${headerPad} text-left`}>
                  <SortHeader label="Urgency" field="urgencyRanking" />
                </th>
                <th className={`px-3 ${headerPad} text-left`}>
                  <SortHeader label="Source" field="source" />
                </th>
                <th className={`px-3 ${headerPad} text-left`}>
  <SortHeader label="Reg. date" field="registeredDateRaw" />
</th>
               <th className={`px-3 ${headerPad} text-left text-red-700`}>
  <SortHeader label="Due date" field="nextEvaluationDate" />
</th>

               <th className={`px-3 ${headerPad} text-left`}>
                  <SortHeader label="Assigned agent" field="assignedAgent" />
                </th>
                <th className="px-3 py-2 text-left min-w-[260px] w-[320px]">
  Action item
</th>

                <th className="px-3 py-2 text-left">Latest activity</th>
                <th className="px-3 py-2 text-left">Delete</th>
              </tr>
            </thead>

            <tbody>
              {!loading && leads.length === 0 && (
                <tr>
                  <td
                    colSpan={12}
                    className="px-3 py-6 text-center text-gray-500 text-xs"
                  >
                    No leads yet. Click &quot;New lead&quot; to add one.
                  </td>
                </tr>
              )}

              {!loading &&
                leads.length > 0 &&
                filteredLeads.length === 0 && (
                  <tr>
                    <td
                      colSpan={12}
                      className="px-3 py-6 text-center text-gray-500 text-xs"
                    >
                      No leads match your search.
                    </td>
                  </tr>
                )}

              {sortedLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                    <td className={`px-3 ${cellPad} align-top`}>
  <input
    type="checkbox"
    checked={selectedLeadIds.includes(lead.id)}
    onChange={() => toggleSelectOne(lead.id)}
  />
</td>

                  <td className={`px-3 ${cellPad} align-top`}>
                    <div className="font-medium text-xs text-gray-900">
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
                  </td>

                  <td className={`px-3 ${cellPad} align-top text-[11px] text-gray-700`}>

                    {lead.phone && <div>{lead.phone}</div>}
                    {lead.email && (
                      <div className="text-blue-700">{lead.email}</div>
                    )}
                  </td>

                  <td className={`px-3 ${cellPad} align-top`}>
                    <LeadBadge
                      value={lead.status}
                      label={STATUS_LABELS[lead.status] || lead.status}
                    />
                  </td>

                 <td className={`px-3 ${cellPad} align-top`}>
                    <span className="text-[11px]">
                      {LEAD_TYPE_LABELS[lead.leadType] || lead.leadType}
                    </span>
                  </td>

                  <td className={`px-3 ${cellPad} align-top`}>
                    <LeadBadge
                      value={lead.relationshipRanking}
                      label={
                        RELATIONSHIP_LABELS[lead.relationshipRanking] ||
                        lead.relationshipRanking
                      }
                    />
                  </td>

                  <td className={`px-3 ${cellPad} align-top`}>
                    <LeadBadge
                      value={lead.urgencyRanking}
                      label={
                        URGENCY_LABELS[lead.urgencyRanking] ||
                        lead.urgencyRanking
                      }
                    />
                  </td>

                  <td className={`px-3 ${cellPad} align-top`}>
                    <span className="text-[11px]">
                      {SOURCE_LABELS[lead.source] || lead.source}
                    </span>
                  </td>
<td className={`px-3 ${cellPad} align-top text-[11px]`}>
  {lead.registeredDateRaw ? (
    <span className="text-gray-800">
      {formatDate(lead.registeredDateRaw)}
    </span>
  ) : (
    <span className="text-gray-400 italic">No Registered Date</span>
  )}
</td>

               <td className={`px-3 ${cellPad} align-top text-[11px]`}>
  {(() => {
    const label = formatDate(lead.nextEvaluationDate);
    if (!label) return <span className="text-gray-400 italic">No due date</span>;

    // simple overdue highlight
    let isOverdue = false;
    try {
      if (lead.nextEvaluationDate?.toMillis) {
        isOverdue = lead.nextEvaluationDate.toMillis() < Date.now();
      } else if (typeof lead.nextEvaluationDate === "string") {
        const t = new Date(lead.nextEvaluationDate).getTime();
        if (!Number.isNaN(t)) isOverdue = t < Date.now();
      }
    } catch {
      // fail silently
    }

    return (
      <span className={isOverdue ? "text-red-700 font-semibold" : "text-gray-800"}>
        {label}
      </span>
    );
  })()}
</td>


         <td className="px-3 ${cellPad} align-top text-[11px]">
  {lead.assignedAgentName ? (
    <>
      <div className="font-medium text-gray-900">
        {lead.assignedAgentName}
      </div>
      {lead.assignedAgentEmail && (
        <div className="text-blue-700">
          {lead.assignedAgentEmail}
        </div>
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
        {/* 🔥 Removed the "Change" button */}
      </div>
    </>
  ) : (
    <div>
      <span className="text-gray-400 italic">
        Unassigned
      </span>
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
</td>


                  {/* Action item column */}
   <td className="px-3 ${cellPad} align-top text-[11px] min-w-[260px] w-[320px]">
  <textarea
    rows={3}
    className="w-full border border-gray-300 rounded px-2 py-1 text-[11px]"
    placeholder="Action item for agent..."
    value={
      actionItemDrafts[lead.id] ??
      lead.actionItem ??
      ""
    }
    onChange={(e) =>
      handleActionItemChange(lead.id, e.target.value)
    }
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
      <span className="text-[10px] text-green-600">
        ✓ Saved
      </span>
    )}
  </div>
</td>

<td className="px-3 py-2 align-top text-[11px]">
  {(() => {
    let latestText = "";
    let latestTime = 0;

    // 1) Prefer the most recent journal entry by createdAt
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

    // 2) Fallback to journalLastEntry (string-only field)
    if (!latestText && lead.journalLastEntry) {
      latestText = lead.journalLastEntry;
    }

    // 3) Legacy fallback: latestActivity (older schema / assignment-only)
    if (!latestText && lead.latestActivity) {
      latestText = lead.latestActivity;
    }

    if (!latestText) {
      return (
        <span className="text-gray-400 italic">
          No activity yet
        </span>
      );
    }

    return (
      <div className="text-gray-800">
        <div>{latestText}</div>
        {latestTime > 0 && (
          <div className="text-[10px] text-gray-500 mt-1">
            {formatDateTimeFromMillis(latestTime)}
          </div>
        )}
      </div>
    );
  })()}
</td>


                  {/* Delete */}
                  <td className="px-3 ${cellPad} align-top text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleDeleteLead(lead)}
                      className="px-2 py-1 border border-red-300 text-red-700 rounded-full text-[10px] hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

      {/* 🔽 Assign agent at creation (optional) */}
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
            {Array.isArray(agents) &&
              agents.map((a) => (
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
                    Array.isArray(agents) &&
                    agents.find((ag) => ag.id === newLeadAssignedAgentId);
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
          agents={agents}
          assigning={assigning}
          onClose={handleCloseAssign}
          onAssign={handleAssignSave}
        />
      )}

      {/* Email Agent Modal */}
      {emailLead && (
        <EmailAgentModal
          lead={emailLead}
          onClose={() => setEmailLead(null)}
        />
      )}
{csvPreviewOpen && csvPreview && (
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
          }}
          className="text-[11px] text-gray-500 hover:text-gray-800"
        >
          ✕ Close
        </button>
      </div>

      {(() => {
        const { headers, rows } = csvPreview;
        const lowerHeaders = headers.map((h) => h.toLowerCase());

        // Helper to find column indexes by possible header names
        const findIdx = (candidates) =>
          lowerHeaders.findIndex((h) => candidates.includes(h));

        // Indices we care about
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
        const lastNameIdx = findIdx([
          "last name",
          "lastname",
          "last",
        ]);
        const phoneIdx = findIdx([
          "phone",
          "phone number",
          "primary phone",
          "mobile",
          "cell",
          "cell phone",
          "home phone",
          "work phone",
        ]);
        const emailIdx = findIdx([
          "email",
          "e-mail",
          "email address",
          "e-mail address",
        ]);
        const sourceIdx = findIdx([
          "source",
          "lead source",
          "source name",
        ]);
        const registrationIdx = findIdx([
          "registration date",
          "registered",
          "date registered",
          "reg date",
        ]);
        const notesIdx = findIdx([
          "agent notes",
          "agent note",
          "notes",
          "comments",
        ]);

        // Helper to compute display values
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

          // fallback to first non-empty col
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

        return (
          <>
            <div className="mb-2 text-[11px] text-gray-600">
              Showing only the columns that will be imported:
              <span className="font-semibold">
                {" "}
                Name, Email, Phone, Source, Registered, Agent notes
              </span>
              .
            </div>

            <div className="border border-gray-200 rounded-lg overflow-auto max-h-80">
              <table className="min-w-full text-[11px]">
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
                    <th className="px-2 py-1 text-left">Registered</th>
                    <th className="px-2 py-1 text-left">Agent notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
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
                            onChange={(e) => {
                              if (e.target.checked) {
                                setCsvSelectedRowIds((prev) => [
                                  ...prev,
                                  row.id,
                                ]);
                              } else {
                                setCsvSelectedRowIds((prev) =>
                                  prev.filter((id) => id !== row.id)
                                );
                              }
                            }}
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
          </>
        );
      })()}

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
)}


    </div>
  );
}
