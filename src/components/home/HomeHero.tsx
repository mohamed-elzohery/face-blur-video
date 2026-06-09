import Link from "next/link";
import { Clapperboard, Lock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export function HomeHero() {
  return (
    <section className="sb-hero">
      <span className="sb-hero__eyebrow">
        <Lock size={14} />
        Your video never leaves your device
      </span>
      <h1 className="sb-hero__title">Blur faces in any video — free</h1>
      <p className="sb-hero__sub">
        Free, automatic face blur that runs entirely in your browser. No upload, no sign-up and no
        watermark — SmartBlur finds and blurs every face, even in crowded, fast-moving footage.
      </p>
      <Link href="/examples" className="sb-hero__examples">
        <Clapperboard size={16} />
        <span>See before &amp; after examples</span>
      </Link>
      <div className="sb-hero__trust">
        <Badge variant="success" icon={<ShieldCheck size={12} />}>
          GDPR compliant
        </Badge>
        <Badge variant="outline">Free</Badge>
        <Badge variant="outline">No upload</Badge>
        <Badge variant="outline">No sign-up</Badge>
        <Badge variant="outline">No watermark</Badge>
        <Badge variant="outline">No time limit</Badge>
      </div>
    </section>
  );
}
