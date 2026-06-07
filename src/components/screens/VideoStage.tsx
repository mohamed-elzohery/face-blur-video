"use client";

import type { ReactNode } from "react";

export function VideoStage({
  src,
  tag,
  tagWarn = false,
  muted = false,
  controls = true,
}: {
  src: string;
  tag?: ReactNode;
  tagWarn?: boolean;
  muted?: boolean;
  controls?: boolean;
}) {
  return (
    <div className="sb-stage">
      {tag ? <span className={`sb-stage__tag${tagWarn ? " warn" : ""}`}>{tag}</span> : null}
      <video className="sb-stage__video" src={src} controls={controls} playsInline muted={muted} />
    </div>
  );
}
