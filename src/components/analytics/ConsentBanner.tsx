"use client";

import { setConsent } from "@/lib/consent";
import { Button } from "@/components/ui/Button";

export function ConsentBanner() {
  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      style={{
        position: "fixed",
        left: "var(--space-4)",
        right: "var(--space-4)",
        bottom: "var(--space-4)",
        zIndex: 60,
        maxWidth: "640px",
        margin: "0 auto",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-4)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border)",
        background: "color-mix(in oklch, var(--card) 92%, transparent)",
        backdropFilter: "saturate(1.4) blur(10px)",
        boxShadow: "0 10px 30px oklch(0 0 0 / 18%)",
      }}
    >
      <p
        style={{
          flex: "1 1 280px",
          margin: 0,
          fontSize: "0.875rem",
          lineHeight: 1.45,
          color: "var(--muted-foreground)",
        }}
      >
        We use privacy-respecting analytics to improve this tool. Your videos are processed
        entirely on your device and are never uploaded.
      </p>
      <div style={{ display: "flex", gap: "var(--space-2)", flex: "0 0 auto" }}>
        <Button variant="ghost" size="sm" onClick={() => setConsent("denied")}>
          Decline
        </Button>
        <Button variant="primary" size="sm" onClick={() => setConsent("granted")}>
          Accept
        </Button>
      </div>
    </div>
  );
}
