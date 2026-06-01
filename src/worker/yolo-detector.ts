import * as ort from "onnxruntime-web";
import type { VideoSample } from "mediabunny";
import type { DetectorEP, ScoredBox } from "@/lib/types";
import { computeLetterboxLayout, letterboxBoxToNorm, type LetterboxLayout } from "@/lib/coords";
import { decodeYoloOutput, nmsYolo } from "@/lib/model/yolo-decode";
import { loadYoloModel } from "@/lib/modelStore";
import { logger } from "@/lib/log";
import { configureOrtEnv, type FaceDetector } from "./detector";

const YOLO_INPUT_SIZE = 640;
const LETTERBOX_FILL = "rgb(114,114,114)";
const NMS_IOU = 0.45;

export class YoloFaceOnnxDetector implements FaceDetector {
  readonly ep: DetectorEP;

  private readonly session: ort.InferenceSession;
  private readonly layout: LetterboxLayout;
  private readonly encodeW: number;
  private readonly encodeH: number;
  private readonly canvas: OffscreenCanvas;
  private readonly ctx: OffscreenCanvasRenderingContext2D;
  private readonly input: Float32Array;
  private readonly inputArea: number;
  private readonly inputName: string;

  static async create(encodeW: number, encodeH: number): Promise<YoloFaceOnnxDetector> {
    configureOrtEnv();
    const model = await loadYoloModel();

    let session: ort.InferenceSession;
    let ep: DetectorEP;
    try {
      session = await ort.InferenceSession.create(model, { executionProviders: ["webgpu"] });
      ep = "webgpu";
    } catch (err) {
      logger.warn(
        `ONNX Runtime WebGPU EP unavailable (${err instanceof Error ? err.message : err}); using WASM EP.`,
      );
      session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
      ep = "wasm";
    }
    return new YoloFaceOnnxDetector(session, ep, encodeW, encodeH);
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
    this.layout = computeLetterboxLayout(encodeW, encodeH, YOLO_INPUT_SIZE);
    this.canvas = new OffscreenCanvas(YOLO_INPUT_SIZE, YOLO_INPUT_SIZE);
    const ctx = this.canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!ctx) throw new Error("Failed to acquire a 2D detection context.");
    this.ctx = ctx;
    this.inputArea = YOLO_INPUT_SIZE * YOLO_INPUT_SIZE;
    this.input = new Float32Array(3 * this.inputArea);
    this.inputName = session.inputNames[0];
  }

  async detect(sample: VideoSample, scoreThreshold: number): Promise<ScoredBox[]> {
    const { scaledW, scaledH, padX, padY } = this.layout;
    this.ctx.fillStyle = LETTERBOX_FILL;
    this.ctx.fillRect(0, 0, YOLO_INPUT_SIZE, YOLO_INPUT_SIZE);
    sample.draw(this.ctx, padX, padY, scaledW, scaledH);

    const rgba = this.ctx.getImageData(0, 0, YOLO_INPUT_SIZE, YOLO_INPUT_SIZE).data;
    for (let p = 0, i = 0; p < this.inputArea; p++, i += 4) {
      this.input[p] = rgba[i] / 255;
      this.input[this.inputArea + p] = rgba[i + 1] / 255;
      this.input[2 * this.inputArea + p] = rgba[i + 2] / 255;
    }

    const tensor = new ort.Tensor("float32", this.input, [1, 3, YOLO_INPUT_SIZE, YOLO_INPUT_SIZE]);
    const result = await this.session.run({ [this.inputName]: tensor });

    const allDets = [];
    for (const name of this.session.outputNames) {
      const t = result[name];
      const dims = t.dims as number[];
      if (dims.length !== 4) continue;
      const H = dims[2], W = dims[3];
      const stride = YOLO_INPUT_SIZE / H;
      const dets = decodeYoloOutput(t.data as Float32Array, H, W, stride, scoreThreshold);
      allDets.push(...dets);
    }

    const kept = nmsYolo(allDets, NMS_IOU);
    return kept.map((d) => ({
      ...letterboxBoxToNorm(d.x, d.y, d.w, d.h, this.layout, this.encodeW, this.encodeH),
      score: d.score,
    }));
  }

  dispose(): void {
    void this.session.release();
  }
}
