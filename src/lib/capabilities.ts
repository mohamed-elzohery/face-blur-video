import {
  H264_BASELINE,
  H264_MAIN,
  type CapabilityReport,
  type CapabilityTier,
  type DetectorEngine,
  type RawFeatures,
} from "./types";
import { isMobileWebKit } from "./platform";

export function engineForReport(report: CapabilityReport): DetectorEngine {
  return report.webgpu ? "yolo" : "yunet";
}

async function isVideoEncodeSupported(codec: string): Promise<boolean> {
  try {
    if (typeof VideoEncoder === "undefined") return false;
    const res = await VideoEncoder.isConfigSupported({
      codec,
      width: 1280,
      height: 720,
      bitrate: 4_000_000,
      framerate: 30,
    });
    return res.supported === true;
  } catch {
    return false;
  }
}

async function probeWebGPU(): Promise<boolean> {
  try {
    if (isMobileWebKit()) return false;
    if (typeof navigator === "undefined" || !("gpu" in navigator) || !navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return adapter != null;
  } catch {
    return false;
  }
}

function probeWebGL2(): boolean {
  try {
    if (typeof OffscreenCanvas === "undefined") return false;
    const gl = new OffscreenCanvas(1, 1).getContext("webgl2");
    return gl != null;
  } catch {
    return false;
  }
}

export async function probeFeatures(): Promise<RawFeatures> {
  const webcodecs =
    typeof VideoEncoder !== "undefined" &&
    typeof VideoDecoder !== "undefined" &&
    typeof VideoFrame !== "undefined";

  const [h264Main, h264Baseline, webgpu] = await Promise.all([
    webcodecs ? isVideoEncodeSupported(H264_MAIN) : Promise.resolve(false),
    webcodecs ? isVideoEncodeSupported(H264_BASELINE) : Promise.resolve(false),
    probeWebGPU(),
  ]);

  const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;

  const webgpuApiPresent =
    !isMobileWebKit() &&
    typeof navigator !== "undefined" &&
    "gpu" in navigator &&
    !!navigator.gpu;

  return {
    webcodecs,
    h264Main,
    h264Baseline,
    webgpu,
    webgpuApiPresent,
    webgl2: probeWebGL2(),
    offscreenCanvas: typeof OffscreenCanvas !== "undefined",
    opfs: !!storage && typeof storage.getDirectory === "function",
    secureContext: typeof isSecureContext !== "undefined" ? isSecureContext : false,
    crossOriginIsolated: typeof crossOriginIsolated !== "undefined" ? crossOriginIsolated : false,
    fileSystemAccess: false,
  };
}

export function detectMainFeatures(): Pick<RawFeatures, "fileSystemAccess"> {
  return {
    fileSystemAccess:
      typeof window !== "undefined" && typeof window.showSaveFilePicker === "function",
  };
}

export function decideCapabilities(f: RawFeatures): CapabilityReport {
  const reasons: string[] = [];

  if (!f.secureContext) {
    reasons.push("This tool needs a secure context (HTTPS, or localhost during development).");
  }
  if (!f.webcodecs) {
    reasons.push(
      "Your browser doesn't support the WebCodecs API, which is required to decode and encode video in the browser.",
    );
  }
  if (!f.offscreenCanvas) {
    reasons.push("Your browser doesn't support OffscreenCanvas, which is required for off-thread rendering.");
  }

  const canBlur = f.webgpu || f.webgl2;
  if (f.webcodecs && !canBlur) {
    reasons.push("Your browser supports neither WebGPU nor WebGL2, so faces can't be blurred on the GPU.");
  }

  const videoCodec = f.h264Main ? H264_MAIN : f.h264Baseline ? H264_BASELINE : null;
  if (f.webcodecs && !videoCodec) {
    reasons.push("No supported H.264 encoder configuration was found in this browser.");
  }

  const supported =
    f.secureContext && f.webcodecs && f.offscreenCanvas && canBlur && videoCodec != null;
  const blurBackend = f.webgpu ? "webgpu" : f.webgl2 ? "webgl2" : null;
  const tier: CapabilityTier = !supported ? "unsupported" : f.webgpu ? "webgpu" : "webgl2";

  return {
    supported,
    tier,
    blurBackend,
    videoCodec,
    webcodecs: f.webcodecs,
    webgpu: f.webgpu,
    webgpuApiPresent: f.webgpuApiPresent,
    webgpuBlocklisted: f.webgpuApiPresent && !f.webgpu,
    webgl2: f.webgl2,
    offscreenCanvas: f.offscreenCanvas,
    fileSystemAccess: f.fileSystemAccess,
    opfs: f.opfs,
    secureContext: f.secureContext,
    crossOriginIsolated: f.crossOriginIsolated,
    reasons,
  };
}
