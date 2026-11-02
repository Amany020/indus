"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { QrCode, X, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { api, type Machine, QrResolveError } from "@/lib/api";

export interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (machine: Machine) => void;
}

const SCANNER_REGION_ID = "html5qr-code-region";

export function QrScannerModal({
  isOpen,
  onClose,
  onSuccess,
}: QrScannerModalProps) {
  const [isInitializing, setIsInitializing] = useState(true);
  const [isResolving, setIsResolving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [flagDisabled, setFlagDisabled] = useState(false);

  const scannerRef = useRef<any>(null);
  const isResolvingRef = useRef(false);
  const lastScannedCodeRef = useRef<string | null>(null);

  const safeStopAndClear = useCallback(async (scannerInstance: any) => {
    if (!scannerInstance) return;
    try {
      const state = scannerInstance.getState?.();
      // State 2: SCANNING, State 3: PAUSED
      if (state === 2 || state === 3) {
        await scannerInstance.stop();
      }
    } catch (err) {
      console.warn("Failed to stop QR scanner:", err);
    }
    try {
      scannerInstance.clear();
    } catch (err) {
      console.warn("Failed to clear QR scanner region:", err);
    }
  }, []);

  const handleClose = useCallback(async () => {
    if (scannerRef.current) {
      const s = scannerRef.current;
      scannerRef.current = null;
      await safeStopAndClear(s);
    }
    onClose();
  }, [onClose, safeStopAndClear]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  // Core resolution logic shared by scanner decode and manual text lookup
  const resolveCode = useCallback(
    async (codeToResolve: string) => {
      const code = (codeToResolve || "").trim();
      if (!code) {
        setErrorMessage("Please enter or scan a machine QR code.");
        return;
      }

      setIsResolving(true);
      isResolvingRef.current = true;
      setErrorMessage(null);

      try {
        const resolvedMachine = await api.resolveMachineByQr(code);
        if (scannerRef.current) {
          const s = scannerRef.current;
          scannerRef.current = null;
          await safeStopAndClear(s);
        }
        onSuccess(resolvedMachine);
        onClose();
      } catch (err: any) {
        const status = err?.status;
        if (status === 404 || err?.code === "not_found") {
          setErrorMessage("QR not recognised for your factory");
          // Resume scanning after a brief pause so user can reposition camera
          setTimeout(() => {
            if (scannerRef.current) {
              try {
                const state = scannerRef.current.getState?.();
                if (state === 3) {
                  scannerRef.current.resume();
                }
              } catch (_) {}
            }
            lastScannedCodeRef.current = null;
            isResolvingRef.current = false;
            setIsResolving(false);
          }, 1500);
          return;
        }

        if (status === 501 || err?.code === "not_enabled") {
          setFlagDisabled(true);
          setErrorMessage("QR scanning is not enabled");
          if (scannerRef.current) {
            const s = scannerRef.current;
            scannerRef.current = null;
            await safeStopAndClear(s);
          }
          isResolvingRef.current = false;
          setIsResolving(false);
          return;
        }

        // Generic error
        const msg = err?.message || "Lookup failed. Please check the code and try again.";
        setErrorMessage(msg);
        lastScannedCodeRef.current = null;
        isResolvingRef.current = false;
        setIsResolving(false);
      }
    },
    [onSuccess, onClose, safeStopAndClear]
  );

  // Initialize and run the html5-qrcode scanner
  useEffect(() => {
    let isCancelled = false;

    if (!isOpen) {
      if (scannerRef.current) {
        const s = scannerRef.current;
        scannerRef.current = null;
        safeStopAndClear(s);
      }
      setIsInitializing(true);
      setErrorMessage(null);
      setCameraUnavailable(false);
      setFlagDisabled(false);
      setManualCode("");
      isResolvingRef.current = false;
      lastScannedCodeRef.current = null;
      return;
    }

    setIsInitializing(true);
    setErrorMessage(null);
    setCameraUnavailable(false);
    setFlagDisabled(false);
    isResolvingRef.current = false;
    lastScannedCodeRef.current = null;

    async function initScanner() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");

        if (isCancelled) return;

        const regionElem = document.getElementById(SCANNER_REGION_ID);
        if (!regionElem) {
          throw new Error("Scanner DOM container missing");
        }

        const scanner = new Html5Qrcode(SCANNER_REGION_ID);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 220, height: 220 },
            aspectRatio: 1.0,
          },
          (decodedText: string) => {
            if (isCancelled || isResolvingRef.current) return;
            if (decodedText === lastScannedCodeRef.current) return;

            lastScannedCodeRef.current = decodedText;
            try {
              scanner.pause(true);
            } catch (_) {}

            resolveCode(decodedText);
          },
          () => {
            // Frame decode errors are normal between frames; ignore silently
          }
        );

        if (isCancelled) {
          await safeStopAndClear(scanner);
          return;
        }

        setIsInitializing(false);
      } catch (err: any) {
        if (isCancelled) return;
        console.warn("QR Camera initialization failed:", err);
        setCameraUnavailable(true);
        setIsInitializing(false);
        setErrorMessage(
          "Camera access denied or unavailable. Enter machine code manually below."
        );
      }
    }

    initScanner();

    return () => {
      isCancelled = true;
      if (scannerRef.current) {
        const s = scannerRef.current;
        scannerRef.current = null;
        safeStopAndClear(s);
      }
    };
  }, [isOpen, safeStopAndClear, resolveCode]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim() || isResolving) return;
    resolveCode(manualCode.trim());
  };

  const handleRetryScan = () => {
    setErrorMessage(null);
    lastScannedCodeRef.current = null;
    isResolvingRef.current = false;
    setIsResolving(false);
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState?.();
        if (state === 3) {
          scannerRef.current.resume();
        }
      } catch (_) {}
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-title"
    >
      <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-[#EDE8E0] space-y-4">
        {/* Header Row */}
        <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-2">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[#D95A2B]" />
            <h2
              id="qr-scanner-title"
              className="font-bold text-sm text-[#1C2B29]"
            >
              Scan Machine QR
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close QR scanner"
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-full text-[#5C6460] hover:bg-[#FAF8F5] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback / Error Banner */}
        {errorMessage && (
          <div
            className={`text-xs p-3 rounded-xl border flex items-start gap-2 ${
              flagDisabled || errorMessage.includes("not enabled")
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : errorMessage.includes("not recognised")
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{errorMessage}</div>
          </div>
        )}

        {/* Scanner Viewport */}
        {!cameraUnavailable && !flagDisabled && (
          <div className="relative w-full aspect-square rounded-2xl bg-black overflow-hidden flex items-center justify-center border border-[#EDE8E0]">
            {(isInitializing || isResolving) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/90 bg-black/70 z-10 p-4 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-[#D95A2B]" />
                <span className="text-xs font-semibold">
                  {isResolving ? "Resolving machine..." : "Starting camera..."}
                </span>
              </div>
            )}
            <div
              id={SCANNER_REGION_ID}
              className="w-full h-full [&_video]:object-cover [&_video]:w-full [&_video]:h-full"
            />
          </div>
        )}

        {/* Manual Lookup Form (shown when camera unavailable, flag disabled, or as fallback) */}
        {(cameraUnavailable || flagDisabled) && (
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="manual-qr-input"
                className="text-[11px] font-bold text-[#5C6460] block mb-1.5"
              >
                Machine Code or QR Identifier
              </label>
              <input
                id="manual-qr-input"
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="e.g. CDU-7500X or QR001"
                disabled={isResolving}
                className="w-full min-h-[48px] bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl px-3 py-2 text-xs text-[#1C2B29] focus:outline-none focus:border-[#D95A2B]"
              />
            </div>
            <button
              type="submit"
              disabled={isResolving || !manualCode.trim()}
              aria-label="Look up machine by code"
              className="w-full min-h-[48px] py-3 rounded-xl bg-[#D95A2B] hover:bg-[#C84E18] disabled:opacity-50 text-white text-xs font-bold transition shadow-xs flex items-center justify-center gap-2"
            >
              {isResolving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Looking up...</span>
                </>
              ) : (
                <span>Look up</span>
              )}
            </button>
          </form>
        )}

        {/* Retry Scanner Button when generic error occurs during active camera mode */}
        {!cameraUnavailable && !flagDisabled && errorMessage && !isResolving && (
          <button
            type="button"
            onClick={handleRetryScan}
            aria-label="Resume scanning"
            className="w-full min-h-[48px] py-3 rounded-xl bg-[#FAF8F5] border border-[#E5E0D8] hover:bg-[#F0EDE6] text-[#1C2B29] text-xs font-semibold transition flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4 text-[#5C6460]" />
            <span>Resume Scan</span>
          </button>
        )}

        {/* Switch to manual lookup button if camera is running */}
        {!cameraUnavailable && !flagDisabled && (
          <button
            type="button"
            onClick={() => setCameraUnavailable(true)}
            aria-label="Enter machine code manually"
            className="w-full min-h-[48px] text-xs text-[#5C6460] hover:text-[#1C2B29] font-medium text-center"
          >
            Can&apos;t scan? Enter code manually
          </button>
        )}

        {/* Cancel / Close Action */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Cancel scanning"
          className="w-full min-h-[48px] py-2.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F0EDE6] text-[#5C6460] hover:text-[#1C2B29] text-xs font-semibold transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default QrScannerModal;

