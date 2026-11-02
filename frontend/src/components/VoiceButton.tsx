"use client";

import React, { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, Loader } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  onTranscript: (text: string) => void;
}

export default function VoiceButton({ onTranscript }: Props) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setProcessing(true);
        try {
          const result = await api.transcribe(blob);
          if (result.transcript) {
            onTranscript(result.transcript);
          }
        } catch {
          // silent
        } finally {
          setProcessing(false);
        }
      };

      recorder.start();
      mediaRef.current = recorder;
      setRecording(true);
    } catch {
      // mic permission denied
    }
  }, [onTranscript]);

  const stopRecording = useCallback(() => {
    if (mediaRef.current && mediaRef.current.state === "recording") {
      mediaRef.current.stop();
      setRecording(false);
    }
  }, []);

  return (
    <motion.button
      type="button"
      onClick={recording ? stopRecording : startRecording}
      disabled={processing}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      title={recording ? "Stop recording" : "Push to talk"}
      style={{
        width: 44,
        height: 44,
        borderRadius: "var(--radius-md)",
        border: recording
          ? "2px solid var(--color-terracotta)"
          : "1px solid var(--color-border)",
        background: recording
          ? "var(--color-terracotta-light)"
          : "var(--color-surface)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: processing ? "wait" : "pointer",
        flexShrink: 0,
      }}
    >
      {processing ? (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        >
          <Loader size={18} color="var(--color-text-muted)" />
        </motion.div>
      ) : recording ? (
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1 }}
        >
          <MicOff size={18} color="var(--color-terracotta)" />
        </motion.div>
      ) : (
        <Mic size={18} color="var(--color-text-secondary)" />
      )}
    </motion.button>
  );
}
