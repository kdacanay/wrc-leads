// src/pages/AgentLeadPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";

import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  orderBy,
  addDoc,
} from "firebase/firestore";

import LeadFormAgent from "../components/LeadFormAgent";
import JournalTimeline from "../components/JournalTimeline";
import LeadDetailView from "../components/LeadDetailView";

// ---------- Small helpers ----------
function formatDate(value) {
  if (!value) return "";
  if (value?.toDate) return value.toDate().toISOString().split("T")[0];
  if (value instanceof Date) return value.toISOString().split("T")[0];
  return String(value);
}

function toMillis(val) {
  if (!val) return 0;
  if (val?.toMillis) return val.toMillis();
  if (val instanceof Date) return val.getTime();
  if (typeof val === "number") return val;
  const t = new Date(val).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function formatDateTime(ms) {
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

function Card({ title, children, right }) {
  return (
    <div className="border border-gray-200 rounded-xl bg-white p-4">
      {(title || right) && (
        <div className="flex items-center justify-between mb-2">
          {title ? (
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          ) : (
            <div />
          )}
          {right ? <div>{right}</div> : null}
        </div>
      )}
      {children}
    </div>
  );
}

function Callout({ tone = "blue", title, children }) {
  const tones = {
    blue: "border-blue-300 bg-blue-50 text-blue-900",
    amber: "border-amber-300 bg-amber-50 text-amber-900",
    gray: "border-gray-200 bg-gray-50 text-gray-800",
  };
  return (
    <div className={`border-l-4 rounded-xl p-4 ${tones[tone] || tones.gray}`}>
      {title ? <div className="text-xs font-semibold mb-1">{title}</div> : null}
      <div className="text-xs whitespace-pre-wrap">{children}</div>
    </div>
  );
}

// ---------- Page ----------
export default function AgentLeadPage() {
  const { leadId } = useParams();
  const decodedLeadId = useMemo(
    () => decodeURIComponent(leadId || ""),
    [leadId]
  );

  const navigate = useNavigate();
  const { user, role } = useAuth();

  const [lead, setLead] = useState(null);
  const [agentJournal, setAgentJournal] = useState([]);
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [unauthorized, setUnauthorized] = useState(false);

  // ✅ If role is known and not agent, get out immediately
  useEffect(() => {
    if (!user?.uid) return;
    if (!role) return; // wait until role is loaded
    if (role === "admin") navigate("/admin", { replace: true });
    else if (role !== "agent") navigate("/", { replace: true });
  }, [role, user?.uid, navigate]);

  // 1) Load lead doc + enforce access (only assigned agent)
  useEffect(() => {
    if (!decodedLeadId) return;
    if (!user?.uid) return;
    if (!role) return;
    if (role !== "agent") return;

    setLoading(true);
    setUnauthorized(false);

    const ref = doc(db, "leads", decodedLeadId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setLead(null);
          setUnauthorized(false);
          setLoading(false);
          return;
        }

        const docId = snap.id; // ✅ always the Firestore doc id
        const data = snap.data() || {};

        // ✅ keep both:
        const leadObj = { ...data, docId }; // docId for writes

        const myUid = user.uid;
        const myEmail = (user.email || "").toLowerCase();

        const assignedUid = String(leadObj.assignedAgentId || "");
        const assignedEmailNorm = String(
          leadObj.assignedAgentEmailNorm || leadObj.assignedAgentEmail || ""
        ).toLowerCase();

        const isAssigned =
          (assignedUid && assignedUid === myUid) ||
          (!assignedUid &&
            assignedEmailNorm &&
            myEmail &&
            assignedEmailNorm === myEmail);

        if (!isAssigned) {
          setLead(null);
          setUnauthorized(true);
          setLoading(false);
          return;
        }

        setUnauthorized(false);
        setLead(leadObj);
        setLoading(false);
      },
      (err) => {
        console.error("Error loading lead:", err);
        setLead(null);
        setLoading(false);
        setUnauthorized(err?.code === "permission-denied");
      }
    );

    return () => unsub();
  }, [decodedLeadId, user?.uid, user?.email, role]);

  // 2) Load journal entries agent is allowed to see (shared + agent)
  // NOTE: this assumes your rules allow visibility "shared" OR "agent" for assigned agents.
  useEffect(() => {
    if (!decodedLeadId) return;
    if (!user?.uid) return;
    if (!role) return;
    if (role !== "agent") return;

    // ✅ No where() so we don't require a composite index.
    // We’ll filter visibility client-side.
    const q = query(
      collection(db, "leads", decodedLeadId, "journal"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // ✅ Agent can see:
        // - visibility: "shared"
        // - visibility: "agent"
        // - older docs that don't have visibility set (treat as shared)
        const visible = rows.filter((r) => {
          const vis = String(r.visibility || "shared").toLowerCase();
          return vis === "shared" || vis === "agent"; // ✅ admin-only entries won't show

        });

        setAgentJournal(visible);
      },
      (err) => console.error("Agent journal listener error:", err)
    );

    return () => unsub();
  }, [decodedLeadId, user?.uid, role]);

  const latestAgentJournalText = useMemo(() => {
    if (!agentJournal?.length) return "";
    return agentJournal[0]?.text || "";
  }, [agentJournal]);

  async function handleAgentSave(form) {
    if (!lead) return;
    if (unauthorized) return;

    if (!user?.uid) {
      setStatus({
        type: "error",
        message: "You must be signed in to save changes.",
      });
      return;
    }

    setSaving(true);
    setStatus({ type: "", message: "" });

    try {
      const trimmedNote = (form.journalEntry || "").trim();
      

      // Build an activity line
      const parts = [];
      if (
        form.relationshipRanking &&
        form.relationshipRanking !== lead.relationshipRanking
      ) {
        parts.push(`Relationship: ${form.relationshipRanking}`);
      }
      if (form.urgencyRanking && form.urgencyRanking !== lead.urgencyRanking) {
        parts.push(`Urgency: ${form.urgencyRanking}`);
      }
// ✅ Rejection request fields (define BEFORE using turningOnNow/reason)
const requestingReject = !!form.requestReject;
const reason = (form.rejectionReason || "").trim();

// Require a reason if requesting reject
if (requestingReject && !reason) {
  setStatus({ type: "error", message: "Please add a reason to request rejection." });
  setSaving(false);
  return;
}

// Determine if agent is turning it ON now
const wasRequested = !!lead.rejectionRequested;
const turningOnNow = requestingReject && !wasRequested;

      
if (form.status && form.status !== lead.status) {
  parts.push(`Status: ${form.status}`);
}
      const activityFromFields =
        parts.length > 0
          ? `Agent updated — ${parts.join(" • ")}`
          : "Agent updated lead.";

 // ✅ NOW it’s safe to use turningOnNow + reason
const activityText = turningOnNow
  ? `🚫 Rejection requested: ${reason}`
  : trimmedNote
  ? `Agent note: ${trimmedNote}`
  : activityFromFields;



await updateDoc(doc(db, "leads", lead.docId), {
  status: form.status || lead.status || "",
  relationshipRanking: form.relationshipRanking || "",
  urgencyRanking: form.urgencyRanking || "",

  // ✅ rejection request fields
  rejectionRequested: requestingReject,
  rejectionReason: requestingReject ? reason : "",

  ...(turningOnNow
    ? {
        rejectionStatus: "pending",
        rejectionRequestedAt: serverTimestamp(),
        rejectionRequestedBy: user.uid,
      }
    : {}),

  updatedBy: user.uid,
  updatedAt: serverTimestamp(),
  latestActivity: activityText,
  latestActivityAt: serverTimestamp(),
  journalLastEntry: activityText,

});

// ✅ If agent just requested rejection, notify admin clearly
if (turningOnNow) {
  const leadName =
    `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "(No name)";

  const msg = `🚫 Rejection requested by ${user.displayName || user.email || "Agent"}: ${reason}`;

  // 1) Add a shared journal entry so it’s visible to admin + agent
  await addDoc(collection(db, "leads", lead.docId, "journal"), {
    text: msg,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    createdByEmail: user.email || "",
    createdByRole: "agent",
    visibility: "shared",
    type: "rejection-request",
  });

  // 2) Add an admin notification (shows on AdminDashboard)
  await addDoc(collection(db, "adminNotifications"), {
    type: "rejection-request",
    leadId: lead.docId,
    leadName,
    latestActivity: msg,
    rejectionReason: reason,
    updatedBy: user.uid,
    updatedByName: user.displayName || user.email || "Agent",
    isRead: false,
    createdAt: serverTimestamp(),
  });
}


      // 2) Add journal entry
      if (trimmedNote) {
      await addDoc(collection(db, "leads", lead.docId, "journal"), {
  text: trimmedNote,
  createdAt: serverTimestamp(),
  createdBy: user.uid,
  createdByEmail: user.email || "",
  visibility: "shared", // or "agent"
  type: "agent-note",
});
      }

      // 3) Create admin notification
// 3) Create admin notification
// ✅ If it's a new rejection request, we already sent a special notification above.
if (!turningOnNow) {
  const leadName =
    `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "(No name)";

  await addDoc(collection(db, "adminNotifications"), {
    leadId: lead.docId,
    leadName,
    latestActivity: activityText,
    updatedBy: user.uid,
    updatedByName: user.displayName || user.email || "Agent",
    isRead: false,
    createdAt: serverTimestamp(),
  });
}


      setStatus({ type: "success", message: "Saved!" });
      setTimeout(() => setStatus({ type: "", message: "" }), 2000);
    } catch (err) {
      console.error("Error saving lead:", err);
      setStatus({ type: "error", message: "Error saving. Check console." });
    } finally {
      setSaving(false);
    }
  }

  // ---------- Render ----------
  if (!role) {
    return <div className="text-sm text-gray-600">Loading...</div>;
  }

  if (loading) {
    return <div className="text-sm text-gray-600">Loading lead details...</div>;
  }

  if (!lead) {
    return (
      <div className="text-sm text-red-600">
        {unauthorized
          ? "You don’t have access to this lead."
          : "Lead not found or you don’t have access."}
      </div>
    );
  }

   return (
    <LeadDetailView
      mode="agent"
      lead={lead}
      saving={saving}
      onBack={() => navigate("/agent")}
      onAgentSave={handleAgentSave}
      sharedJournal={agentJournal}
      statusMessage={status.message}
      statusType={status.type}
      latestAgentJournalText={latestAgentJournalText}
    />
  );
}
