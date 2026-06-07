import * as ort from "onnxruntime-web/webgpu";
import type { VideoSample } from "mediabunny";
import type { DetectedFace, DetectorEP } from "@/lib/types";
import {
  computeLetterboxLayout,
  letterboxBoxToNorm,
  letterboxPointToNorm,
  type LetterboxLayout,
} from "@/lib/coords";
import { decodeYoloOutput, nmsYolo } from "@/lib/model/yolo-decode";
import { loadYoloModel } from "@/lib/modelStore";
import {
  ORT_SESSION_OPTIONS,
  configureOrtEnv,
  executionProvidersFor,
  resolveDetectorEP,
  type FaceDetector,
} from "./detector";
import type { Emit } from "./runtime";

const YOLO_INPUT_SIZE = 640;
const LETTERBOX_FILL = "rgb(114,114,114)";
const NMS_IOU = 0.45;

interface WarmYolo {
  session: ort.InferenceSession;
  ep: DetectorEP;
}

let warmYolo: WarmYolo | null = null;
let warmYoloPromise: Promise<WarmYolo> | null = null;

async function createYoloSession(
  onPhase?: (loaded: number, total: number) => void,
): Promise<WarmYolo> {
  const total = 3;
  configureOrtEnv();
  const ep = await resolveDetectorEP();
  onPhase?.(1, total);
  const model = await loadYoloModel();
  onPhase?.(2, total);

  const session = await ort.InferenceSession.create(model, {
    executionProviders: executionProvidersFor(ep),
    ...ORT_SESSION_OPTIONS,
  });
  onPhase?.(3, total);
  return { session, ep };
}

function ensureYoloSession(
  onPhase?: (loaded: number, total: number) => void,
): Promise<WarmYolo> {
  if (warmYolo) {
    onPhase?.(3, 3);
    return Promise.resolve(warmYolo);
  }
  if (!warmYoloPromise) {
    warmYoloPromise = createYoloSession(onPhase)
      .then((w) => {
        warmYolo = w;
        return w;
      })
      .catch((err) => {
        warmYoloPromise = null;
        throw err;
      });
  }
  return warmYoloPromise;
}

export async function preloadYoloSession(emit?: Emit): Promise<void> {
  await ensureYoloSession((loaded, total) => emit?.({ type: "modelProgress", loaded, total }));
}

export class YoloFaceOnnxDetector implements FaceDetector {
  readonly ep: DetectorEP;

  private readonly session: ort.InferenceSession;
  private readonly ownsSession: boolean;
  private readonly layout: LetterboxLayout;
  private readonly encodeW: number;
  private readonly encodeH: number;
  private readonly canvas: OffscreenCanvas;
  private readonly ctx: OffscreenCanvasRenderingContext2D;
  private readonly input: Float32Array;
  private readonly inputSize: number;
  private readonly inputArea: number;
  private readonly inputName: string;

  static async create(
    encodeW: number,
    encodeH: number,
    inputSize: number = YOLO_INPUT_SIZE,
  ): Promise<YoloFaceOnnxDetector> {
    const { session, ep } = await ensureYoloSession();
    return new YoloFaceOnnxDetector(session, ep, encodeW, encodeH, inputSize);
  }

  private constructor(
    session: ort.InferenceSession,
    ep: DetectorEP,
    encodeW: number,
    encodeH: number,
    inputSize: number,
  ) {
    this.session = session;
    this.ownsSession = false;
    this.ep = ep;
    this.encodeW = encodeW;
    this.encodeH = encodeH;
    this.inputSize = Math.max(32, Math.round(inputSize / 32) * 32);
    this.layout = computeLetterboxLayout(encodeW, encodeH, this.inputSize);
    this.canvas = new OffscreenCanvas(this.inputSize, this.inputSize);
    const ctx = this.canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!ctx) throw new Error("Failed to acquire a 2D detection context.");
    this.ctx = ctx;
    this.inputArea = this.inputSize * this.inputSize;
    this.input = new Float32Array(3 * this.inputArea);
    this.inputName = session.inputNames[0];
  }

  async detect(sample: VideoSample, scoreThreshold: number): Promise<DetectedFace[]> {
    const { scaledW, scaledH, padX, padY } = this.layout;
    const size = this.inputSize;
    this.ctx.fillStyle = LETTERBOX_FILL;
    this.ctx.fillRect(0, 0, size, size);
    sample.draw(this.ctx, padX, padY, scaledW, scaledH);

    const rgba = this.ctx.getImageData(0, 0, size, size).data;
    for (let p = 0, i = 0; p < this.inputArea; p++, i += 4) {
      this.input[p] = rgba[i] / 255;
      this.input[this.inputArea + p] = rgba[i + 1] / 255;
      this.input[2 * this.inputArea + p] = rgba[i + 2] / 255;
    }

    const tensor = new ort.Tensor("float32", this.input, [1, 3, size, size]);
    const result = await this.session.run({ [this.inputName]: tensor });

    const allDets = [];
    for (const name of this.session.outputNames) {
      const t = result[name];
      const dims = t.dims as number[];
      if (dims.length !== 4) continue;
      const H = dims[2], W = dims[3];
      const stride = size / H;
      const dets = decodeYoloOutput(t.data as Float32Array, H, W, stride, scoreThreshold);
      allDets.push(...dets);
    }

    const kept = nmsYolo(allDets, NMS_IOU);
    return kept.map((d) => ({
      ...letterboxBoxToNorm(d.x, d.y, d.w, d.h, this.layout, this.encodeW, this.encodeH),
      score: d.score,
      landmarks: {
        pts: d.kps.map((kp) =>
          letterboxPointToNorm(kp.x, kp.y, this.layout, this.encodeW, this.encodeH),
        ),
        vis: d.kps.map((kp) => kp.vis),
      },
    }));
  }

  dispose(): void {
    if (this.ownsSession) void this.session.release();
  }
}
