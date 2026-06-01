import type { BlurBackend } from "@/lib/types";
import { logger } from "@/lib/log";
import type { BlurRenderer } from "./types";
import { PassthroughRenderer } from "./PassthroughRenderer";
import { WebGl2BlurRenderer } from "./WebGl2BlurRenderer";
import { WebGpuBlurRenderer } from "./WebGpuBlurRenderer";

export type { BlurRenderer } from "./types";

export interface RendererOptions {
  minBlockPx: number;
  blockFrac: number;
  featherPx: number;
  style: number;
}

export interface RendererResult {
  renderer: BlurRenderer;
  backend: BlurBackend;
}

export async function createRenderer(
  backend: BlurBackend,
  width: number,
  height: number,
  opts: RendererOptions,
): Promise<RendererResult> {
  if (backend === "webgpu") {
    try {
      return { renderer: await WebGpuBlurRenderer.create(width, height, opts), backend: "webgpu" };
    } catch (err) {
      logger.warn(
        `WebGPU renderer unavailable (${err instanceof Error ? err.message : err}); trying WebGL2.`,
      );
    }
  }
  try {
    return { renderer: new WebGl2BlurRenderer(width, height, opts), backend: "webgl2" };
  } catch (err) {
    logger.warn(
      `WebGL2 renderer unavailable (${err instanceof Error ? err.message : err}); using passthrough (no blur).`,
    );
    return { renderer: new PassthroughRenderer(width, height), backend: "webgl2" };
  }
}
