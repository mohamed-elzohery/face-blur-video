import { VideoSampleSink, type VideoSample } from "mediabunny";
import type { Box, FaceMeta, JobConfig } from "@/lib/types";
import { ALIGNED_SIZE, warpFaceTo112 } from "@/lib/model/face-align";
import { faceQuality, laplacianVariance } from "@/lib/model/face-quality";
import { PipelineError } from "./errors";
import { openSource } from "./io/source";
import { YoloFaceOnnxDetector } from "./yolo-detector";
import { SFaceOnnxEmbedder, type FaceEmbedder } from "./embedder";
import { clusterDetections, type DetRecord } from "./cluster";
import {
  assignTracksToIdentities,
  type GalleryIdentity,
  type TrackEmbeds,
} from "./blurPlan";
import { KalmanTracker } from "./tracker";
import type { AnalyzedPlan, FramePlan, PlanEntry } from "./renderPlan";
import { sourceIdentity } from "./renderPlan";
import type { Cancel, Emit } from "./runtime";

const MAX_EMBEDS = 600;
const MAX_EMBEDS_PER_TRACK = 6;
const THUMB_SIZE = 160;
const THUMB_PAD = 0.35;
const PROGRESS_INTERVAL_MS = 120;

const ANALYZE_TRACKER = {
  iouMatch: 0.3,
  maxCenterDist: 0.35,
  maxMisses: 8,
  qPos: 6e-3,
  qVel: 8e-4,
  measNoise: 5e-4,
};

interface TrackAccum {
  embeds: Float32Array[];
  bestThumb: ImageData | null;
  bestQ: number;
}

function normalizedMean(embeds: Float32Array[]): Float32Array {
  const dim = embeds[0].length;
  const sum = new Float32Array(dim);
  for (const e of embeds) for (let i = 0; i < dim; i++) sum[i] += e[i];
  let n = 0;
  for (let i = 0; i < dim; i++) n += sum[i] * sum[i];
  const inv = 1 / (Math.sqrt(n) + 1e-12);
  for (let i = 0; i < dim; i++) sum[i] *= inv;
  return sum;
}

function thumbnailData(
  sample: VideoSample,
  box: Box,
  W: number,
  H: number,
  ctx: OffscreenCanvasRenderingContext2D,
): ImageData {
  const cx = (box.x + box.w / 2) * W;
  const cy = (box.y + box.h / 2) * H;
  let side = Math.max(box.w * W, box.h * H) * (1 + THUMB_PAD);
  side = Math.min(side, W, H);
  const sx = Math.max(0, Math.min(cx - side / 2, W - side));
  const sy = Math.max(0, Math.min(cy - side / 2, H - side));

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
  sample.draw(ctx, sx, sy, side, side, 0, 0, THUMB_SIZE, THUMB_SIZE);
  return ctx.getImageData(0, 0, THUMB_SIZE, THUMB_SIZE);
}

