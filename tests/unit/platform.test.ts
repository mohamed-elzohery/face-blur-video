import { describe, expect, it } from "vitest";
import { isMobileWebKit } from "@/lib/platform";

const IPHONE_16 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1";
const IPAD_LEGACY =
  "Mozilla/5.0 (iPad; CPU OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1";
const IPADOS_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";

describe("isMobileWebKit", () => {
  it("detects iPhone Safari", () => {
    expect(isMobileWebKit(IPHONE_16, 5)).toBe(true);
  });

  it("detects iPhone Chrome (WebKit under the hood)", () => {
    expect(isMobileWebKit(IPHONE_CHROME, 5)).toBe(true);
  });

  it("detects legacy iPad UA", () => {
    expect(isMobileWebKit(IPAD_LEGACY, 5)).toBe(true);
  });

  it("detects iPadOS desktop-mode via touch points", () => {
    expect(isMobileWebKit(IPADOS_DESKTOP, 5)).toBe(true);
  });

  it("treats a real Mac (no touch) as not mobile WebKit", () => {
    expect(isMobileWebKit(MAC_SAFARI, 0)).toBe(false);
  });

  it("treats Windows Chrome as not mobile WebKit", () => {
    expect(isMobileWebKit(WINDOWS_CHROME, 0)).toBe(false);
  });

  it("treats Android Chrome as not mobile WebKit", () => {
    expect(isMobileWebKit(ANDROID_CHROME, 5)).toBe(false);
  });

  it("returns false for an empty user agent", () => {
    expect(isMobileWebKit("", 0)).toBe(false);
  });
});
