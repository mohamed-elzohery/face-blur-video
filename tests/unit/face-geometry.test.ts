import { describe, expect, it } from "vitest";
import { isPlausibleFaceGeometry, type GeomPoint } from "@/lib/model/face-geometry";

const box = { x: 100, y: 100, w: 50, h: 50 };

function kps(points: [number, number][], vis = 0.9): GeomPoint[] {
  return points.map(([x, y]) => ({ x, y, vis }));
}

describe("isPlausibleFaceGeometry", () => {
  it("accepts a plausible eyes-nose-mouth layout", () => {
    const plausible = kps([
      [115, 118],
      [135, 118],
      [125, 130],
      [115, 140],
      [135, 140],
    ]);
    expect(isPlausibleFaceGeometry(box, plausible)).toBe(true);
  });

  it("rejects a nose above the eyes beyond tolerance", () => {
    const noseAboveEyes = kps([
      [115, 140],
      [135, 140],
      [125, 118],
      [115, 150],
      [135, 150],
    ]);
    expect(isPlausibleFaceGeometry(box, noseAboveEyes)).toBe(false);
  });

  it("rejects a visible landmark far outside the expanded box", () => {
    const outside = kps([
      [500, 110],
      [135, 110],
      [125, 120],
      [115, 130],
      [135, 130],
    ]);
    expect(isPlausibleFaceGeometry(box, outside)).toBe(false);
  });

  it("passes through when fewer than 2 landmarks are visible", () => {
    const lowVis = kps(
      [
        [500, 500],
        [600, 600],
        [125, 120],
        [115, 130],
        [135, 130],
      ],
      0.1,
    );
    expect(isPlausibleFaceGeometry(box, lowVis)).toBe(true);
  });
});
