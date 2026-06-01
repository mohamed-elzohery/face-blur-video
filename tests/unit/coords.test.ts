import { describe, expect, it } from "vitest";
import { computeDetectLayout, detBoxToNormalized, iou, padBox } from "@/lib/coords";

describe("computeDetectLayout", () => {
  it("produces dimensions that are multiples of 32", () => {
    const layout = computeDetectLayout(1280, 720, 480);
    expect(layout.detW % 32).toBe(0);
    expect(layout.detH % 32).toBe(0);
    expect(layout.detW).toBeGreaterThanOrEqual(layout.scaledW);
    expect(layout.detH).toBeGreaterThanOrEqual(layout.scaledH);
  });

  it("scales the longest side to the target", () => {
    const layout = computeDetectLayout(1280, 720, 480);
    expect(layout.scaledW).toBe(480);
    expect(layout.scale).toBeCloseTo(480 / 1280, 5);
  });

  it("never upscales beyond the source", () => {
    const layout = computeDetectLayout(200, 100, 480);
    expect(layout.scale).toBe(1);
  });

  it("handles portrait sources", () => {
    const layout = computeDetectLayout(720, 1280, 480);
    expect(layout.scaledH).toBe(480);
    expect(layout.detW % 32).toBe(0);
    expect(layout.detH % 32).toBe(0);
  });
});

describe("detBoxToNormalized", () => {
  it("maps detection-pixel boxes back to normalized encode space", () => {
    const layout = computeDetectLayout(1280, 720, 480);
    const box = detBoxToNormalized(240, 135, 48, 27, layout, 1280, 720);
    expect(box.x).toBeCloseTo(0.5, 3);
    expect(box.y).toBeCloseTo(0.5, 3);
    expect(box.w).toBeCloseTo(0.1, 3);
    expect(box.h).toBeCloseTo(0.1, 3);
  });
});

describe("padBox", () => {
  it("expands a box by the given fraction", () => {
    const padded = padBox({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, 0.5);
    expect(padded.w).toBeCloseTo(0.3, 5);
    expect(padded.h).toBeCloseTo(0.3, 5);
    expect(padded.x).toBeCloseTo(0.35, 5);
  });

  it("clamps to the unit square", () => {
    const padded = padBox({ x: 0.0, y: 0.0, w: 0.2, h: 0.2 }, 1.0);
    expect(padded.x).toBe(0);
    expect(padded.y).toBe(0);
    expect(padded.x + padded.w).toBeLessThanOrEqual(1);
    expect(padded.y + padded.h).toBeLessThanOrEqual(1);
  });
});

describe("iou", () => {
  it("is 1 for identical boxes", () => {
    const b = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    expect(iou(b, b)).toBeCloseTo(1, 5);
  });

  it("is 0 for disjoint boxes", () => {
    expect(iou({ x: 0, y: 0, w: 0.1, h: 0.1 }, { x: 0.5, y: 0.5, w: 0.1, h: 0.1 })).toBe(0);
  });

  it("computes partial overlap correctly", () => {
    const a = { x: 0, y: 0, w: 0.2, h: 0.2 };
    const b = { x: 0.1, y: 0, w: 0.2, h: 0.2 };
    expect(iou(a, b)).toBeCloseTo(1 / 3, 5);
  });
});
