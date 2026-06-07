import { describe, expect, it } from "vitest";
import {
  assignTracksToIdentities,
  IDENTITY_CONFIDENCE_FLOOR,
  UNKNOWN_IDENTITY,
  type GalleryIdentity,
  type TrackEmbeds,
} from "@/worker/blurPlan";

function f32(...v: number[]): Float32Array {
  return new Float32Array(v);
}

function unit(deg: number): Float32Array {
  const r = (deg * Math.PI) / 180;
  return f32(Math.cos(r), Math.sin(r));
}

describe("assignTracksToIdentities", () => {
  it("assigns hat and no-hat tracks of one person to the same identity", () => {
    const aHat = unit(0);
    const aNoHat = unit(55);
    const b = unit(160);
    const gallery: GalleryIdentity[] = [
      { identityId: 1, members: [aHat, aNoHat] },
      { identityId: 2, members: [b] },
    ];
    const tracks: TrackEmbeds[] = [
      { trackId: 10, embeds: [unit(2), unit(-3)] },
      { trackId: 11, embeds: [unit(53), unit(58)] },
    ];
    const map = assignTracksToIdentities(tracks, gallery);
    expect(map.get(10)).toBe(1);
    expect(map.get(11)).toBe(1);
  });

  it("matches a track by nearest gallery member, not by the averaged centroid", () => {
    const gallery: GalleryIdentity[] = [
      { identityId: 1, members: [unit(0), unit(80)] },
      { identityId: 2, members: [unit(38)] },
    ];
    const map = assignTracksToIdentities([{ trackId: 5, embeds: [unit(2)] }], gallery);
    expect(map.get(5)).toBe(1);
  });

  it("uses majority vote across a track's embeddings to resist a single outlier", () => {
    const gallery: GalleryIdentity[] = [
      { identityId: 1, members: [unit(0)] },
      { identityId: 2, members: [unit(90)] },
    ];
    const tracks: TrackEmbeds[] = [
      { trackId: 7, embeds: [unit(5), unit(-4), unit(8), unit(3), unit(88)] },
    ];
    const map = assignTracksToIdentities(tracks, gallery);
    expect(map.get(7)).toBe(1);
  });

  it("breaks vote ties by higher max similarity", () => {
    const gallery: GalleryIdentity[] = [
      { identityId: 1, members: [unit(0)] },
      { identityId: 2, members: [unit(90)] },
    ];
    const map = assignTracksToIdentities([{ trackId: 9, embeds: [unit(1), unit(70)] }], gallery);
    expect(map.get(9)).toBe(1);
  });

  it("returns UNKNOWN when the best match is below the confidence floor", () => {
    const gallery: GalleryIdentity[] = [{ identityId: 1, members: [unit(0)] }];
    const map = assignTracksToIdentities([{ trackId: 3, embeds: [unit(89)] }], gallery);
    expect(map.get(3)).toBe(UNKNOWN_IDENTITY);
  });

  it("returns UNKNOWN for a track with no embeddings", () => {
    const gallery: GalleryIdentity[] = [{ identityId: 1, members: [unit(0)] }];
    const map = assignTracksToIdentities([{ trackId: 1, embeds: [] }], gallery);
    expect(map.get(1)).toBe(UNKNOWN_IDENTITY);
  });

  it("returns UNKNOWN for every track when the gallery is empty", () => {
    const map = assignTracksToIdentities([{ trackId: 1, embeds: [unit(0)] }], []);
    expect(map.get(1)).toBe(UNKNOWN_IDENTITY);
  });

  it("exposes a confidence floor below the cluster merge threshold", () => {
    expect(IDENTITY_CONFIDENCE_FLOOR).toBeGreaterThan(0);
    expect(IDENTITY_CONFIDENCE_FLOOR).toBeLessThan(0.363);
  });
});
