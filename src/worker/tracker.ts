import type { Box, DetectedFace } from "@/lib/types";
import { boxCenterDist, iou, padBox } from "@/lib/coords";
import { type KalmanState, kalmanCreate, kalmanPredict, kalmanUpdate } from "./kalman";

export interface TrackMatch {
  id: number;
  det: DetectedFace;
}

export interface TrackerOptions {
  iouMatch: number;
  maxCenterDist: number;
  maxMisses: number;
  paddingFrac: number;
  qPos: number;
  qVel: number;
  measNoise: number;
}

interface Track {
  id: number;
  kx: KalmanState;
  ky: KalmanState;
  kw: KalmanState;
  kh: KalmanState;
  score: number;
  misses: number;
  hits: number;
}

function trackBox(t: Track): Box {
  return { x: t.kx.mean, y: t.ky.mean, w: t.kw.mean, h: t.kh.mean };
}

export class KalmanTracker {
  private tracks: Track[] = [];
  private nextId = 1;
  private matches: TrackMatch[] = [];

  constructor(private readonly opts: TrackerOptions) {}

  predict(): void {
    const { qPos, qVel } = this.opts;
    for (const t of this.tracks) {
      t.kx = kalmanPredict(t.kx, qPos, qVel);
      t.ky = kalmanPredict(t.ky, qPos, qVel);
      t.kw = kalmanPredict(t.kw, qPos, qVel);
      t.kh = kalmanPredict(t.kh, qPos, qVel);
    }
  }

  update(detections: DetectedFace[]): void {
    const { measNoise, iouMatch, maxCenterDist, maxMisses } = this.opts;
    const existing = this.tracks;
    const matched = new Set<number>();
    const dets = [...detections].sort((a, b) => b.score - a.score);
    const detMatched = new Array(dets.length).fill(false);
    this.matches = [];

    for (let di = 0; di < dets.length; di++) {
      let best = -1;
      let bestScore = -1;
      for (let ti = 0; ti < existing.length; ti++) {
        if (matched.has(ti)) continue;
        const trackB = trackBox(existing[ti]);
        const v = iou(dets[di], trackB);
        const cd = boxCenterDist(dets[di], trackB);
        const iouHit = v >= iouMatch;
        const distHit = cd <= maxCenterDist;
        if (!iouHit && !distHit) continue;
        const score = iouHit ? v : (1 - cd / maxCenterDist) * iouMatch * 0.9;
        if (score > bestScore) {
          bestScore = score;
          best = ti;
        }
      }
      if (best >= 0) {
        const t = existing[best];
        t.kx = kalmanUpdate(t.kx, dets[di].x, measNoise);
        t.ky = kalmanUpdate(t.ky, dets[di].y, measNoise);
        t.kw = kalmanUpdate(t.kw, dets[di].w, measNoise);
        t.kh = kalmanUpdate(t.kh, dets[di].h, measNoise);
        t.score = dets[di].score;
        t.misses = 0;
        t.hits += 1;
        matched.add(best);
        detMatched[di] = true;
        this.matches.push({ id: t.id, det: dets[di] });
      }
    }

    for (let ti = 0; ti < existing.length; ti++) {
      if (!matched.has(ti)) existing[ti].misses += 1;
    }

    const initPosCov = measNoise * 2;
    const initVelCov = this.opts.qVel;
    for (let di = 0; di < dets.length; di++) {
      if (detMatched[di]) continue;
      const id = this.nextId++;
      existing.push({
        id,
        kx: kalmanCreate(dets[di].x, initPosCov, initVelCov),
        ky: kalmanCreate(dets[di].y, initPosCov, initVelCov),
        kw: kalmanCreate(dets[di].w, initPosCov, initVelCov),
        kh: kalmanCreate(dets[di].h, initPosCov, initVelCov),
        score: dets[di].score,
        misses: 0,
        hits: 1,
      });
      this.matches.push({ id, det: dets[di] });
    }

    this.tracks = existing.filter((t) => t.misses <= maxMisses);
  }

  boxes(): Box[] {
    return this.tracks.map((t) => padBox(trackBox(t), this.opts.paddingFrac));
  }

  boxesWithIds(): { id: number; box: Box }[] {
    return this.tracks.map((t) => ({ id: t.id, box: padBox(trackBox(t), this.opts.paddingFrac) }));
  }

  lastMatches(): TrackMatch[] {
    return this.matches;
  }

  get size(): number {
    return this.tracks.length;
  }
}
