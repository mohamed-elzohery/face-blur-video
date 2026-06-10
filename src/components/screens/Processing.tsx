"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProgressRing } from "@/components/ui/ProgressRing";

function formatEta(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 1) return `~${minutes}m ${seconds.toString().padStart(2, "0")}s left`;
  return `~${seconds}s left`;
}

function useEtaCountdown(progress: number): string | null {
  const startRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const rateRef = useRef<number | null>(null);
  const lastRef = useRef<{ t: number; p: number } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    startRef.current = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const p = progressRef.current;
      const last = lastRef.current;
      if (last && now > last.t && p > last.p) {
        const inst = (p - last.p) / (now - last.t);
        rateRef.current = rateRef.current === null ? inst : rateRef.current * 0.8 + inst * 0.2;
      }
      lastRef.current = { t: now, p };
      const elapsed = now - (startRef.current ?? now);
      const rate = rateRef.current;
      if (p <= 0.03 || elapsed < 2500 || !rate || rate <= 0) return;
      const target = Math.max(0, (1 - p) / rate);
      setRemaining((prev) => {
        if (prev === null) return target;
        const ticked = Math.max(0, prev - 1000);
        const drift = Math.max(5000, ticked * 0.25);
        return Math.abs(target - ticked) > drift ? target : ticked;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return remaining === null ? null : formatEta(remaining);
}

export function Processing({
  mode,
  progress,
  onCancel,
}: {
  mode: "scanning" | "blurring";
  progress: number;
  onCancel: () => void;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const title = mode === "scanning" ? "Finding faces in your video" : "Hold tight — blurring your video";
  const ringLabel = mode === "scanning" ? "Scanning locally" : "Processing locally";
  const eta = useEtaCountdown(progress);

  return (
    <div className="sb-proc">
      <ProgressRing value={pct} size={184} label={ringLabel} sublabel={eta ?? "Estimating…"} />
      <h2 className="sb-proc__title">{title}</h2>
      <span className="sb-proc__note">
        <Lock size={14} /> Your video never leaves this device
      </span>
      <Button variant="ghost" size="sm" iconLeft={<X size={14} />} onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
