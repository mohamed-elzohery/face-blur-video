import { chromium } from "@playwright/test";

const URL = process.env.SMOKE_URL ?? "http://localhost:3001";
const OUT = process.env.SHOT_OUT ?? "/tmp/face-blur-m0.png";

const browser = await chromium.launch({
  args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 820 } });
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".cap-badge, .notice-error", { timeout: 15000 }).catch(() => null);
await page.screenshot({ path: OUT });
await browser.close();
console.log("screenshot saved to", OUT);
