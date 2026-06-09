"use client";

import { useState } from "react";
import { Monitor, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function CpuHint() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      className="notice"
      role="note"
      style={{
        marginBottom: "var(--space-4)",
        borderColor: "color-mix(in oklch, var(--primary) 35%, var(--border))",
        background: "color-mix(in oklch, var(--primary) 7%, var(--card))",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        <h2 style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <Monitor size={18} /> Better accuracy on a computer
        </h2>
        <Button variant="ghost" size="sm" iconLeft={<X size={14} />} onClick={() => setDismissed(true)}>
          Dismiss
        </Button>
      </div>
      <p>
        This device runs a lightweight detector on its CPU. For the most accurate face detection, open
        this tool on a desktop or laptop &mdash; it still works here, just with a simpler model.
      </p>
    </div>
  );
}
