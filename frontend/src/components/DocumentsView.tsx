"use client";

import React, { useState, useEffect, useRef } from "react";
import { useApp } from "@/lib/context";
import { api, DocumentOut, Machine } from "@/lib/api";
import { FileText, Loader2 } from "lucide-react";
import PdfPreviewModal from "@/components/PdfPreviewModal";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

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

  // Upload preview modal state
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [showUploadPreview, setShowUploadPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View document modal state
  const [viewDocModalData, setViewDocModalData] = useState<{ title: string; src: string } | null>(null);
  const [viewLoadingId, setViewLoadingId] = useState<string | null>(null);
  const [viewErrorDocId, setViewErrorDocId] = useState<string | null>(null);
  const [viewErrorText, setViewErrorText] = useState<string | null>(null);

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (uploadPreviewUrl) {
        URL.revokeObjectURL(uploadPreviewUrl);
      }
    };
  }, [uploadPreviewUrl]);

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    // Validation: .pdf only
    if (!selected.name.toLowerCase().endsWith(".pdf")) {
      setMessage({ type: "error", text: "Please select a valid PDF file (.pdf extension only)." });
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFile(null);
      return;
    }

    // Validation: 50 MB
    const maxBytes = 50 * 1024 * 1024;
    if (selected.size > maxBytes) {
      setMessage({ type: "error", text: "File size exceeds the 50 MB limit." });
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFile(null);
      return;
    }

    // Revoke previous URL if any
    if (uploadPreviewUrl) {
      URL.revokeObjectURL(uploadPreviewUrl);
    }

    const url = URL.createObjectURL(selected);
    setUploadPreviewUrl(url);
    setFile(selected);
    setShowUploadPreview(true);
    setMessage(null);
  };

  const handleCancelUploadPreview = () => {
    if (uploadPreviewUrl) {
      URL.revokeObjectURL(uploadPreviewUrl);
      setUploadPreviewUrl(null);
    }
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setShowUploadPreview(false);
  };

  const executeUpload = async () => {
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
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await loadData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to upload document" });
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmUpload = async () => {
    if (uploadPreviewUrl) {
      URL.revokeObjectURL(uploadPreviewUrl);
      setUploadPreviewUrl(null);
    }
    setShowUploadPreview(false);
    await executeUpload();
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeUpload();
  };

  const handleViewDocument = async (doc: DocumentOut) => {
    setViewLoadingId(doc.id);
    setViewErrorDocId(null);
    setViewErrorText(null);
    try {
      const res = await api.getDocumentFileUrl(doc.id);
      setViewDocModalData({
        title: res.filename || doc.filename || "Document PDF",
        src: res.url,
      });
    } catch (err: any) {
      const errMsg = err?.message || "Failed to load document PDF";
      setViewErrorDocId(doc.id);
      setViewErrorText(errMsg);
      setMessage({ type: "error", text: errMsg });
    } finally {
      setViewLoadingId(null);
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
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
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
                      <div className="inline-flex items-center justify-end gap-2">
                        {/* View Document Button */}
                        <button
                          type="button"
                          onClick={() => handleViewDocument(doc)}
                          disabled={viewLoadingId === doc.id}
                          className="min-h-[48px] px-3.5 py-1.5 bg-[#EDE8E0] hover:bg-[#E5E0D8] text-[#1C2B29] border border-[#E5E0D8] rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {viewLoadingId === doc.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-[#D95A2B]" />
                          ) : (
                            <FileText className="w-4 h-4 text-[#1C2B29]" />
                          )}
                          <span>{viewLoadingId === doc.id ? "Loading..." : "View"}</span>
                        </button>

                        {/* Remove / Delete Document Button */}
                        <button
                          type="button"
                          onClick={() => handleDelete(doc.id, doc.filename)}
                          disabled={deletingId === doc.id}
                          className="min-h-[48px] px-3.5 py-1.5 bg-[#FAF8F5] hover:bg-[#EDE8E0] text-[#D95A2B] border border-[#E5E0D8] rounded-xl text-xs font-semibold transition-all duration-150 inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <span>🗑️</span>
                          <span>{deletingId === doc.id ? "Deleting..." : "Delete Document"}</span>
                        </button>
                      </div>
                      {viewErrorDocId === doc.id && viewErrorText && (
                        <div className="text-[11px] text-[#D95A2B] mt-1 text-right">
                          {viewErrorText}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload Preview Modal */}
      {showUploadPreview && uploadPreviewUrl && file && (
        <PdfPreviewModal
          open={showUploadPreview}
          title={`${file.name} (${formatFileSize(file.size)})`}
          src={uploadPreviewUrl}
          onClose={handleCancelUploadPreview}
          onConfirm={handleConfirmUpload}
          confirmLabel="Upload this document"
          confirmLoading={uploading}
        />
      )}

      {/* View Document Modal */}
      {viewDocModalData && (
        <PdfPreviewModal
          open={!!viewDocModalData}
          title={viewDocModalData.title}
          src={viewDocModalData.src}
          onClose={() => setViewDocModalData(null)}
        />
      )}
    </div>
  );
}
