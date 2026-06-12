import type { VideoSample } from "mediabunny";
import type { BackgroundRenderer, BlurRenderer } from "./types";

export class PassthroughRenderer implements BlurRenderer {
  readonly canvas: OffscreenCanvas;
  private readonly ctx: OffscreenCanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.canvas = new OffscreenCanvas(width, height);
    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Failed to acquire a 2D canvas context.");
    this.ctx = ctx;
  }

  async render(sample: VideoSample): Promise<void> {
    sample.draw(this.ctx, 0, 0, this.canvas.width, this.canvas.height);
  }

  dispose(): void {}
}

export class BgPassthroughRenderer implements BackgroundRenderer {
  readonly canvas: OffscreenCanvas;
  private readonly ctx: OffscreenCanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.canvas = new OffscreenCanvas(width, height);
    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Failed to acquire a 2D canvas context.");
    this.ctx = ctx;
  }

  async render(sample: VideoSample): Promise<void> {
    sample.draw(this.ctx, 0, 0, this.canvas.width, this.canvas.height);
  }

  dispose(): void {}
}
