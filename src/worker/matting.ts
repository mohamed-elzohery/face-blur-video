import * as ort from "onnxruntime-web/webgpu";
import type { VideoSample } from "mediabunny";
import type { DetectorEP } from "@/lib/types";
import { loadRvmModel } from "@/lib/modelStore";
import { logger } from "@/lib/log";
import {
  chooseMatteLayout,
  packRgbPlanar,
  type MatteLayout,
} from "@/lib/model/rvm-layout";
import {
  configureOrtEnv,
  executionProvidersFor,
  resolveDetectorEP,
  type DetectorTiming,
} from "./detector";
import type { Emit } from "./runtime";

export interface MaskData {
  data: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
}

const RVM_FETCHES = ["pha", "r1o", "r2o", "r3o", "r4o"];

interface WarmRvm {
  session: ort.InferenceSession;
  ep: DetectorEP;
}

let warmRvm: WarmRvm | null = null;
let warmRvmPromise: Promise<WarmRvm> | null = null;

async function createRvmSession(
  onPhase?: (loaded: number, total: number) => void,
): Promise<WarmRvm> {
  const total = 3;
  configureOrtEnv();
  const ep = await resolveDetectorEP();
  onPhase?.(1, total);
  const model = await loadRvmModel();
  onPhase?.(2, total);
  const session = await ort.InferenceSession.create(model, {
    executionProviders: executionProvidersFor(ep),
    graphOptimizationLevel: "all",
    enableCpuMemArena: true,
  });
  onPhase?.(3, total);
  return { session, ep };
}

function ensureRvmSession(
  onPhase?: (loaded: number, total: number) => void,
): Promise<WarmRvm> {
  if (warmRvm) {
    onPhase?.(3, 3);
    return Promise.resolve(warmRvm);
  }
  if (!warmRvmPromise) {
    warmRvmPromise = createRvmSession(onPhase)
      .then((w) => {
        warmRvm = w;
        return w;
      })
      .catch((err) => {
        warmRvmPromise = null;
        throw err;
      });
  }
  return warmRvmPromise;
}

export async function preloadRvmSession(emit?: Emit): Promise<void> {
  await ensureRvmSession((loaded, total) =>
    emit?.({ type: "modelProgress", loaded, total, model: "matting" }),
  );
}

type RecurrentFeeds = {
  r1i: ort.Tensor;
  r2i: ort.Tensor;
  r3i: ort.Tensor;
  r4i: ort.Tensor;
};

function zeroStates(): RecurrentFeeds {
  const zero = () => new ort.Tensor("float32", new Float32Array(1), [1, 1, 1, 1]);
  return { r1i: zero(), r2i: zero(), r3i: zero(), r4i: zero() };
}

export class RvmMatting {
  readonly ep: DetectorEP;
  readonly layout: MatteLayout;

  private readonly session: ort.InferenceSession;
  private readonly canvas: OffscreenCanvas;
  private readonly ctx: OffscreenCanvasRenderingContext2D;
  private readonly input: Float32Array;
  private readonly mask: Uint8Array<ArrayBuffer>;
  private readonly dsTensor: ort.Tensor;
  private rec: RecurrentFeeds;
  private prepMs = 0;
  private runMs = 0;
  private decodeMs = 0;
  private runs = 0;

  static async create(displayWidth: number, displayHeight: number): Promise<RvmMatting> {
    const { session, ep } = await ensureRvmSession();
    const layout = chooseMatteLayout(displayWidth, displayHeight, ep);
    const matting = new RvmMatting(session, ep, layout);
    await matting.warmup();
    return matting;
  }

  private constructor(session: ort.InferenceSession, ep: DetectorEP, layout: MatteLayout) {
    this.session = session;
    this.ep = ep;
    this.layout = layout;
    this.canvas = new OffscreenCanvas(layout.matteW, layout.matteH);
    const ctx = this.canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!ctx) throw new Error("Failed to acquire a 2D matting context.");
    this.ctx = ctx;
    this.input = new Float32Array(3 * layout.matteW * layout.matteH);
    this.mask = new Uint8Array(layout.matteW * layout.matteH);
    this.dsTensor = new ort.Tensor("float32", Float32Array.of(layout.downsampleRatio), [1]);
    this.rec = zeroStates();
  }

  private async warmup(): Promise<void> {
    try {
      await this.run();
      await this.run();
    } catch (err) {
      logger.warn(`RVM warmup run failed: ${err instanceof Error ? err.message : err}`);
    }
    this.rec = zeroStates();
    this.input.fill(0);
  }

  private async run(): Promise<ort.Tensor> {
    const { matteW, matteH } = this.layout;
    const src = new ort.Tensor("float32", this.input, [1, 3, matteH, matteW]);
    const result = await this.session.run(
      { src, ...this.rec, downsample_ratio: this.dsTensor },
      RVM_FETCHES,
    );
    this.rec = {
      r1i: result.r1o,
      r2i: result.r2o,
      r3i: result.r3o,
      r4i: result.r4o,
    };
    return result.pha;
  }

  async matte(sample: VideoSample): Promise<MaskData> {
    const { matteW, matteH } = this.layout;
    const prepStart = performance.now();
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, matteW, matteH);
    sample.draw(this.ctx, 0, 0, matteW, matteH);
    const rgba = this.ctx.getImageData(0, 0, matteW, matteH).data;
    packRgbPlanar(rgba, this.input);

    const runStart = performance.now();
    this.prepMs += runStart - prepStart;
    const pha = await this.run();
    const decodeStart = performance.now();
    this.runMs += decodeStart - runStart;

    const data = pha.data as Float32Array;
    for (let p = 0; p < this.mask.length; p++) {
      const v = data[p];
      this.mask[p] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0;
    }
    this.decodeMs += performance.now() - decodeStart;
    this.runs += 1;
    return { data: this.mask, width: matteW, height: matteH };
  }

  timing(): DetectorTiming {
    return { prepMs: this.prepMs, runMs: this.runMs, decodeMs: this.decodeMs, runs: this.runs };
  }

  dispose(): void {
    this.rec = zeroStates();
  }
}
