import { describe, expect, it } from "vitest";
import { bestMatch, clusterDetections, cosine, type DetRecord } from "@/worker/cluster";

function f32(...v: number[]): Float32Array {
  return new Float32Array(v);
}

function unit(deg: number): Float32Array {
  const r = (deg * Math.PI) / 180;
  return f32(Math.cos(r), Math.sin(r));
}

function noisy(base: Float32Array, jitter: number, seed: number): Float32Array {
  const out = new Float32Array(base.length);
  let s = seed;
  for (let i = 0; i < base.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = base[i] + ((s / 0x7fffffff) - 0.5) * jitter;
  }
  return out;
}

describe("cosine", () => {
  it("is 1 for identical direction, 0 for orthogonal, -1 for opposite", () => {
    expect(cosine(f32(1, 0), f32(2, 0))).toBeCloseTo(1, 6);
    expect(cosine(f32(1, 0), f32(0, 5))).toBeCloseTo(0, 6);
    expect(cosine(f32(1, 0), f32(-3, 0))).toBeCloseTo(-1, 6);
  });
});

describe("clusterDetections", () => {
  it("groups two well-separated identities into exactly 2 clusters", () => {
    const a = f32(1, 0, 0);
    const b = f32(0, 1, 0);
    const records: DetRecord[] = [
      { emb: noisy(a, 0.05, 1), q: 0.9, frameId: 0 },
      { emb: noisy(a, 0.05, 2), q: 0.8, frameId: 1 },
      { emb: noisy(a, 0.05, 3), q: 0.85, frameId: 2 },
      { emb: noisy(b, 0.05, 4), q: 0.7, frameId: 3 },
      { emb: noisy(b, 0.05, 5), q: 0.95, frameId: 4 },
    ];
    const clusters = clusterDetections(records);
    expect(clusters.length).toBe(2);
    expect(clusters[0].support).toBe(3);
    expect(clusters[1].support).toBe(2);
  });

  it("never merges two faces visible in the same frame (temporal constraint)", () => {
    const a = f32(1, 0, 0);
    const records: DetRecord[] = [
      { emb: a.slice(), q: 0.9, frameId: 7 },
      { emb: noisy(a, 0.001, 9), q: 0.9, frameId: 7 },
    ];
    const clusters = clusterDetections(records);
    expect(clusters.length).toBe(2);
  });

  it("keeps similar-but-distinct faces as separate identities at the default threshold", () => {
    const records: DetRecord[] = [
      { emb: unit(0), q: 0.9, frameId: 0 },
      { emb: unit(60), q: 0.9, frameId: 1 },
    ];
    const clusters = clusterDetections(records);
    expect(clusters.length).toBe(2);
  });

  it("does not over-merge a chain (A~B, B~C, A!~C) under centroid linkage", () => {
    const records: DetRecord[] = [
      { emb: unit(0), q: 0.9, frameId: 0 },
      { emb: unit(60), q: 0.9, frameId: 1 },
      { emb: unit(120), q: 0.9, frameId: 2 },
    ];
    const clusters = clusterDetections(records, { mergeCosine: 0.363 });
    expect(clusters.length).toBe(2);
  });

  it("merges the same person across frames into one cluster", () => {
    const a = f32(0.2, 0.97, 0.1);
    const records: DetRecord[] = [
      { emb: noisy(a, 0.04, 11), q: 0.6, frameId: 0 },
      { emb: noisy(a, 0.04, 12), q: 0.9, frameId: 1 },
      { emb: noisy(a, 0.04, 13), q: 0.75, frameId: 2 },
    ];
    const clusters = clusterDetections(records);
    expect(clusters.length).toBe(1);
    expect(clusters[0].support).toBe(3);
    expect(clusters[0].quality).toBeCloseTo(0.9, 6);
  });

  it("drops single low-quality detections as noise but keeps clean singletons", () => {
    const a = f32(1, 0, 0);
    const b = f32(0, 0, 1);
    const records: DetRecord[] = [
      { emb: a.slice(), q: 0.2, frameId: 0 },
      { emb: b.slice(), q: 0.85, frameId: 1 },
    ];
    const clusters = clusterDetections(records);
    expect(clusters.length).toBe(1);
    expect(clusters[0].quality).toBeCloseTo(0.85, 6);
  });

  it("returns an L2-normalized centroid", () => {
    const a = f32(3, 4, 0);
    const clusters = clusterDetections([{ emb: a.slice(), q: 0.9, frameId: 0 }]);
    const c = clusters[0].centroid;
    const norm = Math.hypot(...Array.from(c));
    expect(norm).toBeCloseTo(1, 6);
  });

  it("returns empty for no records", () => {
    expect(clusterDetections([])).toEqual([]);
  });
});

describe("bestMatch", () => {
  it("returns the closest centroid index and its cosine", () => {
    const centroids = [f32(1, 0), f32(0, 1)];
    const m = bestMatch(f32(0.9, 0.1), centroids);
    expect(m.index).toBe(0);
    expect(m.cosine).toBeGreaterThan(0.9);
  });

  it("returns index -1 when there are no centroids", () => {
    expect(bestMatch(f32(1, 0), []).index).toBe(-1);
  });
});
