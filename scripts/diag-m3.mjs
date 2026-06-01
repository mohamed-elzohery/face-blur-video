import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const FFMPEG = createRequire(import.meta.url)("ffmpeg-static");
const W = 720;
const H = 720;
const BLOCK = 14;
const FILE = process.env.FILE ?? "/tmp/m3-out.mp4";

function raw(p) {
  return new Uint8Array(
    execFileSync(
      FFMPEG,
      ["-hide_banner", "-loglevel", "error", "-ss", "1", "-i", p, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"],
      { maxBuffer: 1 << 30 },
    ),
  );
}

function bv(f, x0, y0, x1, y1) {
  let total = 0;
  let count = 0;
  for (let by = Math.ceil(y0 / BLOCK) * BLOCK; by + BLOCK <= y1; by += BLOCK)
    for (let bx = Math.ceil(x0 / BLOCK) * BLOCK; bx + BLOCK <= x1; bx += BLOCK) {
      let s = 0;
      let sq = 0;
      for (let yy = 0; yy < BLOCK; yy++)
        for (let xx = 0; xx < BLOCK; xx++) {
          const i = ((by + yy) * W + (bx + xx)) * 4;
          const l = 0.299 * f[i] + 0.587 * f[i + 1] + 0.114 * f[i + 2];
          s += l;
          sq += l * l;
        }
      const n = BLOCK * BLOCK;
      total += sq / n - (s / n) ** 2;
      count++;
    }
  return count ? total / count : 0;
}

const out = raw(FILE);
console.log("file", FILE, "bytes", out.length, "expected", W * H * 4);
console.log("centerVar[252..446,230..446]:", bv(out, 252, 230, 446, 446).toFixed(2));

let mn = 255;
let mx = 0;
for (let y = 230; y < 446; y++)
  for (let x = 252; x < 446; x++) {
    const i = (y * W + x) * 4;
    const l = 0.299 * out[i] + 0.587 * out[i + 1] + 0.114 * out[i + 2];
    if (l < mn) mn = l;
    if (l > mx) mx = l;
  }
console.log("region luma min/max:", mn.toFixed(1), mx.toFixed(1));
const px = (x, y) => {
  const i = (y * W + x) * 4;
  return `(${out[i]},${out[i + 1]},${out[i + 2]})`;
};
console.log("pixels along row 350:", px(300, 350), px(310, 350), px(320, 350), px(360, 350), px(400, 350));

{
  const by = 336;
  const bx = 336;
  let s = 0;
  let sq = 0;
  for (let yy = 0; yy < BLOCK; yy++)
    for (let xx = 0; xx < BLOCK; xx++) {
      const i = ((by + yy) * W + (bx + xx)) * 4;
      const l = 0.299 * out[i] + 0.587 * out[i + 1] + 0.114 * out[i + 2];
      s += l;
      sq += l * l;
    }
  const n = BLOCK * BLOCK;
  console.log("block@336,336: mean", (s / n).toFixed(1), "var", (sq / n - (s / n) ** 2).toFixed(2));
}
writeFileSync("/tmp/m3.raw", out);
execFileSync(FFMPEG, [
  "-y", "-hide_banner", "-loglevel", "error",
  "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-i", "/tmp/m3.raw",
  "-frames:v", "1", "/tmp/m3-from-raw.png",
]);
console.log("wrote /tmp/m3-from-raw.png from the exact measured bytes");
