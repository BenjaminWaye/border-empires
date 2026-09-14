// Split out of worldgen.ts (already at the repo's 500-line file cap) so this
// didn't push that file over the limit. These are pure noise primitives with
// no dependency on world state, so they live in their own file rather than
// worldgen-biome-thresholds.ts, which needs to call valueNoise without
// creating a circular import back into worldgen.ts. worldgen.ts re-exports
// seeded01/valueNoise so existing importers (worldgen-continents.ts,
// worldgen-mountain-rings.ts, worldgen-rivers.ts, and their tests) are
// unaffected.
export const seeded01 = (x: number, y: number, seed: number): number => {
  const n = Math.sin((x * 12.9898 + y * 78.233 + seed * 43758.5453) % 100000) * 43758.5453123;
  return n - Math.floor(n);
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

export const valueNoise = (x: number, y: number, cell: number, seed: number): number => {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const tx = (x % cell) / cell;
  const ty = (y % cell) / cell;
  const sx = smoothstep(tx);
  const sy = smoothstep(ty);
  const n00 = seeded01(gx, gy, seed);
  const n10 = seeded01(gx + 1, gy, seed);
  const n01 = seeded01(gx, gy + 1, seed);
  const n11 = seeded01(gx + 1, gy + 1, seed);
  const ix0 = lerp(n00, n10, sx);
  const ix1 = lerp(n01, n11, sx);
  return lerp(ix0, ix1, sy);
};
