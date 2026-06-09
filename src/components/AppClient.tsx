"use client";

import dynamic from "next/dynamic";

const App = dynamic(() => import("@/components/App"), { ssr: false });

export function AppClient() {
  return <App />;
}
