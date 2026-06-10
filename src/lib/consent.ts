"use client";

import { useSyncExternalStore } from "react";

export type ConsentState = "granted" | "denied" | "unset";

const STORAGE_KEY = "sb-analytics-consent";
const listeners = new Set<() => void>();

function read(): ConsentState {
  if (typeof window === "undefined") return "unset";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "granted" || v === "denied" ? v : "unset";
  } catch {
    return "unset";
  }
}

export function getConsent(): ConsentState {
  return read();
}

export function setConsent(state: "granted" | "denied"): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, state);
  } catch {
    void 0;
  }
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function useConsent(): ConsentState {
  return useSyncExternalStore(subscribe, read, () => "unset");
}
