"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/context";
import { api, type Tip, type SopProposal, type AnalyticsSummary, type AnalyticsBreakdown, type Machine } from "@/lib/api";
import { roleLabel } from "@/lib/roles";
import TicketThread from "@/components/TicketThread";
import PdfPreviewModal from "@/components/PdfPreviewModal";
import {
  Home,
  Layers,
  Users,
  FileText,
  BarChart2,
  Bell,
  ChevronDown,
  Check,
  Search,
  AlertTriangle,
  AlertCircle,
  Clock,
  CheckCircle2,
  ChevronRight,
  Upload,
  Send,
  X,
  ShieldAlert,
  ArrowRight,
  Lightbulb,
  ClipboardList,
  MessageSquare,
  RotateCw,
  Download,
} from "lucide-react";

function getDocStatusBadge(status: string) {
  switch ((status || "").toLowerCase()) {
    case "approved":
      return { label: "Approved", className: "bg-[#EDE8E0] text-[#1C2B29]" };
    case "rejected":
      return { label: "Rejected", className: "bg-[#FAF8F5] text-[#D95A2B] border border-[#D95A2B]" };
    case "failed":
      return { label: "Failed", className: "bg-[#FAF8F5] text-[#D95A2B] border border-[#D95A2B]" };
    case "superseded":
      return { label: "Superseded", className: "bg-[#FAF8F5] text-[#5C6460] border border-[#E5E0D8]" };
    case "queued":
    case "pending":
      return { label: "Pending", className: "bg-[#FAF8F5] text-[#5C6460] border border-[#E5E0D8]" };
    case "processing":
      return { label: "Processing", className: "bg-[#FAF8F5] text-[#5C6460] border border-[#E5E0D8]" };
    default:
      return { label: status, className: "bg-[#FAF8F5] text-[#5C6460] border border-[#E5E0D8]" };
  }
}

