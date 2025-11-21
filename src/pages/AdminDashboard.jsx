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
  const [search, setSearch] = useState("");
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  const [lastSavedActionItemId, setLastSavedActionItemId] = useState(null);
  const [actionItemDrafts, setActionItemDrafts] = useState({});
  const [savingActionItemId, setSavingActionItemId] = useState(null);

  // sort config state
  const [sortConfig, setSortConfig] = useState({
    field: null,
    direction: "asc",
  });

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

  async function handleCreateLead(formData) {
    setSaving(true);
    try {
      const {
        firstAttemptDate,
        nextEvaluationDate,
        journalLastEntry,
        ...rest
      } = formData;

      const payload = {
        ...rest,
        relationshipRanking: rest.relationshipRanking || "0",
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
                text: journalLastEntry,
              },
            ]
          : [],
        assignedAgentId: null,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,

        // default latest activity
        latestActivity: "Lead created by admin.",
      };

      await addDoc(collection(db, "leads"), payload);
      setShowNew(false);
    } catch (err) {
      console.error("Error creating lead:", err);
      alert("Error creating lead. Check console for details.");
    } finally {
      setSaving(false);
    }
  }

  function handleOpenAssign(lead) {
    setAssigningLead(lead);
  }

  function handleCloseAssign() {
    setAssigningLead(null);
    setAssigning(false);
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
      "Next Evaluation Date",
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

  async function handleCsvFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();

      const rows = text
        .split(/\r?\n/)
        .map((r) => r.trim())
        .filter((r) => r.length > 0);

      if (rows.length < 2) {
        alert("CSV looks empty or missing data rows.");
        return;
      }

      const headerLine = rows[0];
      const headerSeparator = headerLine.includes(";") ? ";" : ",";
      const headers = headerLine
        .split(headerSeparator)
        .map((h) => h.trim().toLowerCase());

      console.log("[CSV Import] Raw header line:", headerLine);
      console.log("[CSV Import] Parsed headers:", headers);

      const fullNameIdx = headers.findIndex((h) =>
        ["full name", "name", "fullname", "contact name"].includes(h)
      );

      const firstNameIdx = headers.findIndex((h) =>
        ["first name", "firstname", "first"].includes(h)
      );

      const lastNameIdx = headers.findIndex((h) =>
        ["last name", "lastname", "last"].includes(h)
      );

      const phoneIdx = headers.findIndex((h) =>
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

      const emailIdx = headers.findIndex((h) =>
        ["email", "e-mail", "email address", "e-mail address"].includes(h)
      );

      console.log("[CSV Import] Detected indexes:", {
        fullNameIdx,
        firstNameIdx,
        lastNameIdx,
        phoneIdx,
        emailIdx,
      });

      let createdCount = 0;

      for (let i = 1; i < rows.length; i++) {
        const line = rows[i];
        if (!line) continue;

        const cols = line.split(headerSeparator).map((c) => c.trim());

        if (cols.every((c) => c === "")) continue;

        let firstName = "";
        let lastName = "";
        let phone = "";
        let email = "";

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

        if (phoneIdx >= 0 && cols[phoneIdx]) {
          phone = cols[phoneIdx];
        }
        if (emailIdx >= 0 && cols[emailIdx]) {
          email = cols[emailIdx];
        }

        if (!firstName && !lastName && !email && !phone) {
          const c0 = cols[0] || "";
          const c1 = cols[1] || "";
          const c2 = cols[2] || "";

          if (c0) {
            const parts = c0.split(" ");
            firstName = parts[0] || "";
            lastName = parts.slice(1).join(" ") || "";
          }
          if (!phone && c1 && c1.match(/\d/)) {
            phone = c1;
          }
          if (!email && c2 && c2.includes("@")) {
            email = c2;
          }
        }

        if (!email) {
          const emailCandidate = cols.find((c) => c.includes("@"));
          if (emailCandidate) email = emailCandidate;
        }

        if (!phone) {
          const phoneCandidate = cols.find(
            (c) => /\d/.test(c) && c.length >= 7
          );
          if (phoneCandidate) phone = phoneCandidate;
        }

        if (!firstName && !lastName && !email && !phone) {
          console.log("[CSV Import] Skipping row (no usable contact):", cols);
          continue;
        }

        const contactParts = [];
        if (phone) contactParts.push(phone);
        if (email) contactParts.push(email);
        const contact = contactParts.join(" • ");

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
          source: "import-csv",
          firstAttemptDate: null,
          nextEvaluationDate: null,
          journalLastEntry: "Imported from CSV.",
          journal: [
            {
              id: crypto.randomUUID(),
              createdAt: new Date(),
              createdBy: user.uid,
              createdByEmail: user.email,
              text: "Imported from CSV.",
              type: "import",
            },
          ],
          assignedAgentId: null,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          latestActivity: "Lead imported from CSV.",
        };

        await addDoc(collection(db, "leads"), payload);
        createdCount++;
      }

      alert(`Import complete. Created ${createdCount} lead(s).`);
    } catch (err) {
      console.error("Error importing CSV:", err);
      alert("Error importing CSV. Check console for details.");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

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

          {/* Filters row */}
          <div className="flex flex-wrap gap-2 text-[11px]">
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

        <div className="overflow-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 text-left">
                  <SortHeader label="Name" field="name" />
                </th>
                <th className="px-3 py-2 text-left">Contact</th>
                <th className="px-3 py-2 text-left">
                  <SortHeader label="Status" field="status" />
                </th>
                <th className="px-3 py-2 text-left">
                  <SortHeader label="Type" field="leadType" />
                </th>
                <th className="px-3 py-2 text-left">
                  <SortHeader
                    label="Relationship"
                    field="relationshipRanking"
                  />
                </th>
                <th className="px-3 py-2 text-left">
                  <SortHeader label="Urgency" field="urgencyRanking" />
                </th>
                <th className="px-3 py-2 text-left">
                  <SortHeader label="Source" field="source" />
                </th>
                <th className="px-3 py-2 text-left">
                  <SortHeader label="Next eval" field="nextEvaluationDate" />
                </th>
                <th className="px-3 py-2 text-left">
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
                  <td className="px-3 py-2 align-top">
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

                  <td className="px-3 py-2 align-top text-[11px] text-gray-700">
                    {lead.phone && <div>{lead.phone}</div>}
                    {lead.email && (
                      <div className="text-blue-700">{lead.email}</div>
                    )}
                  </td>

                  <td className="px-3 py-2 align-top">
                    <LeadBadge
                      value={lead.status}
                      label={STATUS_LABELS[lead.status] || lead.status}
                    />
                  </td>

                  <td className="px-3 py-2 align-top">
                    <span className="text-[11px]">
                      {LEAD_TYPE_LABELS[lead.leadType] || lead.leadType}
                    </span>
                  </td>

                  <td className="px-3 py-2 align-top">
                    <LeadBadge
                      value={lead.relationshipRanking}
                      label={
                        RELATIONSHIP_LABELS[lead.relationshipRanking] ||
                        lead.relationshipRanking
                      }
                    />
                  </td>

                  <td className="px-3 py-2 align-top">
                    <LeadBadge
                      value={lead.urgencyRanking}
                      label={
                        URGENCY_LABELS[lead.urgencyRanking] ||
                        lead.urgencyRanking
                      }
                    />
                  </td>

                  <td className="px-3 py-2 align-top">
                    <span className="text-[11px]">
                      {SOURCE_LABELS[lead.source] || lead.source}
                    </span>
                  </td>

                  <td className="px-3 py-2 align-top text-[11px]">
                    {formatDate(lead.nextEvaluationDate)}
                  </td>

                  <td className="px-3 py-2 align-top text-[11px]">
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
                          <button
                            type="button"
                            onClick={() => handleOpenAssign(lead)}
                            className="px-2 py-1 border border-gray-300 rounded-full text-[10px] text-gray-700 hover:bg-gray-50"
                          >
                            Change
                          </button>
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
   <td className="px-3 py-2 align-top text-[11px] min-w-[260px] w-[320px]">
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


                  {/* Latest activity column */}
                  <td className="px-3 py-2 align-top text-[11px]">
                    {(() => {
                      let latestText = "";
                      let latestTime = 0;

                      // Prefer most recent journal entry
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

                      // Fallback to journalLastEntry
                      if (!latestText && lead.journalLastEntry) {
                        latestText = lead.journalLastEntry;
                      }

                      // Legacy fallback: latestActivity
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
                          {latestText}
                        </div>
                      );
                    })()}
                  </td>

                  {/* Delete */}
                  <td className="px-3 py-2 align-top text-[11px]">
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
    </div>
  );
}
