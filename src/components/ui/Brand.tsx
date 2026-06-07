"use client";

export function Brand() {
  return (
    <span className="sb-brand">
      <svg
        className="sb-brand__mark"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="SmartBlur"
      >
        <defs>
          <filter id="sb-mark-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.6" />
          </filter>
        </defs>
        <g stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" fill="none">
          <path d="M6 15 V9 a3 3 0 0 1 3 -3 H15" />
          <path d="M33 6 H39 a3 3 0 0 1 3 3 V15" />
          <path d="M42 33 V39 a3 3 0 0 1 -3 3 H33" />
          <path d="M15 42 H9 a3 3 0 0 1 -3 -3 V33" />
        </g>
        <circle cx="24" cy="24" r="8.5" fill="currentColor" filter="url(#sb-mark-blur)" opacity="0.9" />
      </svg>
      <span className="sb-brand__word">
        Smart<b>Blur</b>
      </span>
    </span>
  );
}
