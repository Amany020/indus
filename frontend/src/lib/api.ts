/**
 * IndustryMind — API Client
 * Single module wrapping all backend calls.
 */

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

const TOKEN_KEY = "indus_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${TOKEN_KEY}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  // Note: Add 'Secure;' attribute once deployed over HTTPS in production.
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  document.cookie = `${TOKEN_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

interface FetchOptions extends RequestInit {
  role?: string;
}

async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { role = "worker", ...fetchOpts } = opts;
  const headers: Record<string, string> = {
    ...(fetchOpts.headers as Record<string, string>),
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    headers["x-role"] = role;
  }

  if (!(fetchOpts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  } else {
    delete headers["Content-Type"];
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...fetchOpts,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    const err = new Error(`API ${res.status}: ${text}`);
    (err as any).status = res.status;
    (err as any).responseBody = text;
    throw err;
  }

  return res.json();
}

// ─── Types ──────────────────────────────────────────────────────────────

export interface Machine {
  id: string;
  name: string;
  workcell: string;
  model_number?: string;
  qr_code_value?: string | null;
}

export interface StepItem {
  order: number;
  instruction: string;
  evidence_ids: string[];
}

export interface EvidenceMeta {
  evidence_id: string;
  chunk_id: string;
  document_id: string;
  filename: string;
  revision: string;
  page_number?: number;
  section_heading?: string;
  content_type: string;
  content_text: string;
  bbox?: Record<string, number>;
  risk_level: string;
  similarity: number;
}

export interface ExpertTip {
  id: string;
  tip_text: string;
  submitted_by: string;
  reviewed_at?: string;
}

export interface QueryResponse {
  query_id: string;
  query_text?: string;
  status: "supported" | "limited" | "escalate" | "restricted";
  summary: string;
  steps: StepItem[];
  warnings: string[];
  citations?: Array<{ evidence_id: string }>;
  evidence_pack: EvidenceMeta[];
  expert_knowledge: ExpertTip[];
  detected_language: string;
  latency_ms: number;
  demo_cached: boolean;
}

export interface TroubleshootingCitation {
  evidence_id: string;
  filename: string;
  page_number: number | null;
  content_text: string;
}

export interface TroubleshootingStep {
  step_order: number;
  step_text: string;
  ledger_category: "observed" | "source_backed" | "inferred" | "unknown" | "conflicting";
  citations: TroubleshootingCitation[];
  needs_confirmation: boolean;
}

export interface TroubleshootingSession {
  id: string;
  machine_id: string;
  status: string;
  symptom_text: string | null;
  created_at: string;
  evidence_ledger: TroubleshootingStep[];
}

export interface TroubleshootingTurnResponse {
  session_status: string;
  current_step: TroubleshootingStep | null;
  evidence_ledger: TroubleshootingStep[];
  escalation_reason: string | null;
}

export interface TranscriptResponse {
  transcript: string;
  detected_language: string;
  avg_logprob: number;
  no_speech_prob: number;
  needs_review: boolean;
}

export interface Tip {
  id: string;
  machine_id: string;
  submitted_by: string;
  tip_text: string;
  status: string;
  reviewer?: string;
  review_notes?: string;
  reviewed_at?: string;
  created_at: string;
}

export interface EscalationTicket {
  id: string;
  query_id: string;
  ai_drafted_brief?: string;
  expert_edited_brief?: string;
  priority: string;
  status: string;
  assigned_to?: string;
  resolution_notes?: string;
  created_at: string;
  updated_at: string;
  machine_name?: string | null;
  worker_name?: string | null;
}

export interface EscalationDetail extends EscalationTicket {
  question_text?: string | null;
  ai_response?: string | null;
  sources?: string[];
  image_url: string | null;
}

export interface AnalyticsSummary {
  total_queries: number;
  avg_latency_ms: number;
  volume_by_day: { date: string; count: number }[];
  status_breakdown: Record<string, number>;
  language_split: Record<string, number>;
  feedback_counts: Record<string, number>;
  tip_pipeline: Record<string, number>;
  escalated_count: number;
  resolution_breakdown: Record<string, number>;
  time_to_resolution_avg_hours?: number;
  resolution_sample_size: number;
  top_escalated_questions: { query_text: string; query_id: string }[];
  recurring_error_codes: { code: string; count: number }[];
  safety_gate_events_count: number;
}

export interface Factory {
  id: string;
  name: string;
  created_at?: string;
}

export interface Branch {
  id: string;
  factory_id: string;
  name: string;
  created_at?: string;
}

export interface AuthUserData {
  id: string;
  email: string;
  full_name: string;
  role: string;
  factory_id?: string;
  branch_id?: string;
}

export interface UserMeProfile {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  factory_id: string;
  branch_id: string | null;
  auth_mode: string;
}

export interface DocumentOut {
  id: string;
  filename: string;
  doc_type: string;
  revision: string;
  status: string;
  page_count: number;
  owner?: string;
  uploaded_at?: string;
  machine_id?: string | null;
  machine_name?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
}

export interface SopProposal {
  id: string;
  factory_id: string;
  machine_id?: string | null;
  document_id?: string | null;
  proposed_by: string;
  title: string;
  current_sop_step?: string | null;
  proposed_addition: string;
  safety_impact?: string | null;
  status: "pending" | "approved" | "rejected" | "merged";
  reviewed_by?: string | null;
  review_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SendImageQueryArgs {
  image: File | Blob;
  queryText?: string;
  machineId?: string;
  signal?: AbortSignal;
  query_text?: string;
  machine_id?: string;
  detected_language?: string;
  session_id?: string;
}

export async function sendImageQuery(
  args: SendImageQueryArgs
): Promise<QueryResponse> {
  const form = new FormData();
  if (args.image instanceof File) {
    form.append("image", args.image);
  } else {
    form.append("image", args.image, "capture.jpg");
  }

  const queryText = args.queryText ?? args.query_text;
  if (queryText && queryText.trim() !== "") {
    form.append("query_text", queryText);
  }
  const machineId = args.machineId ?? args.machine_id;
  if (machineId && machineId.trim() !== "") {
    form.append("machine_id", machineId);
  }
  if (args.detected_language) {
    form.append("detected_language", args.detected_language);
  }
  if (args.session_id) {
    form.append("session_id", args.session_id);
  }

  try {
    return await apiFetch<QueryResponse>("/query/image", {
      method: "POST",
      body: form,
      signal: args.signal,
    });
  } catch (err: any) {
    const status =
      err?.status ||
      (err?.message?.includes("413")
        ? 413
        : err?.message?.includes("415")
        ? 415
        : err?.message?.includes("422")
        ? 422
        : 0);
    const msg = err?.message || "";

    if (status === 413 || msg.includes("413") || msg.toLowerCase().includes("too large")) {
      throw new Error("Image too large, max 10 MB");
    }
    if (status === 415 || msg.includes("415") || msg.toLowerCase().includes("unsupported")) {
      throw new Error("Use a JPEG, PNG or WebP image");
    }
    if (status === 422 || msg.includes("422")) {
      const text = err?.responseBody || msg;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed.detail) && parsed.detail.length > 0) {
            const fields = parsed.detail
              .map((d: any) => d.loc?.slice(-1)[0] || d.msg)
              .filter(Boolean)
              .join(", ");
            if (fields) {
              throw new Error(`Invalid request parameters: missing or invalid ${fields}`);
            }
          }
          if (typeof parsed.detail === "string") {
            throw new Error(parsed.detail);
          }
        }
      } catch (parseErr: any) {
        if (parseErr.message?.startsWith("Invalid request parameters") || parseErr.message === text) {
          throw parseErr;
        }
      }
      throw new Error("Invalid request: unprocessable image or query data");
    }
    throw err;
  }
}

export class QrResolveError extends Error {
  status: number;
  code: "not_found" | "not_enabled" | "invalid_input" | "server_error";

  constructor(
    message: string,
    status: number,
    code: "not_found" | "not_enabled" | "invalid_input" | "server_error"
  ) {
    super(message);
    this.name = "QrResolveError";
    this.status = status;
    this.code = code;
  }
}

export async function resolveMachineByQr(code: string): Promise<Machine> {
  const cleanCode = (code || "").trim();
  if (!cleanCode) {
    throw new QrResolveError("QR code value is required", 400, "invalid_input");
  }
  try {
    return await apiFetch<Machine>("/machines/resolve-qr", {
      method: "POST",
      body: JSON.stringify({ qr_value: cleanCode }),
    });
  } catch (err: any) {
    const status =
      err?.status ||
      (err?.message?.includes("404")
        ? 404
        : err?.message?.includes("501")
        ? 501
        : 0);

    if (status === 404) {
      throw new QrResolveError(
        "QR not recognised for your factory",
        404,
        "not_found"
      );
    }
    if (status === 501) {
      throw new QrResolveError(
        "QR scanning is not enabled",
        501,
        "not_enabled"
      );
    }
    const msg = err?.message || "Failed to resolve machine QR code";
    throw new QrResolveError(msg, status || 500, "server_error");
  }
}

// ─── API Methods ────────────────────────────────────────────────────────

export const api = {
  getToken,
  setToken,
  clearToken,

  // Factories & Branches
  getFactories: () => apiFetch<Factory[]>("/factories/"),

  createFactory: (name: string) =>
    apiFetch<Factory>("/factories/", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  getBranches: (factoryId?: string) =>
    apiFetch<Branch[]>(`/branches/${factoryId ? `?factory_id=${factoryId}` : ""}`),

  createBranch: (name: string, factoryId: string) =>
    apiFetch<Branch>("/branches/", {
      method: "POST",
      body: JSON.stringify({ name, factory_id: factoryId }),
    }),

  deleteBranch: (branchId: string) =>
    apiFetch<{ status: string; message: string }>(`/branches/${branchId}`, {
      method: "DELETE",
    }),


  // Auth
  registerFactory: (body: {
    email: string;
    password: string;
    full_name: string;
    factory_name: string;
  }) =>
    apiFetch<{
      id: string;
      email: string;
      full_name: string;
      factory_id: string;
      factory_name: string;
      role: string;
    }>("/auth/register-factory", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  joinFactory: (body: {
    email: string;
    password: string;
    full_name: string;
    factory_id: string;
    branch_id?: string;
  }) =>
    apiFetch<{
      id: string;
      email: string;
      full_name: string;
      factory_id: string;
      branch_id: string | null;
      role: string;
    }>("/auth/join-factory", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  signup: (body: {
    email: string;
    password: string;
    name: string;
    role?: string;
    factory_id?: string;
    branch_id?: string;
  }) =>
    apiFetch<AuthUserData>("/auth/join-factory", {
      method: "POST",
      body: JSON.stringify({
        email: body.email,
        password: body.password,
        full_name: body.name,
        factory_id: body.factory_id || "",
        branch_id: body.branch_id,
      }),
    }),

  login: (body: { email: string; password: string }) =>
    apiFetch<{ access_token: string; user: AuthUserData }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getMe: () => apiFetch<UserMeProfile>("/me"),

  getUsers: () => apiFetch<AuthUserData[]>("/auth/users"),

  promoteToReviewer: (userId: string) =>
    apiFetch<{
      user_id: string;
      full_name: string | null;
      role: string;
      factory_id: string;
      branch_id: string | null;
    }>(`/auth/users/${userId}/role`, {
      method: "PATCH",
      role: "admin",
      body: JSON.stringify({ role: "supervisor" }),
    }),

  changePassword: (current_password: string, new_password: string) =>
    apiFetch<{ status: string; message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),

  // Machines
  getMachines: (factoryId?: string) =>
    apiFetch<Machine[]>(`/machines/${factoryId ? `?factory_id=${factoryId}` : ""}`),

  getMachine: (id: string) => apiFetch<Machine>(`/machines/${id}`),

  createMachine: (body: { name: string; workcell: string; model_number?: string }) =>
    apiFetch<Machine>("/machines/", {
      method: "POST",
      body: JSON.stringify(body),
      role: "admin",
    }),

  hasApprovedDocs: (id: string) =>
    apiFetch<{ has_docs: boolean }>(`/machines/${id}/has-approved-docs`),

  resolveMachineByQr: (code: string) => resolveMachineByQr(code),

  // Query
  sendQuery: (body: {
    machine_id: string;
    query_text: string;
    input_mode?: string;
    detected_language?: string;
    session_id?: string;
    raw_transcript?: string;
    transcript_confirmed?: boolean;
  }) =>
    apiFetch<QueryResponse>("/query/", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  sendImageQuery: (args: SendImageQueryArgs) => sendImageQuery(args),

  getQueryHistory: (sessionId: string, machineId?: string) =>
    apiFetch<any[]>(
      `/query/history?session_id=${encodeURIComponent(sessionId)}${
        machineId ? `&machine_id=${encodeURIComponent(machineId)}` : ""
      }`
    ),

  submitFeedback: (
    queryId: string,
    body: { resolution_status?: string; feedback?: string }
  ) =>
    apiFetch<{ status: string }>(`/query/${queryId}/feedback`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Voice
  transcribe: async (audioBlob: Blob): Promise<TranscriptResponse> => {
    const form = new FormData();
    form.append("file", audioBlob, "recording.webm");
    return apiFetch<TranscriptResponse>("/stt", {
      method: "POST",
      body: form,
    });
  },

  textToSpeech: (text: string, language: string = "en") =>
    apiFetch<{ provider: string; text: string; language: string; audio_url: string | null; message?: string; error?: string }>("/voice/tts", {
      method: "POST",
      body: JSON.stringify({ text, language }),
    }),

  // Documents
  getDocuments: (machineId?: string) =>
    apiFetch<DocumentOut[]>(
      `/documents/${machineId ? `?machine_id=${machineId}` : ""}`
    ),

  uploadDocument: async (
    file: File,
    machineId: string,
    docType: string = "manual"
  ) => {
    const form = new FormData();
    form.append("file", file);
    form.append("machine_id", machineId);
    form.append("doc_type", docType);
    return apiFetch<{ doc_id: string; status: string }>("/documents/", {
      method: "POST",
      body: form,
      role: "admin",
    });
  },

  deleteDocument: (docId: string) =>
    apiFetch<{ status: string; doc_id: string }>(`/documents/${docId}`, {
      method: "DELETE",
      role: "admin",
    }),

  approveDocument: (docId: string) =>
    apiFetch<{ status: string }>(`/documents/${docId}/approve`, {
      method: "PATCH",
      role: "admin",
    }),

  rejectDocument: (docId: string) =>
    apiFetch<{ status: string }>(`/documents/${docId}/reject`, {
      method: "PATCH",
      role: "reviewer",
    }),

  getPageUrl: (docId: string, pageNum: number) =>
    apiFetch<{ url: string }>(`/documents/${docId}/page-url/${pageNum}`),

  // Tips
  getTips: (machineId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (machineId) params.set("machine_id", machineId);
    if (status) params.set("status", status);
    return apiFetch<Tip[]>(`/tips/?${params}`);
  },

  submitTip: (body: {
    machine_id: string;
    submitted_by: string;
    tip_text: string;
  }) =>
    apiFetch<Tip>("/tips/", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  reviewTip: (
    tipId: string,
    body: { status: string; reviewer: string; review_notes?: string }
  ) =>
    apiFetch<{ status: string }>(`/tips/${tipId}/review`, {
      method: "PATCH",
      body: JSON.stringify(body),
      role: "reviewer",
    }),

  // Escalations
  getEscalations: (status?: string) =>
    apiFetch<EscalationTicket[]>(
      `/escalations/${status ? `?status=${status}` : ""}`,
      { role: "reviewer" }
    ),

  getEscalation: (ticketId: string) =>
    apiFetch<EscalationDetail>(`/escalations/${ticketId}`, {
      role: "reviewer",
    }),

  createEscalation: (params: {
    query_id: string;
    ai_drafted_brief?: string;
    priority?: string;
  }) => {
    const searchParams = new URLSearchParams({ query_id: params.query_id });
    if (params.ai_drafted_brief) {
      searchParams.set("ai_drafted_brief", params.ai_drafted_brief);
    }
    if (params.priority) {
      searchParams.set("priority", params.priority);
    }
    return apiFetch<EscalationTicket>(`/escalations/?${searchParams.toString()}`, {
      method: "POST",
      role: "worker",
    });
  },

  uploadEscalationImage: (ticketId: string, image: Blob) => {
    const form = new FormData();
    form.append("image", image, "escalation-photo.jpg");
    return apiFetch<{ status: string; image_storage_key: string }>(
      `/escalations/${ticketId}/image`,
      {
        method: "POST",
        body: form,
        role: "worker",
      }
    );
  },

  updateEscalation: (
    ticketId: string,
    body: Record<string, string | undefined>
  ) =>
    apiFetch<{ status: string }>(`/escalations/${ticketId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      role: "reviewer",
    }),

  // Analytics
  getAnalytics: (machineId?: string) =>
    apiFetch<AnalyticsSummary>(
      `/analytics/summary${machineId ? `?machine_id=${machineId}` : ""}`,
      { role: "manager" }
    ),

  // Troubleshooting
  createTroubleshootingSession: (machine_id: string, symptom_text: string) =>
    apiFetch<TroubleshootingSession>("/sessions/", {
      method: "POST",
      body: JSON.stringify({ machine_id, symptom_text }),
    }),

  getTroubleshootingSession: (sessionId: string) =>
    apiFetch<TroubleshootingSession>(`/sessions/${sessionId}`),

  submitTroubleshootingTurn: (
    sessionId: string,
    input_text?: string,
    confirmation?: "done" | "not_done" | "cant_check"
  ) =>
    apiFetch<TroubleshootingTurnResponse>(`/sessions/${sessionId}/turn`, {
      method: "POST",
      body: JSON.stringify({ input_text, confirmation }),
    }),

  // SOP Proposals
  getProposals: (status?: string) =>
    apiFetch<{ proposals: SopProposal[]; total: number }>(
      `/sop-proposals${status ? `?status=${status}` : ""}`,
      { role: "reviewer" }
    ),

  reviewProposal: (
    proposalId: string,
    body: { status: string; review_notes?: string }
  ) =>
    apiFetch<SopProposal>(`/sop-proposals/${proposalId}/review`, {
      method: "PATCH",
      role: "reviewer",
      body: JSON.stringify(body),
    }),

  // Health
  health: () => apiFetch<{ status: string; version: string }>("/health"),
};


