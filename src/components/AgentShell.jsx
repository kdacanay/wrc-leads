// src/components/AgentShell.jsx
import React from "react";
import Navbar from "./Navbar";

export default function AgentShell({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <Navbar />

      <main className="flex-1 w-full">
        {/* Full-width page area */}
        <div className="w-full px-2 sm:px-4 lg:px-6 py-6">
          {children}
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} Weichert, Realtors – Cornerstone
      </footer>
    </div>
  );
}
