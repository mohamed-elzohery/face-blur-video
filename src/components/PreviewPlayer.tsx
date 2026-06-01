"use client";

import { useRef, useState } from "react";

export function PreviewPlayer({
  originalUrl,
  processedUrl,
}: {
  originalUrl: string;
  processedUrl: string;
}) {
  const processedRef = useRef<HTMLVideoElement>(null);
  const originalRef = useRef<HTMLVideoElement>(null);
  const [showOriginal, setShowOriginal] = useState(false);

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

  return (
    <div className="preview">
      <div className="preview-stage">
        <video
          ref={processedRef}
          src={processedUrl}
          className="preview-video"
          controls
          playsInline
          style={{ display: showOriginal ? "none" : "block" }}
        />
        <video
          ref={originalRef}
          src={originalUrl}
          className="preview-video"
          controls
          playsInline
          muted
          style={{ display: showOriginal ? "block" : "none" }}
        />
        <span className={`preview-tag ${showOriginal ? "preview-tag-warn" : ""}`}>
          {showOriginal ? "Original (unblurred)" : "Blurred"}
        </span>
      </div>
      <div className="seg-group preview-toggle" role="group" aria-label="Compare">
        <button
          type="button"
          className={`seg ${!showOriginal ? "seg-active" : ""}`}
          onClick={() => switchTo("processed")}
        >
          Blurred
        </button>
        <button
          type="button"
          className={`seg ${showOriginal ? "seg-active" : ""}`}
          onClick={() => switchTo("original")}
        >
          Original
        </button>
      </div>
    </div>
  );
}
