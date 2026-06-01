import type { CapabilityReport } from "@/lib/types";

export function UnsupportedNotice({ report }: { report: CapabilityReport }) {
  return (
    <div className="notice notice-error" role="alert">
      <h2>This browser can&rsquo;t run the tool</h2>
      <p>
        Face blurring runs entirely on your device using modern browser APIs. For the best
        experience, open this page in an up-to-date{" "}
        <strong>Chrome</strong>, <strong>Edge</strong>, <strong>Safari&nbsp;26+</strong>, or{" "}
        <strong>Firefox (desktop)</strong>.
      </p>
      {report.reasons.length > 0 && (
        <ul>
          {report.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
