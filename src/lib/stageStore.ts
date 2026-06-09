import { useSyncExternalStore } from "react";

export type Stage = "landing" | "active";

let current: Stage = "landing";
const listeners = new Set<() => void>();

export function setStage(next: Stage) {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Stage {
  return current;
}

function getServerSnapshot(): Stage {
  return "landing";
}

export function useStage(): Stage {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
