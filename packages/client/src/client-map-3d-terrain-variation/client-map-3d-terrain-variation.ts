const hash01 = (x: number, y: number, seed: number): number => {
  const h = ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) >>> 0;
  return h / 4294967295;
};

const smoothstep = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const valueNoise = (x: number, y: number, cell: number, seed: number): number => {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const tx = x / cell - gx;
  const ty = y / cell - gy;
  const sx = smoothstep(tx);
  const sy = smoothstep(ty);
  const n00 = hash01(gx, gy, seed);
  const n10 = hash01(gx + 1, gy, seed);
  const n01 = hash01(gx, gy + 1, seed);
  const n11 = hash01(gx + 1, gy + 1, seed);
  const nx0 = lerp(n00, n10, sx);
  const nx1 = lerp(n01, n11, sx);
  return lerp(nx0, nx1, sy);
};

export const terrainShadeVariantAt = (wx: number, wy: number): 0 | 1 | 2 => {
  const n0 = valueNoise(wx + 137, wy - 53, 4, 11);
  const n1 = valueNoise(wx - 61, wy + 211, 2, 29);
  const blended = n0 * 0.72 + n1 * 0.28;
  if (blended < 0.34) return 0;
  if (blended < 0.67) return 1;
  return 2;
};
