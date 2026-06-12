import { describe, expect, it } from "vitest";
import {
  RVM_INTERNAL_LONG,
  RVM_SRC_LONG_SIDE,
  chooseMatteLayout,
  packRgbPlanar,
} from "@/lib/model/rvm-layout";

describe("chooseMatteLayout", () => {
  it("scales 1080p to the wasm operating point with ds=1", () => {
    const layout = chooseMatteLayout(1920, 1080, "wasm");
    expect(layout.matteW).toBe(512);
    expect(layout.matteH).toBe(288);
    expect(layout.downsampleRatio).toBe(1);
  });

  it("scales 1080p to the webgpu operating point with full-body internal res", () => {
    const layout = chooseMatteLayout(1920, 1080, "webgpu");
    expect(layout.matteW).toBe(960);
    expect(layout.matteH).toBe(540);
    expect(layout.downsampleRatio).toBeCloseTo(0.8, 5);
    expect(Math.round(layout.matteW * layout.downsampleRatio)).toBe(RVM_INTERNAL_LONG);
  });

  it("handles portrait sources", () => {
    const layout = chooseMatteLayout(1080, 1920, "webgpu");
    expect(layout.matteW).toBe(540);
    expect(layout.matteH).toBe(960);
    expect(layout.downsampleRatio).toBeCloseTo(0.8, 5);
  });

  it("never upscales beyond the source", () => {
    const layout = chooseMatteLayout(320, 240, "wasm");
    expect(layout.matteW).toBe(320);
    expect(layout.matteH).toBe(240);
    expect(layout.downsampleRatio).toBe(1);
  });

  it("produces even dimensions", () => {
    const layout = chooseMatteLayout(1283, 721, "wasm");
    expect(layout.matteW % 2).toBe(0);
    expect(layout.matteH % 2).toBe(0);
    expect(layout.matteW).toBeLessThanOrEqual(RVM_SRC_LONG_SIDE.wasm);
  });

  it("clamps the downsample ratio to at most 1", () => {
    const layout = chooseMatteLayout(640, 360, "wasm");
    expect(layout.downsampleRatio).toBe(1);
  });
});

describe("packRgbPlanar", () => {
  it("converts interleaved RGBA into planar RGB normalized to 0-1", () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 128, 64, 255]);
    const out = new Float32Array(6);
    packRgbPlanar(rgba, out);
    expect(out[0]).toBeCloseTo(1, 5);
    expect(out[1]).toBeCloseTo(0, 5);
    expect(out[2]).toBeCloseTo(0, 5);
    expect(out[3]).toBeCloseTo(128 / 255, 5);
    expect(out[4]).toBeCloseTo(0, 5);
    expect(out[5]).toBeCloseTo(64 / 255, 5);
  });
});
