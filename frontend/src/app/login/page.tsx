"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Building,
  User,
  Lock,
  Mail,
  HardHat,
  Users,
  Settings,
  ArrowRight,
  Brain,
  FileText,
  Camera,
  BarChart2,
  Cog,
} from "lucide-react";
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
        loginRes = await api.login({ email: email.trim(), password });
      }

      api.setToken(loginRes.access_token);
      if (typeof window !== "undefined") {
        localStorage.setItem("indus_user", JSON.stringify(loginRes.user));
      }

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

  const selectedRole = email.includes("admin")
    ? "admin"
    : email.includes("reviewer")
    ? "reviewer"
    : "worker";

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 lg:p-8 xl:p-12 overflow-y-auto font-sans py-8 lg:py-8">
      {/* ─── Background Photograph from User Reference ─── */}
      <div className="fixed inset-0 z-0">
        <img
          src="/industrial_plant_bg.jpg"
          alt="IndusWorks Industrial Plant"
          className="w-full h-full object-cover object-center"
        />
        {/* Subtle daylight wash allowing clear visibility of the factory photograph */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/20 via-transparent to-white/10" />
      </div>

      <div className="relative z-10 w-full max-w-md md:max-w-4xl lg:max-w-6xl md:grid md:grid-cols-2 lg:grid-cols-12 gap-6 lg:gap-8 xl:gap-10 items-stretch">
        {/* ─── Left Hero Section with Glassmorphism (matching Right Card) ─── */}
        <div className="hidden md:flex md:col-span-1 lg:col-span-6 bg-white/80 backdrop-blur-2xl flex-col justify-between relative shadow-[0_25px_50px_-12px_rgba(28,43,41,0.12)] border border-white/60 rounded-[32px] sm:rounded-[36px] overflow-hidden p-8 lg:p-10 h-full">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <img
                src="/industrymind_logo.png"
                alt="IndustryMind Logo"
                className="w-12 h-12 object-contain"
              />
              <div>
                <h1 className="text-2xl font-black tracking-tight text-[#1C2B29]">IndustryMind</h1>
                <p className="text-xs text-[#5C6460] font-medium">Industrial Knowledge. Real Solutions.</p>
              </div>
            </div>

            <div className="w-10 h-1 rounded-full bg-[#1C2B29]" />

            <div className="space-y-3">
              <h2 className="text-3xl xl:text-4xl font-black text-[#1C2B29] tracking-tight leading-tight">
                AI-Powered<br />
                Industrial Assistant
              </h2>
              <p className="text-sm text-[#4A5568] max-w-md leading-relaxed font-medium">
                Get instant, accurate, and grounded answers from your approved SOPs and manuals.
              </p>
            </div>

            <div className="space-y-2.5 max-w-md pt-2">
              {[
                { icon: Brain, label: "AI Troubleshooting" },
                { icon: FileText, label: "Approved SOPs & Manuals" },
                { icon: Camera, label: "Multimodal Support (Text • Voice • Image)" },
                { icon: Users, label: "Expert Knowledge Capture" },
                { icon: BarChart2, label: "Real-Time Analytics" },
              ].map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-white/70 hover:bg-white/90 backdrop-blur-md border border-white/70 shadow-xs hover:shadow-sm transition"
                >
                  <div className="w-6 h-6 flex items-center justify-center text-[#1C2B29] shrink-0">
                    <f.icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-[#1C2B29]">{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6 flex items-center gap-2 text-[11px] text-[#5C6460] border-t border-white/60 mt-6">
            <Building className="w-3.5 h-3.5 text-[#1C2B29]" />
            <span>Connected to verified factory tenancy and knowledge base</span>
          </div>
        </div>

        {/* ─── Right Auth Card with Identical Glassmorphism & Height ─── */}
        <div className="w-full md:col-span-1 lg:col-span-6 bg-white/80 backdrop-blur-2xl flex flex-col justify-between relative shadow-[0_25px_50px_-12px_rgba(28,43,41,0.12)] border border-white/60 rounded-[32px] sm:rounded-[36px] overflow-hidden h-full">
          {/* Top Factory Skyline Header (Mobile only < md) */}
          <div className="relative h-60 w-full overflow-hidden md:hidden">
            <img
              src="/industrial_plant_bg.jpg"
              alt="IndustryMind Manufacturing Plant"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white via-white/40 to-transparent flex flex-col items-center justify-center p-6 text-center">
              <img
                src="/industrymind_logo.png"
                alt="IndustryMind Logo"
                className="w-14 h-14 object-contain mx-auto mb-1.5 drop-shadow-sm"
              />
              <h1 className="text-2xl font-black tracking-tight text-[#1C2B29]">
                IndustryMind
              </h1>
              <p className="text-xs text-[#5C6460] font-semibold">
                Industrial Knowledge. Real Solutions.
              </p>
            </div>
          </div>

          {/* Login Card Body with matching desktop padding */}
          <div className="flex-1 px-6 sm:px-8 lg:px-10 pt-6 md:pt-10 pb-8 space-y-5 flex flex-col justify-between">
            {/* Desktop Brand Header inside card */}
            <div className="hidden md:flex items-center justify-center gap-2.5 mb-2">
              <img
                src="/industrymind_logo.png"
                alt="IndustryMind Logo"
                className="w-8 h-8 object-contain"
              />
              <span className="text-lg font-black text-[#1C2B29]">IndustryMind</span>
            </div>

            <div className="text-center">
              <h2 className="text-2xl font-black text-[#1C2B29] tracking-tight">Welcome Back</h2>
              <p className="text-xs text-[#5C6460] mt-0.5">
                Sign in to your industrial engineer account
              </p>
            </div>

            {/* Quick Role Switch */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-[#5C6460] uppercase tracking-wider block text-center">
                Quick Role Switch
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickRole("worker")}
                  className={`min-h-[44px] py-1.5 px-2 rounded-2xl text-[11px] font-bold border transition flex items-center justify-center gap-1.5 ${
                    selectedRole === "worker"
                      ? "bg-[#2D3748] text-white border-[#2D3748] shadow-sm"
                      : "bg-white/60 backdrop-blur-xs border-white/60 text-[#5C6460] hover:text-[#1C2B29] hover:bg-white/90"
                  }`}
                >
                  <HardHat className="w-3.5 h-3.5" />
                  <span>Worker</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickRole("reviewer")}
                  className={`min-h-[44px] py-1.5 px-2 rounded-xl text-[11px] font-bold border transition flex items-center justify-center gap-1.5 ${
                    selectedRole === "reviewer"
                      ? "bg-[#2D3748] text-white border-[#2D3748] shadow-sm"
                      : "bg-white/60 backdrop-blur-xs border-white/60 text-[#5C6460] hover:text-[#1C2B29] hover:bg-white/90"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Reviewer</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickRole("admin")}
                  className={`min-h-[44px] py-1.5 px-2 rounded-xl text-[11px] font-bold border transition flex items-center justify-center gap-1.5 ${
                    selectedRole === "admin"
                      ? "bg-[#2D3748] text-white border-[#2D3748] shadow-sm"
                      : "bg-white/60 backdrop-blur-xs border-white/60 text-[#5C6460] hover:text-[#1C2B29] hover:bg-white/90"
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Manager</span>
                </button>
              </div>
            </div>

            {/* Form Mode Selector */}
            <div className="flex border-b border-white/60 text-xs">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`flex-1 pb-2 font-bold text-center transition flex items-center justify-center gap-1.5 ${
                  mode === "signin"
                    ? "text-[#1C2B29] border-b-2 border-[#1C2B29]"
                    : "text-[#5C6460] hover:text-[#1C2B29]"
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`flex-1 pb-2 font-bold text-center transition flex items-center justify-center gap-1.5 ${
                  mode === "register"
                    ? "text-[#1C2B29] border-b-2 border-[#1C2B29]"
                    : "text-[#5C6460] hover:text-[#1C2B29]"
                }`}
              >
                <Building className="w-3.5 h-3.5" />
                <span>New Factory</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("join")}
                className={`flex-1 pb-2 font-bold text-center transition flex items-center justify-center gap-1.5 ${
                  mode === "join"
                    ? "text-[#1C2B29] border-b-2 border-[#1C2B29]"
                    : "text-[#5C6460] hover:text-[#1C2B29]"
                }`}
              >
                <Building className="w-3.5 h-3.5" />
                <span>Join Factory</span>
              </button>
            </div>

            {submitError && (
              <div className="bg-red-50/90 backdrop-blur-xs border border-red-200 text-red-600 px-3 py-2 rounded-xl text-xs flex items-center gap-2">
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
                    <Building className="w-4 h-4 text-[#A0AEC0] absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      required
                      value={factoryName}
                      onChange={(e) => setFactoryName(e.target.value)}
                      placeholder="e.g. Surat Automotive Components"
                      className="w-full bg-white/70 backdrop-blur-xs border border-white/80 rounded-2xl pl-10 pr-3 py-2.5 text-xs text-[#1C2B29] placeholder:text-[#A0AEC0] focus:outline-none focus:bg-white focus:border-[#2D3748] focus:ring-2 focus:ring-[#2D3748]/10 transition min-h-[48px]"
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
                    <Building className="w-4 h-4 text-[#A0AEC0] absolute left-3.5 top-3.5 pointer-events-none" />
                    <select
                      required
                      value={selectedFactoryId || ""}
                      onChange={(e) => setSelectedFactoryId(e.target.value)}
                      className="w-full bg-white/70 backdrop-blur-xs border border-white/80 rounded-2xl pl-10 pr-3 py-2.5 text-xs text-[#1C2B29] focus:outline-none focus:bg-white focus:border-[#2D3748] focus:ring-2 focus:ring-[#2D3748]/10 transition min-h-[48px]"
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
                    <p className="text-[11px] text-[#5C6460] mt-1">Loading factories from database...</p>
                  )}
                  {factoriesError && (
                    <div className="bg-red-50/90 backdrop-blur-xs border border-red-200 text-red-600 px-3 py-2 rounded-xl text-xs flex items-center gap-2 mt-1">
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
                      <Building className="w-4 h-4 text-[#A0AEC0] absolute left-3.5 top-3.5 pointer-events-none" />
                      <select
                        required
                        value={selectedBranchId || ""}
                        onChange={(e) => setSelectedBranchId(e.target.value || null)}
                        className="w-full bg-white/70 backdrop-blur-xs border border-white/80 rounded-2xl pl-10 pr-3 py-2.5 text-xs text-[#1C2B29] focus:outline-none focus:bg-white focus:border-[#2D3748] focus:ring-2 focus:ring-[#2D3748]/10 transition min-h-[48px]"
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
                    <User className="w-4 h-4 text-[#A0AEC0] absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Vikram Singh"
                      className="w-full bg-white/70 backdrop-blur-xs border border-white/80 rounded-2xl pl-10 pr-3 py-2.5 text-xs text-[#1C2B29] placeholder:text-[#A0AEC0] focus:outline-none focus:bg-white focus:border-[#2D3748] focus:ring-2 focus:ring-[#2D3748]/10 transition min-h-[48px]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                  Email or Username
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#A0AEC0] absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="rahul.patel@industrymind.com"
                    className="w-full bg-white/70 backdrop-blur-xs border border-white/80 rounded-2xl pl-10 pr-3 py-2.5 text-xs text-[#1C2B29] placeholder:text-[#A0AEC0] focus:outline-none focus:bg-white focus:border-[#2D3748] focus:ring-2 focus:ring-[#2D3748]/10 transition min-h-[48px]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#A0AEC0] absolute left-3.5 top-3.5" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white/70 backdrop-blur-xs border border-white/80 rounded-2xl pl-10 pr-10 py-2.5 text-xs text-[#1C2B29] placeholder:text-[#A0AEC0] focus:outline-none focus:bg-white focus:border-[#2D3748] focus:ring-2 focus:ring-[#2D3748]/10 transition min-h-[48px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3.5 text-[#A0AEC0] hover:text-[#1C2B29]"
                    aria-label="Toggle password visibility"
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
                    className="rounded text-[#2D3748] focus:ring-[#2D3748]"
                  />
                  <span>Remember me</span>
                </label>

                <button
                  type="button"
                  onClick={() => alert("Please contact your factory system administrator to reset password.")}
                  className="text-[#5C6460] hover:text-[#1C2B29] font-medium transition"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[48px] py-3.5 rounded-2xl bg-[#2D3748] hover:bg-[#1A202C] text-white text-xs font-bold transition shadow-md active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{isSubmitting ? "Signing in..." : mode === "signin" ? "Sign In" : mode === "register" ? "Create Factory" : "Join Factory"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="text-center pt-2">
              <span className="text-xs text-[#5C6460]">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className="text-[#1C2B29] font-bold hover:underline"
                >
                  Contact Reviewer / Admin
                </button>
              </span>
            </div>
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
