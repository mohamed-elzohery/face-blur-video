import { chromium } from "@playwright/test";

const URL = process.env.SMOKE_URL ?? "http://localhost:3001";
const browser = await chromium.launch({
  args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".cap-badge", { timeout: 15000 });

await page.setInputFiles('input[type="file"]', "tests/fixtures/face.mp4");
await page.screenshot({ path: "/tmp/ui-idle.png" });

await page.getByRole("button", { name: "Blur faces" }).click();
await page.waitForSelector(".preview-video", { timeout: 90000 });
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/ui-done.png" });
console.log("saved /tmp/ui-idle.png and /tmp/ui-done.png");
await browser.close();
