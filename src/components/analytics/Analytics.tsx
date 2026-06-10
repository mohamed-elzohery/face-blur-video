"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";
import { useConsent } from "@/lib/consent";
import { ConsentBanner } from "./ConsentBanner";

const LOAD_GA = process.env.NODE_ENV === "production";

export function Analytics() {
  const consent = useConsent();
  return (
    <>
      {consent === "unset" ? <ConsentBanner /> : null}
      {LOAD_GA && consent === "granted" ? <GoogleAnalytics gaId={GA_MEASUREMENT_ID} /> : null}
    </>
  );
}
