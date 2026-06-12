import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static");
const URL = process.env.SMOKE_URL ?? "http://localhost:8080";
const MODE = process.env.MODE ?? "webgpu";
const CLIP = process.env.CLIP ?? "tests/fixtures/landscape.mp4";
const STYLE = process.env.STYLE ?? "gaussian";
const OUTDIR = `/tmp/face-blur-bg-${MODE}`;
mkdirSync(OUTDIR, { recursive: true });

const args =
  MODE === "webgpu"
    ? ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist"]
    : ["--disable-gpu", "--disable-features=WebGPU,Vulkan"];

const browser = await chromium.launch({ args });
const page = await browser.newPage();

const logs = [];
const errors = [];
page.on("console", (m) => {
  logs.push(m.text());
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: "domcontentloaded" });

const decline = page.getByRole("button", { name: "Decline" });
if (await decline.isVisible().catch(() => false)) await decline.click();

await page.setInputFiles('input[type="file"]', CLIP);
await page.locator(".af-option", { hasText: "Blur background" }).click();
if (STYLE === "mosaic") {
  await page.locator(".sb-fx__tile", { hasText: "Pixelated" }).click();
  await page.locator(".sb-density__slider input").fill("100");
}
await page.locator(".sb-choose__actions button.af-btn--primary").click();
await page.waitForSelector(".sb-preview", { timeout: 300000 });

const meta = await page.evaluate(async () => {
  const v = document.querySelector(".sb-stage__video");
  if (v.readyState < 1) {
    await new Promise((r) => v.addEventListener("loadedmetadata", r, { once: true }));
  }
  const res = await fetch(v.src);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return { duration: v.duration, w: v.videoWidth, h: v.videoHeight, size: bytes.length, b64: btoa(binary) };
});

const outPath = `${OUTDIR}/out-${STYLE}.mp4`;
writeFileSync(outPath, Buffer.from(meta.b64, "base64"));

function probe(path) {
  try {
    execFileSync(FFMPEG, ["-i", path], { stdio: ["ignore", "ignore", "pipe"] });
    return "";
  } catch (e) {
    return String(e.stderr ?? "");
  }
}

const info = probe(outPath);
const hasVideo = /Video:\s*h264/i.test(info);
const hasAudio = /Audio:\s*aac/i.test(info);

execFileSync(FFMPEG, [
  "-hide_banner", "-loglevel", "error", "-y",
  "-i", outPath, "-ss", "1", "-frames:v", "1", `${OUTDIR}/frame-out-${STYLE}.png`,
]);
execFileSync(FFMPEG, [
  "-hide_banner", "-loglevel", "error", "-y",
  "-i", CLIP, "-ss", "1", "-frames:v", "1", `${OUTDIR}/frame-in.png`,
]);

const bgLine = logs.find((l) => l.includes("blur-bg:")) ?? null;

console.log(
  JSON.stringify(
    {
      mode: MODE,
      style: STYLE,
      clip: CLIP,
      out: outPath,
      dims: [meta.w, meta.h],
      duration: +meta.duration.toFixed(2),
      sizeBytes: meta.size,
      hasVideo,
      hasAudio,
      bgLine,
      errors,
      frames: [`${OUTDIR}/frame-in.png`, `${OUTDIR}/frame-out-${STYLE}.png`],
    },
    null,
    2,
  ),
);

await browser.close();
process.exit(bgLine && hasVideo && errors.length === 0 ? 0 : 1);
