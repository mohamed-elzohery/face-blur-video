export const SITE_URL = "https://smart-blur.com";
export const SITE_NAME = "SmartBlur";
export const BRAND_MAGENTA = "#a800b7";

export const DEFAULT_TITLE =
  "Free Face Blur for Video — No Upload, 100% Private | SmartBlur";

export const DEFAULT_DESCRIPTION =
  "Blur faces in any video for free — automatic, right in your browser. No upload, no sign-up, no watermark, no time limit. 100% private and GDPR compliant.";

export const KEYWORDS = [
  "blur faces in video",
  "free face blur",
  "blur faces in video free",
  "blur faces online free",
  "face blur no upload",
  "blur faces in browser",
  "blur faces without uploading",
  "no watermark face blur",
  "anonymize faces in video",
  "GDPR video anonymization",
  "automatic face blur",
];

export function absoluteUrl(path = "/"): string {
  return new URL(path, SITE_URL).toString();
}
