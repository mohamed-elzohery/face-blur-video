# FaceBlur

Blur every face in a video — **entirely in the browser**. The uploaded footage is decoded,
face-detected, blurred, and re-encoded locally; nothing is ever uploaded to a server.

- **No uploads, no tracking, no backend.** Ships as a static site.
- Detects faces with **YOLOv8n-face** (default) or **YuNet** via ONNX Runtime Web, tracks them
  across frames with a **Kalman-filter tracker**, and redacts each one with a GPU **Gaussian** blur
  (default) or **Pixelated** mosaic. (A `solid` fill mode still exists in the shader but is no
  longer exposed in the UI.)
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
pnpm dev            # http://localhost:8080
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
masked blur), `verify-m4` (WebGL2 fallback), `verify-styles` (gaussian/pixelated). They drive
the dev or static build (`SMOKE_URL`) and validate output frames with ffmpeg.

---

# How it works

Everything privacy-sensitive runs locally; nothing leaves the browser. The app is a **static
export** ([next.config.ts](next.config.ts)) — pure client-side JS, no backend. All heavy work
runs in a single long-lived **Web Worker** so the UI thread never touches video frames.

```
main thread (React UI)                  Web Worker (all heavy lifting)
─────────────────────                   ──────────────────────────────
Dropzone → File          ──"start"──▶   openSource (Mediabunny decode)
Controls → JobConfig                       │
usePipeline (worker glue)                  ▼
   ◀──"progress"/"done"──            for each VideoSample:
saveBlob (download)                      tracker.predict()
                                         every Nth frame → detector.detect() → tracker.update()
                                         renderer.render(sample, tracker.boxes())  ← GPU blur
                                         videoSource.add(canvas, ts)               ← encode
                                       audio: copy packets through (or transcode AAC)
                                       Output finalize → MP4 Blob ──"done"──▶ UI
```

Key modules:

- [src/lib/capabilities.ts](src/lib/capabilities.ts) — runtime feature detection → capability tier and backends
- [src/lib/coords.ts](src/lib/coords.ts) — detection-space ↔ encode-space mapping, box padding, IoU
- [src/lib/model/yolo-decode.ts](src/lib/model/yolo-decode.ts) — YOLOv8n-face head decode (DFL boxes + landmarks) + NMS
- [src/lib/model/yunet-decode.ts](src/lib/model/yunet-decode.ts) — YuNet head decode (stride 8/16/32) + NMS
- [src/lib/modelStore.ts](src/lib/modelStore.ts) — lazy fetch + Cache Storage for the ONNX models
- [src/worker/io/source.ts](src/worker/io/source.ts) — Mediabunny input, rotation, duration, start-offset
- [src/worker/pipeline.ts](src/worker/pipeline.ts) — orchestration, audio handling, frame lifecycle
- [src/worker/detector.ts](src/worker/detector.ts) / [src/worker/yolo-detector.ts](src/worker/yolo-detector.ts) — detectors via ONNX Runtime Web (WebGPU EP → WASM EP)
- [src/worker/kalman.ts](src/worker/kalman.ts) / [src/worker/tracker.ts](src/worker/tracker.ts) — 1-D Kalman filters + IoU/distance association with **hold-through-miss**
- [src/worker/blur/](src/worker/blur/) — `WebGpuBlurRenderer`, `WebGl2BlurRenderer`, shared shaders

## 1. The pipeline, part by part

The orchestrator is [`runPipeline`](src/worker/pipeline.ts) in [pipeline.ts](src/worker/pipeline.ts).

### a) Demux + decode — [io/source.ts](src/worker/io/source.ts) + Mediabunny
- **Takes:** the uploaded `File`. **Produces:** an `Input` with a primary video track, optional
  audio track, `displayWidth/Height`, `rotation`, `durationUs`, and `startOffsetSec`.
