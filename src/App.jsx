import React from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import AppShell from "./components/AppShell";
import AgentShell from "./components/AgentShell";
import LoginPage from "./pages/LoginPage";
import LeadAgreementPage from "./pages/LeadAgreementPage";

import AdminDashboard from "./pages/AdminDashboard";
import AdminLeadPage from "./pages/AdminLeadPage";
import AgentHomePage from "./pages/AgentHomePage";
import AgentLeadPage from "./pages/AgentLeadPage";
// import AgentViewPage from "./pages/AgentViewPage";

import { useAuth } from "./contexts/AuthContext";
import RequireAdmin from "./components/RequireAdmin";
import RequireLeadAgreement from "./components/RequireLeadAgreement";

function LoadingScreen({ text = "Loading..." }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-sm text-gray-600">{text}</div>
    </div>
  );
}

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RequireAgent() {
  const { user, loading, role } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!role) return <LoadingScreen text="Loading role..." />;

  if (role === "admin") return <Navigate to="/admin" replace />;
  if (role !== "agent") return <Navigate to="/" replace />;

  return <Outlet />;
}

function RoleRedirect() {
  const { user, loading, role } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  if (role === "admin") return <Navigate to="/admin" replace />;
  if (role === "agent") return <Navigate to="/agent" replace />;

  return <div className="text-sm text-gray-600">No role set for this user.</div>;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Signed-in */}
      <Route element={<RequireAuth />}>
        {/* Agreement gate: everything (except /lead-agreement) */}
        <Route element={<RequireLeadAgreement />}>
          {/* Root */}
          <Route
            path="/"
            element={
              <AppShell>
                <RoleRedirect />
              </AppShell>
            }
          />

          {/* ADMIN */}
          <Route element={<RequireAdmin />}>
            <Route
              path="/admin"
              element={
                <AppShell>
                  <AdminDashboard />
                </AppShell>
              }
            />
            <Route
              path="/admin/lead/:leadId"
              element={
                <AppShell>
                  <AdminLeadPage />
                </AppShell>
              }
            />
          </Route>

          {/* AGENT */}
          <Route element={<RequireAgent />}>
            <Route
              path="/agent"
              element={
                <AgentShell>
                  <AgentHomePage />
                </AgentShell>
              }
            />

            {/* ✅ Restore this so clicking a lead works */}
            <Route
              path="/agent/:leadId"
              element={
                <AgentShell>
                  <AgentLeadPage />
                                </AgentShell>
              }
            />
          </Route>
        </Route>

        {/* Agreement page is allowed while signed in */}
        <Route path="/lead-agreement" element={<LeadAgreementPage />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
