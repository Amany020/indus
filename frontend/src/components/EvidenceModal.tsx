"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FileText, ExternalLink } from "lucide-react";
import type { EvidenceMeta } from "@/lib/api";

interface Props {
  evidence: EvidenceMeta;
  onClose: () => void;
}

export default function EvidenceModal({ evidence, onClose }: Props) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(28,43,41,0.5)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bracket-card bracket-card--active"
          style={{
            width: "100%",
            maxWidth: 640,
            maxHeight: "80vh",
            overflow: "auto",
            padding: 0,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <FileText size={16} color="var(--color-primary)" />
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--color-ink)",
                  }}
                >
                  {evidence.filename}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  Rev {evidence.revision} · Page {evidence.page_number} ·{" "}
                  {evidence.evidence_id}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--color-text-muted)",
                padding: 4,
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Section heading */}
          {evidence.section_heading && (
            <div
              style={{
                padding: "12px 20px",
                borderBottom: "1px solid var(--color-border)",
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                color: "var(--color-primary)",
              }}
            >
              {evidence.section_heading}
            </div>
          )}

          {/* Risk indicator */}
          {evidence.risk_level !== "none" && (
            <div
              style={{
                padding: "8px 20px",
                background:
                  evidence.risk_level === "hazardous"
                    ? "var(--color-terracotta-light)"
                    : "var(--color-amber-light)",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                color:
                  evidence.risk_level === "hazardous"
                    ? "var(--color-terracotta)"
                    : "var(--color-amber)",
              }}
            >
              {evidence.risk_level === "hazardous"
                ? "HAZARDOUS CONTENT"
                : "CAUTION"}
            </div>
          )}

          {/* Content */}
          <div style={{ padding: 20 }}>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.7,
                color: "var(--color-ink)",
                fontFamily:
                  evidence.content_type === "text"
                    ? "var(--font-body)"
                    : "var(--font-mono)",
                whiteSpace: "pre-wrap",
              }}
            >
              {evidence.content_text}
            </div>
          </div>

          {/* Footer with metadata */}
          <div
            style={{
              padding: "12px 20px",
              borderTop: "1px solid var(--color-border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-secondary)",
                letterSpacing: "0.03em",
              }}
            >
              SOURCE VERIFICATION: APPROVED MANUAL RETRIEVAL · FORMAT: {evidence.content_type.toUpperCase()}
            </div>
            {evidence.bbox && (
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-muted)",
                }}
              >
                DIAGRAM REGION: [{Object.values(evidence.bbox).map((v) => v.toFixed(2)).join(", ")}]
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
