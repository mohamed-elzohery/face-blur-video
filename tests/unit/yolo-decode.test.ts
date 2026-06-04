import { describe, expect, it } from "vitest";
import { decodeYoloOutput } from "@/lib/model/yolo-decode";

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
