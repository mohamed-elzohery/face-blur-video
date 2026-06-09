import type { Metadata } from "next";
import { Examples } from "@/components/screens/Examples";
import { JsonLd } from "@/components/seo/JsonLd";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Free Face Blur Examples — Before & After",
  description:
    "See SmartBlur blur faces in real videos — fast motion, crowds and family footage. Free before-and-after clips, processed 100% in your browser. No upload.",
  alternates: { canonical: "/examples" },
  openGraph: {
    title: "Free face blur examples — before & after",
    description:
      "Real clips with every face blurred entirely in your browser — fast motion, crowds and family footage. Free, no upload.",
    url: "/examples",
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, type: "image/png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free face blur examples — before & after",
    description: "Real clips with every face blurred entirely in your browser. Free, no upload.",
    images: ["/opengraph-image"],
  },
};

const UPLOAD_DATE = "2026-06-01";

const CLIPS = [
  {
    base: "fast-moving",
    name: "Face blur example: keeps up with fast motion",
    description:
      "Skaters, runners, motion blur — SmartBlur locks onto every face frame by frame, even when they move faster than the shutter.",
  },
  {
    base: "multi-face",
    name: "Face blur example: every face in the crowd",
    description:
      "Group shots, busy streets, packed rooms — each face is detected and blurred independently, so no one slips through.",
  },
  {
    base: "children",
    name: "Face blur example: keep family footage private",
    description:
      "Two kids playing together. Share the moment, not their faces — blurring runs entirely in your browser, so the original never leaves your device.",
  },
];

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Examples", item: absoluteUrl("/examples") },
  ],
};

const videoLd = CLIPS.map((c) => ({
  "@context": "https://schema.org",
  "@type": "VideoObject",
  name: c.name,
  description: c.description,
  thumbnailUrl: absoluteUrl(`/examples/${c.base}-after.jpg`),
  contentUrl: absoluteUrl(`/examples/${c.base}-after.mp4`),
  uploadDate: UPLOAD_DATE,
  publisher: {
    "@type": "Organization",
    name: SITE_NAME,
    logo: { "@type": "ImageObject", url: absoluteUrl("/logo-mark-512.png") },
  },
}));

export default function ExamplesPage() {
  return (
    <main className="sb-main">
      <div className="sb-stagewrap">
        <Examples />
      </div>
      <JsonLd data={[breadcrumbLd, ...videoLd]} />
    </main>
  );
}
