"use client";

import { Lock, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProgressRing } from "@/components/ui/ProgressRing";

export function Processing({
  mode,
  progress,
  framesDone = 0,
  fps = 0,
  detectorEP = null,
  numThreads = null,
  crossOriginIsolated = null,
  lastLog = null,
  onCancel,
}: {
  mode: "scanning" | "blurring";
  progress: number;
  framesDone?: number;
  fps?: number;
  detectorEP?: string | null;
  numThreads?: number | null;
  crossOriginIsolated?: boolean | null;
  lastLog?: string | null;
  onCancel: () => void;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const title = mode === "scanning" ? "Finding faces in your video" : "Hold tight — blurring your video";
  const ringLabel = mode === "scanning" ? "Scanning locally" : "Processing locally";

  const engineBits: string[] = [];
  if (detectorEP) engineBits.push(`EP ${detectorEP}`);
  if (numThreads != null) engineBits.push(`${numThreads}× thread${numThreads === 1 ? "" : "s"}`);
  if (crossOriginIsolated != null) engineBits.push(crossOriginIsolated ? "isolated" : "not isolated");

  return (
    <div className="sb-proc">
      <ProgressRing value={pct} size={184} label={ringLabel} />
      <h2 className="sb-proc__title">{title}</h2>
      {mode === "blurring" && framesDone > 0 ? (
        <span className="sb-proc__meta">
          {framesDone} frames{fps > 0 ? ` · ${fps.toFixed(0)} fps` : ""}
        </span>
      ) : null}
      {mode === "blurring" && engineBits.length > 0 ? (
        <span className="sb-proc__meta">{engineBits.join(" · ")}</span>
      ) : null}
      {mode === "blurring" && lastLog ? (
        <code className="sb-proc__diag" style={{ fontSize: 11, opacity: 0.6, maxWidth: 420, textAlign: "center" }}>
          {lastLog}
        </code>
      ) : null}
      <span className="sb-proc__note">
        <Lock size={14} /> Your video never leaves this device
      </span>
      <Button variant="ghost" size="sm" iconLeft={<X size={14} />} onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
