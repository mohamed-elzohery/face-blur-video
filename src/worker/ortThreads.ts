export const THREAD_CAP = 4;

export function pickNumThreads(
  crossOriginIsolated: boolean,
  cores: number,
  cap: number = THREAD_CAP,
): number {
  if (!crossOriginIsolated) return 1;
  const c = Number.isFinite(cores) && cores > 0 ? Math.floor(cores) : 4;
  return Math.max(1, Math.min(c, cap));
}
