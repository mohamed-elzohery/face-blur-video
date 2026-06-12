"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decideCapabilities, detectMainFeatures, engineForReport } from "@/lib/capabilities";
import { durationBucket, sizeBucket, track } from "@/lib/analytics";
import {
  DEFAULT_JOB_CONFIG,
  type BlurBackend,
  type BlurMode,
  type CapabilityReport,
  type DetectorEP,
  type FaceMeta,
  type JobConfig,
  type MainToWorker,
  type WorkerToMain,
} from "@/lib/types";

function configParams(config: JobConfig) {
  return {
    style: config.style,
    density: config.density,
    density_changed: config.density !== DEFAULT_JOB_CONFIG.density,
    keep_audio: config.keepAudio,
    engine: config.engine,
  };
}

interface JobTelemetry {
  detectorEP: DetectorEP | null;
  backend: BlurBackend | null;
  numThreads: number | null;
  frames: number;
  fps: number;
  progress: number;
  scanProgress: number;
}

const INITIAL_TELEMETRY: JobTelemetry = {
  detectorEP: null,
  backend: null,
  numThreads: null,
  frames: 0,
  fps: 0,
  progress: 0,
  scanProgress: 0,
};

export type PipelineStatus = "probing" | "ready" | "unsupported" | "error";
export type ModelStatus = "loading" | "ready" | "error";
export type MattingStatus = "idle" | "loading" | "ready";
export type JobStatus =
  | "idle"
  | "scanning"
  | "selecting"
  | "processing"
  | "done"
  | "cancelled"
  | "error";

export interface JobResult {
  blob: Blob;
  url: string;
  mimeType: string;
  fileName: string;
}

export interface JobState {
  status: JobStatus;
  mode: BlurMode;
  progress: number;
  scanProgress: number;
  framesDone: number;
  throughputFps: number;
  backend: BlurBackend | null;
  codec: string | null;
  detectorEP: DetectorEP | null;
  numThreads: number | null;
  crossOriginIsolated: boolean | null;
  lastLog: string | null;
  faces: FaceMeta[];
  faceThumbs: ImageBitmap[];
  result: JobResult | null;
  error: string | null;
}

const INITIAL_JOB: JobState = {
  status: "idle",
  mode: "faces",
  progress: 0,
  scanProgress: 0,
  framesDone: 0,
  throughputFps: 0,
  backend: null,
  codec: null,
  detectorEP: null,
  numThreads: null,
  crossOriginIsolated: null,
  lastLog: null,
  faces: [],
  faceThumbs: [],
  result: null,
  error: null,
};

export interface UsePipeline {
  report: CapabilityReport | null;
  status: PipelineStatus;
  modelStatus: ModelStatus;
  modelProgress: number;
  mattingStatus: MattingStatus;
  mattingProgress: number;
  job: JobState;
  start: (file: File, config?: JobConfig) => void;
  scan: (file: File, config?: JobConfig) => void;
  blurSelected: (file: File, keepIds: number[], config?: JobConfig) => void;
  preloadMatting: () => void;
  cancel: () => void;
  reset: () => void;
}

