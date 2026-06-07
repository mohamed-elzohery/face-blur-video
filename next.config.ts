import type { NextConfig } from "next";

const COI_HEADERS = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
];

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/(.*)", headers: COI_HEADERS }];
  },
};

export default nextConfig;
