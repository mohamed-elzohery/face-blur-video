import { chromium } from "@playwright/test";

const URL = process.env.SMOKE_URL ?? "http://localhost:3001";
const FILE = process.env.FIX ?? "tests/fixtures/landscape.mp4";

const browser = await chromium.launch({
  args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("console", (m) => console.log(`[console.${m.type()}]`, m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", String(e)));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".cap-badge", { timeout: 15000 });
await page.setInputFiles('input[type="file"]', FILE);
await page.getByRole("button", { name: "Blur faces" }).click();

await page.waitForTimeout(8000);

const snap = await page.evaluate(() => {
  return {
    panelText: document.querySelector(".panel")?.innerText ?? "(no panel)",
    hasVideo: !!document.querySelector(".preview-video"),
  };
});
console.log("\n=== PANEL ===\n" + snap.panelText);
console.log("hasVideo:", snap.hasVideo);

await browser.close();
