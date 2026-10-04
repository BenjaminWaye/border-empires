import { tileKeysInReach } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";

export type AfcLandingBarbarianClearContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  locksByTile: ReadonlyMap<string, unknown>;
  pendingSettlementsByTile: ReadonlyMap<string, unknown>;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
};

// Same land-gating as the runtime's own isLandTileQuery (unknown tiles count as
// land), so this walks exactly the disk the new AFC's reach will cover.
const isLandForReach =
  (tiles: ReadonlyMap<string, DomainTileState>) =>
  (x: number, y: number): boolean => {
    const tile = tiles.get(`${x},${y}`);
    return tile ? tile.terrain === "LAND" : true;
  };

/**
 * Releases every barbarian tile inside the reach of a freshly landed AFC at
 * (x, y) back to neutral, so a new player never spawns into barbarians already
 * sitting on their own doorstep. Spawn placement deliberately ignores
 * barbarians (they must not push real players apart), so without this a
 * spawn can land with barbarians all over its first ring.
 *
 * Same release shape as a barbarian walk (runtime-barbarian-walk.ts): drop
 * owner/state/muster, keep the static features (resource, town, dock, ...).
 * Goes through `replaceTileState` so barbarian walk progress is dropped by the
 * runtime's own "left barbarian ownership" hook. Tiles with a lock in flight
 * or a pending settlement are left alone rather than corrupting a live fight.
 *
 * Call after `prepareAfcLandingFootprint` (so flattened mountains are land for
 * the reach walk) and BEFORE the AFC tile is written, so the AFC's reach grant
 * auto-claims the cleared ground FRONTIER like any other neutral tile in its
 * disk. Returns the released tiles for the caller's TILE_DELTA_BATCH.
 */
export const clearBarbariansAroundAfcLanding = (
  ctx: AfcLandingBarbarianClearContext,
  x: number,
  y: number,
  commandId: string
): DomainTileState[] => {
  const released: DomainTileState[] = [];
  for (const tileKey of tileKeysInReach({ x, y, ownerId: "", activatedAt: 0, kind: "TOWN" }, isLandForReach(ctx.tiles))) {
    const tile = ctx.tiles.get(tileKey);
    if (!tile?.ownerId?.startsWith("barbarian-")) continue;
    if (ctx.locksByTile.has(tileKey) || ctx.pendingSettlementsByTile.has(tileKey)) continue;
    const neutral: DomainTileState = {
      x: tile.x,
      y: tile.y,
      terrain: tile.terrain,
      ...(tile.resource ? { resource: tile.resource } : {}),
      ...(tile.dockId ? { dockId: tile.dockId } : {}),
      ...(tile.town ? { town: tile.town } : {}),
      ...(tile.shardSite ? { shardSite: tile.shardSite } : {}),
      ...(tile.naturalWonder ? { naturalWonder: tile.naturalWonder } : {}),
      ...(tile.watchtower ? { watchtower: tile.watchtower } : {}),
      ...(tile.economicStructure ? { economicStructure: tile.economicStructure } : {})
    };
    ctx.replaceTileState(tileKey, neutral, commandId);
    released.push(neutral);
  }
  if (released.length > 0) {
    ctx.runtimeLogInfo({ type: "afc_landing_barbarians_cleared", commandId, x, y, cleared: released.length }, "released barbarian tiles around AFC landing");
  }
  return released;
};
