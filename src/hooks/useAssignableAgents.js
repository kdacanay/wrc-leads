// src/hooks/useAssignableAgents.js
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { normEmail, normName } from "../utils/normalize"; // adjust import path

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

    // ---- deterministic key for placeholders ----
    function placeholderKey({ email, name }) {
      const e = normEmail(email || "");
      if (e) return `unregEmail:${e}`;
      const n = normName(String(name || "").replace(/\s*\*$/, ""));
      if (n) return `unregName:${n}`;
      return "";
    }

    function displayName(name) {
      const clean = String(name || "").replace(/\s*\*$/, "").trim();
      return clean ? `${clean} *` : "(Unnamed) *";
    }

    const recompute = () => {
      // 1) Registered users always included (not placeholders)
      const merged = currentUsers.map((u) => ({
        id: u.id,
        name: u.fullName || u.email || "Unnamed user",
        email: u.email || "",
        isPlaceholder: false,
      }));

      // 2) Build placeholder map (so we can merge unregisteredAgents + derivedFromLeads)
      const ph = new Map(); // key -> row

      const upsertPlaceholder = ({ id, name, email }) => {
        const key = placeholderKey({ email, name });
        if (!key) return;

        const prev = ph.get(key);
        if (!prev) {
          ph.set(key, {
            id, // keep a real-ish id if possible
            name: displayName(name),
            email: (email || "").trim(),
            isPlaceholder: true,
          });
          return;
        }

        // merge: keep an id that points to real unregisteredAgents doc if we have it
        if (String(prev.id || "").startsWith("lead-unreg:") && id && !String(id).startsWith("lead-unreg:")) {
          prev.id = id;
        }

        // keep best email/name
        if (!prev.email && email) prev.email = String(email).trim();
        const prevNameClean = String(prev.name || "").replace(/\s*\*$/, "").trim();
        const nextNameClean = String(name || "").replace(/\s*\*$/, "").trim();
        if ((!prevNameClean || prevNameClean === "(Unnamed)") && nextNameClean) {
          prev.name = displayName(nextNameClean);
        }
      };

      // 2a) Placeholders from Firestore collection (authoritative)
      currentUnregistered.forEach((u) => {
        upsertPlaceholder({
          id: `unreg:${u.id}`, // stable reference to the doc
          name: u.name,
          email: u.email,
        });
      });

      // 2b) Placeholders derived from leads (only fills gaps; can’t create dupes now)
      derivedFromLeads.forEach((u) => {
        upsertPlaceholder({
          id: `lead-unreg:${u.key}`,
          name: u.name,
          email: u.email,
        });
      });

      // 3) Add placeholders to merged
      merged.push(...Array.from(ph.values()));

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
      const map = new Map(); // placeholderKey -> { key, name, email }

      snap.docs.forEach((d) => {
        const lead = d.data();

        // We only derive "unregistered" placeholders from leads that do NOT have assignedAgentId
        // (If you also want to derive secondary unregistered agents from assignedAgents, tell me and I’ll add it.)
        if (lead.assignedAgentId) return;

        const name = (lead.assignedAgentName || "").trim();
        const email = (lead.assignedAgentEmailNorm || lead.assignedAgentEmail || "").trim();

        const e = normEmail(email);
        const n = normName(name);

        // deterministic key (email first)
        const key = e ? `unregEmail:${e}` : n ? `unregName:${n}` : "";
        if (!key) return;

        if (!map.has(key)) {
          map.set(key, { key, name, email });
        } else {
          // keep an email if we later discover it
          const existing = map.get(key);
          if (!existing.email && email) existing.email = email;
          if (!existing.name && name) existing.name = name;
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
