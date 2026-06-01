import type { VideoSample } from "mediabunny";
import type { Box } from "@/lib/types";
import type { BlurRenderer } from "./types";
import { MAX_BOXES, WEBGL2_FRAG, WEBGL2_VERT } from "./shaders";

export interface WebGl2RendererOptions {
  minBlockPx: number;
  blockFrac: number;
  featherPx: number;
  style: number;
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

export class WebGl2BlurRenderer implements BlurRenderer {
  readonly canvas: OffscreenCanvas;

  private readonly gl: WebGL2RenderingContext;
  private readonly scratch: OffscreenCanvas;
  private readonly scratchCtx: OffscreenCanvasRenderingContext2D;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly tex: WebGLTexture;
  private readonly loc: Record<string, WebGLUniformLocation | null>;
  private readonly width: number;
  private readonly height: number;
  private readonly minBlockPx: number;
  private readonly blockFrac: number;
  private readonly featherPx: number;
  private readonly style: number;
  private readonly boxesData = new Float32Array(MAX_BOXES * 4);

  constructor(width: number, height: number, opts: WebGl2RendererOptions) {
    this.width = width;
    this.height = height;
    this.minBlockPx = Math.max(2, opts.minBlockPx);
    this.blockFrac = opts.blockFrac;
    this.featherPx = opts.featherPx;
    this.style = opts.style;

    this.canvas = new OffscreenCanvas(width, height);
    const gl = this.canvas.getContext("webgl2", { alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error("Failed to acquire a WebGL2 context.");
    this.gl = gl;

    this.scratch = new OffscreenCanvas(width, height);
    const scratchCtx = this.scratch.getContext("2d", { alpha: false, willReadFrequently: false });
    if (!scratchCtx) throw new Error("Failed to acquire a 2D scratch context.");
    this.scratchCtx = scratchCtx;

    const program = gl.createProgram();
    if (!program) throw new Error("Failed to create program.");
    const vs = compile(gl, gl.VERTEX_SHADER, WEBGL2_VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, WEBGL2_FRAG);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Failed to create VAO.");
    this.vao = vao;

    const tex = gl.createTexture();
    if (!tex) throw new Error("Failed to create texture.");
    this.tex = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.loc = {
      uTex: gl.getUniformLocation(program, "uTex"),
      uRes: gl.getUniformLocation(program, "uRes"),
      uMinBlock: gl.getUniformLocation(program, "uMinBlock"),
      uFeather: gl.getUniformLocation(program, "uFeather"),
      uBlockFrac: gl.getUniformLocation(program, "uBlockFrac"),
      uBoxCount: gl.getUniformLocation(program, "uBoxCount"),
      uStyle: gl.getUniformLocation(program, "uStyle"),
      uBoxes: gl.getUniformLocation(program, "uBoxes"),
    };
  }

  async render(sample: VideoSample, boxes: Box[]): Promise<void> {
    const gl = this.gl;
    this.scratchCtx.fillStyle = "#000";
    this.scratchCtx.fillRect(0, 0, this.width, this.height);
    sample.draw(this.scratchCtx, 0, 0, this.width, this.height);

    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.scratch);

    const count = Math.min(boxes.length, MAX_BOXES);
    this.boxesData.fill(0);
    for (let i = 0; i < count; i++) {
      const b = boxes[i];
      this.boxesData[i * 4 + 0] = b.x;
      this.boxesData[i * 4 + 1] = b.y;
      this.boxesData[i * 4 + 2] = b.w;
      this.boxesData[i * 4 + 3] = b.h;
    }

    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.loc.uTex, 0);
    gl.uniform2f(this.loc.uRes, this.width, this.height);
    gl.uniform1f(this.loc.uMinBlock, this.minBlockPx);
    gl.uniform1f(this.loc.uFeather, this.featherPx);
    gl.uniform1f(this.loc.uBlockFrac, this.blockFrac);
    gl.uniform1i(this.loc.uBoxCount, count);
    gl.uniform1i(this.loc.uStyle, this.style);
    gl.uniform4fv(this.loc.uBoxes, this.boxesData);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.tex);
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
  }
}
