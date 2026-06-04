import type { VideoSample } from "mediabunny";
import type { JobConfig } from "@/lib/types";
import type { BlurRenderer } from "./blur/types";
import type { FaceDetector } from "./detector";
import type { KalmanTracker } from "./tracker";
import type { KeepController } from "./keepController";

export class FrameProcessor {
  private frameIndex = 0;

  constructor(
    private readonly renderer: BlurRenderer,
    private readonly detector: FaceDetector,
    private readonly tracker: KalmanTracker,
    private readonly config: JobConfig,
    private readonly keep: KeepController | null = null,
  ) {}

  async process(sample: VideoSample): Promise<void> {
    this.tracker.predict();
    if (this.frameIndex % this.config.detectEveryN === 0) {
      const detections = await this.detector.detect(sample, this.config.sensitivity);
      this.tracker.update(detections);
      if (this.keep) await this.keep.onDetections(this.tracker.lastMatches(), sample);
    }
    const boxes = this.keep
      ? this.tracker.boxesWithIds().filter((b) => !this.keep!.isKept(b.id)).map((b) => b.box)
      : this.tracker.boxes();
    await this.renderer.render(sample, boxes);
    this.frameIndex += 1;
  }
}
