"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decideCapabilities, detectMainFeatures, engineForReport } from "@/lib/capabilities";
import {
  DEFAULT_JOB_CONFIG,
  type BlurBackend,
  type CapabilityReport,
  type DetectorEP,
  type FaceMeta,
  type JobConfig,
  type MainToWorker,
  type WorkerToMain,
} from "@/lib/types";

export type PipelineStatus = "probing" | "ready" | "unsupported" | "error";
export type ModelStatus = "loading" | "ready" | "error";
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
  job: JobState;
  start: (file: File, config?: JobConfig) => void;
  scan: (file: File, config?: JobConfig) => void;
  blurSelected: (file: File, keepIds: number[], config?: JobConfig) => void;
  cancel: () => void;
  reset: () => void;
}

export function usePipeline(): UsePipeline {
  const workerRef = useRef<Worker | null>(null);
  const durationUsRef = useRef(0);
  const resultUrlRef = useRef<string | null>(null);
  const thumbsRef = useRef<ImageBitmap[]>([]);

  const [report, setReport] = useState<CapabilityReport | null>(null);
  const [status, setStatus] = useState<PipelineStatus>("probing");
  const [modelStatus, setModelStatus] = useState<ModelStatus>("loading");
  const [modelProgress, setModelProgress] = useState(0);
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
          setModelProgress(msg.total > 0 ? Math.min(1, msg.loaded / msg.total) : 0);
          break;
        }
        case "modelsReady": {
          setModelProgress(1);
          setModelStatus("ready");
          break;
        }
        case "scanStarted": {
          durationUsRef.current = msg.durationUs;
          setJob((j) => ({ ...j, status: "scanning", scanProgress: 0 }));
          break;
        }
        case "scanProgress": {
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
          setJob((j) => ({
            ...j,
            status: "done",
            progress: 1,
            result: { blob: msg.output, url, mimeType: msg.mimeType, fileName: msg.fileName },
          }));
          break;
        }
        case "error": {
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

  const start = useCallback((file: File, config: JobConfig = DEFAULT_JOB_CONFIG) => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    closeThumbs();
    durationUsRef.current = 0;
    setJob({ ...INITIAL_JOB, status: "processing" });
    workerRef.current?.postMessage({ type: "start", file, config } satisfies MainToWorker);
  }, [closeThumbs]);

  const scan = useCallback((file: File, config: JobConfig = DEFAULT_JOB_CONFIG) => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    closeThumbs();
    durationUsRef.current = 0;
    setJob({ ...INITIAL_JOB, status: "scanning" });
    workerRef.current?.postMessage({ type: "scan", file, config } satisfies MainToWorker);
  }, [closeThumbs]);

  const blurSelected = useCallback(
    (file: File, keepIds: number[], config: JobConfig = DEFAULT_JOB_CONFIG) => {
      durationUsRef.current = 0;
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
    job,
    start,
    scan,
    blurSelected,
    cancel,
    reset,
  };
}
