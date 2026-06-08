import * as ort from "onnxruntime-web/webgpu";
import { loadSFaceModel } from "@/lib/modelStore";
import { ALIGNED_SIZE } from "@/lib/model/face-align";
import { logger } from "@/lib/log";
import { ORT_SESSION_OPTIONS, configureOrtEnv } from "./detector";

export interface FaceEmbedder {
  embed(aligned: ImageData): Promise<Float32Array>;
  dispose(): void;
}

const PLANE = ALIGNED_SIZE * ALIGNED_SIZE;

export class SFaceOnnxEmbedder implements FaceEmbedder {
  private readonly session: ort.InferenceSession;
  private readonly inputName: string;
  private readonly outputName: string;
  private readonly input: Float32Array;

  static async create(): Promise<SFaceOnnxEmbedder> {
    configureOrtEnv();
    const model = await loadSFaceModel();
    const session = await ort.InferenceSession.create(model, {
      executionProviders: ["wasm"],
      ...ORT_SESSION_OPTIONS,
    });
    try {
      const warm = new ort.Tensor("float32", new Float32Array(3 * PLANE), [1, 3, ALIGNED_SIZE, ALIGNED_SIZE]);
      await session.run({ [session.inputNames[0]]: warm });
    } catch (err) {
      logger.warn(`SFace warmup run failed: ${err instanceof Error ? err.message : err}`);
    }
    return new SFaceOnnxEmbedder(session);
  }

  private constructor(session: ort.InferenceSession) {
    this.session = session;
    this.inputName = session.inputNames[0];
    this.outputName = session.outputNames[0];
    this.input = new Float32Array(3 * PLANE);
  }

  async embed(aligned: ImageData): Promise<Float32Array> {
    const rgba = aligned.data;
    for (let p = 0, i = 0; p < PLANE; p++, i += 4) {
      this.input[p] = rgba[i + 2];
      this.input[PLANE + p] = rgba[i + 1];
      this.input[2 * PLANE + p] = rgba[i];
    }

    const tensor = new ort.Tensor("float32", this.input, [1, 3, ALIGNED_SIZE, ALIGNED_SIZE]);
    const result = await this.session.run({ [this.inputName]: tensor });
    const raw = result[this.outputName].data as Float32Array;

    const out = new Float32Array(raw.length);
    let norm = 0;
    for (let i = 0; i < raw.length; i++) norm += raw[i] * raw[i];
    const inv = 1 / (Math.sqrt(norm) + 1e-12);
    for (let i = 0; i < raw.length; i++) out[i] = raw[i] * inv;
    return out;
  }

  dispose(): void {
    void this.session.release();
  }
}
