import React from "react";
import { useLocation } from "react-router-dom";
import Navbar from "./Navbar";

export default function AppShell({ children }) {
  const location = useLocation();

  // Treat admin routes as full-width dashboards
  const isAdmin = location.pathname.startsWith("/admin");

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <Navbar />

      <main className="flex-1">
        {isAdmin ? (
          /* ===== FULL-WIDTH ADMIN LAYOUT ===== */
          <div className="w-full px-4 sm:px-6 lg:px-10 py-6">
            {children}
          </div>
        ) : (
          /* ===== STANDARD BOXED LAYOUT ===== */
          <div className="max-w-5xl mx-auto px-4 py-6">
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-5 sm:p-6">
              {children}
            </div>
          </div>
        )}
      </main>

      <footer className="py-4 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} Weichert, Realtors – Cornerstone
      </footer>
    </div>
  );
}
