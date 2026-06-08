"use client";

import { useState } from "react";
import { Check, Copy, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";

const FLAG = "chrome://flags/#enable-unsafe-webgpu";

export function WebGpuHint() {
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (dismissed) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(FLAG);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

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
          <Zap size={18} /> Make processing much faster
        </h2>
        <Button variant="ghost" size="sm" iconLeft={<X size={14} />} onClick={() => setDismissed(true)}>
          Dismiss
        </Button>
      </div>
      <p>
        Your browser has WebGPU turned off for this device&rsquo;s GPU, so processing runs on the CPU
        and is much slower. Turning it on is dramatically faster at{" "}
        <strong>identical quality</strong>:
      </p>
      <ol
        style={{
          margin: "0 0 0 var(--space-5)",
          color: "var(--muted-foreground)",
          fontSize: "var(--text-sm)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        <li style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <span>
            Open <code>{FLAG}</code>
          </span>
          <Button
            variant="outline"
            size="sm"
            iconLeft={copied ? <Check size={13} /> : <Copy size={13} />}
            onClick={copy}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </li>
        <li>
          Set it to <strong>Enabled</strong>
        </li>
        <li>Relaunch the browser, then reload this page</li>
      </ol>
    </div>
  );
}
