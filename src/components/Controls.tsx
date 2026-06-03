"use client";

import type { BlurStyle, JobConfig } from "@/lib/types";

const STYLE_OPTIONS: {
  value: BlurStyle;
  title: string;
  subtitle: string;
  thumbnail: string;
}[] = [
  { value: "gaussian", title: "Gaussian Blur", subtitle: "Smooth blur", thumbnail: "/styles/gaussian.png" },
  { value: "mosaic", title: "Pixelated", subtitle: "Pixel effect", thumbnail: "/styles/pixelated.png" },
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
        <span className="control-label" id="redaction-style-label">
          Blur style
        </span>
        <div className="style-cards" role="radiogroup" aria-labelledby="redaction-style-label">
          {STYLE_OPTIONS.map((opt) => {
            const selected = config.style === opt.value;
            return (
              <label
                key={opt.value}
                className={`style-card ${selected ? "style-card-selected" : ""}`}
                data-style={opt.value}
              >
                <input
                  type="radio"
                  name="redaction-style"
                  className="style-card-radio-input"
                  value={opt.value}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onChange({ ...config, style: opt.value })}
                />
                <span
                  className="style-card-thumb"
                  style={{ backgroundImage: `url(${opt.thumbnail})` }}
                  aria-hidden="true"
                />
                <span className="style-card-text">
                  <span className="style-card-title">{opt.title}</span>
                  <span className="style-card-subtitle">{opt.subtitle}</span>
                </span>
                <span className="style-card-dot" aria-hidden="true" />
              </label>
            );
          })}
        </div>
        <p className="hint">A soft blur looks gentler, but pixelation is harder to reverse.</p>
      </div>

      <div className="control">
        <label className="control-label" htmlFor="strength">
          Intensity <span className="control-value">{Math.round(config.strength * 100)}%</span>
        </label>
        <input
          id="strength"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={config.strength}
          disabled={disabled}
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
