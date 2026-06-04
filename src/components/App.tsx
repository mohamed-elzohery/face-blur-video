"use client";

import { useEffect, useRef, useState } from "react";
import { usePipeline } from "@/hooks/usePipeline";
import { saveBlob } from "@/lib/fileTarget";
import { DEFAULT_JOB_CONFIG, type JobConfig } from "@/lib/types";
import { CapabilityBadge } from "./CapabilityBadge";
import { UnsupportedNotice } from "./UnsupportedNotice";
import { Dropzone } from "./Dropzone";
import { Controls } from "./Controls";
import { PreviewPlayer } from "./PreviewPlayer";
import { FaceGallery } from "./FaceGallery";

function formatMB(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
}

export default function App() {
  const { report, status, job, start, scan, blurSelected, cancel, reset } = usePipeline();
  const [file, setFile] = useState<File | null>(null);
  const [config, setConfig] = useState<JobConfig>(DEFAULT_JOB_CONFIG);
  const originalUrlRef = useRef<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
    };
  }, []);

  const setOriginal = (f: File | null) => {
    if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
    originalUrlRef.current = f ? URL.createObjectURL(f) : null;
    setOriginalUrl(originalUrlRef.current);
  };

  const onPick = (f: File) => {
    reset();
    setFile(f);
    setOriginal(f);
  };
  const onReset = () => {
    reset();
    setFile(null);
    setOriginal(null);
  };

  const processing = job.status === "processing";

  return (
    <main className="app">
      <header className="app-header">
        <h1>
          Face<span className="accent">Blur</span>
        </h1>
        <p className="tagline">
          Blur every face in your video — entirely in your browser. Your footage never leaves
          your device.
        </p>
      </header>

      {status === "probing" && <p className="status">Checking your browser&hellip;</p>}

      {status === "error" && (
        <div className="notice notice-error" role="alert">
          <h2>Couldn&rsquo;t start the engine</h2>
          <p>The background processing worker failed to load. Try reloading the page.</p>
        </div>
      )}

      {report && status === "unsupported" && <UnsupportedNotice report={report} />}

      {report && status === "ready" && (
        <section className="panel">
          <CapabilityBadge report={report} />

          {!file && <Dropzone onFile={onPick} />}

          {file && (job.status === "idle" || job.status === "error") && (
            <div className="card">
              <p className="status">
                <strong>{file.name}</strong> · {formatMB(file.size)} MB
              </p>
              {job.status === "error" && (
                <p className="status error">{job.error ?? "Something went wrong."}</p>
              )}
              <Controls config={config} onChange={setConfig} />
              <div className="row">
                <button className="btn btn-primary" onClick={() => scan(file, config)}>
                  Scan &amp; choose faces
                </button>
                <button className="btn" onClick={() => start(file, config)}>
                  Blur all faces
                </button>
                <button className="btn" onClick={onReset}>
                  Choose another
                </button>
              </div>
            </div>
          )}

          {job.status === "scanning" && (
            <div className="card">
              <p className="status">Finding faces&hellip; {Math.round(job.scanProgress * 100)}%</p>
              <progress className="bar" max={1} value={job.scanProgress} />
              <div className="row">
                <button className="btn" onClick={cancel}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {job.status === "selecting" && file && (
            <FaceGallery
              faces={job.faces}
              thumbnails={job.faceThumbs}
              onConfirm={(keepIds) => blurSelected(file, keepIds, config)}
              onBack={reset}
            />
          )}

          {processing && (
            <div className="card">
              <p className="status">
                Blurring faces&hellip; {Math.round(job.progress * 100)}% · {job.framesDone} frames
                {job.throughputFps > 0 ? ` · ${job.throughputFps.toFixed(0)} fps` : ""}
              </p>
              <progress className="bar" max={1} value={job.progress} />
              <div className="row">
                <button className="btn" onClick={cancel}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {job.status === "done" && job.result && originalUrl && (
            <div className="card">
              <PreviewPlayer originalUrl={originalUrl} processedUrl={job.result.url} />
              <p className="hint">
                Review the result before sharing — automatic detection is best-effort and may miss
                hard cases.
              </p>
              <div className="row">
                <button
                  className="btn btn-primary"
                  onClick={() => saveBlob(job.result!.blob, job.result!.fileName)}
                >
                  {report.fileSystemAccess ? "Save video" : "Download video"}
                </button>
                <button className="btn" onClick={() => file && start(file, config)}>
                  Re-run
                </button>
                <button className="btn" onClick={onReset}>
                  New video
                </button>
              </div>
            </div>
          )}

          {job.status === "cancelled" && (
            <div className="card">
              <p className="status">Processing cancelled.</p>
              <div className="row">
                <button className="btn btn-primary" onClick={() => file && start(file, config)}>
                  Try again
                </button>
                <button className="btn" onClick={onReset}>
                  New video
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <footer className="app-footer">
        <span>No uploads · No tracking · Processed entirely on your device</span>
      </footer>
    </main>
  );
}