export default function ReviewerPage() {
  const router = useRouter();
  const { logout, user } = useApp();

  const [activeNav, setActiveNav] = useState<"home" | "queries" | "tips" | "proposals" | "employees" | "documents" | "reports">("home");
  const [showBranchMenu, setShowBranchMenu] = useState(false);

  // Queries queue
  const [queryFilter, setQueryFilter] = useState<"all" | "high" | "misanswered" | "resolved">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<{
    id: string;
    num: string;
    machine: string;
    worker: string;
    workerId: string;
    issue: string;
    reported: string;
    priority: "high" | "medium" | "low";
    question: string;
    aiResponse: string;
    workerFeedback: string;
    status: string;
    sources: string[];
    image_url: string | null;
    created_at?: string;
    assigned_expert_id?: string | null;
    resolved_at?: string | null;
  } | null>(null);

  const [detailTab, setDetailTab] = useState<"details" | "conversation" | "sources">("details");
  const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
  const [showThreadView, setShowThreadView] = useState(false);
  const [forwardExpertId, setForwardExpertId] = useState("");
  const [showAssignSuccess, setShowAssignSuccess] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  // Document PDF preview modal state
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

  // Tips review state
  const [pendingTips, setPendingTips] = useState<Tip[]>([]);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState<string | null>(null);
  const [selectedTip, setSelectedTip] = useState<Tip | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // SOP Proposals state
  const [proposalsList, setProposalsList] = useState<SopProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<SopProposal | null>(null);
  const [proposalReviewNotes, setProposalReviewNotes] = useState("");
  const [proposalSubmitting, setProposalSubmitting] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);

  // Reports / Analytics state
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // CSV report download state
  const [downloadingEscalations, setDownloadingEscalations] = useState(false);
  const [escalationDownloadError, setEscalationDownloadError] = useState<string | null>(null);
  const [downloadingAnalytics, setDownloadingAnalytics] = useState(false);
  const [analyticsDownloadError, setAnalyticsDownloadError] = useState<string | null>(null);

  const handleDownloadEscalations = async () => {
    setDownloadingEscalations(true);
    setEscalationDownloadError(null);
    try {
      await api.downloadReport("escalations");
    } catch (err: any) {
      setEscalationDownloadError(err?.message || "Failed to download escalations report");
    } finally {
      setDownloadingEscalations(false);
    }
  };

  const handleDownloadAnalytics = async () => {
    setDownloadingAnalytics(true);
    setAnalyticsDownloadError(null);
    try {
      await api.downloadReport("analytics");
    } catch (err: any) {
      setAnalyticsDownloadError(err?.message || "Failed to download analytics report");
    } finally {
      setDownloadingAnalytics(false);
    }
  };

  // Analytics breakdown panel state (7/30/90 days)
  const [breakdownDays, setBreakdownDays] = useState<7 | 30 | 90>(30);
  const [breakdownData, setBreakdownData] = useState<AnalyticsBreakdown | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);

  const fetchBreakdown = React.useCallback(async (daysToFetch: number) => {
    setBreakdownLoading(true);
    setBreakdownError(null);
    try {
      const data = await api.getAnalyticsBreakdown(daysToFetch);
      setBreakdownData(data);
    } catch (err: any) {
      setBreakdownError(err?.message || "Failed to load breakdown analytics");
    } finally {
      setBreakdownLoading(false);
    }
  }, []);

  const fetchPendingTips = React.useCallback(async () => {
    setTipsLoading(true);
    setTipsError(null);
    try {
      const data = await api.getTips(undefined, "pending_review");
      setPendingTips(data || []);
    } catch (err: any) {
      setTipsError(err?.message || "Failed to load pending tips");
    } finally {
      setTipsLoading(false);
    }
  }, []);

  const handleReview = async (status: "approved" | "rejected") => {
    if (!selectedTip) return;
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      const reviewerName = user?.full_name || user?.email || "Reviewer";
      await api.reviewTip(selectedTip.id, {
        status,
        reviewer: reviewerName,
        review_notes: reviewNotes.trim() ? reviewNotes.trim() : undefined,
      });

      // Optimistic local update
      setPendingTips((prev) => prev.filter((t) => t.id !== selectedTip.id));
      setSelectedTip(null);
      setReviewNotes("");
      setReviewError(null);
    } catch (err: any) {
      setReviewError(err?.message || `Failed to ${status} tip. Please try again.`);
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleReviewProposal = async (newStatus: "approved" | "rejected" | "merged") => {
    if (!selectedProposal) return;
    setProposalSubmitting(true);
    setProposalError(null);
    try {
      const updated = await api.reviewProposal(selectedProposal.id, {
        status: newStatus,
        review_notes: proposalReviewNotes || undefined,
      });
      setProposalsList((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p))
      );
      setSelectedProposal(updated);
    } catch (err: any) {
      setProposalError(err?.message || "Failed to review proposal. Please try again.");
    } finally {
      setProposalSubmitting(false);
    }
  };

  const handleApproveDocument = async () => {
    if (!selectedDocument || !selectedDocument.id) return;
    setDocActionSubmitting(true);
    setDocActionError(null);
    try {
      await api.approveDocument(selectedDocument.id);
      const updated = { ...selectedDocument, status: "approved" };
      setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setSelectedDocument(updated);
    } catch (err: any) {
      setDocActionError(err?.message || "Failed to approve document. Please try again.");
    } finally {
      setDocActionSubmitting(false);
    }
  };

  const handleRejectDocument = async () => {
    if (!selectedDocument || !selectedDocument.id) return;
    setDocActionSubmitting(true);
    setDocActionError(null);
    try {
      await api.rejectDocument(selectedDocument.id);
      const updated = { ...selectedDocument, status: "rejected" };
      setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setSelectedDocument(updated);
    } catch (err: any) {
      setDocActionError(err?.message || "Failed to reject document. Please try again.");
    } finally {
      setDocActionSubmitting(false);
    }
  };

  const handleSelectTicket = (q: (typeof queriesList)[0]) => {
    setSelectedTicket(q);
    setShowThreadView(false);
    setShowAssignSuccess(false);
    setAssignError(null);
    setEnlargedImageUrl(null);
    setForwardExpertId(q.assigned_expert_id || "");
    api.getEscalation(q.id)
      .then((result) => {
        setSelectedTicket((prev) =>
          prev && prev.id === result.id
            ? {
              ...prev,
              question: result.question_text || prev.question,
              aiResponse: result.ai_response || "",
              sources: result.sources || prev.sources,
              image_url: result.image_url ?? null,
              worker: result.worker_name || prev.worker,
              created_at: result.created_at || prev.created_at,
              assigned_expert_id: result.assigned_expert_id ?? prev.assigned_expert_id,
              resolved_at: result.resolved_at ?? prev.resolved_at,
              status: result.status || prev.status,
            }
            : prev
        );
      })
      .catch(() => { });

    api.getTicketThread(q.id)
      .then((res) => {
        if (res && res.ticket) {
          setSelectedTicket((prev) =>
            prev && prev.id === res.ticket.id
              ? {
                ...prev,
                assigned_expert_id: res.ticket.assigned_expert_id ?? prev.assigned_expert_id,
                status: res.ticket.status || prev.status,
                resolved_at: res.ticket.resolved_at ?? prev.resolved_at,
              }
              : prev
          );
          if (res.ticket.assigned_expert_id) {
            setForwardExpertId(res.ticket.assigned_expert_id);
          }
        }
      })
      .catch(() => { });
  };

  const handleForwardTicket = async () => {
    if (!selectedTicket || !forwardExpertId) return;
    setAssignSubmitting(true);
    setAssignError(null);
    setShowAssignSuccess(false);
    try {
      const res = await api.assignTicket(selectedTicket.id, forwardExpertId);
      setShowAssignSuccess(true);
      setQueriesList((prev) =>
        prev.map((t) =>
          t.id === selectedTicket.id
            ? { ...t, status: res.status || "in_progress" }
            : t
        )
      );
      setSelectedTicket((prev) =>
        prev
          ? {
            ...prev,
            status: res.status || "in_progress",
            assigned_expert_id: res.assigned_expert_id,
          }
          : null
      );
    } catch (err: any) {
      setAssignError(err?.message || "Failed to assign ticket.");
    } finally {
      setAssignSubmitting(false);
    }
  };

  const handleUnassignTicket = async () => {
    if (!selectedTicket) return;
    setAssignSubmitting(true);
    setAssignError(null);
    setShowAssignSuccess(false);
    try {
      await api.assignTicket(selectedTicket.id, null);
      setShowAssignSuccess(true);
      setSelectedTicket((prev) =>
        prev
          ? {
            ...prev,
            assigned_expert_id: null,
          }
          : null
      );
      setForwardExpertId("");
    } catch (err: any) {
      setAssignError(err?.message || "Failed to unassign ticket.");
    } finally {
      setAssignSubmitting(false);
    }
  };

  // Real dynamic queries list from DB
  const [queriesList, setQueriesList] = useState<Array<{
    id: string;
    num: string;
    machine: string;
    worker: string;
    workerId: string;
    issue: string;
    reported: string;
    priority: "high" | "medium" | "low";
    question: string;
    aiResponse: string;
    workerFeedback: string;
    status: string;
    sources: string[];
    image_url: string | null;
    created_at?: string;
    assigned_expert_id?: string | null;
    resolved_at?: string | null;
  }>>([]);

  // Genuine documents list from DB
  const [documents, setDocuments] = useState<Array<{
    id?: string;
    title: string;
    filename?: string;
    doc_type?: string;
    rev: string;
    revision?: string;
    date: string;
    status: string;
    category: string;
    page_count?: number;
    owner?: string;
    machine_name?: string | null;
    approved_by?: string | null;
    approved_at?: string | null;
  }>>([]);
  const [selectedDocument, setSelectedDocument] = useState<(typeof documents)[0] | null>(null);
  const [docActionSubmitting, setDocActionSubmitting] = useState(false);
  const [docActionError, setDocActionError] = useState<string | null>(null);

  // Genuine employees list from DB
  const [employeesList, setEmployeesList] = useState<Array<{
    id?: string;
    name: string;
    role: string;
    unit: string;
    status: string;
  }>>([]);
  const expertUsers = employeesList.filter((e) => e.role === "expert" && e.id);
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  const handleRoleChange = async (userId: string | undefined, newRole: "worker" | "expert") => {
    if (!userId) return;
    setRoleUpdatingId(userId);
    setRoleError(null);
    try {
      const res = await api.setUserRole(userId, newRole);
      setEmployeesList((prev) =>
        prev.map((e) => (e.id === userId ? { ...e, role: res.role || newRole } : e))
      );
    } catch (err: any) {
      setRoleError(err?.message || "Failed to update role");
    } finally {
      setRoleUpdatingId(null);
    }
  };

  const [machinesList, setMachinesList] = useState<Machine[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const [selectedUploadMachineId, setSelectedUploadMachineId] = useState("");
  const [newDocCategory, setNewDocCategory] = useState("SOP");
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const isResolvedStatus = (status?: string | null) => {
    const s = (status || "").toLowerCase().trim();
    return s === "resolved" || s === "closed";
  };

  const getExpertName = (expertId?: string | null) => {
    if (!expertId) return "Expert";
    const matched = employeesList.find((e) => e.id === expertId);
    return matched?.name || "Expert";
  };

  const fetchEscalations = React.useCallback(async () => {
    try {
      const tickets = await api.getEscalations();
      if (tickets) {
        setQueriesList(
          tickets.map((t) => ({
            id: t.id,
            num: `#${t.id.slice(0, 4)}`,
            machine: t.machine_name || "Unknown Machine",
            worker: t.worker_name || "Unknown worker",
            workerId: "",
            issue: t.ai_drafted_brief || "Escalated inquiry",
            reported: t.created_at
              ? new Date(t.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
              : "Recent",
            priority: (t.priority === "high" || t.priority === "urgent" ? "high" : "medium") as any,
            question: t.ai_drafted_brief || "No question details provided",
            aiResponse: "",
            workerFeedback: "",
            status: t.status || "Unresolved",
            sources: [],
            image_url: null,
            created_at: t.created_at,
            assigned_expert_id: t.assigned_expert_id || null,
            resolved_at: t.resolved_at || null,
          }))
        );
      }
    } catch {
      // ignore
    }
  }, []);

  // Fetch real data on mount from backend
  useEffect(() => {
    let isMounted = true;

    fetchPendingTips();
    fetchEscalations();

    Promise.all([
      api.getDocuments().catch(() => []),
      api.getUsers().catch(() => []),
      api.getMachines().catch(() => [] as Machine[]),
    ]).then(([docs, usersData, machines]) => {
      if (isMounted) {
        if (machines && machines.length > 0) {
          setMachinesList(machines);
        }
        if (docs && docs.length > 0) {
          setDocuments(
            docs.map((d) => ({
              id: d.id,
              title: d.filename,
              filename: d.filename,
              doc_type: d.doc_type,
              rev: d.revision || "v1.0",
              revision: d.revision || "v1.0",
              date: d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : "Active",
              status: d.status,
              category: d.doc_type || "Manual",
              page_count: d.page_count,
              owner: d.owner,
              machine_name: d.machine_name,
              approved_by: d.approved_by,
              approved_at: d.approved_at,
            }))
          );
        }
        if (usersData && usersData.length > 0) {
          setEmployeesList(
            usersData.map((u) => ({
              id: (u as any).user_id || u.id,
              name: u.full_name || u.email,
              role: u.role || "worker",
              unit: "Indus Plant Omega",
              status: "Active",
            }))
          );
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [fetchPendingTips, fetchEscalations]);

  // Re-fetch escalations whenever Queries tab becomes active or query filter changes
  useEffect(() => {
    if (activeNav === "queries") {
      fetchEscalations();
    }
  }, [activeNav, queryFilter, fetchEscalations]);

  // Re-fetch pending tips whenever Tips tab becomes active
  useEffect(() => {
    if (activeNav === "tips") {
      fetchPendingTips();
    }
  }, [activeNav, fetchPendingTips]);

  // Fetch SOP proposals whenever Proposals tab becomes active
  useEffect(() => {
    if (activeNav === "proposals") {
      setProposalsLoading(true);
      api
        .getProposals()
        .then((result) => {
          setProposalsList(result.proposals);
        })
        .catch((err) => {
          console.error("Failed to fetch SOP proposals:", err);
        })
        .finally(() => {
          setProposalsLoading(false);
        });
    }
  }, [activeNav]);

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
    fetchBreakdown(breakdownDays);
  }, [activeNav, breakdownDays, fetchBreakdown]);

  // Close modals on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (enlargedImageUrl) { setEnlargedImageUrl(null); return; }
      if (showUploadModal) { setShowUploadModal(false); return; }
      if (selectedTip) { setSelectedTip(null); setReviewNotes(""); setReviewError(null); return; }
      if (selectedProposal) { setSelectedProposal(null); setProposalReviewNotes(""); setProposalError(null); return; }
      if (selectedDocument) { setSelectedDocument(null); setDocActionError(null); return; }
      if (selectedTicket) {
        setSelectedTicket(null); setShowThreadView(false); setShowAssignSuccess(false);
        setAssignError(null); setEnlargedImageUrl(null); fetchEscalations();
        return;
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [enlargedImageUrl, showUploadModal, selectedTip, selectedProposal, selectedDocument, selectedTicket]);

  // Filtered queries
  const filteredQueries = queriesList.filter((q) => {
    const isResolved = isResolvedStatus(q.status);
    if (queryFilter === "resolved") {
      if (!isResolved) return false;
    } else {
      if (isResolved) return false;
      if (queryFilter === "high" && q.priority !== "high") return false;
      if (queryFilter === "misanswered" && q.status !== "in_progress") return false;
    }
    if (searchQuery) {
      const s = searchQuery.toLowerCase();
      return (
        q.num.toLowerCase().includes(s) ||
        q.issue.toLowerCase().includes(s) ||
        q.machine.toLowerCase().includes(s)
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1C2B29] font-sans flex justify-center pb-20">
      <div className="w-full max-w-md bg-[#FAF8F5] min-h-screen flex flex-col relative shadow-sm border-x border-[#EAE5DC]">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-[#FAF8F5]/90 backdrop-blur-md px-4 pt-3 pb-2 border-b border-[#EAE5DC]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#D95A2B] text-white flex items-center justify-center font-bold text-sm shadow-sm">
                IM
              </div>
              <span className="font-bold text-lg tracking-tight text-[#1C2B29]">
                IndustryMind
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="relative p-2 text-[#5C6460] hover:text-[#1C2B29] rounded-full hover:bg-[#F0EDE6] transition"
                onClick={() => setActiveNav("queries")}
                aria-label="View queries"
              >
                <Bell className="w-5 h-5" />
                {queriesList.some((q) => q.priority === "high") && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#D95A2B] rounded-full" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (confirm("Log out of Reviewer portal?")) {
                    logout();
                    router.push("/login");
                  }
                }}
                title="Log out"
                className="w-8 h-8 rounded-full bg-[#1C2B29] text-white flex items-center justify-center text-xs font-semibold hover:bg-red-700 transition"
              >
                R
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-[#1C2B29] leading-tight">
                Good Morning,
                <br />
                {user?.full_name || "Reviewer"}
              </h1>
              <p className="text-xs text-[#5C6460] mt-0.5 font-medium">
                Reviewer · Surat Unit
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

        {/* ─── TAB 1: REVIEWER DASHBOARD (HOME) ─────────────────────── */}
        {activeNav === "home" && (() => {
          const unresolvedCount = queriesList.filter((q) => !isResolvedStatus(q.status)).length;
          const highRiskCount = queriesList.filter((q) => q.priority === "high" && !isResolvedStatus(q.status)).length;
          const inProgressCount = queriesList.filter((q) => q.status === "in_progress" && !isResolvedStatus(q.status)).length;
          const resolvedCount = queriesList.filter((q) => isResolvedStatus(q.status)).length;
          const topHigh = queriesList.find((q) => q.priority === "high" && !isResolvedStatus(q.status));

          return (
            <main className="flex-1 px-4 py-4 space-y-5">
              {/* 4 KPI Counters (2x2 Grid) */}
              <div className="grid grid-cols-2 gap-3">
                <div
                  onClick={() => {
                    setQueryFilter("all");
                    setActiveNav("queries");
                  }}
                  className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between cursor-pointer hover:border-[#D95A2B] transition"
                >
                  <div>
                    <div className="text-2xl font-bold text-[#D95A2B]">{unresolvedCount}</div>
                    <div className="text-xs text-[#5C6460] font-medium mt-0.5">
                      Unresolved
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-[#FAF8F5] text-[#D95A2B] flex items-center justify-center">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                </div>

                <div
                  onClick={() => {
                    setQueryFilter("high");
                    setActiveNav("queries");
                  }}
                  className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between cursor-pointer hover:border-[#D95A2B] transition"
                >
                  <div>
                    <div className="text-2xl font-bold text-[#D95A2B]">{highRiskCount}</div>
                    <div className="text-xs text-[#5C6460] font-medium mt-0.5">
                      High Risk
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-[#FAF8F5] text-[#D95A2B] flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                </div>

                <div
                  onClick={() => {
                    setQueryFilter("misanswered");
                    setActiveNav("queries");
                  }}
                  className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between cursor-pointer hover:border-[#D95A2B] transition"
                >
                  <div>
                    <div className="text-2xl font-bold text-[#1C2B29]">{inProgressCount}</div>
                    <div className="text-xs text-[#5C6460] font-medium mt-0.5">
                      In Progress
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-[#FAF8F5] text-[#5C6460] flex items-center justify-center">
                    <Clock className="w-5 h-5" />
                  </div>
                </div>

                <div
                  onClick={() => {
                    setQueryFilter("resolved");
                    setActiveNav("queries");
                  }}
                  className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between cursor-pointer hover:border-[#D95A2B] transition"
                >
                  <div>
                    <div className="text-2xl font-bold text-[#1C2B29]">{resolvedCount}</div>
                    <div className="text-xs text-[#5C6460] font-medium mt-0.5">
                      Resolved
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-[#EDE8E0] text-[#1C2B29] flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* High Risk Alert Banner */}
              {topHigh && (
                <div className="bg-[#FFF5F5] border border-[#FED7D7] rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-[#DC2626]" />
                    <span className="font-bold text-xs uppercase tracking-wider text-[#DC2626]">
                      Immediate Attention Required
                    </span>
                  </div>
                  <p className="text-xs text-[#1C2B29] font-medium">
                    {topHigh.num} {topHigh.machine}: {topHigh.issue}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      handleSelectTicket(topHigh);
                      setActiveNav("queries");
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#DC2626] hover:underline pt-1"
                  >
                    <span>Review Escalation Ticket</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Recent Queries */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-[#1C2B29]">
                    Recent Queries
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveNav("queries")}
                    className="text-xs font-semibold text-[#D95A2B] hover:underline"
                  >
                    View All
                  </button>
                </div>

                <div className="space-y-2.5">
                  {queriesList.length === 0 ? (
                    <div className="p-4 bg-white border border-[#EDE8E0] rounded-2xl text-xs text-[#5C6460] text-center">
                      No queries or escalations yet.
                    </div>
                  ) : (
                    queriesList.slice(0, 5).map((q) => (
                      <div
                        key={q.id}
                        onClick={() => {
                          handleSelectTicket(q);
                          setActiveNav("queries");
                        }}
                        className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between cursor-pointer hover:border-[#D95A2B] transition"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-[#1C2B29]">
                              {q.num}
                            </span>
                            <span className="text-xs text-[#5C6460]">
                              {q.machine}
                            </span>
                          </div>
                          <div className="text-xs font-medium text-[#1C2B29] mt-0.5 line-clamp-1">
                            {q.issue}
                          </div>
                          <div className="text-[11px] text-[#5C6460] mt-1">
                            {q.worker} · {q.reported}
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${q.priority === "high"
                                ? "bg-[#EDE8E0] text-[#D95A2B] border border-[#E5E0D8]"
                                : q.priority === "medium"
                                  ? "bg-[#FAF8F5] text-[#D95A2B] border border-[#E5E0D8]"
                                  : "bg-[#FAF8F5] text-[#5C6460] border border-[#E5E0D8]"
                              }`}
                          >
                            {q.priority === "high" ? "High" : q.priority === "medium" ? "Medium" : "Low"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </main>
          );
        })()}

        {/* ─── TAB 2: QUERY QUEUE & DETAIL ──────────────────────────── */}
        {activeNav === "queries" && (
          <main className="flex-1 px-4 py-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-base font-bold text-[#1C2B29]">
                Query Queue &amp; Escalations
              </h2>
              <button
                type="button"
                onClick={handleDownloadEscalations}
                disabled={downloadingEscalations}
                className="min-h-[48px] px-4 py-2 bg-[#EDE8E0] hover:bg-[#E5E0D8] text-[#1C2B29] border border-[#E5E0D8] rounded-xl text-xs font-semibold transition inline-flex items-center gap-2 self-start sm:self-auto disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>{downloadingEscalations ? "Preparing..." : "Download PDF"}</span>
              </button>
            </div>
            {escalationDownloadError && (
              <div className="p-3 rounded-xl text-xs font-medium bg-[#FAF8F5] border border-[#D95A2B] text-[#D95A2B]">
                {escalationDownloadError}
              </div>
            )}

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {[
                { id: "all", label: `All (${queriesList.filter((q) => !isResolvedStatus(q.status)).length})` },
                { id: "high", label: `High Risk (${queriesList.filter((q) => q.priority === "high" && !isResolvedStatus(q.status)).length})` },
                { id: "misanswered", label: `In Progress (${queriesList.filter((q) => q.status === "in_progress" && !isResolvedStatus(q.status)).length})` },
                { id: "resolved", label: `Resolved (${queriesList.filter((q) => isResolvedStatus(q.status)).length})` },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setQueryFilter(t.id as any)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition ${queryFilter === t.id
                      ? "bg-[#1C2B29] text-white"
                      : "bg-white border border-[#E5E0D8] text-[#5C6460] hover:text-[#1C2B29]"
                    }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#5C6460] absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search queries, machines..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-[#E5E0D8] rounded-2xl pl-10 pr-4 py-2.5 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B] transition shadow-xs"
              />
            </div>

            {/* Query Cards */}
            <div className="space-y-3">
              {filteredQueries.length === 0 ? (
                <div className="p-8 bg-white border border-[#EDE8E0] rounded-2xl text-xs text-[#5C6460] text-center">
                  {queryFilter === "resolved" ? "No resolved queries yet" : "No escalations found."}
                </div>
              ) : (
                filteredQueries.map((q) => (
                  <div
                    key={q.id}
                    onClick={() => handleSelectTicket(q)}
                    className={`bg-white border rounded-2xl p-4 shadow-xs cursor-pointer transition ${selectedTicket?.id === q.id
                        ? "border-[#D95A2B] ring-1 ring-[#D95A2B]"
                        : "border-[#EDE8E0] hover:border-[#D95A2B]"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[#D95A2B]">
                          {q.num}
                        </span>
                        <span className="font-semibold text-xs text-[#1C2B29]">
                          {q.machine}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${q.priority === "high"
                            ? "bg-[#EDE8E0] text-[#D95A2B] border border-[#E5E0D8]"
                            : q.priority === "medium"
                              ? "bg-[#FAF8F5] text-[#D95A2B] border border-[#E5E0D8]"
                              : "bg-[#FAF8F5] text-[#5C6460] border border-[#E5E0D8]"
                          }`}
                      >
                        {q.priority === "high" ? "High" : q.priority === "medium" ? "Medium" : "Low"}
                      </span>
                    </div>

                    <p className="text-xs text-[#1C2B29] font-medium mt-2">
                      {q.issue}
                    </p>

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#F0ECE4] text-[11px] text-[#5C6460]">
                      <span>Worker: {q.worker}</span>
                      <span>{q.reported}</span>
                    </div>

                    {isResolvedStatus(q.status) && (
                      <div className="mt-2 pt-2 border-t border-[#EDE8E0] flex items-center justify-between text-[11px] font-semibold text-[#1C2B29]">
                        <span>Resolved by {getExpertName(q.assigned_expert_id)}</span>
                        {q.resolved_at && (
                          <span className="text-[#5C6460]">
                            Resolved {new Date(q.resolved_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </main>
        )}

        {/* ─── TAB: TIPS REVIEW ─────────────────────────────────────── */}
        {activeNav === "tips" && (
          <main className="flex-1 px-4 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1C2B29]">
                Expert Tips Review
              </h2>
              <span className="text-xs font-semibold bg-[#FDF2ED] text-[#D95A2B] px-2.5 py-1 rounded-full">
                {pendingTips.length} Pending
              </span>
            </div>

            {tipsLoading && (
              <div className="bg-white border border-[#EDE8E0] rounded-2xl p-6 text-center shadow-xs">
                <div className="flex items-center justify-center gap-2 text-xs font-semibold text-[#5C6460]">
                  <Clock className="w-4 h-4 animate-spin text-[#D95A2B]" />
                  <span>Loading pending tips...</span>
                </div>
              </div>
            )}

            {tipsError && !tipsLoading && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs text-red-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{tipsError}</span>
                </div>
                <button
                  type="button"
                  onClick={fetchPendingTips}
                  className="text-xs font-bold text-red-700 underline hover:text-red-900"
                >
                  Retry
                </button>
              </div>
            )}

            {!tipsLoading && !tipsError && pendingTips.length === 0 && (
              <div className="bg-white border border-[#EDE8E0] rounded-2xl p-6 text-center shadow-xs">
                <p className="text-xs text-[#5C6460]">No tips pending review.</p>
              </div>
            )}

            {!tipsLoading && !tipsError && pendingTips.length > 0 && (
              <div className="space-y-3">
                {pendingTips.map((tip) => {
                  const formattedDate = tip.created_at
                    ? new Date(tip.created_at).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                    : "Recently";

                  return (
                    <div
                      key={tip.id}
                      onClick={() => {
                        setSelectedTip(tip);
                        setReviewNotes(tip.review_notes || "");
                        setReviewError(null);
                      }}
                      className="bg-white border border-[#EDE8E0] rounded-2xl p-4 shadow-xs space-y-2.5 cursor-pointer hover:border-[#D95A2B] transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[11px] font-bold text-[#D95A2B] bg-[#FDF2ED] px-2 py-0.5 rounded-full">
                          Pending Review
                        </span>
                        <span className="text-[11px] text-[#5C6460] flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formattedDate}
                        </span>
                      </div>

                      <p className="text-xs font-medium text-[#1C2B29] line-clamp-3">
                        &ldquo;{tip.tip_text}&rdquo;
                      </p>

                      <div className="pt-2 border-t border-[#EDE8E0] flex items-center justify-between text-[11px] text-[#5C6460]">
                        <span>
                          By: <strong className="text-[#1C2B29]">{tip.submitted_by}</strong>
                        </span>
                        <span>
                          Machine: <strong className="text-[#1C2B29]">{tip.machine_id}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        )}

        {/* ─── TAB: SOP PROPOSALS ────────────────────────────────────── */}
        {activeNav === "proposals" && (
          <main className="flex-1 px-4 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1C2B29]">
                SOP Proposals
              </h2>
              <span className="text-xs font-semibold bg-[#FDF2ED] text-[#D95A2B] px-2.5 py-1 rounded-full">
                {proposalsList.length} Total
              </span>
            </div>

            {proposalsLoading && (
              <div className="bg-white border border-[#EDE8E0] rounded-2xl p-6 text-center shadow-xs">
                <div className="flex items-center justify-center gap-2 text-xs font-semibold text-[#5C6460]">
                  <Clock className="w-4 h-4 animate-spin text-[#D95A2B]" />
                  <span>Loading proposals...</span>
                </div>
              </div>
            )}

            {!proposalsLoading && proposalsList.length === 0 && (
              <div className="bg-white border border-[#EDE8E0] rounded-2xl p-6 text-center shadow-xs">
                <p className="text-xs text-[#5C6460]">No SOP proposals yet.</p>
              </div>
            )}

            {!proposalsLoading && proposalsList.length > 0 && (
              <div className="space-y-3">
                {proposalsList.map((proposal) => (
                  <div
                    key={proposal.id}
                    onClick={() => {
                      setSelectedProposal(proposal);
                      setProposalReviewNotes("");
                      setProposalError(null);
                    }}
                    className={`bg-white border rounded-2xl p-4 shadow-xs cursor-pointer transition ${selectedProposal?.id === proposal.id
                        ? "border-[#D95A2B] ring-1 ring-[#D95A2B]"
                        : "border-[#EDE8E0] hover:border-[#D95A2B]"
                      }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs text-[#1C2B29]">
                        {proposal.title}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize shrink-0 ${proposal.status === "approved" || proposal.status === "merged"
                            ? "bg-[#EDE8E0] text-[#1C2B29]"
                            : proposal.status === "rejected"
                              ? "bg-[#FAF8F5] text-[#D95A2B] border border-[#D95A2B]"
                              : "bg-[#FAF8F5] text-[#5C6460] border border-[#E5E0D8]"
                          }`}
                      >
                        {proposal.status}
                      </span>
                    </div>

                    <p className="text-xs text-[#1C2B29] font-medium mt-2 line-clamp-2">
                      {proposal.proposed_addition}
                    </p>

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#F0ECE4] text-[11px] text-[#5C6460]">
                      <span>{proposal.proposed_by}</span>
                      <span>{new Date(proposal.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        )}

        {/* ─── TAB 3: EMPLOYEES ─────────────────────────────────────── */}
        {activeNav === "employees" && (
          <main className="flex-1 px-4 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1C2B29]">Employees</h2>
            </div>

            {roleError && (
              <div className="bg-[#FAF8F5] border border-[#D95A2B] text-[#D95A2B] text-xs p-3 rounded-2xl flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[#D95A2B]" />
                  <span>{roleError}</span>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss error"
                  onClick={() => setRoleError(null)}
                  className="p-1 rounded-full text-[#D95A2B] hover:bg-[#EDE8E0] transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="space-y-2.5">
              {employeesList.length === 0 ? (
                <div className="text-xs text-[#5C6460] py-6 text-center bg-white rounded-2xl border border-[#EDE8E0]">
                  No team members yet
                </div>
              ) : (
                employeesList.map((emp, i) => (
                  <div
                    key={emp.id || i}
                    className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#1C2B29] text-white flex items-center justify-center font-bold text-xs">
                        {emp.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#1C2B29]">
                          {emp.name}
                        </div>
                        <div className="text-[11px] text-[#5C6460]">
                          {roleLabel(emp.role)} · {emp.unit}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EDE8E0] text-[#1C2B29]">
                        {roleLabel(emp.role)}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${emp.status === "Active"
                            ? "bg-[#EDE8E0] text-[#1C2B29]"
                            : "bg-[#FAF8F5] text-[#5C6460]"
                          }`}
                      >
                        {emp.status}
                      </span>
                      {emp.role === "worker" && (
                        <button
                          type="button"
                          aria-label="Promote to Expert Engineer"
                          disabled={roleUpdatingId === emp.id}
                          onClick={() => handleRoleChange(emp.id, "expert")}
                          className="min-h-[48px] px-3 py-1.5 rounded-xl border border-[#EDE8E0] bg-[#1B4D44] text-white text-xs font-semibold hover:bg-[#133932] transition disabled:opacity-50"
                        >
                          {roleUpdatingId === emp.id ? "Updating..." : "Promote to Expert Engineer"}
                        </button>
                      )}
                      {emp.role === "expert" && (
                        <button
                          type="button"
                          aria-label="Return to Worker"
                          disabled={roleUpdatingId === emp.id}
                          onClick={() => handleRoleChange(emp.id, "worker")}
                          className="min-h-[48px] px-3 py-1.5 rounded-xl border border-[#EDE8E0] bg-[#FAF8F5] text-[#1C2B29] text-xs font-semibold hover:bg-[#E5E0D8] transition disabled:opacity-50"
                        >
                          {roleUpdatingId === emp.id ? "Updating..." : "Return to Worker"}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </main>
        )}

        {/* ─── TAB 4: DOCUMENTS LIBRARY ─────────────────────────────── */}
        {activeNav === "documents" && (
          <main className="flex-1 px-4 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1C2B29]">
                Documents Library
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

            {viewDocError && (
              <div className="p-3 bg-[#FAF8F5] border border-[#D95A2B] text-[#D95A2B] rounded-xl text-xs font-medium">
                {viewDocError}
              </div>
            )}

            <div className="space-y-2.5">
              {documents.length === 0 ? (
                <div className="text-xs text-[#5C6460] py-6 text-center bg-white rounded-2xl border border-[#EDE8E0]">
                  No documents yet
                </div>
              ) : (
                documents.map((doc, idx) => {
                  const badge = getDocStatusBadge(doc.status);
                  const isSelected =
                    selectedDocument &&
                    ((doc.id && selectedDocument.id === doc.id) ||
                      (!doc.id && selectedDocument === doc));
                  const isLoadingThisDoc = viewLoadingDocId === doc.id;
                  return (
                    <div
                      key={doc.id || idx}
                      onClick={() => {
                        setSelectedDocument(doc);
                        setDocActionError(null);
                      }}
                      className={`bg-white border rounded-2xl p-3.5 shadow-xs flex items-center justify-between cursor-pointer transition ${isSelected
                          ? "border-[#D95A2B] ring-1 ring-[#D95A2B]"
                          : "border-[#EDE8E0] hover:border-[#D95A2B]"
                        }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#FDF2ED] text-[#D95A2B] flex items-center justify-center font-bold mt-0.5">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-[#1C2B29]">
                            {doc.title}
                          </div>
                          <div className="text-[11px] text-[#5C6460]">
                            {doc.rev} · {doc.date}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {doc.id && (
                          <button
                            type="button"
                            disabled={isLoadingThisDoc}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewDoc(doc.id, doc.title);
                            }}
                            className="min-h-[48px] px-3 py-1.5 rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] hover:border-[#D95A2B] text-xs font-semibold text-[#1C2B29] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#D95A2B]" />
                            <span>{isLoadingThisDoc ? "Loading..." : "View PDF"}</span>
                          </button>
                        )}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </main>
        )}

        {/* ─── TAB 5: REPORTS & TRENDS ──────────────────────────────── */}
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
                <button
                  type="button"
                  onClick={handleDownloadAnalytics}
                  disabled={downloadingAnalytics}
                  className="min-h-[48px] px-4 py-2 bg-[#EDE8E0] hover:bg-[#E5E0D8] text-[#1C2B29] border border-[#E5E0D8] rounded-xl text-xs font-semibold transition inline-flex items-center gap-2 self-start sm:self-auto disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{downloadingAnalytics ? "Preparing..." : "Download PDF"}</span>
                </button>
              </div>
              {analyticsDownloadError && (
                <div className="p-3 rounded-xl text-xs font-medium bg-[#FAF8F5] border border-[#D95A2B] text-[#D95A2B]">
                  {analyticsDownloadError}
                </div>
              )}

              {/* ─── Breakdown Panel: Period Filter ─── */}
              <div className="bg-white border border-[#EDE8E0] rounded-2xl p-4 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs font-bold text-[#1C2B29]">Query Performance Breakdown</div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-[#5C6460] mr-1">Period:</span>
                    {([7, 30, 90] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setBreakdownDays(d)}
                        disabled={breakdownLoading}
                        aria-label={`View ${d} day breakdown`}
                        aria-pressed={breakdownDays === d}
                        className={`min-h-[48px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition disabled:opacity-50 ${
                          breakdownDays === d
                            ? "bg-[#1C2B29] text-white"
                            : "bg-[#FAF8F5] text-[#5C6460] border border-[#E5E0D8] hover:bg-[#EDE8E0] hover:text-[#1C2B29]"
                        }`}
                      >
                        {d} Days
                      </button>
                    ))}
                  </div>
                </div>

                {breakdownLoading && (
                  <div className="p-6 bg-[#FAF8F5] border border-[#EDE8E0] rounded-xl text-center text-xs text-[#5C6460] space-y-2">
                    <Clock className="w-5 h-5 mx-auto animate-spin text-[#D95A2B]" />
                    <div>Loading {breakdownDays}-day analytics breakdown...</div>
                  </div>
                )}

                {breakdownError && !breakdownLoading && (
                  <div className="p-4 bg-[#FAF8F5] border border-[#D95A2B] rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#D95A2B]">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-[#D95A2B]" />
                      <span>{breakdownError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => fetchBreakdown(breakdownDays)}
                      disabled={breakdownLoading}
                      className="min-h-[48px] px-4 py-2 bg-[#D95A2B] hover:bg-[#C84E18] text-white rounded-xl text-xs font-semibold transition"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {breakdownData && !breakdownLoading && !breakdownError && (
                  <div className="space-y-4">
                    {/* Total banner */}
                    <div className="bg-[#FAF8F5] border border-[#EDE8E0] rounded-xl p-3.5 flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-semibold text-[#5C6460] uppercase tracking-wider">
                          Total Queries ({breakdownDays} Days)
                        </div>
                        <div className="text-2xl font-bold text-[#1C2B29] mt-0.5">{breakdownData.total}</div>
                      </div>
                      <div className="text-xs text-[#5C6460] text-right font-medium">Database Verified</div>
                    </div>

                    {breakdownData.total === 0 ? (
                      <div className="p-6 text-center text-xs text-[#5C6460]">
                        No queries recorded in the past {breakdownDays} days.
                      </div>
                    ) : (
                      <>
                        {/* 4 Stat Cards */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-[#FAF8F5] border border-[#EDE8E0] rounded-xl p-3">
                            <div className="text-xs font-semibold text-[#5C6460]">Solved</div>
                            <div className="text-xl font-bold text-[#1C2B29] mt-1">{breakdownData.solved}</div>
                            <div className="text-[10px] text-[#5C6460] mt-0.5">
                              {Math.round((breakdownData.solved / breakdownData.total) * 100)}% of total
                            </div>
                          </div>

                          <div className="bg-[#FAF8F5] border border-[#EDE8E0] rounded-xl p-3">
                            <div className="text-xs font-semibold text-[#5C6460]">Unsolved</div>
                            <div className="text-xl font-bold text-[#D95A2B] mt-1">{breakdownData.unsolved}</div>
                            <div className="text-[10px] text-[#5C6460] mt-0.5">
                              {Math.round((breakdownData.unsolved / breakdownData.total) * 100)}% of total
                            </div>
                          </div>

                          <div className="bg-[#FAF8F5] border border-[#EDE8E0] rounded-xl p-3">
                            <div className="text-xs font-semibold text-[#5C6460]">Risky</div>
                            <div className="text-xl font-bold text-[#D95A2B] mt-1">{breakdownData.risky}</div>
                            <div className="text-[10px] text-[#5C6460] mt-0.5">
                              {Math.round((breakdownData.risky / breakdownData.total) * 100)}% of total
                            </div>
                          </div>

                          <div className="bg-[#FAF8F5] border border-[#EDE8E0] rounded-xl p-3">
                            <div className="text-xs font-semibold text-[#5C6460]">Normal</div>
                            <div className="text-xl font-bold text-[#1C2B29] mt-1">{breakdownData.normal}</div>
                            <div className="text-[10px] text-[#5C6460] mt-0.5">
                              {Math.round((breakdownData.normal / breakdownData.total) * 100)}% of total
                            </div>
                          </div>
                        </div>

                        {/* 2x2 Matrix */}
                        <div className="space-y-2">
                          <div className="text-xs font-bold text-[#1C2B29]">Resolution × Risk Matrix</div>
                          <div className="border border-[#EDE8E0] rounded-xl overflow-hidden text-xs">
                            <div className="grid grid-cols-3 bg-[#FAF8F5] border-b border-[#EDE8E0] font-semibold text-[#5C6460] text-center p-2">
                              <div>Outcome</div>
                              <div>Risky</div>
                              <div>Normal</div>
                            </div>
                            <div className="grid grid-cols-3 border-b border-[#EDE8E0] p-2 text-center items-center">
                              <div className="font-semibold text-[#1C2B29] text-left pl-2">Solved</div>
                              <div className="font-bold text-[#1C2B29]">{breakdownData.matrix.solved_risky}</div>
                              <div className="font-bold text-[#1C2B29]">{breakdownData.matrix.solved_normal}</div>
                            </div>
                            <div className="grid grid-cols-3 p-2 text-center items-center">
                              <div className="font-semibold text-[#D95A2B] text-left pl-2">Unsolved</div>
                              <div className="font-bold text-[#D95A2B]">{breakdownData.matrix.unsolved_risky}</div>
                              <div className="font-bold text-[#1C2B29]">{breakdownData.matrix.unsolved_normal}</div>
                            </div>
                          </div>
                        </div>

                        {/* By Machine Table */}
                        <div className="space-y-2">
                          <div className="text-xs font-bold text-[#1C2B29]">Per-Machine Breakdown</div>
                          {breakdownData.by_machine.length === 0 ? (
                            <div className="p-3 text-center text-xs text-[#5C6460]">No machine records found.</div>
                          ) : (
                            <div className="border border-[#EDE8E0] rounded-xl overflow-x-auto text-xs">
                              <table className="w-full text-left">
                                <thead className="bg-[#FAF8F5] border-b border-[#EDE8E0] text-[11px] font-semibold text-[#5C6460]">
                                  <tr>
                                    <th className="p-2.5">Machine</th>
                                    <th className="p-2.5 text-center">Total</th>
                                    <th className="p-2.5 text-center">Solved</th>
                                    <th className="p-2.5 text-center">Unsolved</th>
                                    <th className="p-2.5 text-center">Risky</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#EDE8E0]">
                                  {breakdownData.by_machine.map((m) => (
                                    <tr key={m.machine_id} className="hover:bg-[#FAF8F5]">
                                      <td className="p-2.5 font-medium text-[#1C2B29]">{m.machine_name}</td>
                                      <td className="p-2.5 text-center font-bold text-[#1C2B29]">{m.total}</td>
                                      <td className="p-2.5 text-center text-[#1C2B29]">{m.solved}</td>
                                      <td className="p-2.5 text-center text-[#D95A2B]">{m.unsolved}</td>
                                      <td className="p-2.5 text-center text-[#D95A2B]">{m.risky}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Definitions Footnote */}
                        <div className="p-3.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl text-[11px] text-[#5C6460] space-y-1">
                          <div className="font-bold text-[#1C2B29]">Definitions:</div>
                          <div>
                            <strong className="text-[#1C2B29]">Solved: </strong>
                            {breakdownData.definitions.solved}
                          </div>
                          <div>
                            <strong className="text-[#1C2B29]">Unsolved: </strong>
                            {breakdownData.definitions.unsolved}
                          </div>
                          <div>
                            <strong className="text-[#1C2B29]">Risky: </strong>
                            {breakdownData.definitions.risky}
                          </div>
                          <div>
                            <strong className="text-[#1C2B29]">Normal: </strong>
                            {breakdownData.definitions.normal}
                          </div>
                        </div>
                      </>
                    )}
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

              {/* Top Error Codes */}
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

        {/* ─── QUERY DETAIL DRAWER / MODAL ──────────────────────────── */}
        {selectedTicket && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3" onClick={(e) => { if (e.target === e.currentTarget) { setSelectedTicket(null); setShowThreadView(false); setShowAssignSuccess(false); setAssignError(null); setEnlargedImageUrl(null); fetchEscalations(); } }}>
            <div className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl border border-[#EDE8E0] space-y-4 max-h-[92vh] flex flex-col">
                <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#D95A2B]">
                      {selectedTicket.num}
                    </span>
                    <span className="bg-[#FAF8F5] border border-[#D95A2B] text-[#D95A2B] text-[10px] font-bold px-2 py-0.5 rounded-full">
                      High Priority
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTicket(null);
                      setShowThreadView(false);
                      setShowAssignSuccess(false);
                      setAssignError(null);
                      setEnlargedImageUrl(null);
                      fetchEscalations();
                    }}
                    className="p-1 rounded-full text-[#5C6460] hover:bg-[#FAF8F5]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {showThreadView ? (
                  <div className="flex-1 overflow-y-auto">
                    <TicketThread
                      ticketId={selectedTicket.id}
                      canReply={true}
                      onBack={() => {
                        setShowThreadView(false);
                        fetchEscalations();
                      }}
                      onChanged={() => {
                        fetchEscalations();
                        api.getTicketThread(selectedTicket.id).then((res) => {
                          if (res && res.ticket) {
                            setSelectedTicket((prev) =>
                              prev
                                ? {
                                  ...prev,
                                  status: res.ticket.status,
                                  assigned_expert_id: res.ticket.assigned_expert_id ?? prev.assigned_expert_id,
                                  resolved_at: res.ticket.resolved_at ?? prev.resolved_at,
                                }
                                : null
                            );
                          }
                        }).catch(() => { });
                      }}
                    />
                  </div>
                ) : (
                  <>
                    {/* Sub-tabs: Details | Conversation | Sources */}
                    <div className="flex border-b border-[#EDE8E0]">
                      <button
                        type="button"
                        onClick={() => setDetailTab("details")}
                        className={`flex-1 pb-2 text-xs font-semibold text-center transition ${detailTab === "details"
                            ? "text-[#D95A2B] border-b-2 border-[#D95A2B]"
                            : "text-[#5C6460]"
                          }`}
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailTab("conversation")}
                        className={`flex-1 pb-2 text-xs font-semibold text-center transition ${detailTab === "conversation"
                            ? "text-[#D95A2B] border-b-2 border-[#D95A2B]"
                            : "text-[#5C6460]"
                          }`}
                      >
                        Conversation
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailTab("sources")}
                        className={`flex-1 pb-2 text-xs font-semibold text-center transition ${detailTab === "sources"
                            ? "text-[#D95A2B] border-b-2 border-[#D95A2B]"
                            : "text-[#5C6460]"
                          }`}
                      >
                        Sources
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 text-xs">
                      {detailTab === "details" && (
                        <div className="space-y-3">
                          <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-3 space-y-1.5">
                            <div className="flex justify-between">
                              <span className="text-[#5C6460]">Machine:</span>
                              <span className="font-semibold text-[#1C2B29]">{selectedTicket.machine}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[#5C6460]">Worker:</span>
                              <span className="font-semibold text-[#1C2B29]">
                                {selectedTicket.workerId ? `${selectedTicket.worker} (${selectedTicket.workerId})` : selectedTicket.worker}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[#5C6460]">Reported:</span>
                              <span className="font-semibold text-[#1C2B29]">{selectedTicket.reported}</span>
                            </div>
                            {isResolvedStatus(selectedTicket.status) && (
                              <>
                                <div className="flex justify-between border-t border-[#E5E0D8] pt-1.5">
                                  <span className="text-[#5C6460]">Status:</span>
                                  <span className="font-semibold text-[#1C2B29]">Resolved</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[#5C6460]">Resolved by:</span>
                                  <span className="font-semibold text-[#1C2B29]">{getExpertName(selectedTicket.assigned_expert_id)}</span>
                                </div>
                                {selectedTicket.resolved_at && (
                                  <div className="flex justify-between">
                                    <span className="text-[#5C6460]">Resolved:</span>
                                    <span className="font-semibold text-[#1C2B29]">
                                      {new Date(selectedTicket.resolved_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                                    </span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          <div>
                            <span className="font-bold text-[#5C6460] uppercase tracking-wider text-[10px] block mb-1">
                              Worker&apos;s Question:
                            </span>
                            <p className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E5E0D8] text-[#1C2B29]">
                              {selectedTicket.question}
                            </p>
                          </div>

                          <div>
                            <span className="font-bold text-[#5C6460] uppercase tracking-wider text-[10px] block mb-1">
                              AI Initial Response:
                            </span>
                            <p className="bg-white p-3 rounded-xl border border-[#E5E0D8] text-[#1C2B29]">
                              {selectedTicket.aiResponse}
                            </p>
                          </div>

                          {selectedTicket.workerFeedback ? (
                            <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-3 text-[#1C2B29]">
                              <span className="font-bold block mb-0.5 text-[10px] text-[#5C6460] uppercase tracking-wider">Worker Feedback:</span>
                              {selectedTicket.workerFeedback}
                            </div>
                          ) : null}

                          {/* Forward to Expert Section */}
                          <div className="pt-3 border-t border-[#E5E0D8] space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[11px] text-[#5C6460] uppercase tracking-wider block">
                                Forward to Expert
                              </span>
                              {selectedTicket.assigned_expert_id && (
                                <span className="text-[11px] font-semibold text-[#1C2B29] bg-[#EDE8E0] px-2 py-0.5 rounded-lg border border-[#E5E0D8]">
                                  {(() => {
                                    const matched = expertUsers.find((e) => e.id === selectedTicket.assigned_expert_id);
                                    return matched ? `Assigned: ${matched.name}` : "Assigned";
                                  })()}
                                </span>
                              )}
                            </div>

                            {expertUsers.length === 0 ? (
                              <div className="p-3 bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl text-xs text-[#5C6460]">
                                No expert engineers yet. Promote a worker from the Team Members list.
                              </div>
                            ) : (
                              <div className="space-y-2.5">
                                <div className="space-y-1">
                                  <label className="text-[11px] font-semibold text-[#5C6460] block">
                                    Select Expert Engineer:
                                  </label>
                                  <select
                                    value={forwardExpertId}
                                    onChange={(e) => setForwardExpertId(e.target.value)}
                                    className="w-full min-h-[48px] bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl px-3 py-2 text-xs text-[#1C2B29] focus:outline-hidden focus:border-[#D95A2B]"
                                  >
                                    <option value="">-- Choose an expert engineer --</option>
                                    {expertUsers.map((exp) => (
                                      <option key={exp.id} value={exp.id}>
                                        {exp.name} (Expert)
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {assignError && (
                                  <div className="p-3 bg-white border border-[#D95A2B] text-[#D95A2B] rounded-xl text-xs font-semibold flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0 text-[#D95A2B]" />
                                    <span>{assignError}</span>
                                  </div>
                                )}

                                {showAssignSuccess && (
                                  <div className="p-3 bg-[#EDE8E0] border border-[#E5E0D8] text-[#1C2B29] rounded-xl text-xs font-semibold flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-[#D95A2B] shrink-0" />
                                    <span>Assignment updated successfully.</span>
                                  </div>
                                )}

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={assignSubmitting || !forwardExpertId}
                                    onClick={handleForwardTicket}
                                    className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-[#D95A2B] text-white text-xs font-bold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                                  >
                                    {assignSubmitting ? (
                                      <>
                                        <RotateCw className="w-4 h-4 animate-spin" />
                                        <span>Forwarding...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Send className="w-4 h-4" />
                                        <span>Forward</span>
                                      </>
                                    )}
                                  </button>

                                  {selectedTicket.assigned_expert_id && (
                                    <button
                                      type="button"
                                      disabled={assignSubmitting}
                                      onClick={handleUnassignTicket}
                                      className="min-h-[48px] px-4 py-2.5 rounded-xl bg-white border border-[#E5E0D8] text-[#1C2B29] text-xs font-bold hover:border-[#D95A2B] transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                                    >
                                      <X className="w-4 h-4 text-[#D95A2B]" />
                                      <span>Unassign</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Open Thread Button */}
                            <div className="pt-2 border-t border-[#E5E0D8]">
                              <button
                                type="button"
                                onClick={() => setShowThreadView(true)}
                                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-white border border-[#E5E0D8] text-[#1C2B29] text-xs font-bold hover:border-[#D95A2B] transition flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <MessageSquare className="w-4 h-4 text-[#D95A2B]" />
                                <span>Open Thread</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {detailTab === "conversation" && (
                        <div className="space-y-3">
                          <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E5E0D8]">
                            <span className="font-bold text-[10px] text-[#5C6460] block">
                              {(selectedTicket.worker && selectedTicket.worker !== "Unknown Worker" ? selectedTicket.worker : "Worker")}
                              {selectedTicket.created_at ? ` · ${new Date(selectedTicket.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}` : ""}
                            </span>
                            <p className="mt-1">{selectedTicket.question}</p>
                          </div>

                          {selectedTicket.aiResponse && (
                            <div className="bg-[#FFF6F2] p-3 rounded-xl border border-[#FAD8CD]">
                              <span className="font-bold text-[10px] text-[#D95A2B] block">
                                IndustryMind AI
                              </span>
                              <p className="mt-1">{selectedTicket.aiResponse}</p>
                            </div>
                          )}

                          {selectedTicket.workerFeedback && (
                            <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E5E0D8] text-[#1C2B29]">
                              <span className="font-bold text-[10px] text-[#5C6460] block">
                                Worker Feedback
                              </span>
                              <p className="mt-1">{selectedTicket.workerFeedback}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {detailTab === "sources" && (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <span className="font-bold text-[11px] text-[#5C6460] uppercase tracking-wider block">
                              Documents Cited by AI
                            </span>
                            {selectedTicket.sources && selectedTicket.sources.length > 0 ? (
                              selectedTicket.sources.map((s, idx) => (
                                <div
                                  key={idx}
                                  className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-3 flex items-center justify-between"
                                >
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-[#D95A2B]" />
                                    <span className="font-medium text-xs text-[#1C2B29]">{s}</span>
                                  </div>
                                  <ChevronRight className="w-4 h-4 text-[#5C6460]" />
                                </div>
                              ))
                            ) : (
                              <div className="text-xs text-[#5C6460] py-4 text-center bg-[#FAF8F5] rounded-xl border border-[#E5E0D8]">
                                No cited documents yet
                              </div>
                            )}
                          </div>

                          {selectedTicket.image_url && (
                            <div className="space-y-2">
                              <span className="font-bold text-[11px] text-[#5C6460] uppercase tracking-wider block">
                                Attached Photo
                              </span>
                              <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-3">
                                <img
                                  src={selectedTicket.image_url}
                                  alt="Attached Photo"
                                  onClick={() => setEnlargedImageUrl(selectedTicket.image_url)}
                                  className="w-32 h-32 rounded-xl object-cover border border-[#E5E0D8] cursor-pointer hover:opacity-90 transition"
                                />
                              </div>
                            </div>
                          )}

                          {enlargedImageUrl && (
                            <div
                              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
                              onClick={() => setEnlargedImageUrl(null)}
                            >
                              <div
                                className="w-full max-w-lg bg-white rounded-3xl p-5 shadow-2xl border border-[#EDE8E0] space-y-4 flex flex-col"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-2">
                                  <span className="font-bold text-sm text-[#1C2B29]">Attached Photo</span>
                                  <button
                                    type="button"
                                    onClick={() => setEnlargedImageUrl(null)}
                                    className="p-1 rounded-full text-[#5C6460] hover:bg-[#FAF8F5]"
                                  >
                                    <X className="w-5 h-5" />
                                  </button>
                                </div>
                                <div className="flex items-center justify-center p-2">
                                  <img
                                    src={enlargedImageUrl}
                                    alt="Enlarged escalation photo"
                                    className="max-w-full max-h-[70vh] rounded-2xl object-contain"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
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
                        onClick={() => setShowUploadModal(false)}
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
                          {newDocFile ? newDocFile.name : "Tap to select PDF or DOCX"}
                        </span>
                        <span className="text-[10px] text-[#5C6460]">Max file size 50 MB</span>
                      </label>

                      <div>
                        <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                          Machine
                        </label>
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
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                          Category
                        </label>
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
                        <div className="bg-[#FAF8F5] border border-[#D95A2B] rounded-xl p-3 text-[#D95A2B] flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-[#D95A2B] shrink-0 mt-0.5" />
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
                                filename: newDocFile.name,
                                doc_type: newDocCategory.toLowerCase(),
                                rev: "v1.0",
                                revision: "1.0",
                                date: "Just now",
                                status: "processing",
                                category: newDocCategory,
                                page_count: undefined,
                                owner: "",
                                machine_name:
                                  machinesList.find(
                                    (m) => m.id === selectedUploadMachineId
                                  )?.name || null,
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

                {/* ─── MODAL: TIP REVIEW DETAIL ─────────────────────────────── */}
                {selectedTip && (
                  <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) { setSelectedTip(null); setReviewNotes(""); setReviewError(null); } }}>
                    <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-[#EDE8E0] space-y-4 max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-2">
                          <span className="font-bold text-sm text-[#1C2B29]">Review Expert Tip</span>
                          <button
                            type="button"
                            disabled={reviewSubmitting}
                            onClick={() => {
                              if (!reviewSubmitting) {
                                setSelectedTip(null);
                                setReviewNotes("");
                                setReviewError(null);
                              }
                            }}
                            className="p-1 rounded-full text-[#5C6460] hover:bg-[#FAF8F5] disabled:opacity-50"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-3 text-xs">
                          {reviewError && (
                            <div className="bg-[#FAF8F5] border border-[#D95A2B] rounded-xl p-3 text-[#D95A2B] flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-[#D95A2B] shrink-0 mt-0.5" />
                              <span className="text-[11px] leading-tight">{reviewError}</span>
                            </div>
                          )}

                          <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-3 space-y-1.5">
                            <div className="flex justify-between">
                              <span className="text-[#5C6460]">Machine:</span>
                              <span className="font-semibold text-[#1C2B29]">{selectedTip.machine_id}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[#5C6460]">Submitted by:</span>
                              <span className="font-semibold text-[#1C2B29]">{selectedTip.submitted_by}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[#5C6460]">Submitted:</span>
                              <span className="font-semibold text-[#1C2B29]">
                                {selectedTip.created_at
                                  ? new Date(selectedTip.created_at).toLocaleString([], {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                  : "Recently"}
                              </span>
                            </div>
                          </div>

                          <div>
                            <span className="font-bold text-[#5C6460] uppercase tracking-wider text-[10px] block mb-1">
                              Tip Content
                            </span>
                            <p className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E5E0D8] text-[#1C2B29] whitespace-pre-wrap leading-relaxed">
                              {selectedTip.tip_text}
                            </p>
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                              Review Notes (Optional)
                            </label>
                            <textarea
                              value={reviewNotes}
                              onChange={(e) => setReviewNotes(e.target.value)}
                              disabled={reviewSubmitting}
                              placeholder="Add context, corrections, or reason for decision..."
                              rows={3}
                              className="w-full bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-2.5 text-xs text-[#1C2B29] disabled:opacity-50 resize-none"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-[#EDE8E0]">
                          <button
                            type="button"
                            disabled={reviewSubmitting}
                            onClick={() => handleReview("rejected")}
                            className="flex-1 py-2.5 rounded-xl bg-[#FAF8F5] text-[#D95A2B] border border-[#D95A2B] hover:bg-[#EDE8E0] font-bold text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            {reviewSubmitting ? (
                              <Clock className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <X className="w-3.5 h-3.5" />
                            )}
                            <span>Reject</span>
                          </button>

                          <button
                            type="button"
                            disabled={reviewSubmitting}
                            onClick={() => handleReview("approved")}
                            className="flex-1 py-2.5 rounded-xl bg-[#1C2B29] text-white hover:bg-[#1C2B29]/90 font-bold text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            {reviewSubmitting ? (
                              <Clock className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>Approve</span>
                          </button>
                        </div>
                      </div>
                    </div>
        )}

                    {/* ─── MODAL: SOP PROPOSAL DETAIL & REVIEW ──────────────────── */}
                    {selectedProposal && (
                      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3" onClick={(e) => { if (e.target === e.currentTarget) { setSelectedProposal(null); setProposalReviewNotes(""); setProposalError(null); } }}>
                        <div className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl border border-[#EDE8E0] space-y-4 max-h-[92vh] flex flex-col">
                            <div className="flex items-start justify-between border-b border-[#EDE8E0] pb-2 gap-2">
                              <div>
                                <h3 className="font-bold text-sm text-[#1C2B29] leading-snug">
                                  {selectedProposal.title}
                                </h3>
                                <div className="mt-1">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${selectedProposal.status === "approved" || selectedProposal.status === "merged"
                                        ? "bg-[#EDE8E0] text-[#1C2B29]"
                                        : selectedProposal.status === "rejected"
                                          ? "bg-[#FAF8F5] text-[#D95A2B] border border-[#D95A2B]"
                                          : "bg-[#FAF8F5] text-[#5C6460] border border-[#E5E0D8]"
                                      }`}
                                  >
                                    {selectedProposal.status}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={proposalSubmitting}
                                onClick={() => {
                                  setSelectedProposal(null);
                                  setProposalReviewNotes("");
                                  setProposalError(null);
                                }}
                                className="p-1 rounded-full text-[#5C6460] hover:bg-[#FAF8F5] disabled:opacity-50 shrink-0"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-3 text-xs">
                              {proposalError && (
                                <div className="bg-[#FAF8F5] border border-[#D95A2B] rounded-xl p-3 text-[#D95A2B] flex items-start gap-2">
                                  <AlertTriangle className="w-4 h-4 text-[#D95A2B] shrink-0 mt-0.5" />
                                  <span className="text-[11px] leading-tight">{proposalError}</span>
                                </div>
                              )}

                              <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-3 space-y-1.5">
                                <div className="flex justify-between">
                                  <span className="text-[#5C6460]">Proposed by:</span>
                                  <span className="font-semibold text-[#1C2B29]">
                                    {selectedProposal.proposed_by}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[#5C6460]">Submitted:</span>
                                  <span className="font-semibold text-[#1C2B29]">
                                    {selectedProposal.created_at
                                      ? new Date(selectedProposal.created_at).toLocaleString([], {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })
                                      : "Recently"}
                                  </span>
                                </div>
                                {selectedProposal.current_sop_step && (
                                  <div className="flex justify-between">
                                    <span className="text-[#5C6460]">Current SOP Step:</span>
                                    <span className="font-semibold text-[#1C2B29]">
                                      {selectedProposal.current_sop_step}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div>
                                <span className="font-bold text-[#5C6460] uppercase tracking-wider text-[10px] block mb-1">
                                  Proposed Addition
                                </span>
                                <p className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E5E0D8] text-[#1C2B29] whitespace-pre-wrap leading-relaxed">
                                  {selectedProposal.proposed_addition}
                                </p>
                              </div>

                              {selectedProposal.safety_impact && (
                                <div>
                                  <span className="font-bold text-[#5C6460] uppercase tracking-wider text-[10px] block mb-1">
                                    Safety Impact
                                  </span>
                                  <p className="bg-[#FFF5F5] p-3 rounded-xl border border-[#FED7D7] text-[#DC2626] leading-relaxed">
                                    {selectedProposal.safety_impact}
                                  </p>
                                </div>
                              )}

                              {selectedProposal.status !== "pending" && (
                                <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-3 space-y-1.5">
                                  <div className="flex justify-between">
                                    <span className="text-[#5C6460]">Reviewed by:</span>
                                    <span className="font-semibold text-[#1C2B29]">
                                      {selectedProposal.reviewed_by || "Reviewer"}
                                    </span>
                                  </div>
                                  {selectedProposal.review_notes && (
                                    <div>
                                      <span className="text-[#5C6460] block text-[11px] mb-0.5">Review Notes:</span>
                                      <p className="font-semibold text-[#1C2B29] text-xs">
                                        {selectedProposal.review_notes}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {selectedProposal.status === "pending" && (
                                <div>
                                  <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                                    Review Notes (Optional)
                                  </label>
                                  <textarea
                                    value={proposalReviewNotes}
                                    onChange={(e) => setProposalReviewNotes(e.target.value)}
                                    disabled={proposalSubmitting}
                                    placeholder="Add review notes (optional)"
                                    rows={3}
                                    className="w-full bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-2.5 text-xs text-[#1C2B29] disabled:opacity-50 resize-none"
                                  />
                                </div>
                              )}
                            </div>

                            {selectedProposal.status === "pending" && (
                              <div className="flex items-center gap-2 pt-2 border-t border-[#EDE8E0]">
                                <button
                                  type="button"
                                  disabled={proposalSubmitting}
                                  onClick={() => handleReviewProposal("rejected")}
                                  className="flex-1 py-2.5 rounded-xl bg-[#FAF8F5] text-[#D95A2B] border border-[#D95A2B] hover:bg-[#EDE8E0] font-bold text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                  <span>Reject</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={proposalSubmitting}
                                  onClick={() => handleReviewProposal("approved")}
                                  className="flex-1 py-2.5 rounded-xl bg-[#1C2B29] text-white hover:bg-[#1C2B29]/90 font-bold text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                  <span>Approve</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={proposalSubmitting}
                                  onClick={() => handleReviewProposal("merged")}
                                  className="flex-1 py-2.5 rounded-xl bg-[#D95A2B] hover:bg-[#C84E18] text-white font-bold text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                  <span>Merge</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
        )}

                        {/* ─── MODAL: DOCUMENT DETAIL & REVIEW ───────────────────────── */}
                        {selectedDocument && (() => {
                          const badge = getDocStatusBadge(selectedDocument.status);
                          const rawStatus = (selectedDocument.status || "").toLowerCase();
                          const isPending = rawStatus === "queued" || rawStatus === "processing" || rawStatus === "pending";
                          const isTerminal = ["approved", "rejected", "failed", "superseded"].includes(rawStatus);

                          return (
                            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3" onClick={(e) => { if (e.target === e.currentTarget) { setSelectedDocument(null); setDocActionError(null); } }}>
                              <div className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl border border-[#EDE8E0] space-y-4 max-h-[92vh] flex flex-col">
                                  <div className="flex items-start justify-between border-b border-[#EDE8E0] pb-2 gap-2">
                                    <div>
                                      <h3 className="font-bold text-sm text-[#1C2B29] leading-snug">
                                        {selectedDocument.filename || selectedDocument.title}
                                      </h3>
                                      <div className="mt-1">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.className}`}>
                                          {badge.label}
                                        </span>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      disabled={docActionSubmitting}
                                      onClick={() => {
                                        setSelectedDocument(null);
                                        setDocActionError(null);
                                      }}
                                      className="p-1 rounded-full text-[#5C6460] hover:bg-[#FAF8F5] disabled:opacity-50 shrink-0"
                                    >
                                      <X className="w-5 h-5" />
                                    </button>
                                  </div>

                                  <div className="flex-1 overflow-y-auto space-y-3 text-xs">
                                    {docActionError && (
                                      <div className="bg-[#FAF8F5] border border-[#D95A2B] rounded-xl p-3 text-[#D95A2B] flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 text-[#D95A2B] shrink-0 mt-0.5" />
                                        <span className="text-[11px] leading-tight">{docActionError}</span>
                                      </div>
                                    )}

                                    <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-3 space-y-1.5">
                                      <div className="flex justify-between">
                                        <span className="text-[#5C6460]">File Name:</span>
                                        <span className="font-semibold text-[#1C2B29] truncate max-w-[200px]">
                                          {selectedDocument.filename || selectedDocument.title}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-[#5C6460]">Document Type:</span>
                                        <span className="font-semibold text-[#1C2B29] uppercase">
                                          {selectedDocument.doc_type || selectedDocument.category}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-[#5C6460]">Revision:</span>
                                        <span className="font-semibold text-[#1C2B29]">
                                          {selectedDocument.revision || selectedDocument.rev}
                                        </span>
                                      </div>
                                      {selectedDocument.machine_name && (
                                        <div className="flex justify-between">
                                          <span className="text-[#5C6460]">Machine:</span>
                                          <span className="font-semibold text-[#1C2B29]">
                                            {selectedDocument.machine_name}
                                          </span>
                                        </div>
                                      )}
                                      {typeof selectedDocument.page_count === "number" && (
                                        <div className="flex justify-between">
                                          <span className="text-[#5C6460]">Pages:</span>
                                          <span className="font-semibold text-[#1C2B29]">
                                            {selectedDocument.page_count}
                                          </span>
                                        </div>
                                      )}
                                      {selectedDocument.owner && (
                                        <div className="flex justify-between">
                                          <span className="text-[#5C6460]">Owner:</span>
                                          <span className="font-semibold text-[#1C2B29]">
                                            {selectedDocument.owner}
                                          </span>
                                        </div>
                                      )}
                                    </div>

                                    {isTerminal && (selectedDocument.approved_by || selectedDocument.approved_at) && (
                                      <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-3 space-y-1.5">
                                        {selectedDocument.approved_by && (
                                          <div className="flex justify-between">
                                            <span className="text-[#5C6460]">Approved/Reviewed by:</span>
                                            <span className="font-semibold text-[#1C2B29]">
                                              {selectedDocument.approved_by}
                                            </span>
                                          </div>
                                        )}
                                        {selectedDocument.approved_at && (
                                          <div className="flex justify-between">
                                            <span className="text-[#5C6460]">Reviewed At:</span>
                                            <span className="font-semibold text-[#1C2B29]">
                                              {new Date(selectedDocument.approved_at).toLocaleString([], {
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
                                    )}

                                    {selectedDocument.id && (
                                      <div className="pt-2 border-t border-[#EDE8E0]">
                                        <button
                                          type="button"
                                          disabled={viewLoadingDocId === selectedDocument.id}
                                          onClick={() =>
                                            handleViewDoc(
                                              selectedDocument.id,
                                              selectedDocument.filename || selectedDocument.title
                                            )
                                          }
                                          className="w-full min-h-[48px] px-4 py-2.5 rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] hover:border-[#D95A2B] text-xs font-semibold text-[#1C2B29] transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                                        >
                                          <FileText className="w-4 h-4 text-[#D95A2B]" />
                                          <span>
                                            {viewLoadingDocId === selectedDocument.id
                                              ? "Loading..."
                                              : "View Original PDF"}
                                          </span>
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {isPending && (
                                    <div className="flex items-center gap-2 pt-2 border-t border-[#EDE8E0]">
                                      <button
                                        type="button"
                                        disabled={docActionSubmitting}
                                        onClick={handleApproveDocument}
                                        className="flex-1 py-2.5 rounded-xl bg-[#1C2B29] text-white hover:bg-[#1C2B29]/90 font-bold text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                                      >
                                        <span>Approve</span>
                                      </button>
                                      <button
                                        type="button"
                                        disabled={docActionSubmitting}
                                        onClick={handleRejectDocument}
                                        className="flex-1 py-2.5 rounded-xl bg-[#FAF8F5] text-[#D95A2B] border border-[#D95A2B] hover:bg-[#EDE8E0] font-bold text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                                      >
                                        <span>Reject</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                              );
        })()}

                              {/* ─── BOTTOM DOCK NAVIGATION ───────────────────────────────── */}
                              <nav className="fixed bottom-0 left-0 right-0 z-30 max-w-md mx-auto bg-white/95 backdrop-blur-md border-t border-[#EDE8E0] px-1 sm:px-3 py-2 flex items-center justify-around">
                                <button
                                  type="button"
                                  onClick={() => setActiveNav("home")}
                                  className={`flex-1 min-w-0 flex flex-col items-center gap-1 text-[10px] sm:text-[11px] font-semibold transition ${activeNav === "home" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
                                    }`}
                                >
                                  <Home className="w-5 h-5 shrink-0" />
                                  <span className="truncate max-w-full">Home</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setActiveNav("queries")}
                                  className={`flex-1 min-w-0 flex flex-col items-center gap-1 text-[10px] sm:text-[11px] font-semibold transition ${activeNav === "queries" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
                                    }`}
                                >
                                  <Layers className="w-5 h-5 shrink-0" />
                                  <span className="truncate max-w-full">Queries</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setActiveNav("tips")}
                                  className={`flex-1 min-w-0 flex flex-col items-center gap-1 text-[10px] sm:text-[11px] font-semibold transition ${activeNav === "tips" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
                                    }`}
                                >
                                  <Lightbulb className="w-5 h-5 shrink-0" />
                                  <span className="truncate max-w-full">Tips</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setActiveNav("proposals")}
                                  className={`flex-1 min-w-0 flex flex-col items-center gap-1 text-[10px] sm:text-[11px] font-semibold transition ${activeNav === "proposals" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
                                    }`}
                                >
                                  <ClipboardList className="w-5 h-5 shrink-0" />
                                  <span className="truncate max-w-full">Proposals</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setActiveNav("employees")}
                                  className={`flex-1 min-w-0 flex flex-col items-center gap-1 text-[10px] sm:text-[11px] font-semibold transition ${activeNav === "employees" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
                                    }`}
                                >
                                  <Users className="w-5 h-5 shrink-0" />
                                  <span className="truncate max-w-full">Employees</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setActiveNav("documents")}
                                  className={`flex-1 min-w-0 flex flex-col items-center gap-1 text-[10px] sm:text-[11px] font-semibold transition ${activeNav === "documents" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
                                    }`}
                                >
                                  <FileText className="w-5 h-5 shrink-0" />
                                  <span className="truncate max-w-full">Docs</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setActiveNav("reports")}
                                  className={`flex-1 min-w-0 flex flex-col items-center gap-1 text-[10px] sm:text-[11px] font-semibold transition ${activeNav === "reports" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
                                    }`}
                                >
                                  <BarChart2 className="w-5 h-5 shrink-0" />
                                  <span className="truncate max-w-full">Reports</span>
                                </button>
                              </nav>

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
