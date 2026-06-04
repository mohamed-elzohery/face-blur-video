export interface DetRecord {
  emb: Float32Array;
  q: number;
  frameId: number;
}

export interface FaceCluster {
  centroid: Float32Array;
  members: number[];
  support: number;
  quality: number;
}

export interface ClusterOptions {
  mergeCosine?: number;
  minSingletonQuality?: number;
}

const DEFAULT_MERGE_COSINE = 0.363;
const DEFAULT_MIN_SINGLETON_QUALITY = 0.5;

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

export function bestMatch(
  emb: Float32Array,
  centroids: Float32Array[],
): { index: number; cosine: number } {
  let index = -1;
  let best = -Infinity;
  for (let i = 0; i < centroids.length; i++) {
    const c = cosine(emb, centroids[i]);
    if (c > best) {
      best = c;
      index = i;
    }
  }
  return { index, cosine: index < 0 ? -Infinity : best };
}

function normalized(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  const inv = 1 / (Math.sqrt(n) + 1e-12);
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] * inv;
  return out;
}

function disjoint(a: Set<number>, b: Set<number>): boolean {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const v of small) if (large.has(v)) return false;
  return true;
}

interface WorkCluster {
  sum: Float32Array;
  centroid: Float32Array;
  members: number[];
  frameIds: Set<number>;
  quality: number;
}

export function clusterDetections(
  records: DetRecord[],
  opts: ClusterOptions = {},
): FaceCluster[] {
  const mergeCosine = opts.mergeCosine ?? DEFAULT_MERGE_COSINE;
  const minSingletonQuality = opts.minSingletonQuality ?? DEFAULT_MIN_SINGLETON_QUALITY;
  if (records.length === 0) return [];

  const clusters: (WorkCluster | null)[] = records.map((r, i) => {
    const c = normalized(r.emb);
    return {
      sum: c.slice(),
      centroid: c,
      members: [i],
      frameIds: new Set([r.frameId]),
      quality: r.q,
    };
  });

  for (;;) {
    let bi = -1;
    let bj = -1;
    let bestC = -Infinity;
    for (let i = 0; i < clusters.length; i++) {
      const ci = clusters[i];
      if (!ci) continue;
      for (let j = i + 1; j < clusters.length; j++) {
        const cj = clusters[j];
        if (!cj) continue;
        if (!disjoint(ci.frameIds, cj.frameIds)) continue;
        const c = cosine(ci.centroid, cj.centroid);
        if (c >= mergeCosine && c > bestC) {
          bestC = c;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi < 0) break;

    const a = clusters[bi]!;
    const b = clusters[bj]!;
    const sum = new Float32Array(a.sum.length);
    for (let k = 0; k < sum.length; k++) sum[k] = a.sum[k] + b.sum[k];
    a.sum = sum;
    a.centroid = normalized(sum);
    a.members = a.members.concat(b.members);
    for (const f of b.frameIds) a.frameIds.add(f);
    a.quality = Math.max(a.quality, b.quality);
    clusters[bj] = null;
  }

  const result: FaceCluster[] = [];
  for (const c of clusters) {
    if (!c) continue;
    if (c.members.length === 1 && c.quality < minSingletonQuality) continue;
    result.push({
      centroid: c.centroid,
      members: c.members.slice().sort((x, y) => x - y),
      support: c.members.length,
      quality: c.quality,
    });
  }

  result.sort(
    (x, y) => y.support - x.support || y.quality - x.quality || x.members[0] - y.members[0],
  );
  return result;
}
