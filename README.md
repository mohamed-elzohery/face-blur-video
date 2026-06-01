# FaceBlur

Blur every face in a video — **entirely in the browser**. The uploaded footage is decoded,
face-detected, blurred, and re-encoded locally; nothing is ever uploaded to a server.

- **No uploads, no tracking, no backend.** Ships as a static site.
- Detects faces with **YuNet** (ONNX Runtime Web), tracks them across frames, and redacts each
  one with a GPU **mosaic** (default), **Gaussian** blur, or **solid** fill.
- Hardware-accelerated **WebCodecs** decode/encode via **Mediabunny**; audio is copied through
  losslessly (or transcoded to AAC when the source codec isn't MP4-safe).
- Progressive enhancement: **WebGPU → WebGL2** for blur, **WebGPU EP → WASM EP** for detection,
  **File System Access → download** for saving. Browsers without WebCodecs get a clear notice.

## Requirements

- Node ≥ 20.9, pnpm
- A Chromium/Edge, Safari 26+, or desktop Firefox browser to use the tool (WebCodecs required)

## Develop

```bash
pnpm install
pnpm dev            # http://localhost:3000 (or next free port)
```

## Build (static export)

```bash
pnpm build          # outputs a static site to ./out
npx serve out       # or any static host
```

The app is a pure client-side static export (`output: 'export'`). It needs **only a secure
context (HTTPS/localhost)** — no COOP/COEP headers, because the pipeline uses single-threaded
ONNX Runtime (WASM SIMD) plus WebCodecs and WebGPU, none of which require cross-origin isolation.
`public/_headers` sets long-lived immutable caching for the model and wasm assets on
Netlify/Cloudflare-style hosts.

## Test

```bash
pnpm test           # vitest unit tests (coords, yunet-decode, tracker)
pnpm lint           # eslint
pnpm exec tsc --noEmit
```

Browser end-to-end checks live in `scripts/` (Playwright + ffmpeg-static): `verify-m1` (decode →
re-encode → mux, audio passthrough, rotation, VideoFrame-leak gate), `verify-m3` (detection +
masked blur), `verify-m4` (WebGL2 fallback), `verify-styles` (mosaic/gaussian/solid). They drive
the dev or static build (`SMOKE_URL`) and validate output frames with ffmpeg.

## Architecture

```
File → Mediabunny Input → VideoSampleSink (decode)
     → FrameProcessor: detect (every Nth frame, downscaled) → IoU track + EMA smooth + pad
                      → GPU blur, masked to padded face boxes (feathered)
     → CanvasSource → Mediabunny Output (Mp4) → Blob
   audio track: encoded packets copied through (or transcoded to AAC)
```

Everything heavy runs in a **Web Worker** (`src/worker/pipeline.worker.ts`). Key modules:

- `src/lib/capabilities.ts` — runtime feature detection → capability tier and backends
- `src/lib/coords.ts` — detection-space ↔ encode-space mapping, box padding, IoU
- `src/lib/model/yunet-decode.ts` — YuNet head decode (stride 8/16/32) + NMS
- `src/lib/modelStore.ts` — lazy fetch + Cache Storage for the ONNX model
- `src/worker/io/source.ts` — Mediabunny input, rotation, duration, start-offset
- `src/worker/pipeline.ts` — orchestration, audio handling, backpressure, frame lifecycle
- `src/worker/detector.ts` — YuNet via ONNX Runtime Web (WebGPU EP → WASM EP)
- `src/worker/tracker.ts` — IoU association, EMA, **hold-through-miss** (faces stay blurred
  through brief detection gaps)
- `src/worker/blur/` — `WebGpuBlurRenderer`, `WebGl2BlurRenderer`, shared shaders

### Frame lifecycle

Exactly one owner per `VideoSample`; each is `close()`d immediately after it is drawn (detection
copy + blur upload) and encoded. The Playwright checks fail if the console ever logs
`VideoFrame ... garbage collected without being closed`.

### Redaction

The mosaic block size is **adaptive to each face's size** (≈ a fixed number of blocks across a
face, with a pixel floor for tiny/distant faces), so identity is obscured regardless of distance.
Mosaic and solid are irreversible; Gaussian is offered as a softer look. Detection is
recall-biased (low confidence threshold, padded boxes) — a missed face is a privacy breach, an
over-blur is harmless.

## Performance notes

On real hardware the pipeline is GPU-resident: WebCodecs uses hardware decode/encode, frames go
to the GPU via zero-copy `copyExternalImageToTexture`, detection runs every 8th frame on a
downscaled (≤480px) copy with IoU tracking in between, and GPU resources are created once and
reused. Headless CI (SwiftShader) is dramatically slower and not representative — it emulates the
GPU on the CPU and falls back to a `writeTexture` upload because SwiftShader lacks
`copyExternalImageToTexture`. Real-device throughput benchmarking is a per-release checklist item.

## Deferred / future work

- **MediaPipe BlazeFace** as an optional second detector (toggle).
- **FFmpeg.wasm** fallback for browsers without WebCodecs (e.g. Firefox-on-Android), to process
  rather than show the unsupported notice.
- **Look-ahead pipelining** (decode a few frames ahead) and removing the per-frame GPU sync, once
  measured against the leak gate.
- **Manual review/correction** tools (add/remove/resize boxes) for compliance use.

## Credits

Face detection model: **YuNet** (`face_detection_yunet_2026may.onnx`) from
[opencv/opencv_zoo](https://github.com/opencv/opencv_zoo). Media I/O:
[Mediabunny](https://mediabunny.dev). Inference: [ONNX Runtime Web](https://onnxruntime.ai).
