// functions/index.js

// v2 imports
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
// const { user: authUser } = require("firebase-functions/v1/auth");
// const { onUserCreated } = require("firebase-functions/v2/auth");
// const functions = require("firebase-functions");
const { user: authUser } = require("firebase-functions/v1/auth");
// v1 import (only for auth trigger)
// const functions = require("firebase-functions");

// Admin SDK (single import + single init)
const admin = require("firebase-admin");
if (!admin.apps.length) {
  admin.initializeApp();
}

const auth = admin.auth();
const db = admin.firestore();

/**
 * Callable function for admins to delete a user by UID.
 * Deletes from Firebase Auth and from the `users` collection.
 */
exports.deleteUserByUid = onCall(async (request) => {
  const context = request.auth;
  const data = request.data;

  if (!context) {
    throw new HttpsError(
      "unauthenticated",
      "You must be signed in to delete a user."
    );
  }

  const callerUid = context.uid;
  const callerDoc = await db.collection("users").doc(callerUid).get();

  if (!callerDoc.exists) {
    throw new HttpsError(
      "permission-denied",
      "Caller user doc not found; cannot verify admin role."
    );
  }

  const callerData = callerDoc.data();
  if (callerData.role !== "admin") {
    throw new HttpsError("permission-denied", "Only admins can delete users.");
  }

  const uid = data?.uid;
  if (!uid) {
    throw new HttpsError("invalid-argument", "Missing uid.");
  }

  try {
    logger.info(`Deleting user ${uid} from Auth and Firestore...`);

    await auth.deleteUser(uid);
    await db.collection("users").doc(uid).delete();

    logger.info(`Successfully deleted user ${uid}.`);
    return { success: true };
  } catch (err) {
    logger.error("deleteUserByUid error:", err);
    throw new HttpsError("internal", "Failed to delete user.");
  }
});

/**
 * When an AGENT updates a lead, create an admin notification document.
 */
exports.onLeadUpdatedCreateAdminNotification = onDocumentUpdated(
  "leads/{leadId}",
  async (event) => {
    const beforeSnap = event.data.before;
    const afterSnap = event.data.after;

    if (!afterSnap.exists) return;

    const before = beforeSnap.data();
    const after = afterSnap.data();

    // If nothing actually changed, skip
    if (JSON.stringify(before) === JSON.stringify(after)) return;

    const leadId = event.params.leadId;
    const leadName = `${after.firstName || ""} ${after.lastName || ""}`.trim();

    // Try to figure out who updated
    const updatedByUid = after.updatedBy || null;
    let updatedByName = "Unknown user";
    let updatedByRole = "unknown";

    if (updatedByUid) {
      const userDoc = await db.collection("users").doc(updatedByUid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        updatedByName = userData.fullName || userData.email || updatedByUid;
        updatedByRole = userData.role || "agent";
      }
    }

    // If we *know* it was an admin, skip
    if (updatedByRole === "admin") {
      logger.info(
        `Lead ${leadId} updated by admin (${updatedByName}); no notification created.`
      );
      return;
    }

    const latestActivity =
      after.latestActivity || after.journalLastEntry || "Lead updated.";

    const notification = {
      type: "lead-updated",
      leadId,
      leadName: leadName || "(no name)",
      updatedByUid: updatedByUid || null,
      updatedByName,
      status: after.status || null,
      relationshipRanking: after.relationshipRanking || null,
      urgencyRanking: after.urgencyRanking || null,
      latestActivity,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("adminNotifications").add(notification);

    logger.info(
      `Created admin notification for lead ${leadId} updated by ${updatedByName}`
    );
  }
);

// ---------- Helpers for merge-on-create ----------
function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s\*$/, "");
}
function normEmail(s) {
  return String(s || "").toLowerCase().trim();
}

