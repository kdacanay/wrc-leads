import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { db, deleteUserByUid } from "../firebase";
import {
  collection,
  onSnapshot,
  writeBatch,
  getDocs,
  doc,
} from "firebase/firestore";
import useAssignableAgents from "../hooks/useAssignableAgents";

function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function toMillis(value) {
  if (!value) return 0;
  if (value?.toMillis) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function formatDate(value) {
  if (!value) return "";
  if (value?.toDate) {
    const d = value.toDate();
    return d.toISOString().split("T")[0];
  }
  return String(value);
}

function buildAgentDigestEmail({ agentName, agentEmail, leads, sinceMs }) {
  const safeName = agentName || agentEmail || "Agent";
  const baseUrl = window.location.origin;

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

  const lastActivityMs = (l) => {
    const candidates = [
      toMillis(l.latestActivityAt),
      toMillis(l.updatedAt),
      toMillis(l.createdAt),
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
      : "Here are your assigned leads:"
  );
  lines.push("");

  if (normalized.length === 0) {
    lines.push("No leads are currently assigned to you.");
    lines.push("");
  } else {
    if (updated.length > 0) {
      lines.push("RECENTLY UPDATED");
      lines.push("---------------");
      for (const l of updated) {
        const name =
          `${l.firstName || ""} ${l.lastName || ""}`.trim() || "(No name)";
        const summary =
          l.latestActivityAdmin ||
          l.latestActivity ||
          l.journalLastEntry ||
          "Updated";

        const leadUrl = `${baseUrl}/admin/lead/${encodeURIComponent(l.id)}`;
        lines.push(`• ${name} — ${formatDT(l._lastMs)}`);
        lines.push(`  ${summary}`);
        lines.push(`  Open: ${leadUrl}`);
        lines.push("");
      }
    }

    if (stale.length > 0) {
      lines.push(updated.length > 0 ? "OLDER / NO RECENT UPDATES" : "ALL ASSIGNED LEADS");
      lines.push("-----------------------");
      for (const l of stale) {
        const name =
          `${l.firstName || ""} ${l.lastName || ""}`.trim() || "(No name)";
        const summary =
          l.latestActivityAdmin ||
          l.latestActivity ||
          l.journalLastEntry ||
          "No recent updates";

        const when = l._lastMs ? formatDT(l._lastMs) : "—";
        const leadUrl = `${baseUrl}/admin/lead/${encodeURIComponent(l.id)}`;
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
    count: updated.length,
  };
}

function emailAgentDigest({ toEmail, subject, body }) {
  const mailto = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  window.location.href = mailto;
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
    if (!agentRow.isPlaceholder) {
      if (l.assignedAgentId && ids.has(String(l.assignedAgentId))) return true;

      if (Array.isArray(l.assignedAgentIds)) {
        if (l.assignedAgentIds.some((x) => ids.has(String(x)))) return true;
      }

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

      if (email && Array.isArray(l.assignedAgentEmailNorms)) {
        if (l.assignedAgentEmailNorms.map(normEmail).includes(email)) return true;
      }

      const primaryEmail = normEmail(l.assignedAgentEmailNorm || l.assignedAgentEmail || "");
      if (email && primaryEmail && primaryEmail === email) return true;

      return false;
    }

    const leadEmail = normEmail(l.assignedAgentEmailNorm || l.assignedAgentEmail || "");
    const leadName = normName(
      String(l.assignedAgentNameNorm || l.assignedAgentName || "").replace(/\s\*$/, "")
    );

    if (email && leadEmail && leadEmail === email) return true;
    if (nameNorm && leadName && leadName === nameNorm) return true;

    return false;
  });
}

function AgentLeadsModal({ target, leads, onClose, onOpenLead }) {
  const [search, setSearch] = useState("");

  const normalizedSearch = search.trim().toLowerCase();

  const agentLeads = useMemo(() => {
    const rows = leadsForAgent(target, leads);

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
  }, [leads, target, normalizedSearch]);

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

export default function AdminAgentSummary() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { agents: assignableAgents } = useAssignableAgents();

  const [leads, setLeads] = useState([]);
  const [agentLeadsOpen, setAgentLeadsOpen] = useState(false);
  const [agentLeadsTarget, setAgentLeadsTarget] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "leads"), (snap) => {
      const items = snap.docs.map((docSnap) => ({
        ...docSnap.data(),
        id: docSnap.id,
      }));
      setLeads(items);
    });

    return () => unsub();
  }, []);

  const agentStats = useMemo(() => {
    if (!Array.isArray(assignableAgents)) return [];

    const registeredCounts = {};
    const unregisteredCounts = {};
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

    (Array.isArray(leads) ? leads : []).forEach((lead) => {
      const isHot =
        lead.relationshipRanking === "78" || lead.relationshipRanking === "100";

      const idsFromArray = Array.isArray(lead.assignedAgentIds)
        ? lead.assignedAgentIds.filter(Boolean)
        : [];
      const idsFromObjects = Array.isArray(lead.assignedAgents)
        ? lead.assignedAgents.map((a) => a?.id).filter(Boolean)
        : [];
      const primaryId = lead.assignedAgentId ? [lead.assignedAgentId] : [];
      const registeredIds = Array.from(
        new Set([...idsFromArray, ...idsFromObjects, ...primaryId])
      );

      if (registeredIds.length > 0) {
        registeredIds.forEach((id) => {
          const k = String(id);
          if (!registeredCounts[k]) registeredCounts[k] = { total: 0, hot: 0 };
          registeredCounts[k].total += 1;
          if (isHot) registeredCounts[k].hot += 1;
        });
        return;
      }

      const emailNorm = normEmail(
        lead.assignedAgentEmailNorm || lead.assignedAgentEmail || ""
      );
      const nameNorm = normName(
        String(lead.assignedAgentName || "").replace(/\s*\*$/, "")
      );

      let key = "";
      if (emailNorm) {
        key = `unregEmail:${emailNorm}`;
      } else if (nameNorm) {
        const mapped = nameToEmail.get(nameNorm);
        key = mapped ? `unregEmail:${mapped}` : `unregName:${nameNorm}`;
      } else {
        return;
      }

      if (!unregisteredCounts[key]) {
        unregisteredCounts[key] = { total: 0, hot: 0 };
      }
      unregisteredCounts[key].total += 1;
      if (isHot) unregisteredCounts[key].hot += 1;
    });

    const stats = [];

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

    assignableAgents
      .filter((a) => a.isPlaceholder)
      .forEach((a) => {
        const e = normEmail(a.email || "");
        const n = normName(String(a.name || "").replace(/\s*\*$/, ""));
        const key = e ? `unregEmail:${e}` : `unregName:${n}`;
        if (!key) return;

        const st = unregisteredCounts[key] || { total: 0, hot: 0 };

        stats.push({
          id: a.id,
          uid: a.id,
          name: a.name || "Unregistered",
          email: a.email || "",
          total: st.total,
          hot: st.hot,
          isPlaceholder: true,
        });
      });

    const deduped = new Map();

    for (const row of stats) {
      const k = keyForAgentRow(row);
      if (!k) continue;

      const prev = deduped.get(k);
      if (!prev) {
        deduped.set(k, row);
        continue;
      }

      prev.total = Math.max(prev.total || 0, row.total || 0);
      prev.hot = Math.max(prev.hot || 0, row.hot || 0);

      if (!prev.email && row.email) prev.email = row.email;
      if ((!prev.name || prev.name.includes("*")) && row.name && !row.name.includes("*")) {
        prev.name = row.name;
      }
    }

    return Array.from(deduped.values()).sort((a, b) =>
      String(a.name || "").toLowerCase().localeCompare(String(b.name || "").toLowerCase())
    );
  }, [assignableAgents, leads]);

  async function handleEmailDigestForAgent(agentRow) {
    const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const agentLeads = leadsForAgent(agentRow, leads);

    if (!agentRow.email) {
      alert("No agent email on file for this agent.");
      return;
    }

    const { subject, body, count } = buildAgentDigestEmail({
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

  async function handleDeleteUser(agent) {
    const uid = agent?.uid || agent?.id;

    if (!uid) {
      alert("Cannot delete: user UID missing.");
      return;
    }

    const msg = `Are you sure you want to delete this user?\n\n${
      agent.fullName || agent.email
    }\n\nThis will delete their Firebase Auth account and their Firestore profile.`;

    if (!window.confirm(msg)) return;

    try {
      const result = await deleteUserByUid({ uid });

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

  async function handleDeleteUnregisteredAgent(agentRow) {
    const display = agentRow?.name || "Unregistered agent";
    const targetEmail = normEmail(agentRow?.email || "");
    const targetName = normName(String(display).replace(/\s*\*$/, ""));

    const confirmed = window.confirm(
      `Delete "${display}"?\n\nThis will unassign matching leads and remove the unregistered agent entry.`
    );
    if (!confirmed) return;

    try {
      const batch = writeBatch(db);

      const affected = (Array.isArray(leads) ? leads : []).filter((l) => {
        if (l.assignedAgentId) return false;

        const leadEmail = normEmail(l.assignedAgentEmailNorm || l.assignedAgentEmail || "");
        const leadName = normName(String(l.assignedAgentName || "").replace(/\s*\*$/, ""));

        if (targetEmail && leadEmail && leadEmail === targetEmail) return true;
        if (!targetEmail && targetName && leadName && leadName === targetName) return true;
        return false;
      });

      affected.forEach((l) => {
        const ref = doc(db, "leads", l.id);
        batch.update(ref, {
          assignedAgentId: null,
          assignedAgentName: null,
          assignedAgentEmail: null,
          assignedAgentEmailNorm: null,
          assignedAgentEmailNorms: [],
          assignedAgents: [],
        });
      });

      const snap = await getDocs(collection(db, "unregisteredAgents"));
      const docsToDelete = snap.docs.filter((d) => {
        const data = d.data() || {};
        const dEmail = normEmail(data.email || data.emailNorm || "");
        const dName = normName(String(data.name || "").replace(/\s*\*$/, ""));

        if (targetEmail) return dEmail && dEmail === targetEmail;
        return targetName && dName && dName === targetName;
      });

      docsToDelete.forEach((d) => batch.delete(doc(db, "unregisteredAgents", d.id)));

      await batch.commit();

      alert(
        `Deleted "${display}".\nUnassigned ${affected.length} lead(s).\nDeleted ${docsToDelete.length} unregistered agent doc(s).`
      );
    } catch (err) {
      console.error("Delete unregistered agent error:", err);
      alert("Error deleting unregistered agent. Check console.");
    }
  }

  function openAgentLeads(agentRow) {
    setAgentLeadsTarget({
      id: agentRow.id || "",
      uid: agentRow.uid || agentRow.id || "",
      name: agentRow.name,
      email: agentRow.email || "",
      isPlaceholder: !!agentRow.isPlaceholder,
    });

    setAgentLeadsOpen(true);
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-[var(--color-wrcBlack)]">
              Agent Summary
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Review lead counts, hot leads, and agent-level activity.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/admin")}
            className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-semibold hover:bg-gray-50"
          >
            Back to Dashboard
          </button>
        </div>

        <div className="mt-6 border border-gray-200 rounded-lg bg-white p-3 text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-gray-700">Agent summary</span>
            <span className="text-[11px] text-gray-500">Based on current leads</span>
          </div>

          <div className="max-h-[520px] overflow-y-auto overflow-x-auto pr-1">
            <table className="min-w-full text-[11px]">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr className="uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-1 text-left">Agent</th>
                  <th className="px-2 py-1 text-left">Email</th>
                  <th className="px-2 py-1 text-right">Total leads</th>
                  <th className="px-2 py-1 text-right">Hot leads</th>
                  <th className="px-2 py-1 text-right">Digest</th>
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
                        <span className={a.isPlaceholder ? "italic" : ""}>
                          {a.name}
                        </span>
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
                        <span className="font-semibold text-amber-700">{a.hot}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>

                    <td className="px-2 py-1 text-right">
                      <button
                        type="button"
                        disabled={!a.email}
                        onClick={() => handleEmailDigestForAgent(a)}
                        className="px-2 py-1 border border-gray-300 rounded-full text-[10px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Email digest
                      </button>
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

                {agentStats.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-xs text-gray-500">
                      No agent stats found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {agentLeadsOpen && agentLeadsTarget && (
        <AgentLeadsModal
          target={agentLeadsTarget}
          leads={leads}
          onClose={() => {
            setAgentLeadsOpen(false);
            setAgentLeadsTarget(null);
          }}
          onOpenLead={(id) => navigate(`/admin/lead/${encodeURIComponent(id)}`)}
        />
      )}
    </div>
  );
}