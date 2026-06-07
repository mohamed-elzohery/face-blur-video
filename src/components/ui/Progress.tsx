"use client";

export function Progress({
  value = 0,
  label,
  showValue = true,
  indeterminate = false,
  className = "",
}: {
  value?: number;
  label?: string;
  showValue?: boolean;
  indeterminate?: boolean;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const cls = ["af-progress", indeterminate ? "af-progress--indeterminate" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls}>
      {label || (showValue && !indeterminate) ? (
        <div className="af-progress__head">
          {label ? <span className="af-progress__label">{label}</span> : <span />}
          {showValue && !indeterminate ? (
            <span className="af-progress__value">{Math.round(pct)}%</span>
          ) : null}
        </div>
      ) : null}
      <div
        className="af-progress__track"
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="af-progress__fill"
          style={indeterminate ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
