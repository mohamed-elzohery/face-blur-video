import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static");
const URL = process.env.SMOKE_URL ?? "http://localhost:3001";
const INPUT = "tests/fixtures/face.mp4";
const OUT = "/tmp/m4-out.mp4";
const W = 720;
const H = 720;

function rawFrame(path) {
  return new Uint8Array(
    execFileSync(
      FFMPEG,
      ["-hide_banner", "-loglevel", "error", "-ss", "1", "-i", path, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"],
      { maxBuffer: 1 << 30 },
    ),
  );
}
function meanGradient(frame, x0, y0, x1, y1) {
  const lum = (i) => 0.299 * frame[i] + 0.587 * frame[i + 1] + 0.114 * frame[i + 2];
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1 - 1; y++)
    for (let x = x0; x < x1 - 1; x++) {
      const i = (y * W + x) * 4;
      const here = lum(i);
      sum += Math.abs(here - lum(i + 4)) + Math.abs(here - lum(i + W * 4));
      n += 2;
    }
  return n ? sum / n : 0;
}
function mad(a, b, x0, y0, x1, y1) {
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      n += 3;
    }
  return sum / n;
}

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--ignore-gpu-blocklist"],
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
const backendChip = await page.evaluate(() => document.querySelector(".cap-badge .chip")?.textContent ?? "");
await page.setInputFiles('input[type="file"]', INPUT);
await page.getByRole("button", { name: "Blur faces" }).click();
await page.waitForSelector(".preview-video", { timeout: 90000 });
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
const fx0 = Math.round(0.35 * W);
const fy0 = Math.round(0.32 * H);
const fx1 = Math.round(0.62 * W);
const fy1 = Math.round(0.62 * H);
const faceGradIn = meanGradient(inFrame, fx0, fy0, fx1, fy1);
const faceGradOut = meanGradient(outFrame, fx0, fy0, fx1, fy1);
const faceMad = mad(inFrame, outFrame, fx0, fy0, fx1, fy1);
const cornerMad = mad(inFrame, outFrame, 5, 5, 90, 90);

const usedWebgl2 = /WebGL2/i.test(backendChip);
const faceBlurred = faceGradOut < faceGradIn * 0.45;
const maskedToFace = faceMad > cornerMad * 3;
const ok = usedWebgl2 && faceBlurred && maskedToFace && leaks.length === 0 && errors.length === 0;

console.log("=== M4 WebGL2 fallback verification ===");
console.log(
  JSON.stringify(
    { backendChip, faceGradIn: faceGradIn.toFixed(2), faceGradOut: faceGradOut.toFixed(2), faceMad: faceMad.toFixed(1), cornerMad: cornerMad.toFixed(1), usedWebgl2, faceBlurred, maskedToFace, leaks, errors, verdict: ok ? "PASS" : "FAIL" },
    null,
    2,
  ),
);
process.exit(ok ? 0 : 1);
