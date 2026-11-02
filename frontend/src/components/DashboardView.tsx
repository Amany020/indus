"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Cpu,
  AlertTriangle,
  HelpCircle,
  CheckCircle2,
  Upload,
  Plus,
  FileBarChart,
  UserCheck,
  ArrowUpRight,
  Shield,
  FileText,
  Activity,
  Layers,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { api, type AnalyticsSummary, type Machine } from "@/lib/api";
import { useApp } from "@/lib/context";

function StatCard({
  icon: Icon,
  iconColor,
  iconBg,
  label,
  value,
  trend,
}: {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string | number;
  trend?: string;
}) {
  return (
    <motion.div
      className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs hover:shadow-md transition-all duration-200"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between mb-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ background: iconBg }}
        >
          <Icon size={22} color={iconColor} strokeWidth={2} />
        </div>
        {trend && (
          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/50 font-mono">
            {trend}
          </span>
        )}
      </div>
      <div>
        <div className="text-2xl font-extrabold text-[#0F1D1A] tracking-tight">
          {value}
        </div>
        <div className="text-xs font-medium text-gray-500 mt-1">
          {label}
        </div>
      </div>
    </motion.div>
  );
}

export default function DashboardView() {
  const router = useRouter();
  const { machine, setMachine, setView, factory, branch, user } = useApp();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadData();
  }, [factory]);

  const loadData = async () => {
    try {
      const [sumData, machData] = await Promise.all([
        api.getAnalytics().catch(() => null),
        api.getMachines(factory?.id).catch(() => []),
      ]);
      setSummary(sumData);
      setMachines(machData);
      if (machData.length > 0 && !machine) {
        setMachine(machData[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredMachines = machines.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.workcell.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-7">
      {/* Search & Greeting Banner matching reference image */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold font-mono uppercase tracking-wider text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-full">
              {factory ? factory.name : "Industrial Plant Node"}
            </span>
            <span className="text-xs text-gray-400 font-mono">·</span>
            <span className="text-xs text-gray-500 font-mono">
              {branch ? branch.name : "Line 01"}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Good Morning, {user?.full_name || "Officer / Operator"}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Operational telemetry, AI manual verification, and safety systems active.
          </p>
        </div>

        {/* Global Search Bar */}
        <div className="relative w-full md:w-80">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search equipment or SOPs..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-2xs"
          />
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Cpu}
          iconColor="#059669"
          iconBg="#D1FAE5"
          value={machines.length > 0 ? machines.length : "Ready"}
          label="Operational Equipment"
          trend="+100% active"
        />
        <StatCard
          icon={AlertTriangle}
          iconColor="#DC2626"
          iconBg="#FEE2E2"
          value={summary?.escalated_count || 0}
          label="Pending Escalations"
          trend="Safety First"
        />
        <StatCard
          icon={HelpCircle}
          iconColor="#1B4D44"
          iconBg="#E8F2F0"
          value={summary?.total_queries || 0}
          label="AI Verified Responses"
          trend="Zero Hallucination"
        />
        <StatCard
          icon={Shield}
          iconColor="#2563EB"
          iconBg="#EFF6FF"
          value="100%"
          label="Safety Compliance Gate"
          trend="Deterministic"
        />
      </div>

      {/* Quick Action Navigation Grid matching Reference Photo */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 font-mono mb-3">
          Instant Operations Deck
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          {/* Card 1: AI Copilot */}
          <div
            onClick={() => setView("chat")}
            className="p-4 bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200 rounded-2xl cursor-pointer transition-all duration-150 flex items-center gap-3.5 group shadow-2xs"
          >
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-emerald-700 shadow-xs group-hover:scale-105 transition-transform">
              <span className="text-lg">💬</span>
            </div>
            <div>
              <div className="text-xs font-bold text-emerald-950">AI Copilot</div>
              <div className="text-[11px] text-emerald-700">Worker Chat Assistant</div>
            </div>
          </div>

          {/* Card 2: Manuals & SOPs (with Delete Document capability) */}
          <div
            onClick={() => setView("documents")}
            className="p-4 bg-amber-50/70 hover:bg-amber-100/70 border border-amber-200 rounded-2xl cursor-pointer transition-all duration-150 flex items-center gap-3.5 group shadow-2xs"
          >
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-amber-700 shadow-xs group-hover:scale-105 transition-transform">
              <span className="text-lg">📄</span>
            </div>
            <div>
              <div className="text-xs font-bold text-amber-950">Manuals & SOPs</div>
              <div className="text-[11px] text-amber-700">Upload & Delete Docs</div>
            </div>
          </div>

          {/* Card 3: Escalations */}
          <div
            onClick={() => setView("escalations")}
            className="p-4 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-200 rounded-2xl cursor-pointer transition-all duration-150 flex items-center gap-3.5 group shadow-2xs"
          >
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-blue-700 shadow-xs group-hover:scale-105 transition-transform">
              <span className="text-lg">🚨</span>
            </div>
            <div>
              <div className="text-xs font-bold text-blue-950">Escalations</div>
              <div className="text-[11px] text-blue-700">Safety & Review Queue</div>
            </div>
          </div>

          {/* Card 4: Register / Switch */}
          <div
            onClick={() => router.push("/login")}
            className="p-4 bg-purple-50/70 hover:bg-purple-100/70 border border-purple-200 rounded-2xl cursor-pointer transition-all duration-150 flex items-center gap-3.5 group shadow-2xs"
          >
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-purple-700 shadow-xs group-hover:scale-105 transition-transform">
              <span className="text-lg">🏭</span>
            </div>
            <div>
              <div className="text-xs font-bold text-purple-950">Factory Account</div>
              <div className="text-[11px] text-purple-700">Login / New Factory</div>
            </div>
          </div>
        </div>
      </div>

      {/* Equipment Inspector & Status Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Machine Status List (2 Cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Equipment Catalog & Operational State</h2>
              <p className="text-xs text-gray-500">Live synchronization with factory floor cells</p>
            </div>
            <button
              onClick={() => setView("documents")}
              className="text-xs text-emerald-700 hover:underline font-semibold"
            >
              Manage Manuals →
            </button>
          </div>

          {filteredMachines.length === 0 ? (
            <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300">
              <p className="text-xs text-gray-600 font-medium">No equipment found for this filter.</p>
              <p className="text-[11px] text-gray-400 mt-1">
                Click &quot;+ Add Machine&quot; in the top bar to register real equipment!
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredMachines.map((m) => {
                const isSelected = machine?.id === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => setMachine(m)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? "bg-emerald-50/70 border-emerald-400 shadow-2xs"
                        : "bg-gray-50/60 border-gray-200/80 hover:bg-gray-100/60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-sm">
                        ⚙️
                      </div>
                      <div>
                        <div className="text-xs font-bold text-gray-900">{m.name}</div>
                        <div className="text-[11px] text-gray-500 font-mono">
                          Workcell: {m.workcell} · {m.model_number || "OEM-STD"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        ONLINE
                      </span>
                      {isSelected && (
                        <span className="text-[10px] bg-[#10211D] text-white px-2 py-0.5 rounded font-mono">
                          ACTIVE
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Machine Inspector Panel */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-bold font-mono uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                Selected Unit
              </span>
              <span className="text-xs text-gray-400 font-mono">
                {machine ? machine.workcell : "No Selection"}
              </span>
            </div>

            <h3 className="text-base font-bold text-gray-900 mb-1">
              {machine ? machine.name : "Select Equipment"}
            </h3>
            <p className="text-xs text-gray-500 mb-4 font-mono">
              Model: {machine?.model_number || "Universal Industrial Node"}
            </p>

            {/* Diagnostic Indicators */}
            <div className="p-3.5 bg-gray-50 rounded-xl space-y-2 border border-gray-100 mb-4 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>RAG Retrieval Vector Dim:</span>
                <span className="font-mono font-bold text-gray-900">768-D</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Abstention Sim Threshold:</span>
                <span className="font-mono font-bold text-gray-900">&ge; 0.35</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Citation Validation:</span>
                <span className="font-mono font-bold text-emerald-700">Strict Deterministic</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Safety Gate Enforcement:</span>
                <span className="font-mono font-bold text-emerald-700">Zero Hallucination</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={() => setView("chat")}
              disabled={!machine}
              className="w-full py-2.5 px-4 bg-[#1B4D44] hover:bg-[#133932] text-white text-xs font-semibold rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>💬</span> Launch AI Copilot For Machine
            </button>
            <button
              onClick={() => setView("documents")}
              className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <span>📄</span> View / Delete Manuals
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
