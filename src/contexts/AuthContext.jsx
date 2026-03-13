import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc, onSnapshot } from "firebase/firestore";

// ✅ Bump this whenever you change policy text/terms
const LEAD_POLICY_VERSION = "2026-01-14";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // firebase auth user
  const [role, setRole] = useState(null); // "admin" | "agent" | null
  const [profile, setProfile] = useState(null); // Firestore users/{uid} doc data
  const [loading, setLoading] = useState(true);

  // 1) Track firebase auth user
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      console.log("[Auth] onAuthStateChanged:", fbUser?.uid, fbUser?.email);

      if (!fbUser) {
        setUser(null);
        setRole(null);
        setProfile(null);
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
          const data = snap.data();
          setProfile(data);
          setRole(data.role || null);
        } else {
          setProfile(null);
          setRole(null);
        }
      } catch (err) {
        console.error("[Auth] Error fetching user profile", err);
        setProfile(null);
        setRole(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  // 2) Live listener for profile updates (role + agreement flags, etc.)
  useEffect(() => {
    if (!user?.uid) return;

    const ref = doc(db, "users", user.uid);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setProfile(null);
          setRole(null);
          return;
        }

        const data = snap.data();
        setProfile(data);
        setRole(data.role || null);
      },
      (err) => console.error("[Auth] role/profile listener error", err)
    );

    return () => unsub();
  }, [user?.uid]);

  // ✅ current policy version accessible throughout the app
  const leadPolicyVersion = LEAD_POLICY_VERSION;

  // ✅ Gate if:
  // - not accepted, OR
  // - accepted version doesn't match current version
  // Applies to admins AND agents (as requested).
  const needsLeadAgreement = useMemo(() => {
    if (!user?.uid) return false; // not signed in; RequireAuth handles
    if (!profile) return true; // signed in but no profile doc => treat as not accepted
    const accepted = profile.acceptedLeadAgreement === true;
    const version = profile.acceptedLeadAgreementVersion || null;
    return !accepted || version !== LEAD_POLICY_VERSION;
  }, [user?.uid, profile]);

  const logout = async () => {
  if (auth.currentUser?.uid) {
    sessionStorage.removeItem(
      `wrc_leads_agreement_ack_${auth.currentUser.uid}`
    );
  }
  await signOut(auth);
};


  const value = {
    user,
    role,
    profile,
    loading,
    logout,
    leadPolicyVersion,
    needsLeadAgreement,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
