import type { VideoSample } from "mediabunny";
import type { Box } from "@/lib/types";

export interface BlurRenderer {
  readonly canvas: OffscreenCanvas;
  render(sample: VideoSample, boxes: Box[]): Promise<void>;
  dispose(): void;
}
