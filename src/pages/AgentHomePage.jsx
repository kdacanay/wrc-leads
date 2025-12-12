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

function formatDate(tsOrString) {
  if (!tsOrString) return "";
  if (tsOrString?.toDate) {
    const d = tsOrString.toDate();
    return d.toISOString().split("T")[0];
  }
  return String(tsOrString);
}

function toMillis(value) {
  if (!value) return 0;
  if (value?.toMillis) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
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

function getLatestFromLead(lead) {
  let latestText = "";
  let latestTime = 0;

  if (Array.isArray(lead?.journal)) {
    for (const entry of lead.journal) {
      if (!entry?.text) continue;
      const t = toMillis(entry.createdAt);
      if (t >= latestTime) {
        latestTime = t;
        latestText = entry.text;
      }
    }
  }

  if (!latestText && lead?.journalLastEntry) latestText = lead.journalLastEntry;
  if (!latestText && lead?.latestActivity) latestText = lead.latestActivity;

  return { text: latestText, time: latestTime };
}

async function copyText(text, label = "Copied") {
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
    alert(`${label}.`);
  } catch (err) {
    console.error("Copy error:", err);
    alert("Could not copy. You can select and copy manually.");
  }
}

export default function AgentHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user?.email) return;

    // All leads assigned to this agent (match by email)
    const q = query(collection(db, "leads"), where("assignedAgentEmail", "==", user.email));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setLeads(items);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error("Error loading agent leads:", err);
        setError("Error loading your leads.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user]);

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
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [leads, normalizedSearch]);

  const stats = useMemo(() => {
    const now = Date.now();
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
      now,
    };
  }, [leads]);

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 space-y-5">
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

            {/* stats */}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] text-gray-700">
                <span className="text-[10px] opacity-70">Total</span>
                <span className="font-semibold">{stats.total}</span>
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] text-rose-800">
                <span className="text-[10px] opacity-70">Overdue</span>
                <span className="font-semibold">{stats.overdue}</span>
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] text-amber-900">
                <span className="text-[10px] opacity-70">Due in 7 days</span>
                <span className="font-semibold">{stats.dueSoon}</span>
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] text-gray-700">
                <span className="text-[10px] opacity-70">No due date</span>
                <span className="font-semibold">{stats.noDueDate}</span>
              </span>
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

        {loading ? (
          <div className="mt-3 text-xs text-gray-500">Loading your leads...</div>
        ) : null}

        {error && !loading ? (
          <div className="mt-3 text-xs text-rose-700">{error}</div>
        ) : null}
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
{filteredLeads.length > 0 && (
  <VirtualLeadGrid
    leads={filteredLeads}
    onOpenLead={(id) => navigate(`/agent/${id}`)}
  />
)}

    </div>
  );
}
function VirtualLeadGrid({ leads, onOpenLead }) {
  const parentRef = React.useRef(null);

  const rowVirtualizer = useVirtualizer({
    count: leads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 74, // tweak for your row height
    overscan: 12,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  // Layout constants for sticky columns
  const NAME_COL_W = 240;
  const CONTACT_COL_W = 220;

  const headerCell =
    "px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-gray-50";
  const cellBase = "px-3 py-2 text-[11px] border-b border-gray-100";

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Header */}
      <div
        className="sticky top-0 z-30"
        style={{
          display: "grid",
          gridTemplateColumns: `${NAME_COL_W}px ${CONTACT_COL_W}px 140px 110px 120px 1fr 120px`,
        }}
      >
        <div
          className={`${headerCell} sticky left-0 z-40`}
          style={{ width: NAME_COL_W }}
        >
          Name
        </div>
        <div
          className={`${headerCell} sticky z-40`}
          style={{ left: NAME_COL_W, width: CONTACT_COL_W }}
        >
          Contact
        </div>
        <div className={headerCell}>Status</div>
        <div className={headerCell}>Type</div>
        <div className={headerCell}>Due Date</div>
        <div className={headerCell}>Latest Activity</div>
        <div className={headerCell}>Actions</div>
      </div>

      {/* Body (virtualized) */}
      <div
        ref={parentRef}
        className="max-h-[70vh] overflow-auto"
        style={{ position: "relative" }}
      >
        <div style={{ height: totalSize, position: "relative" }}>
          {virtualItems.map((vi) => {
            const lead = leads[vi.index];
            return (
       <div
  key={lead.id}
  role="button"
  tabIndex={0}
  onClick={() => onOpenLead(lead.id)}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      onOpenLead(lead.id);
    }
  }}
  style={{
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    transform: `translateY(${vi.start}px)`,
    display: "grid",
    gridTemplateColumns: `${NAME_COL_W}px ${CONTACT_COL_W}px 140px 110px 120px 1fr 120px`,
    background: "white",
  }}
  className="group hover:bg-gray-50 cursor-pointer focus:outline-none"
>

                {/* Name (sticky left) */}
                <div
                  className={`${cellBase} sticky left-0 z-20 bg-white`}
                  style={{ width: NAME_COL_W }}
                >
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
                  style={{ left: NAME_COL_W, width: CONTACT_COL_W }}
                >
                  {lead.phone && <div className="text-gray-800">{lead.phone}</div>}
                  {lead.email && (
                    <div className="text-blue-700 truncate">{lead.email}</div>
                  )}
                </div>

                {/* Status */}
                <div className={cellBase}>
                  <LeadBadge
                    value={lead.status}
                    label={STATUS_LABELS[lead.status] || lead.status}
                  />
                </div>

                {/* Type */}
                <div className={cellBase}>
                  {LEAD_TYPE_LABELS[lead.leadType] || lead.leadType}
                </div>

                {/* Due date */}
                <div className={cellBase}>
                  {formatDate(lead.nextEvaluationDate) || (
                    <span className="text-gray-400 italic">Not set</span>
                  )}
                </div>

                {/* Latest activity */}
                <div className={cellBase}>
                  {lead.latestActivity ? (
                    <span className="text-gray-800">{lead.latestActivity}</span>
                  ) : lead.journalLastEntry ? (
                    <span className="text-gray-800">{lead.journalLastEntry}</span>
                  ) : (
                    <span className="text-gray-400 italic">No activity yet</span>
                  )}
                </div>

                {/* Actions */}
          {/* Actions */}
<div className={`${cellBase} flex items-center justify-end`}>
  <button
    type="button"
    onClick={() => onOpenLead(lead.id)}
    title="Open lead"
    aria-label="Open lead"
    className={cx(
      "inline-flex items-center justify-center",
      "h-8 w-8 rounded-full border border-gray-300 bg-white",
      "text-gray-700 hover:bg-gray-50",
      // hidden until row hover (still keyboard accessible via focus)
      "opacity-0 group-hover:opacity-100 focus:opacity-100",
      "transition-opacity"
    )}
  >
    {/* simple arrow icon */}
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
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
      </div>
    </div>
  );
}
