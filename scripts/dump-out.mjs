import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const URL = process.env.SMOKE_URL ?? "http://localhost:3001";
const FILE = process.env.FIX ?? "tests/fixtures/detail.mp4";
const OUT = process.env.OUT ?? "/tmp/m2-out.mp4";

const browser = await chromium.launch({
  args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("console", (m) => console.log(`[${m.type()}]`, m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", String(e)));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".cap-badge", { timeout: 15000 });
await page.setInputFiles('input[type="file"]', FILE);
await page.getByRole("button", { name: "Blur faces" }).click();
await page.waitForSelector(".preview-video", { timeout: 60000 });

const b64 = await page.evaluate(async () => {
  const v = document.querySelector(".preview-video");
  const res = await fetch(v.src);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
});

writeFileSync(OUT, Buffer.from(b64, "base64"));
console.log("saved", OUT, Buffer.from(b64, "base64").length, "bytes");
await browser.close();
