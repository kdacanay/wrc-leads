// src/pages/AgentHomePage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from "firebase/firestore";

import {
  STATUS_LABELS,
  LEAD_TYPE_LABELS,
} from "../constants/leadOptions";
import LeadBadge from "../components/LeadBadge";

function formatDate(tsOrString) {
  if (!tsOrString) return "";
  if (tsOrString.toDate) {
    const d = tsOrString.toDate();
    return d.toISOString().split("T")[0];
  }
  return tsOrString;
}

export default function AgentHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

useEffect(() => {
  if (!user) return;

  // All leads assigned to this agent (match by email to avoid UID mismatch issues)
  const q = query(
    collection(db, "leads"),
    where("assignedAgentEmail", "==", user.email)
  );

  const unsub = onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
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

  const filteredLeads = normalizedSearch
    ? leads.filter((lead) => {
        const haystack = [
          lead.firstName,
          lead.lastName,
          lead.email,
          lead.phone,
          STATUS_LABELS[lead.status] || lead.status,
          LEAD_TYPE_LABELS[lead.leadType] || lead.leadType,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      })
    : leads;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            My Leads
          </h1>
          <p className="text-xs text-gray-600">
            These are the leads currently assigned to you.
          </p>
        </div>

        <div className="w-full max-w-xs">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone, status..."
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs"
          />
        </div>
      </div>

      {loading && (
        <div className="text-xs text-gray-500">Loading your leads...</div>
      )}

      {error && !loading && (
        <div className="text-xs text-red-600">{error}</div>
      )}

      {!loading && filteredLeads.length === 0 && (
        <div className="text-xs text-gray-500">
          {leads.length === 0
            ? "You have no assigned leads yet."
            : "No leads match your search."}
        </div>
      )}

      {filteredLeads.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <div className="border-b border-gray-200 px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">
              Assigned leads ({filteredLeads.length})
            </span>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Contact</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Next eval</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-xs text-gray-900">
                        {lead.firstName} {lead.lastName}
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

                    <td className="px-3 py-2 align-top text-[11px]">
                      {formatDate(lead.nextEvaluationDate) || (
                        <span className="text-gray-400 italic">Not set</span>
                      )}
                    </td>

                    <td className="px-3 py-2 align-top text-[11px]">
                      <button
                        type="button"
                        onClick={() => navigate(`/agent/${lead.id}`)}
                        className="px-3 py-1 border border-gray-300 rounded-full text-[10px] text-gray-700 hover:bg-gray-50"
                      >
                        Open lead
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
