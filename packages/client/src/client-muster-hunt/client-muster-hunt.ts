import { MUSTER_ADVANCE_RANGE_STEPS, MUSTER_ATTACK_COST, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { ownTileSiegeAt } from "../client-muster-siege/client-muster-siege.js";
import { musterAvailableAt } from "../client-muster-transit/client-muster-transit.js";
import { flagHasArmedTransit, huntFlagReaches } from "./client-muster-hunt-reach.js";

// "Hunt Planetary Defense": an ADVANCE flag that only goes after Planetary
// Defense (barbarian) tiles, re-picking the nearest patrol every second on the
// server (MusterState.hunt, apps/simulation/src/runtime-muster-tick/
// muster-advance-fire.ts). A hunt locks its target the moment it fires, so the
// patrol can't walk off while the company is still marching -- the failure a
// manual attack on a patrol kept hitting ("target must be enemy-controlled
// land" once the march arrived on ground the patrol had already left).

export const BARBARIAN_OWNER_ID = "barbarian-1";

type HuntState = Pick<ClientState, "me" | "tiles" | "incomingAttacksByTile" | "dockPairs" | "musterTransitByCommand">;

const wrappedDistance = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(Math.min(dx, WORLD_WIDTH - dx), Math.min(dy, WORLD_HEIGHT - dy));
};

/** A flag that is free to take a hunt order: holding, or already hunting. */
export const canTakeHuntOrder = (tile: Tile): boolean =>
  tile.muster?.mode === "HOLD" || (tile.muster?.mode === "ADVANCE" && tile.muster.hunt === true);

/**
 * A flag a manual attack on Planetary Defense may be handed to as a hunt: free
 * to take the order, not funding a manual attack that is still marching (the
 * hunt would spend the manpower that attack reserved), and able to reach the
 * target the way the server's hunt search does. Otherwise the attack goes the
 * ordinary way.
 */
export const canHuntWith = (state: HuntState, flag: Tile, target: { x: number; y: number }): boolean =>
  canTakeHuntOrder(flag) && !flagHasArmedTransit(state, flag) && huntFlagReaches(state, flag, target);

/** SET_MUSTER that turns the flag at (x, y) into a hunt, optionally going for (target) first. */
export const huntOrderMessage = (x: number, y: number, target?: { x: number; y: number }): Record<string, unknown> => ({
  type: "SET_MUSTER",
  x,
  y,
  mode: "ADVANCE",
  hunt: true,
  ...(target ? { targetX: target.x, targetY: target.y } : {})
});

/**
 * The player's nearest flag (within the hunt range, by straight-line distance)
 * that can take a hunt order for a fight at (x, y): holding or already
 * hunting, not pinned by an attack on its own tile, staged with enough
 * manpower for an attack, and able to reach (x, y) over its own land.
 */
export const nearestHuntFlag = (state: HuntState, x: number, y: number, nowMs: number, excludeKey?: string): Tile | undefined => {
  let best: { tile: Tile; dist: number } | undefined;
  for (const [key, tile] of state.tiles) {
    if (key === excludeKey || tile.ownerId !== state.me || tile.muster?.ownerId !== state.me || !canTakeHuntOrder(tile)) continue;
    const dist = wrappedDistance(tile.x, tile.y, x, y);
    if (dist > MUSTER_ADVANCE_RANGE_STEPS) continue;
    if (ownTileSiegeAt(state, tile.x, tile.y, nowMs)) continue;
    if (musterAvailableAt(state, tile) < MUSTER_ATTACK_COST || !canHuntWith(state, tile, { x, y })) continue;
    if (!best || dist < best.dist) best = { tile, dist };
  }
  return best?.tile;
};

/** Planetary Defense's in-flight capture of this player's own tile, if any. */
const planetaryDefenseCaptureAt = (state: HuntState, tile: Tile, nowMs: number): boolean => {
  const incoming = state.incomingAttacksByTile.get(`${tile.x},${tile.y}`);
  return Boolean(incoming && incoming.attackerId === BARBARIAN_OWNER_ID && incoming.resolvesAt > nowMs && tile.ownerId === state.me);
};

/**
 * Tile-menu row on the player's own tile while Planetary Defense is capturing
 * it. The patrol has already left the tile it launched from, so there is
 * nothing to attack until it lands; a hunting flag strikes it the moment it does.
 */
export const huntAttackersAction = (tile: Tile, state: HuntState, nowMs: number): TileActionDef | undefined => {
  if (!planetaryDefenseCaptureAt(state, tile, nowMs)) return undefined;
  const flag = nearestHuntFlag(state, tile.x, tile.y, nowMs, `${tile.x},${tile.y}`);
  if (!flag) {
    return {
      id: "muster_hunt_attackers",
      label: "Hunt Planetary Defense",
      disabled: true,
      disabledReason: `No staged holding flag that can reach this tile within ${MUSTER_ADVANCE_RANGE_STEPS} tiles — stage one nearby to hunt them.`
    };
  }
  return {
    id: "muster_hunt_attackers",
    label: "Hunt Planetary Defense",
    detail: `Flag at (${flag.x}, ${flag.y}) hunts the Planetary Defense taking this tile — it strikes the moment they land, and chases them if they move.`,
    disabled: false
  };
};

/** Sends the hunt order for muster_hunt_attackers; returns the flag it went to. */
export const sendHuntAttackersOrder = (
  tile: Tile,
  state: HuntState,
  sendGameMessage: (payload: unknown) => boolean,
  nowMs: number
): Tile | undefined => {
  const flag = nearestHuntFlag(state, tile.x, tile.y, nowMs, `${tile.x},${tile.y}`);
  if (!flag) return undefined;
  sendGameMessage(huntOrderMessage(flag.x, flag.y, { x: tile.x, y: tile.y }));
  return flag;
};
