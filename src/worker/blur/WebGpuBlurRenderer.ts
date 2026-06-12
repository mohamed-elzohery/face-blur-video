import type { VideoSample } from "mediabunny";
import type { Box } from "@/lib/types";
import { logger } from "@/lib/log";
import type { BlurRenderer } from "./types";
import { MAX_BOXES, MOSAIC_WGSL } from "./shaders";

export interface WebGpuRendererOptions {
  minBlockPx: number;
  blockFrac: number;
  featherPx: number;
  style: number;
}

export async function probeExternalImageCopy(device: GPUDevice): Promise<boolean> {
  try {
    const source = new OffscreenCanvas(4, 4);
    const ctx = source.getContext("2d");
    if (!ctx) return false;
    ctx.fillStyle = "rgb(8,200,40)";
    ctx.fillRect(0, 0, 4, 4);

    const tex = device.createTexture({
      size: [4, 4],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.pushErrorScope("validation");
    device.queue.copyExternalImageToTexture({ source, flipY: false }, { texture: tex }, [4, 4]);
    const scopeError = await device.popErrorScope();

    const bytesPerRow = 256;
    const readBuf = device.createBuffer({
      size: bytesPerRow * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture: tex }, { buffer: readBuf, bytesPerRow }, [4, 4]);
    device.queue.submit([encoder.finish()]);
    await readBuf.mapAsync(GPUMapMode.READ);
    const px = new Uint8Array(readBuf.getMappedRange().slice(0, 4));
    readBuf.unmap();
    tex.destroy();
    readBuf.destroy();

    return !scopeError && px[1] > 120 && px[0] < 80;
  } catch {
    return false;
  }
}

export class WebGpuBlurRenderer implements BlurRenderer {
  readonly canvas: OffscreenCanvas;

  private readonly device: GPUDevice;
  private readonly context: GPUCanvasContext;
  private readonly scratch: OffscreenCanvas;
  private readonly scratchCtx: OffscreenCanvasRenderingContext2D;
  private readonly srcTex: GPUTexture;
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly paramsBuf: GPUBuffer;
  private readonly boxesBuf: GPUBuffer;
  private readonly sampler: GPUSampler;
  private readonly width: number;
  private readonly height: number;
  private readonly minBlockPx: number;
  private readonly blockFrac: number;
  private readonly featherPx: number;
  private readonly style: number;
  private readonly useExternalCopy: boolean;
  private readonly paramsData = new Float32Array(8);
  private readonly boxesData = new Float32Array(MAX_BOXES * 4);

  static async create(
    width: number,
    height: number,
    opts: WebGpuRendererOptions,
  ): Promise<WebGpuBlurRenderer> {
    if (!("gpu" in navigator) || !navigator.gpu) {
      throw new Error("WebGPU is not available.");
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No WebGPU adapter available.");
    const device = await adapter.requestDevice();
    const useExternalCopy = await probeExternalImageCopy(device);
    if (!useExternalCopy) {
      logger.info("WebGPU external-image copy unavailable; uploading frames via writeTexture.");
    }
    return new WebGpuBlurRenderer(device, width, height, opts, useExternalCopy);
  }

  private constructor(
    device: GPUDevice,
    width: number,
    height: number,
    opts: WebGpuRendererOptions,
    useExternalCopy: boolean,
  ) {
    this.device = device;
    this.width = width;
    this.height = height;
    this.minBlockPx = Math.max(2, opts.minBlockPx);
    this.blockFrac = opts.blockFrac;
    this.featherPx = opts.featherPx;
    this.style = opts.style;
    this.useExternalCopy = useExternalCopy;

    this.canvas = new OffscreenCanvas(width, height);
    const context = this.canvas.getContext("webgpu");
    if (!context) throw new Error("Failed to acquire a WebGPU canvas context.");
    this.context = context;
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });

    this.scratch = new OffscreenCanvas(width, height);
    const scratchCtx = this.scratch.getContext("2d", { alpha: false, willReadFrequently: !useExternalCopy });
    if (!scratchCtx) throw new Error("Failed to acquire a 2D scratch context.");
    this.scratchCtx = scratchCtx;

    this.srcTex = device.createTexture({
      size: [width, height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING,
    });

    this.sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });

    this.paramsBuf = device.createBuffer({
      size: this.paramsData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.boxesBuf = device.createBuffer({
      size: this.boxesData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const shaderModule = device.createShaderModule({ code: MOSAIC_WGSL });
    this.pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: shaderModule, entryPoint: "vs" },
      fragment: { module: shaderModule, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });

    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.srcTex.createView() },
        { binding: 2, resource: { buffer: this.paramsBuf } },
        { binding: 3, resource: { buffer: this.boxesBuf } },
      ],
    });
  }

  private uploadFrame(sample: VideoSample): void {
    sample.draw(this.scratchCtx, 0, 0, this.width, this.height);
    if (this.useExternalCopy) {
      this.device.queue.copyExternalImageToTexture(
        { source: this.scratch, flipY: false },
        { texture: this.srcTex },
        [this.width, this.height],
      );
    } else {
      const image = this.scratchCtx.getImageData(0, 0, this.width, this.height);
      this.device.queue.writeTexture(
        { texture: this.srcTex },
        image.data,
        { bytesPerRow: this.width * 4, rowsPerImage: this.height },
        [this.width, this.height],
      );
    }
  }

  async render(sample: VideoSample, boxes: Box[]): Promise<void> {
    this.uploadFrame(sample);

    const count = Math.min(boxes.length, MAX_BOXES);
    this.paramsData[0] = this.width;
    this.paramsData[1] = this.height;
    this.paramsData[2] = this.minBlockPx;
    this.paramsData[3] = this.featherPx;
    this.paramsData[4] = count;
    this.paramsData[5] = this.blockFrac;
    this.paramsData[6] = this.style;
    this.device.queue.writeBuffer(this.paramsBuf, 0, this.paramsData);

    this.boxesData.fill(0);
    for (let i = 0; i < count; i++) {
      const b = boxes[i];
      this.boxesData[i * 4 + 0] = b.x;
      this.boxesData[i * 4 + 1] = b.y;
      this.boxesData[i * 4 + 2] = b.w;
      this.boxesData[i * 4 + 3] = b.h;
    }
    this.device.queue.writeBuffer(this.boxesBuf, 0, this.boxesData);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    await this.device.queue.onSubmittedWorkDone();
  }

  dispose(): void {
    this.srcTex.destroy();
    this.paramsBuf.destroy();
    this.boxesBuf.destroy();
    this.device.destroy();
  }
}