- [`openSource`](src/worker/io/source.ts) wraps the file in a `BlobSource`, validates
  `canRead()`/`canDecode()` (throwing typed [`PipelineError`](src/worker/errors.ts)s like
  `"undecodable"` for clean UI messages), and reads display dimensions that **already bake in
  rotation**. `startOffsetSec` is the first timestamp — later subtracted from every sample so
  output starts at t=0.
- The frame stream comes from a Mediabunny **`VideoSampleSink`**, iterated with
  `for await (const sample of sink.samples())`. Decode is hardware-accelerated via **WebCodecs**.

### b) Per-frame processing — [frameProcessor.ts](src/worker/frameProcessor.ts)
- **Takes:** one `VideoSample`. **Produces:** a blurred frame on the renderer's canvas.
- The loop is the heart of the design:
  1. `tracker.predict()` — advance every track's Kalman state by one frame **(every frame)**.
  2. `if (frameIndex % detectEveryN === 0)` → run the detector and `tracker.update(detections)`
     **(every Nth frame, default N=2)**.
  3. `renderer.render(sample, tracker.boxes())` — blur using the tracker's current boxes
     **(every frame)**.
- The key throughput trick: **detection (expensive) is amortized; tracking (cheap) fills the
  gaps.** On non-detect frames, boxes still move because the Kalman filter predicts forward.

### c) Encode + mux — Mediabunny `Output`
- **Takes:** the rendered canvas per frame + the source audio track. **Produces:** an in-memory
  MP4 `Blob`.
