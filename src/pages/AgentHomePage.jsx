// src/pages/AgentHomePage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { collection, query, where, onSnapshot } from "firebase/firestore";

import { STATUS_LABELS, LEAD_TYPE_LABELS } from "../constants/leadOptions";
import LeadBadge from "../components/LeadBadge";

import { useVirtualizer } from "@tanstack/react-virtual";

function cx(...arr) {
  return arr.filter(Boolean).join(" ");
}

function isActionItemText(text) {
  const t = String(text || "").toLowerCase();
  return t.includes("action item") && (t.includes("updated") || t.includes("cleared"));
}

function isActionItemEntry(entry) {
  const type = String(entry?.type || "").toLowerCase().trim();
  if (type === "action-item") return true;

  const text = String(entry?.text || "").toLowerCase();
  return (
    text.startsWith("admin updated action item") ||
    text.startsWith("admin cleared action item") ||
    text.includes("updated action item") ||
    text.includes("cleared action item")
  );
}

function toMillis(value) {
  if (!value) return 0;
  if (value?.toMillis) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function formatDate(tsOrString) {
  if (!tsOrString) return "";
  if (tsOrString?.toDate) {
    const d = tsOrString.toDate();
    return d.toISOString().split("T")[0];
  }
  return String(tsOrString);
}

function getLatestAgentSafeActivity(lead) {
  let latestText = "";
  let latestTime = 0;

  // Note: unless you're explicitly embedding journal in lead docs, this will be empty
  if (Array.isArray(lead?.journal)) {
    for (const entry of lead.journal) {
      if (!entry?.text) continue;
      if (isActionItemEntry(entry)) continue;

      const t = toMillis(entry.createdAt);
      if (t >= latestTime) {
        latestTime = t;
        latestText = entry.text;
      }
    }
  }

  if (!latestText && lead?.latestActivity && !isActionItemText(lead.latestActivity)) {
    latestText = lead.latestActivity;
  }
  if (!latestText && lead?.journalLastEntry && !isActionItemText(lead.journalLastEntry)) {
    latestText = lead.journalLastEntry;
  }

  return latestText;
}

function dueTone(dueMs, todayMs) {
  if (!dueMs) return "none";
  if (dueMs < todayMs) return "overdue";
  const soon = todayMs + 7 * 24 * 60 * 60 * 1000;
  if (dueMs <= soon) return "soon";
  return "ok";
}

function PillStat({ label, value, tone = "gray" }) {
  const tones = {
    gray: "border-gray-200 bg-gray-50 text-gray-700",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px]",
        tones[tone] || tones.gray
      )}
    >
      <span className="text-[10px] opacity-70">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

