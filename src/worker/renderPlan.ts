import type { Box, DetectorEP, JobConfig } from "@/lib/types";
import { UNKNOWN_IDENTITY } from "./blurPlan";

export { UNKNOWN_IDENTITY };

export interface PlanEntry {
  trackId: number;
  box: Box;
}

export type FramePlan = Map<number, PlanEntry[]>;

export interface SourceIdentity {
  name: string;
  size: number;
  lastModified: number;
}

export interface AnalyzedPlan {
  source: SourceIdentity;
  framePlan: FramePlan;
  trackToIdentity: Map<number, number>;
  identityCount: number;
  detectorEP: DetectorEP;
  config: JobConfig;
}

export function sourceIdentity(file: File): SourceIdentity {
  return { name: file.name, size: file.size, lastModified: file.lastModified };
}

export function sameSource(a: SourceIdentity, b: SourceIdentity): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

export function keepSetFromSelection(keepIds: number[]): Set<number> {
  return new Set(keepIds);
}

export function shouldBlur(
  trackId: number,
  trackToIdentity: Map<number, number>,
  keep: Set<number>,
): boolean {
  const id = trackToIdentity.get(trackId) ?? UNKNOWN_IDENTITY;
  return id === UNKNOWN_IDENTITY ? true : !keep.has(id);
}
