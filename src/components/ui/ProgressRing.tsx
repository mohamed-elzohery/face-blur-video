"use client";

import type { ReactNode } from "react";

export function ProgressRing({
  value = 0,
  size = 160,
  stroke = 10,
  label,
  sublabel,
  className = "",
}: {
  value?: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: ReactNode;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset var(--duration-slow) var(--ease-out)" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: "var(--weight-semibold)",
            fontSize: `calc(${size}px * 0.18)`,
            letterSpacing: "var(--tracking-tight)",
          }}
        >
          {Math.round(pct)}%
        </span>
        {label ? (
          <span style={{ font: "var(--text-caption)", color: "var(--muted-foreground)" }}>{label}</span>
        ) : null}
        {sublabel ? (
          <span
            style={{
              font: "var(--text-caption)",
              color: "var(--muted-foreground)",
              fontFeatureSettings: '"tnum" 1',
            }}
          >
            {sublabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
