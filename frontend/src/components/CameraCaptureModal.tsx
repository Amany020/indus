"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Camera, X, Loader2 } from "lucide-react";

export interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageBlob: Blob) => void;
}

export function CameraCaptureModal({
  isOpen,
  onClose,
  onCapture,
}: CameraCaptureModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const handleClose = () => {
    stopStream();
    onClose();
  };

  useEffect(() => {
    let isCancelled = false;

    if (!isOpen) {
      stopStream();
      setIsLoading(true);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    async function startCamera() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        if (!isCancelled) {
          setError("Camera access denied or unavailable. Please check permissions.");
          setIsLoading(false);
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setIsLoading(false);
      } catch (err) {
        if (!isCancelled) {
          setError("Camera access denied or unavailable. Please check permissions.");
          setIsLoading(false);
        }
      }
    }

    startCamera();

    return () => {
      isCancelled = true;
      stopStream();
    };
  }, [isOpen, stopStream]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video) return;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvasRef.current = canvas;
    }
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          stopStream();
          onCapture(blob);
        }
      },
      "image/jpeg",
      0.9
    );
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-[#EDE8E0] space-y-4">
        {/* Header Row */}
        <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-2">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-[#D95A2B]" />
            <span className="font-bold text-sm text-[#1C2B29]">Capture Photo</span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-full text-[#5C6460] hover:bg-[#FAF8F5]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-xl">
            {error}
          </div>
        )}

        {/* Video Preview */}
        {!error && (
          <div className="relative w-full aspect-video rounded-xl bg-black overflow-hidden flex items-center justify-center">
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80 bg-black/70 z-10">
                <Loader2 className="w-6 h-6 animate-spin text-[#D95A2B]" />
                <span className="text-xs font-medium">Starting camera...</span>
              </div>
            )}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-video rounded-xl bg-black object-cover"
            />
          </div>
        )}

        {/* Hidden Canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Capture Button */}
        {!error && (
          <button
            type="button"
            disabled={isLoading}
            onClick={handleCapture}
            className="w-full py-3 rounded-2xl bg-[#D95A2B] hover:bg-[#C84E18] disabled:opacity-50 text-white text-xs font-bold transition shadow-xs flex items-center justify-center gap-2"
          >
            <Camera className="w-4 h-4" />
            <span>Capture Photo</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default CameraCaptureModal;
