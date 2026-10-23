/** Deterministic hash-based value noise. No external dependency. */

function hash2(x: number, y: number, seed: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(0, 1, x - x0);
  const ty = smoothstep(0, 1, y - y0);
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);
  return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty);
}

export function fbm(x: number, y: number, seed: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, seed + i * 1013);
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return norm === 0 ? 0 : sum / norm;
}

/** Ridged noise, useful for mountain chains. Returns [0, 1]. */
export function ridged(x: number, y: number, seed: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    const n = 1 - Math.abs(2 * valueNoise(x * frequency, y * frequency, seed + i * 7919) - 1);
    sum += amplitude * n * n;
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return norm === 0 ? 0 : sum / norm;
}
