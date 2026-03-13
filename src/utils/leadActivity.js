// src/utils/leadActivity.js
import { db } from "../firebase";
import {
  doc,
  updateDoc,
  serverTimestamp,
  collection,
  addDoc,
} from "firebase/firestore";

/**
 * Updates the lead doc AND writes an activity record that Admin Alerts can watch.
 */
export async function updateLeadAndLogActivity({
  leadId,
  patch = {},
  message = "Updated lead",
  actor = {},
}) {
  // actor = { uid, name, email, role: "admin"|"agent" }
  const leadRef = doc(db, "leads", leadId);

  // 1) Update lead doc
  await updateDoc(leadRef, {
    ...patch,
    lastUpdatedAt: serverTimestamp(),
    lastUpdatedByUid: actor.uid || null,
    lastUpdatedByEmail: actor.email || null,
    lastUpdatedByName: actor.name || null,
    lastUpdatedByRole: actor.role || null,
    latestActivity: message, // or keep your existing naming
  });

  // 2) Log activity event (this is what alerts should read)
  await addDoc(collection(db, "leads", leadId, "activity"), {
    type: "lead_update",
    message,
    patchKeys: Object.keys(patch || {}),
    actorUid: actor.uid || null,
    actorEmail: actor.email || null,
    actorName: actor.name || null,
    actorRole: actor.role || null,
    createdAt: serverTimestamp(),
  });
}
