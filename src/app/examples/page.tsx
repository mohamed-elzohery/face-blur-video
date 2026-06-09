import type { Metadata } from "next";
import { Examples } from "@/components/screens/Examples";

export const metadata: Metadata = {
  title: "Examples — SmartBlur face blur, before & after",
  description:
    "Watch SmartBlur blur faces in real videos: fast motion, crowds, and family footage. Before-and-after clips, processed 100% on your device — nothing uploaded.",
  alternates: { canonical: "/examples" },
  openGraph: {
    title: "SmartBlur examples — face blur before & after",
    description:
      "Real clips with every face blurred entirely on-device — fast motion, crowds, and family footage.",
    url: "/examples",
    siteName: "SmartBlur",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartBlur examples — face blur before & after",
    description: "Real clips with every face blurred entirely on-device.",
  },
};

export default function ExamplesPage() {
  return (
    <main className="sb-main">
      <div className="sb-stagewrap">
        <Examples />
      </div>
    </main>
  );
}
