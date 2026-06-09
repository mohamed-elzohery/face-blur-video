"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { useInViewport } from "@/hooks/useInViewport";

export function BeforeAfter({
  label,
  before,
  after,
  beforePoster,
  afterPoster,
}: {
  label: string;
  before: string;
  after: string;
  beforePoster?: string;
  afterPoster?: string;
}) {
  const beforeRef = useRef<HTMLVideoElement>(null);
  const afterRef = useRef<HTMLVideoElement>(null);
  const { ref, inView } = useInViewport<HTMLDivElement>({ threshold: 0.4 });
  const [blocked, setBlocked] = useState(false);

  const playPair = () => {
    const b = beforeRef.current;
    const a = afterRef.current;
    if (!b || !a) return;
    a.currentTime = b.currentTime;
    Promise.all([b.play(), a.play()])
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true));
  };

  const pausePair = () => {
    beforeRef.current?.pause();
    afterRef.current?.pause();
  };

  useEffect(() => {
    if (inView) playPair();
    else pausePair();
  }, [inView]);

  useEffect(() => {
    const b = beforeRef.current;
    const a = afterRef.current;
    if (!b || !a) return;
    const sync = () => {
      if (Math.abs(a.currentTime - b.currentTime) > 0.3) a.currentTime = b.currentTime;
    };
    b.addEventListener("timeupdate", sync);
    return () => b.removeEventListener("timeupdate", sync);
  }, []);

  const toggle = () => {
    if (beforeRef.current?.paused) playPair();
    else pausePair();
  };

  return (
    <div className="sb-ex-pair" ref={ref}>
      <figure className="sb-stage sb-ex-tile">
        <span className="sb-stage__tag warn">Before</span>
        <video
          ref={beforeRef}
          className="sb-stage__video"
          src={before}
          poster={beforePoster}
          muted
          loop
          playsInline
          preload="none"
          aria-label={`${label} — original, unblurred footage`}
        />
      </figure>
      <figure className="sb-stage sb-ex-tile sb-ex-tile--after">
        <span className="sb-stage__tag sb-ex-tag--after">Protected</span>
        <video
          ref={afterRef}
          className="sb-stage__video"
          src={after}
          poster={afterPoster}
          muted
          loop
          playsInline
          preload="none"
          aria-label={`${label} — faces blurred by SmartBlur`}
        />
        {blocked ? (
          <button type="button" className="sb-ex-play" onClick={toggle} aria-label="Play comparison">
            <Play size={22} fill="currentColor" />
          </button>
        ) : null}
      </figure>
    </div>
  );
}
