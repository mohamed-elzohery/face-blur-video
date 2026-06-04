"use client";

import { useEffect, useRef, useState } from "react";
import type { FaceMeta } from "@/lib/types";

interface FaceGalleryProps {
  faces: FaceMeta[];
  thumbnails: ImageBitmap[];
  onConfirm: (keepIds: number[]) => void;
  onBack: () => void;
}

function FaceThumb({ bitmap }: { bitmap: ImageBitmap }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(bitmap, 0, 0);
  }, [bitmap]);
  return <canvas ref={ref} className="face-thumb" />;
}

export function FaceGallery({ faces, thumbnails, onConfirm, onBack }: FaceGalleryProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (faces.length === 0) {
    return (
      <div className="card face-gallery">
        <p className="status">No distinct faces were found in this video.</p>
        <div className="row">
          <button className="btn btn-primary" onClick={() => onConfirm([])}>
            Blur all faces
          </button>
          <button className="btn" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card face-gallery">
      <p className="status">
        <strong>{faces.length}</strong> {faces.length === 1 ? "person" : "people"} found. Select who
        to <strong>keep unblurred</strong> — everyone else will be blurred.
      </p>

      <ul className="face-grid">
        {faces.map((face, i) => {
          const keep = selected.has(face.identityId);
          return (
            <li key={face.identityId}>
              <button
                type="button"
                className={`face-tile${keep ? " face-tile-keep" : ""}`}
                aria-pressed={keep}
                onClick={() => toggle(face.identityId)}
              >
                {thumbnails[i] && <FaceThumb bitmap={thumbnails[i]} />}
                <span className="face-badge">{keep ? "Kept" : "Blur"}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="row">
        <button className="btn btn-primary" onClick={() => onConfirm([...selected])}>
          {selected.size === 0
            ? "Blur all faces"
            : `Keep ${selected.size} · blur the rest`}
        </button>
        <button className="btn" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
