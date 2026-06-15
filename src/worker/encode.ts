import {
  AudioSampleSink,
  AudioSampleSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Mp4OutputFormat,
  Output,
  QUALITY_MEDIUM,
  type InputAudioTrack,
  type InputVideoTrack,
  type Quality,
} from "mediabunny";
import { STYLE_CODE, type BlurBackend, type JobConfig } from "@/lib/types";
import { MIN_BLOCK_PX, blockFracForDensity } from "@/lib/blurMath";
import { isMobileWebKit } from "@/lib/platform";
import type { RendererOptions } from "./blur";
import type { Cancel, Emit } from "./runtime";

export { MIN_BLOCK_PX, MIN_BLOCK_FRAC, MAX_BLOCK_FRAC } from "@/lib/blurMath";

export const FEATHER_PX = 2.5;
export const PROGRESS_INTERVAL_MS = 150;

export function rendererOptionsFor(config: JobConfig): RendererOptions {
  return {
    minBlockPx: MIN_BLOCK_PX,
    blockFrac: blockFracForDensity(config.density),
    featherPx: FEATHER_PX,
    style: STYLE_CODE[config.style],
  };
}

const SOURCE_BITRATE_SHARE = 0.92;

export async function resolveVideoBitrate(
  videoTrack: InputVideoTrack,
  fileSize: number,
  durationSec: number,
): Promise<number | Quality> {
  const containerBitrate =
    durationSec > 0 && fileSize > 0 && Number.isFinite(fileSize) ? (fileSize * 8) / durationSec : null;

  const metaBitrate = (await videoTrack.getAverageBitrate()) ?? (await videoTrack.getBitrate());
  if (typeof metaBitrate === "number" && Number.isFinite(metaBitrate) && metaBitrate > 0) {
    const capped = containerBitrate ? Math.min(metaBitrate, containerBitrate) : metaBitrate;
    return Math.round(capped);
  }

  if (containerBitrate) return Math.round(containerBitrate * SOURCE_BITRATE_SHARE);

  return QUALITY_MEDIUM;
}

export function formatBitrate(bitrate: number | Quality): string {
  return typeof bitrate === "number" ? `${Math.round(bitrate / 1000)}kbps` : "quality-medium";
}

export async function detectBlurBackend(): Promise<BlurBackend> {
  try {
    if (!isMobileWebKit() && "gpu" in navigator && navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) return "webgpu";
    }
  } catch {
    /* fall through to webgl2 */
  }
  return "webgl2";
}

export type AudioPlan =
  | { kind: "none" }
  | { kind: "drop" }
  | { kind: "passthrough"; source: EncodedAudioPacketSource }
  | { kind: "transcode"; source: AudioSampleSource };

const MP4_PASSTHROUGH_SAFE_AUDIO = new Set(["aac", "mp3"]);

export async function setupAudio(
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

export async function runAudio(
  plan: AudioPlan,
  audioTrack: InputAudioTrack,
  startOffsetSec: number,
  cancel: Cancel,
  emit: Emit,
): Promise<void> {
  if (plan.kind === "passthrough") {
    const sink = new EncodedPacketSink(audioTrack);
    const decoderConfig = await audioTrack.getDecoderConfig();
    let meta: EncodedAudioChunkMetadata | undefined = decoderConfig ? { decoderConfig } : undefined;
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
