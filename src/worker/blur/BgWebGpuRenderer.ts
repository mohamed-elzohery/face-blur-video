import type { VideoSample } from "mediabunny";
import { logger } from "@/lib/log";
import type { MaskData } from "../matting";
import type { BackgroundRenderer } from "./types";
import type { BgRendererOptions } from "./BgWebGl2Renderer";
import { probeExternalImageCopy } from "./WebGpuBlurRenderer";
import {
  BG_BLUR_ITERATIONS,
  BG_BLUR_WGSL,
  BG_COMPOSITE_WGSL,
  BG_COPY_WGSL,
  BG_DOWNSCALE,
  bgBlurStepTexels,
} from "./bgShaders";

const LOW_FORMAT: GPUTextureFormat = "rgba8unorm";

export class BgWebGpuRenderer implements BackgroundRenderer {
  readonly canvas: OffscreenCanvas;

  private readonly device: GPUDevice;
  private readonly context: GPUCanvasContext;
  private readonly scratch: OffscreenCanvas;
  private readonly scratchCtx: OffscreenCanvasRenderingContext2D;
  private readonly srcTex: GPUTexture;
  private readonly lowA: GPUTexture;
  private readonly lowB: GPUTexture;
  private readonly copyPipeline: GPURenderPipeline;
  private readonly blurPipeline: GPURenderPipeline;
  private readonly compositePipeline: GPURenderPipeline;
  private readonly copyBind: GPUBindGroup;
  private readonly blurA2B: GPUBindGroup;
  private readonly blurB2A: GPUBindGroup;
  private readonly blurHBuf: GPUBuffer;
  private readonly blurVBuf: GPUBuffer;
  private readonly compositeBuf: GPUBuffer;
  private readonly sampler: GPUSampler;
  private readonly width: number;
  private readonly height: number;
  private readonly useExternalCopy: boolean;
  private maskTex: GPUTexture | null = null;
  private compositeBind: GPUBindGroup | null = null;
  private maskW = 0;
  private maskH = 0;

  static async create(
    width: number,
    height: number,
    opts: BgRendererOptions,
  ): Promise<BgWebGpuRenderer> {
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
    return new BgWebGpuRenderer(device, width, height, opts, useExternalCopy);
  }

  private constructor(
    device: GPUDevice,
    width: number,
    height: number,
    opts: BgRendererOptions,
    useExternalCopy: boolean,
  ) {
    this.device = device;
    this.width = width;
    this.height = height;
    this.useExternalCopy = useExternalCopy;
    const lowW = Math.max(1, Math.round(width / BG_DOWNSCALE));
    const lowH = Math.max(1, Math.round(height / BG_DOWNSCALE));
    const radiusPx = opts.radiusFrac * Math.min(width, height);
    const stepTexels = bgBlurStepTexels(radiusPx);

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
    const lowUsage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    this.lowA = device.createTexture({ size: [lowW, lowH], format: LOW_FORMAT, usage: lowUsage });
    this.lowB = device.createTexture({ size: [lowW, lowH], format: LOW_FORMAT, usage: lowUsage });

    this.sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });

    this.blurHBuf = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.blurVBuf = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.compositeBuf = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.blurHBuf, 0, Float32Array.of(stepTexels / lowW, 0, 0, 0));
    device.queue.writeBuffer(this.blurVBuf, 0, Float32Array.of(0, stepTexels / lowH, 0, 0));
    device.queue.writeBuffer(
      this.compositeBuf,
      0,
      Float32Array.of(width, height, Math.max(4, radiusPx), opts.style),
    );

    const makePipeline = (code: string, target: GPUTextureFormat): GPURenderPipeline => {
      const shaderModule = device.createShaderModule({ code });
      return device.createRenderPipeline({
        layout: "auto",
        vertex: { module: shaderModule, entryPoint: "vs" },
        fragment: { module: shaderModule, entryPoint: "fs", targets: [{ format: target }] },
        primitive: { topology: "triangle-list" },
      });
    };
    this.copyPipeline = makePipeline(BG_COPY_WGSL, LOW_FORMAT);
    this.blurPipeline = makePipeline(BG_BLUR_WGSL, LOW_FORMAT);
    this.compositePipeline = makePipeline(BG_COMPOSITE_WGSL, format);

    this.copyBind = device.createBindGroup({
      layout: this.copyPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.srcTex.createView() },
      ],
    });
    this.blurA2B = device.createBindGroup({
      layout: this.blurPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.lowA.createView() },
        { binding: 2, resource: { buffer: this.blurHBuf } },
      ],
    });
    this.blurB2A = device.createBindGroup({
      layout: this.blurPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.lowB.createView() },
        { binding: 2, resource: { buffer: this.blurVBuf } },
      ],
    });
  }

  private ensureMaskTexture(mask: MaskData): void {
    if (this.maskTex && mask.width === this.maskW && mask.height === this.maskH) return;
    this.maskTex?.destroy();
    this.maskW = mask.width;
    this.maskH = mask.height;
    this.maskTex = this.device.createTexture({
      size: [mask.width, mask.height],
      format: "r8unorm",
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.compositeBind = this.device.createBindGroup({
      layout: this.compositePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.srcTex.createView() },
        { binding: 2, resource: this.lowA.createView() },
        { binding: 3, resource: this.maskTex.createView() },
        { binding: 4, resource: { buffer: this.compositeBuf } },
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

  private pass(
    encoder: GPUCommandEncoder,
    pipeline: GPURenderPipeline,
    bind: GPUBindGroup,
    view: GPUTextureView,
  ): void {
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.draw(3);
    pass.end();
  }

  async render(sample: VideoSample, mask: MaskData): Promise<void> {
    this.uploadFrame(sample);
    this.ensureMaskTexture(mask);
    if (!this.maskTex || !this.compositeBind) throw new Error("Mask texture unavailable.");

    this.device.queue.writeTexture(
      { texture: this.maskTex },
      mask.data,
      { bytesPerRow: mask.width, rowsPerImage: mask.height },
      [mask.width, mask.height],
    );

    const encoder = this.device.createCommandEncoder();
    this.pass(encoder, this.copyPipeline, this.copyBind, this.lowA.createView());
    for (let i = 0; i < BG_BLUR_ITERATIONS; i++) {
      this.pass(encoder, this.blurPipeline, this.blurA2B, this.lowB.createView());
      this.pass(encoder, this.blurPipeline, this.blurB2A, this.lowA.createView());
    }
    this.pass(
      encoder,
      this.compositePipeline,
      this.compositeBind,
      this.context.getCurrentTexture().createView(),
    );
    this.device.queue.submit([encoder.finish()]);
    await this.device.queue.onSubmittedWorkDone();
  }

  dispose(): void {
    this.srcTex.destroy();
    this.lowA.destroy();
    this.lowB.destroy();
    this.maskTex?.destroy();
    this.blurHBuf.destroy();
    this.blurVBuf.destroy();
    this.compositeBuf.destroy();
    this.device.destroy();
  }
}