- A [`CanvasSource`](src/worker/pipeline.ts) wraps `renderer.canvas` and encodes it as H.264/AVC
  at `QUALITY_HIGH`. Each iteration calls `videoSource.add(timestamp - startOffset, duration)` to
  capture the canvas at that frame's PTS. The output uses `Mp4OutputFormat({ fastStart:
  "in-memory" })` + a `BufferTarget`, so the final `.buffer` becomes the `Blob`.

### d) Audio handling — [`setupAudio`](src/worker/pipeline.ts) / [`runAudio`](src/worker/pipeline.ts)
Three plans, chosen by codec:
- **passthrough** — if source audio is `aac`/`mp3` and MP4-safe, encoded packets are copied through
  *losslessly* (no re-encode), just re-timestamped.
- **transcode** — otherwise, if `AudioEncoder` exists, decode→re-encode to **AAC**.
- **drop** — if no encoder, audio is dropped with a warning.

### e) Progress + cancellation
Progress messages are throttled to every 150ms (`PROGRESS_INTERVAL_MS`). Cancellation is
cooperative: a shared `{ cancelled }` flag checked each iteration; on cancel it `output.cancel()`s
and disposes GPU/detector resources.

## 2. Face tracking

The tracker ([tracker.ts](src/worker/tracker.ts), `KalmanTracker`) combines **IoU/distance
association**, a **per-coordinate Kalman filter**, and **hold-through-miss**.

**Association** (greedy, highest-confidence detection first):
- For each detection, find the best unmatched track where **either** IoU ≥ `iouMatch` (0.3)
  **or** center distance ≤ `maxCenterDist` (0.35, normalized).
- IoU match is preferred; a distance-only match is discounted to `(1 - cd/maxCenterDist) ·
  iouMatch · 0.9` (max 0.27, always below the 0.3 IoU threshold) so it never outranks a real
  overlap.
- Matched track → Kalman `update`, reset `misses=0`, `hits++`. Unmatched detection → **spawn a new
  track**. Unmatched track → `misses++`.

The distance fallback matters for **fast motion**: when a face moves far enough between detections
that boxes no longer overlap (IoU=0), center proximity still re-associates it instead of spawning
a duplicate track.

**Hold-through-miss:** tracks with `misses > maxMisses` (1) are pruned. A track survives **one**
missed detection cycle, so a face that flickers out of the detector for a frame stays blurred (its
Kalman prediction keeps the box moving). A privacy-safe bias: keep blurring through brief gaps
rather than flash the face.

**Output:** `boxes()` returns each track's filtered box **padded** by `paddingFrac` (default 0.25)
via [`padBox`](src/lib/coords.ts), clamped to the frame — faces are over-covered on purpose (a
missed pixel is a privacy breach; over-blur is harmless).

## 3. The Kalman filter ([kalman.ts](src/worker/kalman.ts))

[kalman.ts](src/worker/kalman.ts) is a tiny **1-D constant-velocity Kalman filter**. The tracker
instantiates **four independent copies per track** — one each for the box's `x`, `y`, `w`, `h` —
so a face box is smoothed by 4 scalar filters rather than one 8-D matrix filter. This avoids
matrix math in JS while still giving velocity-aware smoothing.

**State:** `mean` (position) and `vel` (velocity), plus a 2×2 covariance stored as three scalars
`p00` (pos variance), `p01` (pos/vel covariance), `p11` (vel variance).

**Predict** (every frame) — constant-velocity model with timestep = 1 frame:

```
mean' = mean + vel                   // x_k = F x_{k-1},  F = [[1,1],[0,1]]
vel'  = vel
p00'  = p00 + 2·p01 + p11 + qPos     // P' = F P Fᵀ + Q
p01'  = p01 + p11
p11'  = p11 + qVel
```

`qPos` (6e-3) and `qVel` (8e-4) are the **process noise** — how much you trust the motion model.
These are the closed-form expansion of `F·P·Fᵀ + Q`. Predict is what keeps a box moving during the
frames where no detection runs (and during a held miss).

**Update** (only when a detection matches) — standard scalar Kalman correction with measurement
`z` and measurement noise `r` (`measNoise` = 5e-4):

```
S     = p00 + r              // innovation variance
k0    = p00 / S              // Kalman gain (position)
k1    = p01 / S              // Kalman gain (velocity)
innov = z - mean             // measurement residual
mean += k0·innov
vel  += k1·innov             // velocity inferred from position error
```

Because `measNoise` (5e-4) is small relative to `qPos` (6e-3), the filter trusts detections fairly
strongly but still damps jitter and infers velocity. The inferred `vel` is what makes prediction
track a moving face instead of lagging behind it.

**Net effect:** a raw box that would jitter frame-to-frame (and pop in/out) becomes a smooth,
velocity-aware trajectory that survives detection gaps.

## 4. Running the detection models in the browser

Both detectors implement the same [`FaceDetector`](src/worker/detector.ts) interface and run via
**ONNX Runtime Web** (`onnxruntime-web`).

**ONNX Runtime setup & execution providers:**

```ts
ort.env.wasm.wasmPaths = "/ort/";   // self-hosted wasm (offline, no CDN)
ort.env.wasm.numThreads = 1;        // single-threaded → no COOP/COEP needed
```

Self-hosting the wasm at `/ort/` and forcing **single-threaded** execution is what lets the app
ship as a *plain* static site: multithreaded wasm needs `SharedArrayBuffer`, which needs
cross-origin isolation (COOP/COEP) the static host doesn't set. The shipped binary is the `.jsep`
build, which also provides the WebGPU backend (despite the `-threaded` filename, threads are off).

**EP selection with fallback:** both detectors try `executionProviders: ["webgpu"]` first and, on
any throw, log a warning and retry with `["wasm"]` (SIMD CPU inference). The chosen EP is reported
to the UI as `detectorEP`.

**Model loading + caching** ([modelStore.ts](src/lib/modelStore.ts)): `loadYoloModel()` /
`loadYuNetModel()` fetch the `.onnx` from `/models/`, memoized per session, and store the response
in **Cache Storage** (`face-blur-models-v1`). Combined with the `immutable, max-age=31536000`
headers in [public/_headers](public/_headers), each model downloads once, ever.

### YOLOv8n-face (default — [yolo-detector.ts](src/worker/yolo-detector.ts))
- **Preprocessing:** the frame is drawn into a **640×640 letterbox** (gray `rgb(114,114,114)`
  fill, aspect-preserving) computed by [`computeLetterboxLayout`](src/lib/coords.ts). Pixels are
  packed into a planar **NCHW float32 tensor `[1,3,640,640]`**, **RGB order**, normalized **/255**.
- **Output decode** ([yolo-decode.ts](src/lib/model/yolo-decode.ts)): the model emits **3 raw
  feature maps** (strides 8/16/32 → 80×80, 40×40, 20×20). Per grid cell:
  - **Anchor-free box via DFL** (Distribution Focal Loss): channels 0–63 are 4 sides × 16 bins;
    `dflChannel` takes a softmax-weighted expectation over the 16 bins to get each side's distance.
  - **Objectness:** channel 64, `sigmoid` → confidence.
  - **5 face landmarks** (eyes, nose, mouth corners): channels 65–79, decoded with `tanh` offsets
    + `sigmoid` visibility.
- **NMS** at IoU 0.45, cap 64 boxes.
- **Landmark sanity filter** (`validateLandmarks`): a face-specific false-positive reject —
  landmarks must fall inside the (expanded) box, the nose below the eyes, the mouth below the nose.
  Kills spurious detections a plain box-confidence threshold would keep.

### YuNet (the lighter alternative — [detector.ts](src/worker/detector.ts))
- Smaller (~230 KB vs ~12 MB) and faster. Input is downscaled to **long-side 480**, snapped to a
  multiple of 32, packed as **BGR** float32 NCHW, **not normalized** (raw 0–255).
- Decode ([yunet-decode.ts](src/lib/model/yunet-decode.ts)): per-stride `cls_*`/`obj_*`/`bbox_*`
  heads (strides 8/16/32); score = `sqrt(cls·obj)`; box center `(c+bbox)·stride`, size
  `exp(bbox)·stride`. NMS at IoU 0.3.

> **Note:** `engine` defaults to `"yolo"` ([types.ts](src/lib/types.ts)) and there is currently
> **no engine selector in the UI** ([Controls.tsx](src/components/Controls.tsx) only exposes
> style / strength / sensitivity), so YOLOv8n-face is effectively the active detector; YuNet is
> reachable only by changing the default config in code. Both `.onnx` files ship regardless.

In both cases, boxes are mapped from detector pixel space back to **normalized encode space**
([`detBoxToNormalized`](src/lib/coords.ts) / [`letterboxBoxToNorm`](src/lib/coords.ts)), undoing
the scale/letterbox padding, so the tracker and shaders all speak the same `[0,1]` coordinate
system regardless of which detector ran.

## 5. Drawing the redaction (mosaic / gaussian / solid)

All three styles are a **single GPU fragment shader**, written once in both WGSL (WebGPU) and GLSL
(WebGL2) in [shaders.ts](src/worker/blur/shaders.ts). The renderers
([WebGpuBlurRenderer](src/worker/blur/WebGpuBlurRenderer.ts),
[WebGl2BlurRenderer](src/worker/blur/WebGl2BlurRenderer.ts)) differ only in plumbing.

**How a frame becomes a blurred frame:**
1. `sample.draw()` paints the decoded frame onto a 2-D **scratch** `OffscreenCanvas`.
2. Upload to a GPU texture (see fallback in §6).
3. Draw a **full-screen triangle** (3 vertices, no vertex buffer) and run the fragment shader once
   per output pixel.
4. The rendered canvas *is* the encoder input.

**The mask is an ellipse, not a rectangle.** For each of up to **32 boxes** (passed as a `vec4`
uniform array), the shader computes a normalized elliptical distance from the pixel to the box
center: `d = (uv - center) / radius; dist = length(d)`. Coverage is a feathered edge `c = 1 -
smoothstep(1 - f, 1 + f, dist)` where `f = featherPx / minRadiusPx` (feather = 2.5px). It keeps the
**max** coverage across all boxes (overlapping faces union cleanly). Final pixel = `mix(sharp,
effect, cov)` — a soft-edged blend, no hard seam.

**The three effects** (the UI exposes only the first two, labelled "Gaussian Blur" and
"Pixelated"; `solid` remains in the shader but is no longer user-selectable):
- **Gaussian** (`style 1`, **default**, UI: "Gaussian Blur"): a single-pass **5×5 tap** kernel,
  weights `exp(-(ox²+oy²)/4)`, tap spacing scaled by block size.
- **Mosaic / pixelate** (`style 0`, UI: "Pixelated"): snap the sample coordinate to a block grid —
  `snapped = (floor(px/block) + 0.5)·block` — and sample the block center.
- **Solid** (`style 2`): fill with near-black `vec3(0.05, 0.05, 0.06)`.

**Adaptive block size (distance-invariant privacy):**

```
sizePx = max(minBlockPx, boxMinDim · blockFrac)
```

- `boxMinDim` = the smaller side of the face box in pixels.
- `blockFrac` ∈ **[0.07, 0.22]**, mapped from the user's *Intensity* slider (the `strength` field,
  shown 0–100%; default 0.6 ≈ 0.16, i.e. ~6 blocks across a face).
- `minBlockPx` = 6 floor, so tiny/distant faces still get coarse-enough blocks.

Because the block scales with the face, a face fills roughly the same *number* of mosaic blocks
whether near or far — identity is obscured at any distance (the gaussian's tap spacing scales the
same way). Mosaic and solid are irreversible; gaussian is offered as a softer look.

## 6. Fallbacks for unsupported / weaker browsers

Progressive enhancement across independent layers, decided at runtime by
[capabilities.ts](src/lib/capabilities.ts).

**Capability probe** ([`probeFeatures`](src/lib/capabilities.ts) →
[`decideCapabilities`](src/lib/capabilities.ts)) checks: **WebCodecs** (encoder/decoder/VideoFrame
exist *and* an H.264 config — Main then Baseline — actually reports `supported`), **WebGPU**
(request a real adapter), **WebGL2**, **OffscreenCanvas**, **OPFS**, **secure context**,
**cross-origin isolation**, and **File System Access**. A browser is `supported` only if it has
*secure context + WebCodecs + OffscreenCanvas + (WebGPU or WebGL2) + a working H.264 encoder*; each
missing piece adds a human-readable string to `reasons[]`.

**The fallback ladders:**
1. **Blur backend: WebGPU → WebGL2 → passthrough** ([blur/index.ts](src/worker/blur/index.ts)).
   The shader is shared, so WebGL2 output is identical to WebGPU; passthrough (no blur) is a
   last-ditch guard.
2. **Detection EP: WebGPU EP → WASM EP** (§4) — CPU SIMD inference when no GPU compute.
3. **GPU upload: `copyExternalImageToTexture` → `writeTexture`**
   ([WebGpuBlurRenderer.ts](src/worker/blur/WebGpuBlurRenderer.ts)). A 4×4 round-trip probe at
   startup detects zero-copy texture upload; if it fails (e.g. SwiftShader in headless CI), it
   falls back to `getImageData` + `writeTexture`.
4. **Saving: File System Access → anchor download** ([fileTarget.ts](src/lib/fileTarget.ts)).
   Tries `showSaveFilePicker` (native "Save as…"); otherwise object-URL `<a download>`.
   `AbortError` (user cancels the picker) is handled silently.
5. **Audio: passthrough → AAC transcode → drop** (§1d).

**When the browser simply can't** ([UnsupportedNotice.tsx](src/components/UnsupportedNotice.tsx)):
if `supported` is false (most commonly **no WebCodecs** — e.g. Firefox on Android), the app renders
the `UnsupportedNotice` listing the `reasons[]` instead of the tool.

> The blur backend is decided twice, independently: the capability probe picks a tier for the *UI
> badge*, but the worker re-derives its own blur backend via
> [`detectBlurBackend()`](src/worker/pipeline.ts) (`requestAdapter()`) at job start — the worker's
> decision is the one that actually runs.

## 7. Mobile / CPU-only optimizations

The whole design is shaped around devices without a fast GPU:

- **Detection amortization** — the biggest lever. The detector runs only every `detectEveryN`
  (default 2) frames; the Kalman tracker interpolates the rest. Raising N trades accuracy for speed.
- **Downscaled detection input** — YuNet runs at long-side ≤480px; YOLO at a 640 letterbox.
  Inference cost scales with input area, so detecting on a downscaled copy is far cheaper than
  full-res.
- **Single-threaded WASM SIMD inference** — uses SIMD for speed but avoids threads /
  `SharedArrayBuffer`, so it runs on locked-down mobile browsers and any static host.
- **All heavy work off the UI thread** — the Web Worker keeps the page responsive on phones.
- **GPU-resident pipeline on capable devices** — textures, buffers, sampler, pipeline, and bind
  group are created once and reused every frame; zero-copy `copyExternalImageToTexture` avoids CPU
  round-trips; the blur is one draw call over all 32 boxes.
- **Lossless audio passthrough** — skips audio re-encoding entirely when the source codec is
  MP4-safe (no AAC encoder spun up).
- **Cheap, vectorizable tracking math** — 4 scalar Kalman filters instead of matrix ops; greedy
  association; no allocations in the hot path beyond small arrays.
- **Model cached forever** — Cache Storage + immutable headers → one download per device, offline
  after first load.

## Frame lifecycle (a correctness invariant)

Exactly **one owner per `VideoSample`**; each is `close()`d immediately after it is drawn
(detection copy + blur upload) and encoded. WebCodecs frames hold scarce GPU/decoder buffers, so
leaking them stalls the decoder — the Playwright checks fail if the console ever logs `VideoFrame
... garbage collected without being closed`.

A known CPU cost: each frame ends with a GPU sync (`onSubmittedWorkDone()` in WebGPU, `gl.finish()`
in WebGL2) needed to keep the leak gate happy. Removing this per-frame stall plus look-ahead decode
pipelining is listed below as future work.

## Performance notes

On real hardware the pipeline is GPU-resident: WebCodecs uses hardware decode/encode, frames go to
the GPU via zero-copy `copyExternalImageToTexture`, detection runs every Nth frame on a downscaled
copy with Kalman tracking in between, and GPU resources are created once and reused. Headless CI
(SwiftShader) is dramatically slower and not representative — it emulates the GPU on the CPU and
falls back to a `writeTexture` upload because SwiftShader lacks `copyExternalImageToTexture`.
Real-device throughput benchmarking is a per-release checklist item.

## Deferred / future work

- **Engine selector in the UI** to switch between YOLOv8n-face and YuNet at runtime.
- **MediaPipe BlazeFace** as an optional third detector.
- **FFmpeg.wasm** fallback for browsers without WebCodecs (e.g. Firefox-on-Android), to process
  rather than show the unsupported notice.
- **Look-ahead pipelining** (decode a few frames ahead) and removing the per-frame GPU sync, once
  measured against the leak gate.
- **Manual review/correction** tools (add/remove/resize boxes) for compliance use.

## Credits

Face detection models: **YOLOv8n-face** (`yolov8n-face.onnx`, default) and **YuNet**
(`face_detection_yunet_2026may.onnx`) from
[opencv/opencv_zoo](https://github.com/opencv/opencv_zoo). Media I/O:
[Mediabunny](https://mediabunny.dev). Inference: [ONNX Runtime Web](https://onnxruntime.ai).
