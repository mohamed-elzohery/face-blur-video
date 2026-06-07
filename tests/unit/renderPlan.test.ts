import { describe, expect, it } from "vitest";
import {
  keepSetFromSelection,
  sameSource,
  shouldBlurEntry,
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

describe("shouldBlurEntry", () => {
  it("keeps a face whose identity is selected", () => {
    expect(shouldBlurEntry(1, keepSetFromSelection([1]))).toBe(false);
  });
  it("blurs a face whose identity is not selected", () => {
    expect(shouldBlurEntry(2, keepSetFromSelection([1]))).toBe(true);
  });
  it("blurs an UNKNOWN face (privacy-first)", () => {
    expect(shouldBlurEntry(UNKNOWN_IDENTITY, keepSetFromSelection([1, 2]))).toBe(true);
  });
  it("blurs everyone when nothing is selected", () => {
    const keep = keepSetFromSelection([]);
    expect(shouldBlurEntry(1, keep)).toBe(true);
    expect(shouldBlurEntry(2, keep)).toBe(true);
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
