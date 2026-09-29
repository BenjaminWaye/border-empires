// Which tiles of a heightfield rebuild window touch a v9 river corner (and
// are therefore left out, to be drawn by client-map-3d-river-valley.ts).
// Built by walking the river corners (a few hundred, map-wide) rather than
// testing all four corners of every window tile -- the window can be
// 240x240 tiles at max zoom-out, and this runs every rebuild.
const mod = (a: number, m: number): number => ((a % m) + m) % m;

/** Mask over the window's tiles (row-major, tileSpanX wide); null when there are no river corners. */
export const buildRiverValleyTileMask = (
  riverCornerHalfWidths: ReadonlyMap<number, number> | undefined,
  // World tile coords of the window's tile (0, 0) -- may be negative/unwrapped.
  originX: number,
  originZ: number,
  tileSpanX: number,
  tileSpanY: number,
  worldWidth: number,
  worldHeight: number
): Uint8Array | null => {
  if (!riverCornerHalfWidths || riverCornerHalfWidths.size === 0) return null;
  const mask = new Uint8Array(tileSpanX * tileSpanY);
  for (const cornerIndex of riverCornerHalfWidths.keys()) {
    const cx = cornerIndex % worldWidth;
    const cz = Math.floor(cornerIndex / worldWidth);
    for (let dz = -1; dz <= 0; dz += 1) {
      const j = mod(cz + dz - originZ, worldHeight);
      if (j >= tileSpanY) continue;
      for (let dx = -1; dx <= 0; dx += 1) {
        const i = mod(cx + dx - originX, worldWidth);
        if (i < tileSpanX) mask[j * tileSpanX + i] = 1;
      }
    }
  }
  return mask;
};
