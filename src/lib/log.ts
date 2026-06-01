export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  msg: string;
  t: number;
}

const RING_SIZE = 250;

export class RingLogger {
  private entries: LogEntry[] = [];
  private listeners = new Set<(e: LogEntry) => void>();

  log(level: LogLevel, msg: string): void {
    const entry: LogEntry = { level, msg, t: Date.now() };
    this.entries.push(entry);
    if (this.entries.length > RING_SIZE) this.entries.shift();
    for (const fn of this.listeners) fn(entry);
    const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
    sink(`[face-blur] ${msg}`);
  }

  info(msg: string): void {
    this.log("info", msg);
  }

  warn(msg: string): void {
    this.log("warn", msg);
  }

  error(msg: string): void {
    this.log("error", msg);
  }

  all(): LogEntry[] {
    return [...this.entries];
  }

  subscribe(fn: (e: LogEntry) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}

export const logger = new RingLogger();