export async function runAnalyze(
  file: File,
  config: JobConfig,
  emit: Emit,
  cancel: Cancel,
  emitGallery = true,
): Promise<AnalyzedPlan | null> {
  const src = await openSource(file);
  const { videoTrack, displayWidth, displayHeight, durationUs } = src;

  let detector: YoloFaceOnnxDetector;
  try {
    detector = await YoloFaceOnnxDetector.create(displayWidth, displayHeight);
  } catch (err) {
    src.input.dispose();
    throw new PipelineError(
      "detector-init",
      `Couldn't load the face-detection model: ${err instanceof Error ? err.message : err}`,
    );
  }

  let embedder: FaceEmbedder;
  try {
    embedder = await SFaceOnnxEmbedder.create();
  } catch (err) {
    detector.dispose();
    src.input.dispose();
    if (emitGallery) {
      emit({ type: "scanStarted", durationUs, detectorEP: detector.ep, recognitionEnabled: false });
    }
    throw new PipelineError(
      "recognition-unavailable",
      `Face recognition isn't available in this browser (${err instanceof Error ? err.message : err}). You can still blur every face.`,
      true,
    );
  }

  if (emitGallery) {
    emit({ type: "scanStarted", durationUs, detectorEP: detector.ep, recognitionEnabled: true });
  }

  const alignCanvas = new OffscreenCanvas(ALIGNED_SIZE, ALIGNED_SIZE);
  const alignCtx = alignCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
  const thumbCanvas = new OffscreenCanvas(THUMB_SIZE, THUMB_SIZE);
  const thumbCtx = thumbCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!alignCtx || !thumbCtx) {
    embedder.dispose();
    detector.dispose();
    src.input.dispose();
    throw new PipelineError("canvas", "Couldn't create a 2D context for face extraction.");
  }

  const tracker = new KalmanTracker({ ...ANALYZE_TRACKER, paddingFrac: config.paddingFrac });
  const framePlan: FramePlan = new Map();
  const accums = new Map<number, TrackAccum>();
  let totalEmbeds = 0;
  let lastProgress = 0;

  const sink = new VideoSampleSink(videoTrack);
  let frameIndex = 0;

  for await (const sample of sink.samples()) {
    if (cancel.cancelled) {
      sample.close();
      embedder.dispose();
      detector.dispose();
      src.input.dispose();
      emit({ type: "error", code: "cancelled", message: "Face scan was cancelled.", recoverable: true });
      return null;
    }

    tracker.predict();
    const detectFrame = frameIndex % config.detectEveryN === 0;
    if (detectFrame) {
      const dets = await detector.detect(sample, config.sensitivity);
      tracker.update(dets);

      for (const { id, det } of tracker.lastMatches()) {
        if (totalEmbeds >= MAX_EMBEDS) break;
        if (!det.landmarks) continue;
        const accum = accums.get(id);
        if (accum && accum.embeds.length >= MAX_EMBEDS_PER_TRACK) continue;

        const prelim = faceQuality({
          box: det,
          score: det.score,
          W: displayWidth,
          H: displayHeight,
          landmarks: det.landmarks,
        });
        if (!prelim.eligible) continue;

        const lmPx = det.landmarks.pts.map(
          ([nx, ny]): [number, number] => [nx * displayWidth, ny * displayHeight],
        );
        warpFaceTo112(sample, lmPx, alignCtx);
        const aligned = alignCtx.getImageData(0, 0, ALIGNED_SIZE, ALIGNED_SIZE);
        const sharpness = laplacianVariance(aligned);
        const quality = faceQuality({
          box: det,
          score: det.score,
          W: displayWidth,
          H: displayHeight,
          landmarks: det.landmarks,
          sharpness,
        });
        if (!quality.eligible) continue;

        const emb = await embedder.embed(aligned);
        const target = accum ?? { embeds: [], bestThumb: null, bestQ: -Infinity };
        target.embeds.push(emb);
        if (quality.q > target.bestQ) {
          target.bestQ = quality.q;
          target.bestThumb = thumbnailData(sample, det, displayWidth, displayHeight, thumbCtx);
        }
        if (!accum) accums.set(id, target);
        totalEmbeds += 1;
      }
    }

    const entries: PlanEntry[] = tracker
      .boxesWithIds()
      .map(({ id, box }) => ({ trackId: id, box }));
    framePlan.set(sample.microsecondTimestamp, entries);

    const currentTimeUs = sample.microsecondTimestamp;
    sample.close();
    frameIndex += 1;

    if (emitGallery) {
      const now = performance.now();
      if (now - lastProgress > PROGRESS_INTERVAL_MS) {
        lastProgress = now;
        emit({
          type: "scanProgress",
          progress: durationUs > 0 ? Math.min(1, currentTimeUs / durationUs) : 1,
        });
      }
    }
  }

  embedder.dispose();
  detector.dispose();
  src.input.dispose();

  const trackReps: { trackId: number; rep: Float32Array; q: number; thumb: ImageData | null }[] = [];
  for (const [trackId, accum] of accums) {
    if (accum.embeds.length === 0) continue;
    trackReps.push({
      trackId,
      rep: normalizedMean(accum.embeds),
      q: accum.bestQ,
      thumb: accum.bestThumb,
    });
  }

  const records: DetRecord[] = trackReps.map((t, i) => ({ emb: t.rep, q: t.q, frameId: i }));
  const clusters = clusterDetections(records);

  const gallery: GalleryIdentity[] = [];
  const faces: FaceMeta[] = [];
  const centroids: Float32Array[] = [];
  const thumbnails: ImageBitmap[] = [];
  let identityId = 1;
  for (const cl of clusters) {
    let bestThumbIdx = cl.members[0];
    let bestThumbQ = -Infinity;
    for (const m of cl.members) {
      if (records[m].q > bestThumbQ) {
        bestThumbQ = records[m].q;
        bestThumbIdx = m;
      }
    }
    const thumb = trackReps[bestThumbIdx].thumb;
    if (!thumb) continue;
    const bitmap = await createImageBitmap(thumb);
    gallery.push({ identityId, members: cl.members.map((m) => trackReps[m].rep) });
    faces.push({
      identityId,
      support: cl.support,
      quality: cl.quality,
      thumbW: thumb.width,
      thumbH: thumb.height,
    });
    centroids.push(cl.centroid);
    thumbnails.push(bitmap);
    identityId += 1;
  }

  const allTrackIds = new Set<number>();
  for (const entries of framePlan.values()) for (const e of entries) allTrackIds.add(e.trackId);
  const tracks: TrackEmbeds[] = [...allTrackIds].map((id) => ({
    trackId: id,
    embeds: accums.get(id)?.embeds ?? [],
  }));
  const trackToIdentity = assignTracksToIdentities(tracks, gallery);

  if (cancel.cancelled) {
    for (const b of thumbnails) b.close();
    emit({ type: "error", code: "cancelled", message: "Face scan was cancelled.", recoverable: true });
    return null;
  }

  if (emitGallery) {
    emit({ type: "scanFaces", faces, centroids, thumbnails }, thumbnails);
  } else {
    for (const b of thumbnails) b.close();
  }

  return {
    source: sourceIdentity(file),
    framePlan,
    trackToIdentity,
    identityCount: gallery.length,
    detectorEP: detector.ep,
    config,
  };
}
