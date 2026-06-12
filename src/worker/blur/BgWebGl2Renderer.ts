import type { VideoSample } from "mediabunny";
import type { MaskData } from "../matting";
import type { BackgroundRenderer } from "./types";
import { WEBGL2_VERT } from "./shaders";
import {
  BG_BLUR_FRAG,
  BG_BLUR_ITERATIONS,
  BG_COMPOSITE_FRAG,
  BG_COPY_FRAG,
  BG_DOWNSCALE,
  bgBlurStepTexels,
} from "./bgShaders";

export interface BgRendererOptions {
  style: number;
  radiusFrac: number;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, frag: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program.");
  const vs = compile(gl, gl.VERTEX_SHADER, WEBGL2_VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

function makeTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("Failed to create texture.");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
}

export class BgWebGl2Renderer implements BackgroundRenderer {
  readonly canvas: OffscreenCanvas;

  private readonly gl: WebGL2RenderingContext;
  private readonly scratch: OffscreenCanvas;
  private readonly scratchCtx: OffscreenCanvasRenderingContext2D;
  private readonly copyProgram: WebGLProgram;
  private readonly blurProgram: WebGLProgram;
  private readonly compositeProgram: WebGLProgram;
  private readonly blurStepLoc: WebGLUniformLocation | null;
  private readonly vao: WebGLVertexArrayObject;
  private readonly frameTex: WebGLTexture;
  private readonly maskTex: WebGLTexture;
  private readonly targets: [Target, Target];
  private readonly width: number;
  private readonly height: number;
  private readonly lowW: number;
  private readonly lowH: number;
  private readonly stepTexels: number;
  private maskW = 0;
  private maskH = 0;

  constructor(width: number, height: number, opts: BgRendererOptions) {
    this.width = width;
    this.height = height;
    this.lowW = Math.max(1, Math.round(width / BG_DOWNSCALE));
    this.lowH = Math.max(1, Math.round(height / BG_DOWNSCALE));
    const radiusPx = opts.radiusFrac * Math.min(width, height);
    this.stepTexels = bgBlurStepTexels(radiusPx);

    this.canvas = new OffscreenCanvas(width, height);
    const gl = this.canvas.getContext("webgl2", { alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error("Failed to acquire a WebGL2 context.");
    this.gl = gl;

    this.scratch = new OffscreenCanvas(width, height);
    const scratchCtx = this.scratch.getContext("2d", { alpha: false, willReadFrequently: false });
    if (!scratchCtx) throw new Error("Failed to acquire a 2D scratch context.");
    this.scratchCtx = scratchCtx;

    this.copyProgram = link(gl, BG_COPY_FRAG);
    this.blurProgram = link(gl, BG_BLUR_FRAG);
    this.compositeProgram = link(gl, BG_COMPOSITE_FRAG);

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Failed to create VAO.");
    this.vao = vao;

    this.frameTex = makeTexture(gl);
    this.maskTex = makeTexture(gl);

    const makeTarget = (): Target => {
      const tex = makeTexture(gl);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.lowW, this.lowH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fbo = gl.createFramebuffer();
      if (!fbo) throw new Error("Failed to create framebuffer.");
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fbo, tex };
    };
    this.targets = [makeTarget(), makeTarget()];

    gl.useProgram(this.copyProgram);
    gl.uniform1i(gl.getUniformLocation(this.copyProgram, "uTex"), 0);

    gl.useProgram(this.blurProgram);
    gl.uniform1i(gl.getUniformLocation(this.blurProgram, "uTex"), 0);
    this.blurStepLoc = gl.getUniformLocation(this.blurProgram, "uStep");

    gl.useProgram(this.compositeProgram);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, "uFrame"), 0);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, "uBlur"), 1);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, "uMask"), 2);
    gl.uniform2f(gl.getUniformLocation(this.compositeProgram, "uRes"), width, height);
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, "uBlockPx"), Math.max(4, radiusPx));
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, "uStyle"), opts.style);
  }

  private lowPass(program: WebGLProgram, srcTex: WebGLTexture, target: Target): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, this.lowW, this.lowH);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  async render(sample: VideoSample, mask: MaskData): Promise<void> {
    const gl = this.gl;
    this.scratchCtx.fillStyle = "#000";
    this.scratchCtx.fillRect(0, 0, this.width, this.height);
    sample.draw(this.scratchCtx, 0, 0, this.width, this.height);

    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.scratch);

    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    try {
      if (mask.width !== this.maskW || mask.height !== this.maskH) {
        this.maskW = mask.width;
        this.maskH = mask.height;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, mask.width, mask.height, 0, gl.RED, gl.UNSIGNED_BYTE, mask.data);
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, mask.width, mask.height, gl.RED, gl.UNSIGNED_BYTE, mask.data);
      }
    } finally {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    }

    const [a, b] = this.targets;
    this.lowPass(this.copyProgram, this.frameTex, a);

    const sx = this.stepTexels / this.lowW;
    const sy = this.stepTexels / this.lowH;
    for (let i = 0; i < BG_BLUR_ITERATIONS; i++) {
      gl.useProgram(this.blurProgram);
      gl.uniform2f(this.blurStepLoc, sx, 0);
      this.lowPass(this.blurProgram, a.tex, b);
      gl.uniform2f(this.blurStepLoc, 0, sy);
      this.lowPass(this.blurProgram, b.tex, a);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.compositeProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.frameTex);
    gl.deleteTexture(this.maskTex);
    for (const t of this.targets) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    gl.deleteProgram(this.copyProgram);
    gl.deleteProgram(this.blurProgram);
    gl.deleteProgram(this.compositeProgram);
    gl.deleteVertexArray(this.vao);
  }
}
