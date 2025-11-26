// src/services/leadActivityService.js
import { doc, updateDoc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Log an activity entry on a lead.
 *
 * - Appends to `journal`
 * - Updates `journalLastEntry`
 * - Updates `latestActivity`
 * - Touches `updatedAt` / `updatedBy`
 */
export async function logLeadActivity(leadId, text, user) {
  if (!leadId || !text) return;

  const ref = doc(db, "leads", leadId);

  await updateDoc(ref, {
    journalLastEntry: text,
    latestActivity: text, // keep as string for compatibility with existing data
    updatedAt: serverTimestamp(),
    updatedBy: user?.uid || null,

    journal: arrayUnion({
      id: crypto.randomUUID(),
      createdAt: serverTimestamp(),
      createdBy: user?.uid || null,
      createdByEmail: user?.email || null,
      text,
      type: "update",
    }),
  });
}
