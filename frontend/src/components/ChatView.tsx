"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Clock,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronDown,
  Lightbulb,
  Eye,
  Activity,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { api, type QueryResponse, type EvidenceMeta } from "@/lib/api";
import { useApp } from "@/lib/context";
import EvidenceModal from "./EvidenceModal";
import VoiceButton from "./VoiceButton";

/* ─── Status Badge (Calibrated Telemetry Pill) ─────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    supported: { label: "SUPPORTED", cls: "status-supported" },
    limited: { label: "LIMITED", cls: "status-limited" },
    escalate: { label: "ESCALATE", cls: "status-escalate" },
    restricted: { label: "RESTRICTED", cls: "status-restricted" },
  };
  const c = config[status] || config.limited;
  return (
    <span
      className={c.cls}
      style={{
        fontSize: 9,
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        padding: "2px 6px",
        borderRadius: "2px",
        letterSpacing: "0.06em",
        display: "inline-block",
        lineHeight: 1.2,
      }}
    >
      {c.label}
    </span>
  );
}

/* ─── Single Log Entry (Instrument Response Panel) ─────────────────────── */

function LogEntry({ response, index }: { response: QueryResponse; index: number }) {
  const [expanded, setExpanded] = useState(true);
  const [evidenceModal, setEvidenceModal] = useState<EvidenceMeta | null>(null);
  const [showFeedback, setShowFeedback] = useState(true);

  const handleFeedback = async (resolution: string) => {
    try {
      await api.submitFeedback(response.query_id, {
        resolution_status: resolution,
      });
    } catch {
      // silent
    }
    setShowFeedback(false);
  };

  const isFocal = index === 0; // Top/active item gets focal highlight

  return (
    <motion.div
      className="log-entry"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        display: "flex",
        gap: 16,
        padding: "16px 0",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {/* Timestamp & Telemetry Rail */}
      <div
        className="log-timestamp"
        style={{
          width: 90,
          flexShrink: 0,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          borderRight: "1px solid rgba(207,201,188,0.4)",
          paddingRight: 10,
        }}
      >
        <div style={{ color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <Clock size={10} strokeWidth={1.5} />
          <span>{new Date().toLocaleTimeString("en-IN", { hour12: false })}</span>
        </div>

        <div style={{ marginTop: 4 }}>
          <StatusBadge status={response.status} />
        </div>

        <div
          style={{
            marginTop: 6,
            fontSize: 9,
            color: "var(--color-text-secondary)",
            letterSpacing: "0.02em",
          }}
        >
          {response.latency_ms}ms · Q#{response.query_id.slice(0, 4)}
        </div>

        {response.demo_cached && (
          <div
            style={{
              fontSize: 8,
              fontFamily: "var(--font-mono)",
              color: "var(--color-amber)",
              fontWeight: 700,
              marginTop: 4,
              letterSpacing: "0.05em",
            }}
          >
            [CACHED]
          </div>
        )}
      </div>

      {/* Main Content & Procedure Block */}
      <div
        className="log-content"
        style={{
          flex: 1,
        }}
      >
        <div
          className={`bracket-card ${isFocal ? "bracket-card--active" : ""}`}
          style={{
            padding: "16px 20px",
            background: "var(--color-surface)",
          }}
        >
          {/* Worker Query Banner (Prominently displays worker's question) */}
          {response.query_text && (
            <div
              style={{
                background: "var(--color-primary-light)",
                border: "1px solid rgba(27,77,68,0.25)",
                borderRadius: "6px",
                padding: "8px 12px",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  color: "var(--color-primary)",
                  padding: "2px 6px",
                  background: "#FFFFFF",
                  borderRadius: "3px",
                  border: "1px solid var(--color-primary)",
                }}
              >
                OPERATOR QUERY
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)" }}>
                {response.query_text}
              </span>
            </div>
          )}

          {/* Warnings Bar */}
          {response.warnings.length > 0 && (
            <div
              style={{
                background: "var(--color-amber-light)",
                border: "1px solid var(--color-amber)",
                borderRadius: "2px",
                padding: "8px 12px",
                marginBottom: 14,
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <AlertTriangle
                size={14}
                strokeWidth={1.5}
                color="var(--color-amber)"
                style={{ flexShrink: 0, marginTop: 2 }}
              />
              <div style={{ fontSize: 12, color: "var(--color-amber)", lineHeight: 1.4 }}>
                {response.warnings.map((w, i) => (
                  <div key={i} style={{ fontWeight: 500 }}>{w}</div>
                ))}
              </div>
            </div>
          )}

          {/* Primary Answer Summary (Clear Focal Text) */}
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--color-ink)",
              fontWeight: 500,
              marginBottom: response.steps.length > 0 ? 14 : 8,
            }}
          >
            {response.summary}
          </div>

          {/* Procedural Steps Block */}
          {response.steps.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                  paddingBottom: 4,
                  borderBottom: "1px dashed var(--color-border)",
                }}
              >
                <button
                  onClick={() => setExpanded(!expanded)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: "var(--color-primary)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <ChevronDown
                    size={12}
                    strokeWidth={1.5}
                    style={{
                      transform: expanded ? "rotate(0)" : "rotate(-90deg)",
                      transition: "transform 0.15s ease",
                    }}
                  />
                  <span>PROCEDURE DISPATCH ({response.steps.length} STEPS)</span>
                </button>
              </div>

              <AnimatePresence>
                {expanded && (
                  <motion.ol
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{
                      listStyle: "none",
                      paddingLeft: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {response.steps.map((step) => (
                      <motion.li
                        key={step.order}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: step.order * 0.04 }}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                          fontSize: 13,
                          lineHeight: 1.5,
                          padding: "6px 8px",
                          background: "rgba(246, 243, 238, 0.4)",
                          borderRadius: "2px",
                          border: "1px solid rgba(226, 220, 206, 0.6)",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "var(--color-primary)",
                            background: "var(--color-primary-light)",
                            padding: "2px 6px",
                            borderRadius: "2px",
                            lineHeight: 1,
                            flexShrink: 0,
                            marginTop: 2,
                          }}
                        >
                          {String(step.order).padStart(2, "0")}
                        </span>
                        <div style={{ flex: 1, color: "var(--color-ink)" }}>
                          <span>{step.instruction}</span>
                          {step.evidence_ids.length > 0 && (
                            <span
                              style={{
                                fontSize: 10,
                                fontFamily: "var(--font-mono)",
                                color: "var(--color-text-muted)",
                                marginLeft: 8,
                              }}
                            >
                              [Ref: {step.evidence_ids.join(", ")}]
                            </span>
                          )}
                        </div>
                      </motion.li>
                    ))}
                  </motion.ol>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Evidence Pack (Hardware Specification Chips) */}
          {response.evidence_pack.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 12,
                paddingTop: 10,
                borderTop: "1px solid var(--color-border)",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-muted)",
                  letterSpacing: "0.05em",
                  alignSelf: "center",
                }}
              >
                APPROVED EVIDENCE:
              </span>
              {response.evidence_pack.slice(0, 5).map((ev) => (
                <button
                  key={ev.evidence_id}
                  onClick={() => setEvidenceModal(ev)}
                  className="citation-tag"
                  title={`Inspect manual source page ${ev.page_number}`}
                >
                  <FileText size={11} strokeWidth={1.5} />
                  <span>Manual §{ev.section_heading ? ev.section_heading.slice(0, 15) : "SOP"} p.{ev.page_number}</span>
                  <Eye size={10} strokeWidth={1.5} />
                </button>
              ))}
            </div>
          )}

          {/* Expert Tips (Channel Separation) */}
          {response.expert_knowledge.length > 0 && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                background: "var(--color-amber-light)",
                border: "1px dashed var(--color-amber)",
                borderRadius: "2px",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  color: "var(--color-amber)",
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  letterSpacing: "0.04em",
                }}
              >
                <Lightbulb size={12} strokeWidth={1.5} />
                <span>EXPERT FIELD OBSERVATION (PEER-REVIEWED)</span>
              </div>
              {response.expert_knowledge.map((tip) => (
                <div
                  key={tip.id}
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  &ldquo;{tip.tip_text}&rdquo;
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-text-muted)",
                      marginLeft: 6,
                    }}
                  >
                    — Eng. {tip.submitted_by}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Feedback Controls */}
          {showFeedback && response.status !== "restricted" && (
            <div
              style={{
                marginTop: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 10,
                borderTop: "1px solid rgba(226, 220, 206, 0.8)",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-muted)",
              }}
            >
              <span>OUTCOME CONFIRMATION:</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => handleFeedback("resolved")}
                  className="btn-secondary"
                  style={{ padding: "4px 10px", fontSize: 11 }}
                >
                  <CheckCircle size={12} strokeWidth={1.5} color="var(--color-sage)" /> Resolved
                </button>
                <button
                  onClick={() => handleFeedback("not_resolved")}
                  className="btn-secondary"
                  style={{ padding: "4px 10px", fontSize: 11 }}
                >
                  <XCircle size={12} strokeWidth={1.5} color="var(--color-terracotta)" /> Unresolved
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Evidence modal */}
      {evidenceModal && (
        <EvidenceModal
          evidence={evidenceModal}
          onClose={() => setEvidenceModal(null)}
        />
      )}
    </motion.div>
  );
}

