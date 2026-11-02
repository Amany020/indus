"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Cpu,
  BookOpen,
  AlertTriangle,
  BarChart2,
  Users,
  Settings,
  ChevronRight,
  Shield,
  Layers,
} from "lucide-react";
import { useApp, type View, type DisplayRole } from "@/lib/context";

const NAV_ITEMS: {
  view: View;
  icon: React.ElementType;
  label: string;
  minRole: DisplayRole;
  badge?: number | string;
}[] = [
  { view: "dashboard", icon: LayoutDashboard, label: "Dashboard", minRole: "worker" },
  { view: "chat", icon: BookOpen, label: "SOP Library", minRole: "worker" },
  { view: "tips", icon: Layers, label: "Field Knowledge", minRole: "worker" },
  { view: "escalations", icon: AlertTriangle, label: "Escalations", minRole: "reviewer" },
  { view: "admin", icon: Settings, label: "Settings", minRole: "admin" },
];

const ROLE_LEVEL: Record<DisplayRole, number> = {
  worker: 0,
  reviewer: 1,
  admin: 2,
};

export default function NavRail() {
  const { view, setView, role, setRole, machine, user, factory } = useApp();

  const visibleItems = NAV_ITEMS.filter(
    (item) => ROLE_LEVEL[role] >= ROLE_LEVEL[item.minRole]
  );

  return (
    <aside className="nav-rail" aria-label="Main sidebar navigation">
      {/* Brand Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          paddingBottom: 24,
          borderBottom: "1px solid var(--color-nav-border)",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: "var(--radius-md)",
            background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
          }}
        >
          <Shield size={20} color="#FFFFFF" strokeWidth={2.2} />
        </div>
        <div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#FFFFFF",
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
            }}
          >
            {factory?.name || "IndustryMind"}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#899B96",
              fontWeight: 500,
            }}
          >
            Factory · {role.charAt(0).toUpperCase() + role.slice(1)}
          </div>
        </div>
      </div>

      {/* Nav Menu */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = view === item.view;
          return (
            <motion.button
              key={item.view}
              className={`nav-rail-item ${isActive ? "nav-rail-item--active" : ""}`}
              onClick={() => setView(item.view)}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.98 }}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span
                  style={{
                    background: "#EF4444",
                    color: "#FFFFFF",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: 9999,
                    lineHeight: 1,
                  }}
                >
                  {item.badge}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* User Profile Card (Screen 8 Reference) */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: 16,
          borderTop: "1px solid var(--color-nav-border)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            borderRadius: "var(--radius-md)",
            background: "rgba(255, 255, 255, 0.04)",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "#2563EB",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFFFFF",
              fontWeight: 700,
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            {user?.full_name ? user.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?"}
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#FFFFFF",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
              }}
            >
              {user?.full_name || "User"}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#899B96",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{role.charAt(0).toUpperCase() + role.slice(1)}</span>
              <span style={{ color: "#10B981" }}>●</span>
            </div>
          </div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as DisplayRole)}
            title="Switch User Role"
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#899B96",
              borderRadius: "var(--radius-sm)",
              fontSize: 10,
              padding: "2px 4px",
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="worker" style={{ background: "#10211D", color: "#FFF" }}>WRK</option>
            <option value="reviewer" style={{ background: "#10211D", color: "#FFF" }}>REV</option>
            <option value="admin" style={{ background: "#10211D", color: "#FFF" }}>ADM</option>
          </select>
        </div>
      </div>
    </aside>
  );
}
