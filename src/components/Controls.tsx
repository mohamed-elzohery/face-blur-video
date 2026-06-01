"use client";

import type { BlurStyle, JobConfig } from "@/lib/types";

const STYLES: { value: BlurStyle; label: string }[] = [
  { value: "mosaic", label: "Mosaic" },
  { value: "gaussian", label: "Gaussian" },
  { value: "solid", label: "Solid" },
];

export function Controls({
  config,
  onChange,
  disabled = false,
}: {
  config: JobConfig;
  onChange: (config: JobConfig) => void;
  disabled?: boolean;
}) {
  return (
    <div className="controls">
      <div className="control">
        <span className="control-label">Redaction style</span>
        <div className="seg-group" role="group" aria-label="Redaction style">
          {STYLES.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`seg ${config.style === s.value ? "seg-active" : ""}`}
              disabled={disabled}
              onClick={() => onChange({ ...config, style: s.value })}
            >
              {s.label}
            </button>
          ))}
        </div>
        {config.style === "gaussian" && (
          <p className="hint">A soft blur looks gentler, but mosaic and solid are harder to reverse.</p>
        )}
      </div>

      <div className="control">
        <label className="control-label" htmlFor="strength">
          Strength <span className="control-value">{Math.round(config.strength * 100)}%</span>
        </label>
        <input
          id="strength"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={config.strength}
          disabled={disabled || config.style === "solid"}
          onChange={(e) => onChange({ ...config, strength: Number(e.target.value) })}
        />
      </div>

      <div className="control">
        <label className="control-label" htmlFor="sensitivity">
          Detection sensitivity <span className="control-value">{config.sensitivity.toFixed(2)}</span>
        </label>
        <input
          id="sensitivity"
          type="range"
          min={0.15}
          max={0.7}
          step={0.05}
          value={config.sensitivity}
          disabled={disabled}
          onChange={(e) => onChange({ ...config, sensitivity: Number(e.target.value) })}
        />
        <p className="hint">Lower catches more faces (safer for privacy); higher reduces false positives.</p>
      </div>
    </div>
  );
}
