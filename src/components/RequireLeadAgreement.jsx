import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function RequireLeadAgreement() {
  const { loading, user, needsLeadAgreement } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-sm text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Allow the agreement page itself
  if (location.pathname === "/lead-agreement") return <Outlet />;

  // ✅ One-time gate (persisted in Firestore via needsLeadAgreement)
  if (needsLeadAgreement) {
    return (
      <Navigate
        to="/lead-agreement"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return <Outlet />;
}
