import { describe, expect, it } from "vitest";
import { DEFAULT_JOB_CONFIG, STYLE_CODE, type JobConfig } from "@/lib/types";
import {
  FEATHER_PX,
  MAX_BLOCK_FRAC,
  MIN_BLOCK_FRAC,
  MIN_BLOCK_PX,
  rendererOptionsFor,
} from "@/worker/encode";

function withDensity(density: number): JobConfig {
  return { ...DEFAULT_JOB_CONFIG, density };
}

describe("rendererOptionsFor density mapping", () => {
  it("maps density 0 to the minimum block fraction", () => {
    expect(rendererOptionsFor(withDensity(0)).blockFrac).toBeCloseTo(MIN_BLOCK_FRAC, 10);
  });

  it("maps density 1 to the maximum block fraction", () => {
    expect(rendererOptionsFor(withDensity(1)).blockFrac).toBeCloseTo(MAX_BLOCK_FRAC, 10);
  });

  it("maps the default density 0.6 to the legacy default output", () => {
    const expected = MIN_BLOCK_FRAC + 0.6 * (MAX_BLOCK_FRAC - MIN_BLOCK_FRAC);
    expect(rendererOptionsFor(withDensity(0.6)).blockFrac).toBeCloseTo(expected, 10);
  });

  it("clamps out-of-range density values", () => {
    expect(rendererOptionsFor(withDensity(5)).blockFrac).toBeCloseTo(MAX_BLOCK_FRAC, 10);
    expect(rendererOptionsFor(withDensity(-3)).blockFrac).toBeCloseTo(MIN_BLOCK_FRAC, 10);
  });

  it("passes through fixed feather, min block, and style", () => {
    const opts = rendererOptionsFor(withDensity(0.5));
    expect(opts.featherPx).toBe(FEATHER_PX);
    expect(opts.minBlockPx).toBe(MIN_BLOCK_PX);
    expect(opts.style).toBe(STYLE_CODE[DEFAULT_JOB_CONFIG.style]);
  });
});
