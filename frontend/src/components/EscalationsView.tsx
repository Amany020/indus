"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  FileText,
  CheckCircle,
  UserPlus,
  Send,
  Paperclip,
  Check,
  Clock,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import { api, type EscalationTicket } from "@/lib/api";

export default function EscalationsView() {
  const [tickets, setTickets] = useState<EscalationTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<EscalationTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [replyText, setReplyText] = useState("");

  const fetchTickets = () => {
    setLoading(true);
    api
      .getEscalations(filter || undefined)
      .then((data) => {
        setTickets(data);
        if (data.length > 0 && !selectedTicket) {
          setSelectedTicket(data[0]);
        }
      })
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTickets();
  }, [filter]);

  const handleResolve = async (id: string) => {
    try {
      await api.updateEscalation(id, { status: "resolved" });
      fetchTickets();
    } catch {
      // silent
    }
  };

  const activeTicket = selectedTicket as (EscalationTicket & { machine_name?: string; symptom_summary?: string }) | null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "360px 1fr",
        height: "100vh",
        background: "var(--color-bg-base)",
        overflow: "hidden",
      }}
    >
      {/* Left List of Escalations */}
      <div
        style={{
          borderRight: "1px solid var(--color-border)",
          background: "#FFFFFF",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--color-ink)" }}>
              Escalations
            </h2>
            <span
              style={{
                background: "#FEE2E2",
                color: "#DC2626",
                fontSize: 12,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "9999px",
              }}
            >
              {tickets.length} Open
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
            Expert review queue for safety &amp; ungrounded issues
          </p>

          {/* Filter Pills */}
          <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
            {["", "pending", "reviewed", "resolved"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: "var(--radius-sm)",
                  border: filter === f ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
                  background: filter === f ? "var(--color-primary-light)" : "transparent",
                  color: filter === f ? "var(--color-primary)" : "var(--color-text-secondary)",
                  cursor: "pointer",
                }}
              >
                {f ? f.charAt(0).toUpperCase() + f.slice(1) : "All"}
              </button>
            ))}
          </div>
        </div>

        {/* Tickets Scroll List */}
        <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
          {tickets.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                color: "var(--color-text-muted)",
                fontSize: 13,
              }}
            >
              No escalation tickets in this queue.
            </div>
          ) : (
            tickets.map((t) => {
              const isSelected = selectedTicket?.id === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTicket(t)}
                  style={{
                    padding: 14,
                    borderRadius: "var(--radius-md)",
                    background: isSelected ? "var(--color-primary-light)" : "#FFFFFF",
                    border: isSelected ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
                    marginBottom: 8,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--color-ink)" }}>
                      #{t.id.slice(0, 8)}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: t.priority === "high" ? "#DC2626" : "#D97706",
                        background: t.priority === "high" ? "#FEE2E2" : "#FEF3C7",
                        padding: "2px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      {t.priority.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)", marginTop: 6 }}>
                    {(t as any).symptom_summary || t.ai_drafted_brief || "Mechanical anomaly flagged"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>
                    {(t as any).machine_name || "CNC-2100"} · {t.status}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Ticket Thread View */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          background: "var(--color-bg-base)",
        }}
      >
        {!activeTicket ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 32,
              textAlign: "center",
              color: "var(--color-text-muted)",
            }}
          >
            <AlertTriangle size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-ink)", marginBottom: 4 }}>
              No Escalation Selected
            </div>
            <div style={{ fontSize: 13, maxWidth: 340 }}>
              {tickets.length === 0
                ? "All factory alerts and safety escalation queues are clear."
                : "Select an escalation ticket from the queue on the left to review details and take action."}
            </div>
          </div>
        ) : (
          <>
            {/* Ticket Header */}
            <div
              style={{
                padding: "20px 32px",
                background: "#FFFFFF",
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-ink)" }}>
                    Escalation #{activeTicket.id.slice(0, 12)}
                  </h2>
                  <span
                    style={{
                      background: activeTicket.priority === "high" ? "#FEE2E2" : "#FEF3C7",
                      color: activeTicket.priority === "high" ? "#DC2626" : "#D97706",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: "9999px",
                      textTransform: "capitalize",
                    }}
                  >
                    ● {activeTicket.priority} Priority
                  </span>
                  <span
                    style={{
                      background: activeTicket.status === "resolved" ? "#DCFCE7" : "#FEF3C7",
                      color: activeTicket.status === "resolved" ? "#166534" : "#D97706",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: "9999px",
                      textTransform: "capitalize",
                    }}
                  >
                    ● {activeTicket.status}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
                  <strong>{(activeTicket as any).machine_name || "Factory Unit"}</strong> · Created {new Date(activeTicket.created_at).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Message Thread */}
            <div
              style={{
                flex: 1,
                overflow: "auto",
                padding: "28px 32px",
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              {/* Operator Issue Description */}
              <div style={{ display: "flex", gap: 14 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    background: "#2563EB",
                    color: "#FFFFFF",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  OP
                </div>
                <div style={{ flex: 1, maxWidth: 640 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-ink)" }}>
                      Operator AI Brief
                    </span>
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                      {new Date(activeTicket.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div
                    className="bracket-card"
                    style={{
                      padding: "16px 20px",
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: "var(--color-ink)",
                      background: "#FFFFFF",
                    }}
                  >
                    {activeTicket.ai_drafted_brief || "Mechanical or safety escalation flagged by operator."}
                  </div>
                </div>
              </div>

              {/* Expert Resolution / Notes */}
              {(activeTicket.expert_edited_brief || (activeTicket as any).resolution_notes) && (
                <div style={{ display: "flex", gap: 14 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      background: "#059669",
                      color: "#FFFFFF",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    EX
                  </div>
                  <div style={{ flex: 1, maxWidth: 640 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-ink)" }}>
                        {activeTicket.assigned_to || "Reviewing Expert"}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          background: "var(--color-primary-light)",
                          color: "var(--color-primary)",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          fontWeight: 600,
                        }}
                      >
                        Expert Feedback
                      </span>
                    </div>
                    <div
                      className="bracket-card"
                      style={{
                        padding: "16px 20px",
                        fontSize: 14,
                        lineHeight: 1.6,
                        color: "var(--color-ink)",
                        background: "#FFFFFF",
                      }}
                    >
                      {activeTicket.expert_edited_brief || (activeTicket as any).resolution_notes}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input Bar & Actions */}
            <div
              style={{
                padding: "16px 32px",
                background: "#FFFFFF",
                borderTop: "1px solid var(--color-border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  marginBottom: 14,
                }}
              >
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type an engineer response or observation..."
                  className="input-field"
                  style={{ height: 44, flex: 1 }}
                />
                <button
                  className="btn-primary"
                  onClick={async () => {
                    if (!replyText.trim() || !activeTicket) return;
                    try {
                      await api.updateEscalation(activeTicket.id, {
                        expert_edited_brief: replyText.trim(),
                        status: "reviewed",
                      });
                      setReplyText("");
                      fetchTickets();
                    } catch {
                      // silent
                    }
                  }}
                  style={{
                    width: 44,
                    height: 44,
                    padding: 0,
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <Send size={18} />
                </button>
              </div>

              {/* Action Row */}
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                {activeTicket.status !== "resolved" && (
                  <button
                    onClick={() => handleResolve(activeTicket.id)}
                    style={{
                      background: "#059669",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: "var(--radius-md)",
                      padding: "8px 20px",
                      fontWeight: 600,
                      fontSize: 13,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                      boxShadow: "0 2px 6px rgba(5, 150, 105, 0.25)",
                    }}
                  >
                    <Check size={16} strokeWidth={2.5} />
                    <span>Resolve Ticket</span>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
