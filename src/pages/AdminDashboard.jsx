import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db, deleteUserByUid } from "../firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
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
import { Link, useNavigate, useLocation } from "react-router-dom";
// import { normName, normEmail } from "../utils/normalize";
import { useVirtualizer } from "@tanstack/react-virtual";
import { importVleadsXlsx } from "../utils/importVleadsXlsx";
import {
  calculateUrgencyLevelFromDueDate,
  urgencyLevelPillLabel,
  urgencyLevelDescription,
} from "../utils/urgencyLevel";

function normEmailLocal(v) {
  return String(v || "").trim().toLowerCase();
}

function normPhoneLocal(v) {
  return String(v || "").replace(/[^\d]/g, "");
}

function buildLeadId({ email, phone }) {
  const e = normEmailLocal(email);
  if (e) return `email_${e}`;
  const p = normPhoneLocal(phone);
  if (p) return `phone_${p}`;
  return null;
}

function shallowDiff(oldObj, nextObj, fields) {
  const changed = [];
  for (const f of fields) {
    const a = oldObj?.[f] ?? "";
    const b = nextObj?.[f] ?? "";
    // normalize strings a bit
    const aa = typeof a === "string" ? a.trim() : a;
    const bb = typeof b === "string" ? b.trim() : b;
    if (JSON.stringify(aa) !== JSON.stringify(bb)) changed.push(f);
  }
  return changed;
}

