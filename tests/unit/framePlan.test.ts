import { describe, expect, it } from "vitest";
import { resolveFramePlan, sampleGalleryRecords, type RawFace } from "@/worker/framePlan";
import { UNKNOWN_IDENTITY, type GalleryIdentity } from "@/worker/blurPlan";
import type { Box } from "@/lib/types";

function unit(deg: number): Float32Array {
  const r = (deg * Math.PI) / 180;
  return new Float32Array([Math.cos(r), Math.sin(r)]);
}

function box(): Box {
  return { x: 0, y: 0, w: 0.1, h: 0.1 };
}

function frames(entries: Array<[number, RawFace[]]>): Map<number, RawFace[]> {
  return new Map(entries);
}

describe("resolveFramePlan", () => {
  it("keeps a recognized frame's own identity", () => {
    const gallery: GalleryIdentity[] = [
      { identityId: 1, members: [unit(0)] },
      { identityId: 2, members: [unit(90)] },
    ];
    const raw = frames([[0, [{ box: box(), trackId: 5, emb: unit(1) }]]]);
    const out = resolveFramePlan(raw, gallery, new Map());
    expect(out.get(0)![0].identityId).toBe(1);
  });

  it("makes an unknown frame inherit its track's recognized identity (the merge)", () => {
    const gallery: GalleryIdentity[] = [{ identityId: 1, members: [unit(0)] }];
    const raw = frames([
      [0, [{ box: box(), trackId: 5, emb: unit(1) }]],
      [100, [{ box: box(), trackId: 5, emb: null }]],
    ]);
    const out = resolveFramePlan(raw, gallery, new Map([[5, 1]]));
    expect(out.get(0)![0].identityId).toBe(1);
    expect(out.get(100)!.length).toBe(1);
    expect(out.get(100)![0].identityId).toBe(1);
  });

  it("keeps two co-visible different people separate (no cross-inherit)", () => {
    const gallery: GalleryIdentity[] = [
      { identityId: 1, members: [unit(0)] },
      { identityId: 2, members: [unit(90)] },
    ];
    const raw = frames([
      [
        0,
        [
          { box: box(), trackId: 5, emb: unit(1) },
          { box: box(), trackId: 6, emb: unit(89) },
        ],
      ],
    ]);
    const out = resolveFramePlan(raw, gallery, new Map([[5, 1], [6, 2]]));
    expect(out.get(0)![0].identityId).toBe(1);
    expect(out.get(0)![1].identityId).toBe(2);
  });

  it("keeps an unrecognized face with an unknown track as UNKNOWN (still present, will blur)", () => {
    const gallery: GalleryIdentity[] = [{ identityId: 1, members: [unit(0)] }];
    const raw = frames([[0, [{ box: box(), trackId: 9, emb: unit(89) }]]]);
    const out = resolveFramePlan(raw, gallery, new Map());
    expect(out.get(0)!.length).toBe(1);
    expect(out.get(0)![0].identityId).toBe(UNKNOWN_IDENTITY);
  });

  it("lets a strong per-frame match override a stale track vote", () => {
    const gallery: GalleryIdentity[] = [
      { identityId: 1, members: [unit(0)] },
      { identityId: 2, members: [unit(90)] },
    ];
    const raw = frames([[0, [{ box: box(), trackId: 5, emb: unit(89) }]]]);
    const out = resolveFramePlan(raw, gallery, new Map([[5, 1]]));
    expect(out.get(0)![0].identityId).toBe(2);
  });
});

describe("sampleGalleryRecords", () => {
  it("caps per track and preserves a frameId shared by co-visible tracks", () => {
    const perTrack = new Map([
      [1, Array.from({ length: 20 }, (_, i) => ({ emb: unit(i), q: 0.9, frameId: i }))],
      [2, Array.from({ length: 20 }, (_, i) => ({ emb: unit(i + 90), q: 0.9, frameId: i }))],
    ]);
    const recs = sampleGalleryRecords(perTrack);
    expect(recs.filter((r) => r.trackId === 1).length).toBeLessThanOrEqual(8);
    expect(recs.filter((r) => r.trackId === 2).length).toBeLessThanOrEqual(8);

    const t1 = new Set(recs.filter((r) => r.trackId === 1).map((r) => r.frameId));
    const t2 = new Set(recs.filter((r) => r.trackId === 2).map((r) => r.frameId));
    const shared = [...t1].filter((f) => t2.has(f));
    expect(shared.length).toBeGreaterThan(0);
  });

  it("keeps all records of a short track", () => {
    const perTrack = new Map([
      [1, [{ emb: unit(0), q: 0.9, frameId: 0 }, { emb: unit(1), q: 0.8, frameId: 3 }]],
    ]);
    const recs = sampleGalleryRecords(perTrack);
    expect(recs.length).toBe(2);
  });
});
