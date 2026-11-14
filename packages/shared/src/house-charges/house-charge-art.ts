// Card art for a fulfilled House Charge (docs/house-charges-plan.md, "Card
// design"): the real shape of what the House held (a Charter's road, a
// landmass's or region's outline) packed into a small bitmap so it can ride on
// the season archive. Encoded by the simulation at each evaluation, decoded by
// the client's card renderer.

export const CHARGE_ART_WIDTH = 24;
export const CHARGE_ART_HEIGHT = 16;

export type ChargeArtBitmap = { width: number; height: number; cells: boolean[] };

/**
 * Scales tile positions (wrapped world coordinates) into a CHARGE_ART_WIDTH x
 * CHARGE_ART_HEIGHT bitmap, keeping the shape's aspect ratio and centring it.
 * Returns undefined for an empty shape. Format: "<width>x<height>:<hex bits>".
 */
export const encodeChargeArt = (points: ReadonlyArray<{ x: number; y: number }>, worldWidth: number, worldHeight: number): string | undefined => {
  const first = points[0];
  if (!first) return undefined;
  // Unwrap around the first point so a shape straddling the world edge stays contiguous.
  const unwrap = (value: number, origin: number, size: number): number => {
    let delta = value - origin;
    if (delta > size / 2) delta -= size;
    if (delta < -size / 2) delta += size;
    return origin + delta;
  };
  const xs = points.map((point) => unwrap(point.x, first.x, worldWidth));
  const ys = points.map((point) => unwrap(point.y, first.y, worldHeight));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX + 1;
  const spanY = Math.max(...ys) - minY + 1;
  const scale = Math.min(CHARGE_ART_WIDTH / spanX, CHARGE_ART_HEIGHT / spanY);
  const offsetX = (CHARGE_ART_WIDTH - spanX * scale) / 2;
  const offsetY = (CHARGE_ART_HEIGHT - spanY * scale) / 2;
  const bits = new Uint8Array(CHARGE_ART_WIDTH * CHARGE_ART_HEIGHT);
  xs.forEach((x, index) => {
    const x0 = Math.floor(offsetX + (x - minX) * scale);
    const y0 = Math.floor(offsetY + (ys[index]! - minY) * scale);
    const reach = Math.max(1, Math.ceil(scale));
    for (let dy = 0; dy < reach; dy += 1) {
      for (let dx = 0; dx < reach; dx += 1) {
        const cx = Math.min(CHARGE_ART_WIDTH - 1, x0 + dx);
        const cy = Math.min(CHARGE_ART_HEIGHT - 1, y0 + dy);
        bits[cy * CHARGE_ART_WIDTH + cx] = 1;
      }
    }
  });
  let hex = "";
  for (let index = 0; index < bits.length; index += 4) {
    hex += ((bits[index]! << 3) | (bits[index + 1]! << 2) | (bits[index + 2]! << 1) | bits[index + 3]!).toString(16);
  }
  return `${CHARGE_ART_WIDTH}x${CHARGE_ART_HEIGHT}:${hex}`;
};

export const decodeChargeArt = (art: string | undefined): ChargeArtBitmap | undefined => {
  const match = art?.match(/^(\d+)x(\d+):([0-9a-f]+)$/);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const hex = match[3]!;
  if (width <= 0 || height <= 0 || width * height > 4096 || hex.length * 4 < width * height) return undefined;
  const cells: boolean[] = [];
  for (const digit of hex) {
    const value = parseInt(digit, 16);
    cells.push(Boolean(value & 8), Boolean(value & 4), Boolean(value & 2), Boolean(value & 1));
  }
  return { width, height, cells: cells.slice(0, width * height) };
};
