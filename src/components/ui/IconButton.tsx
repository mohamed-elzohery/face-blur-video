"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "ghost" | "outline" | "primary";
type Size = "sm" | "md" | "lg";

export function IconButton({
  variant = "ghost",
  size = "md",
  label,
  className = "",
  children,
  ...props
}: {
  variant?: Variant;
  size?: Size;
  label: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = [
    "af-iconbtn",
    `af-iconbtn--${variant}`,
    size !== "md" ? `af-iconbtn--${size}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} aria-label={label} title={label} {...props}>
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