export default function AgentHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user?.uid) return;

    setLoading(true);
    setError("");

    const leadsById = new Map();     // assignedAgentId == uid
    const leadsByEmail = new Map();  // assignedAgentEmailNorm == email

    const mergeAndSet = () => {
      // email results can overwrite id results for same docId (fine either way)
      const merged = new Map([...leadsById, ...leadsByEmail]);
      const arr = Array.from(merged.values());

      // hard filter out anything malformed (prevents /agent/ blank)
      const safe = arr.filter((l) => !!l?.docId);

      setLeads(safe);
      setLoading(false);
    };

    // Listener #1: assignedAgentId
    const qById = query(collection(db, "leads"), where("assignedAgentId", "==", user.uid));

    const unsub1 = onSnapshot(
      qById,
      (snap) => {
        leadsById.clear();
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          leadsById.set(docSnap.id, { ...data, docId: docSnap.id });
        });
        mergeAndSet();
      },
      (err) => {
        console.error("Error loading agent leads (by id):", err);
        setError(
          err?.code === "permission-denied"
            ? "Permission denied loading leads (by assignedAgentId). Check Firestore rules and assignment fields."
            : "Error loading your leads."
        );
        setLoading(false);
      }
    );

    // Listener #2: assignedAgentEmailNorm (only if we have an email)
    let unsub2 = () => {};
    if (user?.email) {
      const emailNorm = String(user.email).toLowerCase().trim();
      const qByEmail = query(
        collection(db, "leads"),
        where("assignedAgentEmailNorm", "==", emailNorm)
      );

      unsub2 = onSnapshot(
        qByEmail,
        (snap) => {
          leadsByEmail.clear();
          snap.forEach((docSnap) => {
            const data = docSnap.data();
            leadsByEmail.set(docSnap.id, { ...data, docId: docSnap.id });
          });
          mergeAndSet();
        },
        (err) => {
          console.error("Error loading agent leads (by email):", err);
          setError(
            err?.code === "permission-denied"
              ? "Permission denied loading leads (by assignedAgentEmailNorm). Check Firestore rules and assignment fields."
              : "Error loading your leads."
          );
          setLoading(false);
        }
      );
    }

    return () => {
      unsub1();
      unsub2();
    };
  }, [user?.uid, user?.email]);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredLeads = useMemo(() => {
    if (!normalizedSearch) return leads;

    return leads.filter((lead) => {
      const haystack = [
        lead.firstName,
        lead.lastName,
        lead.email,
        lead.phone,
        STATUS_LABELS[lead.status] || lead.status,
        LEAD_TYPE_LABELS[lead.leadType] || lead.leadType,
        lead.latestActivity,
        lead.journalLastEntry,
        lead.actionItem,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [leads, normalizedSearch]);

  const stats = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();

    const endSoon = new Date(startOfToday);
    endSoon.setDate(endSoon.getDate() + 7);
    endSoon.setHours(23, 59, 59, 999);
    const soonMs = endSoon.getTime();

    let overdue = 0;
    let dueSoon = 0;
    let noDueDate = 0;

    for (const l of leads) {
      const due = l?.nextEvaluationDate;
      const dueMs = due ? toMillis(due) : 0;
      if (!dueMs) {
        noDueDate++;
        continue;
      }
      if (dueMs < todayMs) overdue++;
      else if (dueMs >= todayMs && dueMs <= soonMs) dueSoon++;
    }

    return {
      total: leads.length,
      overdue,
      dueSoon,
      noDueDate,
    };
  }, [leads]);

  const handleOpenLead = (docId) => {
    const safeId = String(docId || "").trim();
    if (!safeId) {
      console.warn("Blocked navigation: missing docId", docId);
      return;
    }
    navigate(`/agent/${encodeURIComponent(safeId)}`);
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 space-y-5">
      {/* Header card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">My Leads</h1>
            <p className="text-xs text-gray-600 mt-1">
              These are the leads currently assigned to you.
              {user?.email ? (
                <>
                  {" "}
                  Signed in as <span className="font-medium">{user.email}</span>.
                </>
              ) : null}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <PillStat label="Total" value={stats.total} tone="gray" />
              <PillStat label="Overdue" value={stats.overdue} tone="rose" />
              <PillStat label="Due in 7 days" value={stats.dueSoon} tone="amber" />
              <PillStat label="No due date" value={stats.noDueDate} tone="gray" />
            </div>
          </div>

          {/* search */}
          <div className="w-full sm:w-[360px]">
            <label className="block text-[11px] font-medium text-gray-700 mb-1">
              Search leads
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email, phone, status, activity..."
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-black/10"
            />
            <div className="mt-1 text-[10px] text-gray-500">
              Showing <span className="font-semibold">{filteredLeads.length}</span> of{" "}
              <span className="font-semibold">{leads.length}</span>
            </div>
          </div>
        </div>

        {loading ? <div className="mt-3 text-xs text-gray-500">Loading your leads...</div> : null}
        {error && !loading ? <div className="mt-3 text-xs text-rose-700">{error}</div> : null}
      </div>

      {/* Empty states */}
      {!loading && filteredLeads.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm shadow-sm">
          <div className="text-gray-800 font-medium">
            {leads.length === 0 ? "You have no assigned leads yet." : "No leads match your search."}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Try searching by email, phone, status, or recent activity.
          </div>
        </div>
      ) : null}

      {/* Table */}
      {filteredLeads.length > 0 ? (
        <VirtualLeadGrid leads={filteredLeads} onOpenLead={handleOpenLead} />
      ) : null}
    </div>
  );
}

