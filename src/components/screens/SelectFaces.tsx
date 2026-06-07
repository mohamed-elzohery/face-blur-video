"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import type { FaceMeta } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Slider } from "@/components/ui/Slider";
import { VideoStage } from "./VideoStage";

function FaceThumb({ bitmap }: { bitmap: ImageBitmap }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  }, [bitmap]);
  return <canvas ref={ref} className="sb-facechip__thumb" />;
}

export function SelectFaces({
  faces,
  thumbnails,
  originalUrl,
  density,
  setDensity,
  onBack,
  onConfirm,
}: {
  faces: FaceMeta[];
  thumbnails: ImageBitmap[];
  originalUrl: string;
  density: number;
  setDensity: (v: number) => void;
  onBack: () => void;
  onConfirm: (keepIds: number[]) => void;
}) {
  const [blurSet, setBlurSet] = useState<Set<number>>(() => new Set(faces.map((f) => f.identityId)));

  const toggle = (id: number) =>
    setBlurSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setAll = (on: boolean) =>
    setBlurSet(on ? new Set(faces.map((f) => f.identityId)) : new Set());

  const count = blurSet.size;
  const keepIds = faces.map((f) => f.identityId).filter((id) => !blurSet.has(id));

  if (faces.length === 0) {
    return (
      <div className="sb-empty">
        <h2>No distinct faces found</h2>
        <p>We couldn&rsquo;t group faces in this clip. You can still blur every face we detect.</p>
        <div className="sb-empty__actions">
          <Button variant="ghost" iconLeft={<ArrowLeft size={16} />} onClick={onBack}>
            Back
          </Button>
          <Button variant="primary" iconRight={<Sparkles size={16} />} onClick={() => onConfirm([])}>
            Blur all faces
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="sb-select">
      <div className="sb-select__head">
        <div>
          <h2>Tap the faces to blur</h2>
          <p>Selected faces get hidden. Everyone else stays visible.</p>
        </div>
        <div className="sb-select__bulk">
          <Button variant="outline" size="sm" onClick={() => setAll(true)}>
            Select all
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAll(false)}>
            Clear
          </Button>
        </div>
      </div>
      <VideoStage src={originalUrl} tag="Original" muted />
      <div className="sb-faces">
        {faces.map((f, i) => {
          const on = blurSet.has(f.identityId);
          return (
            <div
              key={f.identityId}
              className="sb-facechip"
              data-on={on ? "true" : "false"}
              role="checkbox"
              aria-checked={on}
              tabIndex={0}
              onClick={() => toggle(f.identityId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(f.identityId);
                }
              }}
            >
              <span className="sb-facechip__tick">
                <Check size={11} />
              </span>
              {thumbnails[i] ? <FaceThumb bitmap={thumbnails[i]} /> : <span className="sb-facechip__thumb" />}
              <span className="sb-facechip__name">Face {i + 1}</span>
            </div>
          );
        })}
      </div>
      <div className="sb-select__controls">
        <Slider
          label="Mask density"
          min={20}
          max={100}
          step={10}
          value={Math.round(density * 100)}
          onChange={(v) => setDensity(v / 100)}
          ticks={["Light", "Medium", "Dense"]}
          formatValue={(v) => `${v}%`}
        />
      </div>
      <div className="sb-select__actions">
        <Button variant="ghost" iconLeft={<ArrowLeft size={16} />} onClick={onBack}>
          Back
        </Button>
        <span className="sb-select__count">
          {count} of {faces.length} selected
        </span>
        <Button
          variant="primary"
          disabled={count === 0}
          iconRight={<Sparkles size={16} />}
          onClick={() => onConfirm(keepIds)}
        >
          Blur {count} {count === 1 ? "face" : "faces"}
        </Button>
      </div>
    </div>
  );
}
