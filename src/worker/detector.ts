import * as ort from "onnxruntime-web";
import type { VideoSample } from "mediabunny";
import type { DetectedFace, DetectorEP } from "@/lib/types";
import { computeDetectLayout, detBoxToNormalized, type DetectLayout } from "@/lib/coords";
import { decodeYuNet, nms } from "@/lib/model/yunet-decode";
import { loadYuNetModel } from "@/lib/modelStore";
import { logger } from "@/lib/log";
import { THREAD_CAP, pickNumThreads } from "./ortThreads";

export interface FaceDetector {
  readonly ep: DetectorEP;
  detect(sample: VideoSample, scoreThreshold: number): Promise<DetectedFace[]>;
  dispose(): void;
}

const DETECT_LONG_SIDE = 480;
const NMS_IOU = 0.3;

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
    `ORT WASM env: numThreads=${resolvedThreads}, crossOriginIsolated=${isolated}, simd=true`,
  );
  envConfigured = true;
}

export const ORT_SESSION_OPTIONS = {
  graphOptimizationLevel: "all",
  enableCpuMemArena: true,
} as const;

export class YuNetOnnxDetector implements FaceDetector {
  readonly ep: DetectorEP;

  private readonly session: ort.InferenceSession;
  private readonly layout: DetectLayout;
  private readonly encodeW: number;
  private readonly encodeH: number;
  private readonly canvas: OffscreenCanvas;
  private readonly ctx: OffscreenCanvasRenderingContext2D;
  private readonly input: Float32Array;
  private readonly inputName: string;

  static async create(encodeW: number, encodeH: number): Promise<YuNetOnnxDetector> {
    configureOrtEnv();
    const model = await loadYuNetModel();

    let session: ort.InferenceSession;
    let ep: DetectorEP;
    try {
      session = await ort.InferenceSession.create(model, {
        executionProviders: ["webgpu"],
        ...ORT_SESSION_OPTIONS,
      });
      ep = "webgpu";
    } catch (err) {
      logger.warn(
        `ONNX Runtime WebGPU EP unavailable (${err instanceof Error ? err.message : err}); using WASM EP.`,
      );
      session = await ort.InferenceSession.create(model, {
        executionProviders: ["wasm"],
        ...ORT_SESSION_OPTIONS,
      });
      ep = "wasm";
    }
    return new YuNetOnnxDetector(session, ep, encodeW, encodeH);
  }

  private constructor(
    session: ort.InferenceSession,
    ep: DetectorEP,
    encodeW: number,
    encodeH: number,
  ) {
    this.session = session;
    this.ep = ep;
    this.encodeW = encodeW;
    this.encodeH = encodeH;
    this.layout = computeDetectLayout(encodeW, encodeH, DETECT_LONG_SIDE);
    this.canvas = new OffscreenCanvas(this.layout.detW, this.layout.detH);
    const ctx = this.canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!ctx) throw new Error("Failed to acquire a 2D detection context.");
    this.ctx = ctx;
    this.input = new Float32Array(3 * this.layout.detW * this.layout.detH);
    this.inputName = session.inputNames[0];
  }

  async detect(sample: VideoSample, scoreThreshold: number): Promise<DetectedFace[]> {
    const { detW, detH, scaledW, scaledH } = this.layout;
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
    const result = await this.session.run({ [this.inputName]: tensor });

    const outputs: Record<string, Float32Array> = {};
    for (const name of this.session.outputNames) {
      outputs[name] = result[name].data as Float32Array;
    }

    const pixelBoxes = decodeYuNet(outputs, detW, detH, scoreThreshold);
    const kept = nms(pixelBoxes, NMS_IOU);
    return kept.map((b) => ({
      ...detBoxToNormalized(b.x, b.y, b.w, b.h, this.layout, this.encodeW, this.encodeH),
      score: b.score,
    }));
  }

  dispose(): void {
    void this.session.release();
  }
}
