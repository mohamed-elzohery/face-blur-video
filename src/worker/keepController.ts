import type { VideoSample } from "mediabunny";
import { ALIGNED_SIZE, warpFaceTo112 } from "@/lib/model/face-align";
import { faceQuality, laplacianVariance } from "@/lib/model/face-quality";
import { bestMatch } from "./cluster";
import type { FaceEmbedder } from "./embedder";
import type { TrackMatch } from "./tracker";

const KEEP_COSINE = 0.42;

export class KeepController {
  private readonly decisions = new Map<number, boolean>();
  private readonly kept = new Set<number>();
  private readonly ctx: OffscreenCanvasRenderingContext2D;

  constructor(
    private readonly embedder: FaceEmbedder,
    private readonly keepCentroids: Float32Array[],
    private readonly width: number,
    private readonly height: number,
  ) {
    const canvas = new OffscreenCanvas(ALIGNED_SIZE, ALIGNED_SIZE);
    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!ctx) throw new Error("Couldn't create a 2D context for face matching.");
    this.ctx = ctx;
  }

  async onDetections(matches: TrackMatch[], sample: VideoSample): Promise<void> {
    for (const { id, det } of matches) {
      if (this.decisions.has(id) || !det.landmarks) continue;

      const prelim = faceQuality({
        box: det,
        score: det.score,
        W: this.width,
        H: this.height,
        landmarks: det.landmarks,
      });
      if (!prelim.eligible) continue;

      const lmPx = det.landmarks.pts.map(
        ([nx, ny]): [number, number] => [nx * this.width, ny * this.height],
      );
      warpFaceTo112(sample, lmPx, this.ctx);
      const aligned = this.ctx.getImageData(0, 0, ALIGNED_SIZE, ALIGNED_SIZE);
      const sharpness = laplacianVariance(aligned);
      const quality = faceQuality({
        box: det,
        score: det.score,
        W: this.width,
        H: this.height,
        landmarks: det.landmarks,
        sharpness,
      });
      if (!quality.eligible) continue;

      const emb = await this.embedder.embed(aligned);
      const keep = bestMatch(emb, this.keepCentroids).cosine >= KEEP_COSINE;
      this.decisions.set(id, keep);
      if (keep) this.kept.add(id);
    }
  }

  isKept(trackId: number): boolean {
    return this.kept.has(trackId);
  }
}
