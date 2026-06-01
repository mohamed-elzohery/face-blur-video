"use client";

import { useCallback, useRef, useState } from "react";

export function Dropzone({
  onFile,
  disabled = false,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file && file.type.startsWith("video/")) onFile(file);
    },
    [onFile],
  );

  const open = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div
      className={`dropzone${dragging ? " dropzone-active" : ""}${disabled ? " dropzone-disabled" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) pick(e.dataTransfer.files);
      }}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => pick(e.target.files)}
      />
      <div className="dropzone-icon" aria-hidden>
        ⬆
      </div>
      <p className="dropzone-title">Drop a video here, or click to choose</p>
      <p className="dropzone-sub">MP4 · MOV · WebM · MKV — processed locally, never uploaded</p>
    </div>
  );
}
