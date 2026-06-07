"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function OptionCard({
  icon,
  title,
  description,
  badge,
  selected = false,
  className = "",
  children,
  ...props
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  selected?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={["af-option", className].filter(Boolean).join(" ")}
      data-selected={selected ? "true" : "false"}
      aria-pressed={selected}
      {...props}
    >
      <span className="af-option__check" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      {icon ? (
        <span className="af-option__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="af-option__title">
        {title}
        {badge}
      </span>
      {description ? <span className="af-option__desc">{description}</span> : null}
      {children}
    </button>
  );
}
