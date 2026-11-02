"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/context";
import { api, Factory, Branch, Machine } from "@/lib/api";

export default function TopBar() {
  const router = useRouter();
  const {
    factory,
    setFactory,
    branch,
    setBranch,
    machine,
    setMachine,
    user,
  } = useApp();

  const [factories, setFactories] = useState<Factory[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [showAddMachine, setShowAddMachine] = useState(false);
  const [newMachineName, setNewMachineName] = useState("");
  const [newWorkcell, setNewWorkcell] = useState("");
  const [newModel, setNewModel] = useState("");

  useEffect(() => {
    loadFactories();
  }, []);

  useEffect(() => {
    if (factory?.id) {
      loadBranches(factory.id);
      loadMachines(factory.id);
    } else {
      loadMachines();
    }
  }, [factory]);

  const loadFactories = async () => {
    try {
      const data = await api.getFactories();
      setFactories(data);
      if (data.length > 0 && !factory) {
        setFactory(data[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadBranches = async (fId: string) => {
    try {
      const data = await api.getBranches(fId);
      setBranches(data);
      if (data.length > 0 && !branch) {
        setBranch(data[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadMachines = async (fId?: string) => {
    try {
      const data = await api.getMachines(fId);
      setMachines(data);
      if (data.length > 0 && (!machine || !data.some((m) => m.id === machine.id))) {
        setMachine(data[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMachineName.trim()) return;
    try {
      const created = await api.createMachine({
        name: newMachineName.trim(),
        workcell: newWorkcell.trim() || "Cell-01",
        model_number: newModel.trim() || "MOD-X1",
      });
      setMachines((prev) => [...prev, created]);
      setMachine(created);
      setNewMachineName("");
      setNewWorkcell("");
      setNewModel("");
      setShowAddMachine(false);
    } catch (err: any) {
      alert("Failed to create machine: " + err.message);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shadow-xs select-none">
      {/* Left: Factory, Branch & Machine Selectors */}
      <div className="flex items-center gap-4">
        {/* Factory Selector */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 font-mono">
            Factory:
          </span>
          <select
            value={factory?.id || ""}
            onChange={(e) => {
              const selected = factories.find((f) => f.id === e.target.value);
              if (selected) setFactory(selected);
            }}
            className="text-xs font-semibold text-gray-800 bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none hover:border-emerald-500 transition-all cursor-pointer"
          >
            {factories.length === 0 ? (
              <option value="">No Factory Registered</option>
            ) : (
              factories.map((f) => (
                <option key={f.id} value={f.id}>
                  🏭 {f.name}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Branch Selector */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 font-mono">
            Branch:
          </span>
          <select
            value={branch?.id || ""}
            onChange={(e) => {
              const selected = branches.find((b) => b.id === e.target.value);
              if (selected) setBranch(selected);
            }}
            className="text-xs font-semibold text-gray-800 bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none hover:border-emerald-500 transition-all cursor-pointer"
          >
            {branches.length === 0 ? (
              <option value="">General Branch</option>
            ) : (
              branches.map((b) => (
                <option key={b.id} value={b.id}>
                  📍 {b.name}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Active Machine */}
        <div className="flex items-center gap-2 pl-2 border-l border-gray-200">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 font-mono">
            Machine:
          </span>
          <select
            value={machine?.id || ""}
            onChange={(e) => {
              const selected = machines.find((m) => m.id === e.target.value);
              if (selected) setMachine(selected);
            }}
            className="text-xs font-semibold text-emerald-800 bg-emerald-50/60 border border-emerald-300 rounded-lg px-2.5 py-1.5 outline-none hover:border-emerald-600 transition-all cursor-pointer"
          >
            {machines.length === 0 ? (
              <option value="">No Machines Found</option>
            ) : (
              machines.map((m) => (
                <option key={m.id} value={m.id}>
                  ⚙️ {m.name} ({m.workcell})
                </option>
              ))
            )}
          </select>

          <button
            onClick={() => setShowAddMachine(true)}
            title="Register Machine"
            className="text-xs px-2 py-1 rounded-lg bg-gray-100 hover:bg-emerald-100 text-gray-700 hover:text-emerald-800 border border-gray-300 transition-all font-medium"
          >
            + Add Machine
          </button>
        </div>
      </div>

      {/* Right: Telemetry pill & User Sign In */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Live Production Node</span>
        </div>

        <button
          onClick={() => router.push("/login")}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 hover:border-emerald-500 text-xs font-semibold text-gray-800 bg-white hover:bg-gray-50 transition-all shadow-xs"
        >
          <span className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px] font-bold">
            {user?.full_name ? user.full_name[0].toUpperCase() : "👤"}
          </span>
          <span>{user?.full_name || (user ? "User" : "Sign In / Register")}</span>
        </button>
      </div>

      {/* Modal for adding real machine */}
      {showAddMachine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-6 w-full max-w-sm">
            <h3 className="text-base font-bold text-gray-900 mb-3">Add Real Machine</h3>
            <form onSubmit={handleCreateMachine} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Machine Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CNC Milling Unit 04"
                  value={newMachineName}
                  onChange={(e) => setNewMachineName(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Workcell</label>
                <input
                  type="text"
                  placeholder="e.g. Line 2 - Cell A"
                  value={newWorkcell}
                  onChange={(e) => setNewWorkcell(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Model Number</label>
                <input
                  type="text"
                  placeholder="e.g. FANUC-Robodrill-α-D21"
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddMachine(false)}
                  className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="text-xs px-4 py-1.5 bg-[#1B4D44] text-white rounded-lg font-medium hover:bg-[#133932]"
                >
                  Save Machine
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
