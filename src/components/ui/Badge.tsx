"use client";

import type { HTMLAttributes, ReactNode } from "react";

type Variant = "default" | "primary" | "success" | "warning" | "destructive" | "outline";

export function Badge({
  variant = "default",
  icon,
  className = "",
  children,
  ...props
}: {
  variant?: Variant;
  icon?: ReactNode;
} & HTMLAttributes<HTMLSpanElement>) {
  const cls = ["af-badge", `af-badge--${variant}`, className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...props}>
      {icon ? (
        <span aria-hidden="true" style={{ display: "inline-flex" }}>
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