/**
 * When a user registers, auto-merge any leads that were assigned to them
 * while they were unregistered (assignedAgentId == null),
 * matching by assignedAgentEmailNorm or assignedAgentNameNorm.
 */
exports.mergeUnregisteredLeadsOnCreate = authUser().onCreate(async (user) => {
  const uid = user.uid;
  const email = normEmail(user.email);

  let fullName = "";
  try {
    const profSnap = await db.doc(`users/${uid}`).get();
    if (profSnap.exists) {
      fullName = profSnap.data().fullName || profSnap.data().name || "";
    }
  } catch (e) {}

  const nameNorm = normName(fullName);
  const candidates = [];

  if (email) {
    const snap = await db
      .collection("leads")
      .where("assignedAgentId", "==", null)
      .where("assignedAgentEmailNorm", "==", email)
      .limit(500)
      .get();
    snap.forEach((d) => candidates.push(d));
  }

  if (nameNorm) {
    const snap = await db
      .collection("leads")
      .where("assignedAgentId", "==", null)
      .where("assignedAgentNameNorm", "==", nameNorm)
      .limit(500)
      .get();
    snap.forEach((d) => candidates.push(d));
  }

  if (candidates.length === 0) return;

  const byId = new Map();
  for (const d of candidates) byId.set(d.id, d);

  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  for (const d of byId.values()) {
    const leadRef = d.ref;
    const lead = d.data() || {};
    const oldDisplay =
      lead.assignedAgentName || lead.assignedAgentEmail || "Unregistered agent";

    const newDisplay = fullName || user.email || "Registered agent";
    const text = `System auto-converted "${oldDisplay}" → registered agent "${newDisplay}".`;

    batch.update(leadRef, {
      assignedAgentId: uid,
      assignedAgentName: newDisplay,
      assignedAgentEmail: user.email || null,
      assignedAgentNameNorm: normName(newDisplay),
      assignedAgentEmailNorm: email || null,
      updatedAt: now,
      updatedBy: uid,
      latestActivity: text,
      journalLastEntry: text,
      journal: admin.firestore.FieldValue.arrayUnion({
        id: db.collection("_").doc().id,
        createdAt: new Date(),
        createdBy: "system",
        createdByEmail: "system",
        text,
        type: "system-auto-merge",
      }),
    });
  }

  await batch.commit();
});

// functions/index.js
// const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
// const admin = require("firebase-admin");

// admin.initializeApp();

exports.notifyAdminOnLeadUpdate = onDocumentUpdated("leads/{leadId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  const leadId = event.params.leadId;

  if (!before || !after) return;

  // Optional: ignore "no meaningful change" (prevents spam)
  // If you want *literally every change*, remove this block.
  const meaningful =
    (after.latestActivityAt?.toMillis?.() || 0) !== (before.latestActivityAt?.toMillis?.() || 0) ||
    (after.updatedAt?.toMillis?.() || 0) !== (before.updatedAt?.toMillis?.() || 0) ||
    (after.latestActivityAdmin || "") !== (before.latestActivityAdmin || "") ||
    (after.latestActivity || "") !== (before.latestActivity || "") ||
    (after.journalLastEntry || "") !== (before.journalLastEntry || "");

  if (!meaningful) return;

  const leadName =
    `${after.firstName || ""} ${after.lastName || ""}`.trim() || "(No name)";

  const latest =
    after.latestActivityAdmin ||
    after.latestActivity ||
    after.journalLastEntry ||
    "Lead updated";

  const updatedByName =
    after.updatedByName ||
    after.updatedByEmail ||
    after.updatedBy ||
    "Unknown";

  const payload = {
    leadId,
    leadName,
    latestActivity: latest,
    updatedByName,
    updatedBy: after.updatedBy || null,
    isRead: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Use event.id as doc id so retries don’t duplicate notifications
  const notifId = event.id || `${leadId}_${Date.now()}`;
  await admin.firestore().collection("adminNotifications").doc(notifId).set(payload);
});
