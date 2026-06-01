const YUNET_URL = "/models/face_detection_yunet_2026may.onnx";
const CACHE_NAME = "face-blur-models-v1";

let cached: Promise<ArrayBuffer> | null = null;

async function fetchModel(url: string): Promise<ArrayBuffer> {
  try {
    if (typeof caches !== "undefined") {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(url);
      if (hit) return await hit.arrayBuffer();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await cache.put(url, res.clone());
      return await res.arrayBuffer();
    }
  } catch {
    /* fall back to a direct fetch */
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch model: HTTP ${res.status}`);
  return res.arrayBuffer();
}

export function loadYuNetModel(): Promise<ArrayBuffer> {
  if (!cached) {
    cached = fetchModel(YUNET_URL).catch((err) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}
