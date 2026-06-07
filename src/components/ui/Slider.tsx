"use client";

export function Slider({
  min = 0,
  max = 100,
  step = 1,
  value,
  onChange,
  label,
  ticks,
  formatValue,
  disabled = false,
  className = "",
}: {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  label?: string;
  ticks?: string[];
  formatValue?: (value: number) => string;
  disabled?: boolean;
  className?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={["af-slider", className].filter(Boolean).join(" ")}>
      {label || formatValue ? (
        <div className="af-slider__head">
          {label ? <span className="af-slider__label">{label}</span> : <span />}
          {formatValue ? <span className="af-slider__value">{formatValue(value)}</span> : null}
        </div>
      ) : null}
      <input
        className="af-slider__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(90deg, var(--primary) ${pct}%, var(--muted) ${pct}%)`,
        }}
      />
      {ticks && ticks.length ? (
        <div className="af-slider__ticks">
          {ticks.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
