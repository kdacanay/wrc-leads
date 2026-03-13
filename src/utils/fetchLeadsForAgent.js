// src/utils/fetchLeadsForAgent.js
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

const cleanAgentName = (name = "") => name.replace(/\s*\*+$/, "").trim();

export async function fetchLeadsForAgent(agent) {
  const leadsCol = collection(db, "leads");

  // ✅ Registered agent -> match by assignedAgentId
  if (agent?.id && !agent?.isUnregistered && !agent?.isPlaceholder) {
    const q = query(leadsCol, where("assignedAgentId", "==", agent.id));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  // ✅ Unregistered agent -> match by assignedAgentEmail and/or assignedAgentName
  const email = (agent?.email || "").trim().toLowerCase();
  const name = cleanAgentName(agent?.name || "");

  const results = new Map();

  if (email) {
    const qEmail = query(leadsCol, where("assignedAgentEmail", "==", email));
    const sEmail = await getDocs(qEmail);
    sEmail.docs.forEach((d) => results.set(d.id, { id: d.id, ...d.data() }));
  }

  if (name) {
    const qName = query(
      leadsCol,
      where("assignedAgentId", "==", null),
      where("assignedAgentName", "==", name)
    );
    const sName = await getDocs(qName);
    sName.docs.forEach((d) => results.set(d.id, { id: d.id, ...d.data() }));
  }

  return Array.from(results.values());
}
