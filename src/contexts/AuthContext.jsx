import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);      // firebase user
  const [role, setRole] = useState(null);      // "admin" | "agent" | null
  const [loading, setLoading] = useState(true);

useEffect(() => {
  const unsub = onAuthStateChanged(auth, async (fbUser) => {
    console.log("[Auth] onAuthStateChanged:", fbUser?.uid, fbUser?.email);

    if (!fbUser) {
      setUser(null);
      setRole(null);
      setLoading(false);
      return;
    }

    setUser(fbUser);
    setLoading(true);

    try {
      const ref = doc(db, "users", fbUser.uid);
      const snap = await getDoc(ref);
      console.log("[Auth] users doc exists?", snap.exists(), snap.data());

      if (snap.exists()) {
        setRole(snap.data().role || null);
      } else {
        setRole(null);
      }
    } catch (err) {
      console.error("[Auth] Error fetching role", err);
      setRole(null);
    } finally {
      setLoading(false);
    }
  });

  return () => unsub();
}, []);


  const logout = () => signOut(auth);

  const value = { user, role, loading, logout };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
