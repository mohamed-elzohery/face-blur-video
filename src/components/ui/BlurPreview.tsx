"use client";

import { useEffect, useRef, useState } from "react";
import type { BlurStyle } from "@/lib/types";
import { MIN_BLOCK_PX, blockFracForDensity } from "@/lib/blurMath";

const SRC = "/styles/face-sample.jpg";
const CROP = { sx: 20, sy: 80, s: 360 };
const RENDER = 240;

let imagePromise: Promise<HTMLImageElement> | null = null;

function loadSample(): Promise<HTMLImageElement> {
  if (!imagePromise) {
    imagePromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = SRC;
    });
  }
  return imagePromise;
}

function paint(canvas: HTMLCanvasElement, img: HTMLImageElement | null, style: BlurStyle, density: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = RENDER;

  if (!img) {
    ctx.fillStyle = "#1c1c20";
    ctx.fillRect(0, 0, size, size);
    return;
  }

  const blockPx = Math.max(MIN_BLOCK_PX, blockFracForDensity(density) * size);

  if (style === "solid") {
    ctx.filter = "none";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, CROP.sx, CROP.sy, CROP.s, CROP.s, 0, 0, size, size);
    ctx.fillStyle = "rgba(13, 13, 15, 0.96)";
    ctx.fillRect(0, 0, size, size);
    return;
  }

  if (style === "gaussian") {
    ctx.imageSmoothingEnabled = true;
    ctx.filter = `blur(${(blockPx * 0.5).toFixed(2)}px)`;
    ctx.drawImage(img, CROP.sx, CROP.sy, CROP.s, CROP.s, 0, 0, size, size);
    ctx.filter = "none";
    return;
  }

  const small = Math.max(1, Math.round(size / blockPx));
  const tmp = document.createElement("canvas");
  tmp.width = small;
  tmp.height = small;
  const tctx = tmp.getContext("2d");
  if (!tctx) return;
  tctx.drawImage(img, CROP.sx, CROP.sy, CROP.s, CROP.s, 0, 0, small, small);
  ctx.filter = "none";
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(tmp, 0, 0, small, small, 0, 0, size, size);
}

export function BlurPreview({
  style,
  density,
  className = "",
}: {
  style: BlurStyle;
  density: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    loadSample()
      .then((img) => {
        if (!alive) return;
        imgRef.current = img;
        setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (ref.current) paint(ref.current, imgRef.current, style, density);
  }, [loaded, style, density]);

  return (
    <canvas
      ref={ref}
      width={RENDER}
      height={RENDER}
      className={["sb-blursample", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    />
  );
}
