"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
import { FAQ } from "@/lib/faq";
import { useStage } from "@/lib/stageStore";

export function HomeContent() {
  const stage = useStage();
  if (stage === "active") return null;

  return (
    <section className="sb-seo" aria-label="About SmartBlur">
      <div className="sb-seo__block">
        <h2>How to blur faces in a video</h2>
        <ol className="sb-steps">
          <li>
            <strong>Drop in your video.</strong> MP4, MOV or WebM, any length. It loads straight into
            your browser — nothing is uploaded.
          </li>
          <li>
            <strong>Faces are blurred automatically.</strong> SmartBlur detects and tracks every face
            frame by frame, even fast-moving faces and crowds.
          </li>
          <li>
            <strong>Download your blurred video.</strong> Exported as an MP4 in the original quality —
            free, and with no watermark.
          </li>
        </ol>
      </div>

      <div className="sb-seo__block">
        <h2>Why SmartBlur</h2>
        <ul className="sb-feats">
          <li>
            <strong>100% private.</strong> All processing runs locally on your device, so your video
            never leaves your browser. That makes it GDPR compliant by design.
          </li>
          <li>
            <strong>Completely free.</strong> No sign-up, no credits, no time limit and no watermark.
          </li>
          <li>
            <strong>Automatic &amp; accurate.</strong> Blur multiple faces at once, choose pixelated or
            smooth gaussian blur, adjust the mask, and keep your original audio.
          </li>
        </ul>
      </div>

      <div className="sb-seo__block">
        <h2>Supported formats &amp; browsers</h2>
        <p>
          Import MP4, MOV or WebM and export an MP4 at the original quality. SmartBlur works in the
          latest Chrome, Edge, Safari 26+ and Firefox on desktop.
        </p>
      </div>

      <div className="sb-seo__block">
        <h2>Frequently asked questions</h2>
        <Accordion type="single" collapsible className="sb-acc">
          {FAQ.map((item, i) => (
            <AccordionItem key={item.q} value={`faq-${i}`}>
              <AccordionTrigger>
                <span className="sb-acc__q">{item.q}</span>
              </AccordionTrigger>
              <AccordionContent>
                <p className="sb-acc__a">{item.a}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
