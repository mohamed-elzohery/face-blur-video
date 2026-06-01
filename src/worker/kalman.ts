export interface KalmanState {
  mean: number;
  vel: number;
  p00: number;
  p01: number;
  p11: number;
}

export function kalmanCreate(pos: number, initPosCov: number, initVelCov: number): KalmanState {
  return { mean: pos, vel: 0, p00: initPosCov, p01: 0, p11: initVelCov };
}

export function kalmanPredict(s: KalmanState, qPos: number, qVel: number): KalmanState {
  return {
    mean: s.mean + s.vel,
    vel: s.vel,
    p00: s.p00 + 2 * s.p01 + s.p11 + qPos,
    p01: s.p01 + s.p11,
    p11: s.p11 + qVel,
  };
}

export function kalmanUpdate(s: KalmanState, z: number, r: number): KalmanState {
  const S = s.p00 + r;
  const k0 = s.p00 / S;
  const k1 = s.p01 / S;
  const innov = z - s.mean;
  return {
    mean: s.mean + k0 * innov,
    vel: s.vel + k1 * innov,
    p00: (1 - k0) * s.p00,
    p01: (1 - k0) * s.p01,
    p11: s.p11 - k1 * s.p01,
  };
}
