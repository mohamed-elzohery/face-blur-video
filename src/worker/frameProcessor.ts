import type { VideoSample } from "mediabunny";
import type { JobConfig } from "@/lib/types";
import type { BlurRenderer } from "./blur/types";
import { DEFAULT_SENSITIVITY, type FaceDetector } from "./detector";
import type { KalmanTracker } from "./tracker";

export class FrameProcessor {
  private frameIndex = 0;

  constructor(
    private readonly renderer: BlurRenderer,
    private readonly detector: FaceDetector,
    private readonly tracker: KalmanTracker,
    private readonly config: JobConfig,
  ) {}

  async process(sample: VideoSample): Promise<void> {
    this.tracker.predict();
    if (this.frameIndex % this.config.detectEveryN === 0) {
      const detections = await this.detector.detect(sample, DEFAULT_SENSITIVITY);
      this.tracker.update(detections);
    }
    await this.renderer.render(sample, this.tracker.boxes());
    this.frameIndex += 1;
  }
}
