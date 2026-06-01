import { chromium } from "@playwright/test";

const URL = process.env.SMOKE_URL ?? "http://localhost:3001";
const browser = await chromium.launch({
  args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("console", (m) => console.log(`[${m.type()}]`, m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", String(e)));
await page.goto(URL, { waitUntil: "domcontentloaded" });

const out = await page.evaluate(async () => {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();

  async function readFirstPixel(makeSource) {
    const tex = device.createTexture({
      size: [4, 4],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const src = await makeSource();
    device.queue.copyExternalImageToTexture({ source: src, flipY: false }, { texture: tex }, [4, 4]);
    const bytesPerRow = 256;
    const buf = device.createBuffer({ size: bytesPerRow * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow }, [4, 4]);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    return Array.from(new Uint8Array(buf.getMappedRange().slice(0, 8)));
  }

  const canvasPixel = await readFirstPixel(() => {
    const c = new OffscreenCanvas(4, 4);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "rgb(10,200,40)";
    ctx.fillRect(0, 0, 4, 4);
    return c;
  });

  const bitmapPixel = await readFirstPixel(async () => {
    const c = new OffscreenCanvas(4, 4);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "rgb(10,200,40)";
    ctx.fillRect(0, 0, 4, 4);
    return await createImageBitmap(c);
  });

  return { canvasPixel, bitmapPixel };
});

console.log("copyExternalImageToTexture from OffscreenCanvas →", JSON.stringify(out.canvasPixel));
console.log("copyExternalImageToTexture from ImageBitmap   →", JSON.stringify(out.bitmapPixel));
console.log("(expected ~[10,200,40,255])");
await browser.close();
