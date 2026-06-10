"use client";

import { useState } from "react";
import { Check, Copy, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";

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
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        <h2
          className="webgpu-hint__title"
          style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}
        >
          <Zap size={22} style={{ flexShrink: 0, marginTop: "0.1em" }} />
          <span>Make processing much faster</span>
        </h2>
        <IconButton variant="ghost" size="sm" label="Dismiss" onClick={() => setDismissed(true)}>
          <X size={16} />
        </IconButton>
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
        <li style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <span>Open this flag in a new browser tab:</span>
          <code style={{ wordBreak: "break-all" }}>{FLAG}</code>
          <Button
            variant="primary"
            size="sm"
            iconLeft={copied ? <Check size={14} /> : <Copy size={14} />}
            onClick={copy}
          >
            {copied ? "Copied — now paste it into a new tab" : "Copy flag link"}
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
