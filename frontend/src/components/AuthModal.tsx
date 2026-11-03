"use client";

import React, { useState, useEffect } from "react";
import { useApp } from "@/lib/context";
import { api, Factory, Branch } from "@/lib/api";

export default function AuthModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, setUser, factory, setFactory, branch, setBranch, setRole } = useApp();
  const [mode, setMode] = useState<"login" | "signup">("login");
  
  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setUserRole] = useState("worker");
  const [factoryId, setFactoryId] = useState("");
  const [branchId, setBranchId] = useState("");
  
  // New factory / branch creation
  const [newFactoryName, setNewFactoryName] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [showCreateFactory, setShowCreateFactory] = useState(false);
  const [showCreateBranch, setShowCreateBranch] = useState(false);

  // Lists
  const [factories, setFactories] = useState<Factory[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadFactories();
    }
  }, [isOpen]);

  useEffect(() => {
    if (factoryId) {
      loadBranches(factoryId);
    } else {
      setBranches([]);
    }
  }, [factoryId]);

  const loadFactories = async () => {
    try {
      const data = await api.getFactories();
      setFactories(data);
      if (data.length > 0 && !factoryId) {
        setFactoryId(data[0].id);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadBranches = async (fId: string) => {
    try {
      const data = await api.getBranches(fId);
      setBranches(data);
      if (data.length > 0) {
        setBranchId(data[0].id);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleCreateFactory = async () => {
    if (!newFactoryName.trim()) return;
    try {
      setLoading(true);
      const created = await api.createFactory(newFactoryName.trim());
      setFactories((prev) => [...prev, created]);
      setFactoryId(created.id);
      setFactory(created);
      setNewFactoryName("");
      setShowCreateFactory(false);
    } catch (err: any) {
      setError(err.message || "Failed to create factory");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBranch = async () => {
    if (!newBranchName.trim() || !factoryId) return;
    try {
      setLoading(true);
      const created = await api.createBranch(newBranchName.trim(), factoryId);
      setBranches((prev) => [...prev, created]);
      setBranchId(created.id);
      setBranch(created);
      setNewBranchName("");
      setShowCreateBranch(false);
    } catch (err: any) {
      setError(err.message || "Failed to create branch");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "signup") {
        if (!email || !password || !name) {
          throw new Error("Please fill in email, password, and full name");
        }
        const createdUser = await api.signup({
          email,
          password,
          name,
          role,
          factory_id: factoryId,
          branch_id: branchId,
        });

        // Auto login or set state
        setUser(createdUser);
        const curFactory = factories.find((f) => f.id === factoryId) || null;
        const curBranch = branches.find((b) => b.id === branchId) || null;
        if (curFactory) setFactory(curFactory);
        if (curBranch) setBranch(curBranch);
        onClose();
      } else {
        if (!email || !password) {
          throw new Error("Please enter email and password");
        }
        const res = await api.login({ email, password });
        setUser(res.user);
        if (res.user.factory_id) {
          const curFactory = factories.find((f) => f.id === res.user.factory_id) || null;
          if (curFactory) setFactory(curFactory);
        }
        onClose();
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#10211D] p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg w-8 h-8 rounded-full flex items-center justify-center bg-white/10"
          >
            ✕
          </button>
          <div className="flex items-center gap-2 mb-2">
            <img src="/industrymind_logo.png" alt="IndustryMind Logo" className="w-7 h-7 object-contain" />
            <span className="text-xs uppercase tracking-widest text-emerald-400 font-mono">
              IndustryMind OS
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">
            {mode === "login" ? "Sign In to Industrial Workspace" : "Register Industrial Account"}
          </h2>
          <p className="text-xs text-gray-300 mt-1">
            Access secure telemetry, verified SOPs, and AI copilot.
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex border-b border-gray-100 bg-gray-50/50 p-1">
          <button
            type="button"
            onClick={() => { setMode("login"); setError(""); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              mode === "login"
                ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setError(""); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              mode === "signup"
                ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Register Real Account
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {mode === "signup" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Full Name / Operator ID
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. John Doe (Tech Lead)"
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setUserRole(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                >
                  <option value="worker">Floor Worker / Machine Operator</option>
                  <option value="reviewer">Quality Reviewer / Safety Officer</option>
                  <option value="manager">Plant Manager / Supervisor</option>
                  <option value="admin">System Administrator</option>
                </select>
              </div>

              {/* Factory Selection & Creation */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-medium text-gray-700">Factory / Plant</label>
                  <button
                    type="button"
                    onClick={() => setShowCreateFactory(!showCreateFactory)}
                    className="text-[11px] text-emerald-600 hover:underline"
                  >
                    {showCreateFactory ? "Cancel" : "+ New Factory"}
                  </button>
                </div>
                {showCreateFactory ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Factory name..."
                      value={newFactoryName}
                      onChange={(e) => setNewFactoryName(e.target.value)}
                      className="flex-1 text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={handleCreateFactory}
                      className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-medium"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <select
                    value={factoryId}
                    onChange={(e) => setFactoryId(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                  >
                    {factories.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Branch Selection & Creation */}
              {factoryId && (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-medium text-gray-700">Branch / Unit</label>
                    <button
                      type="button"
                      onClick={() => setShowCreateBranch(!showCreateBranch)}
                      className="text-[11px] text-emerald-600 hover:underline"
                    >
                      {showCreateBranch ? "Cancel" : "+ New Branch"}
                    </button>
                  </div>
                  {showCreateBranch ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Branch name..."
                        value={newBranchName}
                        onChange={(e) => setNewBranchName(e.target.value)}
                        className="flex-1 text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={handleCreateBranch}
                        className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-medium"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <select
                      value={branchId}
                      onChange={(e) => setBranchId(e.target.value)}
                      className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                    >
                      {branches.length === 0 ? (
                        <option value="">No branches (Click + New Branch)</option>
                      ) : (
                        branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@industrymind.ai"
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[#1B4D44] hover:bg-[#133932] text-white text-sm font-semibold rounded-lg shadow transition-all duration-150 flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
          >
            {loading ? "Processing..." : mode === "login" ? "Sign In" : "Complete Registration"}
          </button>
        </form>
      </div>
    </div>
  );
}
