import type { VideoSample } from "mediabunny";
import type { Box } from "@/lib/types";
import type { MaskData } from "../matting";

export interface BlurRenderer {
  readonly canvas: OffscreenCanvas;
  render(sample: VideoSample, boxes: Box[]): Promise<void>;
  dispose(): void;
}

export interface BackgroundRenderer {
  readonly canvas: OffscreenCanvas;
  render(sample: VideoSample, mask: MaskData): Promise<void>;
  dispose(): void;
}
