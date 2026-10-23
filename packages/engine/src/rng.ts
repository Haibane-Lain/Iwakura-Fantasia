export interface RngSnapshot {
  seed: string;
  state: number;
  cursor: number;
}

export type AdvantageMode = "normal" | "advantage" | "disadvantage";

/** FNV-1a 32-bit hash. Deterministic across platforms. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Mulberry32 PRNG. Fast, seedable, and good enough for game rules.
 * State is explicit so it can be serialized with a save.
 */
export class Rng {
  private state: number;
  private cursor = 0;

  constructor(
    readonly seed: string,
    state?: number,
  ) {
    this.state = state ?? (hashString(seed) || 0x9e3779b9);
  }

  static fromSnapshot(snapshot: RngSnapshot): Rng {
    const rng = new Rng(snapshot.seed, snapshot.state);
    rng.cursor = snapshot.cursor;
    return rng;
  }

  snapshot(): RngSnapshot {
    return { seed: this.seed, state: this.state, cursor: this.cursor };
  }

  /** Raw uint32. */
  nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.cursor += 1;
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, maxExclusive). */
  int(min: number, maxExclusive: number): number {
    if (maxExclusive <= min) throw new Error("int() requires maxExclusive > min");
    return min + Math.floor(this.next() * (maxExclusive - min));
  }

  /** Integer in [min, max] inclusive. */
  intInclusive(min: number, max: number): number {
    return this.int(min, max + 1);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("pick() requires at least one item");
    return items[this.int(0, items.length)]!;
  }

  pickWeighted<T>(items: readonly T[], weight: (item: T) => number): T {
    if (items.length === 0) throw new Error("pickWeighted() requires at least one item");
    const weights = items.map((item) => Math.max(0, weight(item)));
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (total <= 0) return this.pick(items);
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i += 1) {
      roll -= weights[i]!;
      if (roll < 0) return items[i]!;
    }
    return items[items.length - 1]!;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i + 1);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }

  /** Deterministic child stream, useful for per-region generation. */
  derive(label: string): Rng {
    return new Rng(`${this.seed}:${label}:${this.cursor}`);
  }

  roll(sides: number): number {
    return this.intInclusive(1, sides);
  }

  dice(count: number, sides: number): number {
    let total = 0;
    for (let i = 0; i < count; i += 1) total += this.roll(sides);
    return total;
  }

  d20(mode: AdvantageMode = "normal"): number {
    const first = this.roll(20);
    if (mode === "normal") return first;
    const second = this.roll(20);
    return mode === "advantage" ? Math.max(first, second) : Math.min(first, second);
  }
}

export function createRng(seed: string): Rng {
  return new Rng(seed);
}

export interface DiceExpression {
  count: number;
  sides: number;
  modifier?: number;
}

export function rollDamage(rng: Rng, expression: DiceExpression): number {
  return Math.max(0, rng.dice(expression.count, expression.sides) + (expression.modifier ?? 0));
}

export function parseDice(expression: string): DiceExpression {
  const match = /^(\d+)d(\d+)([+-]\d+)?$/i.exec(expression.trim());
  if (!match) throw new Error(`Invalid dice expression: ${expression}`);
  return {
    count: Number(match[1]),
    sides: Number(match[2]),
    modifier: match[3] ? Number(match[3]) : 0,
  };
}
