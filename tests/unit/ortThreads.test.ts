import { describe, expect, it } from "vitest";
import { THREAD_CAP, pickNumThreads } from "@/worker/ortThreads";

describe("pickNumThreads", () => {
  it("returns 1 when not cross-origin isolated, regardless of cores", () => {
    expect(pickNumThreads(false, 16, 8)).toBe(1);
    expect(pickNumThreads(false, 1, 8)).toBe(1);
  });

  it("caps at the provided cap when cores exceed it", () => {
    expect(pickNumThreads(true, 16, 8)).toBe(8);
    expect(pickNumThreads(true, 16, 4)).toBe(4);
  });

  it("uses available cores when below the cap", () => {
    expect(pickNumThreads(true, 2, 8)).toBe(2);
    expect(pickNumThreads(true, 6, 8)).toBe(6);
  });

  it("falls back to a sane default when cores are unknown", () => {
    expect(pickNumThreads(true, 0, 8)).toBe(4);
    expect(pickNumThreads(true, Number.NaN, 8)).toBe(4);
  });

  it("defaults the cap to THREAD_CAP", () => {
    expect(pickNumThreads(true, 999)).toBe(THREAD_CAP);
  });
});
