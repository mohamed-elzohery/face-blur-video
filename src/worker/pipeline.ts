import {
  AudioSampleSink,
  AudioSampleSource,
  BufferTarget,
  CanvasSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_MEDIUM,
  VideoSampleSink,
  type InputAudioTrack,
} from "mediabunny";
import { STYLE_CODE, type BlurBackend, type JobConfig, type WorkerToMain } from "@/lib/types";
import { createRenderer } from "./blur";
import { YuNetOnnxDetector, type FaceDetector } from "./detector";
import { YoloFaceOnnxDetector } from "./yolo-detector";
import { PipelineError } from "./errors";
import { FrameProcessor } from "./frameProcessor";
import { makeOutputName, openSource } from "./io/source";
import { KalmanTracker } from "./tracker";

const FEATHER_PX = 2.5;
const MIN_BLOCK_PX = 6;
const MIN_BLOCK_FRAC = 0.07;
const MAX_BLOCK_FRAC = 0.22;
const TRACKER_IOU_MATCH = 0.3;
const TRACKER_MAX_CENTER_DIST = 0.35;
const TRACKER_MAX_MISSES = 1;
const TRACKER_Q_POS = 6e-3;
const TRACKER_Q_VEL = 8e-4;
const TRACKER_MEAS_NOISE = 5e-4;

export interface Cancel {
  cancelled: boolean;
}

export type Emit = (msg: WorkerToMain, transfer?: Transferable[]) => void;

type AudioPlan =
  | { kind: "none" }
  | { kind: "drop" }
  | { kind: "passthrough"; source: EncodedAudioPacketSource }
  | { kind: "transcode"; source: AudioSampleSource };

const PROGRESS_INTERVAL_MS = 150;

async function detectBlurBackend(): Promise<BlurBackend> {
  try {
    if ("gpu" in navigator && navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) return "webgpu";
    }
  } catch {
    /* fall through to webgl2 */
  }
  return "webgl2";
}

const MP4_PASSTHROUGH_SAFE_AUDIO = new Set(["aac", "mp3"]);

async function setupAudio(
  output: Output,
  format: Mp4OutputFormat,
  audioTrack: InputAudioTrack | null,
): Promise<AudioPlan> {
  if (!audioTrack) return { kind: "none" };

  const audioCodec = await audioTrack.getCodec();
  if (
    audioCodec &&
    MP4_PASSTHROUGH_SAFE_AUDIO.has(audioCodec) &&
    format.getSupportedAudioCodecs().includes(audioCodec)
  ) {
    const source = new EncodedAudioPacketSource(audioCodec);
    output.addAudioTrack(source);
    return { kind: "passthrough", source };
  }

  if (typeof AudioEncoder !== "undefined") {
    const source = new AudioSampleSource({ codec: "aac", bitrate: QUALITY_MEDIUM });
    output.addAudioTrack(source);
    return { kind: "transcode", source };
  }

  return { kind: "drop" };
}

async function runAudio(
  plan: AudioPlan,
  audioTrack: InputAudioTrack,
  startOffsetSec: number,
  cancel: Cancel,
  emit: Emit,
): Promise<void> {
  if (plan.kind === "passthrough") {
    const sink = new EncodedPacketSink(audioTrack);
    const decoderConfig = await audioTrack.getDecoderConfig();
    let meta: EncodedAudioChunkMetadata | undefined = decoderConfig
      ? { decoderConfig }
      : undefined;
    for await (const packet of sink.packets()) {
      if (cancel.cancelled) break;
      const ts = Math.max(0, packet.timestamp - startOffsetSec);
      await plan.source.add(packet.clone({ timestamp: ts }), meta);
      meta = undefined;
    }
  } else if (plan.kind === "transcode") {
    emit({ type: "log", level: "warn", msg: "Audio re-encoded to AAC (source codec not MP4-compatible)." });
    const sink = new AudioSampleSink(audioTrack);
    for await (const sample of sink.samples()) {
      if (cancel.cancelled) {
        sample.close();
        break;
      }
      sample.setTimestamp(Math.max(0, sample.timestamp - startOffsetSec));
      await plan.source.add(sample);
      sample.close();
    }
  } else if (plan.kind === "drop") {
    emit({ type: "log", level: "warn", msg: "Audio dropped (cannot encode AAC in this browser)." });
  }
}

export async function runPipeline(
  file: File,
  config: JobConfig,
  emit: Emit,
  cancel: Cancel,
): Promise<void> {
  const src = await openSource(file);
  const { videoTrack, audioTrack, displayWidth, displayHeight, durationUs, startOffsetSec } = src;

  const strength = Math.min(1, Math.max(0, config.strength));
  const blockFrac = MIN_BLOCK_FRAC + strength * (MAX_BLOCK_FRAC - MIN_BLOCK_FRAC);

  const requestedBackend = await detectBlurBackend();
  const { renderer, backend: blurBackend } = await createRenderer(
    requestedBackend,
    displayWidth,
    displayHeight,
    { minBlockPx: MIN_BLOCK_PX, blockFrac, featherPx: FEATHER_PX, style: STYLE_CODE[config.style] },
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

  const audioPlan = await setupAudio(output, format, audioTrack);

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

  if (!cancel.cancelled && audioTrack) {
    await runAudio(audioPlan, audioTrack, startOffsetSec, cancel, emit);
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

  emit(
    {
      type: "done",
      output: new Blob([buffer], { type: "video/mp4" }),
      mimeType: "video/mp4",
      fileName: makeOutputName(file.name),
    },
  );
}
