export type FaqItem = { q: string; a: string };

export const FAQ: FaqItem[] = [
  {
    q: "Is SmartBlur free?",
    a: "Yes. SmartBlur is completely free to use — no sign-up, no credits, no time limit, and no watermark on your blurred video.",
  },
  {
    q: "Do you upload my video?",
    a: "No. Your video is never uploaded. SmartBlur runs 100% in your browser, so your footage never leaves your device.",
  },
  {
    q: "Does it blur faces automatically?",
    a: "Yes. SmartBlur detects and blurs faces automatically, frame by frame — including multiple faces and fast-moving faces in crowded scenes.",
  },
  {
    q: "What video formats are supported?",
    a: "You can import MP4, MOV, or WebM videos of any length. SmartBlur exports an MP4 in the original quality, with no frames dropped.",
  },
  {
    q: "Is SmartBlur GDPR compliant?",
    a: "Yes. Because nothing is uploaded or stored on a server and all processing happens locally on your device, there is no personal data to share.",
  },
  {
    q: "Will the blurred video have a watermark?",
    a: "No. There is no watermark and no quality loss — you get a clean MP4 at the original resolution.",
  },
  {
    q: "Which browsers does SmartBlur work in?",
    a: "It works in the latest Chrome, Edge, Safari 26+, and Firefox on desktop, which support the in-browser video and GPU APIs it relies on.",
  },
  {
    q: "Can I blur faces without an internet connection?",
    a: "After your first visit the on-device model is cached, so blurring runs locally without sending anything to a server.",
  },
];
