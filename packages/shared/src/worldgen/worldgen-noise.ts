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

// Bilinear/smoothstep interpolation (valueNoise above) is mathematically
// guaranteed to produce smooth curves everywhere -- fine for large-scale
// landmass shape, but real coastlines are jagged and angular down to small
// scales, never smoothly rounded. This splits each cell along its diagonal
// and interpolates PLANAR (linear, not smoothstep) within each triangle,
// so the surface has a real crease along every cell diagonal instead of a
// smooth saddle -- iso-lines come out as straight angular segments, not
// curves. Used only for the finest coastline-detail octaves; everything
// else (mountains, biomes, large-scale landmass shape) stays on the smooth
// valueNoise so this doesn't ripple into unrelated systems.
export const valueNoiseFaceted = (x: number, y: number, cell: number, seed: number): number => {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const tx = (x % cell) / cell;
  const ty = (y % cell) / cell;
  const n00 = seeded01(gx, gy, seed);
  const n10 = seeded01(gx + 1, gy, seed);
  const n01 = seeded01(gx, gy + 1, seed);
  const n11 = seeded01(gx + 1, gy + 1, seed);
  if (tx + ty <= 1) return n00 + (n10 - n00) * tx + (n01 - n00) * ty;
  const ux = 1 - tx;
  const uy = 1 - ty;
  return n11 + (n01 - n11) * ux + (n10 - n11) * uy;
};
