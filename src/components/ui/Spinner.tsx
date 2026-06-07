"use client";

import type { CSSProperties } from "react";

export function Spinner({
  size = 20,
  stroke = 2.5,
  className = "",
  style,
}: {
  size?: number;
  stroke?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={["af-spinner", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size, borderWidth: stroke, ...style }}
      role="status"
      aria-label="Loading"
    />
  );
}
