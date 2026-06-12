import type { DetectorEP } from "@/lib/types";

export const RVM_SRC_LONG_SIDE: Record<DetectorEP, number> = {
  webgpu: 960,
  wasm: 512,
};

export const RVM_INTERNAL_LONG = 768;
export const RVM_DS_MIN = 0.125;

export interface MatteLayout {
  matteW: number;
  matteH: number;
  downsampleRatio: number;
}

function roundEven(v: number): number {
  return Math.max(2, 2 * Math.round(v / 2));
}

export function chooseMatteLayout(srcW: number, srcH: number, ep: DetectorEP): MatteLayout {
  const target = RVM_SRC_LONG_SIDE[ep];
  const longSide = Math.max(srcW, srcH);
  const scale = Math.min(1, target / longSide);
  const matteW = roundEven(srcW * scale);
  const matteH = roundEven(srcH * scale);
  const matteLong = Math.max(matteW, matteH);
  const downsampleRatio = Math.min(1, Math.max(RVM_DS_MIN, RVM_INTERNAL_LONG / matteLong));
  return { matteW, matteH, downsampleRatio };
}

export function packRgbPlanar(rgba: Uint8ClampedArray | Uint8Array, out: Float32Array): void {
  const plane = out.length / 3;
  for (let p = 0, i = 0; p < plane; p++, i += 4) {
    out[p] = rgba[i] / 255;
    out[plane + p] = rgba[i + 1] / 255;
    out[2 * plane + p] = rgba[i + 2] / 255;
  }
}
