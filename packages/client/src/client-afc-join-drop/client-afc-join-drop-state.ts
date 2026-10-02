import {
  AFC_LANDING_FOOTPRINT_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  isForestTileAt,
  terrainAt as generatedTerrainAt,
  wasForestBeforeClearingAt,
  type Terrain
} from "@border-empires/shared";

// State for the join-time AFC drop. Lives in its own file (and is spread
// into the initial client state) so client-state.ts does not grow.
//
// idle   : nothing armed; the tick is looking for a fresh home AFC.
// waiting: armed. The real AFC is hidden in both renderers until the map is
//          unobstructed for the dwell, then `playing` begins.
// playing: drop animating; the real AFC stays hidden until `landsAt`.
// done   : finished, skipped, or not eligible for `decidedFor`.
export type AfcJoinDropPhase = "idle" | "waiting" | "playing" | "done";

export type AfcJoinDropState = {
  phase: AfcJoinDropPhase;
  /** `${x},${y}:${activatedAt}` of the AFC the current phase was decided for. */
  decidedFor: string;
  x: number;
  y: number;
  /** Discovery-tip id persisted when the drop completes. */
  tipId: string;
  /** performance.now() when the drop was armed. */
  waitingSince: number;
  /** performance.now() since which the gate has held continuously; 0 while closed. */
  gateOpenSince: number;
  startedAt: number;
  /** performance.now() of touchdown, when the real AFC is revealed. */
  landsAt: number;
  revealed: boolean;
  /** tilesRevision at the last scan for a fresh AFC, and when (performance.now()) it ran; throttle the scan. */
  scannedRevision: number;
  lastScanAt: number;
};

export type AfcJoinDropFxEntry = { x: number; y: number; queuedAt: number };

export const createAfcJoinDropState = (): AfcJoinDropState => ({
  phase: "idle",
  decidedFor: "",
  x: 0,
  y: 0,
  tipId: "",
  waitingSince: 0,
  gateOpenSince: 0,
  startedAt: 0,
  landsAt: 0,
  revealed: false,
  scannedRevision: -1,
  lastScanAt: -Infinity
});

/** True while the real AFC on (x, y) must not be drawn because the drop has not landed yet. */
export const isAfcHiddenForJoinDrop = (drop: AfcJoinDropState, x: number, y: number): boolean =>
  drop.x === x && drop.y === y && (drop.phase === "waiting" || (drop.phase === "playing" && !drop.revealed));

// AFC landing footprint hold: the landing flattens mountains and clears
// forest from the AFC's 3x3 footprint (forest-clearing.ts in
// @border-empires/shared), but while the join drop is still hiding the real
// AFC both renderers keep drawing the original terrain there, so the trees
// and mountains vanish at touchdown under the smoke instead of before the
// AFC has even appeared.
const wrappedDistance = (a: number, b: number, size: number): number => {
  const d = Math.abs(a - b) % size;
  return Math.min(d, size - d);
};

/** True while (x, y) lies in the 3x3 footprint of an AFC the join drop is still hiding. */
export const isInHeldAfcLandingFootprint = (drop: AfcJoinDropState, x: number, y: number): boolean =>
  (drop.phase === "waiting" || (drop.phase === "playing" && !drop.revealed)) &&
  wrappedDistance(drop.x, x, WORLD_WIDTH) <= AFC_LANDING_FOOTPRINT_RADIUS &&
  wrappedDistance(drop.y, y, WORLD_HEIGHT) <= AFC_LANDING_FOOTPRINT_RADIUS;

/** The terrain to draw at (x, y): a footprint mountain the landing flattened stays a mountain until touchdown. */
export const terrainWithAfcLandingHold = (drop: AfcJoinDropState, x: number, y: number, terrain: Terrain): Terrain =>
  terrain === "LAND" && isInHeldAfcLandingFootprint(drop, x, y) && generatedTerrainAt(x, y) === "MOUNTAIN" ? "MOUNTAIN" : terrain;

/** Forest-ness to draw at (x, y): footprint forest the landing cleared stays drawn until touchdown. */
export const isForestTileWithAfcLandingHold = (drop: AfcJoinDropState, x: number, y: number): boolean =>
  isForestTileAt(x, y) || (wasForestBeforeClearingAt(x, y) && isInHeldAfcLandingFootprint(drop, x, y));
