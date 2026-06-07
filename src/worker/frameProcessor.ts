import type { VideoSample } from "mediabunny";
import type { JobConfig } from "@/lib/types";
import type { BlurRenderer } from "./blur/types";
import { DEFAULT_SENSITIVITY, type FaceDetector } from "./detector";
import type { KalmanTracker } from "./tracker";

export interface FrameProcessorStats {
  detectMs: number;
  renderMs: number;
  detectCount: number;
}

export class FrameProcessor {
  private frameIndex = 0;
  private detectMs = 0;
  private renderMs = 0;
  private detectCount = 0;

  constructor(
    private readonly renderer: BlurRenderer,
    private readonly detector: FaceDetector,
    private readonly tracker: KalmanTracker,
    private readonly config: JobConfig,
  ) {}

  async process(sample: VideoSample): Promise<void> {
    this.tracker.predict();
    if (this.frameIndex % this.config.detectEveryN === 0) {
      const t0 = performance.now();
      const detections = await this.detector.detect(sample, DEFAULT_SENSITIVITY);
      this.detectMs += performance.now() - t0;
      this.detectCount += 1;
      this.tracker.update(detections);
    }
    const r0 = performance.now();
    await this.renderer.render(sample, this.tracker.boxes());
    this.renderMs += performance.now() - r0;
    this.frameIndex += 1;
  }

  stats(): FrameProcessorStats {
    return { detectMs: this.detectMs, renderMs: this.renderMs, detectCount: this.detectCount };
  }
}
