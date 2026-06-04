import { describe, expect, it } from "vitest";
import {
  applyTransform,
  estimateSimilarityTransform,
  SFACE_TEMPLATE_112,
} from "@/lib/model/face-align";

const TEMPLATE = SFACE_TEMPLATE_112;

describe("estimateSimilarityTransform", () => {
  it("is the identity when src equals dst", () => {
    const m = estimateSimilarityTransform(TEMPLATE, TEMPLATE);
    expect(m.a).toBeCloseTo(1, 6);
    expect(m.b).toBeCloseTo(0, 6);
    expect(m.c).toBeCloseTo(0, 6);
    expect(m.d).toBeCloseTo(1, 6);
    expect(m.e).toBeCloseTo(0, 6);
    expect(m.f).toBeCloseTo(0, 6);
  });

  it("recovers a pure scale + translation", () => {
    const src = TEMPLATE.map(([x, y]): [number, number] => [(x - 56) / 2 + 200, (y - 56) / 2 + 100]);
    const m = estimateSimilarityTransform(src, TEMPLATE);
    for (let i = 0; i < src.length; i++) {
      const [ox, oy] = applyTransform(m, src[i][0], src[i][1]);
      expect(ox).toBeCloseTo(TEMPLATE[i][0], 4);
      expect(oy).toBeCloseTo(TEMPLATE[i][1], 4);
    }
  });

  it("recovers a rotation", () => {
    const theta = Math.PI / 5;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const src = TEMPLATE.map(([x, y]): [number, number] => {
      const xc = x - 56;
      const yc = y - 56;
      return [cos * xc - sin * yc + 56, sin * xc + cos * yc + 56];
    });
    const m = estimateSimilarityTransform(src, TEMPLATE);
    for (let i = 0; i < src.length; i++) {
      const [ox, oy] = applyTransform(m, src[i][0], src[i][1]);
      expect(ox).toBeCloseTo(TEMPLATE[i][0], 3);
      expect(oy).toBeCloseTo(TEMPLATE[i][1], 3);
    }
  });

  it("produces a true similarity (uniform scale, no skew)", () => {
    const src: [number, number][] = [
      [10, 12],
      [40, 14],
      [27, 33],
      [14, 50],
      [38, 51],
    ];
    const m = estimateSimilarityTransform(src, TEMPLATE);
    expect(m.a).toBeCloseTo(m.d, 6);
    expect(m.c).toBeCloseTo(-m.b, 6);
    const scaleX = Math.hypot(m.a, m.b);
    const scaleY = Math.hypot(m.c, m.d);
    expect(scaleX).toBeCloseTo(scaleY, 6);
  });
});
