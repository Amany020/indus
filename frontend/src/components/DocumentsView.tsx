"use client";

import React, { useState, useEffect } from "react";
import { useApp } from "@/lib/context";
import { api, DocumentOut, Machine } from "@/lib/api";

export default function DocumentsView() {
  const { machine, role } = useApp();
  const [documents, setDocuments] = useState<DocumentOut[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState<string>("");
  const [docType, setDocType] = useState<string>("manual");
  const [revision, setRevision] = useState<string>("1.0");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [machine]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [docs, machs] = await Promise.all([
        api.getDocuments(machine?.id),
        api.getMachines(),
      ]);
      setDocuments(docs);
      setMachines(machs);
      if (machine?.id) {
        setSelectedMachineId(machine.id);
      } else if (machs.length > 0) {
        setSelectedMachineId(machs[0].id);
      }
    } catch (err: any) {
      console.error("Failed to load documents:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !selectedMachineId) {
      setMessage({ type: "error", text: "Please select a PDF file and target machine." });
      return;
    }

    setUploading(true);
    setMessage(null);
    try {
      await api.uploadDocument(file, selectedMachineId, docType);
      setMessage({
        type: "success",
        text: `Successfully uploaded ${file.name}. Ingestion and chunking initiated!`,
      });
      setFile(null);
      // Reload documents
      await loadData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to upload document" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string, filename: string) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${filename}"?\n\nThis will permanently remove the document and its chunked vector embeddings from the database without affecting other data.`
    );
    if (!confirmDelete) return;

    setDeletingId(docId);
    setMessage(null);
    try {
      await api.deleteDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setMessage({
        type: "success",
        text: `Document "${filename}" and all its chunked vector data were cleanly removed from the database.`,
      });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to delete document" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto h-full overflow-y-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Technical Manuals & Approved SOPs
            </h1>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-0.5 rounded-full font-mono">
              RAG Knowledge Base
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Manage machine service manuals, standard operating procedures, and chunked vector embeddings.
          </p>
        </div>

        <button
          onClick={loadData}
          className="text-xs px-3.5 py-2 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg text-gray-700 font-medium transition-all shadow-xs"
        >
          🔄 Refresh Documents
        </button>
      </div>

      {/* Notifications */}
      {message && (
        <div
          className={`p-4 rounded-xl text-xs font-medium border flex items-center justify-between ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
      )}

      {/* Upload Box */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
        <h2 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
          <span>📤</span> Upload Real Operational PDF Manual
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Files are automatically parsed, section-split, and embedded into Supabase pgvector for verified AI retrieval.
        </p>

        <form onSubmit={handleUpload} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Target Machine</label>
            <select
              value={selectedMachineId}
              onChange={(e) => setSelectedMachineId(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg outline-none bg-white focus:ring-2 focus:ring-emerald-500"
            >
              {machines.length === 0 ? (
                <option value="">No machines registered (Add one in top bar)</option>
              ) : (
                machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.workcell})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Document Category</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg outline-none bg-white focus:ring-2 focus:ring-emerald-500"
            >
              <option value="manual">OEM Service Manual</option>
              <option value="sop">Standard Operating Procedure (SOP)</option>
              <option value="safety_brief">Safety Procedure / Lockout Tagout</option>
              <option value="schematic">Wiring & P&ID Schematic</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Select PDF File</label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
              className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded-lg outline-none file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[11px] file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={uploading || !file || !selectedMachineId}
              className="w-full py-2 px-4 bg-[#1B4D44] hover:bg-[#133932] text-white text-xs font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {uploading ? "Ingesting & Chunking..." : "Upload & Vectorize"}
            </button>
          </div>
        </form>
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Ingested Documents & Chunk Status</h3>
            <p className="text-xs text-gray-500">
              {documents.length} document(s) registered in knowledge base.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-gray-500">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="p-12 text-center text-xs text-gray-400">
            No documents uploaded yet. Upload a PDF manual above to power the RAG model!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-600 uppercase tracking-wider font-mono">
                  <th className="py-3 px-4">Filename</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Revision</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Pages</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-gray-900 flex items-center gap-2">
                      <span className="text-base text-red-500">📄</span>
                      <span>{doc.filename}</span>
                    </td>
                    <td className="py-3.5 px-4 uppercase font-mono text-[11px] text-gray-500">
                      {doc.doc_type}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-gray-600">
                      v{doc.revision}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          doc.status === "approved"
                            ? "bg-emerald-100 text-emerald-800"
                            : doc.status === "processing"
                            ? "bg-amber-100 text-amber-800 animate-pulse"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {doc.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-gray-600">
                      {doc.page_count || 1}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {/* Remove / Delete Document Button */}
                      <button
                        onClick={() => handleDelete(doc.id, doc.filename)}
                        disabled={deletingId === doc.id}
                        className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold transition-all duration-150 inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <span>🗑️</span>
                        <span>{deletingId === doc.id ? "Deleting..." : "Delete Document"}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
