"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Clock, Film, ScanFace, Shield, SlidersHorizontal } from "lucide-react";
import type { BlurStyle } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BlurPreview } from "@/components/ui/BlurPreview";
import { OptionCard } from "@/components/ui/OptionCard";
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";
import { VideoStage } from "./VideoStage";

function formatMB(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
}

const EFFECTS: { id: BlurStyle; label: string; desc: string; img: string }[] = [
  { id: "mosaic", label: "Pixelated", desc: "Blocky mosaic over faces", img: "/styles/pixelated.png" },
  { id: "gaussian", label: "Gaussian", desc: "Soft, smooth blur", img: "/styles/gaussian.png" },
];

export function ChooseMode({
  file,
  originalUrl,
  density,
  setDensity,
  style,
  setStyle,
  keepAudio,
  setKeepAudio,
  onBack,
  onBlurAll,
  onSelect,
}: {
  file: File;
  originalUrl: string;
  density: number;
  setDensity: (v: number) => void;
  style: BlurStyle;
  setStyle: (v: BlurStyle) => void;
  keepAudio: boolean;
  setKeepAudio: (v: boolean) => void;
  onBack: () => void;
  onBlurAll: () => void;
  onSelect: () => void;
}) {
  const [mode, setMode] = useState<"all" | "select">("all");

  return (
    <div className="sb-choose">
      <div>
        <VideoStage src={originalUrl} tag="Original" muted />
        <div className="sb-filechip">
          <Film size={15} /> {file.name} · {formatMB(file.size)} MB
        </div>
      </div>
      <div className="sb-choose__panel">
        <div className="sb-choose__head">
          <h2>How should we blur?</h2>
          <p>Pick a path. You can always start over.</p>
        </div>
        <div className="sb-choose__options">
          <OptionCard
            icon={<Shield size={22} />}
            title="Blur all faces"
            badge={
              <Badge variant="success" style={{ marginLeft: 8 }}>
                Fast
              </Badge>
            }
            description="Runs detection once and blurs every face it finds."
            selected={mode === "all"}
            onClick={() => setMode("all")}
          />
          <OptionCard
            icon={<ScanFace size={22} />}
            title="Select faces before blur"
            badge={
              <Badge variant="outline" icon={<Clock size={12} />} style={{ marginLeft: 8 }}>
                Coming soon
              </Badge>
            }
            description="Full pipeline — recognizes each face so you choose exactly who to hide."
            selected={false}
            disabled
          />
        </div>
        <div className="sb-choose__controls">
          <div className="sb-choose__controls-title">
            <SlidersHorizontal size={15} />
            Blur controls
          </div>
          <div className="sb-fx" role="radiogroup" aria-label="Blur effect">
            {EFFECTS.map((fx) => (
              <button
                key={fx.id}
                type="button"
                className="sb-fx__tile"
                data-on={style === fx.id ? "true" : "false"}
                role="radio"
                aria-checked={style === fx.id}
                onClick={() => setStyle(fx.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="sb-fx__img" src={fx.img} alt="" loading="lazy" />
                <span className="sb-fx__label">{fx.label}</span>
                <span className="sb-fx__desc">{fx.desc}</span>
              </button>
            ))}
          </div>
          <div className="sb-density">
            <BlurPreview style={style} density={density} className="sb-density__sample" />
            <Slider
              className="sb-density__slider"
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
          <div className="sb-choose__row">
            <span className="lab">
              <b>Keep audio</b>
              <span>Preserve the original soundtrack</span>
            </span>
            <Switch checked={keepAudio} onChange={(e) => setKeepAudio(e.target.checked)} />
          </div>
        </div>
        <div className="sb-choose__actions">
          <Button variant="ghost" iconLeft={<ArrowLeft size={16} />} onClick={onBack}>
            Back
          </Button>
          <Button
            variant="primary"
            fullWidth
            iconRight={<ArrowRight size={16} />}
            onClick={() => (mode === "all" ? onBlurAll() : onSelect())}
          >
            {mode === "all" ? "Blur all faces" : "Continue to selection"}
          </Button>
        </div>
      </div>
    </div>
  );
}
