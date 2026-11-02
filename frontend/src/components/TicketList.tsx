"use client";

import React from "react";
import { RotateCw, MessageSquare, AlertCircle, Clock, ChevronRight } from "lucide-react";
import type { EscalationTicketListItem } from "@/lib/api";

interface TicketListProps {
  tickets: EscalationTicketListItem[];
  loading: boolean;
  error: string | null;
  emptyText?: string;
  onOpen: (id: string) => void;
  onRefresh: () => void;
}

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay}d ago`;
  } catch {
    return "";
  }
}

function getStatusBadge(status?: string) {
  const norm = (status || "").toLowerCase();
  if (norm === "open") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border border-[#D95A2B] text-[#D95A2B] bg-[#FAF8F5]">
        Open
      </span>
    );
  }
  if (norm === "in_progress") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border border-[#1C2B29] text-[#1C2B29] bg-[#EDE8E0]">
        In Progress
      </span>
    );
  }
  if (norm === "resolved") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border border-[#5C6460] text-[#1C2B29] bg-[#EDE8E0]">
        Resolved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border border-[#E5E0D8] text-[#5C6460]">
      {status || "Unknown"}
    </span>
  );
}

function getPriorityBadge(priority?: string) {
  const norm = (priority || "").toLowerCase();
  if (norm === "high") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border border-[#D95A2B] text-[#D95A2B] bg-[#FAF8F5]">
        High
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium uppercase tracking-wider border border-[#E5E0D8] text-[#5C6460]">
      Normal
    </span>
  );
}

export default function TicketList({
  tickets,
  loading,
  error,
  emptyText = "No tickets found.",
  onOpen,
  onRefresh,
}: TicketListProps) {
  return (
    <div className="space-y-4">
      {/* Top Header with Refresh Button */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#5C6460] uppercase tracking-wider">
          {tickets.length} {tickets.length === 1 ? "Ticket" : "Tickets"}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh ticket list"
          className="min-h-[48px] px-4 py-2 rounded-xl bg-white border border-[#E5E0D8] text-[#1C2B29] text-xs font-bold hover:border-[#D95A2B] transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <RotateCw className={`w-4 h-4 text-[#D95A2B] ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-white border border-[#D95A2B] text-[#1C2B29] text-xs space-y-1">
          <div className="flex items-center gap-2 font-bold text-[#D95A2B]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Failed to load tickets</span>
          </div>
          <p className="text-[#5C6460] pl-6">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="p-8 text-center text-xs font-semibold text-[#5C6460] bg-white border border-[#EDE8E0] rounded-2xl flex items-center justify-center gap-2 min-h-[48px]">
          <RotateCw className="w-4 h-4 animate-spin text-[#D95A2B]" />
          <span>Loading tickets...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && tickets.length === 0 && (
        <div className="p-8 text-center bg-white border border-[#EDE8E0] rounded-2xl space-y-2">
          <MessageSquare className="w-8 h-8 text-[#5C6460] mx-auto" />
          <p className="text-xs font-medium text-[#5C6460]">{emptyText}</p>
        </div>
      )}

      {/* List */}
      {!loading && tickets.length > 0 && (
        <div className="space-y-2.5">
          {tickets.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onOpen(t.id)}
              className="w-full min-h-[48px] text-left bg-white border border-[#EDE8E0] rounded-2xl p-4 shadow-xs hover:border-[#D95A2B] transition cursor-pointer flex items-center justify-between gap-3 group"
            >
              <div className="flex-1 min-w-0 space-y-2">
                {/* Status + Priority + Time */}
                <div className="flex flex-wrap items-center gap-2">
                  {getStatusBadge(t.status)}
                  {getPriorityBadge(t.priority)}
                  {t.created_at && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#5C6460]">
                      <Clock className="w-3.5 h-3.5" />
                      {formatRelativeTime(t.created_at)}
                    </span>
                  )}
                </div>

                {/* Question truncated to 2 lines */}
                <p className="text-xs font-semibold text-[#1C2B29] line-clamp-2 leading-relaxed">
                  {t.question || "No question text"}
                </p>

                {/* Reply count & Last reply */}
                <div className="flex items-center gap-3 text-[11px] text-[#5C6460]">
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5 text-[#5C6460]" />
                    <span>
                      {t.reply_count} {t.reply_count === 1 ? "reply" : "replies"}
                    </span>
                  </span>
                  {t.last_reply_at && (
                    <span>Last reply: {formatRelativeTime(t.last_reply_at)}</span>
                  )}
                </div>
              </div>

              <ChevronRight className="w-5 h-5 text-[#5C6460] group-hover:text-[#D95A2B] shrink-0 transition" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

