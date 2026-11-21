// The dotted "where to look" guide for a focused House Charge, shared by both
// map renderers (client-map-guide-overlays-2d.ts and the true-3D
// client-map-3d-map-guide-overlay.ts). Each unscouted town gets its own rough
// circle with the town inside but never at the centre, and a Charter's two
// towns are joined by a dotted line, so "connect these two" reads as two
// places and a route. Charges without a point target (an unseen landmass or
// region, an undetected relic) keep the server's single search circle.
// Geometry comes back as dot positions in world tile coordinates (fractional,
// wrapped), so both renderers can draw it without their own wrap handling.
import { HOUSE_CHARGE_SEARCH_RADIUS, type HouseChargeTarget, type HouseChargeView } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { metropolisHighlight } from "./client-house-charges-landmass.js";
import { focusedHouseCharge, type ChargeMapPoint } from "./client-house-charges-map.js";

export type ChargeSearchCircle = ChargeMapPoint & { radius: number };
export type ChargeSearchGuide = { circles: ChargeSearchCircle[]; ringDots: ChargeMapPoint[]; linkDots: ChargeMapPoint[] };

type GuideState = Pick<ClientState, "houseCharges" | "houseChargeFocusId" | "tiles"> & Partial<Pick<ClientState, "tilesRevision">>;

/** Spacing between dots, in tiles. */
const RING_DOT_SPACING = 0.75;
const LINK_DOT_SPACING = 1.25;
/** How far off-centre a town sits in its rough circle, as a share of the radius. */
const MIN_OFFSET_SHARE = 0.3;
const MAX_OFFSET_SHARE = 0.65;

const EMPTY: ChargeSearchGuide = { circles: [], ringDots: [], linkDots: [] };

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

const wrappedDelta = (from: number, to: number, size: number): number => {
  const delta = wrap(to - from, size);
  return delta > size / 2 ? delta - size : delta;
};

/** FNV-1a, so a town's circle stays put across frames, reloads and devices. */
const hash = (text: string): number => {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
};

/** A circle that contains `target` but is centred somewhere else near it. */
export const roughCircleFor = (chargeId: string, target: HouseChargeTarget, worldWidth: number, worldHeight: number): ChargeSearchCircle => {
  const seed = hash(`${chargeId}|${target.key}`);
  const angle = ((seed & 0xffff) / 0x10000) * Math.PI * 2;
  const share = MIN_OFFSET_SHARE + ((seed >>> 16) / 0x10000) * (MAX_OFFSET_SHARE - MIN_OFFSET_SHARE);
  const offset = HOUSE_CHARGE_SEARCH_RADIUS * share;
  return {
    x: wrap(target.x + Math.cos(angle) * offset, worldWidth),
    y: wrap(target.y + Math.sin(angle) * offset, worldHeight),
    radius: HOUSE_CHARGE_SEARCH_RADIUS
  };
};

const ringDots = (circle: ChargeSearchCircle, worldWidth: number, worldHeight: number): ChargeMapPoint[] => {
  const count = Math.max(12, Math.round((Math.PI * 2 * circle.radius) / RING_DOT_SPACING));
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return { x: wrap(circle.x + Math.cos(angle) * circle.radius, worldWidth), y: wrap(circle.y + Math.sin(angle) * circle.radius, worldHeight) };
  });
};

/** Dots from the edge of one end to the edge of the other, along the shorter way round the wrapped world. */
const linkDots = (from: ChargeSearchCircle, to: ChargeSearchCircle, worldWidth: number, worldHeight: number): ChargeMapPoint[] => {
  const dx = wrappedDelta(from.x, to.x, worldWidth);
  const dy = wrappedDelta(from.y, to.y, worldHeight);
  const length = Math.hypot(dx, dy);
  // Close towns' circles overlap: run the line centre to centre through the overlap instead, so the pair still reads as two places.
  const overlap = length - from.radius - to.radius <= LINK_DOT_SPACING;
  const start = overlap ? 0 : from.radius;
  const gap = overlap ? length : length - from.radius - to.radius;
  if (gap <= LINK_DOT_SPACING) return [];
  const count = Math.floor(gap / LINK_DOT_SPACING);
  const step = gap / count;
  return Array.from({ length: count + 1 }, (_, index) => {
    const along = (start + index * step) / length;
    return { x: wrap(from.x + dx * along, worldWidth), y: wrap(from.y + dy * along, worldHeight) };
  });
};

