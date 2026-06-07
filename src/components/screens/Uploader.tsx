"use client";

import { useRef, useState } from "react";
import { FolderOpen, Lock, ShieldCheck, UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export function Uploader({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file && file.type.startsWith("video/")) onFile(file);
  };

  const open = () => inputRef.current?.click();

  return (
    <div className="sb-upload">
      <div>
        <span className="sb-upload__eyebrow">
          <Lock size={14} />
          Private by default
        </span>
        <h1 className="sb-upload__title">Blur faces in any video</h1>
      </div>
      <p className="sb-upload__sub">
        Drop a clip in and SmartBlur detects and hides every face — processed entirely on your
        device. No frame drops, no quality loss, even in fast-moving, crowded footage.
      </p>
      <div
        className="sb-drop"
        data-drag={drag ? "true" : "false"}
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => pick(e.target.files)}
        />
        <span className="sb-drop__icon">
          <UploadCloud size={30} />
        </span>
        <div className="sb-drop__big">Drag &amp; drop your video</div>
        <div className="sb-drop__hint">MP4, MOV or WebM · any length</div>
        <Button
          variant="primary"
          iconLeft={<FolderOpen size={16} />}
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
        >
          Choose file
        </Button>
      </div>
      <div className="sb-upload__trust">
        <Badge variant="success" icon={<ShieldCheck size={12} />}>
          GDPR compliant
        </Badge>
        <Badge variant="outline">No sign-up</Badge>
        <Badge variant="outline">No credits</Badge>
        <Badge variant="outline">Free forever</Badge>
        <Badge variant="outline">No time limit</Badge>
      </div>
      <div className="sb-upload__features">
        <span>Nothing uploaded</span>
        <span className="dot" />
        <span>Multi-face</span>
        <span className="dot" />
        <span>Handles fast motion</span>
        <span className="dot" />
        <span>Full quality out</span>
      </div>
    </div>
  );
}
