import type { Box } from "@/lib/types";
import {
  UNKNOWN_IDENTITY,
  bestIdentityForEmbed,
  type GalleryIdentity,
} from "./blurPlan";
import type { TrackedRecord } from "./gallery";

export const PER_FRAME_FLOOR = 0.4;
export const GALLERY_PER_TRACK_CAP = 8;
export const GALLERY_MAX_RECORDS = 600;

export interface RawFace {
  box: Box;
  trackId: number;
  emb: Float32Array | null;
}

export interface ResolvedEntry {
  trackId: number;
  box: Box;
  identityId: number;
}

export interface GalleryCandidate {
  emb: Float32Array;
  q: number;
  frameId: number;
}

export function resolveFramePlan(
  rawFrames: Map<number, RawFace[]>,
  gallery: GalleryIdentity[],
  trackToIdentity: Map<number, number>,
  floor: number = PER_FRAME_FLOOR,
): Map<number, ResolvedEntry[]> {
  const out = new Map<number, ResolvedEntry[]>();
  for (const [tsUs, faces] of rawFrames) {
    const entries: ResolvedEntry[] = [];
    for (const face of faces) {
      let perFrame = UNKNOWN_IDENTITY;
      if (face.emb && gallery.length > 0) {
        const m = bestIdentityForEmbed(face.emb, gallery);
        if (m.identityId !== UNKNOWN_IDENTITY && m.score >= floor) perFrame = m.identityId;
      }
      const identityId =
        perFrame !== UNKNOWN_IDENTITY
          ? perFrame
          : trackToIdentity.get(face.trackId) ?? UNKNOWN_IDENTITY;
      entries.push({ trackId: face.trackId, box: face.box, identityId });
    }
    out.set(tsUs, entries);
  }
  return out;
}

function evenlySpacedByFrameId(cand: GalleryCandidate[], k: number): GalleryCandidate[] {
  const sorted = [...cand].sort((a, b) => a.frameId - b.frameId);
  if (sorted.length <= k) return sorted;
  const out: GalleryCandidate[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < k; i++) {
    const idx = Math.round((i * (sorted.length - 1)) / (k - 1));
    if (!seen.has(idx)) {
      seen.add(idx);
      out.push(sorted[idx]);
    }
  }
  return out;
}

function downsample(arr: TrackedRecord[], max: number): TrackedRecord[] {
  if (arr.length <= max) return arr;
  const out: TrackedRecord[] = [];
  const stride = arr.length / max;
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * stride)]);
  return out;
}

export function sampleGalleryRecords(
  perTrack: Map<number, GalleryCandidate[]>,
): TrackedRecord[] {
  const out: TrackedRecord[] = [];
  for (const [trackId, cand] of perTrack) {
    for (const c of evenlySpacedByFrameId(cand, GALLERY_PER_TRACK_CAP)) {
      out.push({ emb: c.emb, q: c.q, frameId: c.frameId, trackId });
    }
  }
  return out.length > GALLERY_MAX_RECORDS ? downsample(out, GALLERY_MAX_RECORDS) : out;
}
