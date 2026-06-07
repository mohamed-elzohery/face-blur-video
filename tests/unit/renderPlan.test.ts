import { describe, expect, it } from "vitest";
import {
  keepSetFromSelection,
  sameSource,
  shouldBlur,
  sourceIdentity,
  UNKNOWN_IDENTITY,
  type SourceIdentity,
} from "@/worker/renderPlan";

function file(name: string, size: number, lastModified: number): File {
  return { name, size, lastModified } as unknown as File;
}

describe("keepSetFromSelection", () => {
  it("builds a set from selected ids", () => {
    expect([...keepSetFromSelection([1, 3, 3])].sort()).toEqual([1, 3]);
  });
  it("is empty for no selection", () => {
    expect(keepSetFromSelection([]).size).toBe(0);
  });
});

describe("shouldBlur", () => {
  const map = new Map<number, number>([
    [10, 1],
    [11, 2],
    [12, UNKNOWN_IDENTITY],
  ]);

  it("keeps a track whose identity is selected", () => {
    expect(shouldBlur(10, map, keepSetFromSelection([1]))).toBe(false);
  });
  it("blurs a track whose identity is not selected", () => {
    expect(shouldBlur(11, map, keepSetFromSelection([1]))).toBe(true);
  });
  it("blurs an UNKNOWN track (privacy-first)", () => {
    expect(shouldBlur(12, map, keepSetFromSelection([1, 2]))).toBe(true);
  });
  it("blurs a track absent from the map (privacy-first)", () => {
    expect(shouldBlur(99, map, keepSetFromSelection([1, 2]))).toBe(true);
  });
  it("blurs everyone when nothing is selected", () => {
    const keep = keepSetFromSelection([]);
    expect(shouldBlur(10, map, keep)).toBe(true);
    expect(shouldBlur(11, map, keep)).toBe(true);
  });
});

describe("sourceIdentity / sameSource", () => {
  it("extracts name, size, lastModified", () => {
    expect(sourceIdentity(file("a.mp4", 123, 456))).toEqual({
      name: "a.mp4",
      size: 123,
      lastModified: 456,
    });
  });
  it("matches identical sources and rejects different ones", () => {
    const a: SourceIdentity = { name: "a.mp4", size: 1, lastModified: 2 };
    expect(sameSource(a, { ...a })).toBe(true);
    expect(sameSource(a, { ...a, size: 9 })).toBe(false);
    expect(sameSource(a, { ...a, name: "b.mp4" })).toBe(false);
    expect(sameSource(a, { ...a, lastModified: 9 })).toBe(false);
  });
});
