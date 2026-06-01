import { chromium } from "@playwright/test";

const URL = process.env.SMOKE_URL ?? "http://localhost:3001";
const CLIP = process.env.CLIP ?? "tests/fixtures/landscape.mp4";
const FRAMES = Number(process.env.FRAMES ?? 60);

const browser = await chromium.launch({
  args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".cap-badge", { timeout: 15000 });
const backend = await page.evaluate(() => document.querySelector(".cap-badge .chip")?.textContent ?? "");
await page.setInputFiles('input[type="file"]', CLIP);
const t0 = Date.now();
await page.getByRole("button", { name: "Blur faces" }).click();
await page.waitForSelector(".preview-video", { timeout: 120000 });
const elapsed = (Date.now() - t0) / 1000;
await browser.close();
console.log(
  JSON.stringify({ backend, clip: CLIP, frames: FRAMES, wallSeconds: +elapsed.toFixed(2), fps: +(FRAMES / elapsed).toFixed(1) }),
);
