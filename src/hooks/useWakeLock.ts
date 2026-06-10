"use client";

import { useEffect, useRef } from "react";

export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let cancelled = false;

    const acquire = async () => {
      if (sentinelRef.current) return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        sentinel.addEventListener("release", () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
        });
      } catch {
        sentinelRef.current = null;
      }
    };

    const release = async () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel) await sentinel.release().catch(() => {});
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && active) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void release();
    };
  }, [active]);
}
