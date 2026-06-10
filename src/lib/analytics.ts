"use client";

import { sendGAEvent } from "@next/third-parties/google";
import { getConsent } from "./consent";
import type { CapabilityReport } from "./types";

export const GA_MEASUREMENT_ID = "G-XYWFHFJRF6";

export type AnalyticsEvent =
  | "app_open"
  | "unsupported_device"
  | "file_selected"
  | "process_started"
  | "process_completed"
  | "process_cancelled"
  | "process_error"
  | "result_downloaded"
  | "new_video";

type ParamValue = string | number | boolean | undefined;
type Params = Record<string, ParamValue>;

function enabled(): boolean {
  return typeof window !== "undefined" && getConsent() === "granted";
}

export function track(event: AnalyticsEvent, params: Params = {}): void {
  if (!enabled()) return;
  const clean: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) clean[k] = v;
  }
  sendGAEvent("event", event, clean);
}

export function setDeviceProps(report: CapabilityReport): void {
  if (!enabled()) return;
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { deviceMemory?: number })
      : undefined;
  sendGAEvent("set", "user_properties", {
    detector_ep: report.webgpu ? "gpu" : "cpu",
    blur_backend: report.blurBackend ?? "none",
    webgpu: report.webgpu,
    webgpu_blocklisted: report.webgpuBlocklisted,
    tier: report.tier,
    cross_origin_isolated: report.crossOriginIsolated,
    device_memory: nav?.deviceMemory ?? "unknown",
    hardware_concurrency: nav?.hardwareConcurrency ?? "unknown",
  });
}

export function sizeBucket(bytes: number): string {
  const mb = bytes / 1_000_000;
  if (mb < 5) return "0-5MB";
  if (mb < 25) return "5-25MB";
  if (mb < 100) return "25-100MB";
  if (mb < 500) return "100-500MB";
  return "500MB+";
}

export function durationBucket(seconds: number): string {
  if (seconds < 15) return "0-15s";
  if (seconds < 60) return "15-60s";
  if (seconds < 300) return "1-5m";
  if (seconds < 900) return "5-15m";
  return "15m+";
}
