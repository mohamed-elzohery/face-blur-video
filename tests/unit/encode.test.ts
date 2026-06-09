import { QUALITY_MEDIUM, type InputVideoTrack } from "mediabunny";
import { describe, expect, it } from "vitest";
import { DEFAULT_JOB_CONFIG, STYLE_CODE, type JobConfig } from "@/lib/types";
import {
  FEATHER_PX,
  MAX_BLOCK_FRAC,
  MIN_BLOCK_FRAC,
  MIN_BLOCK_PX,
  rendererOptionsFor,
  resolveVideoBitrate,
} from "@/worker/encode";

function withDensity(density: number): JobConfig {
  return { ...DEFAULT_JOB_CONFIG, density };
}

function fakeTrack(avg: number | null, peak: number | null): InputVideoTrack {
  return {
    getAverageBitrate: async () => avg,
    getBitrate: async () => peak,
  } as unknown as InputVideoTrack;
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

describe("resolveVideoBitrate", () => {
  it("prefers the metadata average bitrate when consistent with the file", async () => {
    const bitrate = await resolveVideoBitrate(fakeTrack(1_500_000, 4_000_000), 10_000_000, 30);
    expect(bitrate).toBe(1_500_000);
  });

  it("falls back to the peak bitrate when average is missing", async () => {
    const bitrate = await resolveVideoBitrate(fakeTrack(null, 2_200_000), 10_000_000, 30);
    expect(bitrate).toBe(2_200_000);
  });

  it("caps a bogus-high metadata bitrate at the actual container bitrate", async () => {
    const fileSize = 5_000_000;
    const durationSec = 30;
    const bitrate = await resolveVideoBitrate(fakeTrack(10_000_000, 12_000_000), fileSize, durationSec);
    expect(bitrate).toBe(Math.round((fileSize * 8) / durationSec));
  });

  it("estimates from container size when no metadata bitrate exists", async () => {
    const bitrate = await resolveVideoBitrate(fakeTrack(null, null), 5_000_000, 30);
    expect(bitrate).toBe(Math.round(((5_000_000 * 8) / 30) * 0.92));
  });

  it("never targets more than the source overall bitrate", async () => {
    const fileSize = 5_000_000;
    const durationSec = 30;
    const sourceBitrate = (fileSize * 8) / durationSec;
    for (const track of [fakeTrack(null, null), fakeTrack(9_000_000, null), fakeTrack(null, 9_000_000)]) {
      const bitrate = await resolveVideoBitrate(track, fileSize, durationSec);
      expect(bitrate as number).toBeLessThanOrEqual(sourceBitrate);
    }
  });

  it("returns QUALITY_MEDIUM when bitrate is unmeasurable", async () => {
    expect(await resolveVideoBitrate(fakeTrack(null, null), 0, 0)).toBe(QUALITY_MEDIUM);
    expect(await resolveVideoBitrate(fakeTrack(0, 0), 5_000_000, 0)).toBe(QUALITY_MEDIUM);
  });
});
