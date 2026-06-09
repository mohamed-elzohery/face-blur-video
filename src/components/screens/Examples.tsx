"use client";

import Link from "next/link";
import { ArrowRight, Baby, Users, Zap } from "lucide-react";
import { BeforeAfter } from "@/components/screens/BeforeAfter";
import { useInViewport } from "@/hooks/useInViewport";

type Case = {
  id: string;
  icon: typeof Zap;
  eyebrow: string;
  title: string;
  body: string;
  base: string;
};

const CASES: Case[] = [
  {
    id: "fast-moving",
    icon: Zap,
    eyebrow: "Frame-by-frame tracking",
    title: "Keeps up with fast motion",
    body: "Skaters, runners, motion blur — SmartBlur locks onto every face frame by frame, even when they move faster than the shutter.",
    base: "/examples/fast-moving",
  },
  {
    id: "multi-face",
    icon: Users,
    eyebrow: "Every face, not just the front row",
    title: "Finds every face in the crowd",
    body: "Group shots, busy streets, packed rooms — each face is detected and blurred independently, so no one slips through.",
    base: "/examples/multi-face",
  },
  {
    id: "children",
    icon: Baby,
    eyebrow: "Private by default",
    title: "Keep family footage private",
    body: "Two kids playing together. Share the moment, not their faces — blurring runs entirely on your device, so the original never leaves it.",
    base: "/examples/children",
  },
];

function CaseSection({ data }: { data: Case }) {
  const { ref, inView } = useInViewport<HTMLElement>({ threshold: 0.15, once: true });
  const Icon = data.icon;
  return (
    <section className="sb-ex__case" ref={ref} data-inview={inView ? "true" : "false"}>
      <div className="sb-ex__case-head">
        <span className="sb-ex__case-icon">
          <Icon size={22} />
        </span>
        <span className="sb-ex__case-eyebrow">{data.eyebrow}</span>
        <h2>{data.title}</h2>
        <p>{data.body}</p>
      </div>
      <BeforeAfter
        label={data.title}
        before={`${data.base}-before.mp4`}
        after={`${data.base}-after.mp4`}
        beforePoster={`${data.base}-before.jpg`}
        afterPoster={`${data.base}-after.jpg`}
      />
    </section>
  );
}

export function Examples() {
  return (
    <div className="sb-ex">
      <h1 className="sr-only">SmartBlur face blur examples — before and after</h1>

      {CASES.map((c) => (
        <CaseSection key={c.id} data={c} />
      ))}

      <section className="sb-ex-cta">
        <h2>Your turn</h2>
        <p>Drop in a video and watch the faces disappear — nothing ever leaves your device.</p>
        <Link className="af-btn af-btn--primary af-btn--lg" href="/">
          <span>Blur your own video</span>
          <span className="af-btn__icon" aria-hidden="true">
            <ArrowRight size={18} />
          </span>
        </Link>
      </section>
    </div>
  );
}
