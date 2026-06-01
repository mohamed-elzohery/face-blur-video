import { describe, expect, it } from "vitest";
import { decodeYuNet, nms } from "@/lib/model/yunet-decode";

function emptyStride8(inW: number, inH: number) {
  const cols = inW / 8;
  const rows = inH / 8;
  const n = cols * rows;
  return {
    cls_8: new Float32Array(n),
    obj_8: new Float32Array(n),
    bbox_8: new Float32Array(n * 4),
  };
}

describe("decodeYuNet", () => {
  it("decodes a single anchor into an upright box", () => {
    const inW = 64;
    const inH = 64;
    const o = emptyStride8(inW, inH);
    const cols = inW / 8;
    const idx = 4 * cols + 4;
    o.cls_8[idx] = 1;
    o.obj_8[idx] = 1;
    o.bbox_8[idx * 4 + 0] = 0;
    o.bbox_8[idx * 4 + 1] = 0;
    o.bbox_8[idx * 4 + 2] = 0;
    o.bbox_8[idx * 4 + 3] = 0;

    const boxes = decodeYuNet(o, inW, inH, 0.5);
    expect(boxes.length).toBe(1);
    expect(boxes[0].score).toBeCloseTo(1, 5);
    expect(boxes[0].x).toBeCloseTo(28, 5);
    expect(boxes[0].y).toBeCloseTo(28, 5);
    expect(boxes[0].w).toBeCloseTo(8, 5);
    expect(boxes[0].h).toBeCloseTo(8, 5);
  });

  it("filters out anchors below the score threshold", () => {
    const inW = 64;
    const inH = 64;
    const o = emptyStride8(inW, inH);
    o.cls_8[10] = 0.5;
    o.obj_8[10] = 0.5;
    expect(decodeYuNet(o, inW, inH, 0.6).length).toBe(0);
    expect(decodeYuNet(o, inW, inH, 0.4).length).toBe(1);
  });

  it("uses sqrt(cls*obj) as the score", () => {
    const inW = 64;
    const inH = 64;
    const o = emptyStride8(inW, inH);
    o.cls_8[0] = 0.81;
    o.obj_8[0] = 0.49;
    const boxes = decodeYuNet(o, inW, inH, 0.1);
    expect(boxes[0].score).toBeCloseTo(Math.sqrt(0.81 * 0.49), 5);
  });
});

describe("nms", () => {
  it("removes lower-scoring overlapping boxes", () => {
    const boxes = [
      { x: 0, y: 0, w: 10, h: 10, score: 0.9 },
      { x: 1, y: 1, w: 10, h: 10, score: 0.6 },
    ];
    const kept = nms(boxes, 0.3);
    expect(kept.length).toBe(1);
    expect(kept[0].score).toBe(0.9);
  });

  it("keeps disjoint boxes", () => {
    const boxes = [
      { x: 0, y: 0, w: 10, h: 10, score: 0.9 },
      { x: 50, y: 50, w: 10, h: 10, score: 0.8 },
    ];
    expect(nms(boxes, 0.3).length).toBe(2);
  });
});
