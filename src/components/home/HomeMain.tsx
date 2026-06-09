"use client";

import { useStage } from "@/lib/stageStore";

export function HomeMain({ children }: { children: React.ReactNode }) {
  const stage = useStage();
  return (
    <main className="sb-home" data-stage={stage}>
      {children}
    </main>
  );
}
