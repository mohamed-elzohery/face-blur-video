export const MIN_BLOCK_PX = 6;
export const MIN_BLOCK_FRAC = 0.07;
export const MAX_BLOCK_FRAC = 0.22;

export function blockFracForDensity(density: number): number {
  const d = Math.min(1, Math.max(0, density));
  return MIN_BLOCK_FRAC + d * (MAX_BLOCK_FRAC - MIN_BLOCK_FRAC);
}

export const MIN_BG_RADIUS_FRAC = 0.012;
export const MAX_BG_RADIUS_FRAC = 0.06;

export function bgRadiusFracForDensity(density: number): number {
  const d = Math.min(1, Math.max(0, density));
  return MIN_BG_RADIUS_FRAC + d * (MAX_BG_RADIUS_FRAC - MIN_BG_RADIUS_FRAC);
}
