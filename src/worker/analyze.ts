import { VideoSampleSink, type VideoSample } from "mediabunny";
import type { Box, FaceMeta, JobConfig } from "@/lib/types";
import { ALIGNED_SIZE, warpFaceTo112 } from "@/lib/model/face-align";
import { faceQuality, laplacianVariance } from "@/lib/model/face-quality";
import { PipelineError } from "./errors";
import { openSource } from "./io/source";
import { YoloFaceOnnxDetector } from "./yolo-detector";
import { SFaceOnnxEmbedder, type FaceEmbedder } from "./embedder";
import { buildIdentities, type TrackedRecord } from "./gallery";
import { KalmanTracker } from "./tracker";
import type { AnalyzedPlan, FramePlan, PlanEntry } from "./renderPlan";
import { sourceIdentity } from "./renderPlan";
import type { Cancel, Emit } from "./runtime";

const MAX_EMBEDS = 800;
const MAX_EMBEDS_PER_TRACK = 6;
const THUMB_SIZE = 160;
const THUMB_PAD = 0.35;
const PROGRESS_INTERVAL_MS = 120;

const ANALYZE_TRACKER = {
  iouMatch: 0.3,
  maxCenterDist: 0.35,
  maxMisses: 1,
  qPos: 6e-3,
  qVel: 8e-4,
  measNoise: 5e-4,
};

interface TrackAccum {
  embeds: Float32Array[];
  bestThumb: ImageData | null;
  bestQ: number;
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
  const records: TrackedRecord[] = [];
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
        records.push({ emb, q: quality.q, frameId: frameIndex, trackId: id });
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

  const allTrackIds = new Set<number>();
  for (const entries of framePlan.values()) for (const e of entries) allTrackIds.add(e.trackId);
  const trackEmbeds = new Map<number, Float32Array[]>();
  for (const [id, accum] of accums) trackEmbeds.set(id, accum.embeds);

  const { identities, trackToIdentity } = buildIdentities(records, [...allTrackIds], trackEmbeds);

  const faces: FaceMeta[] = [];
  const centroids: Float32Array[] = [];
  const thumbnails: ImageBitmap[] = [];
  for (const idn of identities) {
    let bestIdx = idn.memberRecordIdxs[0];
    let bestQ = -Infinity;
    for (const m of idn.memberRecordIdxs) {
      if (records[m].q > bestQ) {
        bestQ = records[m].q;
        bestIdx = m;
      }
    }
    const thumb = accums.get(records[bestIdx].trackId)?.bestThumb;
    if (!thumb) continue;
    const bitmap = await createImageBitmap(thumb);
    faces.push({
      identityId: idn.identityId,
      support: idn.support,
      quality: idn.quality,
      thumbW: thumb.width,
      thumbH: thumb.height,
    });
    centroids.push(idn.centroid);
    thumbnails.push(bitmap);
  }

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
    identityCount: identities.length,
    detectorEP: detector.ep,
    config,
  };
}
