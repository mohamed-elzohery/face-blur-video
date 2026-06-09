"use client";

import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useStage } from "@/lib/stageStore";

export function HomeTrust() {
  const stage = useStage();
  if (stage === "active") return null;

  return (
    <div className="sb-trust">
      <Badge variant="success" icon={<ShieldCheck size={12} />}>
        GDPR compliant
      </Badge>
      <Badge variant="outline">Free</Badge>
      <Badge variant="outline">No upload</Badge>
      <Badge variant="outline">No sign-up</Badge>
      <Badge variant="outline">No watermark</Badge>
      <Badge variant="outline">No time limit</Badge>
    </div>
  );
}
