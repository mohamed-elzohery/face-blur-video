import { describe, expect, it } from "vitest";
import { decideCapabilities } from "@/lib/capabilities";
import type { RawFeatures } from "@/lib/types";

const base: RawFeatures = {
  webcodecs: true,
  h264Main: true,
  h264Baseline: true,
  webgpu: true,
  webgpuApiPresent: true,
  webgl2: true,
  offscreenCanvas: true,
  opfs: true,
  secureContext: true,
  crossOriginIsolated: true,
  fileSystemAccess: false,
};

describe("decideCapabilities webgpu blocklist signal", () => {
  it("flags blocklisted when the WebGPU API is present but no adapter resolves", () => {
    const r = decideCapabilities({ ...base, webgpuApiPresent: true, webgpu: false });
    expect(r.webgpuBlocklisted).toBe(true);
    expect(r.webgpuApiPresent).toBe(true);
    expect(r.webgpu).toBe(false);
  });

  it("is not blocklisted when an adapter is available", () => {
    const r = decideCapabilities({ ...base, webgpuApiPresent: true, webgpu: true });
    expect(r.webgpuBlocklisted).toBe(false);
  });

  it("is not blocklisted when the WebGPU API is absent entirely", () => {
    const r = decideCapabilities({ ...base, webgpuApiPresent: false, webgpu: false });
    expect(r.webgpuBlocklisted).toBe(false);
  });
});
