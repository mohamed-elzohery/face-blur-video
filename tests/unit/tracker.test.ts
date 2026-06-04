import { describe, expect, it } from "vitest";
import { KalmanTracker } from "@/worker/tracker";
import type { DetectedFace } from "@/lib/types";

const OPTS = {
  iouMatch: 0.3,
  maxCenterDist: 0.35,
  maxMisses: 1,
  paddingFrac: 0,
  qPos: 6e-3,
  qVel: 8e-4,
  measNoise: 5e-4,
};

function det(x: number, y: number, w: number, h: number, score = 0.9): DetectedFace {
  return { x, y, w, h, score };
}

describe("KalmanTracker", () => {
  it("creates a track on first detection (blur-on-first-detection)", () => {
    const t = new KalmanTracker(OPTS);
    t.update([det(0.4, 0.4, 0.2, 0.2)]);
    expect(t.size).toBe(1);
    expect(t.boxes().length).toBe(1);
  });

  it("holds a track through a miss up to maxMisses then drops it (privacy-critical)", () => {
    const t = new KalmanTracker(OPTS);
    t.update([det(0.4, 0.4, 0.2, 0.2)]);
    expect(t.size).toBe(1);
    t.predict();
    t.update([]);
    expect(t.size).toBe(1);
    t.predict();
    t.update([]);
    expect(t.size).toBe(0);
  });

  it("associates overlapping detections to the same track across frames", () => {
    const t = new KalmanTracker(OPTS);
    t.update([det(0.4, 0.4, 0.2, 0.2)]);
    const id1 = t.boxesWithIds()[0].id;
    t.predict();
    t.update([det(0.41, 0.4, 0.2, 0.2)]);
    expect(t.size).toBe(1);
    expect(t.boxesWithIds()[0].id).toBe(id1);
  });

  it("spawns separate tracks for two distinct faces", () => {
    const t = new KalmanTracker(OPTS);
    t.update([det(0.1, 0.1, 0.15, 0.15), det(0.7, 0.7, 0.15, 0.15)]);
    expect(t.size).toBe(2);
    const ids = t.boxesWithIds().map((b) => b.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("applies padding to emitted boxes", () => {
    const t = new KalmanTracker({ ...OPTS, paddingFrac: 0.5 });
    t.update([det(0.4, 0.4, 0.2, 0.2)]);
    const box = t.boxes()[0];
    expect(box.w).toBeCloseTo(0.3, 5);
  });

  it("exposes the matched detection per track for embedding (lastMatches)", () => {
    const t = new KalmanTracker(OPTS);
    const d = det(0.4, 0.4, 0.2, 0.2);
    t.update([d]);
    const matches = t.lastMatches();
    expect(matches.length).toBe(1);
    expect(matches[0].id).toBe(t.boxesWithIds()[0].id);
    expect(matches[0].det.score).toBe(0.9);
  });
});
