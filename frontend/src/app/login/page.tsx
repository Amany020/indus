"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Building, User, Lock, Check } from "lucide-react";
import { api, Factory, Branch } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Part 1 state
  const [mode, setMode] = useState<"signin" | "register" | "join">("signin");
  const [factoryName, setFactoryName] = useState("");
  const [factories, setFactories] = useState<Factory[]>([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingFactories, setIsLoadingFactories] = useState(false);
  const [factoriesError, setFactoriesError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  // Auth inputs - Genuine Supabase test accounts
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("worker@indus.com");
  const [password, setPassword] = useState("Worker@123");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Genuine database user roles presets
  const handleQuickRole = (role: "worker" | "reviewer" | "admin") => {
    setSubmitError(null);
    if (role === "worker") {
      setEmail("worker@indus.com");
      setPassword("Worker@123");
    } else if (role === "reviewer") {
      setEmail("reviewer@indus.com");
      setPassword("Reviewer@123");
    } else {
      setEmail("admin@indus.com");
      setPassword("Admin@123");
    }
  };

  // Fetch factories once when entering join mode
  useEffect(() => {
    if (mode === "join" && !hasFetched) {
      setIsLoadingFactories(true);
      setFactoriesError(null);
      api.getFactories()
        .then((data) => {
          setFactories(data || []);
          setHasFetched(true);
        })
        .catch((err) => {
          setFactoriesError(err instanceof Error ? err.message : "Failed to load factories");
        })
        .finally(() => {
          setIsLoadingFactories(false);
        });
    }
  }, [mode, hasFetched]);

  // Fetch branches whenever selectedFactoryId changes in join mode
  useEffect(() => {
    if (mode === "join" && selectedFactoryId) {
      setSelectedBranchId(null);
      api.getBranches(selectedFactoryId)
        .then((data) => {
          setBranches(data || []);
        })
        .catch(() => {
          setBranches([]);
        });
    } else {
      setSelectedBranchId(null);
      setBranches([]);
    }
  }, [selectedFactoryId, mode]);

  // Submit handler - Real backend authentication only
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      let loginRes: { access_token: string; user: { role: string; email?: string; full_name?: string } };

      if (mode === "register") {
        await api.registerFactory({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          factory_name: factoryName.trim(),
        });
        loginRes = await api.login({ email: email.trim(), password });
      } else if (mode === "join") {
        if (!selectedFactoryId) throw new Error("Select a factory");
        if (!selectedBranchId) throw new Error("Please select a branch");
        await api.joinFactory({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          factory_id: selectedFactoryId,
          branch_id: selectedBranchId,
        });
        loginRes = await api.login({ email: email.trim(), password });
      } else {
        // Genuine Sign In with Supabase Auth
        loginRes = await api.login({ email: email.trim(), password });
      }

      // Store authentic JWT token in cookie and user in localStorage
      api.setToken(loginRes.access_token);
      if (typeof window !== "undefined") {
        localStorage.setItem("indus_user", JSON.stringify(loginRes.user));
      }

      // Route based on genuine role
      const rawRole = (loginRes.user.role || "").toLowerCase();
      if (rawRole === "admin") {
        window.location.href = "/admin";
      } else if (rawRole === "supervisor" || rawRole === "reviewer") {
        window.location.href = "/reviewer";
      } else {
        window.location.href = "/worker";
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Invalid email or password");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1C2B29] font-sans flex justify-center">
      <div className="w-full max-w-md bg-[#FAF8F5] min-h-screen flex flex-col relative shadow-sm border-x border-[#EAE5DC]">
        {/* Top Factory Sunset Skyline Header */}
        <div className="relative h-64 w-full overflow-hidden bg-black">
          <img
            src="/factory_banner.jpg"
            alt="IndustryMind Manufacturing Plant"
            className="w-full h-full object-cover opacity-85"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#D95A2B] text-white flex items-center justify-center font-bold text-lg mx-auto shadow-lg mb-2">
              IM
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              IndustryMind
            </h1>
            <p className="text-xs text-[#EAE5DC] mt-1 font-medium">
              Industrial Knowledge. Real Solutions.
            </p>
          </div>
        </div>

        {/* Login Card Overlay */}
        <div className="flex-1 -mt-6 bg-[#FAF8F5] rounded-t-3xl px-6 pt-6 pb-8 border-t border-[#EDE8E0] space-y-5">
          <div className="text-center">
            <h2 className="text-xl font-bold text-[#1C2B29]">Welcome Back</h2>
            <p className="text-xs text-[#5C6460] mt-0.5">
              Sign in to your industrial engineer account
            </p>
          </div>

          {/* Quick Demo Role Chips */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-[#5C6460] uppercase tracking-wider block text-center">
              Quick Role Switch (Demo)
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickRole("worker")}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-semibold border transition ${
                  email.includes("vikram")
                    ? "bg-[#D95A2B] text-white border-[#D95A2B]"
                    : "bg-white border-[#E5E0D8] text-[#5C6460] hover:text-[#1C2B29]"
                }`}
              >
                Worker
              </button>
              <button
                type="button"
                onClick={() => handleQuickRole("reviewer")}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-semibold border transition ${
                  email.includes("rahul")
                    ? "bg-[#D95A2B] text-white border-[#D95A2B]"
                    : "bg-white border-[#E5E0D8] text-[#5C6460] hover:text-[#1C2B29]"
                }`}
              >
                Reviewer
              </button>
              <button
                type="button"
                onClick={() => handleQuickRole("admin")}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-semibold border transition ${
                  email.includes("priya")
                    ? "bg-[#D95A2B] text-white border-[#D95A2B]"
                    : "bg-white border-[#E5E0D8] text-[#5C6460] hover:text-[#1C2B29]"
                }`}
              >
                Manager
              </button>
            </div>
          </div>

          {/* Form Mode Selector */}
          <div className="flex border-b border-[#E5E0D8] text-xs">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 pb-2 font-semibold text-center transition ${
                mode === "signin"
                  ? "text-[#D95A2B] border-b-2 border-[#D95A2B]"
                  : "text-[#5C6460]"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`flex-1 pb-2 font-semibold text-center transition ${
                mode === "register"
                  ? "text-[#D95A2B] border-b-2 border-[#D95A2B]"
                  : "text-[#5C6460]"
              }`}
            >
              New Factory
            </button>
            <button
              type="button"
              onClick={() => setMode("join")}
              className={`flex-1 pb-2 font-semibold text-center transition ${
                mode === "join"
                  ? "text-[#D95A2B] border-b-2 border-[#D95A2B]"
                  : "text-[#5C6460]"
              }`}
            >
              Join Factory
            </button>
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                  Factory Name
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 text-[#5C6460] absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={factoryName}
                    onChange={(e) => setFactoryName(e.target.value)}
                    placeholder="e.g. Surat Automotive Components"
                    className="w-full bg-white border border-[#E5E0D8] rounded-2xl pl-10 pr-3 py-2.5 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B] transition"
                  />
                </div>
              </div>
            )}

            {mode === "join" && (
              <div>
                <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                  Select Factory
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 text-[#5C6460] absolute left-3 top-3 pointer-events-none" />
                  <select
                    required
                    value={selectedFactoryId || ""}
                    onChange={(e) => setSelectedFactoryId(e.target.value)}
                    className="w-full bg-white border border-[#E5E0D8] rounded-2xl pl-10 pr-3 py-2.5 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B] transition"
                  >
                    <option value="" disabled>
                      Select your factory...
                    </option>
                    {factories.map((factory) => (
                      <option key={factory.id} value={factory.id}>
                        {factory.name}
                      </option>
                    ))}
                  </select>
                </div>
                {isLoadingFactories && (
                  <p className="text-[11px] text-[#5C6460] mt-1">Loading factories...</p>
                )}
                {factoriesError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-xs flex items-center gap-2 mt-1">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{factoriesError}</span>
                  </div>
                )}
              </div>
            )}

            {mode === "join" && selectedFactoryId && (
              <div>
                <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                  Branch
                </label>
                {branches.length > 0 ? (
                  <div className="relative">
                    <Building className="w-4 h-4 text-[#5C6460] absolute left-3 top-3 pointer-events-none" />
                    <select
                      required
                      value={selectedBranchId || ""}
                      onChange={(e) => setSelectedBranchId(e.target.value || null)}
                      className="w-full bg-white border border-[#E5E0D8] rounded-2xl pl-10 pr-3 py-2.5 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B] transition"
                    >
                      <option value="" disabled>
                        Select a branch...
                      </option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-[11px] text-[#5C6460] py-1">
                    No branches found for this factory
                  </p>
                )}
              </div>
            )}

            {(mode === "register" || mode === "join") && (
              <div>
                <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#5C6460] absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Vikram Singh"
                    className="w-full bg-white border border-[#E5E0D8] rounded-2xl pl-10 pr-3 py-2.5 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B] transition"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                Email or Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#5C6460] absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@surat.indus"
                  className="w-full bg-white border border-[#E5E0D8] rounded-2xl pl-10 pr-3 py-2.5 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B] transition"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#5C6460] absolute left-3 top-3" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white border border-[#E5E0D8] rounded-2xl pl-10 pr-10 py-2.5 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B] transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-[#5C6460] hover:text-[#1C2B29]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-[#5C6460]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded text-[#D95A2B] focus:ring-[#D95A2B]"
                />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                onClick={() => alert("Please contact your factory system administrator to reset password.")}
                className="text-[#D95A2B] font-semibold hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-2xl bg-[#D95A2B] hover:bg-[#C84E18] text-white text-xs font-bold transition shadow-md disabled:opacity-50"
            >
              {isSubmitting ? "Signing in..." : mode === "signin" ? "Sign In" : "Continue"}
            </button>
          </form>

          <div className="text-center pt-2">
            <span className="text-xs text-[#5C6460]">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => setMode("register")}
                className="text-[#D95A2B] font-bold hover:underline"
              >
                Contact Reviewer / Admin
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center text-xs text-[#5C6460]">
          Loading IndustryMind...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
