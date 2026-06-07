import { describe, expect, it } from "vitest";
import { buildIdentities, type TrackedRecord } from "@/worker/gallery";

function unit(deg: number): Float32Array {
  const r = (deg * Math.PI) / 180;
  return new Float32Array([Math.cos(r), Math.sin(r)]);
}

describe("buildIdentities", () => {
  it("keeps two co-visible similar faces as distinct identities (co-occurrence guard)", () => {
    const records: TrackedRecord[] = [
      { emb: unit(0), q: 0.9, frameId: 0, trackId: 1 },
      { emb: unit(1), q: 0.9, frameId: 2, trackId: 1 },
      { emb: unit(55), q: 0.9, frameId: 0, trackId: 2 },
      { emb: unit(56), q: 0.9, frameId: 2, trackId: 2 },
    ];
    const trackEmbeds = new Map<number, Float32Array[]>([
      [1, [unit(0), unit(1)]],
      [2, [unit(55), unit(56)]],
    ]);
    const { identities, trackToIdentity } = buildIdentities(records, [1, 2], trackEmbeds);
    expect(identities.length).toBe(2);
    expect(trackToIdentity.get(1)).not.toBe(trackToIdentity.get(2));
    expect(trackToIdentity.get(1)).toBeGreaterThan(0);
    expect(trackToIdentity.get(2)).toBeGreaterThan(0);
  });

  it("merges the same person's two non-overlapping tracks into one identity", () => {
    const records: TrackedRecord[] = [
      { emb: unit(0), q: 0.9, frameId: 0, trackId: 1 },
      { emb: unit(2), q: 0.9, frameId: 1, trackId: 1 },
      { emb: unit(1), q: 0.9, frameId: 5, trackId: 7 },
      { emb: unit(3), q: 0.9, frameId: 6, trackId: 7 },
    ];
    const trackEmbeds = new Map<number, Float32Array[]>([
      [1, [unit(0), unit(2)]],
      [7, [unit(1), unit(3)]],
    ]);
    const { identities, trackToIdentity } = buildIdentities(records, [1, 7], trackEmbeds);
    expect(identities.length).toBe(1);
    expect(trackToIdentity.get(1)).toBe(1);
    expect(trackToIdentity.get(7)).toBe(1);
  });

  it("keeps a sustained mediocre-quality face (support > 1, not a dropped singleton)", () => {
    const records: TrackedRecord[] = [
      { emb: unit(0), q: 0.3, frameId: 0, trackId: 1 },
      { emb: unit(1), q: 0.3, frameId: 1, trackId: 1 },
      { emb: unit(2), q: 0.3, frameId: 2, trackId: 1 },
    ];
    const { identities } = buildIdentities(records, [1], new Map([[1, [unit(0)]]]));
    expect(identities.length).toBe(1);
    expect(identities[0].support).toBe(3);
  });

  it("maps a track with no embeddings to UNKNOWN", () => {
    const records: TrackedRecord[] = [{ emb: unit(0), q: 0.9, frameId: 0, trackId: 1 }];
    const { trackToIdentity } = buildIdentities(records, [1, 9], new Map([[1, [unit(0)]]]));
    expect(trackToIdentity.get(1)).toBe(1);
    expect(trackToIdentity.get(9)).toBe(-1);
  });

  it("returns a gallery whose members are the cluster's member embeddings", () => {
    const records: TrackedRecord[] = [
      { emb: unit(0), q: 0.9, frameId: 0, trackId: 1 },
      { emb: unit(2), q: 0.9, frameId: 1, trackId: 1 },
    ];
    const { identities, gallery } = buildIdentities(records, [1], new Map([[1, [unit(0)]]]));
    expect(gallery.length).toBe(identities.length);
    expect(gallery[0].identityId).toBe(identities[0].identityId);
    expect(gallery[0].members.length).toBe(identities[0].memberRecordIdxs.length);
  });
});