function VirtualLeadGrid({ leads, onOpenLead }) {
  const scrollerRef = React.useRef(null);

  const rowVirtualizer = useVirtualizer({
    count: leads.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 74,
    overscan: 12,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const COL = {
    name: 240,
    contact: 220,
    status: 140,
    type: 110,
    due: 120,
    activity: 520,
    actions: 120,
  };

  const gridTemplate = `
    ${COL.name}px
    ${COL.contact}px
    ${COL.status}px
    ${COL.type}px
    ${COL.due}px
    ${COL.activity}px
    ${COL.actions}px
  `;

  const MIN_TABLE_W = Object.values(COL).reduce((sum, w) => sum + w, 0);

  const headerCell =
    "px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-gray-50";
  const cellBase = "px-3 py-2 text-[11px] border-b border-gray-100";

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* ONE scroll container for BOTH header and body */}
      <div ref={scrollerRef} className="max-h-[70vh] overflow-auto" style={{ position: "relative" }}>
        {/* Inner wrapper for horizontal scroll width */}
        <div style={{ minWidth: MIN_TABLE_W }}>
          {/* Sticky header */}
          <div className="sticky top-0 z-30" style={{ display: "grid", gridTemplateColumns: gridTemplate }}>
            <div className={`${headerCell} sticky left-0 z-40`} style={{ width: COL.name }}>
              Name
            </div>
            <div className={`${headerCell} sticky z-40`} style={{ left: COL.name, width: COL.contact }}>
              Contact
            </div>
            <div className={headerCell}>Status</div>
            <div className={headerCell}>Type</div>
            <div className={headerCell}>Due Date</div>
            <div className={headerCell}>Next Action Item</div>
            <div className={headerCell} />
          </div>

          {/* Virtualized body */}
          <div style={{ height: totalSize, position: "relative" }}>
            {virtualItems.map((vi) => {
              const lead = leads[vi.index];
              const docId = lead?.docId; // ✅ always the Firestore doc id

              return (
                <div
                  key={docId}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenLead(docId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onOpenLead(docId);
                  }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                    display: "grid",
                    gridTemplateColumns: gridTemplate,
                    background: "white",
                  }}
                  className="group hover:bg-gray-50 cursor-pointer focus:outline-none"
                >
                  {/* Name (sticky left) */}
                  <div className={`${cellBase} sticky left-0 z-20 bg-white`} style={{ width: COL.name }}>
                    <div className="font-medium text-xs text-gray-900">
                      {lead.firstName} {lead.lastName}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Created: {formatDate(lead.createdAt)}
                    </div>
                  </div>

                  {/* Contact (sticky left) */}
                  <div
                    className={`${cellBase} sticky z-20 bg-white`}
                    style={{ left: COL.name, width: COL.contact }}
                  >
                    {lead.phone ? <div className="text-gray-800">{lead.phone}</div> : null}
                    {lead.email ? <div className="text-blue-700 truncate">{lead.email}</div> : null}
                  </div>

                  {/* Status */}
                  <div className={cellBase}>
                    <LeadBadge value={lead.status} label={STATUS_LABELS[lead.status] || lead.status} />
                  </div>

                  {/* Type */}
                  <div className={cellBase}>{LEAD_TYPE_LABELS[lead.leadType] || lead.leadType}</div>

                  {/* Due */}
                  <div className={cellBase}>
                    {(() => {
                      const dueMs = lead?.nextEvaluationDate ? toMillis(lead.nextEvaluationDate) : 0;

                      const startOfToday = new Date();
                      startOfToday.setHours(0, 0, 0, 0);
                      const todayMs = startOfToday.getTime();

                      const tone = dueTone(dueMs, todayMs);
                      const toneClass =
                        tone === "overdue"
                          ? "text-rose-700 font-semibold"
                          : tone === "soon"
                          ? "text-amber-800 font-semibold"
                          : "text-gray-800";

                      return dueMs ? (
                        <span className={toneClass}>{formatDate(lead.nextEvaluationDate)}</span>
                      ) : (
                        <span className="text-gray-400 italic">Not set</span>
                      );
                    })()}
                  </div>

                  {/* Next Action / Activity */}
                  <div className={cellBase}>
                    {(() => {
                      const nextAction = String(lead?.actionItem || "").trim();
                      const fallback = getLatestAgentSafeActivity(lead);
                      const text = nextAction || fallback;

                      if (!text) return <span className="text-gray-400 italic">No next action yet</span>;

                      return (
                        <div className="text-gray-800 leading-snug">
                          <div className="line-clamp-2 whitespace-pre-line">{text}</div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Actions */}
                  <div className={`${cellBase} flex items-center justify-end`}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenLead(docId);
                      }}
                      title="Open lead"
                      aria-label="Open lead"
                      className={cx(
                        "inline-flex items-center justify-center",
                        "h-8 w-8 rounded-full border border-gray-300 bg-white",
                        "text-gray-700 hover:bg-gray-50",
                        "opacity-0 group-hover:opacity-100 focus:opacity-100",
                        "transition-opacity"
                      )}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                        <path
                          fillRule="evenodd"
                          d="M7.21 14.77a.75.75 0 0 1 .02-1.06L10.94 10 7.23 6.29a.75.75 0 1 1 1.06-1.06l4.24 4.24c.3.3.3.77 0 1.06l-4.24 4.24a.75.75 0 0 1-1.06.02Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="h-2" />
        </div>
      </div>
    </div>
  );
}
