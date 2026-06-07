import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  VideoSampleSink,
} from "mediabunny";
import type { JobConfig } from "@/lib/types";
import { createRenderer } from "./blur";
import { YuNetOnnxDetector, type FaceDetector } from "./detector";
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

  let detector: FaceDetector;
  try {
    detector =
      config.engine === "yolo"
        ? await YoloFaceOnnxDetector.create(displayWidth, displayHeight)
        : await YuNetOnnxDetector.create(displayWidth, displayHeight);
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

  for await (const sample of sink.samples()) {
    if (cancel.cancelled) {
      sample.close();
      break;
    }

    await processor.process(sample);
    await videoSource.add(Math.max(0, sample.timestamp - startOffsetSec), sample.duration);
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
