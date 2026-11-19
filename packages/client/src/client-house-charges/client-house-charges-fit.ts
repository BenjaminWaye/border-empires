// Where "Show on map" puts the camera for a House Charge: centred on the whole
// goal (both towns of a Charter, a region's explored ground, a search circle)
// and zoomed out just enough that all of it is on screen at once. It frames
// only what the map draws for the charge (client-house-charges-map.ts and
// client-house-charges-search-guide.ts): an unscouted town counts as its rough
// circle, never its exact tile. Both renderers read camX/camY/zoom, but they
// show different amounts of map at one zoom: 2D draws `zoom` canvas pixels per
// tile, true-3D a tilted perspective camera whose distance is set by zoom
// (client-map-3d-perspective-camera.ts), so the visible extent is worked out
// per renderer.
import { WORLD_HEIGHT, WORLD_WIDTH, type HouseChargeView } from "@border-empires/shared";
import { MIN_ZOOM } from "../client-constants.js";
import { cameraDistanceForZoom, PERSPECTIVE_FOV_DEGREES, PERSPECTIVE_TILT_RADIANS } from "../client-map-3d-perspective-camera/client-map-3d-perspective-camera.js";
import { roughCircleFor } from "./client-house-charges-search-guide.js";

type Disc = { x: number; y: number; radius: number };

/** Room around a seen town (its marker ring and name label). */
const SEEN_TARGET_RADIUS = 2;
/** Share of the view the goal may fill: the phone HUD covers the top and bottom bands. */
const USABLE_WIDTH = 0.8;
const USABLE_HEIGHT = 0.55;

export type FitRenderer = "2d" | "3d";
type Extents = { halfWidth: number; halfHeight: number };

/**
 * Tiles visible either side of the camera centre at `zoom`, already cut to the
 * usable share. True-3D looks north at a tilt, so it sees less ground towards
 * the bottom of the screen than the top: the nearer (smaller) reach is used
 * both ways, and the width is taken at the centre's distance.
 */
export const visibleTileExtents = (renderer: FitRenderer, canvas: { width: number; height: number }, zoom: number): Extents => {
  if (renderer === "2d") return { halfWidth: (canvas.width * USABLE_WIDTH) / zoom / 2, halfHeight: (canvas.height * USABLE_HEIGHT) / zoom / 2 };
  const distance = cameraDistanceForZoom(zoom);
  const halfFov = (PERSPECTIVE_FOV_DEGREES * Math.PI) / 360;
  const aspect = canvas.width / canvas.height;
  const nearReach = distance * Math.sin(PERSPECTIVE_TILT_RADIANS) - distance * Math.cos(PERSPECTIVE_TILT_RADIANS) * Math.tan(PERSPECTIVE_TILT_RADIANS - halfFov);
  return { halfWidth: distance * Math.tan(halfFov) * aspect * USABLE_WIDTH, halfHeight: nearReach * USABLE_HEIGHT };
};

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
  // Scouted targets first: the first disc anchors the view when the whole charge cannot fit.
  const discs = charge.targets.map((target) =>
    isExplored(target.x, target.y) ? { x: target.x, y: target.y, radius: SEEN_TARGET_RADIUS, seen: true } : { ...roughCircleFor(charge.id, target, WORLD_WIDTH, WORLD_HEIGHT), seen: false }
  );
  return [...discs.filter((disc) => disc.seen), ...discs.filter((disc) => !disc.seen)].map(({ x, y, radius }) => ({ x, y, radius }));
};

export type HouseChargeFitView = { x: number; y: number; zoom: number };

/**
 * Camera centre and zoom that show the whole charge. Only ever zooms out from
 * `currentZoom`: someone already zoomed out further keeps their level. When
 * even the widest zoom cannot hold it all, the centre is pulled towards the
 * first scouted target (else the first circle) so that at least it stays on
 * screen, never empty map between two off-screen ends.
 */
export const houseChargeFitView = (
  charge: HouseChargeView,
  isExplored: (x: number, y: number) => boolean,
  canvas: { width: number; height: number },
  currentZoom: number,
  renderer: FitRenderer = "2d"
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
  let centreX = (minX + maxX) / 2;
  let centreY = (minY + maxY) / 2;
  let zoom = currentZoom;
  if (canvas.width > 0 && canvas.height > 0) {
    // Visible extent scales as 1/zoom in both renderers, so the extent at zoom 1 gives the fit directly.
    const unit = visibleTileExtents(renderer, canvas, 1);
    const fit = Math.min(unit.halfWidth / Math.max(0.5, (maxX - minX) / 2), unit.halfHeight / Math.max(0.5, (maxY - minY) / 2));
    zoom = Math.max(MIN_ZOOM, Math.min(currentZoom, Math.floor(fit)));
    const seen = visibleTileExtents(renderer, canvas, zoom);
    // Too wide even at the widest zoom: slide the centre (anchor-relative, anchor at 0) until the anchor's disc is in view.
    const keepX = Math.max(0, seen.halfWidth - anchor.radius);
    const keepY = Math.max(0, seen.halfHeight - anchor.radius);
    centreX = Math.max(-keepX, Math.min(keepX, centreX));
    centreY = Math.max(-keepY, Math.min(keepY, centreY));
  }
  return { x: wrap(Math.round(anchor.x + centreX), WORLD_WIDTH), y: wrap(Math.round(anchor.y + centreY), WORLD_HEIGHT), zoom };
};
