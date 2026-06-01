export type BlurStyle = "mosaic" | "gaussian" | "solid";
export type DetectorEngine = "yunet" | "yolo";
export type BlurBackend = "webgpu" | "webgl2";
export type DetectorEP = "webgpu" | "wasm";
export type CapabilityTier = "webgpu" | "webgl2" | "unsupported";

export const H264_MAIN = "avc1.4d0034";
export const H264_BASELINE = "avc1.42001f";

export interface RawFeatures {
  webcodecs: boolean;
  h264Main: boolean;
  h264Baseline: boolean;
  webgpu: boolean;
  webgl2: boolean;
  offscreenCanvas: boolean;
  opfs: boolean;
  secureContext: boolean;
  crossOriginIsolated: boolean;
  fileSystemAccess: boolean;
}

export interface CapabilityReport {
  supported: boolean;
  tier: CapabilityTier;
  blurBackend: BlurBackend | null;
  videoCodec: string | null;
  webcodecs: boolean;
  webgpu: boolean;
  webgl2: boolean;
  offscreenCanvas: boolean;
  fileSystemAccess: boolean;
  opfs: boolean;
  secureContext: boolean;
  crossOriginIsolated: boolean;
  reasons: string[];
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScoredBox extends Box {
  score: number;
}

export interface JobConfig {
  style: BlurStyle;
  strength: number;
  sensitivity: number;
  paddingFrac: number;
  detectEveryN: number;
  engine: DetectorEngine;
}

export const STYLE_CODE: Record<BlurStyle, number> = {
  mosaic: 0,
  gaussian: 1,
  solid: 2,
};

export const DEFAULT_JOB_CONFIG: JobConfig = {
  style: "mosaic",
  strength: 0.6,
  sensitivity: 0.35,
  paddingFrac: 0.25,
  detectEveryN: 2,
  engine: "yolo",
};

export type MainToWorker =
  | { type: "probe" }
  | { type: "start"; file: File; config: JobConfig }
  | { type: "cancel" };

export type WorkerToMain =
  | { type: "capabilities"; features: RawFeatures }
  | { type: "modelProgress"; loaded: number; total: number }
  | {
      type: "started";
      totalFrames: number | null;
      durationUs: number;
      fps: number;
      codec: string;
      blurBackend: BlurBackend;
      detectorEP: DetectorEP;
    }
  | {
      type: "progress";
      framesDone: number;
      totalFrames: number | null;
      currentTimeUs: number;
      throughputFps: number;
    }
  | { type: "done"; output: Blob; mimeType: string; fileName: string }
  | { type: "log"; level: "info" | "warn" | "error"; msg: string }
  | { type: "error"; code: string; message: string; recoverable: boolean };
