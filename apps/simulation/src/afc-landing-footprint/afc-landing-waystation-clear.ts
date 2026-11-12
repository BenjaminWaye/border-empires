import { tileKeysInReach } from "@border-empires/shared";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import { simulationTileKey } from "../seed-state/seed-state.js";
import { withAfcReachRadii } from "../runtime/runtime-reach-anchors.js";

export type AfcLandingWaystationClearContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  players: ReadonlyMap<string, DomainPlayer>;
  locksByTile: Pick<ReadonlyMap<string, unknown>, "has">;
  pendingSettlementsByTile: Pick<ReadonlyMap<string, unknown>, "has">;
  /** Owner of the reach border at (x, y), if any -- a rival's reach keeps its tiles out of the landing's auto-claim. */
  reachOwnerAt: (x: number, y: number) => string | undefined;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
};

const isLandForReach =
  (tiles: ReadonlyMap<string, DomainTileState>) =>
  (x: number, y: number): boolean => {
    const tile = tiles.get(simulationTileKey(x, y));
    return tile ? tile.terrain === "LAND" : true;
  };

/**
 * Removes every unclaimed, not-yet-activated waystation inside the reach of a
 * freshly landed AFC at (x, y). The AFC's reach grant auto-claims that whole
 * disk, and claiming a waystation tile activates it -- so without this a
 * waystation next to the landing site pays out (and pops its reward dialog)
 * the instant the player arrives, for no action of theirs, right on top of
 * the landing sequence. Waystations are an expansion reward; one inside the
 * starting disk is removed instead of granted.
 *
 * The landing tile itself is skipped (see withoutLandingWaystation).
 * Activated waystations are left alone (they can never fire again), as are
 * waystations on tiles someone already owns, tiles a rival's reach covers
 * (the auto-claim won't take those either) and tiles mid-fight or
 * mid-settle. The disk is the landing player's real AFC reach, including any
 * town reach bonus (withAfcReachRadii).
 *
 * Call alongside `clearBarbariansAroundAfcLanding`, BEFORE the AFC tile is
 * written (that write is what triggers the reach auto-claim). Returns the
 * changed tiles for the caller's TILE_DELTA_BATCH.
 */
export const clearWaystationsAroundAfcLanding = (
  ctx: AfcLandingWaystationClearContext,
  playerId: string,
  x: number,
  y: number,
  commandId: string
): DomainTileState[] => {
  const removed: DomainTileState[] = [];
  // The landing tile is stripped by withoutLandingWaystation on the AFC write; a second, unowned copy here would
  // land in the same TILE_DELTA_BATCH after the AFC tile and overwrite it on the client.
  const landingKey = simulationTileKey(x, y);
  const [anchor] = withAfcReachRadii([{ x, y, ownerId: playerId, activatedAt: 0, kind: "TOWN" }], ctx.players);
  for (const tileKey of tileKeysInReach(anchor!, isLandForReach(ctx.tiles))) {
    if (tileKey === landingKey) continue;
    const tile = ctx.tiles.get(tileKey);
    if (!tile?.waystation || tile.waystation.activated || tile.ownerId) continue;
    if (ctx.locksByTile.has(tileKey) || ctx.pendingSettlementsByTile.has(tileKey)) continue;
    const reachOwner = ctx.reachOwnerAt(tile.x, tile.y);
    if (reachOwner && reachOwner !== playerId) continue;
    const { waystation: _removed, ...withoutWaystation } = tile;
    ctx.replaceTileState(tileKey, withoutWaystation, commandId);
    removed.push(withoutWaystation);
  }
  if (removed.length > 0) {
    ctx.runtimeLogInfo({ type: "afc_landing_waystations_cleared", commandId, x, y, cleared: removed.length }, "removed waystations around AFC landing");
  }
  return removed;
};

/**
 * The landing tile itself: callers build the AFC tile from the tile they read
 * before `clearWaystationsAroundAfcLanding` ran, so strip an unactivated
 * waystation from that copy too or it would be written straight back.
 */
export const withoutLandingWaystation = (tile: DomainTileState): DomainTileState => {
  if (!tile.waystation || tile.waystation.activated) return tile;
  const { waystation: _removed, ...rest } = tile;
  return rest;
};
