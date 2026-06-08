export const MIN_BLOCK_PX = 6;
export const MIN_BLOCK_FRAC = 0.07;
export const MAX_BLOCK_FRAC = 0.22;

export function blockFracForDensity(density: number): number {
  const d = Math.min(1, Math.max(0, density));
  return MIN_BLOCK_FRAC + d * (MAX_BLOCK_FRAC - MIN_BLOCK_FRAC);
}
