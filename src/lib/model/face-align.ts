import type { VideoSample } from "mediabunny";

export const ALIGNED_SIZE = 112;

export const SFACE_TEMPLATE_112: [number, number][] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

export interface SimilarityTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export function estimateSimilarityTransform(
  src: [number, number][],
  dst: [number, number][],
): SimilarityTransform {
  const n = Math.min(src.length, dst.length);
  let sx = 0;
  let sy = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    sx += src[i][0];
    sy += src[i][1];
    dx += dst[i][0];
    dy += dst[i][1];
  }
  const muSx = sx / n;
  const muSy = sy / n;
  const muDx = dx / n;
  const muDy = dy / n;

  let varSrc = 0;
  let covA = 0;
  let covB = 0;
  for (let i = 0; i < n; i++) {
    const xc = src[i][0] - muSx;
    const yc = src[i][1] - muSy;
    const uc = dst[i][0] - muDx;
    const vc = dst[i][1] - muDy;
    varSrc += xc * xc + yc * yc;
    covA += xc * uc + yc * vc;
    covB += xc * vc - yc * uc;
  }
  const denom = varSrc + 1e-12;
  const scaleCos = covA / denom;
  const scaleSin = covB / denom;

  const a = scaleCos;
  const b = scaleSin;
  const c = -scaleSin;
  const d = scaleCos;
  const e = muDx - (a * muSx + c * muSy);
  const f = muDy - (b * muSx + d * muSy);
  return { a, b, c, d, e, f };
}

export function applyTransform(m: SimilarityTransform, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

export function warpFaceTo112(
  sample: VideoSample,
  landmarksPx: [number, number][],
  ctx: OffscreenCanvasRenderingContext2D,
): void {
  const m = estimateSimilarityTransform(landmarksPx, SFACE_TEMPLATE_112);
  ctx.save();
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  ctx.imageSmoothingEnabled = true;
  sample.draw(ctx, 0, 0, sample.displayWidth, sample.displayHeight);
  ctx.restore();
}
