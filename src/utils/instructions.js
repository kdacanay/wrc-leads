// src/utils/instructions.js
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Create an instruction doc and also update the lead doc with latestInstructionText/latestInstructionAt
 * so list views can show “Latest instruction” without reading subcollections.
 */
export async function addInstructionToLead(leadId, { text, adminUid, adminEmail }) {
  const clean = String(text || "").trim();
  if (!leadId) throw new Error("Missing leadId");
  if (!clean) throw new Error("Instruction text is required");

  // 1) Create instruction doc
  await addDoc(collection(db, "leads", leadId, "instructions"), {
    text: clean,
    createdAt: serverTimestamp(),
    createdBy: adminUid || null,
    createdByEmail: adminEmail || null,
  });

  // 2) Update the lead doc (agent-safe summary fields)
  await updateDoc(doc(db, "leads", leadId), {
    latestInstructionText: clean,
    latestInstructionAt: serverTimestamp(),
  });
}
