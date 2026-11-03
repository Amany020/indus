"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/context";
import { api, type DocumentOut, type Machine, type AuthUserData, type Branch, type AnalyticsSummary, type EscalationTicket } from "@/lib/api";
import { roleLabel } from "@/lib/roles";

function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    try {
      const jsonStart = err.message.indexOf("{");
      if (jsonStart !== -1) {
        const parsed = JSON.parse(err.message.slice(jsonStart));
        if (parsed.detail) return String(parsed.detail);
      }
    } catch { }
    return err.message;
  }
  return "An unexpected error occurred";
}

function getDocStatusBadge(status: string) {
  switch ((status || "").toLowerCase()) {
    case "approved":
      return { label: "Approved", className: "bg-green-50 text-green-700" };
    case "rejected":
      return { label: "Rejected", className: "bg-red-50 text-red-700" };
    case "failed":
      return { label: "Failed", className: "bg-red-50 text-red-700" };
    case "superseded":
      return { label: "Superseded", className: "bg-red-50 text-red-700" };
    case "queued":
      return { label: "Pending", className: "bg-amber-50 text-amber-700" };
    case "processing":
      return { label: "Processing", className: "bg-amber-50 text-amber-700" };
    default:
      return { label: status, className: "bg-amber-50 text-amber-700" };
  }
}

import ProfileModal from "@/components/ProfileModal";
import PdfPreviewModal from "@/components/PdfPreviewModal";
import {
  Home,
  Building2,
  FileCheck2,
  Users,
  FileSpreadsheet,
  Bell,
  ChevronDown,
  CheckCircle2,
  Download,
  AlertTriangle,
  ChevronRight,
  Cpu,
  Layers,
  FileText,
  UserCheck,
  Plus,
  X,
  Upload,
  LogOut,
  Settings,
} from "lucide-react";

