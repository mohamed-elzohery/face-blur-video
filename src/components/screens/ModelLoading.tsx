"use client";

import { CheckCircle2, ScanFace } from "lucide-react";
import { Progress } from "@/components/ui/Progress";
import { Spinner } from "@/components/ui/Spinner";

const MODELS: { id: string; label: string; size: string }[] = [
  { id: "runtime", label: "On-device runtime", size: "WASM" },
  { id: "detector", label: "Face detector", size: "12 MB" },
  { id: "optimize", label: "Optimizing for your device", size: "" },
];

export function ModelLoading({ progress, checking }: { progress: number; checking?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const doneCount = Math.floor((pct / 100) * MODELS.length + 0.0001);

  return (
    <div className="sb-ml">
      <div className="sb-ml__viz">
        <span className="sb-ml__ring pulse" />
        <span className="sb-ml__ring pulse d2" />
        <span className="sb-ml__ring pulse d3" />
        <span className="sb-ml__core">
          <ScanFace size={34} />
          <span className="sb-ml__scan" />
        </span>
      </div>
      <h2 className="sb-ml__title">{checking ? "Checking your browser" : "Warming up SmartBlur"}</h2>
      <p className="sb-ml__sub">
        Loading the on-device models — this happens once and runs entirely in your browser.
      </p>
      <div className="sb-ml__list">
        {MODELS.map((m, i) => {
          const done = i < doneCount;
          return (
            <div key={m.id} className="sb-ml__item" data-done={done ? "true" : "false"}>
              <span className="sb-ml__ico">
                {done ? <CheckCircle2 size={16} /> : <Spinner size={15} />}
              </span>
              {m.label}
              {m.size ? <span className="sb-ml__size">{m.size}</span> : <span className="sb-ml__size" />}
            </div>
          );
        })}
      </div>
      <Progress value={pct} showValue label="Initializing" />
    </div>
  );
}
