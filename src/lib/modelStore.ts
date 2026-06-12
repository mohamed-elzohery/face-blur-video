const YUNET_URL = "/models/face_detection_yunet_2026may.onnx";
const YOLO_URL = "/models/yolov8n-face.onnx";
const SFACE_URL = "/models/face_recognition_sface_2021dec_int8.onnx";
const RVM_URL = "/models/rvm_mobilenetv3_fp32.onnx";
const CACHE_NAME = "face-blur-models-v1";

let cached: Promise<ArrayBuffer> | null = null;
let cachedYolo: Promise<ArrayBuffer> | null = null;
let cachedSFace: Promise<ArrayBuffer> | null = null;
let cachedRvm: Promise<ArrayBuffer> | null = null;

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

export function loadYoloModel(): Promise<ArrayBuffer> {
  if (!cachedYolo) {
    cachedYolo = fetchModel(YOLO_URL).catch((err) => {
      cachedYolo = null;
      throw err;
    });
  }
  return cachedYolo;
}

export function loadSFaceModel(): Promise<ArrayBuffer> {
  if (!cachedSFace) {
    cachedSFace = fetchModel(SFACE_URL).catch((err) => {
      cachedSFace = null;
      throw err;
    });
  }
  return cachedSFace;
}

export function loadRvmModel(): Promise<ArrayBuffer> {
  if (!cachedRvm) {
    cachedRvm = fetchModel(RVM_URL).catch((err) => {
      cachedRvm = null;
      throw err;
    });
  }
  return cachedRvm;
}
