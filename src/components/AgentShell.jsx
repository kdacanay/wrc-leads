import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function AgentShell({ children }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  async function handleLogout() {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Logout failed:", err);
      alert("There was a problem logging out.");
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-wrcGray)] flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-[#fff200] border border-black/10" />
            <div>
              <div className="text-sm text-gray-500">
                Weichert Realtors Cornerstone
              </div>
              <div className="text-2xl font-extrabold text-[var(--color-wrcBlack)]">
                WRC Leads — Agent
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-extrabold text-[var(--color-wrcBlack)]">
                Agent
              </div>
              <div className="text-sm text-gray-500">{user?.email}</div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="px-6 py-3 rounded-md bg-black text-white text-sm font-extrabold hover:opacity-90"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="h-2 bg-[#fff200]" />
      </header>

      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}