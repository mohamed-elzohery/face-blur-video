import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Shell } from "@/components/Shell";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  metadataBase: new URL("https://smartblur.com"),
  title: "SmartBlur — private, on-device video face blurring",
  description:
    "Blur faces in any video 100% on your device. Nothing is uploaded, no sign-up, no credits, no time limit. GDPR compliant and free.",
  applicationName: "SmartBlur",
  keywords: [
    "blur faces",
    "video anonymization",
    "privacy",
    "on-device",
    "GDPR",
    "face blur",
  ],
  openGraph: {
    title: "SmartBlur — private, on-device video face blurring",
    description:
      "Blur faces in any video 100% on your device. Nothing is uploaded. GDPR compliant and free.",
    url: "https://smartblur.com",
    siteName: "SmartBlur",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartBlur — private, on-device video face blurring",
    description: "Blur faces in any video 100% on your device. Nothing is uploaded.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
