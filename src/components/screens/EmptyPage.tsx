"use client";

import { ArrowLeft, Clapperboard, LifeBuoy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";

const PAGES = {
  examples: {
    Icon: Clapperboard,
    title: "Examples",
    body: "Before / after sample clips are coming soon.",
  },
  features: {
    Icon: Sparkles,
    title: "Features",
    body: "A deeper tour of how SmartBlur works is on the way.",
  },
  support: {
    Icon: LifeBuoy,
    title: "Support",
    body: "Help docs and contact options are coming soon.",
  },
} as const;

export function EmptyPage({
  which,
  onHome,
}: {
  which: keyof typeof PAGES;
  onHome: () => void;
}) {
  const { Icon, title, body } = PAGES[which];
  return (
    <div className="sb-empty">
      <span className="sb-empty__icon">
        <Icon size={28} />
      </span>
      <h2>{title}</h2>
      <p>{body}</p>
      <div className="sb-empty__actions">
        <Button variant="outline" iconLeft={<ArrowLeft size={16} />} onClick={onHome}>
          Back to blur videos
        </Button>
      </div>
    </div>
  );
}
