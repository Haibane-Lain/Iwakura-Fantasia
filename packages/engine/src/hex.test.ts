import { describe, expect, it } from "vitest";
import {
  distance,
  findPath,
  hex,
  hexKey,
  hexToPixel,
  line,
  lineOfSight,
  neighbor,
  neighbors,
  parseHexKey,
  pixelToHex,
  reachable,
  ring,
  spiral,
} from "./hex.js";

describe("hex math", () => {
  it("has six neighbors at distance one", () => {
    const center = hex(3, -2);
    expect(neighbors(center)).toHaveLength(6);
    for (const n of neighbors(center)) expect(distance(center, n)).toBe(1);
    expect(distance(center, neighbor(center, 0))).toBe(1);
  });

  it("is symmetric and satisfies the triangle inequality", () => {
    for (let i = 0; i < 100; i += 1) {
      const a = hex(((i * 7) % 19) - 9, ((i * 13) % 17) - 8);
      const b = hex(((i * 11) % 23) - 11, ((i * 5) % 29) - 14);
      expect(distance(a, b)).toBe(distance(b, a));
      const c = hex(((i * 3) % 11) - 5, ((i * 17) % 13) - 6);
      expect(distance(a, b)).toBeLessThanOrEqual(distance(a, c) + distance(c, b));
    }
  });

  it("round-trips keys", () => {
    const h = hex(-4, 9);
    expect(parseHexKey(hexKey(h))).toEqual(h);
  });

  it("builds rings and spirals", () => {
    const center = hex(0, 0);
    const r2 = ring(center, 2);
    expect(r2).toHaveLength(12);
    expect(new Set(r2.map(hexKey)).size).toBe(12);
    for (const h of r2) expect(distance(center, h)).toBe(2);
    expect(ring(center, 0)).toEqual([center]);
    expect(spiral(center, 2)).toHaveLength(19);
  });

  it("draws inclusive lines with contiguous steps", () => {
    const a = hex(-3, 2);
    const b = hex(4, -1);
    const path = line(a, b);
    expect(path[0]).toEqual(a);
    expect(path.at(-1)).toEqual(b);
    for (let i = 1; i < path.length; i += 1) {
      expect(distance(path[i - 1]!, path[i]!)).toBe(1);
    }
    expect(line(a, a)).toEqual([a]);
  });

  it("round-trips pixel coordinates", () => {
    for (let q = -5; q <= 5; q += 1) {
      for (let r = -5; r <= 5; r += 1) {
        const h = hex(q, r);
        expect(pixelToHex(hexToPixel(h, 32), 32)).toEqual(h);
      }
    }
  });

  it("finds a least-cost path around obstacles", () => {
    const blocked = new Set([hexKey(hex(1, 0)), hexKey(hex(1, -1)), hexKey(hex(0, -1))]);
    const result = findPath(hex(0, 0), hex(2, 0), (h) => (blocked.has(hexKey(h)) ? null : 1));
    expect(result).not.toBeNull();
    expect(result!.cost).toBe(3);
    expect(result!.path.at(-1)).toEqual(hex(2, 0));
    for (const step of result!.path) expect(blocked.has(hexKey(step))).toBe(false);
  });

  it("returns null when the goal is unreachable", () => {
    const result = findPath(hex(0, 0), hex(2, 0), (h) => (h.q === 1 ? null : 1));
    expect(result).toBeNull();
  });

  it("flood fills within a movement budget", () => {
    const reached = reachable(hex(0, 0), 2, () => 1);
    expect(reached.size).toBe(19);
    expect(reached.get(hexKey(hex(2, 0)))?.cost).toBe(2);
    expect(reached.has(hexKey(hex(3, 0)))).toBe(false);
  });

  it("checks line of sight through blocking terrain", () => {
    const blocked = new Set([hexKey(hex(1, 0))]);
    expect(lineOfSight(hex(0, 0), hex(2, 0), (h) => blocked.has(hexKey(h)))).toBe(false);
    expect(lineOfSight(hex(0, 0), hex(0, 2), (h) => blocked.has(hexKey(h)))).toBe(true);
  });
});
