import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  VideoSampleSink,
} from "mediabunny";
import type { JobConfig } from "@/lib/types";
import { logger } from "@/lib/log";
import { createRenderer } from "./blur";
import {
  YuNetOnnxDetector,
  resolvedNumThreads,
  webgpuAdapterAvailable,
  type FaceDetector,
} from "./detector";
import { YoloFaceOnnxDetector } from "./yolo-detector";
import { PipelineError } from "./errors";
import { FrameProcessor } from "./frameProcessor";
import { makeOutputName, openSource } from "./io/source";
import { KalmanTracker } from "./tracker";
import {
  PROGRESS_INTERVAL_MS,
  detectBlurBackend,
  rendererOptionsFor,
  runAudio,
  setupAudio,
} from "./encode";
import type { Cancel, Emit } from "./runtime";

const TRACKER_IOU_MATCH = 0.3;
const TRACKER_MAX_CENTER_DIST = 0.35;
const TRACKER_MAX_MISSES = 1;
const TRACKER_Q_POS = 6e-3;
const TRACKER_Q_VEL = 8e-4;
const TRACKER_MEAS_NOISE = 5e-4;

export async function runPipeline(
  file: File,
  config: JobConfig,
  emit: Emit,
  cancel: Cancel,
): Promise<void> {
  const src = await openSource(file);
  const { videoTrack, audioTrack, displayWidth, displayHeight, durationUs, startOffsetSec } = src;

  const requestedBackend = await detectBlurBackend();
  const { renderer, backend: blurBackend } = await createRenderer(
    requestedBackend,
    displayWidth,
    displayHeight,
    rendererOptionsFor(config),
  );

  const detectLongSide = config.detectLongSide;

  let detector: FaceDetector;
  try {
    detector =
      config.engine === "yolo"
        ? await YoloFaceOnnxDetector.create(displayWidth, displayHeight, detectLongSide)
        : await YuNetOnnxDetector.create(displayWidth, displayHeight, detectLongSide);
  } catch (err) {
    renderer.dispose();
    src.input.dispose();
    throw new PipelineError(
      "detector-init",
      `Couldn't load the face-detection model: ${err instanceof Error ? err.message : err}`,
    );
  }

  const tracker = new KalmanTracker({
    iouMatch: TRACKER_IOU_MATCH,
    maxCenterDist: TRACKER_MAX_CENTER_DIST,
    maxMisses: TRACKER_MAX_MISSES,
    paddingFrac: config.paddingFrac,
    qPos: TRACKER_Q_POS,
    qVel: TRACKER_Q_VEL,
    measNoise: TRACKER_MEAS_NOISE,
  });
  const processor = new FrameProcessor(renderer, detector, tracker, config);

  const format = new Mp4OutputFormat({ fastStart: "in-memory" });
  const target = new BufferTarget();
  const output = new Output({ format, target });

  const codecHolder = { codec: "avc1" };
  const videoSource = new CanvasSource(renderer.canvas, {
    codec: "avc",
    bitrate: QUALITY_HIGH,
    onEncoderConfig: (cfg) => {
      codecHolder.codec = cfg.codec;
    },
  });
  output.addVideoTrack(videoSource, { rotation: 0 });

  const audioInput = config.keepAudio ? audioTrack : null;
  const audioPlan = await setupAudio(output, format, audioInput);

  await output.start();

  const sink = new VideoSampleSink(videoTrack);
  const startedAt = performance.now();
  let framesDone = 0;
  let announced = false;
  let lastEmit = 0;
  let encodeMs = 0;
  let decodeMs = 0;

  const iter = sink.samples()[Symbol.asyncIterator]();
  let pending = iter.next();

  for (;;) {
    const decodeStart = performance.now();
    const res = await pending;
    decodeMs += performance.now() - decodeStart;
    if (res.done) break;
    const sample = res.value;
    pending = iter.next();

    if (cancel.cancelled) {
      sample.close();
      break;
    }

    await processor.process(sample);
    const encStart = performance.now();
    await videoSource.add(Math.max(0, sample.timestamp - startOffsetSec), sample.duration);
    encodeMs += performance.now() - encStart;
    const currentTimeUs = sample.microsecondTimestamp;
    sample.close();
    framesDone++;

    if (!announced) {
      announced = true;
      emit({
        type: "started",
        totalFrames: null,
        durationUs,
        fps: 0,
        codec: codecHolder.codec,
        blurBackend,
        detectorEP: detector.ep,
        numThreads: resolvedNumThreads(),
        crossOriginIsolated:
          typeof crossOriginIsolated !== "undefined" && crossOriginIsolated === true,
      });
    }

    const now = performance.now();
    if (now - lastEmit > PROGRESS_INTERVAL_MS) {
      lastEmit = now;
      const elapsed = (now - startedAt) / 1000;
      emit({
        type: "progress",
        framesDone,
        totalFrames: null,
        currentTimeUs,
        throughputFps: elapsed > 0 ? framesDone / elapsed : 0,
      });
    }
  }

  await pending
    .then((r) => {
      if (!r.done) r.value.close();
    })
    .catch(() => undefined);
  if (typeof iter.return === "function") {
    await iter.return().catch(() => undefined);
  }

  if (!cancel.cancelled && audioInput) {
    await runAudio(audioPlan, audioInput, startOffsetSec, cancel, emit);
  }

  if (cancel.cancelled) {
    await output.cancel();
    renderer.dispose();
    detector.dispose();
    src.input.dispose();
    emit({ type: "error", code: "cancelled", message: "Processing was cancelled.", recoverable: true });
    return;
  }

  await output.finalize();

  const stats = processor.stats();
  const isolated = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated === true;
  const hasGpu = typeof navigator !== "undefined" && "gpu" in navigator && !!navigator.gpu;
  const elapsed = (performance.now() - startedAt) / 1000;
  const dt = detector.timing?.();
  const detectSplit = dt
    ? ` detPrepMs=${Math.round(dt.prepMs)} detRunMs=${Math.round(dt.runMs)} detDecodeMs=${Math.round(dt.decodeMs)}`
    : "";
  const summary =
    `blur-all: detectorEP=${detector.ep} gpu=${hasGpu} adapter=${webgpuAdapterAvailable() ? "ok" : "null"} ` +
    `blurBackend=${blurBackend} ` +
    `engine=${config.engine} inputLong=${detectLongSide ?? "default"} frames=${framesDone} ` +
    `detects=${stats.detectCount} decodeMs=${Math.round(decodeMs)} detectMs=${Math.round(stats.detectMs)}${detectSplit} ` +
    `renderMs=${Math.round(stats.renderMs)} encodeMs=${Math.round(encodeMs)} ` +
    `fps=${(elapsed > 0 ? framesDone / elapsed : 0).toFixed(1)} ` +
    `numThreads=${resolvedNumThreads()} crossOriginIsolated=${isolated}`;
  logger.info(summary);
  emit({ type: "log", level: "info", msg: summary });

  renderer.dispose();
  detector.dispose();

  const buffer = target.buffer;
  src.input.dispose();
  if (!buffer) throw new PipelineError("no-output", "The output file is empty.");

  emit({
    type: "done",
    output: new Blob([buffer], { type: "video/mp4" }),
    mimeType: "video/mp4",
    fileName: makeOutputName(file.name),
  });
}