export default function AdminPage() {
  const router = useRouter();
  const { logout, user } = useApp();

  const [activeNav, setActiveNav] = useState<"home" | "branch" | "documents" | "team" | "reports">("home");
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [docFilter, setDocFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  // Branches state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [branchSuccess, setBranchSuccess] = useState<string | null>(null);
  const [newBranchName, setNewBranchName] = useState("");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [deletingBranchId, setDeletingBranchId] = useState<string | null>(null);

  // Fetch branches when activeNav becomes "branch"
  React.useEffect(() => {
    if (activeNav !== "branch") return;

    if (!user?.factory_id) {
      setBranchesLoading(false);
      setBranchError("Unable to determine your factory. Please try logging in again.");
      setBranches([]);
      return;
    }

    let isMounted = true;
    setBranchesLoading(true);
    setBranchError(null);

    api.getBranches(user.factory_id)
      .then((data) => {
        if (isMounted) {
          setBranches(data || []);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setBranchError(formatErrorMessage(err));
        }
      })
      .finally(() => {
        if (isMounted) {
          setBranchesLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeNav, user?.factory_id]);

  const handleDeleteBranch = async (branch: Branch) => {
    const confirmed = window.confirm(`Delete branch '${branch.name}'? This cannot be undone.`);
    if (!confirmed) return;

    setBranchError(null);
    setBranchSuccess(null);
    setDeletingBranchId(branch.id);

    try {
      await api.deleteBranch(branch.id);
      setBranches((prev) => prev.filter((b) => b.id !== branch.id));
      setBranchSuccess(`Branch "${branch.name}" deleted successfully.`);
    } catch (err) {
      setBranchError(formatErrorMessage(err));
    } finally {
      setDeletingBranchId(null);
    }
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newBranchName.trim();
    if (!trimmed) {
      setBranchError("Please enter a branch name.");
      return;
    }
    if (!user?.factory_id) {
      setBranchError("Factory ID not found for current user.");
      return;
    }

    setBranchError(null);
    setBranchSuccess(null);
    setCreatingBranch(true);

    try {
      const created = await api.createBranch(trimmed, user.factory_id);
      setBranches((prev) => [...prev, created]);
      setNewBranchName("");
      setBranchSuccess(`Branch "${created.name}" created successfully.`);
    } catch (err) {
      setBranchError(formatErrorMessage(err));
    } finally {
      setCreatingBranch(false);
    }
  };

  // Selected document for approval
  const [selectedDoc, setSelectedDoc] = useState<{
    id: string;
    title: string;
    rev: string;
    uploadedBy: string;
    date: string;
    status: string;
    category: string;
    machines: string;
    description?: string;
    filename: string;
    filesize: string;
    machine_name?: string | null;
    approved_by?: string | null;
    approved_at?: string | null;
  } | null>(null);
  const [docActionSubmitting, setDocActionSubmitting] = useState(false);
  const [docActionError, setDocActionError] = useState<string | null>(null);

  // PDF Document Preview
  const [viewDocModalData, setViewDocModalData] = useState<{ title: string; src: string } | null>(null);
  const [viewLoadingDocId, setViewLoadingDocId] = useState<string | null>(null);
  const [viewDocError, setViewDocError] = useState<string | null>(null);

  const handleViewDoc = async (docId?: string, title?: string) => {
    if (!docId) return;
    setViewLoadingDocId(docId);
    setViewDocError(null);
    try {
      const res = await api.getDocumentFileUrl(docId);
      setViewDocModalData({
        title: res.filename || title || "Document PDF",
        src: res.url,
      });
    } catch (err: any) {
      setViewDocError(err?.message || "Failed to load document preview");
    } finally {
      setViewLoadingDocId(null);
    }
  };

  // Genuine documents list from DB
  const [documents, setDocuments] = useState<Array<{
    id: string;
    title: string;
    rev: string;
    uploadedBy: string;
    date: string;
    status: string;
    category: string;
    machines: string;
    description?: string;
    filename: string;
    filesize: string;
    machine_name?: string | null;
    approved_by?: string | null;
    approved_at?: string | null;
  }>>([]);

  // Genuine machines list from DB
  const [machinesList, setMachinesList] = useState<Array<{
    id: string;
    name: string;
    section: string;
  }>>([]);

  // Genuine reviewers/team list from DB
  const [reviewers, setReviewers] = useState<Array<{
    id?: string;
    name: string;
    email: string;
    role: string;
    status: string;
  }>>([]);

  // Promotable workers from DB
  const [promotableWorkers, setPromotableWorkers] = useState<Array<{
    id: string;
    name: string;
    email: string;
  }>>([]);

  const [openQueriesCount, setOpenQueriesCount] = useState<number | null>(null);

  // Reports / Analytics state
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // CSV report download state
  const [downloadingAnalytics, setDownloadingAnalytics] = useState(false);
  const [analyticsDownloadError, setAnalyticsDownloadError] = useState<string | null>(null);
  const [downloadingEscalations, setDownloadingEscalations] = useState(false);
  const [escalationDownloadError, setEscalationDownloadError] = useState<string | null>(null);

  const handleDownloadAnalytics = async () => {
    setDownloadingAnalytics(true);
    setAnalyticsDownloadError(null);
    try {
      await api.downloadReport("analytics", undefined, "pdf", "admin");
    } catch (err: any) {
      setAnalyticsDownloadError(err?.message || "Failed to download analytics report");
    } finally {
      setDownloadingAnalytics(false);
    }
  };

  const handleDownloadEscalations = async () => {
    setDownloadingEscalations(true);
    setEscalationDownloadError(null);
    try {
      await api.downloadReport("escalations", undefined, "pdf", "admin");
    } catch (err: any) {
      setEscalationDownloadError(err?.message || "Failed to download escalations report");
    } finally {
      setDownloadingEscalations(false);
    }
  };

  // Factory summary download state (7/30/90 days, default 30)
  const [summaryDays, setSummaryDays] = useState<7 | 30 | 90>(30);
  const [downloadingSummary, setDownloadingSummary] = useState(false);
  const [summaryDownloadError, setSummaryDownloadError] = useState<string | null>(null);

  const handleDownloadSummary = async () => {
    setDownloadingSummary(true);
    setSummaryDownloadError(null);
    try {
      await api.downloadReport("factory-summary", summaryDays, "pdf", "admin");
    } catch (err: any) {
      setSummaryDownloadError(err?.message || "Failed to download factory summary report");
    } finally {
      setDownloadingSummary(false);
    }
  };

  // Fetch real data on mount
  React.useEffect(() => {
    let isMounted = true;

    Promise.all([
      api.getDocuments().catch(() => [] as DocumentOut[]),
      api.getMachines().catch(() => [] as Machine[]),
      api.getUsers().catch(() => [] as AuthUserData[]),
      api.getEscalations("open").catch(() => [] as EscalationTicket[]),
    ]).then(([docs, machines, usersData, openEscalations]) => {
      if (isMounted) {
        setOpenQueriesCount(openEscalations.length);
        if (docs && docs.length > 0) {
          setDocuments(
            docs.map((d) => ({
              id: d.id,
              title: d.filename,
              rev: d.revision || "v1.0",
              uploadedBy: d.owner || "Unknown",
              date: d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : "Active",
              status: d.status,
              category: d.doc_type || "Manual",
              machines: d.machine_name || "Unknown Machine",
              filename: d.filename,
              filesize:
                typeof d.page_count === "number"
                  ? `${d.page_count} Pages`
                  : "Unknown",
              machine_name: d.machine_name,
              approved_by: d.approved_by,
              approved_at: d.approved_at,
            }))
          );
        }
        if (machines && machines.length > 0) {
          setMachinesList(
            machines.map((m) => ({
              id: m.id,
              name: m.name,
              section: m.workcell || "Production Line",
            }))
          );
        }
        if (usersData && usersData.length > 0) {
          setReviewers(
            usersData.map((u) => {
              const uid = u.id || (u as any).user_id;
              return {
                id: uid,
                name: u.full_name || u.email,
                email: u.email,
                role: u.role || "worker",
                status: "Active",
              };
            })
          );
          setPromotableWorkers(
            usersData
              .filter((u) => (u.role || "worker").toLowerCase() === "worker")
              .map((u) => {
                const uid = u.id || (u as any).user_id;
                return {
                  id: uid,
                  name: u.full_name || u.email,
                  email: u.email,
                };
              })
          );
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch Analytics summary whenever Reports tab becomes active
  useEffect(() => {
    if (activeNav !== "reports") return;
    setAnalyticsLoading(true);
    api
      .getAnalytics()
      .catch(() => null)
      .then((data) => {
        setAnalyticsSummary(data);
        setAnalyticsLoading(false);
      });
  }, [activeNav]);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [targetPromoteRole, setTargetPromoteRole] = useState<"supervisor" | "expert">("supervisor");
  const [promoteSubmitting, setPromoteSubmitting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [demoteSubmittingId, setDemoteSubmittingId] = useState<string | null>(null);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const [selectedUploadMachineId, setSelectedUploadMachineId] = useState("");
  const [newDocCategory, setNewDocCategory] = useState("SOP");
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Close modals on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (viewDocModalData) { setViewDocModalData(null); return; }
      if (showUploadModal) { setShowUploadModal(false); return; }
      if (showInviteModal) { setShowInviteModal(false); setPromoteError(null); setSelectedWorkerId(""); setTargetPromoteRole("supervisor"); return; }
      if (selectedDoc) { setSelectedDoc(null); setDocActionError(null); return; }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [viewDocModalData, showUploadModal, showInviteModal, selectedDoc]);

  const handlePromoteWorker = async () => {
    if (!selectedWorkerId) return;
    setPromoteSubmitting(true);
    setPromoteError(null);
    try {
      const res = await api.setUserRole(selectedWorkerId, targetPromoteRole);
      const promotedWorker = promotableWorkers.find((w) => w.id === selectedWorkerId);
      const displayName = res.full_name || promotedWorker?.name || promotedWorker?.email || "Team Member";
      const displayEmail = promotedWorker?.email || "";

      setReviewers((prev) => [
        {
          id: selectedWorkerId,
          name: displayName,
          email: displayEmail,
          role: res.role || targetPromoteRole,
          status: "Active",
        },
        ...prev.filter((r) => r.id !== selectedWorkerId),
      ]);
      setPromotableWorkers((prev) => prev.filter((w) => w.id !== selectedWorkerId));
      setShowInviteModal(false);
      setSelectedWorkerId("");
      setTargetPromoteRole("supervisor");
    } catch (err: any) {
      setPromoteError(formatErrorMessage(err) || "Failed to promote user.");
    } finally {
      setPromoteSubmitting(false);
    }
  };

  const handleDemoteExpert = async (userId: string | undefined) => {
    if (!userId) return;
    setDemoteSubmittingId(userId);
    try {
      const res = await api.setUserRole(userId, "worker");
      setReviewers((prev) =>
        prev.map((r) => (r.id === userId ? { ...r, role: res.role || "worker" } : r))
      );
      const workerObj = reviewers.find((r) => r.id === userId);
      if (workerObj) {
        setPromotableWorkers((prev) => [
          ...prev.filter((w) => w.id !== userId),
          { id: userId, name: workerObj.name, email: workerObj.email },
        ]);
      }
    } catch (err: any) {
      alert(formatErrorMessage(err) || "Failed to return user to worker.");
    } finally {
      setDemoteSubmittingId(null);
    }
  };

  const handleApproveDoc = async (docId: string) => {
    setDocActionSubmitting(true);
    setDocActionError(null);
    try {
      await api.approveDocument(docId);
      setDocuments((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, status: "approved" } : d))
      );
      setSelectedDoc(null);
    } catch (err: any) {
      setDocActionError(err?.message || "Failed to approve document.");
    } finally {
      setDocActionSubmitting(false);
    }
  };

  const handleRejectDoc = async (docId: string) => {
    setDocActionSubmitting(true);
    setDocActionError(null);
    try {
      await api.rejectDocument(docId);
      setDocuments((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, status: "rejected" } : d))
      );
      setSelectedDoc(null);
    } catch (err: any) {
      setDocActionError(err?.message || "Failed to reject document.");
    } finally {
      setDocActionSubmitting(false);
    }
  };

  const filteredDocs = documents.filter((d) => {
    if (docFilter === "pending") return d.status === "queued" || d.status === "processing";
    if (docFilter === "approved") return d.status === "approved";
    if (docFilter === "rejected") return d.status === "rejected" || d.status === "failed" || d.status === "superseded";
    return true;
  });

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1C2B29] font-sans flex justify-center pb-20 lg:pb-0">
      {/* Outer Responsive Wrapper: Mobile (max-w-md) & Desktop (w-full max-w-7xl flex-row) */}
      <div className="w-full max-w-md lg:max-w-7xl bg-[#FAF8F5] min-h-screen flex flex-col lg:flex-row relative shadow-sm border-x border-[#EAE5DC] lg:border-x-0">
        {/* ─── DESKTOP LEFT SIDEBAR (hidden on mobile) ──────────────── */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-white border-r border-[#EDE8E0] min-h-screen p-5 space-y-6 sticky top-0 h-screen overflow-y-auto z-40">
          {/* Logo & Brand Header */}
          <div className="flex items-center gap-3">
            <img src="/industrymind_logo.png" alt="IndustryMind Logo" className="w-8 h-8 object-contain" />
            <div>
              <span className="font-bold text-base tracking-tight text-[#1C2B29] block">
                IndustryMind
              </span>
              <span className="text-[10px] text-[#5C6460] font-medium block">
                Plant Manager Portal
              </span>
            </div>
          </div>

          {/* Active Admin Card */}
          <div className="p-3 bg-[#FAF8F5] rounded-2xl border border-[#EDE8E0] space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#1C2B29] text-white flex items-center justify-center text-xs font-bold">
                {(user?.full_name || "A")[0]}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-[#1C2B29] truncate block">
                  {user?.full_name || "Plant Administrator"}
                </span>
                <span className="text-[10px] text-[#5C6460] block capitalize">
                  Administrator
                </span>
              </div>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="flex-1 space-y-1">
            <button
              type="button"
              onClick={() => setActiveNav("home")}
              className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-3 transition text-left cursor-pointer ${
                activeNav === "home"
                  ? "bg-[#1C2B29] text-white shadow-xs"
                  : "text-[#5C6460] hover:text-[#1C2B29] hover:bg-[#FAF8F5]"
              }`}
            >
              <Home className="w-4 h-4 shrink-0" />
              <span>Plant Overview</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveNav("branch")}
              className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-3 transition text-left cursor-pointer ${
                activeNav === "branch"
                  ? "bg-[#1C2B29] text-white shadow-xs"
                  : "text-[#5C6460] hover:text-[#1C2B29] hover:bg-[#FAF8F5]"
              }`}
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span>Factory Units</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveNav("documents")}
              className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-3 transition text-left cursor-pointer ${
                activeNav === "documents"
                  ? "bg-[#1C2B29] text-white shadow-xs"
                  : "text-[#5C6460] hover:text-[#1C2B29] hover:bg-[#FAF8F5]"
              }`}
            >
              <FileCheck2 className="w-4 h-4 shrink-0" />
              <span>Document Repository</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveNav("team")}
              className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-3 transition text-left cursor-pointer ${
                activeNav === "team"
                  ? "bg-[#1C2B29] text-white shadow-xs"
                  : "text-[#5C6460] hover:text-[#1C2B29] hover:bg-[#FAF8F5]"
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Team & Roles</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveNav("reports")}
              className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-3 transition text-left cursor-pointer ${
                activeNav === "reports"
                  ? "bg-[#1C2B29] text-white shadow-xs"
                  : "text-[#5C6460] hover:text-[#1C2B29] hover:bg-[#FAF8F5]"
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span>Operations Reports</span>
            </button>
          </nav>

          {/* Bottom Sidebar Action Items */}
          <div className="pt-4 border-t border-[#EDE8E0] space-y-2">
            <button
              type="button"
              onClick={() => setShowProfileModal(true)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 text-[#5C6460] hover:text-[#1C2B29] hover:bg-[#FAF8F5] transition cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span>Manager Settings</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("Log out of Admin portal?")) {
                  logout();
                  router.push("/login");
                }
              }}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 text-[#5C6460] hover:text-[#D95A2B] hover:bg-[#FAF8F5] transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* ─── MAIN CONTENT VIEWPORT ─────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-[#FAF8F5]/90 backdrop-blur-md px-4 pt-3 pb-2 border-b border-[#EAE5DC]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/industrymind_logo.png" alt="IndustryMind Logo" className="w-8 h-8 object-contain" />
              <span className="font-bold text-lg tracking-tight text-[#1C2B29]">
                IndustryMind
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="relative p-2 text-[#5C6460] hover:text-[#1C2B29] rounded-full hover:bg-[#F0EDE6] transition"
                onClick={() => setActiveNav("documents")}
                aria-label="View documents"
              >
                <Bell className="w-5 h-5" />
                {documents.some((d) => d.status === "queued" || d.status === "processing" || d.status === "pending") && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#D95A2B] rounded-full" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowProfileModal(true)}
                title="Profile & Settings"
                className="w-8 h-8 rounded-full bg-[#1C2B29] text-white flex items-center justify-center text-xs font-semibold hover:bg-[#D95A2B] transition cursor-pointer"
              >
                P
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-[#1C2B29] leading-tight">
                Good Morning,
                <br />
                {user?.full_name || "Priya Mehta"}
              </h1>
              <p className="text-xs text-[#5C6460] mt-0.5 font-medium">
                Branch Manager · Surat Unit
              </p>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowBranchMenu(!showBranchMenu)}
                className="flex items-center gap-1.5 bg-white border border-[#E5E0D8] rounded-full px-3 py-1.5 text-xs font-semibold text-[#1C2B29] shadow-xs hover:border-[#D95A2B] transition"
              >
                <span>Surat Unit</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#5C6460]" />
              </button>
            </div>
          </div>
        </header>

        {/* ─── TAB 1: MANAGER DASHBOARD (HOME) ──────────────────────── */}
        {activeNav === "home" && (
          <main className="flex-1 px-4 py-4 space-y-5">
            {/* 4 KPI Counters (2x2 Grid) */}
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => {
                  setActiveNav("branch");
                }}
                className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between cursor-pointer hover:border-[#D95A2B] transition"
              >
                <div>
                  <div className="text-2xl font-bold text-[#1C2B29]">{reviewers.length}</div>
                  <div className="text-xs text-[#5C6460] font-medium mt-0.5">
                    Employees
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
              </div>

              <div
                onClick={() => {
                  setActiveNav("branch");
                }}
                className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between cursor-pointer hover:border-[#D95A2B] transition"
              >
                <div>
                  <div className="text-2xl font-bold text-[#1C2B29]">{machinesList.length}</div>
                  <div className="text-xs text-[#5C6460] font-medium mt-0.5">
                    Machines
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                  <Cpu className="w-5 h-5" />
                </div>
              </div>

              <div
                onClick={() => {
                  setDocFilter("pending");
                  setActiveNav("documents");
                }}
                className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between cursor-pointer hover:border-[#D95A2B] transition"
              >
                <div>
                  <div className="text-2xl font-bold text-[#1C2B29]">{documents.length}</div>
                  <div className="text-xs text-[#5C6460] font-medium mt-0.5">
                    Documents
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
              </div>

              <div
                onClick={() => setActiveNav("reports")}
                className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between cursor-pointer hover:border-[#D95A2B] transition"
              >
                <div>
                  <div className="text-2xl font-bold text-[#D95A2B]">{openQueriesCount !== null ? openQueriesCount : "—"}</div>
                  <div className="text-xs text-[#5C6460] font-medium mt-0.5">
                    Open Queries
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-orange-50 text-[#D95A2B] flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Query Overview Chart Card */}
            <div className="bg-white border border-[#EDE8E0] rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-xs text-[#1C2B29]">Query Overview</h3>
                  <span className="text-[11px] text-[#5C6460]">New Queries vs Resolved</span>
                </div>
                <span className="text-[11px] font-semibold text-[#D95A2B] bg-[#FDF2ED] px-2.5 py-1 rounded-full">
                  This Week ▾
                </span>
              </div>

              {/* Line Trend Visualization */}
              <div className="h-28 flex items-end justify-between gap-2 pt-4 px-2 border-b border-[#F0ECE4]">
                {[
                  { day: "Mon", newQ: 40, res: 35 },
                  { day: "Tue", newQ: 65, res: 58 },
                  { day: "Wed", newQ: 55, res: 50 },
                  { day: "Thu", newQ: 85, res: 80 },
                  { day: "Fri", newQ: 70, res: 72 },
                  { day: "Sat", newQ: 95, res: 90 },
                  { day: "Sun", newQ: 60, res: 62 },
                ].map((item, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <div className="w-full flex items-end justify-center gap-1 h-20">
                      <div
                        className="w-2 bg-[#D95A2B] rounded-t-xs"
                        style={{ height: `${item.newQ}%` }}
                        title={`New: ${item.newQ}`}
                      />
                      <div
                        className="w-2 bg-[#1C2B29] rounded-t-xs"
                        style={{ height: `${item.res}%` }}
                        title={`Resolved: ${item.res}`}
                      />
                    </div>
                    <span className="text-[10px] text-[#5C6460] font-medium">{item.day}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-center gap-6 pt-1 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#D95A2B]" />
                  <span className="text-[#5C6460]">New Queries</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#1C2B29]" />
                  <span className="text-[#5C6460]">Resolved</span>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#1C2B29]">Recent Activity</h3>
                <span className="text-xs font-semibold text-[#D95A2B] hover:underline cursor-pointer">
                  View All
                </span>
              </div>

              <div className="space-y-2.5">
                <div className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#FDF2ED] text-[#D95A2B] flex items-center justify-center font-bold mt-0.5">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#1C2B29]">
                        New document uploaded
                      </div>
                      <div className="text-[11px] text-[#5C6460]">
                        Hydraulic Manual v2.0
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] text-[#5C6460]">2 hours ago</span>
                </div>

                <div className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold mt-0.5">
                      <UserCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#1C2B29]">
                        Reviewer added
                      </div>
                      <div className="text-[11px] text-[#5C6460]">
                        Rohit Patel
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] text-[#5C6460]">4 hours ago</span>
                </div>
              </div>
            </div>
          </main>
        )}

        {/* ─── TAB 2: BRANCH & MACHINES ─────────────────────────────── */}
        {activeNav === "branch" && (
          <main className="flex-1 px-4 py-4 space-y-6">
            {/* SECTION A — Branches */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[#1C2B29]">Branches</h2>
                <span className="text-xs font-semibold text-[#5C6460]">
                  {branches.length} {branches.length === 1 ? "branch" : "branches"}
                </span>
              </div>

              {/* Dismissible inline error */}
              {branchError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-2xl flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{branchError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBranchError(null)}
                    className="p-1 rounded-full text-red-500 hover:bg-red-100 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Dismissible inline success */}
              {branchSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-700 text-xs p-3 rounded-2xl flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
                    <span>{branchSuccess}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBranchSuccess(null)}
                    className="p-1 rounded-full text-green-500 hover:bg-green-100 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Loading state */}
              {branchesLoading && (
                <div className="py-6 text-center text-xs text-[#5C6460] flex items-center justify-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#D95A2B] animate-ping" />
                  <span>Loading branches...</span>
                </div>
              )}

              {/* Empty state */}
              {!branchesLoading && branches.length === 0 && (
                <div className="bg-white border border-[#EDE8E0] rounded-2xl p-4 text-center text-xs text-[#5C6460]">
                  No branches found for this factory.
                </div>
              )}

              {/* Branch rows */}
              {!branchesLoading && branches.length > 0 && (
                <div className="space-y-2.5">
                  {branches.map((branch) => (
                    <div
                      key={branch.id}
                      className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#FDF2ED] text-[#D95A2B] flex items-center justify-center font-bold text-xs">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-[#1C2B29]">
                          {branch.name}
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={deletingBranchId === branch.id}
                        onClick={() => handleDeleteBranch(branch)}
                        className="px-3 py-1.5 rounded-xl border border-red-300 text-red-600 hover:bg-red-50 text-xs font-semibold disabled:opacity-50 transition"
                      >
                        {deletingBranchId === branch.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Branch Inline Form */}
              <form onSubmit={handleAddBranch} className="pt-1">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="Enter branch name..."
                    disabled={creatingBranch}
                    className="flex-1 bg-white border border-[#E5E0D8] rounded-xl px-3 py-2 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B] transition"
                  />
                  <button
                    type="submit"
                    disabled={creatingBranch || !newBranchName.trim()}
                    className="px-4 py-2 bg-[#D95A2B] hover:bg-[#C84E18] text-white rounded-xl text-xs font-bold disabled:opacity-50 transition shadow-xs"
                  >
                    {creatingBranch ? "Adding..." : "Add"}
                  </button>
                </div>
              </form>
            </div>

            {/* SECTION B — Machines */}
            <div className="space-y-3 pt-2 border-t border-[#EDE8E0]">
              <h2 className="text-base font-bold text-[#1C2B29]">Machines</h2>
              <div className="space-y-2.5">
                {machinesList.map((m, idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-[#EDE8E0] rounded-2xl p-3 shadow-xs"
                  >
                    <div className="text-xs font-bold text-[#1C2B29]">{m.name}</div>
                    <div className="text-[11px] text-[#5C6460] mt-0.5">{m.section}</div>
                  </div>
                ))}
              </div>
            </div>
          </main>
        )}


        {/* ─── TAB 3: DOCUMENTS (READ & APPROVE) ────────────────────── */}
        {activeNav === "documents" && (
          <main className="flex-1 px-4 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1C2B29]">
                Documents · Review &amp; Approval
              </h2>
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="flex items-center gap-1.5 bg-[#D95A2B] text-white text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-[#C84E18] transition"
              >
                <Upload className="w-4 h-4" />
                <span>Upload</span>
              </button>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 pb-1">
              {[
                {
                  id: "pending",
                  label: `Pending (${documents.filter((d) => d.status === "queued" || d.status === "processing").length})`,
                },
                { id: "approved", label: "Approved" },
                { id: "rejected", label: "Rejected" },
                { id: "all", label: "All" },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setDocFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${docFilter === f.id
                      ? "bg-[#1C2B29] text-white"
                      : "bg-white border border-[#E5E0D8] text-[#5C6460] hover:text-[#1C2B29]"
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* View Document Error Alert */}
            {viewDocError && (
              <div className="bg-[#FDF2F2] border border-[#F8B4B4] text-[#9B1C1C] text-xs p-3 rounded-2xl flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{viewDocError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setViewDocError(null)}
                  className="p-1 rounded-full text-[#9B1C1C] hover:bg-[#FDE8E8] transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Documents List */}
            <div className="space-y-3">
              {filteredDocs.map((doc) => {
                const badge = getDocStatusBadge(doc.status);
                const isLoadingThisDoc = viewLoadingDocId === doc.id;
                return (
                  <div
                    key={doc.id}
                    onClick={() => {
                      setSelectedDoc(doc);
                      setDocActionError(null);
                    }}
                    className="bg-white border border-[#EDE8E0] rounded-2xl p-4 shadow-xs cursor-pointer hover:border-[#D95A2B] transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-[#1C2B29] truncate">
                        {doc.title}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {doc.id && (
                          <button
                            type="button"
                            disabled={isLoadingThisDoc}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewDoc(doc.id, doc.title);
                            }}
                            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] hover:border-[#D95A2B] text-xs font-semibold text-[#1C2B29] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#D95A2B]" />
                            <span>{isLoadingThisDoc ? "Loading..." : "View PDF"}</span>
                          </button>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#F0ECE4] text-[11px] text-[#5C6460]">
                      <span>{doc.rev} · {doc.uploadedBy}</span>
                      <ChevronRight className="w-4 h-4 text-[#5C6460]" />
                    </div>
                  </div>
                );
              })}
            </div>
          </main>
        )}

        {/* ─── TAB 4: MANAGE REVIEWERS ──────────────────────────────── */}
        {activeNav === "team" && (
          <main className="flex-1 px-4 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1C2B29]">
                Reviewers &amp; Team
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowInviteModal(true);
                  setPromoteError(null);
                }}
                className="flex items-center gap-1.5 bg-[#D95A2B] text-white text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-[#C84E18] transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Promote Employee</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {reviewers.map((r, i) => (
                <div
                  key={r.id || i}
                  className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#1C2B29] text-white flex items-center justify-center font-bold text-xs">
                      {r.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#1C2B29]">
                        {r.name}
                      </div>
                      <div className="text-[11px] text-[#5C6460]">
                        {r.email}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EDE8E0] text-[#1C2B29]">
                      {roleLabel(r.role || "worker")}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.status === "Active"
                          ? "bg-[#EDE8E0] text-[#1C2B29]"
                          : "bg-[#FAF8F5] text-[#5C6460] border border-[#E5E0D8]"
                        }`}
                    >
                      {r.status}
                    </span>
                    {(r.role === "expert" || r.role === "supervisor" || r.role === "reviewer") && (
                      <button
                        type="button"
                        aria-label="Demote to worker"
                        disabled={demoteSubmittingId === r.id}
                        onClick={() => handleDemoteExpert(r.id)}
                        className="min-h-[48px] px-3 py-1.5 rounded-xl border border-[#EDE8E0] bg-[#FAF8F5] text-[#1C2B29] text-xs font-semibold hover:bg-[#E5E0D8] transition disabled:opacity-50 cursor-pointer"
                      >
                        {demoteSubmittingId === r.id ? "Updating..." : "Demote to Worker"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </main>
        )}

        {/* ─── TAB 5: OPERATIONS REPORTS ────────────────────────────── */}
        {activeNav === "reports" && (() => {
          const hasResolutionData =
            analyticsSummary &&
            typeof analyticsSummary.resolution_sample_size === "number" &&
            analyticsSummary.resolution_sample_size > 0;
          const resolvedCount = hasResolutionData
            ? analyticsSummary.resolution_breakdown["resolved"] || 0
            : 0;
          const resolutionPct = hasResolutionData
            ? Math.round((resolvedCount / analyticsSummary.resolution_sample_size) * 100)
            : null;
          const errorCodes = analyticsSummary?.recurring_error_codes ?? [];
          const maxErrorCount = Math.max(...errorCodes.map((c) => c.count), 1);
          const barColors = ["bg-[#D95A2B]", "bg-[#1C2B29]", "bg-[#5C6460]"];
          return (
            <main className="flex-1 px-4 py-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h2 className="text-base font-bold text-[#1C2B29]">Operations Reports</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadAnalytics}
                    disabled={downloadingAnalytics}
                    className="min-h-[48px] px-4 py-2 bg-[#EDE8E0] hover:bg-[#E5E0D8] text-[#1C2B29] border border-[#E5E0D8] rounded-xl text-xs font-semibold transition inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>{downloadingAnalytics ? "Preparing..." : "Download Analytics PDF"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadEscalations}
                    disabled={downloadingEscalations}
                    className="min-h-[48px] px-4 py-2 bg-[#EDE8E0] hover:bg-[#E5E0D8] text-[#1C2B29] border border-[#E5E0D8] rounded-xl text-xs font-semibold transition inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>{downloadingEscalations ? "Preparing..." : "Download Escalations PDF"}</span>
                  </button>
                </div>
              </div>
              {analyticsDownloadError && (
                <div className="p-3 rounded-xl text-xs font-medium bg-[#FAF8F5] border border-[#D95A2B] text-[#D95A2B]">
                  {analyticsDownloadError}
                </div>
              )}
              {escalationDownloadError && (
                <div className="p-3 rounded-xl text-xs font-medium bg-[#FAF8F5] border border-[#D95A2B] text-[#D95A2B]">
                  {escalationDownloadError}
                </div>
              )}

              {/* ─── Factory Summary Production Planning Export ─── */}
              <div className="bg-white border border-[#EDE8E0] rounded-2xl p-4 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-[#1C2B29]">Factory Summary Report</div>
                    <div className="text-[11px] text-[#5C6460] mt-0.5">
                      Production planning PDF: totals, per-machine breakdown, recurring questions, resolution performance, and documentation gaps.
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
                    <span className="text-xs font-semibold text-[#5C6460] mr-1">Period:</span>
                    {([7, 30, 90] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setSummaryDays(d)}
                        disabled={downloadingSummary}
                        aria-label={`Select ${d} day period for summary`}
                        aria-pressed={summaryDays === d}
                        className={`min-h-[48px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition disabled:opacity-50 ${
                          summaryDays === d
                            ? "bg-[#1C2B29] text-white"
                            : "bg-[#FAF8F5] text-[#5C6460] border border-[#E5E0D8] hover:bg-[#EDE8E0] hover:text-[#1C2B29]"
                        }`}
                      >
                        {d} Days
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-[#EDE8E0]">
                  <button
                    type="button"
                    onClick={handleDownloadSummary}
                    disabled={downloadingSummary}
                    aria-label="Download Factory Summary PDF"
                    className="min-h-[48px] px-4 py-2 bg-[#D95A2B] hover:bg-[#C84E18] text-white rounded-xl text-xs font-semibold transition inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>{downloadingSummary ? "Preparing Factory Summary PDF..." : `Download Factory Summary PDF (${summaryDays} Days)`}</span>
                  </button>
                  <span className="text-[11px] text-[#5C6460]">Full factory planning dataset with documentation gaps</span>
                </div>

                {summaryDownloadError && (
                  <div className="p-3 rounded-xl text-xs font-medium bg-[#FAF8F5] border border-[#D95A2B] text-[#D95A2B]">
                    {summaryDownloadError}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-[#EDE8E0] rounded-2xl p-3 shadow-xs">
                  <div className="text-xs text-[#5C6460]">Total Queries</div>
                  <div className="text-xl font-bold text-[#1C2B29] mt-0.5">
                    {analyticsSummary?.total_queries ?? "—"}
                  </div>
                </div>
                <div className="bg-white border border-[#EDE8E0] rounded-2xl p-3 shadow-xs">
                  <div className="text-xs text-[#5C6460]">Resolution Rate</div>
                  {resolutionPct !== null ? (
                    <div className="text-xl font-bold text-green-700 mt-0.5">
                      {resolutionPct}%
                    </div>
                  ) : (
                    <div className="text-xs text-[#5C6460] mt-1.5">No data yet</div>
                  )}
                </div>
              </div>
              <div className="bg-white border border-[#EDE8E0] rounded-2xl p-4 shadow-xs space-y-3">
                <div className="text-xs font-bold text-[#1C2B29]">Top Recurring Error Codes</div>
                {analyticsSummary === null ? (
                  <div className="text-xs text-[#5C6460]">
                    {analyticsLoading ? "Loading..." : "No data available"}
                  </div>
                ) : errorCodes.length === 0 ? (
                  <div className="text-xs text-[#5C6460]">No error code data yet</div>
                ) : (
                  <div className="space-y-2">
                    {errorCodes.map((item, idx) => {
                      const widthPct = (item.count / maxErrorCount) * 100;
                      const barColor = barColors[idx % barColors.length];
                      return (
                        <div key={item.code || idx}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-semibold text-[#1C2B29]">{item.code}</span>
                            <span className="text-[#5C6460]">{item.count} events</span>
                          </div>
                          <div className="w-full h-2 bg-[#FAF8F5] rounded-full overflow-hidden">
                            <div
                              className={`h-full ${barColor} rounded-full`}
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </main>
          );
        })()}

        {/* ─── MODAL: DOCUMENT APPROVAL DRAWER ──────────────────────── */}
        {selectedDoc && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3" onClick={(e) => { if (e.target === e.currentTarget) { setSelectedDoc(null); setDocActionError(null); } }}>
            <div className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl border border-[#EDE8E0] space-y-4 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#D95A2B]" />
                  <span className="font-bold text-sm text-[#1C2B29]">
                    {selectedDoc.title}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDoc(null);
                    setDocActionError(null);
                  }}
                  className="p-1 rounded-full text-[#5C6460] hover:bg-[#FAF8F5]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 text-xs">
                <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-3 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[#5C6460]">Uploaded by:</span>
                    <span className="font-semibold text-[#1C2B29]">{selectedDoc.uploadedBy}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#5C6460]">Revision:</span>
                    <span className="font-semibold text-[#1C2B29]">{selectedDoc.rev}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#5C6460]">Applicable Machines:</span>
                    <span className="font-semibold text-[#1C2B29]">{selectedDoc.machines}</span>
                  </div>
                  {selectedDoc.machine_name && (
                    <div className="flex justify-between">
                      <span className="text-[#5C6460]">Machine:</span>
                      <span className="font-semibold text-[#1C2B29]">{selectedDoc.machine_name}</span>
                    </div>
                  )}
                  {selectedDoc.approved_by && (
                    <div className="flex justify-between">
                      <span className="text-[#5C6460]">Approved by:</span>
                      <span className="font-semibold text-[#1C2B29]">{selectedDoc.approved_by}</span>
                    </div>
                  )}
                  {selectedDoc.approved_at && (
                    <div className="flex justify-between">
                      <span className="text-[#5C6460]">Approved at:</span>
                      <span className="font-semibold text-[#1C2B29]">
                        {new Date(selectedDoc.approved_at).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-[#F8F6F2] border border-[#E5E0D8] rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#D95A2B]" />
                    <div>
                      <span className="font-bold text-xs block text-[#1C2B29]">{selectedDoc.filename}</span>
                      <span className="text-[10px] text-[#5C6460]">{selectedDoc.filesize}</span>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-[#5C6460]" />
                </div>

                <button
                  type="button"
                  disabled={viewLoadingDocId === selectedDoc.id}
                  onClick={() => handleViewDoc(selectedDoc.id, selectedDoc.title)}
                  className="w-full py-2.5 rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] hover:border-[#D95A2B] text-xs font-bold text-[#1C2B29] transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <FileText className="w-4 h-4 text-[#D95A2B]" />
                  <span>{viewLoadingDocId === selectedDoc.id ? "Loading PDF..." : "View PDF Document"}</span>
                </button>

                {docActionError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-2xl flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                      <span>{docActionError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDocActionError(null)}
                      className="p-1 rounded-full text-red-500 hover:bg-red-100 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {(selectedDoc.status === "queued" || selectedDoc.status === "processing") && (
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      type="button"
                      disabled={docActionSubmitting}
                      onClick={() => handleRejectDoc(selectedDoc.id)}
                      className="py-2.5 rounded-xl border border-red-300 text-red-600 font-bold hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={docActionSubmitting}
                      onClick={() => handleApproveDoc(selectedDoc.id)}
                      className="py-2.5 rounded-xl bg-green-700 text-white font-bold hover:bg-green-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Approve
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── MODAL: PROMOTE WORKER ───────────────────────────────── */}
        {showInviteModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowInviteModal(false); setPromoteError(null); setSelectedWorkerId(""); setTargetPromoteRole("supervisor"); } }}>
            <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-[#EDE8E0] space-y-4">
              <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-2">
                <span className="font-bold text-sm text-[#1C2B29]">Promote Employee</span>
                <button
                  type="button"
                  aria-label="Close promote modal"
                  onClick={() => {
                    setShowInviteModal(false);
                    setPromoteError(null);
                    setSelectedWorkerId("");
                    setTargetPromoteRole("supervisor");
                  }}
                  className="p-2 rounded-full text-[#5C6460] hover:bg-[#FAF8F5]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                {promotableWorkers.length === 0 ? (
                  <p className="text-xs text-[#5C6460] py-2 text-center">
                    No eligible employees to promote
                  </p>
                ) : (
                  <>
                    <div>
                      <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                        Select Employee
                      </label>
                      <select
                        aria-label="Select employee to promote"
                        value={selectedWorkerId}
                        onChange={(e) => setSelectedWorkerId(e.target.value)}
                        className="w-full min-h-[48px] bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-2.5 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B]"
                      >
                        <option value="">Select an employee...</option>
                        {promotableWorkers.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({w.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                        Promote To Role
                      </label>
                      <select
                        aria-label="Select role to promote to"
                        value={targetPromoteRole}
                        onChange={(e) => setTargetPromoteRole(e.target.value as "supervisor" | "expert")}
                        className="w-full min-h-[48px] bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-2.5 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B]"
                      >
                        <option value="supervisor">Reviewer</option>
                        <option value="expert">Expert Engineer</option>
                      </select>
                    </div>
                  </>
                )}

                {promoteError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-2xl flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                      <span>{promoteError}</span>
                    </div>
                    <button
                      type="button"
                      aria-label="Dismiss promote error"
                      onClick={() => setPromoteError(null)}
                      className="p-1 rounded-full text-red-500 hover:bg-red-100 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {promotableWorkers.length > 0 && (
                  <button
                    type="button"
                    aria-label="Promote employee"
                    disabled={promoteSubmitting || !selectedWorkerId}
                    onClick={handlePromoteWorker}
                    className="w-full min-h-[48px] py-3 rounded-2xl bg-[#D95A2B] hover:bg-[#C84E18] text-white text-xs font-bold transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {promoteSubmitting ? "Promoting..." : "Promote Employee"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── MODAL: UPLOAD DOCUMENT ───────────────────────────────── */}
        {showUploadModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowUploadModal(false); }}>
            <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-[#EDE8E0] space-y-4">
              <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-2">
                <span className="font-bold text-sm text-[#1C2B29]">Upload Document</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadError(null);
                    setNewDocFile(null);
                    setSelectedUploadMachineId("");
                  }}
                  className="p-1 rounded-full text-[#5C6460] hover:bg-[#FAF8F5]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3">
                <label className="border-2 border-dashed border-[#E5E0D8] rounded-2xl p-6 text-center bg-[#FAF8F5] cursor-pointer hover:border-[#D95A2B] transition block">
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setNewDocFile(file);
                      if (file) setUploadError(null);
                    }}
                  />
                  <Upload className="w-8 h-8 text-[#D95A2B] mx-auto mb-2" />
                  <span className="font-bold text-xs text-[#1C2B29] block truncate">
                    {newDocFile ? newDocFile.name : "Tap to select PDF"}
                  </span>
                  <span className="text-[10px] text-[#5C6460]">Max file size 50 MB</span>
                </label>
                <div>
                  <label className="text-[11px] font-bold text-[#5C6460] block mb-1">Machine</label>
                  <select
                    value={selectedUploadMachineId}
                    onChange={(e) => {
                      setSelectedUploadMachineId(e.target.value);
                      if (e.target.value) setUploadError(null);
                    }}
                    className="w-full bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-2.5 text-xs text-[#1C2B29]"
                  >
                    <option value="">Select machine...</option>
                    {machinesList.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#5C6460] block mb-1">Category</label>
                  <select
                    value={newDocCategory}
                    onChange={(e) => setNewDocCategory(e.target.value)}
                    className="w-full bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-2.5 text-xs text-[#1C2B29]"
                  >
                    <option value="SOP">SOP</option>
                    <option value="Manual">Manual</option>
                    <option value="Safety">Safety Guidelines</option>
                    <option value="Guide">Troubleshooting Guide</option>
                  </select>
                </div>
                {uploadError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span className="text-[11px] leading-tight">{uploadError}</span>
                  </div>
                )}
                <button
                  type="button"
                  disabled={uploadSubmitting}
                  onClick={async () => {
                    if (!newDocFile || !selectedUploadMachineId) {
                      setUploadError("Please select a file and a machine.");
                      return;
                    }
                    setUploadSubmitting(true);
                    setUploadError(null);
                    try {
                      const res = await api.uploadDocument(
                        newDocFile,
                        selectedUploadMachineId,
                        newDocCategory.toLowerCase()
                      );
                      setDocuments((prev) => [
                        {
                          id: res.doc_id,
                          title: newDocFile.name,
                          rev: "1.0",
                          uploadedBy: "You",
                          date: "Just now",
                          status: "processing",
                          category: newDocCategory,
                          machines: machinesList.find(m => m.id === selectedUploadMachineId)?.name || "Unknown Machine",
                          filename: newDocFile.name,
                          filesize: "Unknown",
                          machine_name: machinesList.find(m => m.id === selectedUploadMachineId)?.name || null,
                          approved_by: null,
                          approved_at: null,
                        },
                        ...prev,
                      ]);
                      setShowUploadModal(false);
                      setNewDocFile(null);
                      setSelectedUploadMachineId("");
                    } catch (err: any) {
                      setUploadError(err?.message || "Upload failed.");
                    } finally {
                      setUploadSubmitting(false);
                    }
                  }}
                  className="w-full py-3 rounded-2xl bg-[#D95A2B] hover:bg-[#C84E18] disabled:opacity-50 text-white text-xs font-bold transition shadow-xs"
                >
                  {uploadSubmitting ? "Uploading..." : "Upload for Verification"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── BOTTOM DOCK NAVIGATION (mobile only) ───────────────── */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 max-w-md mx-auto bg-white/95 backdrop-blur-md border-t border-[#EDE8E0] px-4 py-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setActiveNav("home")}
            className={`flex flex-col items-center gap-1 text-[11px] font-semibold transition ${activeNav === "home" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
              }`}
          >
            <Home className="w-5 h-5" />
            <span>Home</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav("branch")}
            className={`flex flex-col items-center gap-1 text-[11px] font-semibold transition ${activeNav === "branch" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
              }`}
          >
            <Building2 className="w-5 h-5" />
            <span>Branch</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav("documents")}
            className={`flex flex-col items-center gap-1 text-[11px] font-semibold transition ${activeNav === "documents" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
              }`}
          >
            <FileCheck2 className="w-5 h-5" />
            <span>Docs</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav("team")}
            className={`flex flex-col items-center gap-1 text-[11px] font-semibold transition ${activeNav === "team" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
              }`}
          >
            <Users className="w-5 h-5" />
            <span>Team</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav("reports")}
            className={`flex flex-col items-center gap-1 text-[11px] font-semibold transition ${activeNav === "reports" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
              }`}
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span>Reports</span>
          </button>
        </nav>
        </div>

        {/* Profile & Settings Modal */}
        <ProfileModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
        />

        {/* PDF Preview Modal */}
        {viewDocModalData && (
          <PdfPreviewModal
            open={!!viewDocModalData}
            title={viewDocModalData.title}
            src={viewDocModalData.src}
            onClose={() => setViewDocModalData(null)}
          />
        )}
      </div>
    </div>
  );
}
