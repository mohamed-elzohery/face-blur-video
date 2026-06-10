"use client";

import { useEffect, useRef } from "react";
import { setDeviceProps, track } from "@/lib/analytics";
import { useConsent } from "@/lib/consent";
import type { PipelineStatus } from "@/hooks/usePipeline";
import type { CapabilityReport } from "@/lib/types";

export function useSessionAnalytics(
  report: CapabilityReport | null,
  status: PipelineStatus,
): void {
  const consent = useConsent();
  const sessionSentRef = useRef(false);
  const unsupportedSentRef = useRef(false);

  useEffect(() => {
    if (consent !== "granted" || !report || sessionSentRef.current) return;
    sessionSentRef.current = true;
    setDeviceProps(report);
    track("app_open", {
      detector_ep: report.webgpu ? "gpu" : "cpu",
      webgpu: report.webgpu,
      supported: report.supported,
    });
  }, [consent, report]);

  useEffect(() => {
    if (consent !== "granted" || status !== "unsupported" || !report || unsupportedSentRef.current)
      return;
    unsupportedSentRef.current = true;
    track("unsupported_device", { tier: report.tier, reason: report.reasons[0] ?? "" });
  }, [consent, status, report]);
}
