"use client";

import { useRef, useState } from "react";
import { FileVideoCamera, FolderOpen } from "lucide-react";
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
          <FileVideoCamera size={30} />
        </span>
        <div className="sb-drop__big">Drag &amp; drop your video to blur faces</div>
        <div className="sb-drop__hint">MP4, MOV or WebM · any length · free, no upload</div>
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
    </div>
  );
}