export function usePipeline(): UsePipeline {
  const workerRef = useRef<Worker | null>(null);
  const durationUsRef = useRef(0);
  const resultUrlRef = useRef<string | null>(null);
  const thumbsRef = useRef<ImageBitmap[]>([]);
  const jobStartRef = useRef(0);
  const jobModeRef = useRef<"blur_all" | "select" | "background">("blur_all");
  const stageRef = useRef<"scanning" | "processing">("processing");
  const teleRef = useRef<JobTelemetry>({ ...INITIAL_TELEMETRY });

  const [report, setReport] = useState<CapabilityReport | null>(null);
  const [status, setStatus] = useState<PipelineStatus>("probing");
  const [modelStatus, setModelStatus] = useState<ModelStatus>("loading");
  const [modelProgress, setModelProgress] = useState(0);
  const [mattingStatus, setMattingStatus] = useState<MattingStatus>("idle");
  const [mattingProgress, setMattingProgress] = useState(0);
  const [job, setJob] = useState<JobState>(INITIAL_JOB);

  const closeThumbs = useCallback(() => {
    for (const b of thumbsRef.current) b.close();
    thumbsRef.current = [];
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL("../worker/pipeline.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerToMain>) => {
      const msg = e.data;
      switch (msg.type) {
        case "capabilities": {
          const decided = decideCapabilities({ ...msg.features, ...detectMainFeatures() });
          setReport(decided);
          setStatus(decided.supported ? "ready" : "unsupported");
          if (decided.supported) {
            setModelStatus("loading");
            setModelProgress(0);
            worker.postMessage(
              { type: "preload", engine: engineForReport(decided) } satisfies MainToWorker,
            );
          }
          break;
        }
        case "modelProgress": {
          const progress = msg.total > 0 ? Math.min(1, msg.loaded / msg.total) : 0;
          if (msg.model === "matting") setMattingProgress(progress);
          else setModelProgress(progress);
          break;
        }
        case "modelsReady": {
          if (msg.model === "matting") {
            setMattingProgress(1);
            setMattingStatus("ready");
          } else {
            setModelProgress(1);
            setModelStatus("ready");
          }
          break;
        }
        case "scanStarted": {
          durationUsRef.current = msg.durationUs;
          stageRef.current = "scanning";
          teleRef.current.detectorEP = msg.detectorEP;
          setJob((j) => ({ ...j, status: "scanning", scanProgress: 0 }));
          break;
        }
        case "scanProgress": {
          teleRef.current.scanProgress = msg.progress;
          setJob((j) => ({ ...j, status: "scanning", scanProgress: msg.progress }));
          break;
        }
        case "scanFaces": {
          for (const b of thumbsRef.current) b.close();
          thumbsRef.current = msg.thumbnails;
          setJob((j) => ({
            ...j,
            status: "selecting",
            scanProgress: 1,
            faces: msg.faces,
            faceThumbs: msg.thumbnails,
          }));
          break;
        }
        case "started": {
          durationUsRef.current = msg.durationUs;
          stageRef.current = "processing";
          teleRef.current.detectorEP = msg.detectorEP;
          teleRef.current.backend = msg.blurBackend;
          teleRef.current.numThreads = msg.numThreads;
          setJob((j) => ({
            ...j,
            status: "processing",
            backend: msg.blurBackend,
            codec: msg.codec,
            detectorEP: msg.detectorEP,
            numThreads: msg.numThreads,
            crossOriginIsolated: msg.crossOriginIsolated,
          }));
          break;
        }
        case "progress": {
          const dur = durationUsRef.current;
          const progress = dur > 0 ? Math.min(1, msg.currentTimeUs / dur) : 0;
          teleRef.current.frames = msg.framesDone;
          teleRef.current.fps = msg.throughputFps;
          teleRef.current.progress = progress;
          setJob((j) => ({
            ...j,
            status: "processing",
            progress,
            framesDone: msg.framesDone,
            throughputFps: msg.throughputFps,
          }));
          break;
        }
        case "done": {
          if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
          const url = URL.createObjectURL(msg.output);
          resultUrlRef.current = url;
          const processingMs = Math.round(performance.now() - jobStartRef.current);
          const durSec = durationUsRef.current / 1_000_000;
          track("process_completed", {
            mode: jobModeRef.current,
            frames: teleRef.current.frames,
            throughput_fps: Math.round(teleRef.current.fps * 10) / 10,
            detector_ep: teleRef.current.detectorEP ?? "unknown",
            backend: teleRef.current.backend ?? "unknown",
            num_threads: teleRef.current.numThreads ?? 0,
            processing_ms: processingMs,
            realtime_factor:
              durSec > 0 ? Math.round((processingMs / (durSec * 1000)) * 100) / 100 : 0,
            duration_bucket: durSec > 0 ? durationBucket(durSec) : "unknown",
          });
          setJob((j) => ({
            ...j,
            status: "done",
            progress: 1,
            result: { blob: msg.output, url, mimeType: msg.mimeType, fileName: msg.fileName },
          }));
          break;
        }
        case "error": {
          if (msg.code === "cancelled") {
            const ratio =
              stageRef.current === "scanning"
                ? teleRef.current.scanProgress
                : teleRef.current.progress;
            track("process_cancelled", {
              stage: stageRef.current,
              progress_pct: Math.round(ratio * 100),
            });
          } else {
            track("process_error", {
              code: msg.code,
              message: msg.message.slice(0, 120),
              stage: stageRef.current,
              detector_ep: teleRef.current.detectorEP ?? "unknown",
              backend: teleRef.current.backend ?? "unknown",
            });
          }
          setJob((j) => ({
            ...j,
            status: msg.code === "cancelled" ? "cancelled" : "error",
            error: msg.message,
          }));
          break;
        }
        case "log": {
          const line = msg.msg;
          setJob((j) => ({ ...j, lastLog: line }));
          break;
        }
      }
    };

    worker.onerror = () => setStatus("error");
    worker.postMessage({ type: "probe" } satisfies MainToWorker);

    return () => {
      worker.terminate();
      workerRef.current = null;
      if (resultUrlRef.current) {
        URL.revokeObjectURL(resultUrlRef.current);
        resultUrlRef.current = null;
      }
      closeThumbs();
    };
  }, [closeThumbs]);

  const preloadMatting = useCallback(() => {
    setMattingStatus((prev) => (prev === "ready" ? prev : "loading"));
    workerRef.current?.postMessage({ type: "preload", matting: true } satisfies MainToWorker);
  }, []);

  const start = useCallback((file: File, config: JobConfig = DEFAULT_JOB_CONFIG) => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    closeThumbs();
    durationUsRef.current = 0;
    const mode = config.mode === "background" ? "background" : "blur_all";
    jobModeRef.current = mode;
    jobStartRef.current = performance.now();
    stageRef.current = "processing";
    teleRef.current = { ...INITIAL_TELEMETRY };
    track("process_started", {
      mode,
      size_bucket: sizeBucket(file.size),
      ...configParams(config),
    });
    if (config.mode === "background") preloadMatting();
    setJob({ ...INITIAL_JOB, status: "processing", mode: config.mode });
    workerRef.current?.postMessage({ type: "start", file, config } satisfies MainToWorker);
  }, [closeThumbs, preloadMatting]);

  const scan = useCallback((file: File, config: JobConfig = DEFAULT_JOB_CONFIG) => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    closeThumbs();
    durationUsRef.current = 0;
    jobModeRef.current = "select";
    jobStartRef.current = performance.now();
    stageRef.current = "scanning";
    teleRef.current = { ...INITIAL_TELEMETRY };
    track("process_started", {
      mode: "select",
      phase: "scan",
      size_bucket: sizeBucket(file.size),
      ...configParams(config),
    });
    setJob({ ...INITIAL_JOB, status: "scanning" });
    workerRef.current?.postMessage({ type: "scan", file, config } satisfies MainToWorker);
  }, [closeThumbs]);

  const blurSelected = useCallback(
    (file: File, keepIds: number[], config: JobConfig = DEFAULT_JOB_CONFIG) => {
      durationUsRef.current = 0;
      jobStartRef.current = performance.now();
      stageRef.current = "processing";
      teleRef.current = { ...INITIAL_TELEMETRY };
      setJob((j) => ({ ...INITIAL_JOB, status: "processing", faces: j.faces }));
      workerRef.current?.postMessage(
        { type: "blurSelected", file, config, keepIds } satisfies MainToWorker,
      );
    },
    [],
  );

  const cancel = useCallback(() => {
    workerRef.current?.postMessage({ type: "cancel" } satisfies MainToWorker);
  }, []);

  const reset = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    closeThumbs();
    setJob(INITIAL_JOB);
  }, [closeThumbs]);

  return {
    report,
    status,
    modelStatus,
    modelProgress,
    mattingStatus,
    mattingProgress,
    job,
    start,
    scan,
    blurSelected,
    preloadMatting,
    cancel,
    reset,
  };
}