function toMillis(value) {
  if (!value) return 0;
  if (value?.toMillis) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function formatDT(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
// import React from "react";
// import { importVleadsXlsx } from "../utils/importVleadsXlsx"; // <-- adjust path if needed
// const [showUnreadOnly, setShowUnreadOnly] = useState(true);

// const visibleNotifications = React.useMemo(() => {
//   return showUnreadOnly
//     ? notifications.filter((n) => !n.isRead)
//     : notifications;
// }, [notifications, showUnreadOnly]);

function VleadsImportButton({ actor }) {
  const inputRef = React.useRef(null);
  const [busy, setBusy] = React.useState(false);

  const handlePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setBusy(true);
      const res = await importVleadsXlsx(file, actor);
      console.log("[vleads] import result:", res);
      alert(`Imported ${res.imported} vleads.`);
    } catch (err) {
      console.error("[vleads] import failed:", err);
      alert(err.message || "Import failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handlePick}
        style={{ display: "none" }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="border border-gray-300 text-xs px-3 py-2 rounded-full text-gray-700 hover:bg-gray-50 disabled:opacity-60"
      >
        {busy ? "Importing..." : "Import vleads (Excel)"}
      </button>
    </>
  );
}



async function buildAgentDigestEmailAsync({ agentName, agentEmail, leads, sinceMs }) {
  const safeName = agentName || agentEmail || "Agent";

  // IMPORTANT: localhost links in dev will show in email.
  // Prefer a real base URL for production.
  const baseUrl =
    import.meta?.env?.VITE_PUBLIC_BASE_URL ||
    window.location.origin;

  const formatDT = (ms) => {
    try {
      return new Date(ms).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const getMs = (v) => {
    if (!v) return 0;
    if (typeof v === "number") return v;
    if (v?.toMillis) return v.toMillis();
    if (v instanceof Date) return v.getTime();
    if (typeof v === "string") {
      const t = Date.parse(v);
      return Number.isNaN(t) ? 0 : t;
    }
    return 0;
  };

  // Choose the best "last activity time" we have
  const lastActivityMs = (l) => {
    // Prefer explicit timestamps if you have them
    const candidates = [
      getMs(l.latestActivityAt),
      getMs(l.updatedAt),
      getMs(l.createdAt),
      // If you store journalLastAt / journalLastEntryAt, include it here too:
      getMs(l.journalLastAt),
      getMs(l.journalLastEntryAt),
    ];
    return Math.max(...candidates.filter(Boolean), 0);
  };

  const normalized = (Array.isArray(leads) ? leads : [])
    .filter(Boolean)
    .map((l) => ({
      ...l,
      _lastMs: lastActivityMs(l),
    }))
    .sort((a, b) => (b._lastMs || 0) - (a._lastMs || 0));

  const updated = sinceMs
    ? normalized.filter((l) => (l._lastMs || 0) >= sinceMs)
    : [];

  const stale = sinceMs
    ? normalized.filter((l) => (l._lastMs || 0) < sinceMs)
    : normalized;

  const subject = `WRC Leads Digest — ${safeName} — ${new Date().toLocaleDateString()}`;

  const lines = [];
  lines.push(`Hi ${safeName},`);
  lines.push("");
  lines.push(
    sinceMs
      ? `Here are your assigned leads (recent updates since ${formatDT(sinceMs)} are listed first):`
      : `Here are your assigned leads:`
  );
  lines.push("");

  if (normalized.length === 0) {
    lines.push("No leads are currently assigned to you.");
    lines.push("");
  } else {
    // Section 1: Updated
    if (updated.length > 0) {
      lines.push("RECENTLY UPDATED");
      lines.push("---------------");
      for (const l of updated) {
        const name = `${l.firstName || ""} ${l.lastName || ""}`.trim() || "(No name)";
        const summary =
          l.latestActivityAdmin ||
          l.latestActivity ||
          l.journalLastEntryAdmin ||
          l.journalLastEntry ||
          "Updated";

        const leadUrl = `${baseUrl}/agent-view/${encodeURIComponent(l.id)}`;
        lines.push(`• ${name} — ${formatDT(l._lastMs)}`);
        lines.push(`  ${summary}`);
        lines.push(`  Open: ${leadUrl}`);
        lines.push("");
      }
    }

    // Section 2: Still assigned but not updated recently
    if (stale.length > 0) {
      lines.push(updated.length > 0 ? "OLDER / NO RECENT UPDATES" : "ALL ASSIGNED LEADS");
      lines.push("-----------------------");
      for (const l of stale) {
        const name = `${l.firstName || ""} ${l.lastName || ""}`.trim() || "(No name)";
        const summary =
          l.latestActivityAdmin ||
          l.latestActivity ||
          l.journalLastEntryAdmin ||
          l.journalLastEntry ||
          "No recent updates";

        const when = l._lastMs ? formatDT(l._lastMs) : "—";
        const leadUrl = `${baseUrl}/agent-view/${encodeURIComponent(l.id)}`;
        lines.push(`• ${name} — last activity: ${when}`);
        lines.push(`  ${summary}`);
        lines.push(`  Open: ${leadUrl}`);
        lines.push("");
      }
    }
  }

  lines.push("Thank you,");
  lines.push("WRC Leads");

  return {
    subject,
    body: lines.join("\n"),
    // count = number of recently updated leads (keeps your “send anyway?” prompt meaningful)
    count: updated.length,
  };
}

function toMillisAny(v) {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (v?.toMillis) return v.toMillis(); // Firestore Timestamp
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function formatWhenFromNotif(n) {
  const ms =
    toMillisAny(n.eventAtMs) ||
    toMillisAny(n.updatedAt) ||
    toMillisAny(n.latestActivityAt) ||
    toMillisAny(n.createdAt);

  if (!ms) return "";
  return new Date(ms).toLocaleString();
}


// ---------- Small helpers ----------
function safeDocId(row) {
  // Prefer Firestore doc id you already set as docId
  const id = row?.docId;
  if (id && String(id).trim()) return String(id).trim();

  // Fallbacks (rare)
  if (row?.id && String(row.id).trim()) return String(row.id).trim();
  if (row?._id && String(row._id).trim()) return String(row._id).trim();

  return "";
}

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

function getLeadActivityMs(lead) {
  // 1) explicit activity timestamp
  const a = toMillis(lead.latestActivityAt);
  if (a) return a;

  // 2) updatedAt is usually the best “something changed”
  const u = toMillis(lead.updatedAt);
  if (u) return u;

  // 3) newest journal entry
  let latest = 0;
  if (Array.isArray(lead.journal)) {
    for (const entry of lead.journal) {
      const ts = toMillis(entry?.createdAt);
      if (ts > latest) latest = ts;
    }
  }
  if (latest) return latest;

  // 4) createdAt fallback
  return toMillis(lead.createdAt) || 0;
}

function agentKeyForLead(lead) {
  if (lead.assignedAgentId) return `reg:${lead.assignedAgentId}`;

  const e =
    normEmail(lead.assignedAgentEmailNorm || lead.assignedAgentEmail || "");
  if (e) return `unregEmail:${e}`;

  const n =
    normName(String(lead.assignedAgentNameNorm || lead.assignedAgentName || "").replace(/\s*\*$/, ""));
  if (n) return `unregName:${n}`;

  return "none";
}

function unregKeyFromEmailOrName(email, name) {
  const e = normEmail(email || "");
  if (e) return `unregEmail:${e}`;
  const n = normName(String(name || "").replace(/\s*\*$/, ""));
  if (n) return `unregName:${n}`;
  return "";
}






async function getOrCreateAgentOnlyLinkForLead(lead) {
  // token links only work for REGISTERED agents
  if (!lead?.assignedAgentId) return null;

  // Reuse an existing token doc if you already made one
  const q = query(
    collection(db, "agentLeadAccess"),
    where("leadId", "==", lead.id),
    where("assignedAgentId", "==", lead.assignedAgentId),
    limit(1)
  );

  const snap = await getDocs(q);
  if (!snap.empty) {
    const existing = snap.docs[0];
    return `${window.location.origin}/agent-view/${existing.id}`;
  }

  // Otherwise create a new one
  const ref = await addDoc(collection(db, "agentLeadAccess"), {
    leadId: lead.id,
    assignedAgentId: lead.assignedAgentId,
    createdAt: serverTimestamp(),
  });

  return `${window.location.origin}/agent-view/${ref.id}`;
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

function AssignAgentModal({
  lead,
  agents,
  onClose,
  onAssign,        // primary assignment (existing)
  onAssignAdd,     // add secondary
  onAssignRemove,  // remove secondary
  assigning,
}) {
  const [selectedId, setSelectedId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [secondaryAgentId, setSecondaryAgentId] = React.useState("");

  React.useEffect(() => {
    setSelectedId(lead?.assignedAgentId || "");
  }, [lead]);

  const filteredAgents = React.useMemo(() => {
    if (!Array.isArray(agents)) return [];
    const term = search.trim().toLowerCase();

    const base = agents
      .slice()
      .sort((a, b) => {
        const aName = (a.fullName || a.name || a.email || "").toLowerCase();
        const bName = (b.fullName || b.name || b.email || "").toLowerCase();
        return aName.localeCompare(bName);
      });

    if (!term) return base;

    return base.filter((a) => {
      const name = (a.fullName || a.name || "").toLowerCase();
      const email = (a.email || "").toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [agents, search]);

  const secondaryList = Array.isArray(lead?.assignedAgents) ? lead.assignedAgents : [];
  const secondaryIds = new Set(secondaryList.map((a) => a.id));

  const canAddSecondary =
    !!secondaryAgentId &&
    secondaryAgentId !== lead?.assignedAgentId &&
    !secondaryIds.has(secondaryAgentId);

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
            {lead?.firstName} {lead?.lastName}
          </span>
        </p>

        {!Array.isArray(agents) || agents.length === 0 ? (
          <div className="text-xs text-gray-500">
            No agents found. Make sure agents create an account first.
          </div>
        ) : (
          <>
            {/* PRIMARY ASSIGNMENT */}
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
                  Showing {filteredAgents.length} of {agents.length} agents
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  Primary agent
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
                        {(a.fullName || a.name || a.email || "Unnamed user") +
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
                  {assigning ? "Assigning..." : "Assign primary"}
                </button>
              </div>
            </form>

            {/* SECONDARY ASSIGNMENT */}
            <div className="mt-5 border-t pt-4">
              <div className="text-xs font-semibold text-gray-800 mb-2">
                Also assign to
              </div>

              <div className="flex gap-2">
                <select
                  value={secondaryAgentId}
                  onChange={(e) => setSecondaryAgentId(e.target.value)}
                  className="flex-1 border rounded-lg px-2 py-2 text-sm"
                >
                  <option value="">Select additional agent...</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.fullName || a.name || a.email || "Unnamed user") +
                        (a.email ? ` (${a.email})` : "")}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={!canAddSecondary || assigning}
                  onClick={() => {
                    if (!canAddSecondary) return;
                    onAssignAdd(secondaryAgentId);
                    setSecondaryAgentId("");
                  }}
                  className="px-3 py-2 rounded-lg bg-black text-white text-sm disabled:opacity-50"
                >
                  Add
                </button>
              </div>

              {secondaryList.length > 0 && (
                <div className="mt-3 space-y-2">
                  {secondaryList.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between border rounded-lg px-3 py-2"
                    >
                      <div className="text-sm">
                        <div className="font-medium">{a.name || a.email}</div>
                        {a.email ? (
                          <div className="text-xs text-gray-500">{a.email}</div>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        disabled={assigning}
                        onClick={() => onAssignRemove(a)}
                        className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// ---------- Email Agent Modal ----------

function EmailAgentModal({ lead, onClose }) {
  if (!lead) return null;

  const url = lead.agentUrl;

  const to = lead.assignedAgentEmail || "";

  // helpers for Firestore Timestamp / string dates
  const formatDueDate = (value) => {
    if (!value) return "Not set";
    try {
      if (value?.toDate) return value.toDate().toLocaleDateString();
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
    } catch {}
    return "Not set";
  };

  const dueDateText = formatDueDate(lead.nextEvaluationDate);
  const actionItemText = (lead.actionItem || "").trim() || "None";

  const subject = `WRC Lead — ${lead.firstName || ""} ${lead.lastName || ""}`.trim();

  const body = `Hi ${lead.assignedAgentName || ""},

A lead has been assigned to you in the WRC Lead Dashboard.

Lead: ${`${lead.firstName || ""} ${lead.lastName || ""}`.trim()}
Due date: ${dueDateText}
Action item: ${actionItemText}

Click this link to view and update the lead:
${url}

Thank you.
`;

  // ... keep the rest of your component the same


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
function emailAgentDigest({ toEmail, subject, body }) {
  const mailto = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  window.location.href = mailto;
}

function adminActivityPatch(text, actor) {
  const clean = String(text || "").trim();

  return {
    // activity rollups used across the UI
    latestActivityAdmin: clean,
    latestActivity: clean, // keep in sync so any view can show something
    latestActivityAt: serverTimestamp(),

    // helpful metadata (optional, but good)
    updatedByEmail: actor?.email || null,
    updatedByName: actor?.name || actor?.email || null,
  };
}
async function createAgentOnlyLink(lead) {
  // lead must have assignedAgentId for this to be enforceable
  if (!lead?.assignedAgentId) {
    throw new Error("This lead is not assigned to a registered agent yet.");
  }

  const accessRef = await addDoc(collection(db, "agentLeadAccess"), {
    leadId: lead.id,
    assignedAgentId: lead.assignedAgentId,
    createdAt: serverTimestamp(),
  });

  return `${window.location.origin}/agent-view/${accessRef.id}`;
}

// ---------- Main Admin Dashboard ----------

export default function AdminDashboard() {
  const location = useLocation();
  const [showNewClosing, setShowNewClosing] = useState(false);

  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  // Notifications
// Notifications
const [notifications, setNotifications] = useState([]);
const [showReadNotifs, setShowReadNotifs] = useState(false);
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
const [snapshotModal, setSnapshotModal] = useState({
  open: false,
  title: "",
  rows: [],
});
const [snapshotClosing, setSnapshotClosing] = useState(false);
useEffect(() => {
  if (!user) return;

  // Build query based on toggle
  const base = collection(db, "adminNotifications");

  const q = showReadNotifs
    ? query(base, orderBy("createdAt", "desc"), limit(200)) // show all (read + unread)
    : query(base, where("isRead", "==", false), orderBy("createdAt", "desc"), limit(50)); // unread only

  const unsub = onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setNotifications(items);
    },
    (err) => console.error("Error loading admin notifications:", err)
  );

  return () => unsub();
}, [user, showReadNotifs]);



const unreadCount = React.useMemo(
  () => notifications.filter((n) => !n.isRead).length,
  [notifications]
);

const visibleNotifications = React.useMemo(() => {
  return showUnreadOnly
    ? notifications.filter((n) => !n.isRead)
    : notifications;
}, [notifications, showUnreadOnly]);




async function handleNotificationClick(n) {
  if (n.leadId) {
    navigate(`/admin/lead/${encodeURIComponent(n.leadId)}`);

  }

  try {
    const ref = doc(db, "adminNotifications", n.id);
    await updateDoc(ref, { isRead: true });
  } catch (err) {
    console.error("Error marking notification read:", err);
  }
}

async function addSecondAgentToLead({ leadId, agent, user }) {
  const ref = doc(db, "leads", leadId);

  const agentObj = {
    id: agent.id,
    name: agent.fullName || agent.name || agent.email,
    email: agent.email || null,
  };

  await updateDoc(ref, {
    assignedAgents: arrayUnion(agentObj),
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
}
async function handleEmailDigestForAgent(agentRow) {
  const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

  if (!agentRow?.email) {
    alert("No agent email on file for this agent.");
    return;
  }

  const all = Array.isArray(leads) ? leads : [];

  const agentIds = new Set(
    [agentRow.id, agentRow.uid].filter(Boolean).map((v) => String(v))
  );

  const agentEmail = normEmail(agentRow.email || "");
  const agentNameNorm = normName(String(agentRow.name || "").replace(/\s\*$/, ""));

  const leadMatchesAgent = (l) => {
    if (!l) return false;

    // ---------- Registered matching ----------
    if (!agentRow.isPlaceholder) {
      // primary id
      if (l.assignedAgentId && agentIds.has(String(l.assignedAgentId))) return true;

      // secondary ids
      if (Array.isArray(l.assignedAgentIds)) {
        if (l.assignedAgentIds.some((x) => agentIds.has(String(x)))) return true;
      }

      // secondary agent objects
      if (Array.isArray(l.assignedAgents)) {
        for (const a of l.assignedAgents) {
          const aId = a?.id != null ? String(a.id) : "";
          const aUid = a?.uid != null ? String(a.uid) : "";
          if (aId && agentIds.has(aId)) return true;
          if (aUid && agentIds.has(aUid)) return true;

          const aEmail = normEmail(a?.email || "");
          const aEmailNorm = normEmail(a?.emailNorm || "");
          if (agentEmail && (aEmail === agentEmail || aEmailNorm === agentEmail)) return true;
        }
      }

      // secondary email norms array
      if (agentEmail && Array.isArray(l.assignedAgentEmailNorms)) {
        if (l.assignedAgentEmailNorms.map(normEmail).includes(agentEmail)) return true;
      }

      // fallback: primary email on lead
      const primaryEmail = normEmail(l.assignedAgentEmailNorm || l.assignedAgentEmail || "");
      if (agentEmail && primaryEmail === agentEmail) return true;

      return false;
    }

    // ---------- Placeholder matching ----------
    const leadEmail = normEmail(l.assignedAgentEmailNorm || l.assignedAgentEmail || "");
    const leadName = normName(String(l.assignedAgentNameNorm || l.assignedAgentName || "").replace(/\s\*$/, ""));

    if (agentEmail && leadEmail && leadEmail === agentEmail) return true;
    if (agentNameNorm && leadName && leadName === agentNameNorm) return true;

    return false;
  };

  const agentLeadsRaw = all.filter(leadMatchesAgent);

  // ✅ Dedup by id in case a lead matches multiple ways
  const agentLeads = Array.from(new Map(agentLeadsRaw.map((l) => [l.id, l])).values());

  // Debug line (keep temporarily)
  console.log("[digest] agent:", agentRow.name, agentRow.email, "matched leads:", agentLeads.map(l => l.id));

  const { subject, body, count } = await buildAgentDigestEmailAsync({
    agentName: agentRow.name,
    agentEmail: agentRow.email,
    leads: agentLeads,
    sinceMs,
  });

  if (count === 0) {
    const ok = window.confirm("No updates found in the last 7 days. Send anyway?");
    if (!ok) return;
  }

  emailAgentDigest({ toEmail: agentRow.email, subject, body });
}


async function handleDeleteUnregisteredAgent(agentRow) {
  const display = agentRow?.name || "Unregistered agent";

  const targetEmail = normEmail(agentRow?.email || "");
  const targetName = normName(String(display).replace(/\s*\*$/, ""));

  const msg =
    `Delete "${display}"?\n\n` +
    `This will:\n` +
    `• Unassign any leads matching this unregistered agent (by email/name)\n` +
    `• Delete ALL duplicate unregisteredAgents docs that match (by email/name)\n\n` +
    `OK = Continue\nCancel = Do nothing`;

  const confirmed = window.confirm(msg);
  if (!confirmed) return;

  try {
    const batch = writeBatch(db);

    // -------- 1) Unassign matching leads (email-first, then name) --------
    const affected = (Array.isArray(leads) ? leads : []).filter((l) => {
      if (l.assignedAgentId) return false; // only "unregistered-style" leads

      const leadEmail = normEmail(l.assignedAgentEmailNorm || l.assignedAgentEmail || "");
      const leadName = normName(String(l.assignedAgentName || "").replace(/\s*\*$/, ""));

      if (targetEmail && leadEmail && leadEmail === targetEmail) return true;
      if (!targetEmail && targetName && leadName && leadName === targetName) return true;

      // (optional safety) if your lead stores unregistered agents in assignedAgents array
      if (Array.isArray(l.assignedAgents) && l.assignedAgents.length > 0) {
        return l.assignedAgents.some((a) => {
          const aEmail = normEmail(a?.emailNorm || a?.email || "");
          const aName = normName(String(a?.name || "").replace(/\s*\*$/, ""));
          if (targetEmail && aEmail && aEmail === targetEmail) return true;
          if (!targetEmail && targetName && aName && aName === targetName) return true;
          return false;
        });
      }

      return false;
    });

    affected.forEach((l) => {
      const ref = doc(db, "leads", l.id);
      const text = `Admin deleted unregistered agent "${display}" and unassigned this lead.`;

      batch.update(ref, {
        assignedAgentId: null,
        assignedAgentName: null,
        assignedAgentEmail: null,
        assignedAgentEmailNorm: null,
        // also clear arrays if you use them for unregistered assignments
        assignedAgentEmailNorms: [],
        assignedAgents: [],
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        ...adminActivityPatch(text),
        journalLastEntry: text,
        journal: arrayUnion({
          id: crypto.randomUUID(),
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          createdByEmail: user.email,
          text,
          type: "unregistered-agent-deleted",
        }),
      });
    });

    // -------- 2) Delete ALL matching unregisteredAgents docs --------
    // NOTE: We don't assume your unregisteredAgents docs have emailNorm fields, so we scan client-side.
    const snap = await getDocs(collection(db, "unregisteredAgents"));

    const docsToDelete = snap.docs.filter((d) => {
      const data = d.data() || {};
      const dEmail = normEmail(data.email || data.emailNorm || "");
      const dName = normName(String(data.name || "").replace(/\s*\*$/, ""));

      if (targetEmail) return dEmail && dEmail === targetEmail;
      return targetName && dName && dName === targetName;
    });

    docsToDelete.forEach((d) => batch.delete(doc(db, "unregisteredAgents", d.id)));

    // Also delete the specific doc id if agentRow.id is "unreg:<docId>"
    // (in case your UI row points to a real doc)
    const rawId = String(agentRow?.id || "");
    if (rawId.startsWith("unreg:")) {
      const realDocId = rawId.slice("unreg:".length);
      if (realDocId) batch.delete(doc(db, "unregisteredAgents", realDocId));
    }

    await batch.commit();

    alert(
      `Deleted "${display}".\n` +
        `Unassigned ${affected.length} lead(s).\n` +
        `Deleted ${docsToDelete.length} unregisteredAgents doc(s).`
    );
  } catch (err) {
    console.error("Delete unregistered agent error:", err);
    alert("Error deleting unregistered agent. Check console.");
  }
}


async function handleMarkNotificationsRead() {
  const unread = notifications.filter((n) => !n.isRead);
  if (!unread.length) return;

  try {
    const batch = writeBatch(db);
    unread.forEach((n) => {
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
  console.log("[openAgentLeads] clicked:", agentRow);
  const nameNorm = normName(String(agentRow.name || "").replace(/\s\*$/, ""));
  const emailN = normEmail(agentRow.email || "");

  const key = agentRow.isPlaceholder ? `unreg:${nameNorm}` : `reg:${agentRow.id}`;

  setAgentLeadsTarget({
    id: agentRow.id || "",                 // keep whatever you have
    uid: agentRow.uid || agentRow.id || "",// ✅ uid fallback
    key,
    name: agentRow.name,
    email: agentRow.email || "",
    isPlaceholder: !!agentRow.isPlaceholder,
  });

  setAgentLeadsOpen(true);
}

function openSnapshotModal(type) {
  const rows = (leads || []).filter((l) => {
    const level =
      Number(l.schedulingPriorityLevel || l.levelOfUrgency) ||
      calculateUrgencyLevelFromDueDate(l.nextEvaluationDate);

    switch (type) {
      case "total":
        return true;

      case "unassigned":
        return !l.assignedAgentName && !l.assignedAgentId;

      case "overdue": {
        const ms = toMillis(l.nextEvaluationDate);
        return ms && ms < Date.now();
      }

      case "dueNext7": {
        const ms = toMillis(l.nextEvaluationDate);
        if (!ms) return false;

        const now = new Date();
        const today = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        ).getTime();

        const end = new Date(now);
        end.setDate(end.getDate() + 7);
        end.setHours(23, 59, 59, 999);

        return ms >= today && ms <= end.getTime();
      }

      case "hot":
        return l.relationshipRanking === "78" || l.relationshipRanking === "100";

      case "priority4":
        return level === 4;

      case "priority3":
        return level === 3;

      case "priority2":
        return level === 2;

      case "priority1":
        return level === 1;

      default:
        return false;
    }
  });

  let title = "Lead Snapshot";
  if (type === "total") title = "All Leads";
  if (type === "unassigned") title = "Unassigned Leads";
  if (type === "overdue") title = "Overdue Leads";
  if (type === "dueNext7") title = "Leads Due in the Next 7 Days";
  if (type === "hot") title = "Hot Leads";
  if (type === "priority4") title = "Level 4 Leads";
  if (type === "priority3") title = "Level 3 Leads";
  if (type === "priority2") title = "Level 2 Leads";
  if (type === "priority1") title = "Level 1 Leads";

  setSnapshotModal({
    open: true,
    title,
    rows: [...rows].sort((a, b) => {
      const aName = `${a.firstName || ""} ${a.lastName || ""}`.trim();
      const bName = `${b.firstName || ""} ${b.lastName || ""}`.trim();
      return aName.localeCompare(bName);
    }),
  });
}

function closeSnapshotDrawer() {
  setSnapshotClosing(true);

  setTimeout(() => {
    setSnapshotModal({ open: false, title: "", rows: [] });
    setSnapshotClosing(false);
  }, 250);
}
// function getLeadActivityMs(lead) {
//   // 1) explicit activity timestamp
//   const a = toMillis(lead.latestActivityAt);
//   if (a) return a;

//   // 2) latest journal entry
//   let latest = 0;
//   if (Array.isArray(lead.journal)) {
//     for (const entry of lead.journal) {
//       const ts = toMillis(entry?.createdAt);
//       if (ts > latest) latest = ts;
//     }
//   }
//   if (latest) return latest;

//   // 3) fallbacks
//   return toMillis(lead.updatedAt) || toMillis(lead.createdAt) || 0;
// }

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
    const q = query(collection(db, "leads"), orderBy("createdAt", "desc"), limit(500));

    const unsub = onSnapshot(
      q,
      (snap) => {
      const items = snap.docs.map((docSnap) => ({
  ...docSnap.data(),
  id: docSnap.id, // ✅ must be LAST so it wins
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
const lastNotifiedByLeadRef = React.useRef({});

useEffect(() => {
  if (!user) return;

  const q = query(collection(db, "leads"), orderBy("updatedAt", "desc"), limit(50));

  const unsub = onSnapshot(
    q,
    async (snap) => {
      for (const ch of snap.docChanges()) {
        if (ch.type !== "modified") continue;

        const data = ch.doc.data();
        const leadId = ch.doc.id;

        // ✅ prefer latestActivityAt, fallback to updatedAt
        const updatedMs =
          (data.latestActivityAt?.toMillis?.() ? data.latestActivityAt.toMillis() : 0) ||
          (data.updatedAt?.toMillis?.() ? data.updatedAt.toMillis() : 0) ||
          0;

        if (!updatedMs) continue;

        const last = lastNotifiedByLeadRef.current[leadId] || 0;
        if (updatedMs <= last) continue;

        lastNotifiedByLeadRef.current[leadId] = updatedMs;

        await createAdminNotificationFromLead({ id: leadId, ...data });
      }
    },
    (err) => console.error("Lead update watcher error:", err)
  );

  return () => unsub();
}, [user]);


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

  ...adminActivityPatch(text),

  journalLastEntry: text,
  journal: arrayUnion({
    id: crypto.randomUUID(),
    createdAt: serverTimestamp(),
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
async function createAdminNotificationFromLead(leadDoc) {
  try {
    const leadId = leadDoc?.id;
    if (!leadId) return;

    const leadName =
      `${leadDoc.firstName || ""} ${leadDoc.lastName || ""}`.trim() || "(No name)";

    const latest =
      leadDoc.latestActivityAdmin ||
      leadDoc.latestActivity ||
      leadDoc.journalLastEntry ||
      "Lead updated";

    // ✅ event timestamp: when the change happened (not when notif doc was written)
    const eventMs =
      (leadDoc.latestActivityAt?.toMillis?.() ? leadDoc.latestActivityAt.toMillis() : 0) ||
      (leadDoc.updatedAt?.toMillis?.() ? leadDoc.updatedAt.toMillis() : 0) ||
      0;

    if (!eventMs) return;

    // ✅ idempotent notif id prevents duplicates
    const notifId = `${leadId}_${eventMs}`;

    await setDoc(
      doc(db, "adminNotifications", notifId),
      {
        leadId,
        leadName,
        latestActivity: latest,

        updatedByName:
          leadDoc.updatedByName ||
          leadDoc.updatedByEmail ||
          user?.email ||
          "Admin",
        updatedBy: leadDoc.updatedBy || null,

        // timestamps
        eventAtMs: eventMs,          // when the lead actually changed
        createdAt: serverTimestamp(),// when the notif record was written

        isRead: false,
      },
      { merge: true } // safe upsert
    );
  } catch (err) {
    console.error("Error creating admin notification:", err);
  }
}



  // ---------- New lead creation ----------

  async function handleCreateLead(formData) {
    setSaving(true);
    try {
      const {
        firstAttemptDate,
        nextEvaluationDate,
        journalNote,
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

        journalLastEntry: journalNote || "",
        journal: journalNote
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

   status: rest.status || "Identified",
leadType: rest.leadType || "buyer",
source: rest.source || "other",
level: rest.level || "1",
schedulingPriorityLevel: Number(rest.schedulingPriorityLevel) || 1,

        createdAt: serverTimestamp(),
        createdBy: user.uid,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,

        latestActivityAdmin: activityWithAssignment,
latestActivity: activityWithAssignment,
latestActivityAt: serverTimestamp(),
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
  assignedAgentId,
  assignedAgentName,
  assignedAgentEmail,
  assignedAgentIds: assignedAgentId ? arrayUnion(assignedAgentId) : [], 
  assignedAgentNameNorm: normName(assignedAgentName || ""),
  assignedAgentEmailNorm: normEmail(assignedAgentEmail || ""),
  updatedAt: serverTimestamp(),
  updatedBy: user.uid,

  ...adminActivityPatch(text),

  journalLastEntry: text,
  journal: arrayUnion({
    id: crypto.randomUUID(),
    createdAt: serverTimestamp(),
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

async function handleCopyAgentLink(lead) {
  try {
    const url = await createAgentOnlyLinkForLead(lead);

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    alert(`Agent-only link copied:\n\n${url}`);
  } catch (err) {
    console.error("createAgentOnlyLinkForLead error:", err);
    alert(err.message || "Could not create agent-only link.");
  }
}

function leadsForAgent(agentRow, allLeads) {
  const rows = Array.isArray(allLeads) ? allLeads : [];
  if (!agentRow) return [];

  const ids = new Set(
    [agentRow.id, agentRow.uid]
      .filter(Boolean)
      .map((v) => String(v))
  );

  const email = normEmail(agentRow.email || "");
  const nameNorm = normName(String(agentRow.name || "").replace(/\s\*$/, ""));

  return rows.filter((l) => {
    // ---------------------------
    // Registered agent matching
    // ---------------------------
    if (!agentRow.isPlaceholder) {
      // primary id
      if (l.assignedAgentId && ids.has(String(l.assignedAgentId))) return true;

      // secondary ids array
      if (Array.isArray(l.assignedAgentIds)) {
        if (l.assignedAgentIds.some((x) => ids.has(String(x)))) return true;
      }

      // secondary agents objects (support both id + uid, plus email/emailNorm)
      if (Array.isArray(l.assignedAgents)) {
        for (const a of l.assignedAgents) {
          const aId = a?.id != null ? String(a.id) : "";
          const aUid = a?.uid != null ? String(a.uid) : "";
          if (aId && ids.has(aId)) return true;
          if (aUid && ids.has(aUid)) return true;

          const aEmail = normEmail(a?.email || "");
          const aEmailNorm = normEmail(a?.emailNorm || "");
          if (email && (aEmail === email || aEmailNorm === email)) return true;
        }
      }

      // secondary email norms array
      if (email && Array.isArray(l.assignedAgentEmailNorms)) {
        if (l.assignedAgentEmailNorms.map(normEmail).includes(email)) return true;
      }

      // fallback: primary email on lead
      const primaryEmail = normEmail(l.assignedAgentEmailNorm || l.assignedAgentEmail || "");
      if (email && primaryEmail && primaryEmail === email) return true;

      return false;
    }

    // ---------------------------
    // Placeholder matching
    // ---------------------------
    const leadEmail = normEmail(l.assignedAgentEmailNorm || l.assignedAgentEmail || "");
    const leadName = normName(
      String(l.assignedAgentNameNorm || l.assignedAgentName || "").replace(/\s\*$/, "")
    );

    if (email && leadEmail && leadEmail === email) return true;
    if (nameNorm && leadName && leadName === nameNorm) return true;

    return false;
  });
}






async function handleEmailDigestForAgent(agentRow) {
  const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const agentLeads = leadsForAgent(agentRow, leads); // ✅ includes secondary

  if (!agentRow.email) {
    alert("No agent email on file for this agent.");
    return;
  }

  const { subject, body, count } = await buildAgentDigestEmailAsync({
    agentName: agentRow.name,
    agentEmail: agentRow.email,
    leads: agentLeads,
    sinceMs,
  });

  if (count === 0) {
    const ok = window.confirm("No updates found in the last 7 days. Send anyway?");
    if (!ok) return;
  }

  emailAgentDigest({ toEmail: agentRow.email, subject, body });
}


async function handleEmailAgent(lead) {
  if (!lead.assignedAgentEmail) {
    alert("No agent email on this lead.");
    return;
  }

  try {
    const agentUrl = await createAgentOnlyLinkForLead(lead);
    setEmailLead({ ...lead, agentUrl }); // pass the token url into the modal
  } catch (err) {
    console.error("Email link create error:", err);
    alert(err.message || "Could not create agent-only link for email.");
  }
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

function calculateUrgencyLevelFromDueDate(value) {
  if (!value) return 1;

  let dueMs = 0;

  if (value?.toMillis) dueMs = value.toMillis();
  else if (value instanceof Date) dueMs = value.getTime();
  else {
    const parsed = new Date(value).getTime();
    dueMs = Number.isNaN(parsed) ? 0 : parsed;
  }

  if (!dueMs) return 1;

  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();

  const diffDays = Math.floor((dueMs - todayStart) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 4;
  if (diffDays <= 1) return 3;
  if (diffDays <= 2) return 2;
  return 1;
}

  
    const dashboardStats = React.useMemo(() => {
    const all = Array.isArray(leads) ? leads : [];

    const priorityCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };

for (const l of all) {
  const level =
    Number(l.schedulingPriorityLevel || l.levelOfUrgency) ||
    calculateUrgencyLevelFromDueDate(l.nextEvaluationDate);

  priorityCounts[level] = (priorityCounts[level] || 0) + 1;
}
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

    return { total, unassigned, hot, overdue, dueNext7, priorityCounts };
  }, [leads]);

  // ---------- Agent stats ----------

const agentStats = React.useMemo(() => {
  if (!Array.isArray(assignableAgents)) return [];

  const registeredCounts = {};   // by uid
  const unregisteredCounts = {}; // by unregKey

    const nameToEmail = new Map();

  assignableAgents
    .filter((a) => a.isPlaceholder)
    .forEach((a) => {
      const n = normName(String(a.name || "").replace(/\s*\*$/, ""));
      const e = normEmail(a.email || "");
      if (n && e) nameToEmail.set(n, e);
    });

  (Array.isArray(leads) ? leads : []).forEach((lead) => {
    const n = normName(String(lead.assignedAgentName || "").replace(/\s*\*$/, ""));
    const e = normEmail(lead.assignedAgentEmailNorm || lead.assignedAgentEmail || "");
    if (n && e && !nameToEmail.has(n)) nameToEmail.set(n, e);
  });
// ✅ Build a name->email map so name-only leads collapse into email-key
// const nameToEmail = new Map();

// // 1) From placeholders (unregistered agents)
// assignableAgents
//   .filter((a) => a.isPlaceholder)
//   .forEach((a) => {
//     const n = normName(String(a.name || "").replace(/\s*\*$/, ""));
//     const e = normEmail(a.email || "");
//     if (n && e) nameToEmail.set(n, e);
//   });

// // 2) From leads (when both exist)
// (Array.isArray(leads) ? leads : []).forEach((lead) => {
//   const n = normName(String(lead.assignedAgentName || "").replace(/\s*\*$/, ""));
//   const e = normEmail(lead.assignedAgentEmailNorm || lead.assignedAgentEmail || "");
//   if (n && e && !nameToEmail.has(n)) nameToEmail.set(n, e);
// });

// 3) Count leads
// (Array.isArray(leads) ? leads : []).forEach((lead) => {
//   const isHot = lead.relationshipRanking === "78" || lead.relationshipRanking === "100";

//   const idsFromArray = Array.isArray(lead.assignedAgentIds) ? lead.assignedAgentIds.filter(Boolean) : [];
//   const idsFromObjects = Array.isArray(lead.assignedAgents) ? lead.assignedAgents.map((a) => a?.id).filter(Boolean) : [];
//   const primaryId = lead.assignedAgentId ? [lead.assignedAgentId] : [];
//   const registeredIds = Array.from(new Set([...idsFromArray, ...idsFromObjects, ...primaryId]));

//   // registered counts
//   if (registeredIds.length > 0) {
//     registeredIds.forEach((id) => {
//       const k = String(id);
//       if (!registeredCounts[k]) registeredCounts[k] = { total: 0, hot: 0 };
//       registeredCounts[k].total += 1;
//       if (isHot) registeredCounts[k].hot += 1;
//     });
//     return;
//   }

//   // ✅ unregistered counts (email-first; name-only uses nameToEmail map)
//   const emailNorm = normEmail(lead.assignedAgentEmailNorm || lead.assignedAgentEmail || "");
//   const nameNorm = normName(String(lead.assignedAgentName || "").replace(/\s*\*$/, ""));

//   let key = "";
//   if (emailNorm) {
//     key = `unregEmail:${emailNorm}`;
//   } else if (nameNorm) {
//     const mappedEmail = nameToEmail.get(nameNorm);
//     key = mappedEmail ? `unregEmail:${mappedEmail}` : `unregName:${nameNorm}`;
//   } else {
//     return;
//   }

//   if (!unregisteredCounts[key]) unregisteredCounts[key] = { total: 0, hot: 0 };
//   unregisteredCounts[key].total += 1;
//   if (isHot) unregisteredCounts[key].hot += 1;
// });

  const stats = [];

  function unregKeyFromEmailOrName(email, name) {
    const e = normEmail(email || "");
    if (e) return `unregEmail:${e}`;
    const n = normName(String(name || "").replace(/\s*\*$/, ""));
    if (n) return `unregName:${n}`;
    return "";
  }

  // 1) Count leads
  (Array.isArray(leads) ? leads : []).forEach((lead) => {
    const isHot = lead.relationshipRanking === "78" || lead.relationshipRanking === "100";

    const idsFromArray = Array.isArray(lead.assignedAgentIds)
      ? lead.assignedAgentIds.filter(Boolean)
      : [];

    const idsFromObjects = Array.isArray(lead.assignedAgents)
      ? lead.assignedAgents.map((a) => a?.id).filter(Boolean)
      : [];

    const primaryId = lead.assignedAgentId ? [lead.assignedAgentId] : [];

    const registeredIds = Array.from(new Set([...idsFromArray, ...idsFromObjects, ...primaryId]));

    // ✅ registered counts
    if (registeredIds.length > 0) {
      registeredIds.forEach((id) => {
        const k = String(id);
        if (!registeredCounts[k]) registeredCounts[k] = { total: 0, hot: 0 };
        registeredCounts[k].total += 1;
        if (isHot) registeredCounts[k].hot += 1;
      });
      // IMPORTANT: do NOT return here if you also want to count unregistered secondary agents
      // If your rule is: "if lead has any registered agent, skip unregistered counting", keep the return.
      return;
    }

    // ✅ unregistered: count by lead primary email/name
// ✅ unregistered: email-first, else name->email collapse
const emailNorm = normEmail(lead.assignedAgentEmailNorm || lead.assignedAgentEmail || "");
const nameNorm = normName(String(lead.assignedAgentName || "").replace(/\s*\*$/, ""));

let key = "";
if (emailNorm) {
  key = `unregEmail:${emailNorm}`;
} else if (nameNorm) {
  const mapped = nameToEmail.get(nameNorm);
  key = mapped ? `unregEmail:${mapped}` : `unregName:${nameNorm}`;
} else {
  return;
}

if (!unregisteredCounts[key]) unregisteredCounts[key] = { total: 0, hot: 0 };
unregisteredCounts[key].total += 1;
if (isHot) unregisteredCounts[key].hot += 1;

    if (!key) return;

    if (!unregisteredCounts[key]) unregisteredCounts[key] = { total: 0, hot: 0 };
    unregisteredCounts[key].total += 1;
    if (isHot) unregisteredCounts[key].hot += 1;
  });

  // helper: derive email for unregistered NAME key (only used when we have no email)
  function findEmailForNameKey(nameKeyOnly) {
    const target = `unregName:${nameKeyOnly}`;
    const match = (Array.isArray(leads) ? leads : []).find((l) => {
      const key = unregKeyFromEmailOrName(l.assignedAgentEmailNorm || l.assignedAgentEmail, l.assignedAgentName);
      return key === target && (l.assignedAgentEmailNorm || l.assignedAgentEmail);
    });
    return match ? (match.assignedAgentEmailNorm || match.assignedAgentEmail) : "";
  }

  // 2) Registered agents
  assignableAgents
    .filter((a) => !a.isPlaceholder)
    .forEach((a) => {
      const uid = String(a.id || a.uid || "");
      const st = registeredCounts[uid] || { total: 0, hot: 0 };

      stats.push({
        id: uid,
        uid,
        name: a.fullName || a.name || a.email || "Unknown",
        email: a.email || "",
        total: st.total,
        hot: st.hot,
        isPlaceholder: false,
      });
    });

  // 3) Unregistered placeholders from collection
  assignableAgents
    .filter((a) => a.isPlaceholder)
    .forEach((a) => {
      const key = unregKeyFromEmailOrName(a.email, a.name);
      if (!key) return;

      const st = unregisteredCounts[key] || { total: 0, hot: 0 };

      // if placeholder has no email, and key is name-based, try derive an email from leads
      const nameKeyOnly = normName(String(a.name || "").replace(/\s*\*$/, ""));
      const derivedEmail = !a.email && key.startsWith("unregName:") ? findEmailForNameKey(nameKeyOnly) : "";
      const email = a.email || derivedEmail || "";

      stats.push({
        id: a.id,     // keep original doc id for delete button
        uid: a.id,
        name: a.name || "Unregistered",
        email,
        total: st.total,
        hot: st.hot,
        isPlaceholder: true,
      });
    });

  // 4) Any unregistered keys that exist only on leads (not in placeholders)
  Object.entries(unregisteredCounts).forEach(([key, st]) => {
    const exists = stats.some((r) => r.isPlaceholder && keyForAgentRow(r) === key);
    if (exists) return;

    if (key.startsWith("unregEmail:")) {
      const email = key.replace("unregEmail:", "");
      stats.push({
        id: `auto:${key}`,
        uid: `auto:${key}`,
        name: `${email} *`,
        email,
        total: st.total,
        hot: st.hot,
        isPlaceholder: true,
      });
      return;
    }

    if (key.startsWith("unregName:")) {
      const nameKeyOnly = key.replace("unregName:", "");
      const email = findEmailForNameKey(nameKeyOnly) || "";
      const displayName =
        nameKeyOnly
          .split(" ")
          .filter(Boolean)
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(" ")
          .trim() + " *";

      stats.push({
        id: `auto:${key}`,
        uid: `auto:${key}`,
        name: displayName,
        email,
        total: st.total,
        hot: st.hot,
        isPlaceholder: true,
      });
    }
  });

  // --- FINAL DEDUPE PASS ---
  const deduped = new Map();

  function keyForAgentRow(row) {
    if (!row) return "";
    if (row.isPlaceholder) {
      const e = normEmail(row.email || "");
      if (e) return `unregEmail:${e}`;
      const n = normName(String(row.name || "").replace(/\s*\*$/, ""));
      if (n) return `unregName:${n}`;
      return "";
    }
    return `reg:${String(row.id || row.uid || "")}`;
  }

  for (const row of stats) {
    const k = keyForAgentRow(row);
    if (!k) continue;

    const prev = deduped.get(k);
    if (!prev) {
      deduped.set(k, row);
      continue;
    }

    // merge counts (keep max instead of sum to avoid double-counting if two rows represent same agent)
    prev.total = Math.max(prev.total || 0, row.total || 0);
    prev.hot = Math.max(prev.hot || 0, row.hot || 0);

    // keep best display fields
    if (!prev.email && row.email) prev.email = row.email;
    if ((!prev.name || prev.name.includes("*")) && row.name && !row.name.includes("*")) prev.name = row.name;

    // keep the real placeholder doc id if one exists (so delete works)
    if (prev.isPlaceholder && row.isPlaceholder) {
      if (String(prev.id || "").startsWith("auto:") && row.id) prev.id = row.id;
    }
  }

  return Array.from(deduped.values()).sort((a, b) =>
    String(a.name || "").toLowerCase().localeCompare(String(b.name || "").toLowerCase())
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

    ...adminActivityPatch(text),

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

  function closeNewLeadPanel() {
  setShowNewClosing(true);

  setTimeout(() => {
    setShowNew(false);
    setShowNewClosing(false);
  }, 250);
}
  // ---------- Delete user (agent) ----------

async function handleDeleteUser(agent) {
  const uid = agent?.uid || agent?.id; // prefer uid if you store it

  if (!uid) {
    alert("Cannot delete: user UID missing.");
    return;
  }

  const msg = `Are you sure you want to delete this user?\n\n${
    agent.fullName || agent.email
  }\n\nThis will delete their Firebase Auth account and their Firestore profile (users/${uid}).\n\nLeads will NOT be deleted.`;

  if (!window.confirm(msg)) return;

  try {
    const result = await deleteUserByUid({ uid });

 if (result?.data?.success) {
  alert(`User deleted:\n${agent.fullName || agent.email}`);
}
else {
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

async function handleAssignAdd(agentId) {
  if (!assigningLead) return;

  const agent = assignableAgents?.find((a) => a.id === agentId);
  if (!agent) return alert("Agent not found.");

  // Don’t allow adding the primary as secondary
  if (assigningLead.assignedAgentId && assigningLead.assignedAgentId === agentId) {
    return alert("That agent is already the primary assignment.");
  }

  const agentObj = {
    id: agent.id,
    name: agent.fullName || agent.name || agent.email,
    email: agent.email || "",
    emailNorm: (agent.email || "").toLowerCase().trim(),
  };

  const ref = doc(db, "leads", assigningLead.id);

  const text = `Admin added ${agentObj.name} to this lead.`;

  try {
    setAssigning(true);

    // Read latest to prevent stale overwrite
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Lead not found.");

    const current = snap.data();
    const currentList = Array.isArray(current.assignedAgents) ? current.assignedAgents : [];
    const exists = currentList.some((a) => a.id === agentObj.id);

    if (exists) {
      alert("That agent is already assigned as an additional agent.");
      return;
    }

    const nextList = [...currentList, agentObj];

    await updateDoc(ref, {
      assignedAgents: nextList,
      assignedAgentIds: arrayUnion(agent.id),
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,

      ...adminActivityPatch(text, { email: user.email, name: user.email }),

      journalLastEntry: text,
      journal: arrayUnion({
        id: crypto.randomUUID(),
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdByEmail: user.email,
        text,
        type: "assignment-add",
      }),
    });

    // Update local modal state so UI reflects immediately
    setAssigningLead((prev) =>
      prev ? { ...prev, assignedAgents: nextList } : prev
    );
  } catch (err) {
    console.error("handleAssignAdd error:", err);
    alert(err.message || "Error adding agent.");
  } finally {
    setAssigning(false);
  }
}

async function handleAssignRemove(agentObj) {
  if (!assigningLead) return;

  const ref = doc(db, "leads", assigningLead.id);
  const text = `Admin removed ${agentObj.name || agentObj.email || "agent"} from this lead.`;

  try {
    setAssigning(true);

    // Read latest to prevent stale overwrite
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Lead not found.");

    const current = snap.data();
    const currentList = Array.isArray(current.assignedAgents) ? current.assignedAgents : [];
    const nextList = currentList.filter((a) => a.id !== agentObj.id);

    await updateDoc(ref, {
      assignedAgents: nextList,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,

      ...adminActivityPatch(text, { email: user.email, name: user.email }),

      journalLastEntry: text,
      journal: arrayUnion({
        id: crypto.randomUUID(),
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdByEmail: user.email,
        text,
        type: "assignment-remove",
      }),
    });

    // Update local modal state so UI reflects immediately
    setAssigningLead((prev) =>
      prev ? { ...prev, assignedAgents: nextList } : prev
    );
  } catch (err) {
    console.error("handleAssignRemove error:", err);
    alert(err.message || "Error removing agent.");
  } finally {
    setAssigning(false);
  }
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

// 🔑 build lookup of existing leads ONCE per upload
const existingById = new Map(
  (Array.isArray(leads) ? leads : [])
    .filter((l) => l?.id)
    .map((l) => [String(l.id), l])
);

// 🔁 build preview rows WITH diff metadata
const dataRows = rows.slice(1).map((cols, idx) => {
  const trimmedCols = cols.map((c) => (c ?? "").toString().trim());

  // light extraction (preview-only)
  const emailGuess =
    trimmedCols.find((c) => /@/.test(c)) || "";

  const phoneGuess =
    trimmedCols.find(
      (c) => c.replace(/\D/g, "").length >= 10
    ) || "";

  const leadId = buildLeadId({
    email: emailGuess,
    phone: phoneGuess,
  });

  const existing = leadId
    ? existingById.get(leadId)
    : null;

  const incomingComparable = {
    email: normEmailLocal(emailGuess),
    phone: normPhoneLocal(phoneGuess),
  };

  const existingComparable = existing
    ? {
        email: normEmailLocal(existing.email),
        phone: normPhoneLocal(existing.phone),
      }
    : null;

  const changedFields = existing
    ? shallowDiff(
        existingComparable,
        incomingComparable,
        ["email", "phone"]
      )
    : ["(new)"];

  const status = !leadId
    ? "no_id"
    : !existing
    ? "new"
    : changedFields.length
    ? "update"
    : "no_change";

  return {
    id: String(idx),      // checkbox id
    cols: trimmedCols,    // original row data
    leadId,               // email_ / phone_
    status,               // new | update | no_change | no_id
    changedFields,        // diff display
  };
});


      setCsvPreview({
        headers: rawHeaders,
        rows: dataRows,
      });

      setCsvSelectedRowIds(
  dataRows
    .filter((r) => r.status === "new" || r.status === "update")
    .map((r) => r.id)
);

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
          ...adminActivityPatch("Lead imported from CSV (selected row)."),

        };



        const emailNorm = (email || "").toLowerCase().trim();
const phoneNorm = (phone || "").replace(/[^\d]/g, "");

const leadId =
  emailNorm ? `email_${emailNorm}` :
  phoneNorm ? `phone_${phoneNorm}` :
  null;

if (!leadId) {
  // last resort: no stable identifier → still create new doc
  await addDoc(collection(db, "leads"), payload);
} else {
  await setDoc(doc(db, "leads", leadId), payload, { merge: true });
}

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
  <div className="min-h-screen bg-[var(--color-wrcGray)] flex flex-col">
<header className="bg-white border-b border-gray-200">
  <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-xl bg-[#fff200] border border-black/10" />
      <div>
        <div className="text-xs text-gray-500">Weichert Realtors Cornerstone</div>
        <div className="text-lg font-extrabold text-[var(--color-wrcBlack)]">
          WRC Leads — Admin
        </div>
      </div>
    </div>

    <div className="flex items-center gap-4">
      <div className="text-right">
        <div className="text-sm font-semibold text-[var(--color-wrcBlack)]">
          {user?.displayName || "Admin"}
        </div>
        <div className="text-xs text-gray-500">{user?.email}</div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowNew(true)}
         className="px-4 py-2 rounded-md bg-black text-[#fff200] text-sm font-extrabold hover:opacity-90"
        >
          + Add Lead
        </button>

   <button
  type="button"
  onClick={() => navigate("/admin/agents")}
  className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-semibold hover:bg-gray-50"
>
  Agent Summary
</button>

<button
  type="button"
  onClick={async () => {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Logout failed:", err);
      alert("There was a problem logging out.");
    }
  }}
  className="px-4 py-2 rounded-md bg-black text-white font-semibold hover:opacity-90"
>
  Logout
</button>
      </div>
    </div>
  </div>

  <div className="h-2 bg-[#fff200]" />
</header>

   <main className="w-full max-w-[1400px] mx-auto px-6 py-6 flex flex-col gap-6 flex-1 min-h-0 text-sm">
    <section className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
  <div className="flex items-center justify-between gap-3">
    <div>
      <h3 className="text-lg font-bold text-[var(--color-wrcBlack)]">
        Lead Snapshot
      </h3>
      <div className="text-sm text-gray-500">
        Overview of current lead activity and pipeline.
      </div>
    </div>
  </div>

  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
 <button
  type="button"
  onClick={() => openSnapshotModal("total")}
  className="rounded-xl border border-gray-200 p-4 text-left hover:bg-gray-50"
>
  <div className="text-xs font-bold tracking-wide text-gray-600 uppercase">
    Total leads
  </div>
  <div className="mt-1 text-3xl font-extrabold text-[var(--color-wrcBlack)]">
    {dashboardStats.total}
  </div>
</button>

<button
  type="button"
  onClick={() => openSnapshotModal("unassigned")}
  className="rounded-xl border border-gray-200 p-4 text-left hover:bg-gray-50"
>
  <div className="text-xs font-bold tracking-wide text-gray-600 uppercase">
    Unassigned
  </div>
  <div className="mt-1 text-3xl font-extrabold text-gray-700">
    {dashboardStats.unassigned}
  </div>
</button>

<button
  type="button"
  onClick={() => openSnapshotModal("overdue")}
  className="rounded-xl border border-gray-200 p-4 text-left hover:bg-gray-50"
>
  <div className="text-xs font-bold tracking-wide text-gray-600 uppercase">
    Overdue
  </div>
  <div className="mt-1 text-3xl font-extrabold text-red-700">
    {dashboardStats.overdue}
  </div>
</button>

<button
  type="button"
  onClick={() => openSnapshotModal("dueNext7")}
  className="rounded-xl border border-gray-200 p-4 text-left hover:bg-gray-50"
>
  <div className="text-xs font-bold tracking-wide text-gray-600 uppercase">
    Due next 7 days
  </div>
  <div className="mt-1 text-3xl font-extrabold text-[var(--color-wrcBlack)]">
    {dashboardStats.dueNext7}
  </div>
</button>

  <button
  type="button"
  onClick={() => openSnapshotModal("hot")}
  className="rounded-xl border border-gray-200 p-4 text-left hover:bg-gray-50"
>
  <div className="text-xs font-bold tracking-wide text-gray-600 uppercase">
    Hot leads
  </div>
  <div className="mt-1 text-3xl font-extrabold text-[var(--color-wrcBlack)]">
    {dashboardStats.hot}
  </div>
  <div className="mt-1 text-xs text-gray-500">
    Relationship 78% or 100%
  </div>
</button>
  </div>

  <div className="mt-6">
    <div className="text-xs font-bold tracking-wide text-gray-600 uppercase">
      Quick actions
    </div>

    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        disabled={importing}
        onClick={() => fileInputRef.current?.click()}
        className="px-3 py-2 rounded-full border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-800 hover:bg-gray-100"
      >
        {importing ? "Importing..." : "Import CSV"}
      </button>

      <div className="inline-block">
        <VleadsImportButton actor={{ uid: user?.uid, email: user?.email }} />
      </div>

      <button
        type="button"
        onClick={handleExportCsv}
        className="px-3 py-2 rounded-full border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-800 hover:bg-gray-100"
      >
        Export CSV
      </button>

      <button
        type="button"
        onClick={() => setFiltersOpen((v) => !v)}
        className="px-3 py-2 rounded-full border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-800 hover:bg-gray-100"
      >
        {filtersOpen ? "Hide filters" : "Show filters"}
      </button>

      <button
        type="button"
        onClick={() => setShowNew(true)}
        className="px-3 py-2 rounded-full border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-800 hover:bg-gray-100"
      >
        + New lead
      </button>
    </div>
  </div>

  {filtersOpen && (
    <div className="mt-6">
      <div className="text-xs font-bold tracking-wide text-gray-600 uppercase">
        Filter breakdown
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
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

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, phone, status, source..."
          className="border border-gray-300 rounded-xl px-3 py-2 text-xs bg-white min-w-[260px]"
        />

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
    </div>
  )}
</section>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleCsvFileChange}
        />

        {/* Import + Scheduling Priority Row */}
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 bg-white rounded-2xl shadow-lg p-6 border-t-4 border-[var(--color-wrcYellowUI)]">
            <h3 className="text-lg font-bold text-[var(--color-wrcBlack)]">
              Import Leads
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Upload a CSV file or import VLeads to add or update lead records.
            </p>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
              <button
                type="button"
                disabled={importing}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md cursor-pointer bg-[#fff200] text-[var(--color-wrcBlack)] font-extrabold border border-black/20 hover:brightness-95 w-full md:w-auto disabled:opacity-60"
              >
                📂 Choose CSV
              </button>

              <div className="flex-1">
                <div className="px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-700 truncate">
                  {importing ? "Import in progress..." : "Choose a CSV file to begin import"}
                </div>
              </div>

              <div className="w-full md:w-auto">
                <VleadsImportButton actor={{ uid: user?.uid, email: user?.email }} />
              </div>
            </div>

            <div className="mt-3 text-xs text-gray-500">
              Supported imports include CSV lead files and VLeads Excel exports.
            </div>
          </section>
<section className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
  <div>
    <h3 className="text-lg font-bold text-[var(--color-wrcBlack)]">
      Scheduling Priority Snapshot
    </h3>
    <p className="mt-1 text-sm text-gray-600">
      Current lead counts by Scheduling Priority Level.
    </p>
  </div>

  <div className="mt-4 space-y-3">
    <button
      type="button"
      onClick={() => openSnapshotModal("priority4")}
      className="w-full rounded-xl border border-red-200 bg-red-50 p-4 text-left hover:bg-red-100"
    >
      <div className="text-xs font-bold tracking-wide text-red-700 uppercase">
        Level 4
      </div>
      <div className="mt-1 text-3xl font-extrabold text-red-700">
        {dashboardStats.priorityCounts[4] || 0}
      </div>
      <div className="mt-1 text-xs text-red-700">
        Must be contacted that day
      </div>
    </button>

    <button
      type="button"
      onClick={() => openSnapshotModal("priority3")}
      className="w-full rounded-xl border border-orange-200 bg-orange-50 p-4 text-left hover:bg-orange-100"
    >
      <div className="text-xs font-bold tracking-wide text-orange-700 uppercase">
        Level 3
      </div>
      <div className="mt-1 text-3xl font-extrabold text-orange-700">
        {dashboardStats.priorityCounts[3] || 0}
      </div>
      <div className="mt-1 text-xs text-orange-700">
        Must be contacted from -1 day to +1 day
      </div>
    </button>

    <button
      type="button"
      onClick={() => openSnapshotModal("priority2")}
      className="w-full rounded-xl border border-blue-200 bg-blue-50 p-4 text-left hover:bg-blue-100"
    >
      <div className="text-xs font-bold tracking-wide text-blue-700 uppercase">
        Level 2
      </div>
      <div className="mt-1 text-3xl font-extrabold text-blue-700">
        {dashboardStats.priorityCounts[2] || 0}
      </div>
      <div className="mt-1 text-xs text-blue-700">
        Must be contacted from -1 day to +2 days
      </div>
    </button>

    <button
      type="button"
      onClick={() => openSnapshotModal("priority1")}
      className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-left hover:bg-gray-100"
    >
      <div className="text-xs font-bold tracking-wide text-gray-700 uppercase">
        Level 1
      </div>
      <div className="mt-1 text-3xl font-extrabold text-gray-700">
        {dashboardStats.priorityCounts[1] || 0}
      </div>
      <div className="mt-1 text-xs text-gray-700">
        Can be contacted from -1 day to +3 days
      </div>
    </button>
  </div>
</section>
        </div>

        {/* Notifications / Alerts */}
        <section className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[var(--color-wrcBlack)]">
                Alerts
              </h3>
              <p className="text-sm text-gray-600">
                Lead updates and recent activity requiring attention.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowReadNotifs((v) => !v)}
                className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-semibold hover:bg-gray-50"
              >
                {showReadNotifs ? "Show unread only" : "Show read too"}
              </button>

              <button
                type="button"
                onClick={handleMarkNotificationsRead}
                className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-semibold hover:bg-gray-50"
              >
                Mark all read
              </button>
            </div>
          </div>

          <div className="mt-4">
            <div className="max-h-[320px] overflow-y-auto pr-1 space-y-3">
              {notifications.length === 0 ? (
                <div className="text-sm text-gray-500">No alerts yet.</div>
              ) : (
                visibleNotifications.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-xl border p-3 transition ${
                      n.isRead
                        ? "border-gray-200 bg-white opacity-70"
                        : "border-[var(--color-wrcYellowUI)] bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[var(--color-wrcBlack)]">
                          <span className="font-extrabold">{n.leadName}</span>
                          <span className="text-gray-500"> — </span>
                          {n.latestActivity || "Lead updated"}
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                          {n.updatedByName ? `${n.updatedByName} • ` : ""}
                          {formatWhenFromNotif(n) || ""}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleNotificationClick(n)}
                        className="px-3 py-1 rounded-md border border-gray-300 bg-white text-xs font-bold hover:bg-gray-50"
                      >
                        View lead
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>





        {/* Leads list card */}
        <div className="border border-gray-200 rounded-lg bg-white">
          {/* Bulk bar */}
          {selectedLeadIds.length > 0 && (
            <div className="px-3 py-2 border-b border-gray-200 bg-amber-50 flex flex-wrap items-center gap-3 text-[11px]">
              <span className="font-semibold text-amber-900">
                {selectedLeadIds.length} lead(s) selected
              </span>

              {Array.isArray(assignableAgents) &&
                assignableAgents.length > 0 && (
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
          <VirtualAdminLeadGrid
            leads={sortedLeads}
            loading={loading}
            dense={dense}
            selectedLeadIds={selectedLeadIds}
            onToggleSelectAll={toggleSelectAll}
            onToggleSelectOne={toggleSelectOne}
            isAllSelected={
              sortedLeads.length > 0 &&
              selectedLeadIds.length === sortedLeads.length
            }
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
            labels={{
              STATUS_LABELS,
              LEAD_TYPE_LABELS,
              RELATIONSHIP_LABELS,
              URGENCY_LABELS,
              SOURCE_LABELS,
            }}
            onOpenLead={(id) =>
  navigate(`/admin/lead/${encodeURIComponent(id)}`, {
    state: { backgroundLocation: location },
  })
}

          />
        </div>

        {/* New Lead Panel */}
        {showNew && (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={closeNewLeadPanel}
            />

            <div
              className={`absolute inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl border-l border-gray-200 flex flex-col ${
                showNewClosing
                  ? "animate-[slideOutRight_.25s_ease-in]"
                  : "animate-[slideInRight_.25s_ease-out]"
              }`}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <div>
                  <h3 className="text-xl font-extrabold text-[var(--color-wrcBlack)]">
                    Add Lead
                  </h3>
                  <p className="text-sm text-gray-500">
                    Quick create a new lead
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeNewLeadPanel}
                  className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-semibold hover:bg-gray-50"
                >
                  Close
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <LeadFormAdmin
  onSave={handleCreateLead}
  saving={saving}
  assignableAgents={assignableAgents}
  assignedAgentId={newLeadAssignedAgentId}
  onAssignedAgentChange={setNewLeadAssignedAgentId}
/>
              </div>
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
    onAssignAdd={handleAssignAdd}
    onAssignRemove={handleAssignRemove}
  />
)}


        {/* Agent Leads Modal */}
        {agentLeadsOpen && agentLeadsTarget && (
  <AgentLeadsModal
  target={agentLeadsTarget}
  leads={leads}
  leadsForAgent={leadsForAgent}
  onClose={() => {
    setAgentLeadsOpen(false);
    setAgentLeadsTarget(null);
  }}
  onOpenLead={(id) => navigate(`/admin/lead/${encodeURIComponent(id)}`)}
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

            const fullNameIdx = findIdx([
              "full name",
              "name",
              "fullname",
              "contact name",
            ]);
            const firstNameIdx = findIdx(["first name", "firstname", "first"]);
            const lastNameIdx = findIdx(["last name", "lastname", "last"]);

            const phoneIdx = findIdx([
              "phone",
              "phone number",
              "primary phone",
              "mobile",
              "cell",
              "cell phone",
              "home phone",
              "work phone",
              "phone (mobile)",
            ]);

            const emailIdx = findIdx([
              "email",
              "e-mail",
              "email address",
              "e-mail address",
              "email (personal)",
            ]);

            const sourceIdx = findIdx(["source", "lead source", "source name"]);

            const registrationIdx = findIdx([
              "registration date",
              "registered",
              "date registered",
              "reg date",
              "create date",
            ]);

            const notesIdx = findIdx([
              "agent notes",
              "agent note",
              "note",
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

                if (aReg < bReg) return csvSort.direction === "asc" ? -1 : 1;
                if (aReg > bReg) return csvSort.direction === "asc" ? 1 : -1;
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
                            className="px-2 py-1 text-left cursor-pointer select-none"
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
                {snapshotModal.open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeSnapshotDrawer}
          />

          <div
            className={`absolute inset-y-0 right-0 w-full max-w-4xl bg-white shadow-2xl border-l border-gray-200 flex flex-col ${
              snapshotClosing
                ? "animate-[slideOutRight_.25s_ease-in]"
                : "animate-[slideInRight_.25s_ease-out]"
            }`}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
              <div>
                <h3 className="text-xl font-extrabold text-[var(--color-wrcBlack)]">
                  {snapshotModal.title}
                </h3>
                <p className="text-sm text-gray-500">
                  {snapshotModal.rows.length} lead{snapshotModal.rows.length === 1 ? "" : "s"}
                </p>
              </div>

              <button
                type="button"
                onClick={closeSnapshotDrawer}
                className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-semibold hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              {snapshotModal.rows.length === 0 ? (
                <div className="p-6 text-sm text-gray-500">No leads found.</div>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-gray-100 z-10">
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Lead</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Relationship</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Urgency</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Assigned Agent</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Due Date</th>
                    </tr>
                  </thead>

                  <tbody>
                    {snapshotModal.rows.map((l) => (
                      <tr
                        key={l.id}
                        className="border-b border-gray-100 hover:bg-yellow-50 cursor-pointer"
                        onClick={() => navigate(`/admin/lead/${encodeURIComponent(l.id)}`)}
                      >
                        <td className="px-4 py-3 align-top">
                          <div className="text-sm font-semibold text-gray-900">
                            {`${l.firstName || ""} ${l.lastName || ""}`.trim() || l.email || l.id}
                          </div>
                          <div className="text-xs text-gray-500">{l.email || "—"}</div>
                        </td>

                        <td className="px-4 py-3 align-top text-sm text-gray-800">
                          {STATUS_LABELS[l.status] || l.status || "—"}
                        </td>

                        <td className="px-4 py-3 align-top text-sm text-gray-800">
                          {RELATIONSHIP_LABELS[l.relationshipRanking] || l.relationshipRanking || "—"}
                        </td>

                        <td className="px-4 py-3 align-top text-sm text-gray-800">
                          {URGENCY_LABELS[l.urgencyRanking] || l.urgencyRanking || "—"}
                        </td>

                        <td className="px-4 py-3 align-top text-sm text-gray-800">
                          {l.assignedAgentName || l.assignedAgentEmail || "—"}
                        </td>

                        <td className="px-4 py-3 align-top text-sm text-gray-800">
                          {formatDate(l.nextEvaluationDate) || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
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
  onOpenLead,
}) {
  const parentRef = React.useRef(null);

  const rowVirtualizer = useVirtualizer({
    count: leads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (dense ? 56 : 74),
    overscan: 12,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  // --- Column widths (tweak as needed) ---
  const COL = {
    check: 44,
    name: 300,
    contact: 240,
    status: 140,
    type: 110,
    rel: 150,
    urg: 140,
    source: 160,
    reg: 140,
    due: 140,
    agent: 220,
    action: 320,
    activity: 360,
    del: 110,
  };

  const gridTemplateColumns = Object.values(COL).map((w) => `${w}px`).join(" ");
  const MIN_TABLE_W = Object.values(COL).reduce((a, b) => a + b, 0);

  const LEFT = {
    check: 0,
    name: COL.check,
    contact: COL.check + COL.name,
  };

  const headerCell =
    `px-3 ${headerPad} text-[11px] uppercase tracking-wide text-gray-500 ` +
    `border-b border-gray-200 bg-gray-50`;

  const cell =
    `px-3 ${cellPad} text-[11px] border-b border-gray-100 bg-white`;

  const clamp2Style = () => ({
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  });

  const {
    STATUS_LABELS,
    LEAD_TYPE_LABELS,
    RELATIONSHIP_LABELS,
    URGENCY_LABELS,
    SOURCE_LABELS,
  } = labels;

  const openLead = (leadId) => {
    const sel = window.getSelection?.()?.toString();
    if (sel) return; // don’t open lead if user is highlighting text
    onOpenLead?.(leadId);
  };

  return (
    <div className="max-h-[70vh] overflow-auto" ref={parentRef}>
      {/* Sticky header */}
      <div
        className="sticky top-0 z-50"
        style={{ display: "grid", gridTemplateColumns, minWidth: MIN_TABLE_W }}
      >
        {/* Check (sticky) */}
        <div className={`${headerCell}  z-[60] bg-gray-50 border-r border-gray-200`}>
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={onToggleSelectAll}
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Name (sticky) */}
        <div
          className={`${headerCell} sticky z-[60] bg-gray-50 border-r border-gray-200`}
          // style={{ left: LEFT.name }}
        >
          <SortHeader label="Name" field="name" />
        </div>

        {/* Contact (sticky) */}
        <div
          className={`${headerCell} sticky z-[60] bg-gray-50 border-r border-gray-200`}
          // style={{ left: LEFT.contact }}
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
      <div style={{ height: totalSize, position: "relative", minWidth: MIN_TABLE_W }}>
        {!loading && leads.length === 0 && (
          <div className="p-6 text-xs text-gray-500">No leads yet.</div>
        )}

        {virtualItems.map((vi) => {
          const lead = leads[vi.index];

          return (
            <div
              key={lead.id}
              role="button"
              tabIndex={0}
              onClick={() => openLead(lead.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") openLead(lead.id);
              }}
              className="group cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black/10"
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
              <div
                className={`${cell} z-40 bg-white group-hover:bg-gray-50 border-r border-gray-200`}
              >
                <input
                  type="checkbox"
                  checked={selectedLeadIds.includes(lead.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    onToggleSelectOne(lead.id);
                  }}
                />
              </div>

              {/* Name (sticky) */}
              <div
                className={`${cell} bg-white group-hover:bg-gray-50 border-r border-gray-200`}
                // style={{ left: LEFT.name }}
              >
                <div className="font-medium text-xs text-gray-900 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();

  console.log(
      "Clicked lead:",
      lead.id,
      lead.firstName,
      lead.lastName,
      lead
    );


                      openLead(lead.id);
                    }}
                    className="text-blue-700 hover:underline"
                  >
                    {lead.firstName} {lead.lastName}
                  </button>
                </div>
                <div className="text-[11px] text-gray-500">
                  Created: {formatDate(lead.createdAt)}
                </div>
              </div>

              {/* Contact (sticky) */}
              <div
               className={`${cell} sticky z-40 bg-white group-hover:bg-gray-50 border-r border-gray-200`}
                // style={{ left: LEFT.contact }}
              >
                <div className="space-y-0.5">
                  <div className="text-[11px] text-gray-800 truncate">
                    {lead.phone ? `📞 ${lead.phone}` : <span className="text-gray-400 italic">No phone</span>}
                  </div>
                  <div className="text-[11px] truncate">
                    {lead.email ? (
                      <span className="text-blue-700">✉️ {lead.email}</span>
                    ) : (
                      <span className="text-gray-400 italic">No email</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className={cell}>
                <LeadBadge value={lead.status} label={STATUS_LABELS[lead.status] || lead.status} />
              </div>

              {/* Type */}
              <div className={cell}>
                {LEAD_TYPE_LABELS[lead.leadType] || lead.leadType}
              </div>

              {/* Relationship */}
              <div className={cell}>
                <LeadBadge
                  value={lead.relationshipRanking}
                  label={RELATIONSHIP_LABELS[lead.relationshipRanking] || lead.relationshipRanking}
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
                  <span className="text-gray-800">{formatDate(lead.registeredDateRaw)}</span>
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
                    <div className="font-medium text-gray-900">{lead.assignedAgentName}</div>
                    {lead.assignedAgentEmail && (
                      <div className="text-blue-700">{lead.assignedAgentEmail}</div>
                    )}
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyAgentLink(lead);
                        }}
                        className="px-2 py-1 border border-gray-300 rounded-full text-[10px] text-gray-700 hover:bg-gray-50"
                      >
                        Copy agent link
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEmailAgent(lead);
                        }}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAssign(lead);
                        }}
                        className="px-2 py-1 border border-gray-300 rounded-full text-[10px] text-gray-700 hover:bg-gray-50"
                      >
                        Assign
                      </button>
                    </div>
                  </div>
                )}
              </div>
{Array.isArray(lead.assignedAgents) && lead.assignedAgents.length > 0 && (
  <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
    {lead.assignedAgents.slice(0, 4).map((a) => (
      <span
        key={a.id}
        className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-700"
        title={a.email || ""}
      >
        {a.name || a.email}
      </span>
    ))}
    {lead.assignedAgents.length > 4 && (
      <span className="text-[10px] text-gray-500">
        +{lead.assignedAgents.length - 4} more
      </span>
    )}
  </div>
)}

              {/* Action item */}
              <div className={cell}>
                <textarea
                  rows={dense ? 2 : 3}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-[11px]"
                  placeholder="Action item for agent..."
                  value={actionItemDrafts[lead.id] ?? lead.actionItem ?? ""}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleActionItemChange(lead.id, e.target.value);
                  }}
                />
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSaveActionItem(lead);
                    }}
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
                  const preferredLatest = lead.latestActivityAdmin || lead.latestActivity;

                  let latestTime = 0;
                  if (Array.isArray(lead.journal)) {
                    for (const entry of lead.journal) {
                      if (!entry) continue;
                      const ca = entry.createdAt;
                      let ts = 0;
                      if (ca?.toMillis) ts = ca.toMillis();
                      else if (ca instanceof Date) ts = ca.getTime();
                      else if (typeof ca === "number") ts = ca;
                      else if (typeof ca === "string") ts = new Date(ca).getTime();
                      if (!Number.isNaN(ts) && ts > latestTime) latestTime = ts;
                    }
                  }

                  const when = latestTime ? formatDateTimeFromMillis(latestTime) : "";
                  if (!preferredLatest) return <span className="text-gray-400 italic">No activity yet</span>;

                  const isAdmin = !!lead.latestActivityAdmin;

                  return (
                    <div
                      className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] font-semibold ${isAdmin ? "text-gray-900" : "text-gray-700"}`}>
                          {isAdmin ? "Admin activity" : "Activity"}
                        </span>
                        {when ? <span className="text-[10px] text-gray-500">{when}</span> : null}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-800" style={clamp2Style()}>
                        {preferredLatest}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Delete */}
              <div className={cell}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteLead(lead);
                  }}
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

function AgentLeadsModal({ target, leads, leadsForAgent, onClose, onOpenLead }) {
  const [search, setSearch] = React.useState("");

  const normalizedSearch = search.trim().toLowerCase();

const agentLeads = React.useMemo(() => {
  const rows = typeof leadsForAgent === "function" ? leadsForAgent(target, leads) : [];

  if (!normalizedSearch) return rows;

  return rows.filter((l) => {
    const hay = [
      l.firstName,
      l.lastName,
      l.email,
      l.phone,
      l.latestActivity,
      l.latestActivityAdmin,
      l.journalLastEntry,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return hay.includes(normalizedSearch);
  });
}, [leads, target, normalizedSearch, leadsForAgent]);



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
                  {l.latestActivityAdmin || l.latestActivity || l.journalLastEntry || (
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
