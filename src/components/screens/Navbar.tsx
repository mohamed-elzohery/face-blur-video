"use client";

import { Clapperboard, LifeBuoy, Lock, Moon, Shield, Sparkles, Sun } from "lucide-react";
import { Brand } from "@/components/ui/Brand";
import { IconButton } from "@/components/ui/IconButton";

export type Tab = "home" | "examples" | "features" | "support";

const NAV: { id: Tab; label: string; icon: typeof Shield; soon?: boolean }[] = [
  { id: "home", label: "Blur videos", icon: Shield },
  { id: "examples", label: "Examples", icon: Clapperboard, soon: true },
  { id: "features", label: "Features", icon: Sparkles, soon: true },
  { id: "support", label: "Support", icon: LifeBuoy, soon: true },
];

export function Navbar({
  tab,
  onTab,
  dark,
  onToggleTheme,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  dark: boolean;
  onToggleTheme: () => void;
}) {
  return (
    <header className="sb-nav">
      <button className="sb-nav__brand" onClick={() => onTab("home")} aria-label="SmartBlur home">
        <Brand />
      </button>
      <nav className="sb-nav__links" aria-label="Primary">
        {NAV.map((n) => {
          const Icon = n.icon;
          return (
            <button
              key={n.id}
              className="sb-nav__link"
              data-active={tab === n.id ? "true" : "false"}
              aria-current={tab === n.id ? "page" : undefined}
              onClick={() => onTab(n.id)}
            >
              <Icon size={16} />
              <span>{n.label}</span>
              {n.soon ? <span className="sb-nav__soon">Soon</span> : null}
            </button>
          );
        })}
      </nav>
      <div className="sb-nav__spacer" />
      <div className="sb-nav__right">
        <span className="sb-nav__privacy">
          <Lock size={15} />
          <span>Runs 100% on your device</span>
        </span>
        <IconButton label="Toggle theme" variant="outline" onClick={onToggleTheme}>
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </IconButton>
      </div>
    </header>
  );
}
