export interface Hex {
  readonly q: number;
  readonly r: number;
}

export interface CubeHex extends Hex {
  readonly s: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Axial directions for a pointy-top hex grid. */
export const HEX_DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const HEX_ORIGIN: Hex = { q: 0, r: 0 };

export function hex(q: number, r: number): Hex {
  return { q, r };
}

export function hexKey(h: Hex): string {
  return `${h.q},${h.r}`;
}

export function parseHexKey(key: string): Hex {
  const [q, r] = key.split(",").map(Number);
  if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) {
    throw new Error(`Invalid hex key: ${key}`);
  }
  return { q, r };
}

export function toCube(h: Hex): CubeHex {
  return { q: h.q, r: h.r, s: -h.q - h.r };
}

export function fromCube(c: CubeHex): Hex {
  return { q: c.q, r: c.r };
}

export function add(a: Hex, b: Hex): Hex {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function subtract(a: Hex, b: Hex): Hex {
  return { q: a.q - b.q, r: a.r - b.r };
}

export function scale(a: Hex, factor: number): Hex {
  return { q: a.q * factor, r: a.r * factor };
}

export function multiply(a: Hex, factor: number): Hex {
  return scale(a, factor);
}

export function distance(a: Hex, b: Hex): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

export function neighbor(h: Hex, direction: number): Hex {
  const d = HEX_DIRECTIONS[((direction % 6) + 6) % 6];
  if (!d) throw new Error("Invalid direction");
  return add(h, d);
}

export function neighbors(h: Hex): Hex[] {
  return HEX_DIRECTIONS.map((d) => add(h, d));
}

export function ring(center: Hex, radius: number): Hex[] {
  if (radius <= 0) return radius === 0 ? [center] : [];
  const results: Hex[] = [];
  let cursor = add(center, scale(HEX_DIRECTIONS[4]!, radius));
  for (let i = 0; i < 6; i += 1) {
    const direction = HEX_DIRECTIONS[i]!;
    for (let step = 0; step < radius; step += 1) {
      results.push(cursor);
      cursor = add(cursor, direction);
    }
  }
  return results;
}

export function spiral(center: Hex, radius: number): Hex[] {
  const results: Hex[] = [];
  for (let r = 0; r <= radius; r += 1) {
    results.push(...ring(center, r));
  }
  return results;
}

export function range(center: Hex, radius: number): Hex[] {
  return spiral(center, radius);
}

export function cubeLerp(a: Hex, b: Hex, t: number): { q: number; r: number; s: number } {
  const ca = toCube(a);
  const cb = toCube(b);
  return {
    q: ca.q + (cb.q - ca.q) * t,
    r: ca.r + (cb.r - ca.r) * t,
    s: ca.s + (cb.s - ca.s) * t,
  };
}

export function cubeRound(c: { q: number; r: number; s: number }): Hex {
  let q = Math.round(c.q);
  let r = Math.round(c.r);
  let s = Math.round(c.s);
  const dq = Math.abs(q - c.q);
  const dr = Math.abs(r - c.r);
  const ds = Math.abs(s - c.s);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  else s = -q - r;
  return { q, r };
}

/** Hexes crossed by a straight line, inclusive of both endpoints. */
export function line(a: Hex, b: Hex): Hex[] {
  const n = distance(a, b);
  if (n === 0) return [a];
  const results: Hex[] = [];
  for (let i = 0; i <= n; i += 1) {
    results.push(cubeRound(cubeLerp(a, b, i / n)));
  }
  return dedupe(results);
}

export function lineOfSight(a: Hex, b: Hex, isBlocked: (h: Hex) => boolean): boolean {
  const path = line(a, b);
  for (let i = 1; i < path.length - 1; i += 1) {
    if (isBlocked(path[i]!)) return false;
  }
  return true;
}

export function dedupe(hexes: readonly Hex[]): Hex[] {
  const seen = new Set<string>();
  const out: Hex[] = [];
  for (const h of hexes) {
    const key = hexKey(h);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

export function hexToPixel(h: Hex, size: number): Point {
  return {
    x: size * (Math.sqrt(3) * h.q + (Math.sqrt(3) / 2) * h.r),
    y: size * (3 / 2) * h.r,
  };
}

export function pixelToHex(p: Point, size: number): Hex {
  const q = ((Math.sqrt(3) / 3) * p.x - (1 / 3) * p.y) / size;
  const r = ((2 / 3) * p.y) / size;
  return cubeRound({ q, r, s: -q - r });
}

export function cornerOffset(corner: number, size: number): Point {
  const angle = (Math.PI / 180) * (60 * corner - 30);
  return { x: size * Math.cos(angle), y: size * Math.sin(angle) };
}

export interface PathResult {
  path: Hex[];
  cost: number;
}

/** A* pathfinding. `cost` returns null for impassable hexes. */
export function findPath(
  start: Hex,
  goal: Hex,
  cost: (h: Hex) => number | null,
  maxExpansions = 20_000,
): PathResult | null {
  const startKey = hexKey(start);
  const goalKey = hexKey(goal);
  if (startKey === goalKey) return { path: [], cost: 0 };

  const open = new MinHeap<{ key: string; hex: Hex; priority: number }>((a, b) => a.priority - b.priority);
  const cameFrom = new Map<string, string>();
  const costSoFar = new Map<string, number>();
  const hexes = new Map<string, Hex>();

  costSoFar.set(startKey, 0);
  hexes.set(startKey, start);
  open.push({ key: startKey, hex: start, priority: distance(start, goal) });

  let expansions = 0;
  while (open.size > 0) {
    const current = open.pop();
    if (!current) break;
    if (current.key === goalKey) {
      return { path: reconstruct(current.key, cameFrom, hexes), cost: costSoFar.get(current.key) ?? 0 };
    }
    if (expansions++ > maxExpansions) return null;

    for (const next of neighbors(current.hex)) {
      const nextKey = hexKey(next);
      const stepCost = cost(next);
      if (stepCost === null || stepCost < 0) continue;
      const tentative = (costSoFar.get(current.key) ?? 0) + stepCost;
      if (tentative >= (costSoFar.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      costSoFar.set(nextKey, tentative);
      cameFrom.set(nextKey, current.key);
      hexes.set(nextKey, next);
      open.push({ key: nextKey, hex: next, priority: tentative + distance(next, goal) });
    }
  }
  return null;
}

function reconstruct(goalKey: string, cameFrom: Map<string, string>, hexes: Map<string, Hex>): Hex[] {
  const path: Hex[] = [];
  let current: string | undefined = goalKey;
  while (current) {
    const h = hexes.get(current);
    if (h) path.push(h);
    current = cameFrom.get(current);
  }
  path.reverse();
  return path.slice(1);
}

/** Dijkstra flood fill up to a movement budget. */
export function reachable(
  start: Hex,
  budget: number,
  cost: (h: Hex) => number | null,
): Map<string, { hex: Hex; cost: number }> {
  const result = new Map<string, { hex: Hex; cost: number }>();
  const startKey = hexKey(start);
  result.set(startKey, { hex: start, cost: 0 });
  const open = new MinHeap<{ key: string; hex: Hex; priority: number }>((a, b) => a.priority - b.priority);
  open.push({ key: startKey, hex: start, priority: 0 });

  while (open.size > 0) {
    const current = open.pop();
    if (!current) break;
    const currentCost = result.get(current.key)?.cost ?? 0;
    if (currentCost > budget) continue;

    for (const next of neighbors(current.hex)) {
      const step = cost(next);
      if (step === null || step < 0) continue;
      const nextCost = currentCost + step;
      if (nextCost > budget) continue;
      const nextKey = hexKey(next);
      const existing = result.get(nextKey);
      if (existing && existing.cost <= nextCost) continue;
      result.set(nextKey, { hex: next, cost: nextCost });
      open.push({ key: nextKey, hex: next, priority: nextCost });
    }
  }
  return result;
}

export function hexesInRadius(center: Hex, radius: number, predicate?: (h: Hex) => boolean): Hex[] {
  const all = range(center, radius);
  return predicate ? all.filter(predicate) : all;
}

export function opposite(h: Hex): Hex {
  return { q: -h.q, r: -h.r };
}

export class MinHeap<T> {
  private readonly items: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  get size(): number {
    return this.items.length;
  }

  push(item: T): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (!top) return undefined;
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(this.items[i]!, this.items[parent]!) >= 0) break;
      [this.items[i], this.items[parent]] = [this.items[parent]!, this.items[i]!];
      i = parent;
    }
  }

  private bubbleDown(index: number): void {
    let i = index;
    const length = this.items.length;
    while (true) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < length && this.compare(this.items[left]!, this.items[smallest]!) < 0) smallest = left;
      if (right < length && this.compare(this.items[right]!, this.items[smallest]!) < 0) smallest = right;
      if (smallest === i) break;
      [this.items[i], this.items[smallest]] = [this.items[smallest]!, this.items[i]!];
      i = smallest;
    }
  }
}
