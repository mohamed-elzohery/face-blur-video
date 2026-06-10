"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePipeline } from "@/hooks/usePipeline";
import { useWakeLock } from "@/hooks/useWakeLock";
import { DEFAULT_JOB_CONFIG, type BlurStyle, type JobConfig } from "@/lib/types";
import { engineForReport } from "@/lib/capabilities";
import { Button } from "@/components/ui/Button";
import { ModelLoading } from "@/components/screens/ModelLoading";
import { Uploader } from "@/components/screens/Uploader";
import { ChooseMode } from "@/components/screens/ChooseMode";
import { SelectFaces } from "@/components/screens/SelectFaces";
import { Processing } from "@/components/screens/Processing";
import { Preview } from "@/components/screens/Preview";
import { UnsupportedNotice } from "@/components/UnsupportedNotice";
import { WebGpuHint } from "@/components/WebGpuHint";
import { CpuHint } from "@/components/CpuHint";
import { setStage } from "@/lib/stageStore";
import { sizeBucket, track } from "@/lib/analytics";
import { useSessionAnalytics } from "@/hooks/useSessionAnalytics";

export default function App() {
  const { report, status, modelStatus, modelProgress, job, start, scan, blurSelected, cancel, reset } =
    usePipeline();
  useWakeLock(job.status === "scanning" || job.status === "processing");
  useSessionAnalytics(report, status);
  const [file, setFile] = useState<File | null>(null);
  const [config, setConfig] = useState<JobConfig>(DEFAULT_JOB_CONFIG);
  const originalUrlRef = useRef<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
    };
  }, []);

  const landing = !file && status !== "unsupported" && status !== "error";
  useEffect(() => {
    setStage(landing ? "landing" : "active");
    return () => setStage("landing");
  }, [landing]);

  const isCoarsePointer =
    typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
  const showCpuHint =
    status === "ready" && !!report && !report.webgpu && !report.webgpuBlocklisted && isCoarsePointer;

  const setOriginal = (f: File | null) => {
    if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
    originalUrlRef.current = f ? URL.createObjectURL(f) : null;
    setOriginalUrl(originalUrlRef.current);
  };

  const setDensity = (v: number) => setConfig((c) => ({ ...c, density: v }));
  const setStyle = (v: BlurStyle) => setConfig((c) => ({ ...c, style: v }));
  const setKeepAudio = (v: boolean) => setConfig((c) => ({ ...c, keepAudio: v }));

  const effectiveConfig = useMemo<JobConfig>(
    () => (report?.supported ? { ...config, engine: engineForReport(report) } : config),
    [config, report],
  );

  const onPick = (f: File) => {
    reset();
    setFile(f);
    setOriginal(f);
    track("file_selected", { size_bucket: sizeBucket(f.size), format: f.type || "unknown" });
  };
  const onReset = () => {
    track("new_video", { from: job.status === "idle" ? "options" : job.status });
    reset();
    setFile(null);
    setOriginal(null);
  };

  const modelLoading = status !== "unsupported" && status !== "error" && modelStatus !== "ready";
  const showingModel = !!file && job.status !== "idle" && modelLoading;

  let body: React.ReactNode;

  if (status === "error") {
    body = (
      <div className="notice notice-error" role="alert">
        <h2>Couldn&rsquo;t start the engine</h2>
        <p>The background processing worker failed to load. Try reloading the page.</p>
      </div>
    );
  } else if (status === "unsupported" && report) {
    body = <UnsupportedNotice report={report} />;
  } else if (job.status === "cancelled") {
    body = (
      <div className="sb-empty">
        <h2>Processing cancelled</h2>
        <p>No changes were made. You can pick up where you left off or start fresh.</p>
        <div className="sb-empty__actions">
          {file ? (
            <Button variant="outline" onClick={reset}>
              Back to options
            </Button>
          ) : null}
          <Button variant="primary" onClick={onReset}>
            Upload a new video
          </Button>
        </div>
      </div>
    );
  } else if (job.status === "error") {
    body = (
      <div className="sb-empty">
        <h2>Something went wrong</h2>
        <p>{job.error ?? "The video couldn't be processed."}</p>
        <div className="sb-empty__actions">
          {file ? (
            <Button variant="outline" onClick={reset}>
              Try again
            </Button>
          ) : null}
          <Button variant="primary" onClick={onReset}>
            Upload a new video
          </Button>
        </div>
      </div>
    );
  } else if (!file || job.status === "idle") {
    body = !file ? (
      <Uploader onFile={onPick} />
    ) : (
      <ChooseMode
        file={file}
        originalUrl={originalUrl ?? ""}
        density={config.density}
        setDensity={setDensity}
        style={config.style}
        setStyle={setStyle}
        keepAudio={config.keepAudio}
        setKeepAudio={setKeepAudio}
        onBack={onReset}
        onBlurAll={() => start(file, effectiveConfig)}
        onSelect={() => scan(file, effectiveConfig)}
      />
    );
  } else if (modelLoading) {
    body = <ModelLoading progress={modelProgress} checking={status === "probing"} />;
  } else if (job.status === "scanning") {
    body = <Processing mode="scanning" progress={job.scanProgress} onCancel={cancel} />;
  } else if (job.status === "selecting" && file) {
    body = (
      <SelectFaces
        faces={job.faces}
        thumbnails={job.faceThumbs}
        originalUrl={originalUrl ?? ""}
        density={config.density}
        setDensity={setDensity}
        onBack={reset}
        onConfirm={(keepIds) => blurSelected(file, keepIds, effectiveConfig)}
      />
    );
  } else if (job.status === "processing") {
    body = <Processing mode="blurring" progress={job.progress} onCancel={cancel} />;
  } else if (job.status === "done" && job.result && originalUrl && report) {
    body = (
      <Preview
        originalUrl={originalUrl}
        processedUrl={job.result.url}
        blob={job.result.blob}
        fileName={job.result.fileName}
        fileSystemAccess={report.fileSystemAccess}
        onRestart={onReset}
      />
    );
  }

  const viewKey = `${file ? "f" : "n"}:${showingModel ? "model" : job.status}`;

  return (
    <div className="sb-stagewrap">
      {status === "ready" && report?.webgpuBlocklisted ? <WebGpuHint /> : null}
      {showCpuHint ? <CpuHint /> : null}
      <div className="sb-fade" key={viewKey}>
        {body}
      </div>
    </div>
  );
}
