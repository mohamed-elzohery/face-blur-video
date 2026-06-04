import { describe, expect, it } from "vitest";
import { faceQuality, laplacianVariance, type QualityInput } from "@/lib/model/face-quality";
import type { FaceLandmarks } from "@/lib/types";

const W = 1920;
const H = 1080;

function frontalLandmarks(cx: number, cy: number, eye: number): FaceLandmarks {
  return {
    pts: [
      [cx - eye, cy - 0.02],
      [cx + eye, cy - 0.02],
      [cx, cy + 0.01],
      [cx - eye * 0.7, cy + 0.04],
      [cx + eye * 0.7, cy + 0.04],
    ],
    vis: [1, 1, 1, 1, 1],
  };
}

function clean(overrides: Partial<QualityInput> = {}): QualityInput {
  return {
    box: { x: 0.4, y: 0.4, w: 0.12, h: 0.16 },
    score: 0.85,
    W,
    H,
    landmarks: frontalLandmarks(0.46, 0.46, 0.03),
    sharpness: 300,
    ...overrides,
  };
}

describe("faceQuality", () => {
  it("accepts a clean, frontal, sharp, confident face", () => {
    const r = faceQuality(clean());
    expect(r.eligible).toBe(true);
    expect(r.q).toBeGreaterThan(0.6);
  });

  it("rejects a tiny face", () => {
    const r = faceQuality(clean({ box: { x: 0.5, y: 0.5, w: 0.01, h: 0.01 } }));
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain("too-small");
  });

  it("rejects a low-confidence detection", () => {
    const r = faceQuality(clean({ score: 0.3 }));
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain("low-confidence");
  });

  it("rejects a heavily rolled face", () => {
    const rolled: FaceLandmarks = {
      pts: [
        [0.43, 0.4],
        [0.49, 0.5],
        [0.46, 0.47],
        [0.435, 0.52],
        [0.485, 0.55],
      ],
      vis: [1, 1, 1, 1, 1],
    };
    const r = faceQuality(clean({ landmarks: rolled }));
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain("rolled");
  });

  it("rejects a strong profile (yaw)", () => {
    const yawed: FaceLandmarks = {
      pts: [
        [0.43, 0.44],
        [0.49, 0.44],
        [0.505, 0.47],
        [0.44, 0.5],
        [0.48, 0.5],
      ],
      vis: [1, 1, 1, 1, 1],
    };
    const r = faceQuality(clean({ landmarks: yawed }));
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain("yawed");
  });

  it("rejects a blurry crop", () => {
    const r = faceQuality(clean({ sharpness: 5 }));
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain("blurry");
  });

  it("gives a higher quality score to larger faces", () => {
    const small = faceQuality(clean({ box: { x: 0.4, y: 0.4, w: 0.05, h: 0.06 } })).q;
    const big = faceQuality(clean({ box: { x: 0.3, y: 0.3, w: 0.2, h: 0.26 } })).q;
    expect(big).toBeGreaterThan(small);
  });

  it("gives a higher quality score to more confident detections", () => {
    const lo = faceQuality(clean({ score: 0.55 })).q;
    const hi = faceQuality(clean({ score: 0.98 })).q;
    expect(hi).toBeGreaterThan(lo);
  });
});

describe("laplacianVariance", () => {
  it("is near zero for a flat image", () => {
    const w = 16;
    const h = 16;
    const data = new Uint8ClampedArray(w * h * 4).fill(128);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    expect(laplacianVariance({ data, width: w, height: h })).toBeLessThan(1);
  });

  it("is large for a high-contrast checkerboard", () => {
    const w = 16;
    const h = 16;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = (x + y) % 2 === 0 ? 0 : 255;
        const i = (y * w + x) * 4;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    expect(laplacianVariance({ data, width: w, height: h })).toBeGreaterThan(1000);
  });
});
