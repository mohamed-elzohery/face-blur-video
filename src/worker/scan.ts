import { EncodedPacketSink, VideoSampleSink, type VideoSample } from "mediabunny";
import type { Box, FaceMeta, JobConfig } from "@/lib/types";
import { boxCenterDist, iou } from "@/lib/coords";
import { ALIGNED_SIZE, warpFaceTo112 } from "@/lib/model/face-align";
import { faceQuality, laplacianVariance } from "@/lib/model/face-quality";
import { PipelineError } from "./errors";
import { openSource } from "./io/source";
import { YoloFaceOnnxDetector } from "./yolo-detector";
import { SFaceOnnxEmbedder, type FaceEmbedder } from "./embedder";
import { clusterDetections, type DetRecord } from "./cluster";
import type { Cancel, Emit } from "./pipeline";

const MIN_SCAN_FRAMES = 40;
const MAX_SCAN_FRAMES = 150;
const SCAN_SECONDS_PER_FRAME = 4;
const THUMB_SIZE = 160;
const THUMB_PAD = 0.35;
const MAX_EMBEDS = 600;
const MAX_EMBEDS_PER_SLOT = 4;
const SLOT_IOU = 0.4;
const SLOT_CENTER_DIST = 0.05;

function scanBudget(durationSec: number): number {
  return Math.min(
    MAX_SCAN_FRAMES,
    Math.max(MIN_SCAN_FRAMES, Math.round(durationSec / SCAN_SECONDS_PER_FRAME)),
  );
}

export async function planScanTimestamps(
  durationSec: number,
  packetSink: EncodedPacketSink,
): Promise<number[]> {
  if (!(durationSec > 0)) return [0];
  const budget = scanBudget(durationSec);
  const stride = durationSec / budget;

  const set = new Set<number>();
  for (let i = 0; i < budget; i++) {
    const target = (i + 0.5) * stride;
    const kp = await packetSink.getKeyPacket(target);
    if (kp) set.add(Math.round(kp.timestamp * 1000) / 1000);
  }

  let timestamps = [...set].sort((a, b) => a - b);
  if (timestamps.length < budget / 2) {
    timestamps = [];
    for (let i = 0; i < budget; i++) timestamps.push((i + 0.5) * stride);
  }
  return timestamps;
}

interface EmbedSlot {
  box: Box;
  count: number;
}

function matchSlot(slots: EmbedSlot[], det: Box): EmbedSlot | null {
  for (const s of slots) {
    if (iou(det, s.box) > SLOT_IOU || boxCenterDist(det, s.box) < SLOT_CENTER_DIST) return s;
  }
  return null;
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

export async function runScan(
  file: File,
  config: JobConfig,
  emit: Emit,
  cancel: Cancel,
): Promise<void> {
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
    emit({ type: "scanStarted", durationUs, detectorEP: detector.ep, recognitionEnabled: false });
    throw new PipelineError(
      "recognition-unavailable",
      `Face recognition isn't available in this browser (${err instanceof Error ? err.message : err}). You can still blur every face.`,
      true,
    );
  }

  emit({ type: "scanStarted", durationUs, detectorEP: detector.ep, recognitionEnabled: true });

  const packetSink = new EncodedPacketSink(videoTrack);
  const timestamps = await planScanTimestamps(durationUs / 1_000_000, packetSink);

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

  const records: DetRecord[] = [];
  const thumbs: ImageData[] = [];
  const slots: EmbedSlot[] = [];
  const sink = new VideoSampleSink(videoTrack);
  let frameId = 0;

  for await (const sample of sink.samplesAtTimestamps(timestamps)) {
    if (cancel.cancelled) {
      sample?.close();
      break;
    }
    if (!sample) {
      frameId++;
      continue;
    }

    const dets = await detector.detect(sample, config.sensitivity);
    for (const det of dets) {
      if (records.length >= MAX_EMBEDS) break;
      if (!det.landmarks) continue;

      const slot = matchSlot(slots, det);
      if (slot && slot.count >= MAX_EMBEDS_PER_SLOT) continue;

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
      records.push({ emb, q: quality.q, frameId });
      thumbs.push(thumbnailData(sample, det, displayWidth, displayHeight, thumbCtx));
      if (slot) {
        slot.count += 1;
        slot.box = { x: det.x, y: det.y, w: det.w, h: det.h };
      } else {
        slots.push({ box: { x: det.x, y: det.y, w: det.w, h: det.h }, count: 1 });
      }
    }

    const currentFrame = frameId;
    sample.close();
    frameId++;
    emit({
      type: "scanProgress",
      progress: timestamps.length > 0 ? Math.min(1, (currentFrame + 1) / timestamps.length) : 1,
    });
  }

  embedder.dispose();
  detector.dispose();

  if (cancel.cancelled) {
    src.input.dispose();
    emit({ type: "error", code: "cancelled", message: "Face scan was cancelled.", recoverable: true });
    return;
  }

  const clusters = clusterDetections(records);

  const faces: FaceMeta[] = [];
  const centroids: Float32Array[] = [];
  const thumbnails: ImageBitmap[] = [];
  let identityId = 1;
  for (const cl of clusters) {
    let bestIdx = cl.members[0];
    let bestQ = -Infinity;
    for (const m of cl.members) {
      if (records[m].q > bestQ) {
        bestQ = records[m].q;
        bestIdx = m;
      }
    }
    const thumb = thumbs[bestIdx];
    const bitmap = await createImageBitmap(thumb);
    faces.push({
      identityId,
      support: cl.support,
      quality: cl.quality,
      thumbW: thumb.width,
      thumbH: thumb.height,
    });
    centroids.push(cl.centroid);
    thumbnails.push(bitmap);
    identityId++;
  }

  src.input.dispose();
  emit({ type: "scanFaces", faces, centroids, thumbnails }, thumbnails);
}
