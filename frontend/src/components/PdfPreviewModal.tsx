"use client";

import React, { useEffect } from "react";
import { X, ExternalLink, FileText, Upload } from "lucide-react";

export interface PdfPreviewModalProps {
  open: boolean;
  title: string;
  src: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmLoading?: boolean;
}

export default function PdfPreviewModal({
  open,
  title,
  src,
  onClose,
  onConfirm,
  confirmLabel = "Confirm",
  confirmLoading = false,
}: PdfPreviewModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#1C2B29]/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E5E0D8] bg-[#FAF8F5]">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <FileText className="w-5 h-5 text-[#D95A2B] shrink-0" />
            <h3 id="pdf-modal-title" className="text-sm font-bold text-[#1C2B29] truncate">
              {title || "PDF Document"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close PDF preview"
            className="min-h-[48px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#EDE8E0] hover:bg-[#E5E0D8] text-[#1C2B29] border border-[#E5E0D8] inline-flex items-center gap-2 transition"
          >
            <X className="w-4 h-4" />
            <span>Close</span>
          </button>
        </div>

        {/* Note and Open in new tab link */}
        <div className="px-5 py-2.5 bg-[#EDE8E0]/60 border-b border-[#E5E0D8] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs text-[#5C6460]">
            If the preview is blank, use Open in new tab.
          </span>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[48px] px-3 py-2 text-xs font-semibold text-[#D95A2B] hover:text-[#D95A2B]/80 inline-flex items-center gap-1.5 self-start sm:self-auto transition"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Open in new tab</span>
          </a>
        </div>

        {/* PDF Iframe */}
        <div className="flex-1 p-3 min-h-[400px] sm:min-h-[500px] bg-[#FAF8F5] flex flex-col">
          <iframe
            src={src}
            title={title || "PDF Preview"}
            className="w-full flex-1 min-h-[380px] sm:min-h-[480px] border border-[#E5E0D8] rounded-xl bg-[#FAF8F5]"
          />
        </div>

        {/* Footer */}
        {onConfirm && (
          <div className="flex items-center justify-end gap-2.5 px-5 py-3 border-t border-[#E5E0D8] bg-[#FAF8F5]">
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmLoading}
              className="min-h-[48px] px-5 py-2 bg-[#D95A2B] hover:bg-[#D95A2B]/90 text-[#FAF8F5] rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>{confirmLoading ? "Uploading..." : confirmLabel}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

