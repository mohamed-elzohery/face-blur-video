import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static");
const URL = process.env.SMOKE_URL ?? "http://localhost:3001";
const FIX = "tests/fixtures";
const OUTDIR = "/tmp/face-blur-m1";
mkdirSync(OUTDIR, { recursive: true });

const CASES = [
  { name: "landscape", file: `${FIX}/landscape.mp4`, expectW: 1280, expectH: 720, expectAudio: true },
  { name: "portrait", file: `${FIX}/portrait.mp4`, expectW: 720, expectH: 1280, expectAudio: true },
  { name: "opus", file: `${FIX}/opus.webm`, expectW: 854, expectH: 480, expectAudio: true },
];

function probe(path) {
  try {
    execFileSync(FFMPEG, ["-i", path], { stdio: ["ignore", "ignore", "pipe"] });
    return "";
  } catch (e) {
    return String(e.stderr ?? "");
  }
}

const browser = await chromium.launch({
  args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});

let failures = 0;

for (const c of CASES) {
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
  await page.setInputFiles('input[type="file"]', c.file);
  await page.getByRole("button", { name: "Blur faces" }).click();
  await page.waitForSelector(".preview-video", { timeout: 60000 });

  const meta = await page.evaluate(async () => {
    const v = document.querySelector(".preview-video");
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

  const outPath = `${OUTDIR}/${c.name}.mp4`;
  writeFileSync(outPath, Buffer.from(meta.b64, "base64"));
  const info = probe(outPath);
  const hasVideo = /Video:\s*h264/i.test(info);
  const hasAudio = /Audio:\s*aac/i.test(info);
  const durMatch = info.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const probedDur = durMatch ? +durMatch[1] * 3600 + +durMatch[2] * 60 + +durMatch[3] : 0;

  const dimsOk = meta.w === c.expectW && meta.h === c.expectH;
  const durOk = Math.abs(meta.duration - 2) < 0.4 && Math.abs(probedDur - 2) < 0.4;
  const audioOk = c.expectAudio ? hasAudio : true;
  const ok = dimsOk && durOk && audioOk && hasVideo && leaks.length === 0 && errors.length === 0;
  if (!ok) failures++;

  console.log(`\n=== ${c.name} ===`);
  console.log(JSON.stringify({
    playerDims: `${meta.w}x${meta.h}`, expected: `${c.expectW}x${c.expectH}`, dimsOk,
    playerDuration: meta.duration.toFixed(2), probedDuration: probedDur.toFixed(2), durOk,
    hasVideoH264: hasVideo, hasAudioAAC: hasAudio, audioOk,
    outputBytes: meta.size, leaks, errors,
    verdict: ok ? "PASS" : "FAIL",
  }, null, 2));

  await page.close();
}

await browser.close();
console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
