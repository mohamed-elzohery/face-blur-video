import { clusterDetections, type DetRecord } from "./cluster";
import { assignTracksToIdentities, type GalleryIdentity, type TrackEmbeds } from "./blurPlan";

export interface TrackedRecord {
  emb: Float32Array;
  q: number;
  frameId: number;
  trackId: number;
}

export interface Identity {
  identityId: number;
  support: number;
  quality: number;
  centroid: Float32Array;
  memberRecordIdxs: number[];
}

export interface IdentitiesResult {
  identities: Identity[];
  trackToIdentity: Map<number, number>;
}

export function buildIdentities(
  records: TrackedRecord[],
  trackIds: number[],
  trackEmbeds: Map<number, Float32Array[]>,
): IdentitiesResult {
  const detRecords: DetRecord[] = records.map((r) => ({ emb: r.emb, q: r.q, frameId: r.frameId }));
  const clusters = clusterDetections(detRecords);

  const identities: Identity[] = [];
  const gallery: GalleryIdentity[] = [];
  let identityId = 1;
  for (const cl of clusters) {
    identities.push({
      identityId,
      support: cl.support,
      quality: cl.quality,
      centroid: cl.centroid,
      memberRecordIdxs: cl.members,
    });
    gallery.push({ identityId, members: cl.members.map((i) => records[i].emb) });
    identityId += 1;
  }

  const tracks: TrackEmbeds[] = trackIds.map((id) => ({
    trackId: id,
    embeds: trackEmbeds.get(id) ?? [],
  }));
  const trackToIdentity = assignTracksToIdentities(tracks, gallery);

  return { identities, trackToIdentity };
}
