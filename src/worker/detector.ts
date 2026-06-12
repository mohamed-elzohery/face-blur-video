import * as ort from "onnxruntime-web/webgpu";
import type { VideoSample } from "mediabunny";
import type { DetectedFace, DetectorEP } from "@/lib/types";
import {
  computeDetectLayout,
  detBoxToNormalized,
  detPointToNormalized,
  type DetectLayout,
} from "@/lib/coords";
import { decodeYuNet, nms } from "@/lib/model/yunet-decode";
import { isPlausibleFaceGeometry } from "@/lib/model/face-geometry";
import { loadYuNetModel } from "@/lib/modelStore";
import { logger } from "@/lib/log";
import { THREAD_CAP, pickNumThreads } from "./ortThreads";
import type { Emit } from "./runtime";

export interface DetectorTiming {
  prepMs: number;
  runMs: number;
  decodeMs: number;
  runs: number;
}

export interface FaceDetector {
  readonly ep: DetectorEP;
  detect(sample: VideoSample, scoreThreshold: number): Promise<DetectedFace[]>;
  timing?(): DetectorTiming;
  dispose(): void;
}

const DETECT_LONG_SIDE = 480;
const NMS_IOU = 0.3;
const YUNET_SCORE_THRESHOLD = 0.6;

export const DEFAULT_SENSITIVITY = 0.35;

let resolvedThreads = 1;
export function resolvedNumThreads(): number {
  return resolvedThreads;
}

let envConfigured = false;
export function configureOrtEnv(): void {
  if (envConfigured) return;
  ort.env.wasm.wasmPaths = "/ort/";
  ort.env.wasm.simd = true;
  const isolated = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated === true;
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  resolvedThreads = pickNumThreads(isolated, cores, THREAD_CAP);
  ort.env.wasm.numThreads = resolvedThreads;
  logger.info(
    `ORT env: numThreads=${resolvedThreads}, crossOriginIsolated=${isolated}, simd=true`,
  );
  envConfigured = true;
}

let webgpuChecked = false;
let webgpuDevice: GPUDevice | null = null;
let webgpuAdapterOk = false;

export async function ensureWebGpuDevice(): Promise<GPUDevice | null> {
  if (webgpuChecked) return webgpuDevice;
  webgpuChecked = true;
  try {
    if (typeof navigator !== "undefined" && "gpu" in navigator && navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      webgpuAdapterOk = adapter != null;
      if (adapter) {
        const device = await adapter.requestDevice();
        ort.env.webgpu.device = device;
        webgpuDevice = device;
      }
    }
  } catch (err) {
    logger.warn(
      `WebGPU device init failed; falling back to wasm: ${err instanceof Error ? err.message : err}`,
    );
    webgpuDevice = null;
  }
  return webgpuDevice;
}

export function webgpuAdapterAvailable(): boolean {
  return webgpuAdapterOk;
}

let detectorEP: DetectorEP | null = null;
export async function resolveDetectorEP(): Promise<DetectorEP> {
  if (detectorEP) return detectorEP;
  const device = await ensureWebGpuDevice();
  detectorEP = device ? "webgpu" : "wasm";
  return detectorEP;
}

export function executionProvidersFor(ep: DetectorEP): string[] {
  return ep === "webgpu" ? ["webgpu", "wasm"] : ["wasm"];
}

export const ORT_SESSION_OPTIONS = {
  graphOptimizationLevel: "all",
  enableCpuMemArena: true,
  freeDimensionOverrides: { batch: 1 },
} as const;

const YUNET_WARMUP_SIZE = 480;

interface WarmYuNet {
  session: ort.InferenceSession;
  ep: DetectorEP;
}

let warmYuNet: WarmYuNet | null = null;
let warmYuNetPromise: Promise<WarmYuNet> | null = null;

async function warmupYuNetSession(session: ort.InferenceSession, size: number): Promise<void> {
  try {
    const warm = new ort.Tensor("float32", new Float32Array(3 * size * size), [1, 3, size, size]);
    await session.run({ [session.inputNames[0]]: warm });
  } catch (err) {
    logger.warn(`YuNet warmup run failed: ${err instanceof Error ? err.message : err}`);
  }
}

async function createYuNetSession(
  onPhase?: (loaded: number, total: number) => void,
): Promise<WarmYuNet> {
  const total = 3;
  configureOrtEnv();
  const ep = await resolveDetectorEP();
  onPhase?.(1, total);
  const model = await loadYuNetModel();
  onPhase?.(2, total);
  const session = await ort.InferenceSession.create(model, {
    executionProviders: executionProvidersFor(ep),
    ...ORT_SESSION_OPTIONS,
  });
  await warmupYuNetSession(session, YUNET_WARMUP_SIZE);
  onPhase?.(3, total);
  return { session, ep };
}

