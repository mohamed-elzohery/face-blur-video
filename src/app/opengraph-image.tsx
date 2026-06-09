import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND_MAGENTA, SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";
export const alt = "SmartBlur — blur faces in any video for free, 100% private, in your browser";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const interSemiBold = readFileSync(join(process.cwd(), "src/app/_og/Inter-SemiBold.ttf"));
const host = SITE_URL.replace(/^https?:\/\//, "");

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "76px 84px",
          background: `linear-gradient(135deg, ${BRAND_MAGENTA} 0%, #6c0078 100%)`,
          color: "#ffffff",
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 40, letterSpacing: -1 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 20,
            }}
          >
            <div style={{ width: 22, height: 22, borderRadius: 999, background: BRAND_MAGENTA }} />
          </div>
          SmartBlur
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 1000 }}>
          <div style={{ fontSize: 84, lineHeight: 1.06, letterSpacing: -2 }}>
            Blur faces in any video,
          </div>
          <div
            style={{
              fontSize: 84,
              lineHeight: 1.06,
              letterSpacing: -2,
              textDecoration: "underline",
              textDecorationThickness: 7,
              textUnderlineOffset: 12,
            }}
          >
            for free
          </div>
          <div style={{ fontSize: 40, marginTop: 30, opacity: 0.92 }}>
            100% private · In your browser · No upload · No watermark
          </div>
        </div>

        <div style={{ fontSize: 32, opacity: 0.85 }}>{host}</div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Inter", data: interSemiBold, weight: 600, style: "normal" }],
    }
  );
}
