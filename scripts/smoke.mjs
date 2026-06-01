import { chromium } from "@playwright/test";

const URL = process.env.SMOKE_URL ?? "http://localhost:3001";

const browser = await chromium.launch({
  args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();

const consoleErrors = [];
const leakWarnings = [];
const pageErrors = [];

page.on("console", (m) => {
  const text = m.text();
  if (/VideoFrame.*garbage collected without being closed/i.test(text)) leakWarnings.push(text);
  if (m.type() === "error") consoleErrors.push(text);
});
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.goto(URL, { waitUntil: "domcontentloaded" });

await page
  .waitForSelector(".cap-badge, .notice-error", { timeout: 15000 })
  .catch(() => null);

const state = await page.evaluate(() => {
  const badge = document.querySelector(".cap-badge");
  const notice = document.querySelector(".notice-error");
  const chips = [...document.querySelectorAll(".cap-badge .chip")].map((c) => c.textContent?.trim());
  return {
    reached: badge ? "ready" : notice ? "unsupported" : "unknown",
    chips,
    noticeText: notice?.querySelector("h2")?.textContent ?? null,
    h1: document.querySelector(".app-header h1")?.textContent ?? null,
  };
});

console.log("=== SMOKE RESULT ===");
console.log(JSON.stringify({ state, leakWarnings, consoleErrors, pageErrors }, null, 2));

await browser.close();

const failed = pageErrors.length > 0 || consoleErrors.length > 0 || leakWarnings.length > 0 || state.reached === "unknown";
process.exit(failed ? 1 : 0);
