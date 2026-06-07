import { describe, expect, it } from "vitest";
import { shouldReEmbed, type ReEmbedArgs } from "@/worker/embedGate";
import type { Box } from "@/lib/types";

const baseBox: Box = { x: 0.4, y: 0.4, w: 0.1, h: 0.1 };

function args(overrides: Partial<ReEmbedArgs>): ReEmbedArgs {
  return {
    hits: 10,
    trackEmbedCount: 5,
    lastEmbedBox: baseBox,
    currentBox: baseBox,
    framesSinceLastEmbed: 2,
    ...overrides,
  };
}

describe("shouldReEmbed", () => {
  it("embeds a track that was never embedded", () => {
    expect(shouldReEmbed(args({ lastEmbedBox: undefined }))).toBe(true);
  });

  it("embeds during the bootstrap window", () => {
    expect(shouldReEmbed(args({ hits: 2 }))).toBe(true);
  });

  it("embeds until the track has the minimum number of embeds", () => {
    expect(shouldReEmbed(args({ trackEmbedCount: 2 }))).toBe(true);
  });

  it("embeds periodically", () => {
    expect(shouldReEmbed(args({ framesSinceLastEmbed: 5 }))).toBe(true);
  });

  it("embeds when the box moved enough to drop IoU", () => {
    expect(shouldReEmbed(args({ currentBox: { x: 0.45, y: 0.4, w: 0.1, h: 0.1 } }))).toBe(true);
  });

  it("embeds on a center shift even when IoU stays high (large boxes)", () => {
    const last: Box = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
    const cur: Box = { x: 0.23, y: 0.2, w: 0.6, h: 0.6 };
    expect(shouldReEmbed(args({ lastEmbedBox: last, currentBox: cur }))).toBe(true);
  });

  it("skips a stable, well-covered, recently-embedded near-static face", () => {
    expect(shouldReEmbed(args({}))).toBe(false);
  });
});
