import * as ort from "onnxruntime-web";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

ort.env.wasm.wasmPaths = resolve("public/ort") + "/";
ort.env.wasm.numThreads = 1;

const buf = readFileSync("public/models/face_detection_yunet_2026may.onnx");
const session = await ort.InferenceSession.create(buf, { executionProviders: ["wasm"] });

console.log("inputNames:", session.inputNames);
console.log("outputNames:", session.outputNames);

const W = 640;
const H = 480;
const data = new Float32Array(1 * 3 * H * W);
const input = new ort.Tensor("float32", data, [1, 3, H, W]);
const feeds = { [session.inputNames[0]]: input };
const out = await session.run(feeds);
for (const name of session.outputNames) {
  console.log(name, "dims:", JSON.stringify(out[name].dims), "type:", out[name].type);
}
