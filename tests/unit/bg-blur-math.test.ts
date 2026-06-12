import { describe, expect, it } from "vitest";
import {
  MAX_BG_RADIUS_FRAC,
  MIN_BG_RADIUS_FRAC,
  bgRadiusFracForDensity,
} from "@/lib/blurMath";

describe("bgRadiusFracForDensity", () => {
  it("maps zero density to the minimum radius fraction", () => {
    expect(bgRadiusFracForDensity(0)).toBeCloseTo(MIN_BG_RADIUS_FRAC, 6);
  });

  it("maps full density to the maximum radius fraction", () => {
    expect(bgRadiusFracForDensity(1)).toBeCloseTo(MAX_BG_RADIUS_FRAC, 6);
  });

  it("interpolates linearly", () => {
    const mid = bgRadiusFracForDensity(0.5);
    expect(mid).toBeCloseTo((MIN_BG_RADIUS_FRAC + MAX_BG_RADIUS_FRAC) / 2, 6);
  });

  it("clamps out-of-range densities", () => {
    expect(bgRadiusFracForDensity(-1)).toBeCloseTo(MIN_BG_RADIUS_FRAC, 6);
    expect(bgRadiusFracForDensity(2)).toBeCloseTo(MAX_BG_RADIUS_FRAC, 6);
  });
});
