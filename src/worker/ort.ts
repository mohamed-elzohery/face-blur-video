import type * as Ort from "onnxruntime-web";
import { isMobileWebKit } from "@/lib/platform";

export type OrtModule = typeof Ort;

let ortPromise: Promise<OrtModule> | null = null;

export function loadOrt(): Promise<OrtModule> {
  if (!ortPromise) {
    ortPromise = isMobileWebKit()
      ? (import("onnxruntime-web/wasm") as Promise<OrtModule>)
      : (import("onnxruntime-web/webgpu") as Promise<OrtModule>);
  }
  return ortPromise;
}
