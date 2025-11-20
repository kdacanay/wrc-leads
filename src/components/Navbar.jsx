import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function Navbar() {
  const { user, role, logout } = useAuth();
  const location = useLocation();

  const isLogin = location.pathname === "/login";

  if (isLogin) return null; // no navbar on login

  return (
    <header className="bg-wrcYellow border-b border-gray-300">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-wrcBlack rounded-sm flex items-center justify-center text-wrcYellow font-bold text-sm">
            W
          </div>
          <div className="leading-tight">
            <div className="font-bold text-sm text-wrcBlack">
              Weichert Realtors Cornerstone
            </div>
            <div className="text-xs text-gray-800">
              Lead Management Dashboard
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          {role && (
            <span className="px-2 py-1 rounded-full bg-black text-wrcYellow font-semibold uppercase tracking-wide">
              {role}
            </span>
          )}
          {user && (
            <div className="hidden sm:flex flex-col text-right">
              <span className="font-medium text-xs text-wrcBlack">
                {user.email}
              </span>
              <button
                onClick={logout}
                className="text-[11px] text-blue-700 underline hover:text-blue-900"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
