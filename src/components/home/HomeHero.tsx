"use client";

import Link from "next/link";
import { Clapperboard, Lock } from "lucide-react";
import { useStage } from "@/lib/stageStore";

export function HomeHero() {
  const stage = useStage();
  if (stage === "active") return null;

  return (
    <section className="sb-hero">
      <span className="sb-hero__eyebrow">
        <Lock size={14} />
        Your video never leaves your device
      </span>
      <h1 className="sb-hero__title">Blur faces in any video free</h1>
      <p className="sb-hero__sub">
        Free, automatic, in-browser face blur,no upload, no sign-up, no watermark.
      </p>
      <Link href="/examples" className="sb-hero__examples">
        <Clapperboard size={16} />
        <span>See before &amp; after examples</span>
      </Link>
    </section>
  );
}
