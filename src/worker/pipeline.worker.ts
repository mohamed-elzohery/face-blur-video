import { probeFeatures } from "@/lib/capabilities";
import type { MainToWorker, WorkerToMain } from "@/lib/types";
import { PipelineError } from "./errors";
import { runPipeline, type Cancel } from "./pipeline";

interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<MainToWorker>) => void) | null;
}

const ctx = self as unknown as WorkerScope;

function post(msg: WorkerToMain, transfer: Transferable[] = []): void {
  ctx.postMessage(msg, transfer);
}

let cancel: Cancel = { cancelled: false };

ctx.onmessage = async (e: MessageEvent<MainToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case "probe": {
      const features = await probeFeatures();
      post({ type: "capabilities", features });
      break;
    }
    case "start": {
      cancel = { cancelled: false };
      try {
        await runPipeline(msg.file, msg.config, (m) => post(m), cancel);
      } catch (err) {
        const code = err instanceof PipelineError ? err.code : "pipeline-error";
        const recoverable = err instanceof PipelineError ? err.recoverable : false;
        post({
          type: "error",
          code,
          message: err instanceof Error ? err.message : "Unexpected processing error.",
          recoverable,
        });
      }
      break;
    }
    case "cancel": {
      cancel.cancelled = true;
      break;
    }
  }
};