function ensureYuNetSession(
  onPhase?: (loaded: number, total: number) => void,
): Promise<WarmYuNet> {
  if (warmYuNet) {
    onPhase?.(3, 3);
    return Promise.resolve(warmYuNet);
  }
  if (!warmYuNetPromise) {
    warmYuNetPromise = createYuNetSession(onPhase)
      .then((w) => {
        warmYuNet = w;
        return w;
      })
      .catch((err) => {
        warmYuNetPromise = null;
        throw err;
      });
  }
  return warmYuNetPromise;
}

export async function preloadYuNetSession(emit?: Emit): Promise<void> {
  await ensureYuNetSession((loaded, total) =>
    emit?.({ type: "modelProgress", loaded, total, model: "detector" }),
  );
}

export class YuNetOnnxDetector implements FaceDetector {
  readonly ep: DetectorEP;

  private readonly session: ort.InferenceSession;
  private readonly ownsSession: boolean = false;
  private readonly layout: DetectLayout;
  private readonly encodeW: number;
  private readonly encodeH: number;
  private readonly canvas: OffscreenCanvas;
  private readonly ctx: OffscreenCanvasRenderingContext2D;
  private readonly input: Float32Array;
  private readonly inputName: string;
  private prepMs = 0;
  private runMs = 0;
  private decodeMs = 0;
  private runs = 0;

  static async create(
    encodeW: number,
    encodeH: number,
    inputLongSide: number = DETECT_LONG_SIDE,
  ): Promise<YuNetOnnxDetector> {
    const { session, ep } = await ensureYuNetSession();
    return new YuNetOnnxDetector(session, ep, encodeW, encodeH, inputLongSide);
  }

  private constructor(
    session: ort.InferenceSession,
    ep: DetectorEP,
    encodeW: number,
    encodeH: number,
    inputLongSide: number,
  ) {
    this.session = session;
    this.ep = ep;
    this.encodeW = encodeW;
    this.encodeH = encodeH;
    this.layout = computeDetectLayout(encodeW, encodeH, inputLongSide);
    this.canvas = new OffscreenCanvas(this.layout.detW, this.layout.detH);
    const ctx = this.canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!ctx) throw new Error("Failed to acquire a 2D detection context.");
    this.ctx = ctx;
    this.input = new Float32Array(3 * this.layout.detW * this.layout.detH);
    this.inputName = session.inputNames[0];
  }

  async detect(sample: VideoSample, scoreThreshold: number): Promise<DetectedFace[]> {
    const { detW, detH, scaledW, scaledH } = this.layout;
    const prepStart = performance.now();
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, detW, detH);
    sample.draw(this.ctx, 0, 0, scaledW, scaledH);

    const rgba = this.ctx.getImageData(0, 0, detW, detH).data;
    const plane = detW * detH;
    for (let p = 0, i = 0; p < plane; p++, i += 4) {
      this.input[p] = rgba[i + 2];
      this.input[plane + p] = rgba[i + 1];
      this.input[2 * plane + p] = rgba[i];
    }

    const tensor = new ort.Tensor("float32", this.input, [1, 3, detH, detW]);
    const runStart = performance.now();
    this.prepMs += runStart - prepStart;
    const result = await this.session.run({ [this.inputName]: tensor });
    const decodeStart = performance.now();
    this.runMs += decodeStart - runStart;

    const outputs: Record<string, Float32Array> = {};
    for (const name of this.session.outputNames) {
      outputs[name] = result[name].data as Float32Array;
    }

    const thr = Math.max(scoreThreshold, YUNET_SCORE_THRESHOLD);
    const pixelBoxes = decodeYuNet(outputs, detW, detH, thr);
    const kept = nms(pixelBoxes, NMS_IOU).filter((d) => isPlausibleFaceGeometry(d, d.kps));
    const mapped = kept.map((b): DetectedFace => ({
      ...detBoxToNormalized(b.x, b.y, b.w, b.h, this.layout, this.encodeW, this.encodeH),
      score: b.score,
      landmarks:
        b.kps.length > 0
          ? {
              pts: b.kps.map((p) => detPointToNormalized(p.x, p.y, this.layout, this.encodeW, this.encodeH)),
              vis: b.kps.map(() => 1),
            }
          : undefined,
    }));
    this.decodeMs += performance.now() - decodeStart;
    this.runs += 1;
    return mapped;
  }

  timing(): DetectorTiming {
    return { prepMs: this.prepMs, runMs: this.runMs, decodeMs: this.decodeMs, runs: this.runs };
  }

  dispose(): void {
    if (this.ownsSession) void this.session.release();
  }
}
