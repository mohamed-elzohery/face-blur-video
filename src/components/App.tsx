"use client";

import { useEffect, useRef, useState } from "react";
import { usePipeline } from "@/hooks/usePipeline";
import { DEFAULT_JOB_CONFIG, type BlurStyle, type JobConfig } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Navbar, type Tab } from "@/components/screens/Navbar";
import { ModelLoading } from "@/components/screens/ModelLoading";
import { Uploader } from "@/components/screens/Uploader";
import { ChooseMode } from "@/components/screens/ChooseMode";
import { SelectFaces } from "@/components/screens/SelectFaces";
import { Processing } from "@/components/screens/Processing";
import { Preview } from "@/components/screens/Preview";
import { Examples } from "@/components/screens/Examples";
import { EmptyPage } from "@/components/screens/EmptyPage";
import { UnsupportedNotice } from "@/components/UnsupportedNotice";
import { WebGpuHint } from "@/components/WebGpuHint";

export default function App() {
  const { report, status, modelStatus, modelProgress, job, start, scan, blurSelected, cancel, reset } =
    usePipeline();
  const [file, setFile] = useState<File | null>(null);
  const [config, setConfig] = useState<JobConfig>(DEFAULT_JOB_CONFIG);
  const [tab, setTab] = useState<Tab>("home");
  const [dark, setDark] = useState(false);
  const originalUrlRef = useRef<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

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

  const setDensity = (v: number) => setConfig((c) => ({ ...c, density: v }));
  const setStyle = (v: BlurStyle) => setConfig((c) => ({ ...c, style: v }));
  const setKeepAudio = (v: boolean) => setConfig((c) => ({ ...c, keepAudio: v }));

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
  } else if (tab === "examples") {
    body = <Examples onHome={() => setTab("home")} />;
  } else if (tab !== "home") {
    body = <EmptyPage which={tab} onHome={() => setTab("home")} />;
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
      <Uploader onFile={onPick} onSeeExamples={() => setTab("examples")} />
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
        onBlurAll={() => start(file, config)}
        onSelect={() => scan(file, config)}
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
        onConfirm={(keepIds) => blurSelected(file, keepIds, config)}
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

  const viewKey = `${tab}:${file ? "f" : "n"}:${showingModel ? "model" : job.status}`;

  return (
    <div className="sb-app">
      <Navbar tab={tab} onTab={setTab} dark={dark} onToggleTheme={() => setDark((d) => !d)} />
      <main className="sb-main">
        <div className="sb-stagewrap">
          {tab === "home" && status === "ready" && report?.webgpuBlocklisted ? (
            <WebGpuHint />
          ) : null}
          <div className="sb-fade" key={viewKey}>
            {body}
          </div>
        </div>
      </main>
      <footer className="sb-foot">
        SmartBlur — local, private video anonymization · GDPR compliant · No sign-up
      </footer>
    </div>
  );
}
