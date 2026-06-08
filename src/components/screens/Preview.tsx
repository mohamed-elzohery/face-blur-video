"use client";

import { useRef, useState } from "react";
import { Check, CheckCircle2, Download, RotateCcw, ShieldCheck } from "lucide-react";
import { saveBlob } from "@/lib/fileTarget";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

function formatMB(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
}

export function Preview({
  originalUrl,
  processedUrl,
  blob,
  fileName,
  fileSystemAccess,
  onRestart,
}: {
  originalUrl: string;
  processedUrl: string;
  blob: Blob;
  fileName: string;
  fileSystemAccess: boolean;
  onRestart: () => void;
}) {
  const processedRef = useRef<HTMLVideoElement>(null);
  const originalRef = useRef<HTMLVideoElement>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [toast, setToast] = useState(false);

  const switchTo = (target: "original" | "processed") => {
    const from = target === "original" ? processedRef.current : originalRef.current;
    const dest = target === "original" ? originalRef.current : processedRef.current;
    if (from && dest) {
      dest.currentTime = from.currentTime;
      if (from.paused) dest.pause();
      else void dest.play().catch(() => {});
      from.pause();
    }
    setShowOriginal(target === "original");
  };

  const exportVideo = async () => {
    const ok = await saveBlob(blob, fileName);
    if (ok) {
      setToast(true);
      setTimeout(() => setToast(false), 2600);
    }
  };

  return (
    <div className="sb-preview">
      <div className="sb-preview__head">
        <h2>Your video is anonymized</h2>
        <Badge variant="success" icon={<Check size={12} />}>
          Done
        </Badge>
      </div>

      <div className="sb-stage">
        <span className={`sb-stage__tag${showOriginal ? " warn" : ""}`}>
          {showOriginal ? "Original (unblurred)" : "Blurred"}
        </span>
        <video
          ref={processedRef}
          src={processedUrl}
          className="sb-stage__video"
          controls
          playsInline
          style={{ display: showOriginal ? "none" : "block" }}
        />
        <video
          ref={originalRef}
          src={originalUrl}
          className="sb-stage__video"
          controls
          playsInline
          muted
          style={{ display: showOriginal ? "block" : "none" }}
        />
      </div>

      <div className="sb-stage__toggle" role="group" aria-label="Compare">
        <button
          type="button"
          className="sb-seg"
          data-active={!showOriginal ? "true" : "false"}
          onClick={() => switchTo("processed")}
        >
          Blurred
        </button>
        <button
          type="button"
          className="sb-seg"
          data-active={showOriginal ? "true" : "false"}
          onClick={() => switchTo("original")}
        >
          Original
        </button>
      </div>

      <div className="sb-preview__meta">
        <div className="item">
          <span className="k">Output</span>
          <span className="v">MP4</span>
        </div>
        <div className="item">
          <span className="k">Size</span>
          <span className="v">{formatMB(blob.size)} MB</span>
        </div>
        <div className="item">
          <span className="k">Quality</span>
          <span className="v">Original</span>
        </div>
        <div className="item">
          <span className="k">Processed</span>
          <span className="v">On-device</span>
        </div>
      </div>

      <div className="sb-preview__actions">
        <Button
          variant="primary"
          size="lg"
          iconLeft={<Download size={18} />}
          onClick={() => void exportVideo()}
        >
          {fileSystemAccess ? "Export video" : "Download video"}
        </Button>
        <Button variant="outline" size="lg" iconLeft={<RotateCcw size={16} />} onClick={onRestart}>
          Upload a new video
        </Button>
      </div>

      <p className="sb-preview__assurance">
        <ShieldCheck size={14} /> Original quality · No frames dropped · No quality loss
      </p>

      <div className="sb-toast" data-show={toast ? "true" : "false"}>
        <CheckCircle2 size={16} /> Saved to your device
      </div>
    </div>
  );
}
