import type { Metadata } from "next";
import { AppClient } from "@/components/AppClient";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeContent } from "@/components/home/HomeContent";
import { JsonLd } from "@/components/seo/JsonLd";
import { FAQ } from "@/lib/faq";
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const webAppLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web browser",
  browserRequirements: "Requires a modern desktop browser: Chrome, Edge, Safari 26+ or Firefox.",
  description: DEFAULT_DESCRIPTION,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Automatic face detection and blurring",
    "Runs 100% in your browser — no upload",
    "Blurs multiple and fast-moving faces",
    "Pixelated or gaussian blur, adjustable",
    "Imports MP4, MOV and WebM",
    "Exports MP4 with no watermark",
    "Free with no sign-up or time limit",
    "GDPR compliant",
  ],
  image: absoluteUrl("/logo-mark-512.png"),
  inLanguage: "en",
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function Page() {
  return (
    <main className="sb-home">
      <HomeHero />
      <div className="sb-home__stage">
        <AppClient />
      </div>
      <HomeContent />
      <JsonLd data={[webAppLd, faqLd]} />
    </main>
  );
}
