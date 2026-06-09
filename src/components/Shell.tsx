"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/screens/Navbar";

export function Shell({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <div className="sb-app">
      <Navbar dark={dark} onToggleTheme={() => setDark((d) => !d)} />
      {children}
    </div>
  );
}
