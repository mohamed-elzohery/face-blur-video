"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Film, ScanFace, Shield, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { OptionCard } from "@/components/ui/OptionCard";
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";
import { VideoStage } from "./VideoStage";

function formatMB(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
}

export function ChooseMode({
  file,
  originalUrl,
  density,
  setDensity,
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
              <Badge variant="outline" style={{ marginLeft: 8 }}>
                Slower
              </Badge>
            }
            description="Full pipeline — recognizes each face so you choose exactly who to hide."
            selected={mode === "select"}
            onClick={() => setMode("select")}
          />
        </div>
        <div className="sb-choose__controls">
          <div className="sb-choose__controls-title">
            <SlidersHorizontal size={15} />
            Blur controls
          </div>
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
