import { describe, expect, it } from "vitest";
import { IoUTracker } from "@/worker/tracker";
import type { ScoredBox } from "@/lib/types";

const OPTS = { iouMatch: 0.3, ema: 0.5, maxMisses: 3, paddingFrac: 0 };

function det(x: number, y: number, w: number, h: number, score = 0.9): ScoredBox {
  return { x, y, w, h, score };
}

describe("IoUTracker", () => {
  it("creates a track on first detection (blur-on-first-detection)", () => {
    const t = new IoUTracker(OPTS);
    t.update([det(0.4, 0.4, 0.2, 0.2)]);
    expect(t.size).toBe(1);
    expect(t.boxes().length).toBe(1);
  });

  it("holds a track through detector misses up to maxMisses (privacy-critical)", () => {
    const t = new IoUTracker(OPTS);
    t.update([det(0.4, 0.4, 0.2, 0.2)]);
    expect(t.size).toBe(1);
    t.update([]);
    t.update([]);
    t.update([]);
    expect(t.size).toBe(1);
    t.update([]);
    expect(t.size).toBe(0);
  });

  it("associates overlapping detections to the same track across frames", () => {
    const t = new IoUTracker(OPTS);
    t.update([det(0.4, 0.4, 0.2, 0.2)]);
    t.update([det(0.41, 0.4, 0.2, 0.2)]);
    expect(t.size).toBe(1);
  });

  it("spawns separate tracks for two distinct faces", () => {
    const t = new IoUTracker(OPTS);
    t.update([det(0.1, 0.1, 0.15, 0.15), det(0.7, 0.7, 0.15, 0.15)]);
    expect(t.size).toBe(2);
  });

  it("smooths the box toward the detection via EMA", () => {
    const t = new IoUTracker({ ...OPTS, ema: 0.5 });
    t.update([det(0.4, 0.4, 0.2, 0.2)]);
    t.update([det(0.45, 0.4, 0.2, 0.2)]);
    expect(t.size).toBe(1);
    const box = t.boxes()[0];
    expect(box.x).toBeGreaterThan(0.4);
    expect(box.x).toBeLessThan(0.45);
    expect(box.x).toBeCloseTo(0.425, 5);
  });

  it("applies padding to emitted boxes", () => {
    const t = new IoUTracker({ ...OPTS, paddingFrac: 0.5 });
    t.update([det(0.4, 0.4, 0.2, 0.2)]);
    const box = t.boxes()[0];
    expect(box.w).toBeCloseTo(0.3, 5);
  });
});
