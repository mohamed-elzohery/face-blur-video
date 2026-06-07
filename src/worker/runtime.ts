import type { WorkerToMain } from "@/lib/types";

export interface Cancel {
  cancelled: boolean;
}

export type Emit = (msg: WorkerToMain, transfer?: Transferable[]) => void;
