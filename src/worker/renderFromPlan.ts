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
import { resolvedNumThreads } from "./detector";
import { PipelineError } from "./errors";
import { makeOutputName, openSource } from "./io/source";
import {
  PROGRESS_INTERVAL_MS,
  detectBlurBackend,
  rendererOptionsFor,
  runAudio,
  setupAudio,
} from "./encode";
import { keepSetFromSelection, shouldBlurEntry, type AnalyzedPlan, type PlanEntry } from "./renderPlan";
import type { Cancel, Emit } from "./runtime";

export async function runRenderFromPlan(
  file: File,
  config: JobConfig,
  plan: AnalyzedPlan,
  keepIds: number[],
  emit: Emit,
  cancel: Cancel,
): Promise<void> {
  const src = await openSource(file);
  const { videoTrack, audioTrack, displayWidth, displayHeight, durationUs, startOffsetSec } = src;
  const keep = keepSetFromSelection(keepIds);

  const requestedBackend = await detectBlurBackend();
  const { renderer, backend: blurBackend } = await createRenderer(
    requestedBackend,
    displayWidth,
    displayHeight,
    rendererOptionsFor(config),
  );

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
  let lastEntries: PlanEntry[] = [];

  for await (const sample of sink.samples()) {
    if (cancel.cancelled) {
      sample.close();
      break;
    }

    const entries = plan.framePlan.get(sample.microsecondTimestamp) ?? lastEntries;
    lastEntries = entries;
    const boxes = entries
      .filter((e) => shouldBlurEntry(e.identityId, keep))
      .map((e) => e.box);
    await renderer.render(sample, boxes);
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
        detectorEP: plan.detectorEP,
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

  if (!cancel.cancelled && audioInput) {
    await runAudio(audioPlan, audioInput, startOffsetSec, cancel, emit);
  }

  if (cancel.cancelled) {
    await output.cancel();
    renderer.dispose();
    src.input.dispose();
    emit({ type: "error", code: "cancelled", message: "Processing was cancelled.", recoverable: true });
    return;
  }

  await output.finalize();
  renderer.dispose();

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
