import { describe, expect, it } from "vitest";
import { createRng, parseDice, Rng, rollDamage } from "./rng.js";

describe("rng", () => {
  it("is deterministic for the same seed", () => {
    const a = createRng("iwakura");
    const b = createRng("iwakura");
    const seqA = Array.from({ length: 20 }, () => a.nextUint32());
    const seqB = Array.from({ length: 20 }, () => b.nextUint32());
    expect(seqA).toEqual(seqB);
    expect(a.snapshot().cursor).toBe(20);
  });

  it("resumes from a snapshot", () => {
    const rng = createRng("save-me");
    for (let i = 0; i < 12; i += 1) rng.next();
    const snapshot = rng.snapshot();
    const expected = Array.from({ length: 8 }, () => rng.nextUint32());
    const restored = Rng.fromSnapshot(snapshot);
    const actual = Array.from({ length: 8 }, () => restored.nextUint32());
    expect(actual).toEqual(expected);
  });

  it("produces values in range", () => {
    const rng = createRng("range");
    for (let i = 0; i < 1000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const n = rng.intInclusive(1, 6);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it("supports advantage and disadvantage", () => {
    for (let i = 0; i < 200; i += 1) {
      const normal = createRng(`normal-${i}`).d20();
      expect(normal).toBeGreaterThanOrEqual(1);
      expect(normal).toBeLessThanOrEqual(20);
    }

    const seed = "paired-d20";
    const advantageSource = createRng(seed);
    const expectedAdvantage = Math.max(advantageSource.roll(20), advantageSource.roll(20));
    expect(createRng(seed).d20("advantage")).toBe(expectedAdvantage);

    const disadvantageSource = createRng(seed);
    const expectedDisadvantage = Math.min(disadvantageSource.roll(20), disadvantageSource.roll(20));
    expect(createRng(seed).d20("disadvantage")).toBe(expectedDisadvantage);
  });

  it("shuffles without losing items", () => {
    const rng = createRng("shuffle");
    const input = ["a", "b", "c", "d", "e"];
    const output = rng.shuffle(input);
    expect(output).toHaveLength(input.length);
    expect([...output].sort()).toEqual([...input].sort());
    expect(input).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("parses and rolls dice", () => {
    expect(parseDice("2d6+3")).toEqual({ count: 2, sides: 6, modifier: 3 });
    const rng = createRng("dice");
    for (let i = 0; i < 100; i += 1) {
      const value = rollDamage(rng, parseDice("2d6+3"));
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(15);
    }
  });

  it("derives independent deterministic streams", () => {
    const rng = createRng("world");
    const first = rng.derive("region-a").nextUint32();
    const second = createRng("world").derive("region-a").nextUint32();
    expect(first).toBe(second);
    expect(rng.derive("region-b").nextUint32()).not.toBe(first);
  });
});
