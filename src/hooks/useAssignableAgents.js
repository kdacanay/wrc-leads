// src/hooks/useAssignableAgents.js
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export default function useAssignableAgents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const usersRef = collection(db, "users");
    const unregisteredRef = collection(db, "unregisteredAgents");
    const leadsRef = collection(db, "leads");

    let currentUsers = [];
    let currentUnregistered = [];
    let derivedFromLeads = [];

    const recompute = () => {
      const merged = [];

      // 1) Registered users from "users"
      currentUsers.forEach((u) => {
        merged.push({
          id: u.id,
          name: u.fullName || u.email || "Unnamed user",
          email: u.email || "",
          isPlaceholder: false,
        });
      });

      // helper to add placeholders safely
      const addPlaceholder = ({ id, name, email }) => {
        const cleanName = (name || "").replace(/\s\*$/, "").trim();
        const cleanEmail = (email || "").trim();

        if (!cleanName && !cleanEmail) return;

        // avoid dupes by name or email
        const already = merged.some((m) => {
          const mName = (m.name || "").replace(/\s\*$/, "").trim().toLowerCase();
          const mEmail = (m.email || "").trim().toLowerCase();
          return (
            (cleanName && mName === cleanName.toLowerCase()) ||
            (cleanEmail && mEmail === cleanEmail.toLowerCase())
          );
        });

        if (already) return;

        merged.push({
          id,
          name: cleanName ? `${cleanName} *` : "(Unnamed) *",
          email: cleanEmail,
          isPlaceholder: true,
        });
      };

      // 2) Placeholders from "unregisteredAgents" collection (if it exists)
      currentUnregistered.forEach((u) => {
        addPlaceholder({
          id: `unreg:${u.id}`,
          name: u.name,
          email: u.email,
        });
      });

      // 3) Placeholders derived from leads (works even if unregisteredAgents doesn't exist)
      derivedFromLeads.forEach((u) => {
        addPlaceholder({
          id: `lead-unreg:${u.key}`, // stable-ish id
          name: u.name,
          email: u.email,
        });
      });

      merged.sort((a, b) =>
        (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())
      );

      setAgents(merged);
      setLoading(false);
    };

    const unsubUsers = onSnapshot(usersRef, (snap) => {
      currentUsers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      recompute();
    });

    const unsubUnregistered = onSnapshot(unregisteredRef, (snap) => {
      currentUnregistered = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      recompute();
    });

    const unsubLeads = onSnapshot(leadsRef, (snap) => {
      const map = new Map();

      snap.docs.forEach((d) => {
        const lead = d.data();

        // only unregistered assignments
        if (lead.assignedAgentId) return;

        const name = (lead.assignedAgentName || "").trim();
        const email = (lead.assignedAgentEmail || "").trim();
        if (!name && !email) return;

        const key = (name || email).toLowerCase();
        if (!map.has(key)) {
          map.set(key, { key, name, email });
        } else {
          // if we later find an email, keep it
          const existing = map.get(key);
          if (!existing.email && email) existing.email = email;
        }
      });

      derivedFromLeads = Array.from(map.values());
      recompute();
    });

    return () => {
      unsubUsers();
      unsubUnregistered();
      unsubLeads();
    };
  }, []);

  return { agents, loading };
}
