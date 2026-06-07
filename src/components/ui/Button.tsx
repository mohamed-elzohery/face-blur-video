"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  iconLeft,
  iconRight,
  className = "",
  children,
  ...props
}: {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = [
    "af-btn",
    `af-btn--${variant}`,
    size !== "md" ? `af-btn--${size}` : "",
    fullWidth ? "af-btn--full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} {...props}>
      {iconLeft ? (
        <span className="af-btn__icon" aria-hidden="true">
          {iconLeft}
        </span>
      ) : null}
      {children ? <span>{children}</span> : null}
      {iconRight ? (
        <span className="af-btn__icon" aria-hidden="true">
          {iconRight}
        </span>
      ) : null}
    </button>
  );
}
