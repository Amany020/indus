"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/context";
import CameraCaptureModal from "@/components/CameraCaptureModal";
import QrScannerModal from "@/components/QrScannerModal";
import {
  api,
  isAbortError,
  LANGUAGES,
  type VoiceLanguageCode,
  type Machine,
  type QueryResponse,
  type TroubleshootingSession,
  type TroubleshootingTurnResponse,
  type TroubleshootingStep,
  type ExpertTip,
  type Tip,
  getMyTickets,
  getAssignedTickets,
  type EscalationTicketListItem,
} from "@/lib/api";
import { isExpertRole } from "@/lib/roles";
import TicketList from "@/components/TicketList";
import TicketThread from "@/components/TicketThread";
import {
  Home,
  MessageSquare,
  Cpu,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ThumbsUp,
  ThumbsDown,
  Send,
  Square,
  Mic,
  Languages,
  Paperclip,
  ChevronRight,
  Search,
  X,
  Camera,
  Image as ImageIcon,
  FileText,
  Bell,
  ShieldAlert,
  User,
  Volume2,
  VolumeX,
  Loader2,
  Wrench,
  Lightbulb,
  QrCode,
} from "lucide-react";

export default function WorkerPage() {
  const router = useRouter();
  const { machine, setMachine, logout, user, sessionId } = useApp();

  // Navigation tab: 'home' | 'chat' | 'machines' | 'history' | 'my_tickets' | 'assigned_tickets'
  const [activeTab, setActiveTab] = useState<"home" | "chat" | "machines" | "history" | "my_tickets" | "assigned_tickets">("home");
  const [userRole, setUserRole] = useState<string>(user?.role || "worker");

  // Escalation Tickets state
  const [myTickets, setMyTickets] = useState<EscalationTicketListItem[]>([]);
  const [myTicketsLoading, setMyTicketsLoading] = useState(false);
  const [myTicketsError, setMyTicketsError] = useState<string | null>(null);
  const [selectedMyTicketId, setSelectedMyTicketId] = useState<string | null>(null);

  const loadMyTickets = useCallback(async () => {
    setMyTicketsLoading(true);
    setMyTicketsError(null);
    try {
      const data = await getMyTickets();
      setMyTickets(data || []);
    } catch (err: any) {
      setMyTicketsError(err?.message || "Failed to load my tickets");
    } finally {
      setMyTicketsLoading(false);
    }
  }, []);

  const [assignedTickets, setAssignedTickets] = useState<EscalationTicketListItem[]>([]);
  const [assignedTicketsLoading, setAssignedTicketsLoading] = useState(false);
  const [assignedTicketsError, setAssignedTicketsError] = useState<string | null>(null);
  const [selectedAssignedTicketId, setSelectedAssignedTicketId] = useState<string | null>(null);

  const loadAssignedTickets = useCallback(async () => {
    setAssignedTicketsLoading(true);
    setAssignedTicketsError(null);
    try {
      const data = await getAssignedTickets();
      setAssignedTickets(data || []);
    } catch (err: any) {
      setAssignedTicketsError(err?.message || "Failed to load assigned tickets");
    } finally {
      setAssignedTicketsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "my_tickets") {
      loadMyTickets();
    } else if (activeTab === "assigned_tickets") {
      loadAssignedTickets();
    }
  }, [activeTab, loadMyTickets, loadAssignedTickets]);

  // Machines state from genuine database
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [machineCategory, setMachineCategory] = useState("All");
  const [machineSearch, setMachineSearch] = useState("");

  // Query History state from genuine database
  const [historyItems, setHistoryItems] = useState<any[]>([]);

  // Genuine Chat conversation state
  const [messages, setMessages] = useState<Array<{
    id: string;
    query_id?: string;
    status?: "supported" | "limited" | "escalate" | "restricted";
    sender: "worker" | "ai";
    time: string;
    text: string;
    stopped?: boolean;
    imageUrl?: string;
    steps?: string[];
    highlight?: string;
    source?: { title: string; section: string; page: number; hasBbox: boolean; document_id: string };
    feedback?: "up" | "down" | null;
    resolution?: "resolved" | "not_resolved" | "still_working" | null;
    language?: string;
    expert_tips?: ExpertTip[];
  }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [pendingImageBlob, setPendingImageBlob] = useState<Blob | null>(null);
  const [pendingImagePreviewUrl, setPendingImagePreviewUrl] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [replayedBanner, setReplayedBanner] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const queryAbortControllerRef = useRef<AbortController | null>(null);

  // Modals
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [recordingState, setRecordingState] = useState<
    "idle" | "recording" | "transcribing" | "confirming" | "error"
  >("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [transcript, setTranscript] = useState("");
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<VoiceLanguageCode>("en");
  const [editedTranscript, setEditedTranscript] = useState("");
  const [showEscalate, setShowEscalate] = useState(false);
  const [showEscalateCameraModal, setShowEscalateCameraModal] = useState(false);
  const [escalateImageBlob, setEscalateImageBlob] = useState<Blob | null>(null);
  const [escalateImagePreviewUrl, setEscalateImagePreviewUrl] = useState<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [escalateSummary, setEscalateSummary] = useState("");
  const [escalateQueryId, setEscalateQueryId] = useState<string | null>(null);
  const [escalateSubmitted, setEscalateSubmitted] = useState(false);
  const [escalateSubmitting, setEscalateSubmitting] = useState(false);
  const [escalateError, setEscalateError] = useState<string | null>(null);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const [tsSymptom, setTsSymptom] = useState("");
  const [tsSession, setTsSession] = useState<TroubleshootingSession | null>(null);
  const [tsLoading, setTsLoading] = useState(false);
  const [tsError, setTsError] = useState<string | null>(null);
  const [tsCurrentStep, setTsCurrentStep] = useState<TroubleshootingStep | null>(null);
  const [tsLedger, setTsLedger] = useState<TroubleshootingStep[]>([]);
  const [tsStatus, setTsStatus] = useState<string>("active");
  const [tsEscalationReason, setTsEscalationReason] = useState<string | null>(null);
  const [tsTurnLoading, setTsTurnLoading] = useState(false);
  const [tsInputText, setTsInputText] = useState("");
  const [showTips, setShowTips] = useState(false);
  const [tipsList, setTipsList] = useState<Tip[]>([]);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState<string | null>(null);
  const [newTipText, setNewTipText] = useState("");
  const [tipSubmitting, setTipSubmitting] = useState(false);
  const [tipSubmitSuccess, setTipSubmitSuccess] = useState(false);
  const [activeDocSource, setActiveDocSource] = useState<{
    title: string;
    section: string;
    page: number;
    hasBbox: boolean;
    document_id: string;
  } | null>(null);
  const [docImageUrl, setDocImageUrl] = useState<string | null>(null);
  const [docViewerLoading, setDocViewerLoading] = useState(false);
  const [docViewerError, setDocViewerError] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileData, setProfileData] = useState<{
    full_name: string;
    email: string;
    role: string;
    factory_name: string;
    branch_name: string;
  } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Stop TTS playback on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, []);

  // Fetch profile data when profile modal opens
  useEffect(() => {
    if (!showProfileModal || profileData) return;

    let isMounted = true;
    setProfileLoading(true);
    setProfileError(null);

    (async () => {
      try {
        const me = await api.getMe();
        const factories = await api.getFactories();
        const matchedFactory = factories.find((f) => f.id === me.factory_id);
        const factoryName = matchedFactory ? matchedFactory.name : "Unknown factory";

        let branchName = "Not assigned";
        if (me.branch_id) {
          try {
            const branches = await api.getBranches(me.factory_id);
            const matchedBranch = branches.find((b) => b.id === me.branch_id);
            branchName = matchedBranch ? matchedBranch.name : "Unknown branch";
          } catch {
            branchName = "Unknown branch";
          }
        }

        if (isMounted) {
          setProfileData({
            full_name: me.full_name || "Unknown",
            email: me.email || "No email",
            role: me.role || "worker",
            factory_name: factoryName,
            branch_name: branchName,
          });
        }
      } catch (err) {
        if (isMounted) {
          console.error("Failed to load profile:", err);
          setProfileError("Failed to load profile");
        }
      } finally {
        if (isMounted) {
          setProfileLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [showProfileModal, profileData]);

  // Load genuine query history from backend
  const loadHistory = useCallback(() => {
    if (!sessionId) return;
    api.getQueryHistory(sessionId)
      .then((data) => {
        setHistoryItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error("Failed to load history:", err);
        setHistoryItems([]);
      });
  }, [sessionId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Load genuine machines from backend
  useEffect(() => {
    let isMounted = true;
    setMachinesLoading(true);

    api.getMe()
      .then((me) => {
        if (isMounted && me?.role) {
          setUserRole(me.role);
        }
        return api.getMachines(me.factory_id);
      })
      .then((data) => {
        if (isMounted && data) {
          setMachines(data);
          if (data.length > 0 && !machine) {
            setMachine(data[0]);
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load machines:", err);
      })
      .finally(() => {
        if (isMounted) setMachinesLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (activeTab === "chat" && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  // Revoke any image object URLs on unmount
  useEffect(() => {
    return () => {
      messages.forEach((m) => {
        if (m.imageUrl) URL.revokeObjectURL(m.imageUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke pending image preview URL on unmount or change
  useEffect(() => {
    return () => {
      if (pendingImagePreviewUrl) URL.revokeObjectURL(pendingImagePreviewUrl);
    };
  }, [pendingImagePreviewUrl]);

  const handleImageCapture = (imageBlob: Blob) => {
    setShowCameraModal(false);
    setPendingImageBlob(imageBlob);
    setPendingImagePreviewUrl(URL.createObjectURL(imageBlob));
  };

  // Abort any in-flight query request on unmount
  useEffect(() => {
    return () => {
      if (queryAbortControllerRef.current) {
        queryAbortControllerRef.current.abort();
        queryAbortControllerRef.current = null;
      }
    };
  }, []);

  // Client-side only: stops waiting; the server request continues.
  const handleStopQuery = () => {
    if (queryAbortControllerRef.current) {
      queryAbortControllerRef.current.abort();
      queryAbortControllerRef.current = null;
    }
    setIsSending(false);
    setMessages((prev) => [
      ...prev,
      {
        id: `stopped-${Date.now()}`,
        sender: "ai",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: "Stopped.",
        stopped: true,
        feedback: null,
      },
    ]);
  };

  // Read voice language from localStorage on client mount (SSR safe)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("im_voice_lang");
      if (saved === "en" || saved === "hi") {
        setSelectedLanguage(saved);
      }
    } catch (_) {}
  }, []);

  const handleLanguageSelect = (lang: VoiceLanguageCode) => {
    setSelectedLanguage(lang);
    try {
      localStorage.setItem("im_voice_lang", lang);
    } catch (_) {}
  };

  const handleRemovePendingImage = () => {
    if (pendingImagePreviewUrl) URL.revokeObjectURL(pendingImagePreviewUrl);
    setPendingImageBlob(null);
    setPendingImagePreviewUrl(null);
  };

  const handleQrSuccess = (resolvedMachine: Machine) => {
    setMachines((prev) => {
      if (!prev.some((m) => m.id === resolvedMachine.id)) {
        return [resolvedMachine, ...prev];
      }
      return prev;
    });
    setMachine(resolvedMachine);
  };

  // Send question - Real backend integration with Gemini and Vector Retrieval
  const handleSendQuery = async (
    queryText?: string,
    options?: {
      input_mode?: string;
      raw_transcript?: string;
      transcript_confirmed?: boolean;
    }
  ) => {
    const textToSend = queryText || chatInput;
    const hasPendingImage = Boolean(pendingImageBlob);
    if (!textToSend.trim() && !hasPendingImage) return;
    if (isSending) return;

    setReplayedBanner(null);

    const activeMachine = machine || machines[0];
    if (!activeMachine) {
      alert("Please select a machine first");
      setActiveTab("machines");
      return;
    }

    if (queryAbortControllerRef.current) {
      queryAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    queryAbortControllerRef.current = controller;

    if (hasPendingImage && pendingImageBlob) {
      const imageBlob = pendingImageBlob;
      const caption = textToSend.trim() || "Identify the issue shown in this image";
      const imageUrl = URL.createObjectURL(imageBlob);
      const userMsgId = `usr-${Date.now()}`;
      const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          sender: "worker",
          time: nowTime,
          text: caption,
          imageUrl,
        },
      ]);
      setChatInput("");
      handleRemovePendingImage();
      setIsSending(true);

      try {
        const response: QueryResponse = await api.sendImageQuery({
          machine_id: activeMachine.id,
          query_text: caption,
          image: imageBlob,
          session_id: sessionId,
          detected_language: selectedLanguage,
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        const aiMsgId = `ai-${Date.now()}`;
        const citedEvidenceId = response.citations?.[0]?.evidence_id;
        const firstSource = citedEvidenceId
          ? response.evidence_pack?.find((e) => e.evidence_id === citedEvidenceId) || response.evidence_pack?.[0]
          : response.evidence_pack?.[0];
        const hasBbox = Boolean(firstSource?.bbox && Object.keys(firstSource.bbox).length > 0);

        if (response.query_id) {
          setEscalateQueryId(response.query_id);
        }

        setMessages((prev) => [
          ...prev,
          {
            id: aiMsgId,
            query_id: response.query_id,
            status: response.status,
            sender: "ai",
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            text: response.summary || "Verified instruction generated from factory manuals.",
            steps: response.steps?.map((s) => s.instruction),
            highlight: response.warnings?.[0] || undefined,
            source: firstSource
              ? {
                  title: firstSource.filename,
                  section: firstSource.section_heading || "Operations Manual",
                  page: firstSource.page_number || 1,
                  hasBbox,
                  document_id: firstSource.document_id,
                }
              : undefined,
            feedback: null,
            language: response.detected_language,
            expert_tips: response.expert_knowledge,
          },
        ]);

        loadHistory();
      } catch (err) {
        if (isAbortError(err) || controller.signal.aborted) {
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-err-${Date.now()}`,
            sender: "ai",
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            text: `Image query failed: ${err instanceof Error ? err.message : "Network error"}.`,
            feedback: null,
          },
        ]);
      } finally {
        if (queryAbortControllerRef.current === controller) {
          queryAbortControllerRef.current = null;
          setIsSending(false);
        }
      }
      return;
    }

    const userMsgId = `usr-${Date.now()}`;
    const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Append worker message
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: "worker",
        time: nowTime,
        text: textToSend,
      },
    ]);
    setChatInput("");
    setIsSending(true);

    try {
      const response: QueryResponse = await api.sendQuery(
        {
          machine_id: activeMachine.id,
          query_text: textToSend,
          session_id: sessionId,
          input_mode: options?.input_mode || "text",
          detected_language: selectedLanguage,
          raw_transcript: options?.raw_transcript,
          transcript_confirmed: options?.transcript_confirmed ?? (options?.input_mode === "voice" ? false : true),
        },
        controller.signal
      );

      if (controller.signal.aborted) {
        return;
      }

      const aiMsgId = `ai-${Date.now()}`;
      const citedEvidenceId = response.citations?.[0]?.evidence_id;
      const firstSource = citedEvidenceId
        ? response.evidence_pack?.find((e) => e.evidence_id === citedEvidenceId) || response.evidence_pack?.[0]
        : response.evidence_pack?.[0];
      const hasBbox = Boolean(firstSource?.bbox && Object.keys(firstSource.bbox).length > 0);

      // Track the most recent query_id for escalation context
      if (response.query_id) {
        setEscalateQueryId(response.query_id);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: aiMsgId,
          query_id: response.query_id,
          status: response.status,
          sender: "ai",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          text: response.summary || "Verified instruction generated from factory manuals.",
          steps: response.steps?.map((s) => s.instruction),
          highlight: response.warnings?.[0] || undefined,
          source: firstSource
            ? {
                title: firstSource.filename,
                section: firstSource.section_heading || "Operations Manual",
                page: firstSource.page_number || 1,
                hasBbox,
                document_id: firstSource.document_id,
              }
            : undefined,
          feedback: null,
          language: response.detected_language,
          expert_tips: response.expert_knowledge,
        },
      ]);

      // Refresh real history after successful query
      loadHistory();
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) {
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          sender: "ai",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          text: `Query failed: ${err instanceof Error ? err.message : "Network error"}. Please check that the machine manual is indexed.`,
          feedback: null,
        },
      ]);
    } finally {
      if (queryAbortControllerRef.current === controller) {
        queryAbortControllerRef.current = null;
        setIsSending(false);
      }
    }
  };

  // Replay a past query and its answer into the chat view as read-only messages
  const handleReplayHistoryItem = (item: any) => {
    const itemMachine = machines.find((m) => m.id === item.machine_id);
    if (itemMachine) {
      setMachine(itemMachine);
    }

    const formattedDate = item.created_at
      ? new Date(item.created_at).toLocaleDateString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "earlier";

    setReplayedBanner(formattedDate);

    const timeStr = item.created_at
      ? new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "Past";

    const userMsgId = `hist-usr-${item.id || Date.now()}`;
    const userMsg = {
      id: userMsgId,
      sender: "worker" as const,
      time: timeStr,
      text: item.query_text || "",
    };

    const firstSource = item.evidence_pack?.[0];
    const hasBbox = Boolean(firstSource?.bbox && Object.keys(firstSource.bbox).length > 0);

    const stepList = Array.isArray(item.steps)
      ? item.steps
          .map((s: any) => (typeof s === "string" ? s : s?.instruction || s?.step_text || s?.text || ""))
          .filter((s: string) => Boolean(s && s.trim()))
      : undefined;

    if (item.id) {
      setEscalateQueryId(item.id);
    }

    const aiMsgId = `hist-ai-${item.id || Date.now()}`;
    const aiMsg = {
      id: aiMsgId,
      query_id: item.id,
      status: item.status,
      sender: "ai" as const,
      time: timeStr,
      text: item.response_summary || "Verified instruction generated from factory manuals.",
      steps: stepList && stepList.length > 0 ? stepList : undefined,
      highlight: item.warnings?.[0] || undefined,
      source: firstSource
        ? {
            title: firstSource.filename || "Operations Manual",
            section: firstSource.section_heading || "Operations Manual",
            page: firstSource.page_number || 1,
            hasBbox,
            document_id: firstSource.document_id,
          }
        : undefined,
      feedback: item.feedback || null,
      resolution: item.resolution_status || null,
      language: item.query_language || item.detected_language,
      expert_tips: Array.isArray(item.expert_tips) && item.expert_tips.length > 0 ? item.expert_tips : undefined,
    };

    setMessages([userMsg, aiMsg]);
    setActiveTab("chat");
  };

  // Voice Modal Recording & Cleanup Logic
  const closeVoiceModal = useCallback(() => {
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch (_) {}
      }
      try {
        mediaRecorderRef.current.stream?.getTracks().forEach((track) => track.stop());
      } catch (_) {}
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    setShowVoiceModal(false);
    setRecordingState("idle");
    setTranscriptError(null);
    setTranscript("");
    setEditedTranscript("");
  }, []);

  // Cleanup on unmount or when modal is closed
  useEffect(() => {
    if (!showVoiceModal) {
      if (mediaRecorderRef.current) {
        if (mediaRecorderRef.current.state !== "inactive") {
          try {
            mediaRecorderRef.current.stop();
          } catch (_) {}
        }
        try {
          mediaRecorderRef.current.stream?.getTracks().forEach((track) => track.stop());
        } catch (_) {}
        mediaRecorderRef.current = null;
      }
      audioChunksRef.current = [];
      setRecordingState("idle");
      setTranscriptError(null);
    }
  }, [showVoiceModal]);

  // Close modals on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showVoiceModal) { closeVoiceModal(); return; }
      if (showEscalate) { setShowEscalate(false); return; }
      if (activeDocSource) { setActiveDocSource(null); setDocImageUrl(null); setDocViewerError(null); setDocViewerLoading(false); return; }
      if (showProfileModal) { setShowProfileModal(false); return; }
      if (showTroubleshoot) { setShowTroubleshoot(false); return; }
      if (showTips) { setShowTips(false); return; }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showVoiceModal, showEscalate, activeDocSource, showProfileModal, showTroubleshoot, showTips, closeVoiceModal]);

  const startRecording = async () => {
    setTranscriptError(null);

    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setTranscriptError("Microphone access is required to use voice input.");
      setRecordingState("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (
        typeof MediaRecorder === "undefined" ||
        !MediaRecorder.isTypeSupported("audio/webm")
      ) {
        stream.getTracks().forEach((track) => track.stop());
        setTranscriptError(
          "Voice input is not supported in this browser. Please type your question instead."
        );
        setRecordingState("error");
        return;
      }

      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingState("recording");
    } catch (err: any) {
      setTranscriptError("Microphone access is required to use voice input.");
      setRecordingState("error");
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    recorder.onstop = async () => {
      // Release tracks to free microphone
      try {
        recorder.stream.getTracks().forEach((track) => track.stop());
      } catch (_) {}

      setRecordingState("transcribing");

      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      try {
        const res = await api.transcribe(audioBlob, selectedLanguage);
        setTranscript(res.transcript || "");
        setEditedTranscript(res.transcript || "");
        setRecordingState("confirming");
      } catch (err: any) {
        setTranscriptError(
          err instanceof Error
            ? err.message
            : "Transcription failed. Please try again."
        );
        setRecordingState("error");
      }
    };

    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  const handleConfirmAndAsk = () => {
    const query = editedTranscript.trim();
    if (!query) return;

    const raw = transcript;
    closeVoiceModal();
    setActiveTab("chat");
    handleSendQuery(query, {
      input_mode: "voice",
      raw_transcript: raw,
      transcript_confirmed: true,
    });
  };

  const handleSpeak = async (messageId: string, text: string, language?: string) => {
    setSpeechError(null);
    const langToUse: VoiceLanguageCode =
      language === "hi" || language === "en" ? language : selectedLanguage;

    // If already speaking this message, stop playback
    if (speakingMessageId === messageId) {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
        audioPlayerRef.current = null;
      }
      setSpeakingMessageId(null);
      return;
    }

    // Stop any existing playback first
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current = null;
    }

    const fallbackToBrowserSpeech = () => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setSpeechError("Voice output is not supported in this browser.");
        setSpeakingMessageId(null);
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = langToUse === "hi" ? "hi-IN" : "en-US";

      const voices = window.speechSynthesis.getVoices();
      const match = voices.find((v) =>
        v.lang.toLowerCase().startsWith(langToUse)
      );

      if (voices.length > 0 && !match) {
        setSpeechError(
          langToUse === "hi"
            ? "No Hindi voice installed on this device."
            : "No English voice installed on this device."
        );
        setSpeakingMessageId(null);
        return;
      }

      if (match) {
        utterance.voice = match;
      }

      utterance.onend = () => {
        setSpeakingMessageId(null);
      };
      utterance.onerror = () => {
        setSpeakingMessageId(null);
      };
      window.speechSynthesis.speak(utterance);
      setSpeakingMessageId(messageId);
    };

    try {
      const res = await api.textToSpeech(text, langToUse);

      if (res.audio_url) {
        const audio = new Audio(res.audio_url);
        audioPlayerRef.current = audio;
        audio.onended = () => {
          setSpeakingMessageId(null);
          audioPlayerRef.current = null;
        };
        audio.onerror = () => {
          setSpeakingMessageId(null);
          audioPlayerRef.current = null;
          fallbackToBrowserSpeech();
        };
        await audio.play();
        setSpeakingMessageId(messageId);
      } else {
        fallbackToBrowserSpeech();
      }
    } catch (err) {
      console.error("TTS playback failed, attempting browser fallback:", err);
      fallbackToBrowserSpeech();
    }
  };

  const handleOpenDocViewer = async (source: {
    title: string;
    section: string;
    page: number;
    hasBbox: boolean;
    document_id: string;
  }) => {
    setActiveDocSource(source);
    setDocImageUrl(null);
    setDocViewerError(null);
    setDocViewerLoading(true);
    try {
      const res = await api.getPageUrl(source.document_id, source.page);
      setDocImageUrl(res.url);
    } catch (err) {
      console.error("Failed to load document page:", err);
      setDocViewerError("Could not load this document page. It may not be available yet.");
    } finally {
      setDocViewerLoading(false);
    }
  };

  const handleCloseDocViewer = () => {
    setActiveDocSource(null);
    setDocImageUrl(null);
    setDocViewerError(null);
    setDocViewerLoading(false);
  };

  const handleFeedback = async (msgId: string, queryId: string | undefined, type: "up" | "down") => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, feedback: type } : m))
    );
    if (!queryId) return;
    try {
      await api.submitFeedback(queryId, {
        feedback: type === "up" ? "helpful" : "not_helpful",
      });
    } catch {
      // feedback recorded
    }
  };

  const handleResolutionStatus = async (
    msgId: string,
    queryId: string | undefined,
    status: "resolved" | "not_resolved" | "still_working"
  ) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, resolution: status } : m))
    );
    if (!queryId) return;
    try {
      await api.submitFeedback(queryId, { resolution_status: status });
    } catch {
      // best-effort, local state already updated
    }
  };

  const handleEscalateCameraCapture = (blob: Blob) => {
    setShowEscalateCameraModal(false);
    setEscalateImageBlob(blob);
    setEscalateImagePreviewUrl(URL.createObjectURL(blob));
  };

  const handleGalleryFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEscalateImageBlob(file);
      setEscalateImagePreviewUrl(URL.createObjectURL(file));
    }
    e.target.value = "";
  };

  const handleRemoveEscalateImage = () => {
    if (escalateImagePreviewUrl) URL.revokeObjectURL(escalateImagePreviewUrl);
    setEscalateImageBlob(null);
    setEscalateImagePreviewUrl(null);
  };

  // Submit real escalation ticket strictly scoped to a valid query_id
  const handleEscalateSubmit = async () => {
    if (!escalateQueryId) {
      setEscalateError("Ask a question first before escalating.");
      return;
    }

    setEscalateSubmitting(true);
    setEscalateError(null);
    try {
      const targetMachine = machine || machines[0];

      const createdTicket = await api.createEscalation({
        query_id: escalateQueryId,
        ai_drafted_brief: escalateSummary || `Worker escalated issue on ${targetMachine?.name || "machine"}`,
        priority: "normal",
      });
      if (escalateImageBlob && createdTicket?.id) {
        try {
          await api.uploadEscalationImage(createdTicket.id, escalateImageBlob);
        } catch (imgErr) {
          console.error("Escalation image upload failed:", imgErr);
        }
      }
      setEscalateSubmitted(true);
    } catch (err: any) {
      console.error("Escalation failed:", err);
      setEscalateError(err?.message || "Failed to submit escalation.");
    } finally {
      setEscalateSubmitting(false);
    }
  };

  const handleTroubleshootingTurn = async (
    confirmation?: "done" | "not_done" | "cant_check"
  ) => {
    if (!tsSession) return;
    setTsTurnLoading(true);
    setTsError(null);
    try {
      const res: TroubleshootingTurnResponse = await api.submitTroubleshootingTurn(
        tsSession.id,
        tsInputText.trim() || undefined,
        confirmation
      );
      setTsCurrentStep(res.current_step);
      setTsLedger(res.evidence_ledger);
      setTsStatus(res.session_status);
      setTsEscalationReason(res.escalation_reason);
      setTsInputText("");
    } catch (err: any) {
      setTsError(err?.message || "Failed to get next step.");
    } finally {
      setTsTurnLoading(false);
    }
  };

  const handleResumeTroubleshooting = async (sessionId: string) => {
    setTsLoading(true);
    setTsError(null);
    try {
      const session = await api.getTroubleshootingSession(sessionId);
      setTsSession(session);
      const ledger = session.evidence_ledger || [];
      setTsLedger(ledger);
      setTsStatus(session.status);
      if (ledger.length > 0) {
        setTsCurrentStep(ledger[ledger.length - 1]);
      } else {
        const firstTurn = await api.submitTroubleshootingTurn(sessionId);
        setTsCurrentStep(firstTurn.current_step);
        setTsLedger(firstTurn.evidence_ledger);
        setTsStatus(firstTurn.session_status);
        setTsEscalationReason(firstTurn.escalation_reason);
      }
      setShowTroubleshoot(true);
    } catch (err: any) {
      localStorage.removeItem("im_ts_session_id");
      localStorage.removeItem("im_ts_machine_id");
      setTsSession(null);
      setTsCurrentStep(null);
      setTsLedger([]);
      setTsStatus("active");
      setTsEscalationReason(null);
      setShowTroubleshoot(true);
    } finally {
      setTsLoading(false);
    }
  };

  const handleEndTroubleshooting = () => {
    localStorage.removeItem("im_ts_session_id");
    localStorage.removeItem("im_ts_machine_id");
    setShowTroubleshoot(false);
    setTsSymptom("");
    setTsSession(null);
    setTsError(null);
    setTsLoading(false);
    setTsCurrentStep(null);
    setTsLedger([]);
    setTsStatus("active");
    setTsEscalationReason(null);
    setTsInputText("");
  };

  const handleStartTroubleshooting = async () => {
    const activeMachine = machine || machines[0];
    if (!activeMachine) {
      setTsError("Please select a machine first.");
      return;
    }
    if (!tsSymptom.trim()) {
      setTsError("Please describe the symptom first.");
      return;
    }
    setTsLoading(true);
    setTsError(null);
    try {
      const session = await api.createTroubleshootingSession(activeMachine.id, tsSymptom.trim());
      localStorage.setItem("im_ts_session_id", session.id);
      localStorage.setItem("im_ts_machine_id", activeMachine.id);
      setTsSession(session);
      const firstTurn = await api.submitTroubleshootingTurn(session.id);
      setTsCurrentStep(firstTurn.current_step);
      setTsLedger(firstTurn.evidence_ledger);
      setTsStatus(firstTurn.session_status);
      setTsEscalationReason(firstTurn.escalation_reason);
    } catch (err: any) {
      setTsError(err?.message || "Failed to start troubleshooting session.");
    } finally {
      setTsLoading(false);
    }
  };

  const handleCloseTroubleshoot = () => {
    setShowTroubleshoot(false);
  };

  const handleOpenTips = async () => {
    const activeMachine = machine || machines[0];
    setShowTips(true);
    setTipsError(null);
    setTipSubmitSuccess(false);
    if (!activeMachine) return;
    setTipsLoading(true);
    try {
      const tips = await api.getTips(activeMachine.id, "approved");
      setTipsList(tips);
    } catch (err: any) {
      setTipsError(err?.message || "Failed to load tips.");
    } finally {
      setTipsLoading(false);
    }
  };

  const handleSubmitTip = async () => {
    const activeMachine = machine || machines[0];
    if (!activeMachine) {
      setTipsError("Please select a machine first.");
      return;
    }
    if (!newTipText.trim()) {
      setTipsError("Please enter a tip before submitting.");
      return;
    }
    setTipSubmitting(true);
    setTipsError(null);
    try {
      await api.submitTip({
        machine_id: activeMachine.id,
        submitted_by: "",
        tip_text: newTipText.trim(),
      });
      setNewTipText("");
      setTipSubmitSuccess(true);
    } catch (err: any) {
      setTipsError(err?.message || "Failed to submit tip.");
    } finally {
      setTipSubmitting(false);
    }
  };

  const handleCloseTips = () => {
    setShowTips(false);
  };

  // Change password handler
  const handleChangePassword = async () => {
    setPasswordChangeError(null);
    setPasswordChangeSuccess(false);

    if (newPassword.length < 8) {
      setPasswordChangeError("New password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordChangeError("New passwords do not match");
      return;
    }

    setPasswordChangeLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPasswordChangeSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordChangeError(err?.message || "Failed to update password");
    } finally {
      setPasswordChangeLoading(false);
    }
  };

  // Filtered machines
  const filteredMachines = machines.filter((m) => {
    const matchesCategory =
      machineCategory === "All" ||
      m.name.toLowerCase().includes(machineCategory.toLowerCase()) ||
      m.workcell.toLowerCase().includes(machineCategory.toLowerCase());
    const matchesSearch =
      m.name.toLowerCase().includes(machineSearch.toLowerCase()) ||
      m.workcell.toLowerCase().includes(machineSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const recentThree = [...historyItems].reverse().slice(0, 3);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1C2B29] font-sans flex justify-center pb-20">
      {/* Mobile-centric Device Container matching reference images */}
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
                onClick={() => setActiveTab("history")}
                aria-label="View history"
              >
                <Bell className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => setShowProfileModal(true)}
                title="Profile"
                className="p-2 text-[#5C6460] hover:text-[#1C2B29] rounded-full hover:bg-[#F0EDE6] transition"
              >
                <User className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Worker Greeting */}
          <div className="mt-3">
            <h1 className="text-xl font-bold text-[#1C2B29] leading-tight">
              Good Morning,
              <br />
              {user?.full_name || "Vikram Singh"}
            </h1>
            <p className="text-xs text-[#5C6460] mt-0.5 font-medium">
              Worker
            </p>
          </div>
        </header>

        {/* ─── TAB 1: WORKER DASHBOARD (HOME) ───────────────────────── */}
        {activeTab === "home" && (
          <main className="flex-1 px-4 py-4 space-y-5">
            {/* KPI Stat Cards */}
            <div className="grid grid-cols-2 gap-3">
              {/* Card 1: My Machines */}
              <div
                onClick={() => setActiveTab("machines")}
                className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between cursor-pointer hover:border-[#D95A2B] transition"
              >
                <div>
                  <div className="text-2xl font-bold text-[#1C2B29]">{machines.length}</div>
                  <div className="text-xs text-[#5C6460] font-medium mt-0.5">
                    My Machines
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Cpu className="w-5 h-5" />
                </div>
              </div>

              {/* Card 2: Chat Sessions */}
              <div
                onClick={() => setActiveTab("chat")}
                className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between cursor-pointer hover:border-[#D95A2B] transition"
              >
                <div>
                  <div className="text-2xl font-bold text-[#1C2B29]">{historyItems.length}</div>
                  <div className="text-xs text-[#5C6460] font-medium mt-0.5">
                    Chat Messages
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5" />
                </div>
              </div>

              {/* Card 3: Escalated */}
              <button
                type="button"
                disabled={!escalateQueryId}
                onClick={() => {
                  if (escalateQueryId) setShowEscalate(true);
                }}
                title={escalateQueryId ? "Escalate issue" : "Ask a question first before escalating"}
                className={`text-left bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between transition ${
                  escalateQueryId
                    ? "cursor-pointer hover:border-red-400"
                    : "opacity-60 cursor-not-allowed"
                }`}
              >
                <div>
                  <div className="text-2xl font-bold text-[#1C2B29]">{escalateSubmitted ? 1 : 0}</div>
                  <div className="text-xs text-[#5C6460] font-medium mt-0.5">
                    Escalated
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div>
              <button
                type="button"
                onClick={() => setShowVoiceModal(true)}
                className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-[#D95A2B] to-[#C84E18] text-white p-3 rounded-2xl font-semibold text-xs shadow-xs hover:opacity-95 transition"
              >
                <Mic className="w-4 h-4" />
                <span>Ask with Voice</span>
              </button>
            </div>

            {/* Recent Conversations */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#1C2B29]">
                  Recent Conversations
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab("history")}
                  className="text-xs font-semibold text-[#D95A2B] hover:underline"
                >
                  View All
                </button>
              </div>

              {recentThree.length === 0 ? (
                <div className="bg-white border border-[#EDE8E0] rounded-2xl p-6 text-center shadow-xs">
                  <p className="text-xs text-[#5C6460]">No recent conversations yet</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recentThree.map((item) => {
                    const itemMachine = machines.find((m) => m.id === item.machine_id);
                    const formattedTime = item.created_at
                      ? new Date(item.created_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Recently";

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleReplayHistoryItem(item)}
                        className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between cursor-pointer hover:border-[#D95A2B] transition"
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0 pr-2">
                          <div className="w-9 h-9 rounded-xl bg-[#FDF2ED] text-[#D95A2B] flex items-center justify-center shrink-0 mt-0.5 font-bold">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-[#1C2B29] truncate">
                              {itemMachine?.name || "Machine Query"}
                            </div>
                            <div className="text-xs text-[#5C6460] mt-0.5 line-clamp-1">
                              {item.query_text}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[11px] text-[#5C6460] font-medium block">
                            {formattedTime}
                          </span>
                          <span
                            className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              item.status === "supported"
                                ? "bg-green-50 text-green-700"
                                : item.status === "limited"
                                ? "bg-amber-50 text-amber-700"
                                : item.status === "escalate"
                                ? "bg-red-50 text-red-600"
                                : "bg-[#FFF6F2] text-[#D95A2B]"
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Need Human Support Prompt Card */}
            <div className="bg-[#FFF8F5] border border-[#FAD8CD] rounded-2xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-[#D95A2B] uppercase tracking-wider">
                  Need Expert Help?
                </div>
                <div className="text-xs text-[#1C2B29] mt-0.5 font-medium">
                  {escalateQueryId
                    ? "Escalate this issue directly to Reviewers."
                    : "Ask a question first before escalating."}
                </div>
              </div>
              <button
                type="button"
                disabled={!escalateQueryId}
                onClick={() => {
                  if (escalateQueryId) setShowEscalate(true);
                }}
                title={escalateQueryId ? "Escalate issue" : "Ask a question first before escalating"}
                className="shrink-0 bg-[#D95A2B] text-white text-xs font-semibold px-3 py-2 rounded-xl hover:bg-[#C84E18] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Escalate
              </button>
            </div>
          </main>
        )}

        {/* ─── TAB 2: CHAT ASSISTANT ─────────────────────────────────── */}
        {activeTab === "chat" && (
          <div className="flex-1 flex flex-col h-[calc(100vh-140px)]">
            {/* Machine Header Pill */}
            <div className="bg-white px-4 py-2.5 border-b border-[#EDE8E0] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                <span className="font-bold text-sm text-[#1C2B29]">
                  {machine?.name || "Hydraulic Press 04"}
                </span>
                <span className="text-[11px] text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-semibold">
                  Online
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleOpenTips}
                  className="text-xs text-[#4C8C5C] font-semibold hover:underline"
                >
                  Tips
                </button>
                <button
                  type="button"
                  onClick={() => setShowQrModal(true)}
                  aria-label="Scan machine QR code"
                  className="text-xs text-[#D95A2B] font-semibold hover:underline flex items-center gap-1"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Scan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("machines")}
                  className="text-xs text-[#D95A2B] font-semibold hover:underline"
                >
                  Change
                </button>
              </div>
            </div>

            {/* Message Stream */}
            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-4"
            >
              {replayedBanner && (
                <div className="bg-[#FAF8F5] border border-[#EDE8E0] rounded-xl px-3 py-2 text-center text-[11px] text-[#5C6460] flex items-center justify-center gap-1.5 shadow-xs">
                  <Clock className="w-3.5 h-3.5 text-[#D95A2B]" />
                  <span>
                    Viewing past conversation from{" "}
                    <span className="font-semibold text-[#1C2B29]">{replayedBanner}</span>
                  </span>
                </div>
              )}

              {messages.length === 0 && (
                <div className="py-8 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#FDF2ED] text-[#D95A2B] flex items-center justify-center mx-auto">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#1C2B29]">
                      IndustryMind Assistant Ready
                    </h3>
                    <p className="text-xs text-[#5C6460] mt-1 max-w-xs mx-auto">
                      Ask any question regarding operation, maintenance, or troubleshooting for {machine?.name || "your machine"}.
                    </p>
                  </div>

                  <div className="space-y-2 pt-2 text-left">
                    <span className="text-[10px] font-bold text-[#5C6460] uppercase tracking-wider block">
                      Suggested questions from approved manuals:
                    </span>
                    {[
                      "What is the routine lubrication schedule for CDU-7500X?",
                      "How to adjust belt tension on Conveyor Drive Unit?",
                      "What actions are required for error code E-247 motor overheat?",
                    ].map((q, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSendQuery(q)}
                        className="w-full text-left p-2.5 rounded-xl bg-white border border-[#E5E0D8] text-xs font-medium text-[#1C2B29] hover:border-[#D95A2B] transition shadow-xs"
                      >
                        &quot;{q}&quot;
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => (
                <div key={m.id}>
                  {m.sender === "worker" ? (
                    /* Worker Question Bubble */
                    <div className="flex justify-end">
                      <div className="max-w-[82%] bg-[#ECE7DE] text-[#1C2B29] rounded-2xl rounded-tr-xs px-4 py-3 shadow-xs">
                        {m.imageUrl && (
                          <img
                            src={m.imageUrl}
                            alt="Captured"
                            className="w-full max-w-[200px] rounded-xl mb-2 object-cover"
                          />
                        )}
                        <p className="text-xs leading-relaxed font-medium">
                          {m.text}
                        </p>
                        <span className="text-[10px] text-[#5C6460] mt-1 block text-right font-mono">
                          {m.time}
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* AI Assistant Response Card */
                    <div className="flex items-start gap-2.5 max-w-[94%]">
                      <div className="w-8 h-8 rounded-full bg-[#D95A2B] text-white flex items-center justify-center shrink-0 text-xs font-bold shadow-xs">
                        AI
                      </div>

                      <div className="bg-white border border-[#EDE8E0] rounded-2xl rounded-tl-xs p-3.5 shadow-xs space-y-3">
                        {m.stopped ? (
                          <p className="text-xs text-[#5C6460] italic leading-relaxed">
                            Stopped.
                          </p>
                        ) : (
                          <>
                        {/* Status Badge */}
                        {m.status && (
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                                m.status === "supported"
                                  ? "bg-green-50 text-green-700"
                                  : m.status === "limited"
                                  ? "bg-amber-50 text-amber-700"
                                  : m.status === "escalate"
                                  ? "bg-red-50 text-red-600"
                                  : "bg-[#FFF6F2] text-[#D95A2B]"
                              }`}
                            >
                              {m.status}
                            </span>
                          </div>
                        )}

                        {/* Escalate Banner */}
                        {m.status === "escalate" && (
                          <div className="text-[11px] font-semibold text-red-600 bg-red-50 px-2.5 py-1.5 rounded-xl border border-red-200">
                            AI-drafted brief — requires human review before sending
                          </div>
                        )}

                        <p className="text-xs text-[#1C2B29] leading-relaxed">
                          {m.text}
                        </p>

                        {/* Steps checklist if present */}
                        {m.steps && m.steps.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <div className="text-[11px] font-bold text-[#5C6460] uppercase tracking-wider">
                              Action Steps:
                            </div>
                            <ol className="list-decimal pl-4 space-y-1 text-xs text-[#1C2B29]">
                              {m.steps.map((st, idx) => (
                                <li key={idx} className="leading-snug">
                                  {st}
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {/* Warning/Highlight callout */}
                        {m.highlight && (
                          <div className="bg-[#FFF6F2] border-l-3 border-[#D95A2B] p-2.5 rounded-r-xl text-xs text-[#1C2B29]">
                            <span className="font-bold text-[#D95A2B] block mb-0.5">
                              Caution:
                            </span>
                            {m.highlight}
                          </div>
                        )}

                        {m.expert_tips && m.expert_tips.length > 0 && (
                          <div className="bg-[#F3F9F1] border-l-3 border-[#4C8C5C] p-2.5 rounded-r-xl text-xs text-[#1C2B29] space-y-1.5">
                            <span className="font-bold text-[#4C8C5C] flex items-center gap-1">
                              <Lightbulb className="w-3.5 h-3.5" />
                              From Expert Knowledge:
                            </span>
                            {m.expert_tips.map((tip) => (
                              <p key={tip.id} className="text-[#1C2B29]">
                                &quot;{tip.tip_text}&quot; <span className="text-[10px] text-[#5C6460]">— {tip.submitted_by}</span>
                              </p>
                            ))}
                          </div>
                        )}

                        {/* Source Citation Pill */}
                        {m.source && (
                          <button
                            type="button"
                            onClick={() => handleOpenDocViewer(m.source!)}
                            className="w-full flex items-center justify-between bg-[#F8F6F2] hover:bg-[#F3EFE6] border border-[#E5E0D8] rounded-xl px-3 py-2 text-left transition"
                          >
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-[#D95A2B]" />
                              <div>
                                <span className="text-xs font-bold text-[#1C2B29] block">
                                  {m.source.title}
                                </span>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] text-[#5C6460]">
                                    {m.source.section} · Page {m.source.page}
                                  </span>
                                  <span className="text-[10px] font-semibold text-[#5C6460] bg-[#EDE8E0] px-1.5 py-0.5 rounded">
                                    {m.source.hasBbox ? "Highlighted region" : "Full page"}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-[#5C6460]" />
                          </button>
                        )}

                        {/* Feedback & Escalation Triggers */}
                        <div className="flex items-center justify-between pt-1 border-t border-[#F0ECE4]">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSpeak(m.id, m.text, selectedLanguage)}
                              className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition ${
                                speakingMessageId === m.id
                                  ? "bg-[#FDF2ED] border-[#D95A2B] text-[#D95A2B]"
                                  : "border-[#E5E0D8] text-[#5C6460] hover:text-[#1C2B29]"
                              }`}
                              aria-label={speakingMessageId === m.id ? "Stop speaking" : "Listen to this answer"}
                            >
                              {speakingMessageId === m.id ? (
                                <VolumeX className="w-3.5 h-3.5" />
                              ) : (
                                <Volume2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleFeedback(m.id, m.query_id, "up")}
                              className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition ${
                                m.feedback === "up"
                                  ? "bg-green-50 border-green-500 text-green-700"
                                  : "border-[#E5E0D8] text-[#5C6460] hover:text-[#1C2B29]"
                              }`}
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleFeedback(m.id, m.query_id, "down")}
                              className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition ${
                                m.feedback === "down"
                                  ? "bg-red-50 border-red-500 text-red-700"
                                  : "border-[#E5E0D8] text-[#5C6460] hover:text-[#1C2B29]"
                              }`}
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Only render when status !== 'escalate' to prevent duplicate tickets */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const activeMachine = machine || machines[0];
                                const storedId = localStorage.getItem("im_ts_session_id");
                                const storedMachineId = localStorage.getItem("im_ts_machine_id");
                                if (storedId && activeMachine && storedMachineId === activeMachine.id) {
                                  handleResumeTroubleshooting(storedId);
                                } else {
                                  setShowTroubleshoot(true);
                                }
                              }}
                              className="text-[11px] font-semibold text-[#D95A2B] bg-[#FDF2ED] px-2.5 py-1 rounded-full hover:bg-[#FCE5DB] transition flex items-center gap-1"
                            >
                              <Wrench className="w-3.5 h-3.5" />
                              <span>Guided Troubleshooting</span>
                            </button>

                            {m.status !== "escalate" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEscalateQueryId(m.query_id || null);
                                  setEscalateSummary(m.text ? `Issue following query: ${m.text.slice(0, 100)}` : "");
                                  setShowEscalate(true);
                                }}
                                className="text-[11px] font-semibold text-[#D95A2B] bg-[#FDF2ED] px-2.5 py-1 rounded-full hover:bg-[#FCE5DB] transition"
                              >
                                Still not resolved
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-[#F0ECE4]">
                          {m.resolution ? (
                            <p className="text-[11px] text-[#5C6460]">
                              Marked as:{" "}
                              <span className="font-semibold text-[#1C2B29]">
                                {m.resolution.replace("_", " ")}
                              </span>
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              <p className="text-[10px] font-semibold text-[#5C6460]">
                                Did this resolve your issue?
                              </p>
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleResolutionStatus(m.id, m.query_id, "resolved")}
                                  className="flex-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg py-1.5 hover:bg-green-100 transition"
                                >
                                  Resolved
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleResolutionStatus(m.id, m.query_id, "still_working")}
                                  className="flex-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg py-1.5 hover:bg-amber-100 transition"
                                >
                                  Still Working
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleResolutionStatus(m.id, m.query_id, "not_resolved")}
                                  className="flex-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg py-1.5 hover:bg-red-100 transition"
                                >
                                  Not Resolved
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isSending && (
                <div className="flex items-center gap-2 text-xs text-[#5C6460] italic">
                  <div className="w-2 h-2 rounded-full bg-[#D95A2B] animate-ping" />
                  Generating verified answer from manuals...
                </div>
              )}
            </div>

            {/* Bottom Chat Input Bar */}
            <div className="p-3 bg-white border-t border-[#EDE8E0]">
              {speechError && (
                <div className="mb-2 flex items-center justify-between bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-1.5 rounded-xl">
                  <span>{speechError}</span>
                  <button
                    type="button"
                    onClick={() => setSpeechError(null)}
                    className="p-0.5 text-red-500 hover:text-red-700 rounded-md"
                    aria-label="Dismiss error"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {pendingImagePreviewUrl && (
                <div className="mb-2 relative inline-block">
                  <img
                    src={pendingImagePreviewUrl}
                    alt="Pending image preview"
                    className="w-14 h-14 rounded-xl object-cover border border-[#E5E0D8]"
                  />
                  <button
                    type="button"
                    onClick={handleRemovePendingImage}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#1C2B29] text-white flex items-center justify-center hover:bg-[#D95A2B] transition"
                    aria-label="Remove image"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendQuery();
                }}
                className="flex items-center gap-1.5 sm:gap-2"
              >
                <button
                  type="button"
                  onClick={() => setShowCameraModal(true)}
                  className="p-2 text-[#5C6460] hover:text-[#1C2B29] rounded-xl hover:bg-[#FAF8F5] transition shrink-0"
                >
                  <Paperclip className="w-5 h-5" />
                </button>

                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type your question..."
                  className="flex-1 min-w-0 bg-[#FAF8F5] border border-[#E5E0D8] rounded-2xl px-3 sm:px-4 py-2.5 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B] transition"
                />

                <button
                  type="button"
                  onClick={() => handleLanguageSelect(selectedLanguage === "en" ? "hi" : "en")}
                  aria-label={`Current voice language: ${selectedLanguage === "en" ? "English" : "Hindi"}. Click to toggle.`}
                  className="min-h-[48px] px-2 sm:px-2.5 rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] hover:bg-white text-[#1C2B29] flex items-center gap-1 text-xs font-semibold transition shrink-0"
                >
                  <Languages className="w-4 h-4 text-[#5C6460]" />
                  <span>{selectedLanguage === "en" ? "EN" : "हिन्दी"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowVoiceModal(true)}
                  aria-label="Ask with voice"
                  className="min-h-[48px] min-w-[48px] p-2 text-[#5C6460] hover:text-[#D95A2B] rounded-xl hover:bg-[#FAF8F5] flex items-center justify-center transition shrink-0"
                >
                  <Mic className="w-5 h-5" />
                </button>

                {isSending && (
                  <button
                    type="button"
                    onClick={handleStopQuery}
                    aria-label="Stop generating answer"
                    className="min-h-[48px] px-3.5 rounded-2xl border border-[#E5E0D8] bg-white hover:bg-[#FAF8F5] text-[#1C2B29] flex items-center gap-1.5 text-xs font-semibold transition"
                  >
                    <Square className="w-3.5 h-3.5 fill-[#1C2B29] text-[#1C2B29]" />
                    <span>Stop</span>
                  </button>
                )}

                <button
                  type="submit"
                  disabled={(!chatInput.trim() && !pendingImageBlob) || isSending}
                  aria-label="Send query"
                  className="w-10 h-10 min-h-[48px] min-w-[48px] rounded-2xl bg-[#D95A2B] hover:bg-[#C84E18] text-white flex items-center justify-center disabled:opacity-50 transition shadow-xs"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ─── TAB 3: MACHINE SELECTOR (FLEET) ───────────────────────── */}
        {activeTab === "machines" && (
          <main className="flex-1 px-4 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1C2B29]">Select Machine</h2>
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                aria-label="Scan machine QR code"
                className="min-h-[48px] px-3.5 py-2 rounded-xl bg-white border border-[#E5E0D8] hover:border-[#D95A2B] text-xs font-bold text-[#1C2B29] transition shadow-xs flex items-center gap-2"
              >
                <QrCode className="w-4 h-4 text-[#D95A2B]" />
                <span>Scan</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#5C6460] absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search machines..."
                value={machineSearch}
                onChange={(e) => setMachineSearch(e.target.value)}
                className="w-full bg-white border border-[#E5E0D8] rounded-2xl pl-10 pr-4 py-2.5 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B] transition shadow-xs"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {["All", "Press", "CNC", "Conveyor", "Utilities"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setMachineCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition ${
                    machineCategory === cat
                      ? "bg-[#1C2B29] text-white"
                      : "bg-white border border-[#E5E0D8] text-[#5C6460] hover:text-[#1C2B29]"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Machine Cards List */}
            <div className="space-y-3">
              {filteredMachines.map((m) => (
                <div
                  key={m.id}
                  onClick={() => {
                    setMachine(m);
                    setActiveTab("chat");
                  }}
                  className={`bg-white border rounded-2xl p-3 shadow-xs flex items-center justify-between cursor-pointer transition ${
                    machine?.id === m.id
                      ? "border-[#D95A2B] ring-1 ring-[#D95A2B]"
                      : "border-[#EDE8E0] hover:border-[#D95A2B]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={
                        m.name.includes("CNC")
                          ? "/machine_cnc_02.jpg"
                          : "/machine_press_04.jpg"
                      }
                      alt={m.name}
                      className="w-14 h-14 rounded-xl object-cover border border-[#E5E0D8]"
                    />
                    <div>
                      <div className="text-xs font-bold text-[#1C2B29]">
                        {m.name}
                      </div>
                      <div className="text-[11px] text-[#5C6460] mt-0.5">
                        {m.workcell}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        <span className="text-[10px] text-green-700 font-semibold">
                          Online
                        </span>
                      </div>
                    </div>
                  </div>

                  <ChevronRight className="w-5 h-5 text-[#5C6460]" />
                </div>
              ))}
            </div>
          </main>
        )}

        {/* ─── TAB 4: CHAT HISTORY ──────────────────────────────────── */}
        {activeTab === "history" && (
          <main className="flex-1 px-4 py-4 space-y-4">
            <h2 className="text-base font-bold text-[#1C2B29]">My Chat History</h2>

            {historyItems.length === 0 ? (
              <div className="bg-white border border-[#EDE8E0] rounded-2xl p-6 text-center shadow-xs">
                <p className="text-xs text-[#5C6460]">No history yet</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {[...historyItems].reverse().map((item) => {
                  const itemMachine = machines.find((m) => m.id === item.machine_id);
                  const formattedTime = item.created_at
                    ? new Date(item.created_at).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Recently";

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleReplayHistoryItem(item)}
                      className="bg-white border border-[#EDE8E0] rounded-2xl p-3.5 shadow-xs flex items-center justify-between cursor-pointer hover:border-[#D95A2B] transition"
                    >
                      <div className="flex-1 pr-2">
                        <div className="text-xs font-bold text-[#1C2B29] line-clamp-1">
                          {item.query_text}
                        </div>
                        <div className="text-[11px] text-[#5C6460] mt-0.5">
                          {itemMachine?.name || "Machine"} · {formattedTime}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          item.status === "supported"
                            ? "bg-green-50 text-green-700"
                            : item.status === "limited"
                            ? "bg-amber-50 text-amber-700"
                            : item.status === "escalate"
                            ? "bg-red-50 text-red-600"
                            : "bg-[#FFF6F2] text-[#D95A2B]"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        )}

        {/* ─── TAB 5: MY TICKETS ─────────────────────────────────────── */}
        {activeTab === "my_tickets" && (
          <main className="flex-1 px-4 py-4 space-y-4">
            <h2 className="text-base font-bold text-[#1C2B29]">My Tickets</h2>
            {selectedMyTicketId ? (
              <TicketThread
                ticketId={selectedMyTicketId}
                canReply={false}
                onBack={() => setSelectedMyTicketId(null)}
                onChanged={loadMyTickets}
              />
            ) : (
              <TicketList
                tickets={myTickets}
                loading={myTicketsLoading}
                error={myTicketsError}
                emptyText="You haven't submitted any escalation tickets yet."
                onOpen={(id) => setSelectedMyTicketId(id)}
                onRefresh={loadMyTickets}
              />
            )}
          </main>
        )}

        {/* ─── TAB 6: ASSIGNED TICKETS (EXPERTS ONLY) ────────────────── */}
        {isExpertRole(userRole) && activeTab === "assigned_tickets" && (
          <main className="flex-1 px-4 py-4 space-y-4">
            <h2 className="text-base font-bold text-[#1C2B29]">Assigned to Me</h2>
            {selectedAssignedTicketId ? (
              <TicketThread
                ticketId={selectedAssignedTicketId}
                canReply={true}
                onBack={() => setSelectedAssignedTicketId(null)}
                onChanged={loadAssignedTickets}
              />
            ) : (
              <TicketList
                tickets={assignedTickets}
                loading={assignedTicketsLoading}
                error={assignedTicketsError}
                emptyText="No escalation tickets are currently assigned to you."
                onOpen={(id) => setSelectedAssignedTicketId(id)}
                onRefresh={loadAssignedTickets}
              />
            )}
          </main>
        )}

        {/* ─── FIXED BOTTOM DOCK NAVIGATION ─────────────────────────── */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 max-w-md mx-auto bg-white/95 backdrop-blur-md border-t border-[#EDE8E0] px-1 sm:px-3 py-2 flex items-center justify-around">
          <button
            type="button"
            onClick={() => setActiveTab("home")}
            className={`min-h-[48px] flex-1 min-w-0 flex flex-col items-center justify-center gap-1 text-[10px] sm:text-[11px] font-semibold transition cursor-pointer ${
              activeTab === "home" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
            }`}
          >
            <Home className="w-5 h-5 shrink-0" />
            <span className="truncate max-w-full">Home</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`min-h-[48px] flex-1 min-w-0 flex flex-col items-center justify-center gap-1 text-[10px] sm:text-[11px] font-semibold transition cursor-pointer ${
              activeTab === "chat" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
            }`}
          >
            <MessageSquare className="w-5 h-5 shrink-0" />
            <span className="truncate max-w-full">Chat</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("machines")}
            className={`min-h-[48px] flex-1 min-w-0 flex flex-col items-center justify-center gap-1 text-[10px] sm:text-[11px] font-semibold transition cursor-pointer ${
              activeTab === "machines" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
            }`}
          >
            <Cpu className="w-5 h-5 shrink-0" />
            <span className="truncate max-w-full">Machines</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`min-h-[48px] flex-1 min-w-0 flex flex-col items-center justify-center gap-1 text-[10px] sm:text-[11px] font-semibold transition cursor-pointer ${
              activeTab === "history" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
            }`}
          >
            <Clock className="w-5 h-5 shrink-0" />
            <span className="truncate max-w-full">History</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedMyTicketId(null);
              setActiveTab("my_tickets");
            }}
            className={`min-h-[48px] flex-1 min-w-0 flex flex-col items-center justify-center gap-1 text-[10px] sm:text-[11px] font-semibold transition cursor-pointer ${
              activeTab === "my_tickets" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
            }`}
          >
            <FileText className="w-5 h-5 shrink-0" />
            <span className="truncate max-w-full">My Tickets</span>
          </button>

          {isExpertRole(userRole) && (
            <button
              type="button"
              onClick={() => {
                setSelectedAssignedTicketId(null);
                setActiveTab("assigned_tickets");
              }}
              className={`min-h-[48px] flex-1 min-w-0 flex flex-col items-center justify-center gap-1 text-[10px] sm:text-[11px] font-semibold transition cursor-pointer ${
                activeTab === "assigned_tickets" ? "text-[#D95A2B]" : "text-[#5C6460] hover:text-[#1C2B29]"
              }`}
            >
              <Wrench className="w-5 h-5 shrink-0" />
              <span className="truncate max-w-full">Assigned</span>
            </button>
          )}
        </nav>

        {/* ─── MODAL 1: VOICE QUERY ─────────────────────────────────── */}
        {showVoiceModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) closeVoiceModal(); }}>
            <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-[#EDE8E0] text-center space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#5C6460] uppercase tracking-wider">
                  Ask with Voice
                </span>
                <button
                  type="button"
                  onClick={closeVoiceModal}
                  className="p-1 rounded-full text-[#5C6460] hover:bg-[#FAF8F5]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Language Selector in Voice Modal */}
              <div className="flex items-center justify-center gap-2 pt-1 pb-1">
                <span className="text-xs font-semibold text-[#5C6460]">Language:</span>
                <div className="inline-flex rounded-xl p-1 bg-[#FAF8F5] border border-[#E5E0D8]">
                  {LANGUAGES.map((lang) => {
                    const isSelected = selectedLanguage === lang.code;
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => handleLanguageSelect(lang.code)}
                        aria-label={`Select ${lang.label} language for voice`}
                        className={`min-h-[48px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                          isSelected
                            ? "bg-[#D95A2B] text-white shadow-xs"
                            : "text-[#5C6460] hover:text-[#1C2B29]"
                        }`}
                      >
                        <Languages className="w-3.5 h-3.5" />
                        <span>{lang.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* State: IDLE */}
              {recordingState === "idle" && (
                <div className="flex flex-col items-center justify-center py-4">
                  <div
                    onClick={startRecording}
                    className="w-28 h-28 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 bg-[#FDF2ED] text-[#D95A2B] hover:bg-[#FAD8CD]"
                  >
                    <Mic className="w-12 h-12" />
                  </div>
                  <div className="mt-4 font-bold text-sm text-[#1C2B29]">
                    Tap to speak
                  </div>
                  <div className="text-xs text-[#5C6460] mt-1">
                    Ask a question about machine operations
                  </div>
                </div>
              )}

              {/* State: RECORDING */}
              {recordingState === "recording" && (
                <div className="flex flex-col items-center justify-center py-4">
                  <div
                    onClick={stopRecording}
                    className="w-28 h-28 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 bg-[#D95A2B] text-white shadow-xl ring-8 ring-[#FAD8CD] animate-pulse"
                  >
                    <Mic className="w-12 h-12" />
                  </div>
                  <div className="mt-4 font-bold text-sm text-[#1C2B29]">
                    Recording... Speak clearly
                  </div>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="mt-4 px-5 py-2 rounded-xl bg-[#D95A2B] text-white text-xs font-bold hover:bg-[#C24C20] transition shadow-xs"
                  >
                    Stop Recording
                  </button>
                </div>
              )}

              {/* State: TRANSCRIBING */}
              {recordingState === "transcribing" && (
                <div className="py-8 flex flex-col items-center justify-center space-y-3">
                  <div className="w-3 h-3 rounded-full bg-[#D95A2B] animate-ping" />
                  <div className="font-bold text-sm text-[#1C2B29]">
                    Transcribing audio...
                  </div>
                  <div className="text-xs text-[#5C6460]">
                    Converting your speech to text
                  </div>
                </div>
              )}

              {/* State: CONFIRMING */}
              {recordingState === "confirming" && (
                <div className="space-y-4 text-left">
                  <div>
                    <label className="block text-[11px] font-bold text-[#5C6460] uppercase tracking-wider mb-1.5">
                      Transcribed Question:
                    </label>
                    <textarea
                      value={editedTranscript}
                      onChange={(e) => setEditedTranscript(e.target.value)}
                      rows={4}
                      className="w-full p-3 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] text-xs font-medium text-[#1C2B29] focus:outline-none focus:border-[#D95A2B] transition resize-none leading-relaxed"
                      placeholder="Transcribed text will appear here..."
                    />
                    <p className="text-[11px] text-[#5C6460] mt-1">
                      Review and correct any words before asking.
                    </p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTranscript("");
                        setEditedTranscript("");
                        setTranscriptError(null);
                        setRecordingState("idle");
                      }}
                      className="flex-1 py-2.5 px-3 rounded-xl border border-[#EDE8E0] bg-[#FAF8F5] text-xs font-semibold text-[#5C6460] hover:bg-[#F2ECE4] transition text-center"
                    >
                      Re-record
                    </button>
                    <button
                      type="button"
                      disabled={!editedTranscript.trim() || isSending}
                      onClick={handleConfirmAndAsk}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-[#D95A2B] text-white text-xs font-semibold hover:bg-[#C24C20] disabled:opacity-40 disabled:cursor-not-allowed transition text-center shadow-xs"
                    >
                      Confirm &amp; Ask
                    </button>
                  </div>
                </div>
              )}

              {/* State: ERROR */}
              {recordingState === "error" && (
                <div className="py-2 space-y-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="font-bold text-sm text-[#1C2B29]">
                      Voice Input Error
                    </div>
                    <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl text-left">
                      {transcriptError || "An error occurred during voice input."}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeVoiceModal}
                      className="flex-1 py-2.5 px-3 rounded-xl border border-[#EDE8E0] bg-[#FAF8F5] text-xs font-semibold text-[#5C6460] hover:bg-[#F2ECE4] transition"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTranscriptError(null);
                        setRecordingState("idle");
                      }}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-[#D95A2B] text-white text-xs font-semibold hover:bg-[#C24C20] transition"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── MODAL 2: NEED HUMAN SUPPORT / ESCALATE ───────────────── */}
        {showEscalate && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowEscalate(false); setEscalateSubmitted(false); setEscalateError(null); handleRemoveEscalateImage(); } }}>
            <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-[#EDE8E0] space-y-4">
              <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-[#D95A2B]" />
                  <span className="font-bold text-sm text-[#1C2B29]">
                    Need Human Support?
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowEscalate(false);
                    setEscalateSubmitted(false);
                    setEscalateError(null);
                    handleRemoveEscalateImage();
                  }}
                  className="p-1 rounded-full text-[#5C6460] hover:bg-[#FAF8F5]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {escalateSubmitted ? (
                <div className="py-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h4 className="font-bold text-base text-[#1C2B29]">
                    Ticket Submitted
                  </h4>
                  <p className="text-xs text-[#5C6460]">
                    Your issue ticket has been submitted to reviewers for expert support.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEscalate(false);
                      setEscalateSubmitted(false);
                      handleRemoveEscalateImage();
                    }}
                    className="w-full py-2.5 rounded-xl bg-[#1C2B29] text-white text-xs font-semibold"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div className="bg-[#FFF8F5] border border-[#FAD8CD] rounded-xl p-3 text-xs text-[#1C2B29]">
                    If the answer is not correct or the issue is not resolved, submit an escalation ticket to a supervisor/reviewer.
                  </div>

                  {!escalateQueryId && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-2.5 rounded-xl">
                      Ask a question first before escalating.
                    </div>
                  )}

                  {escalateError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-xl">
                      {escalateError}
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                        Issue Summary
                      </label>
                      <textarea
                        rows={3}
                        value={escalateSummary}
                        onChange={(e) => setEscalateSummary(e.target.value)}
                        placeholder="Describe your problem or what went wrong..."
                        className="w-full bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-3 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B]"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-[#5C6460]">
                          Select Machine
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowQrModal(true)}
                          aria-label="Scan machine QR code"
                          className="min-h-[48px] px-2 text-xs text-[#D95A2B] font-semibold hover:underline flex items-center gap-1"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Scan</span>
                        </button>
                      </div>
                      <select
                        value={machine?.id || (machines[0]?.id ?? "")}
                        onChange={(e) => {
                          const m = machines.find((x) => x.id === e.target.value);
                          if (m) setMachine(m);
                        }}
                        className="w-full bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-2.5 text-xs text-[#1C2B29]"
                      >
                        {machines.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.workcell})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                        Attach Photo (Optional)
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setShowEscalateCameraModal(true)}
                          className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] text-xs font-semibold text-[#1C2B29]"
                        >
                          <Camera className="w-4 h-4 text-[#D95A2B]" />
                          <span>Camera</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => galleryInputRef.current?.click()}
                          className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] text-xs font-semibold text-[#1C2B29]"
                        >
                          <ImageIcon className="w-4 h-4 text-[#5C6460]" />
                          <span>Gallery</span>
                        </button>
                      </div>
                      <input
                        ref={galleryInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleGalleryFileSelect}
                        className="hidden"
                      />
                      {escalateImagePreviewUrl && (
                        <div className="relative mt-2 inline-block">
                          <img
                            src={escalateImagePreviewUrl}
                            alt="Attached"
                            className="w-20 h-20 rounded-xl object-cover border border-[#E5E0D8]"
                          />
                          <button
                            type="button"
                            onClick={handleRemoveEscalateImage}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#1C2B29] text-white flex items-center justify-center"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={escalateSubmitting || !escalateQueryId}
                      onClick={handleEscalateSubmit}
                      className="w-full py-3 rounded-2xl bg-[#D95A2B] hover:bg-[#C84E18] disabled:opacity-50 text-white text-xs font-bold transition shadow-xs"
                    >
                      {escalateSubmitting ? "Submitting..." : "Submit to Reviewer"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <CameraCaptureModal
          isOpen={showCameraModal}
          onClose={() => setShowCameraModal(false)}
          onCapture={handleImageCapture}
        />

        <CameraCaptureModal
          isOpen={showEscalateCameraModal}
          onClose={() => setShowEscalateCameraModal(false)}
          onCapture={handleEscalateCameraCapture}
        />

        <QrScannerModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          onSuccess={handleQrSuccess}
        />

        {/* ─── MODAL 3: DOCUMENT SOP VIEWER ─────────────────────────── */}
        {activeDocSource !== null && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3" onClick={(e) => { if (e.target === e.currentTarget) handleCloseDocViewer(); }}>
            <div className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl border border-[#EDE8E0] space-y-4 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#D95A2B]" />
                  <div>
                    <h3 className="font-bold text-sm text-[#1C2B29]">
                      {activeDocSource.title}
                    </h3>
                    <div className="text-[10px] text-[#5C6460]">
                      Page {activeDocSource.page} · {activeDocSource.section}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCloseDocViewer}
                  className="p-1 rounded-full text-[#5C6460] hover:bg-[#FAF8F5]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 text-xs text-[#1C2B29]">
                {docViewerLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[#D95A2B]" />
                    <span className="text-xs text-[#5C6460]">Loading document page...</span>
                  </div>
                ) : docViewerError ? (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 space-y-3 text-center">
                    <p className="text-xs">{docViewerError}</p>
                    <button
                      type="button"
                      onClick={() => handleOpenDocViewer(activeDocSource)}
                      className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition"
                    >
                      Try Again
                    </button>
                  </div>
                ) : docImageUrl ? (
                  <div className="space-y-2">
                    <img
                      src={docImageUrl}
                      alt={activeDocSource.title}
                      className="w-full rounded-xl border border-[#E5E0D8]"
                    />
                    <p className="text-[11px] text-[#5C6460] text-center">
                      {activeDocSource.hasBbox
                        ? "Highlighted region shown"
                        : "Full page shown — no specific region highlighted for this citation."}
                    </p>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={handleCloseDocViewer}
                className="w-full py-2.5 rounded-xl bg-[#1C2B29] text-white text-xs font-semibold hover:bg-[#2A3F3C] transition"
              >
                Close Viewer
              </button>
            </div>
          </div>
        )}

        {/* ─── MODAL 4: USER PROFILE ───────────────────────────────── */}
        {showProfileModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowProfileModal(false); setShowPasswordSection(false); setPasswordChangeError(null); setPasswordChangeSuccess(false); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); } }}>
            <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-[#EDE8E0] space-y-4">
              <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-2">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-[#D95A2B]" />
                  <span className="font-bold text-sm text-[#1C2B29]">
                    Profile
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileModal(false);
                    setShowPasswordSection(false);
                    setPasswordChangeError(null);
                    setPasswordChangeSuccess(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                  className="p-1 rounded-full text-[#5C6460] hover:bg-[#FAF8F5]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {profileLoading && (
                <div className="py-6 text-center text-xs text-[#5C6460] flex items-center justify-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#D95A2B] animate-ping" />
                  <span>Loading profile...</span>
                </div>
              )}

              {profileError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-xl">
                  {profileError}
                </div>
              )}

              {profileData && !profileLoading && (
                <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-2xl p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#5C6460]">Full Name</span>
                    <span className="font-semibold text-[#1C2B29]">{profileData.full_name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#5C6460]">Email</span>
                    <span className="font-semibold text-[#1C2B29]">{profileData.email}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#5C6460]">Role</span>
                    <span className="font-semibold text-[#1C2B29] capitalize">{profileData.role}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#5C6460]">Factory</span>
                    <span className="font-semibold text-[#1C2B29]">{profileData.factory_name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#5C6460]">Branch</span>
                    <span className="font-semibold text-[#1C2B29]">{profileData.branch_name}</span>
                  </div>
                </div>
              )}

              {/* Collapsible Change Password Section */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowPasswordSection(!showPasswordSection)}
                  className="w-full bg-[#FAF8F5] border border-[#EDE8E0] rounded-2xl p-3 flex items-center justify-between text-xs font-bold text-[#1C2B29] hover:border-[#D95A2B] transition cursor-pointer"
                >
                  <span>Change Password</span>
                  <ChevronRight
                    className={`w-4 h-4 text-[#5C6460] transition-transform ${
                      showPasswordSection ? "rotate-90" : ""
                    }`}
                  />
                </button>

                {showPasswordSection && (
                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                        Current Password
                      </label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl px-3 py-2 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                        New Password
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl px-3 py-2 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-[#5C6460] block mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl px-3 py-2 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B]"
                      />
                    </div>

                    {passwordChangeError && (
                      <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-xl">
                        {passwordChangeError}
                      </div>
                    )}

                    {passwordChangeSuccess && (
                      <div className="bg-green-50 border border-green-200 text-green-700 text-xs p-2.5 rounded-xl flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
                        <span>Password updated successfully</span>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={passwordChangeLoading}
                      onClick={handleChangePassword}
                      className="w-full py-2.5 rounded-xl bg-[#D95A2B] hover:bg-[#C84E18] disabled:opacity-50 text-white text-xs font-bold transition shadow-xs"
                    >
                      {passwordChangeLoading ? "Updating..." : "Update Password"}
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-[#EDE8E0]">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Log out of IndustryMind?")) {
                      logout();
                      router.push("/login");
                    }
                  }}
                  title="Log out"
                  className="w-full py-2.5 rounded-xl bg-[#1C2B29] text-white text-xs font-semibold hover:bg-red-700 transition flex items-center justify-center gap-2"
                >
                  Log Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── MODAL 5: GUIDED TROUBLESHOOTING ──────────────────────── */}
        {showTroubleshoot && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) handleCloseTroubleshoot(); }}>
            <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-[#EDE8E0] space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-[#1C2B29]">Guided Troubleshooting</h3>
                <button type="button" onClick={handleCloseTroubleshoot} className="text-[#5C6460] hover:text-[#1C2B29]">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!tsSession && (
                <div className="space-y-3">
                  <p className="text-xs text-[#5C6460]">
                    Describe the symptom for {(machine || machines[0])?.name || "this machine"}, and I&apos;ll guide you through one step at a time.
                  </p>
                  <textarea
                    value={tsSymptom}
                    onChange={(e) => setTsSymptom(e.target.value)}
                    placeholder="e.g. Conveyor belt making a grinding noise"
                    rows={3}
                    className="w-full bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-2.5 text-xs text-[#1C2B29]"
                  />
                  {tsError && <p className="text-xs text-red-600">{tsError}</p>}
                  <button
                    type="button"
                    onClick={handleStartTroubleshooting}
                    disabled={tsLoading}
                    className="w-full bg-[#D95A2B] text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    {tsLoading ? "Starting..." : "Start Troubleshooting"}
                  </button>
                </div>
              )}

              {tsSession && (
                <div className="space-y-4">
                  {tsError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-2.5">
                      {tsError}
                    </div>
                  )}

                  {tsStatus === "escalated" ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                      <p className="text-xs font-semibold text-amber-800">Escalated to Supervisor</p>
                      <p className="text-xs text-amber-700">{tsEscalationReason || "Insufficient evidence to continue safely."}</p>
                    </div>
                  ) : tsCurrentStep ? (
                    <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-[#D95A2B]">
                          Step {tsCurrentStep.step_order}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-[#E5E0D8] text-[#5C6460]">
                          {tsCurrentStep.ledger_category.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-sm text-[#1C2B29] font-medium">{tsCurrentStep.step_text}</p>

                      {tsCurrentStep.citations.length > 0 && (
                        <div className="space-y-1 pt-1 border-t border-[#E5E0D8]">
                          <p className="text-[10px] font-semibold text-[#5C6460]">Supporting source:</p>
                          {tsCurrentStep.citations.map((c, i) => (
                            <p key={i} className="text-[11px] text-[#5C6460]">
                              {c.filename}{c.page_number ? ` — p.${c.page_number}` : ""}
                            </p>
                          ))}
                        </div>
                      )}

                      {tsCurrentStep.ledger_category === "unknown" && tsCurrentStep.citations.length === 0 && (
                        <p className="text-[11px] text-[#5C6460] italic">No supporting evidence found for this step.</p>
                      )}

                      {tsCurrentStep.needs_confirmation && (
                        <div className="space-y-2 pt-2">
                          <textarea
                            value={tsInputText}
                            onChange={(e) => setTsInputText(e.target.value)}
                            placeholder="Optional: add details before confirming"
                            rows={2}
                            className="w-full bg-white border border-[#E5E0D8] rounded-lg p-2 text-xs text-[#1C2B29]"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={tsTurnLoading}
                              onClick={() => handleTroubleshootingTurn("done")}
                              className="flex-1 bg-[#D95A2B] text-white rounded-lg py-2 text-xs font-semibold disabled:opacity-50"
                            >
                              Done
                            </button>
                            <button
                              type="button"
                              disabled={tsTurnLoading}
                              onClick={() => handleTroubleshootingTurn("not_done")}
                              className="flex-1 bg-white border border-[#E5E0D8] text-[#1C2B29] rounded-lg py-2 text-xs font-semibold disabled:opacity-50"
                            >
                              Not Done
                            </button>
                            <button
                              type="button"
                              disabled={tsTurnLoading}
                              onClick={() => handleTroubleshootingTurn("cant_check")}
                              className="flex-1 bg-white border border-[#E5E0D8] text-[#1C2B29] rounded-lg py-2 text-xs font-semibold disabled:opacity-50"
                            >
                              Can&apos;t Check
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-[#5C6460]">Loading next step...</p>
                  )}

                  {tsLedger.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-[#1C2B29]">Evidence Ledger</p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {tsLedger.map((step, i) => (
                          <div key={i} className="bg-white border border-[#EDE8E0] rounded-lg p-2.5 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-semibold text-[#1C2B29]">Step {step.step_order}</span>
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#FAF8F5] border border-[#E5E0D8] text-[#5C6460]">
                                {step.ledger_category.replace("_", " ")}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#5C6460]">{step.step_text}</p>
                            {step.citations.length > 0 && (
                              <p className="text-[10px] text-[#8A938F]">
                                Source: {step.citations.map((c) => c.filename).join(", ")}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleEndTroubleshooting}
                    className="w-full text-xs font-semibold text-[#5C6460] border border-[#E5E0D8] rounded-xl py-2 hover:bg-[#FAF8F5] transition"
                  >
                    End Session
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── MODAL 6: EXPERT TIPS ──────────────────────────────────── */}
        {showTips && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) handleCloseTips(); }}>
            <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-[#EDE8E0] space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-[#1C2B29]">
                  Expert Tips — {(machine || machines[0])?.name || "Machine"}
                </h3>
                <button type="button" onClick={handleCloseTips} className="text-[#5C6460] hover:text-[#1C2B29]">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {tipsError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-2.5">
                  {tipsError}
                </div>
              )}

              {tipsLoading ? (
                <p className="text-xs text-[#5C6460]">Loading tips...</p>
              ) : tipsList.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {tipsList.map((tip) => (
                    <div key={tip.id} className="bg-[#F3F9F1] border border-[#DCEEDF] rounded-xl p-3 space-y-1">
                      <p className="text-xs text-[#1C2B29]">{tip.tip_text}</p>
                      <p className="text-[10px] text-[#5C6460]">— {tip.submitted_by}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#5C6460]">No approved tips yet for this machine.</p>
              )}

              <div className="pt-3 border-t border-[#EDE8E0] space-y-2">
                <p className="text-xs font-bold text-[#1C2B29]">Share a tip</p>
                {tipSubmitSuccess && (
                  <p className="text-xs text-[#4C8C5C] bg-[#F3F9F1] rounded-lg p-2">
                    Submitted! A reviewer will check it before it appears here.
                  </p>
                )}
                <textarea
                  value={newTipText}
                  onChange={(e) => setNewTipText(e.target.value)}
                  placeholder="e.g. Loosen bolt X before step Y to avoid jamming"
                  rows={2}
                  className="w-full bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-2.5 text-xs text-[#1C2B29]"
                />
                <button
                  type="button"
                  onClick={handleSubmitTip}
                  disabled={tipSubmitting}
                  className="w-full bg-[#4C8C5C] text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {tipSubmitting ? "Submitting..." : "Submit Tip"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
