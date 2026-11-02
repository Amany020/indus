"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Cpu, ChevronRight, FileText } from "lucide-react";
import { api, type Machine } from "@/lib/api";
import { useApp } from "@/lib/context";

export default function MachinePicker() {
  const { machine, setMachine } = useApp();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasDocs, setHasDocs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api
      .getMachines()
      .then((data) => {
        setMachines(data);
        // Check docs for each
        data.forEach((m) =>
          api.hasApprovedDocs(m.id).then((r) =>
            setHasDocs((prev) => ({ ...prev, [m.id]: r.has_docs }))
          )
        );
      })
      .catch(() => {
        // Fallback demo machine
        setMachines([
          {
            id: "c0000000-0000-0000-0000-000000000001",
            name: "Conveyor Drive Unit",
            workcell: "Assembly Line D",
            model_number: "CDU-7500X",
          },
        ]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (machine) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: 32,
        gap: 32,
      }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ textAlign: "center" }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "var(--color-ink)",
            marginBottom: 8,
          }}
        >
          IndustryMind
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--color-text-secondary)",
            maxWidth: 400,
          }}
        >
          Evidence-first assistant for industrial SOPs, manuals &amp; expert
          knowledge. Select a machine to begin.
        </p>
      </motion.div>

      {/* Machine Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          maxWidth: 800,
          width: "100%",
        }}
      >
        {loading ? (
          <div
            style={{
              textAlign: "center",
              color: "var(--color-text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              padding: 40,
              background: "var(--color-surface)",
              border: "1px dashed var(--color-border)",
              borderRadius: "2px",
            }}
          >
            // INTERROGATING FACTORY MACHINE REGISTRY...
          </div>
        ) : (
          machines.map((m, i) => (
            <motion.button
              key={m.id}
              className="bracket-card"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.3 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setMachine(m)}
              style={{
                padding: "20px 24px",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: "2px",
                  background: "var(--color-primary-light)",
                  border: "1px solid var(--color-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Cpu size={20} strokeWidth={1.5} color="var(--color-primary)" />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--color-ink)",
                    marginBottom: 3,
                  }}
                >
                  {m.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-text-secondary)",
                    marginBottom: 8,
                  }}
                >
                  MODEL: {m.model_number || "EQUIP-01"} · ZONE: {m.workcell}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: hasDocs[m.id] ? "var(--color-sage)" : "var(--color-amber)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: hasDocs[m.id]
                        ? "var(--color-sage)"
                        : "var(--color-amber)",
                      fontWeight: 600,
                      letterSpacing: "0.03em",
                    }}
                  >
                    {hasDocs[m.id] ? "APPROVED MANUAL VERIFIED" : "MANUAL PENDING INGESTION"}
                  </span>
                </div>
              </div>
              <ChevronRight
                size={16}
                strokeWidth={1.5}
                color="var(--color-graphite)"
                style={{ marginTop: 6 }}
              />
            </motion.button>
          ))
        )}
      </div>
    </div>
  );
}
