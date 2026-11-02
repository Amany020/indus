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

  const activeTicket: EscalationTicket & { machine_name?: string; symptom_summary?: string } = (selectedTicket as any) || {
    id: "ESC-2024-017",
    query_id: "q-001",
    machine_name: "CNC-2100",
    symptom_summary: "Spindle alarm not resetting",
    ai_drafted_brief: "Check the drive parameters and ensure spindle load is within range. Refer to attached document.",
    expert_edited_brief: undefined,
    priority: "high",
    status: "pending",
    assigned_to: "Ramesh K.",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

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
              {tickets.length || 3} Open
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
              onClick={() => setSelectedTicket(activeTicket as any)}
              style={{
                padding: 16,
                borderRadius: "var(--radius-md)",
                background: "var(--color-bg-base)",
                border: "1px solid var(--color-border)",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-ink)" }}>
                  #ESC-2024-017
                </span>
                <span className="status-escalate" style={{ fontSize: 10 }}>High Priority</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)", marginTop: 6 }}>
                Spindle alarm not resetting
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>
                CNC-2100 · 2 hours ago
              </div>
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

      {/* Right Ticket Thread View (Screen 10 Reference) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          background: "var(--color-bg-base)",
        }}
      >
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
                  background: "#FEE2E2",
                  color: "#DC2626",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: "9999px",
                }}
              >
                ● High Priority
              </span>
              <span
                style={{
                  background: "#FEF3C7",
                  color: "#D97706",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: "9999px",
                }}
              >
                ● Open
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
              <strong>{activeTicket.machine_name || "CNC-2100"}</strong> · {activeTicket.symptom_summary}
            </div>
          </div>
        </div>

        {/* Message Thread (Screen 10) */}
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
          {/* Post 1: Aman Yadav */}
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
              AY
            </div>
            <div style={{ flex: 1, maxWidth: 600 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-ink)" }}>
                  Aman Yadav
                </span>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>7h ago</span>
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
                {activeTicket.ai_drafted_brief || "Check the drive parameters and ensure spindle load is within range. Refer to attached document."}
              </div>
            </div>
          </div>

          {/* Post 2: Ramesh K. with Document Attachment */}
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
              RK
            </div>
            <div style={{ flex: 1, maxWidth: 600 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-ink)" }}>
                  Ramesh K.
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
                  Senior Engineer
                </span>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>1h ago</span>
              </div>
              <div
                className="bracket-card"
                style={{
                  padding: "16px 20px",
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "var(--color-ink)",
                  background: "#FFFFFF",
                  marginBottom: 10,
                }}
              >
                Checked the drive parameters and calibrated resolver feedback. The attached diagnostic procedure should be followed for reset.
              </div>

              {/* PDF Document Attachment Card (Screen 10) */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                  background: "#FFFFFF",
                  cursor: "pointer",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "6px",
                    background: "#FEE2E2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FileText size={18} color="#DC2626" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)" }}>
                    Drive_Troubleshooting.pdf
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                    2.4 MB · Technical Manual
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Input Bar & Actions (Screen 10 Bottom) */}
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
            <button
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--color-text-secondary)",
              }}
            >
              <Paperclip size={18} />
            </button>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              className="btn-secondary"
              style={{ padding: "8px 16px", borderRadius: "var(--radius-md)" }}
            >
              <UserPlus size={15} />
              <span>Assign Expert</span>
            </button>
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
          </div>
        </div>
      </div>
    </div>
  );
}