/* ─── Chat View / Instrument Console ──────────────────────────────────── */

export default function ChatView() {
  const { machine, history, addToHistory, clearHistory, sessionId } = useApp();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Isolate and load previous query history for this worker session only
  React.useEffect(() => {
    if (!sessionId) return;
    api.getQueryHistory(sessionId, machine?.id)
      .then((items) => {
        if (items && items.length > 0) {
          clearHistory();
          items.forEach((item) => {
            addToHistory({
              query_id: item.id,
              query_text: item.query_text,
              status: item.status || "supported",
              summary: item.response_summary || "",
              steps: item.steps || [],
              warnings: item.warnings || [],
              evidence_pack: item.evidence_pack || [],
              expert_knowledge: item.expert_tips || [],
              detected_language: item.detected_language || "en",
              latency_ms: item.latency_ms || 0,
              demo_cached: false,
            });
          });
        }
      })
      .catch((err) => console.error("Error loading isolated query history:", err));
  }, [sessionId, machine?.id]);

  const handleSubmit = async (queryText?: string) => {
    const text = queryText || input.trim();
    if (!text || !machine || loading) return;

    setInput("");
    setLoading(true);

    try {
      const res = await api.sendQuery({
        machine_id: machine.id,
        query_text: text,
        session_id: sessionId,
        detected_language: /[\u0900-\u097F]/.test(text) ? "hi" : "en",
      });
      addToHistory({ ...res, query_text: text });
      setTimeout(
        () => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
        100
      );
    } catch (err) {
      addToHistory({
        query_id: "error",
        status: "escalate",
        summary: `Connection error: ${err instanceof Error ? err.message : "Unknown"}. Verify backend server status.`,
        steps: [],
        warnings: [],
        evidence_pack: [],
        expert_knowledge: [],
        detected_language: "en",
        latency_ms: 0,
        demo_cached: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTranscript = (transcript: string) => {
    setInput(transcript);
  };

  if (!machine) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background: "var(--color-bg-base)",
      }}
    >
      {/* Precision Instrument Deck Header */}
      <div
        style={{
          padding: "10px 24px",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              padding: "4px 8px",
              background: "var(--color-primary-light)",
              border: "1px solid var(--color-primary)",
              borderRadius: "2px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--color-primary)",
            }}
          >
            {machine.model_number || "EQUIP-01"}
          </div>
          <div>
            <h2
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--color-ink)",
                lineHeight: 1.2,
              }}
            >
              {machine.name}
            </h2>
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-muted)",
              }}
            >
              CELL: {machine.workcell} · NODE: INDUS-01 · GATE: PASS
            </div>
          </div>
        </div>

        {/* Live Status Telemetry */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="telemetry-chip">
            <ShieldCheck size={12} strokeWidth={1.5} color="var(--color-sage)" />
            <span>DETERMINISTIC GATE ACTIVE</span>
          </div>
          <div className="telemetry-chip">
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--color-sage)",
              }}
            />
            <span style={{ color: "var(--color-sage)", fontWeight: 700 }}>SYNCHRONIZED</span>
          </div>
        </div>
      </div>

      {/* Main Log Stream (Dispatch Feed) */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "16px 28px",
        }}
      >
        {history.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: "24px 0 40px",
              maxWidth: 720,
              margin: "0 auto",
            }}
          >
            {/* Machine Header Card */}
            <div
              className="bracket-card"
              style={{
                padding: "20px 24px",
                marginBottom: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#FFFFFF",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--color-ink)" }}>
                    {machine.name}
                  </h3>
                  <span className="status-online" style={{ fontSize: 11 }}>
                    ● Online
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
                  Haas VF-2 Vertical Machining Center · {machine.workcell}
                </div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-muted)",
                  textAlign: "right",
                }}
              >
                <div>REV 3.2 APPROVED</div>
                <div style={{ color: "var(--color-sage)", fontWeight: 600 }}>LOTO VERIFIED</div>
              </div>
            </div>

            {/* 4 Quick Action Cards (Screen 4 Reference) */}
            <div style={{ marginBottom: 28 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--color-ink)",
                  marginBottom: 14,
                  letterSpacing: "-0.01em",
                }}
              >
                Quick Actions
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 14,
                }}
              >
                {/* 1. Scan Machine */}
                <div
                  onClick={() => handleSubmit("Inspect optical encoder alignment and calibration")}
                  style={{
                    padding: "18px 20px",
                    borderRadius: "var(--radius-lg)",
                    background: "#ECFDF5",
                    border: "1px solid #A7F3D0",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "10px",
                      background: "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 6px rgba(16, 185, 129, 0.15)",
                    }}
                  >
                    <Activity size={22} color="#059669" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#065F46" }}>
                      Scan Machine
                    </div>
                    <div style={{ fontSize: 12, color: "#047857" }}>
                      QR Code / Camera Inspect
                    </div>
                  </div>
                </div>

                {/* 2. Voice Input */}
                <div
                  onClick={() => handleSubmit("How to replace the coolant pump filter?")}
                  style={{
                    padding: "18px 20px",
                    borderRadius: "var(--radius-lg)",
                    background: "#FEF2F2",
                    border: "1px solid #FECACA",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "10px",
                      background: "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 6px rgba(239, 68, 68, 0.15)",
                    }}
                  >
                    <Send size={20} color="#DC2626" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#991B1B" }}>
                      Coolant Procedure
                    </div>
                    <div style={{ fontSize: 12, color: "#B91C1C" }}>
                      Filter Replacement SOP
                    </div>
                  </div>
                </div>

                {/* 3. Browse SOPs */}
                <div
                  onClick={() => handleSubmit("Show lubrication schedule and approved oil grades")}
                  style={{
                    padding: "18px 20px",
                    borderRadius: "var(--radius-lg)",
                    background: "#EFF6FF",
                    border: "1px solid #BFDBFE",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "10px",
                      background: "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 6px rgba(37, 99, 235, 0.15)",
                    }}
                  >
                    <FileText size={22} color="#2563EB" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1E40AF" }}>
                      Browse SOPs
                    </div>
                    <div style={{ fontSize: 12, color: "#1D4ED8" }}>
                      Manuals &amp; Lubrication
                    </div>
                  </div>
                </div>

                {/* 4. Ask Expert */}
                <div
                  onClick={() => handleSubmit("What does error code E-401 mean and how to fix it?")}
                  style={{
                    padding: "18px 20px",
                    borderRadius: "var(--radius-lg)",
                    background: "#F5F3FF",
                    border: "1px solid #DDD6FE",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "10px",
                      background: "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 6px rgba(124, 58, 237, 0.15)",
                    }}
                  >
                    <Lightbulb size={22} color="#7C3AED" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#5B21B6" }}>
                      Error Code Guide
                    </div>
                    <div style={{ fontSize: 12, color: "#6D28D9" }}>
                      Resolve Alarm E-401
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {history.map((res, i) => (
          <LogEntry key={`${res.query_id}-${i}`} response={res} index={i} />
        ))}

        {loading && (
          <motion.div
            className="log-entry"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: "flex", gap: 16, padding: "16px 0" }}
          >
            <div
              style={{
                width: 90,
                flexShrink: 0,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--color-text-muted)",
              }}
            >
              <Activity size={12} strokeWidth={1.5} />
            </div>
            <div
              style={{
                flex: 1,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--color-text-secondary)",
                padding: "12px 16px",
                background: "var(--color-surface)",
                border: "1px dashed var(--color-border)",
                borderRadius: "2px",
              }}
            >
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
              >
                // RETRIEVING APPROVED MANUAL EVIDENCE & VALIDATING SAFETY GATE...
              </motion.span>
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Command Prompt Input Deck */}
      <div
        style={{
          padding: "12px 24px",
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          flexShrink: 0,
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <VoiceButton onTranscript={handleTranscript} />
          <div
            style={{
              flex: 1,
              position: "relative",
              display: "flex",
              alignItems: "center",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 14,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--color-text-muted)",
                pointerEvents: "none",
                fontWeight: 600,
              }}
            >
              SYS://CMD &gt;
            </span>
            <input
              className="input-field"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter technical query or error code (e.g., E-401, belt slipping)..."
              disabled={loading}
              style={{
                paddingLeft: 105,
                fontSize: 13,
                height: 48,
              }}
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !input.trim()}
            style={{
              height: 48,
              padding: "0 22px",
              opacity: loading || !input.trim() ? 0.5 : 1,
            }}
          >
            <Send size={15} strokeWidth={1.5} />
            <span style={{ fontSize: 13, fontFamily: "var(--font-mono)" }}>EXEC</span>
          </button>
        </form>
      </div>
    </div>
  );
}
