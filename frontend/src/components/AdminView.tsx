"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Upload, FileText, CheckCircle, Loader } from "lucide-react";
import { api, type DocumentOut } from "@/lib/api";
import { useApp } from "@/lib/context";

export default function AdminView() {
  const { machine } = useApp();
  const [docs, setDocs] = useState<DocumentOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchDocs = () => {
    api
      .getDocuments(machine?.id)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDocs();
  }, [machine?.id]);

  const handleUpload = async (file: File) => {
    if (!machine) return;
    setUploading(true);
    try {
      await api.uploadDocument(file, machine.id);
      fetchDocs();
    } catch {
      // silent
    } finally {
      setUploading(false);
    }
  };

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
        Document Management
      </h2>
      <p
        style={{
          fontSize: 12,
          color: "var(--color-text-muted)",
          marginBottom: 20,
        }}
      >
        Upload and manage approved manuals for{" "}
        {machine?.name || "selected machine"}.
      </p>

      {/* Upload zone */}
      <motion.div
        className="bracket-card"
        whileHover={{ borderColor: "var(--color-primary)" }}
        style={{
          padding: 32,
          marginBottom: 24,
          textAlign: "center",
          cursor: "pointer",
          borderStyle: "dashed",
        }}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />
        {uploading ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          >
            <Loader size={28} color="var(--color-primary)" />
          </motion.div>
        ) : (
          <Upload size={28} color="var(--color-primary)" />
        )}
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--color-ink)",
            marginTop: 12,
          }}
        >
          {uploading ? "Processing..." : "Drop PDF manual here"}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--color-text-muted)",
            marginTop: 4,
          }}
        >
          Uploaded documents are ingested, chunked, and embedded automatically.
        </div>
      </motion.div>

      {/* Document list */}
      {loading ? (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: "var(--color-text-muted)",
          }}
        >
          Loading documents...
        </div>
      ) : docs.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            color: "var(--color-text-muted)",
            fontSize: 13,
          }}
        >
          No documents uploaded yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {docs.map((doc) => (
            <motion.div
              key={doc.id}
              className="bracket-card"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                padding: 16,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <FileText size={18} color="var(--color-primary)" />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--color-ink)",
                  }}
                >
                  {doc.filename}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {doc.doc_type} · rev {doc.revision} · {doc.page_count} pages
                </div>
              </div>
              <span
                className={`status-${doc.status === "approved" ? "supported" : "limited"}`}
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                {doc.status}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
