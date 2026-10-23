// Capture-hold garrison (shared capture-hold.ts), true-3D side: decides which
// tiles get a standing squad this frame, which way it faces, and whether a
// fight on a held tile should start its defenders from that squad. The
// marines themselves are drawn by the pop-up-marine overlay
// (client-map-3d-popup-marine/popup-marine-garrison.ts). The 2D renderer's
// counterpart is client-map-2d-capture-hold-overlay.ts.
import { WORLD_HEIGHT, WORLD_WIDTH, isCaptureHoldActive } from "@border-empires/shared";
import { knownSquadArmorFor } from "./client-battle-overlay/client-battle-overlay.js";
import { isHoldingCapturedGround, liveCaptureHoldKeys } from "./client-capture-hold/client-capture-hold.js";
import type { GarrisonFacing, GarrisonRenderEntry } from "./client-map-3d-popup-marine/popup-marine-garrison.js";
import { toroidDelta } from "./client-map-3d-pointer-pick.js";
import { squadColorForOwner } from "./client-planetary-defense-style.js";
import type { ClientState } from "./client-state/client-state.js";
import type { Tile } from "./client-types.js";

type GarrisonState = Pick<ClientState, "tiles" | "activeBattles" | "titaniumArmorOwners">;

const TILE_CENTER_OFFSET = 0.5;
// The overlay only has marine slots for this many squads at once anyway, so
// the ones nearest the view win (see buildCaptureHoldGarrisons).
const MAX_GARRISONS = 16;
const DEFAULT_FACING: GarrisonFacing = { fwdX: 0, fwdZ: 1 };
// Cardinals first, so a squad that came in straight reads that way.
const NEIGHBOR_STEPS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];

// Per held tile: the facing chosen when its hold began, keyed by the hold's
// own deadline so a fresh capture of the same tile re-picks it. Pruned every
// frame to tiles still held (or still mid-fight), so it never outgrows the
// handful of tiles inside a 60s hold window.
const facingByTile = new Map<string, GarrisonFacing & { holdUntil: number }>();

const normalized = (dx: number, dy: number): GarrisonFacing | undefined => {
  const len = Math.hypot(dx, dy);
  // `|| 0` folds -0 into 0 so a facing compares cleanly.
  return len < 1e-6 ? undefined : { fwdX: dx / len || 0, fwdZ: dy / len || 0 };
};

const wrap = (v: number, size: number): number => ((v % size) + size) % size;

/** Direction the capturing squad advanced in: the battle that took the tile if
 * one is still on record, else in from a neighbouring tile its owner holds. */
const pickFacing = (state: GarrisonState, keyFor: (x: number, y: number) => string, key: string, tile: Tile): GarrisonFacing => {
  const battle = state.activeBattles.get(key);
  if (battle && battle.attackerWon && battle.attackerOwnerId === tile.ownerId) {
    const fromBattle = normalized(toroidDelta(battle.originX, battle.targetX, WORLD_WIDTH), toroidDelta(battle.originY, battle.targetY, WORLD_HEIGHT));
    if (fromBattle) return fromBattle;
  }
  for (const [dx, dy] of NEIGHBOR_STEPS) {
    const neighbor = state.tiles.get(keyFor(wrap(tile.x + dx, WORLD_WIDTH), wrap(tile.y + dy, WORLD_HEIGHT)));
    if (neighbor?.ownerId === tile.ownerId) return normalized(-dx, -dy) ?? DEFAULT_FACING;
  }
  return DEFAULT_FACING;
};

const facingFor = (state: GarrisonState, keyFor: (x: number, y: number) => string, key: string, tile: Tile): GarrisonFacing => {
  const holdUntil = tile.captureHoldUntil ?? 0;
  const cached = facingByTile.get(key);
  if (cached && cached.holdUntil === holdUntil) return cached;
  const facing = pickFacing(state, keyFor, key, tile);
  facingByTile.set(key, { ...facing, holdUntil });
  return facing;
};

/** `{ defenderGarrison }` for a fight on a tile its defender is still holding
 * after capturing it, so the standing squad defends instead of a fresh one
 * popping in at the tile edge; `{}` otherwise. */
export const defenderGarrisonField = (
  state: GarrisonState,
  keyFor: (x: number, y: number) => string,
  key: string,
  defenderOwnerId: string,
  nowEpochMs: number
): { defenderGarrison?: GarrisonFacing } => {
  const tile = state.tiles.get(key);
  if (!tile || tile.ownerId !== defenderOwnerId || tile.ownershipState !== "FRONTIER" || typeof tile.captureHoldUntil !== "number") return {};
  // A fight rolled inside the hold keeps its garrison even if the window
  // runs out before it resolves (facing stays cached while the fight runs).
  const cached = facingByTile.get(key);
  if (!isCaptureHoldActive(tile, nowEpochMs) && cached?.holdUntil !== tile.captureHoldUntil) return {};
  return { defenderGarrison: facingFor(state, keyFor, key, tile) };
};

/** Standing squads on every visible capture-held tile with no fight on it. */
export function buildCaptureHoldGarrisons(
  state: GarrisonState,
  keyFor: (x: number, y: number) => string,
  busyKeys: ReadonlySet<string>,
  playerColorFor: (ownerId: string) => string,
  standY: (x: number, y: number) => number,
  originX: number,
  originY: number,
  nowMs: number,
  nowEpochMs: number
): GarrisonRenderEntry[] {
  // Candidates come from the tile merge's held-tile index (client-capture-
  // hold.ts), never a scan of the whole tile cache.
  const candidates: Array<{ key: string; tile: Tile; distSq: number }> = [];
  const live = new Set<string>(busyKeys);
  for (const key of liveCaptureHoldKeys(nowEpochMs)) {
    const tile = state.tiles.get(key);
    if (!tile?.ownerId || !isCaptureHoldActive(tile, nowEpochMs)) continue;
    live.add(key);
    if (busyKeys.has(key) || !isHoldingCapturedGround(tile, nowEpochMs)) continue;
    const dx = toroidDelta(originX, tile.x, WORLD_WIDTH);
    const dy = toroidDelta(originY, tile.y, WORLD_HEIGHT);
    candidates.push({ key, tile, distSq: dx * dx + dy * dy });
  }
  // Only so many squads fit; the ones nearest the view are the ones the
  // player is looking at.
  candidates.sort((a, b) => a.distSq - b.distSq);
  const garrisons: GarrisonRenderEntry[] = [];
  for (const { key, tile } of candidates.slice(0, MAX_GARRISONS)) {
    if (!tile.ownerId) continue;
    const facing = facingFor(state, keyFor, key, tile);
    garrisons.push({
      ...facing,
      tgtWorldX: toroidDelta(originX, tile.x, WORLD_WIDTH) + TILE_CENTER_OFFSET,
      tgtWorldZ: toroidDelta(originY, tile.y, WORLD_HEIGHT) + TILE_CENTER_OFFSET,
      tgtSurfaceY: standY(tile.x, tile.y),
      color: squadColorForOwner(tile.ownerId, playerColorFor),
      hashSeed: tile.x * 92821 + tile.y,
      // captureHoldUntil is server epoch ms; the overlay ticks on performance.now().
      endsAt: nowMs + (tile.captureHoldUntil! - nowEpochMs),
      armor: knownSquadArmorFor(state, tile.ownerId)
    });
  }
  for (const key of facingByTile.keys()) if (!live.has(key)) facingByTile.delete(key);
  return garrisons;
}

/** Test-only: drop the module-level caches between cases. */
export const resetCaptureHoldGarrisonCache = (): void => {
  facingByTile.clear();
};
