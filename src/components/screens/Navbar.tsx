"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, Lock, Moon, Shield, Sun } from "lucide-react";
import { Brand } from "@/components/ui/Brand";
import { IconButton } from "@/components/ui/IconButton";

const NAV: { href: string; label: string; icon: typeof Shield }[] = [
  { href: "/", label: "Blur videos", icon: Shield },
  { href: "/examples", label: "Examples", icon: Clapperboard },
];

export function Navbar({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  const pathname = usePathname();
  return (
    <header className="sb-nav">
      <Link className="sb-nav__brand" href="/" aria-label="SmartBlur home">
        <Brand />
      </Link>
      <nav className="sb-nav__links" aria-label="Primary">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className="sb-nav__link"
              data-active={active ? "true" : "false"}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={16} />
              <span>{n.label}</span>
            </Link>
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
