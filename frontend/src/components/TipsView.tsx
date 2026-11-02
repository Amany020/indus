"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lightbulb,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  User,
} from "lucide-react";
import { api, type Tip } from "@/lib/api";
import { useApp } from "@/lib/context";

export default function TipsView() {
  const { machine, role } = useApp();
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [newTip, setNewTip] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitterName, setSubmitterName] = useState("");

  const fetchTips = () => {
    api
      .getTips(
        machine?.id,
        filter !== "all" ? filter : undefined
      )
      .then(setTips)
      .catch(() => setTips([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTips();
  }, [machine?.id, filter]);

  const handleSubmit = async () => {
    if (!newTip.trim() || !machine || !submitterName.trim()) return;
    setSubmitting(true);
    try {
      await api.submitTip({
        machine_id: machine.id,
        submitted_by: submitterName,
        tip_text: newTip,
      });
      setNewTip("");
      fetchTips();
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (
    tipId: string,
    status: "approved" | "rejected"
  ) => {
    try {
      await api.reviewTip(tipId, {
        status,
        reviewer: "Current Reviewer",
      });
      fetchTips();
    } catch {
      // silent
    }
  };

  const isReviewer = role === "reviewer" || role === "admin";

  return (
    <div style={{ padding: 24, overflow: "auto", height: "100vh" }}>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "var(--color-ink)",
          marginBottom: 4,
        }}
      >
        Expert Tips
      </h2>
      <p
        style={{
          fontSize: 12,
          color: "var(--color-text-muted)",
          marginBottom: 20,
        }}
      >
        Reviewed expert tips are shown separately from official SOPs.
      </p>

      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 20,
        }}
      >
        {["all", "pending_review", "approved", "rejected"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 12px",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              fontWeight: filter === f ? 600 : 400,
              color: filter === f ? "var(--color-primary)" : "var(--color-text-muted)",
              background:
                filter === f ? "var(--color-primary-light)" : "transparent",
              border: `1px solid ${filter === f ? "var(--color-primary)" : "var(--color-border)"}`,
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {f === "all" ? "All" : f.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Submit new tip */}
      <div
        className="bracket-card"
        style={{ padding: 16, marginBottom: 20 }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-ink)",
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Lightbulb size={14} color="var(--color-amber)" />
          Share a tip
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            className="input-field"
            value={submitterName}
            onChange={(e) => setSubmitterName(e.target.value)}
            placeholder="Your name"
            style={{ maxWidth: 180, fontSize: 12 }}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <textarea
            className="input-field"
            value={newTip}
            onChange={(e) => setNewTip(e.target.value)}
            placeholder="Share practical knowledge from your experience..."
            rows={2}
            style={{ fontSize: 12, resize: "vertical" }}
          />
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !newTip.trim() || !submitterName.trim()}
            style={{
              alignSelf: "flex-end",
              opacity:
                submitting || !newTip.trim() || !submitterName.trim() ? 0.5 : 1,
            }}
          >
            <Send size={14} />
          </button>
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--color-text-muted)",
            fontFamily: "var(--font-mono)",
            marginTop: 6,
          }}
        >
          Tips go to Pending Review before appearing to workers.
        </div>
      </div>

      {/* Tips list */}
      {loading ? (
        <div
          style={{
            fontSize: 13,
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-muted)",
            textAlign: "center",
            padding: 40,
          }}
        >
          Loading tips...
        </div>
      ) : tips.length === 0 ? (
        <div
          style={{
            fontSize: 13,
            color: "var(--color-text-muted)",
            textAlign: "center",
            padding: 40,
          }}
        >
          No tips found.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <AnimatePresence>
            {tips.map((tip) => (
              <motion.div
                key={tip.id}
                className="bracket-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                style={{ padding: 16 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <User size={12} color="var(--color-text-muted)" />
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--color-ink)",
                      }}
                    >
                      {tip.submitted_by}
                    </span>
                  </div>
                  <span
                    className={`status-${tip.status === "approved" ? "supported" : tip.status === "rejected" ? "escalate" : "limited"}`}
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      padding: "2px 8px",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    {tip.status.replace("_", " ")}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: "var(--color-text-secondary)",
                    marginBottom: 8,
                  }}
                >
                  {tip.tip_text}
                </p>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {new Date(tip.created_at).toLocaleDateString()}
                    {tip.reviewer && ` · reviewed by ${tip.reviewer}`}
                  </span>
                  {isReviewer && tip.status === "pending_review" && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={() => handleReview(tip.id, "approved")}
                        className="btn-secondary"
                        style={{ padding: "4px 10px", fontSize: 11 }}
                      >
                        <CheckCircle size={12} color="var(--color-sage)" />{" "}
                        Approve
                      </button>
                      <button
                        onClick={() => handleReview(tip.id, "rejected")}
                        className="btn-secondary"
                        style={{ padding: "4px 10px", fontSize: 11 }}
                      >
                        <XCircle size={12} color="var(--color-terracotta)" />{" "}
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
