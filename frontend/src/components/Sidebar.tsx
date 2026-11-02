"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useApp, View, DisplayRole } from "@/lib/context";

interface NavItem {
  id: View;
  label: string;
  icon: string;
  badge?: string;
}

export default function Sidebar() {
  const router = useRouter();
  const { view, setView, user, role, setRole } = useApp();

  const navItems: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "chat", label: "AI Copilot", icon: "💬" },
    { id: "documents", label: "Manuals & SOPs", icon: "📄" },
    { id: "escalations", label: "Escalations", icon: "🚨" },
    { id: "tips", label: "Expert Tips", icon: "💡" },
    { id: "admin", label: "Administration", icon: "⚙️" },
  ];

  return (
    <aside className="w-64 bg-[#10211D] text-white flex flex-col justify-between border-r border-[#1E3832] select-none h-screen shrink-0">
      {/* Brand Header */}
      <div>
        <div className="p-5 border-b border-[#1E3832] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center font-bold text-gray-950 text-base shadow-md shadow-emerald-900/40">
              IM
            </div>
            <div>
              <div className="font-bold tracking-tight text-sm text-white flex items-center gap-1.5">
                Industry<span className="text-emerald-400 font-extrabold">Mind</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              </div>
              <p className="text-[10px] text-gray-400 font-mono tracking-wider uppercase">
                Enterprise AI OS
              </p>
            </div>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="p-3 space-y-1 mt-2">
          {navItems.map((item) => {
            const isActive = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-[#1E3832] text-white shadow-sm font-semibold border-l-4 border-emerald-400"
                    : "text-gray-300 hover:bg-[#162D28] hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-mono">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User & Role footer matching reference image */}
      <div className="p-4 border-t border-[#1E3832] bg-[#0C1A17]/60">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-xs font-bold text-white shadow-inner">
                {user?.full_name ? user.full_name[0].toUpperCase() : "OP"}
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#10211D]"></span>
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-semibold text-white truncate max-w-[110px]">
                {user?.full_name || "Active Operator"}
              </div>
              <div className="text-[10px] text-gray-400 uppercase font-mono tracking-wider">
                {role}
              </div>
            </div>
          </div>

          <button
            onClick={() => router.push("/login")}
            title="Switch Account / Sign In"
            className="text-[11px] px-2.5 py-1 rounded-lg bg-[#1E3832] hover:bg-[#284C44] text-emerald-300 border border-emerald-500/20 transition-all font-mono"
          >
            {user ? "Switch" : "Login"}
          </button>
        </div>

        {/* Quick Role Switcher for instant testing */}
        <div className="flex items-center justify-between pt-2 border-t border-[#1E3832]/80 text-[10px]">
          <span className="text-gray-400">Role View:</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as DisplayRole)}
            className="bg-[#142924] border border-[#1E3832] text-emerald-300 text-[11px] rounded px-2 py-0.5 outline-none font-mono"
          >
            <option value="worker">Worker</option>
            <option value="reviewer">Reviewer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
    </aside>
  );
}
