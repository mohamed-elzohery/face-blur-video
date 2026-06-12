import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  VideoSampleSink,
} from "mediabunny";
import type { JobConfig } from "@/lib/types";
import { logger } from "@/lib/log";
import { createBackgroundRenderer } from "./blur";
import { resolvedNumThreads, webgpuAdapterAvailable } from "./detector";
import { RvmMatting } from "./matting";
import { PipelineError } from "./errors";
import { makeOutputName, openSource } from "./io/source";
import {
  PROGRESS_INTERVAL_MS,
  bgRendererOptionsFor,
  detectBlurBackend,
  formatBitrate,
  resolveVideoBitrate,
  runAudio,
  setupAudio,
} from "./encode";
import type { Cancel, Emit } from "./runtime";

export async function runBackgroundPipeline(
  file: File,
  config: JobConfig,
  emit: Emit,
  cancel: Cancel,
): Promise<void> {
  const src = await openSource(file);
  const { videoTrack, audioTrack, displayWidth, displayHeight, durationUs, startOffsetSec } = src;

  const requestedBackend = await detectBlurBackend();
  const { renderer, backend: blurBackend } = await createBackgroundRenderer(
    requestedBackend,
    displayWidth,
    displayHeight,
    bgRendererOptionsFor(config),
  );

  let matting: RvmMatting;
  try {
    matting = await RvmMatting.create(displayWidth, displayHeight);
  } catch (err) {
    renderer.dispose();
    src.input.dispose();
    throw new PipelineError(
      "matting-init",
      `Couldn't load the background-matting model: ${err instanceof Error ? err.message : err}`,
    );
  }

  const format = new Mp4OutputFormat({ fastStart: "in-memory" });
  const target = new BufferTarget();
  const output = new Output({ format, target });

  const videoBitrate = await resolveVideoBitrate(videoTrack, file.size, durationUs / 1_000_000);

  const codecHolder = { codec: "avc1" };
  const videoSource = new CanvasSource(renderer.canvas, {
    codec: "avc",
    bitrate: videoBitrate,
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
  let renderMs = 0;

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

    const mask = await matting.matte(sample);
    const renderStart = performance.now();
    await renderer.render(sample, mask);
    renderMs += performance.now() - renderStart;
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
        detectorEP: matting.ep,
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
    matting.dispose();
    src.input.dispose();
    emit({ type: "error", code: "cancelled", message: "Processing was cancelled.", recoverable: true });
    return;
  }

  await output.finalize();

  const isolated = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated === true;
  const hasGpu = typeof navigator !== "undefined" && "gpu" in navigator && !!navigator.gpu;
  const elapsed = (performance.now() - startedAt) / 1000;
  const mt = matting.timing();
  const { matteW, matteH, downsampleRatio } = matting.layout;
  const summary =
    `blur-bg: matteEP=${matting.ep} gpu=${hasGpu} adapter=${webgpuAdapterAvailable() ? "ok" : "null"} ` +
    `blurBackend=${blurBackend} ` +
    `matte=${matteW}x${matteH} ds=${downsampleRatio.toFixed(3)} frames=${framesDone} ` +
    `decodeMs=${Math.round(decodeMs)} mattePrepMs=${Math.round(mt.prepMs)} matteRunMs=${Math.round(mt.runMs)} ` +
    `matteDecodeMs=${Math.round(mt.decodeMs)} renderMs=${Math.round(renderMs)} encodeMs=${Math.round(encodeMs)} ` +
    `targetBitrate=${formatBitrate(videoBitrate)} ` +
    `fps=${(elapsed > 0 ? framesDone / elapsed : 0).toFixed(1)} ` +
    `numThreads=${resolvedNumThreads()} crossOriginIsolated=${isolated}`;
  logger.info(summary);
  emit({ type: "log", level: "info", msg: summary });

  renderer.dispose();
  matting.dispose();

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
