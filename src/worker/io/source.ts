import {
  ALL_FORMATS,
  BlobSource,
  Input,
  type InputAudioTrack,
  type InputVideoTrack,
} from "mediabunny";
import { PipelineError } from "../errors";

export interface SourceInfo {
  input: Input;
  videoTrack: InputVideoTrack;
  audioTrack: InputAudioTrack | null;
  displayWidth: number;
  displayHeight: number;
  rotation: number;
  durationUs: number;
  startOffsetSec: number;
}

export async function openSource(file: File): Promise<SourceInfo> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });

  if (!(await input.canRead())) {
    throw new PipelineError("unreadable", "This file format isn't recognized or is corrupted.");
  }

  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) {
    throw new PipelineError("no-video", "This file doesn't contain a video track.");
  }
  if (!(await videoTrack.canDecode())) {
    throw new PipelineError(
      "undecodable",
      "This video uses a codec your browser can't decode.",
    );
  }

  const audioTrack = await input.getPrimaryAudioTrack();

  const [displayWidth, displayHeight, rotation] = await Promise.all([
    videoTrack.getDisplayWidth(),
    videoTrack.getDisplayHeight(),
    videoTrack.getRotation(),
  ]);

  const durationSec =
    (await input.getDurationFromMetadata()) ?? (await input.computeDuration());
  const startOffsetSec = await input.getFirstTimestamp();

  return {
    input,
    videoTrack,
    audioTrack,
    displayWidth,
    displayHeight,
    rotation,
    durationUs: Math.max(0, Math.round(durationSec * 1_000_000)),
    startOffsetSec,
  };
}

export function makeOutputName(inputName: string): string {
  const base = inputName.replace(/\.[^./\\]+$/, "");
  return `${base || "video"}-blurred.mp4`;
}
