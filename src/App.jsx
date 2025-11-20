import React from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import AppShell from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import AdminDashboard from "./pages/AdminDashboard";
import AgentLeadPage from "./pages/AgentLeadPage";
import { useAuth } from "./contexts/AuthContext";
import RequireAdmin from "./components/RequireAdmin";
import AdminLeadPage from "./pages/AdminLeadPage";
import AgentHomePage from "./pages/AgentHomePage";

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-sm text-gray-600">Loading...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RoleRedirect() {
  const { role } = useAuth();
  if (role === "admin") return <Navigate to="/admin" replace />;
  if (role === "agent") return <Navigate to="/agent" replace />;
  return (
    <div className="text-sm text-gray-600">
      No role set for this user.
    </div>
  );
}


export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
      <Route
  path="/agent"
  element={
    <AppShell>
      <AgentHomePage />
    </AppShell>
  }
/>
<Route
  path="/agent/:leadId"
  element={
    <AppShell>
      <AgentLeadPage />
    </AppShell>
  }
/>
        <Route
          path="/"
          element={
            <AppShell>
              <RoleRedirect />
            </AppShell>
          }
        />
        <Route
          path="/admin"
          element={
            <AppShell>
              <AdminDashboard />
            </AppShell>
          }
        />
        <Route
          path="/agent/:leadId"
          element={
            <AppShell>
              <AgentLeadPage />
            </AppShell>
          }
        />
        <Route
  path="/admin/lead/:leadId"
  element={
    <RequireAdmin>
      <AppShell>

        <AdminLeadPage />
      </AppShell>
      
    </RequireAdmin>
  }
/>

      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
