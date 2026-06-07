"use client";

import type { InputHTMLAttributes } from "react";

export function Switch({
  checked,
  defaultChecked,
  onChange,
  disabled,
  label,
  id,
  className = "",
  ...props
}: {
  label?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label
      className={["af-switch", className].filter(Boolean).join(" ")}
      data-disabled={disabled ? "true" : "false"}
      htmlFor={id}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange}
        disabled={disabled}
        {...props}
      />
      <span className="af-switch__track">
        <span className="af-switch__thumb" />
      </span>
      {label ? <span className="af-switch__label">{label}</span> : null}
    </label>
  );
}