/** End of the link at a seen town: the town itself, stopping just short of its marker ring. */
const SEEN_TOWN_CLEARANCE = 1;

const guideFor = (charge: HouseChargeView, isExploredKey: (key: string) => boolean, worldWidth: number, worldHeight: number): ChargeSearchGuide => {
  const isExplored = (x: number, y: number): boolean => isExploredKey(`${x},${y}`);
  if (charge.areaTileKeys) {
    // Landmass or region: the server's circle until any of it has been seen; then the shaded area takes over.
    return charge.areaTileKeys.some(isExploredKey)
      ? EMPTY
      : { circles: [charge.searchCircle], ringDots: ringDots(charge.searchCircle, worldWidth, worldHeight), linkDots: [] };
  }
  // No exact point to circle: an undetected relic, a Correction (the server sends only its search circle's
  // centre, never the rival's landing site) or Three Seats (the middle of the landmass's nearest towns).
  if (charge.targets.length === 0 || charge.kind === "CORRECTION" || charge.kind === "METROPOLIS") {
    return { circles: [charge.searchCircle], ringDots: ringDots(charge.searchCircle, worldWidth, worldHeight), linkDots: [] };
  }
  const ends = charge.targets.map((target) =>
    isExplored(target.x, target.y)
      ? { circle: undefined, end: { x: target.x, y: target.y, radius: SEEN_TOWN_CLEARANCE } }
      : (() => {
          const circle = roughCircleFor(charge.id, target, worldWidth, worldHeight);
          return { circle, end: circle };
        })()
  );
  const circles = ends.flatMap((entry) => (entry.circle ? [entry.circle] : []));
  const [first, second] = ends;
  return {
    circles,
    ringDots: circles.flatMap((circle) => ringDots(circle, worldWidth, worldHeight)),
    linkDots: charge.kind === "CHARTER" && first && second ? linkDots(first.end, second.end, worldWidth, worldHeight) : []
  };
};

/**
 * Where "Show on map" centres a point charge with no target scouted: the
 * middle of its drawn rough circles (the shorter way round the wrapped world),
 * so the camera lands on what the map shows. Undefined when a target has been
 * scouted or the charge has no point targets.
 */
export const houseChargeGuideCentre = (
  charge: HouseChargeView,
  isExplored: (x: number, y: number) => boolean,
  worldWidth: number,
  worldHeight: number
): ChargeMapPoint | undefined => {
  if (charge.areaTileKeys || charge.targets.length === 0 || charge.kind === "CORRECTION" || charge.kind === "METROPOLIS") return undefined;
  if (charge.targets.some((target) => isExplored(target.x, target.y))) return undefined;
  const circles = charge.targets.map((target) => roughCircleFor(charge.id, target, worldWidth, worldHeight));
  const [first] = circles;
  if (!first) return undefined;
  const dx = circles.reduce((sum, circle) => sum + wrappedDelta(first.x, circle.x, worldWidth), 0) / circles.length;
  const dy = circles.reduce((sum, circle) => sum + wrappedDelta(first.y, circle.y, worldHeight), 0) / circles.length;
  return { x: wrap(Math.round(first.x + dx), worldWidth), y: wrap(Math.round(first.y + dy), worldHeight) };
};

/** The focused charge's rough circles and dotted link; empty without a focus. */
export const houseChargeSearchGuide = (state: GuideState, worldWidth: number, worldHeight: number): ChargeSearchGuide => {
  const charge = focusedHouseCharge(state);
  if (!charge) return EMPTY;
  // Three Metropolises: once any of the landmass is explored, its shaded area and town rings take over from the circle.
  if (charge.kind === "METROPOLIS" && metropolisHighlight(charge, state).area.length > 0) return EMPTY;
  return guideFor(charge, (key) => state.tiles.has(key), worldWidth, worldHeight);
};
