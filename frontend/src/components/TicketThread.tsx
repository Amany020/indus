"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  RotateCw,
  Send,
  Camera,
  Mic,
  FileText,
  Square,
  AlertCircle,
  Clock,
  CheckCircle2,
  X,
  Volume2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  getTicketThread,
  postTicketReply,
  type TicketThreadResponse,
  type TicketReply,
  type TicketThreadDetail,
} from "@/lib/api";
import { roleLabel } from "@/lib/roles";

interface TicketThreadProps {
  ticketId: string;
  canReply: boolean;
  onBack: () => void;
  onChanged?: () => void;
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

export default function TicketThread({
  ticketId,
  canReply,
  onBack,
  onChanged,
}: TicketThreadProps) {
  const [threadData, setThreadData] = useState<TicketThreadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI draft brief collapsed toggle
  const [showAiBrief, setShowAiBrief] = useState(false);

  // Composer mode: 'text' | 'photo' | 'voice'
  const [composerMode, setComposerMode] = useState<"text" | "photo" | "voice">("text");

  // Text composer state
  const [textBody, setTextBody] = useState("");

  // Photo composer state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState("");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Voice composer state
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "recorded">("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  // Mark resolved checkbox
  const [markResolved, setMarkResolved] = useState(false);

  // Sending state
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Load thread function
  const loadThread = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTicketThread(ticketId);
      setThreadData(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load ticket thread");
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
      if (timerRef.current) clearInterval(timerRef.current);
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch (_) {}
      }
    };
  }, [photoPreviewUrl, voicePreviewUrl]);

  // Handle Photo selection
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("Image file too large (max 5 MB)");
      if (photoInputRef.current) photoInputRef.current.value = "";
      return;
    }

    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }

    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  };

  const clearPhoto = () => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoCaption("");
    setPhotoError(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  // Voice recording helpers
  const stopTracks = () => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
  };

  const stopVoiceRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => {
        stopTracks();
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setVoiceBlob(blob);
        if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
        setVoicePreviewUrl(URL.createObjectURL(blob));
        setRecordingState("recorded");
      };
      recorder.stop();
    } else {
      stopTracks();
      setRecordingState("idle");
    }
  }, [voicePreviewUrl]);

  const startVoiceRecording = async () => {
    setVoiceError(null);
    setVoiceBlob(null);
    if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
    setVoicePreviewUrl(null);
    setElapsedSeconds(0);

    // Pick supported mime type
    const mimeCandidates = [
      { mime: "audio/webm", ext: "webm" },
      { mime: "audio/mp4", ext: "m4a" },
      { mime: "audio/ogg", ext: "ogg" },
    ];
    let chosenMime = "audio/webm";
    for (const cand of mimeCandidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(cand.mime)) {
        chosenMime = cand.mime;
        break;
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeStreamRef.current = stream;

      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: chosenMime });
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingState("recording");

      let seconds = 0;
      timerRef.current = setInterval(() => {
        seconds += 1;
        setElapsedSeconds(seconds);
        if (seconds >= 120) {
          stopVoiceRecording();
        }
      }, 1000);
    } catch (err: any) {
      setVoiceError("Microphone blocked. Allow it in the browser, or send text instead.");
      setRecordingState("idle");
    }
  };

  const reRecordVoice = () => {
    if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
    setVoiceBlob(null);
    setVoicePreviewUrl(null);
    setRecordingState("idle");
    setElapsedSeconds(0);
    setVoiceError(null);
  };

  // Submit reply
  const handleSubmitReply = async () => {
    setSendError(null);

    let kind: "text" | "image" | "audio" = "text";
    let bodyToSend: string | undefined = undefined;
    let fileToSend: File | undefined = undefined;

    if (composerMode === "text") {
      const trimmed = textBody.trim();
      if (!trimmed) {
        setSendError("Please type a message before sending.");
        return;
      }
      if (trimmed.length > 2000) {
        setSendError("Message too long (max 2000 characters).");
        return;
      }
      kind = "text";
      bodyToSend = trimmed;
    } else if (composerMode === "photo") {
      if (!photoFile) {
        setSendError("Please select an image to upload.");
        return;
      }
      if (photoCaption.trim().length > 500) {
        setSendError("Caption too long (max 500 characters).");
        return;
      }
      kind = "image";
      fileToSend = photoFile;
      bodyToSend = photoCaption.trim() || undefined;
    } else if (composerMode === "voice") {
      if (!voiceBlob) {
        setSendError("Please record a voice reply before sending.");
        return;
      }

      // Determine extension and base mime
      const rawMime = voiceBlob.type || "audio/webm";
      const baseMime = rawMime.split(";")[0].trim();
      let ext = "webm";
      if (baseMime.includes("mp4")) ext = "m4a";
      else if (baseMime.includes("ogg")) ext = "ogg";

      fileToSend = new File([voiceBlob], `voice-reply.${ext}`, { type: baseMime });
      kind = "audio";
    }

    setIsSending(true);
    try {
      await postTicketReply(ticketId, {
        kind,
        body: bodyToSend,
        file: fileToSend,
        resolve: markResolved,
      });

      // Clear composer state
      setTextBody("");
      clearPhoto();
      reRecordVoice();
      setMarkResolved(false);

      // Reload thread
      await loadThread();
      onChanged?.();
    } catch (err: any) {
      setSendError(err?.message || "Failed to post reply.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to ticket list"
          className="min-h-[48px] px-4 py-2 rounded-xl bg-white border border-[#E5E0D8] text-[#1C2B29] text-xs font-bold hover:border-[#D95A2B] transition flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#D95A2B]" />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={loadThread}
          disabled={loading}
          aria-label="Refresh thread"
          className="min-h-[48px] px-4 py-2 rounded-xl bg-white border border-[#E5E0D8] text-[#1C2B29] text-xs font-bold hover:border-[#D95A2B] transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <RotateCw className={`w-4 h-4 text-[#D95A2B] ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Main Error */}
      {error && (
        <div className="p-4 rounded-xl bg-white border border-[#D95A2B] text-[#1C2B29] text-xs space-y-1">
          <div className="flex items-center gap-2 font-bold text-[#D95A2B]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Failed to load thread</span>
          </div>
          <p className="text-[#5C6460] pl-6">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && !threadData && (
        <div className="p-8 text-center text-xs font-semibold text-[#5C6460] bg-white border border-[#EDE8E0] rounded-2xl flex items-center justify-center gap-2 min-h-[48px]">
          <RotateCw className="w-4 h-4 animate-spin text-[#D95A2B]" />
          <span>Loading ticket thread...</span>
        </div>
      )}

      {/* Ticket Details & Thread */}
      {threadData && (
        <div className="space-y-4">
          {/* Ticket Header Card */}
          <div className="bg-white border border-[#EDE8E0] rounded-2xl p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold text-[#5C6460]">
                  Ticket #{threadData.ticket.id.slice(0, 8)}
                </span>
                {getStatusBadge(threadData.ticket.status)}
              </div>
              {threadData.ticket.created_at && (
                <span className="inline-flex items-center gap-1 text-[11px] text-[#5C6460]">
                  <Clock className="w-3.5 h-3.5" />
                  {formatRelativeTime(threadData.ticket.created_at)}
                </span>
              )}
            </div>

            {/* Original Question */}
            <div>
              <span className="text-[10px] font-bold text-[#5C6460] uppercase tracking-wider block mb-1">
                Worker Question
              </span>
              <p className="text-xs font-semibold text-[#1C2B29] leading-relaxed bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-3">
                {threadData.ticket.question || "No question text provided."}
              </p>
            </div>

            {/* Collapsed AI Draft Brief (shown ONLY if non-null) */}
            {threadData.ticket.ai_drafted_brief && (
              <div className="border border-[#E5E0D8] bg-[#FAF8F5] rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAiBrief((prev) => !prev)}
                  className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between text-left cursor-pointer hover:bg-[#EDE8E0]/40 transition"
                >
                  <span className="text-xs font-bold text-[#1C2B29]">AI Draft Brief</span>
                  {showAiBrief ? (
                    <ChevronUp className="w-4 h-4 text-[#5C6460]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#5C6460]" />
                  )}
                </button>
                {showAiBrief && (
                  <div className="p-3.5 border-t border-[#E5E0D8] text-xs text-[#5C6460] whitespace-pre-wrap leading-relaxed font-mono">
                    {threadData.ticket.ai_drafted_brief}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Conversation Stream */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[#5C6460] uppercase tracking-wider px-1">
              Replies ({threadData.replies.length})
            </h3>

            {threadData.replies.length === 0 ? (
              <div className="p-6 text-center bg-white border border-[#EDE8E0] rounded-2xl text-xs text-[#5C6460]">
                No replies yet. An expert engineer will respond shortly.
              </div>
            ) : (
              <div className="space-y-3">
                {threadData.replies.map((reply) => (
                  <div
                    key={reply.id}
                    className="bg-white border border-[#EDE8E0] rounded-2xl p-4 shadow-xs space-y-2.5"
                  >
                    {/* Header: Author + Role + Time */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E0D8] pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#1C2B29]">
                          {reply.author_name}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#EDE8E0] text-[#1C2B29]">
                          {roleLabel(reply.author_role)}
                        </span>
                      </div>
                      <span className="text-[11px] text-[#5C6460]">
                        {formatRelativeTime(reply.created_at)}
                      </span>
                    </div>

                    {/* Content per kind */}
                    {reply.kind === "text" && (
                      <p className="text-xs text-[#1C2B29] leading-relaxed whitespace-pre-wrap">
                        {reply.body}
                      </p>
                    )}

                    {reply.kind === "image" && (
                      <div className="space-y-2">
                        {reply.media_url ? (
                          <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-2 inline-block">
                            <img
                              src={reply.media_url}
                              alt="Reply image"
                              className="max-h-64 rounded-lg object-contain border border-[#E5E0D8]"
                            />
                          </div>
                        ) : (
                          <div className="text-xs text-[#5C6460] italic">
                            Image attached (media link unavailable)
                          </div>
                        )}
                        {reply.body && (
                          <p className="text-xs text-[#1C2B29] italic">{reply.body}</p>
                        )}
                      </div>
                    )}

                    {reply.kind === "audio" && (
                      <div className="space-y-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D95A2B]">
                          <Volume2 className="w-4 h-4" />
                          <span>Voice reply</span>
                        </span>
                        {reply.media_url ? (
                          <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-3">
                            <audio controls src={reply.media_url} className="w-full h-10" />
                          </div>
                        ) : (
                          <div className="text-xs text-[#5C6460] italic">
                            Voice audio unavailable
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Composer (Rendered ONLY if canReply) */}
          {canReply && (
            <div className="bg-white border border-[#EDE8E0] rounded-2xl p-4 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-3">
                <span className="text-xs font-bold text-[#1C2B29]">Reply as Expert</span>

                {/* Mode Selector */}
                <div className="flex items-center gap-1 bg-[#FAF8F5] p-1 rounded-xl border border-[#E5E0D8]">
                  <button
                    type="button"
                    onClick={() => setComposerMode("text")}
                    className={`min-h-[48px] px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      composerMode === "text"
                        ? "bg-[#D95A2B] text-white"
                        : "text-[#5C6460] hover:text-[#1C2B29]"
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Text</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setComposerMode("photo")}
                    className={`min-h-[48px] px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      composerMode === "photo"
                        ? "bg-[#D95A2B] text-white"
                        : "text-[#5C6460] hover:text-[#1C2B29]"
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Photo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setComposerMode("voice")}
                    className={`min-h-[48px] px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      composerMode === "voice"
                        ? "bg-[#D95A2B] text-white"
                        : "text-[#5C6460] hover:text-[#1C2B29]"
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Voice</span>
                  </button>
                </div>
              </div>

              {/* Mode: TEXT */}
              {composerMode === "text" && (
                <div className="space-y-2">
                  <textarea
                    rows={4}
                    value={textBody}
                    onChange={(e) => setTextBody(e.target.value.slice(0, 2000))}
                    placeholder="Type technical guidance, instructions, or resolution notes..."
                    className="w-full p-3 rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] text-xs text-[#1C2B29] placeholder-[#5C6460] focus:outline-hidden focus:border-[#D95A2B] transition"
                  />
                  <div className="flex justify-end text-[11px] font-mono text-[#5C6460]">
                    {textBody.length} / 2000
                  </div>
                </div>
              )}

              {/* Mode: PHOTO */}
              {composerMode === "photo" && (
                <div className="space-y-3">
                  <input
                    type="file"
                    ref={photoInputRef}
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handlePhotoSelect}
                    className="hidden"
                    id="expert-reply-photo-input"
                  />

                  {!photoPreviewUrl ? (
                    <label
                      htmlFor="expert-reply-photo-input"
                      className="min-h-[48px] w-full p-6 border-2 border-dashed border-[#E5E0D8] hover:border-[#D95A2B] rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer bg-[#FAF8F5] transition"
                    >
                      <Camera className="w-6 h-6 text-[#D95A2B]" />
                      <span className="text-xs font-bold text-[#1C2B29]">Choose photo to upload</span>
                      <span className="text-[11px] text-[#5C6460]">PNG, JPEG, WebP (Max 5 MB)</span>
                    </label>
                  ) : (
                    <div className="space-y-3">
                      <div className="relative inline-block border border-[#E5E0D8] rounded-xl p-2 bg-[#FAF8F5]">
                        <img
                          src={photoPreviewUrl}
                          alt="Photo preview"
                          className="max-h-60 rounded-lg object-contain"
                        />
                        <button
                          type="button"
                          onClick={clearPhoto}
                          aria-label="Remove photo"
                          className="min-h-[48px] min-w-[48px] absolute top-2 right-2 bg-white border border-[#E5E0D8] rounded-xl flex items-center justify-center text-[#1C2B29] hover:text-[#D95A2B] transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <input
                        type="text"
                        value={photoCaption}
                        onChange={(e) => setPhotoCaption(e.target.value.slice(0, 500))}
                        placeholder="Add an optional caption (max 500 characters)..."
                        className="w-full min-h-[48px] p-3 rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] text-xs text-[#1C2B29] placeholder-[#5C6460] focus:outline-hidden focus:border-[#D95A2B]"
                      />
                      <div className="flex justify-end text-[11px] font-mono text-[#5C6460]">
                        {photoCaption.length} / 500
                      </div>
                    </div>
                  )}

                  {photoError && (
                    <p className="text-xs text-[#D95A2B] font-semibold">{photoError}</p>
                  )}
                </div>
              )}

              {/* Mode: VOICE */}
              {composerMode === "voice" && (
                <div className="space-y-3">
                  {recordingState === "idle" && (
                    <div className="p-6 border border-[#E5E0D8] rounded-xl bg-[#FAF8F5] text-center space-y-3">
                      <p className="text-xs text-[#5C6460]">
                        Record a voice reply up to 2 minutes. Browser supports automatic format selection.
                      </p>
                      <button
                        type="button"
                        onClick={startVoiceRecording}
                        className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#D95A2B] text-white text-xs font-bold hover:opacity-90 transition inline-flex items-center gap-2 cursor-pointer"
                      >
                        <Mic className="w-4 h-4" />
                        <span>Start Recording</span>
                      </button>
                    </div>
                  )}

                  {recordingState === "recording" && (
                    <div className="p-6 border border-[#D95A2B] rounded-xl bg-[#FAF8F5] text-center space-y-3">
                      <div className="inline-flex items-center gap-2 text-xs font-bold text-[#D95A2B]">
                        <span className="w-3 h-3 rounded-full bg-[#D95A2B] animate-pulse" />
                        <span>Recording: {elapsedSeconds}s / 120s</span>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={stopVoiceRecording}
                          className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#1C2B29] text-white text-xs font-bold hover:opacity-90 transition inline-flex items-center gap-2 cursor-pointer"
                        >
                          <Square className="w-4 h-4 fill-white" />
                          <span>Stop Recording</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {recordingState === "recorded" && (
                    <div className="p-4 border border-[#E5E0D8] rounded-xl bg-[#FAF8F5] space-y-3">
                      <span className="text-xs font-bold text-[#1C2B29] block">
                        Voice Preview ({elapsedSeconds}s)
                      </span>
                      {voicePreviewUrl && (
                        <audio controls src={voicePreviewUrl} className="w-full h-10" />
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={reRecordVoice}
                          className="min-h-[48px] px-4 py-2 rounded-xl bg-white border border-[#E5E0D8] text-xs font-bold text-[#1C2B29] hover:border-[#D95A2B] transition inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <RotateCw className="w-3.5 h-3.5 text-[#D95A2B]" />
                          <span>Re-record</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {voiceError && (
                    <p className="text-xs text-[#D95A2B] font-semibold">{voiceError}</p>
                  )}
                </div>
              )}

              {/* Mark resolved checkbox */}
              <div className="pt-2 border-t border-[#E5E0D8]">
                <label className="min-h-[48px] flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={markResolved}
                    onChange={(e) => setMarkResolved(e.target.checked)}
                    className="w-5 h-5 rounded border-[#E5E0D8] text-[#D95A2B] focus:ring-0 cursor-pointer accent-[#D95A2B]"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-[#1C2B29]">
                      Mark resolved with this reply
                    </span>
                    <span className="text-[11px] text-[#5C6460]">
                      Sets ticket status to resolved and timestamps closure
                    </span>
                  </div>
                </label>
              </div>

              {/* Send Error */}
              {sendError && (
                <div className="p-3 bg-white border border-[#D95A2B] text-[#D95A2B] rounded-xl text-xs font-semibold">
                  {sendError}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="button"
                disabled={isSending}
                onClick={handleSubmitReply}
                className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-[#D95A2B] text-white text-xs font-bold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSending ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span>Posting Reply...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Post Reply</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

