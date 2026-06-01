import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static");
const URL = process.env.SMOKE_URL ?? "http://localhost:3001";
const INPUT = "tests/fixtures/detail.mp4";
const OUT = "/tmp/m2-out.mp4";
const W = 1280;
const H = 720;
const BLOCK = 14;
const BOX = { x: 0.35, y: 0.3, w: 0.3, h: 0.4 };

function rawFrame(path) {
  const buf = execFileSync(
    FFMPEG,
    ["-hide_banner", "-loglevel", "error", "-ss", "1", "-i", path, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"],
    { maxBuffer: 1 << 30 },
  );
  return new Uint8Array(buf);
}

function mad(a, b, x0, y0, x1, y1) {
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      n += 3;
    }
  }
  return sum / n;
}

function alignedBlockVar(frame, x0, y0, x1, y1) {
  let total = 0;
  let count = 0;
  for (let by = Math.ceil(y0 / BLOCK) * BLOCK; by + BLOCK <= y1; by += BLOCK) {
    for (let bx = Math.ceil(x0 / BLOCK) * BLOCK; bx + BLOCK <= x1; bx += BLOCK) {
      let s = 0;
      let sq = 0;
      for (let yy = 0; yy < BLOCK; yy++) {
        for (let xx = 0; xx < BLOCK; xx++) {
          const i = ((by + yy) * W + (bx + xx)) * 4;
          const l = 0.299 * frame[i] + 0.587 * frame[i + 1] + 0.114 * frame[i + 2];
          s += l;
          sq += l * l;
        }
      }
      const n = BLOCK * BLOCK;
      total += sq / n - (s / n) ** 2;
      count++;
    }
  }
  return count ? total / count : 0;
}

const browser = await chromium.launch({
  args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
const leaks = [];
const errors = [];
page.on("console", (m) => {
  const t = m.text();
  if (/VideoFrame.*garbage collected without being closed/i.test(t)) leaks.push(t);
  if (m.type() === "error") errors.push(t);
});
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".cap-badge", { timeout: 15000 });
const backend = await page.evaluate(() => document.querySelector(".cap-badge .chip")?.textContent ?? "");
await page.setInputFiles('input[type="file"]', INPUT);
await page.getByRole("button", { name: "Blur faces" }).click();
await page.waitForSelector(".preview-video", { timeout: 60000 });
const b64 = await page.evaluate(async () => {
  const v = document.querySelector(".preview-video");
  const res = await fetch(v.src);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
});
await browser.close();
writeFileSync(OUT, Buffer.from(b64, "base64"));

const inFrame = rawFrame(INPUT);
const outFrame = rawFrame(OUT);

const bx0 = Math.round((BOX.x + 0.03) * W);
const by0 = Math.round((BOX.y + 0.05) * H);
const bx1 = Math.round((BOX.x + BOX.w - 0.03) * W);
const by1 = Math.round((BOX.y + BOX.h - 0.05) * H);

const insideMad = mad(inFrame, outFrame, bx0, by0, bx1, by1);
const outsideMad = mad(inFrame, outFrame, 10, 10, W - 10, 150);
const inBoxVar = alignedBlockVar(inFrame, bx0, by0, bx1, by1);
const outBoxVar = alignedBlockVar(outFrame, bx0, by0, bx1, by1);

const sharpOutside = outsideMad < 10;
const blurredInside = insideMad > 15 && insideMad > outsideMad * 2;
const flattened = outBoxVar < inBoxVar * 0.5;
const ok = sharpOutside && blurredInside && flattened && leaks.length === 0 && errors.length === 0;

console.log("=== M2 mosaic verification ===");
console.log(
  JSON.stringify(
    {
      backend,
      insideBoxMAD: insideMad.toFixed(2),
      outsideBoxMAD: outsideMad.toFixed(2),
      inputBoxBlockVar: inBoxVar.toFixed(1),
      outputBoxBlockVar: outBoxVar.toFixed(1),
      sharpOutside,
      blurredInside,
      flattened,
      leaks,
      errors,
      verdict: ok ? "PASS" : "FAIL",
    },
    null,
    2,
  ),
);
process.exit(ok ? 0 : 1);
