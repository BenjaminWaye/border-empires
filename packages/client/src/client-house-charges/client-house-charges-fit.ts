// Where "Show on map" puts the camera for a House Charge: centred on the whole
// goal (both towns of a Charter, a region's explored ground, a search circle)
// and zoomed out just enough that all of it is on screen at once. It frames
// only what the map draws for the charge (client-house-charges-map.ts and
// client-house-charges-search-guide.ts): an unscouted town counts as its rough
// circle, never its exact tile. Both renderers read camX/camY/zoom, so the
// result covers 2D and true-3D alike.
import { WORLD_HEIGHT, WORLD_WIDTH, type HouseChargeView } from "@border-empires/shared";
import { MIN_ZOOM } from "../client-constants.js";
import { roughCircleFor } from "./client-house-charges-search-guide.js";

type Disc = { x: number; y: number; radius: number };

/** Room around a seen town (its marker ring and name label). */
const SEEN_TARGET_RADIUS = 2;
/** Share of the canvas the goal may fill: the phone HUD covers the top and bottom bands. */
const USABLE_WIDTH = 0.8;
const USABLE_HEIGHT = 0.55;

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

const wrappedDelta = (from: number, to: number, size: number): number => {
  const delta = wrap(to - from, size);
  return delta > size / 2 ? delta - size : delta;
};

const parseKey = (key: string): { x: number; y: number } | undefined => {
  const [x, y] = key.split(",").map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x: x as number, y: y as number } : undefined;
};

/** The discs the map draws for this charge, in world tiles. */
export const houseChargeFitDiscs = (charge: HouseChargeView, isExplored: (x: number, y: number) => boolean): Disc[] => {
  if (charge.areaTileKeys) {
    const seen = charge.areaTileKeys.map(parseKey).filter((tile): tile is { x: number; y: number } => tile !== undefined && isExplored(tile.x, tile.y));
    return seen.length > 0 ? seen.map(({ x, y }) => ({ x, y, radius: 1 })) : [charge.searchCircle];
  }
  if (charge.targets.length === 0 || charge.kind === "CORRECTION" || charge.kind === "METROPOLIS") return [charge.searchCircle];
  return charge.targets.map((target) =>
    isExplored(target.x, target.y) ? { x: target.x, y: target.y, radius: SEEN_TARGET_RADIUS } : roughCircleFor(charge.id, target, WORLD_WIDTH, WORLD_HEIGHT)
  );
};

export type HouseChargeFitView = { x: number; y: number; zoom: number };

/**
 * Camera centre and zoom that show the whole charge on a canvas of the given
 * size. Only ever zooms out from `currentZoom`: someone already zoomed out
 * further keeps their level.
 */
export const houseChargeFitView = (
  charge: HouseChargeView,
  isExplored: (x: number, y: number) => boolean,
  canvas: { width: number; height: number },
  currentZoom: number
): HouseChargeFitView => {
  const discs = houseChargeFitDiscs(charge, isExplored);
  const anchor = discs[0] ?? charge.searchCircle;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const disc of discs) {
    const dx = wrappedDelta(anchor.x, disc.x, WORLD_WIDTH);
    const dy = wrappedDelta(anchor.y, disc.y, WORLD_HEIGHT);
    minX = Math.min(minX, dx - disc.radius);
    maxX = Math.max(maxX, dx + disc.radius);
    minY = Math.min(minY, dy - disc.radius);
    maxY = Math.max(maxY, dy + disc.radius);
  }
  const x = wrap(Math.round(anchor.x + (minX + maxX) / 2), WORLD_WIDTH);
  const y = wrap(Math.round(anchor.y + (minY + maxY) / 2), WORLD_HEIGHT);
  if (canvas.width <= 0 || canvas.height <= 0) return { x, y, zoom: currentZoom };
  const fit = Math.min((canvas.width * USABLE_WIDTH) / Math.max(1, maxX - minX), (canvas.height * USABLE_HEIGHT) / Math.max(1, maxY - minY));
  return { x, y, zoom: Math.max(MIN_ZOOM, Math.min(currentZoom, Math.floor(fit))) };
};
