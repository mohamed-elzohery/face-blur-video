import { describe, expect, it } from "vitest";
import { decodeYoloOutput, nmsYolo, type YoloDetection } from "@/lib/model/yolo-decode";

function singleCell(kp0: { x: number; y: number; v: number }): Float32Array {
  const data = new Float32Array(80);
  data[64] = 10;
  data[65] = kp0.x;
  data[66] = kp0.y;
  data[67] = kp0.v;
  return data;
}

describe("decodeYoloOutput keypoints", () => {
  it("decodes keypoints as (raw*2 + anchor)*stride", () => {
    const dets = decodeYoloOutput(singleCell({ x: 0.25, y: 0.5, v: 10 }), 1, 1, 16, 0.5);
    expect(dets.length).toBe(1);
    const kp0 = dets[0].kps[0];
    expect(kp0.x).toBeCloseTo(8, 5);
    expect(kp0.y).toBeCloseTo(16, 5);
  });

  it("does not cap large keypoint offsets (regression: tanh saturation collapsed landmarks)", () => {
    const dets = decodeYoloOutput(singleCell({ x: 3, y: 0, v: 10 }), 1, 1, 16, 0.5);
    const kp0 = dets[0].kps[0];
    expect(kp0.x).toBeCloseTo(96, 4);
    expect(kp0.x).toBeGreaterThan(50);
  });
});

describe("nmsYolo", () => {
  it("keeps detections with implausible landmark geometry (regression: scene-cut first frame left unblurred)", () => {
    const noseAboveEyes: YoloDetection = {
      x: 100,
      y: 100,
      w: 50,
      h: 50,
      score: 0.9,
      kps: [
        { x: 115, y: 140, vis: 0.9 },
        { x: 135, y: 140, vis: 0.9 },
        { x: 125, y: 118, vis: 0.9 },
        { x: 115, y: 150, vis: 0.9 },
        { x: 135, y: 150, vis: 0.9 },
      ],
    };
    const landmarkOutsideBox: YoloDetection = {
      x: 300,
      y: 300,
      w: 40,
      h: 40,
      score: 0.8,
      kps: [
        { x: 500, y: 310, vis: 0.9 },
        { x: 330, y: 310, vis: 0.9 },
        { x: 320, y: 320, vis: 0.9 },
        { x: 312, y: 330, vis: 0.9 },
        { x: 328, y: 330, vis: 0.9 },
      ],
    };
    expect(nmsYolo([noseAboveEyes, landmarkOutsideBox], 0.45)).toHaveLength(2);
  });
});
