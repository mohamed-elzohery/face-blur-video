import { VideoSampleSink, type VideoSample } from "mediabunny";
import type { Box, DetectedFace, FaceMeta, JobConfig } from "@/lib/types";
import { ALIGNED_SIZE, warpFaceTo112 } from "@/lib/model/face-align";
import { faceQuality, laplacianVariance } from "@/lib/model/face-quality";
import { PipelineError } from "./errors";
import { openSource } from "./io/source";
import { YoloFaceOnnxDetector } from "./yolo-detector";
import { SFaceOnnxEmbedder, type FaceEmbedder } from "./embedder";
import { buildIdentities } from "./gallery";
import { KalmanTracker } from "./tracker";
import {
  resolveFramePlan,
  sampleGalleryRecords,
  type GalleryCandidate,
  type RawFace,
} from "./framePlan";
import type { AnalyzedPlan } from "./renderPlan";
import { sourceIdentity } from "./renderPlan";
import type { Cancel, Emit } from "./runtime";

const MAX_EMBEDS = 12000;
const EMBED_MIN_FACE_PX = 40;
const EMBED_MIN_CONF = 0.5;
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

interface ThumbAccum {
  thumb: ImageData;
  q: number;
}

function shouldEmbed(det: DetectedFace, W: number, H: number): boolean {
  if (!det.landmarks) return false;
  const facePx = Math.min(det.w * W, det.h * H);
  return facePx >= EMBED_MIN_FACE_PX && det.score >= EMBED_MIN_CONF;
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
  const rawFrames = new Map<number, RawFace[]>();
  const perTrackCandidates = new Map<number, GalleryCandidate[]>();
  const trackEmbeds = new Map<number, Float32Array[]>();
  const thumbs = new Map<number, ThumbAccum>();
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
    const dets = await detector.detect(sample, config.sensitivity);
    tracker.update(dets);

    const matchById = new Map<number, DetectedFace>();
    for (const { id, det } of tracker.lastMatches()) matchById.set(id, det);

    const faces: RawFace[] = [];
    for (const { id, box } of tracker.boxesWithIds()) {
      const det = matchById.get(id);
      let emb: Float32Array | null = null;
      if (det && shouldEmbed(det, displayWidth, displayHeight) && totalEmbeds < MAX_EMBEDS) {
        const lmPx = det.landmarks!.pts.map(
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
        emb = await embedder.embed(aligned);
        totalEmbeds += 1;

        const cand = perTrackCandidates.get(id);
        if (cand) cand.push({ emb, q: quality.q, frameId: frameIndex });
        else perTrackCandidates.set(id, [{ emb, q: quality.q, frameId: frameIndex }]);
        const embs = trackEmbeds.get(id);
        if (embs) embs.push(emb);
        else trackEmbeds.set(id, [emb]);

        const bt = thumbs.get(id);
        if (!bt || quality.q > bt.q) {
          thumbs.set(id, {
            thumb: thumbnailData(sample, det, displayWidth, displayHeight, thumbCtx),
            q: quality.q,
          });
        }
      }
      faces.push({ box, trackId: id, emb });
    }

    rawFrames.set(sample.microsecondTimestamp, faces);
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
  for (const faces of rawFrames.values()) for (const f of faces) allTrackIds.add(f.trackId);

  const galleryRecords = sampleGalleryRecords(perTrackCandidates);
  const { identities, gallery, trackToIdentity } = buildIdentities(
    galleryRecords,
    [...allTrackIds],
    trackEmbeds,
  );
  const framePlan = resolveFramePlan(rawFrames, gallery, trackToIdentity);

  const faces: FaceMeta[] = [];
  const centroids: Float32Array[] = [];
  const thumbnails: ImageBitmap[] = [];
  for (const idn of identities) {
    let bestIdx = idn.memberRecordIdxs[0];
    let bestQ = -Infinity;
    for (const m of idn.memberRecordIdxs) {
      if (galleryRecords[m].q > bestQ) {
        bestQ = galleryRecords[m].q;
        bestIdx = m;
      }
    }
    const thumbAccum = thumbs.get(galleryRecords[bestIdx].trackId);
    if (!thumbAccum) continue;
    const bitmap = await createImageBitmap(thumbAccum.thumb);
    faces.push({
      identityId: idn.identityId,
      support: idn.support,
      quality: idn.quality,
      thumbW: thumbAccum.thumb.width,
      thumbH: thumbAccum.thumb.height,
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
    identityCount: identities.length,
    detectorEP: detector.ep,
    config,
  };
}
