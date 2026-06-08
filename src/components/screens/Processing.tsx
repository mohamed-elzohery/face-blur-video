"use client";

import { Lock, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProgressRing } from "@/components/ui/ProgressRing";

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

  return (
    <div className="sb-proc">
      <ProgressRing value={pct} size={184} label={ringLabel} />
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
