import { cosine } from "./cluster";

export const UNKNOWN_IDENTITY = -1;
export const IDENTITY_CONFIDENCE_FLOOR = 0.3;

export interface TrackEmbeds {
  trackId: number;
  embeds: Float32Array[];
}

export interface GalleryIdentity {
  identityId: number;
  members: Float32Array[];
}

export function bestIdentityForEmbed(
  emb: Float32Array,
  gallery: GalleryIdentity[],
): { identityId: number; score: number } {
  let bestId = UNKNOWN_IDENTITY;
  let bestScore = -Infinity;
  for (const identity of gallery) {
    let s = -Infinity;
    for (const m of identity.members) {
      const c = cosine(emb, m);
      if (c > s) s = c;
    }
    if (s > bestScore) {
      bestScore = s;
      bestId = identity.identityId;
    }
  }
  return { identityId: bestId, score: bestScore };
}

function assignOne(track: TrackEmbeds, gallery: GalleryIdentity[], floor: number): number {
  if (track.embeds.length === 0 || gallery.length === 0) return UNKNOWN_IDENTITY;

  const votes = new Map<number, number>();
  const maxScore = new Map<number, number>();
  for (const emb of track.embeds) {
    const { identityId, score } = bestIdentityForEmbed(emb, gallery);
    if (identityId === UNKNOWN_IDENTITY) continue;
    votes.set(identityId, (votes.get(identityId) ?? 0) + 1);
    maxScore.set(identityId, Math.max(maxScore.get(identityId) ?? -Infinity, score));
  }
  if (votes.size === 0) return UNKNOWN_IDENTITY;

  let winner = UNKNOWN_IDENTITY;
  let winnerVotes = -1;
  let winnerScore = -Infinity;
  for (const [id, v] of votes) {
    const s = maxScore.get(id) ?? -Infinity;
    if (v > winnerVotes || (v === winnerVotes && s > winnerScore)) {
      winner = id;
      winnerVotes = v;
      winnerScore = s;
    }
  }

  return winnerScore < floor ? UNKNOWN_IDENTITY : winner;
}

export function assignTracksToIdentities(
  tracks: TrackEmbeds[],
  gallery: GalleryIdentity[],
  floor: number = IDENTITY_CONFIDENCE_FLOOR,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const track of tracks) {
    out.set(track.trackId, assignOne(track, gallery, floor));
  }
  return out;
}
