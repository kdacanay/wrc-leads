// src/hooks/useAgents.js
import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

export default function useAgents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "users"),
      where("role", "==", "agent")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setAgents(list);
        setLoading(false);
      },
      (err) => {
        console.error("Error loading agents:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  return { agents, loading };
}
