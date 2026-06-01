import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FaceBlur — private, in-browser video face blurring",
  description:
    "Blur faces in your videos entirely in your browser. No uploads, no servers — your footage never leaves your device.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
