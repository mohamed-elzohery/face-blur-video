import type { CapabilityReport } from "@/lib/types";

export function CapabilityBadge({ report }: { report: CapabilityReport }) {
  return (
    <div className="cap-badge" role="status" aria-label="Browser capabilities">
      <span className={`chip chip-${report.blurBackend ?? "none"}`}>
        Blur · {report.blurBackend === "webgpu" ? "WebGPU" : "WebGL2"}
      </span>
      <span className="chip">Codec · {report.videoCodec === "avc1.4d0034" ? "H.264 Main" : "H.264 Baseline"}</span>
      <span className="chip">{report.fileSystemAccess ? "Save to disk" : "Download"}</span>
    </div>
  );
}
