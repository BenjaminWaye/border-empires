import { followsLandmarkOwnership, landmarkFootprintCentre, landmarkSuperTileAt, landmarkSuperTileMembers } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";

import { simulationTileKey } from "../seed-state/seed-state.js";

type TileLookup = { get(key: string): DomainTileState | undefined };

/** The ownership fields every member of an AFC/relic super tile shares. */
const SHARED_FIELDS = ["ownerId", "ownershipState", "frontierDecayAt", "frontierDecayKind", "healAt", "captureHoldUntil"] as const;

const sameOwnership = (a: DomainTileState | undefined, b: DomainTileState): boolean =>
  SHARED_FIELDS.every(field => a?.[field] === b[field]);

/** `member` carrying `source`'s ownership fields; absent source fields are removed. */
export const withSuperTileOwnership = (member: DomainTileState, source: DomainTileState): DomainTileState => {
  const next: DomainTileState = { ...member };
  for (const field of SHARED_FIELDS) {
    if (source[field] === undefined) delete next[field];
    else (next as Record<(typeof SHARED_FIELDS)[number], unknown>)[field] = source[field];
  }
  return next;
};

/**
 * Where an action aimed at (x, y) lands: the landmark centre when (x, y) is a
 * member of an AFC/relic super tile, otherwise the tile itself.
 */
export const superTileActionTarget = (tiles: TileLookup, tile: DomainTileState): DomainTileState =>
  landmarkSuperTileAt(tiles, tile.x, tile.y)?.centre ?? tile;

export type LandmarkSuperTileSyncContext = {
  tiles: TileLookup;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"][number];
  emitEvent: (event: SimulationEvent) => void;
};

/**
 * After a tile write: when the ownership of any member of a super tile
 * changed, give every other member the same ownership, so the nine tiles are
 * captured, settled, lost and decayed together. Re-entrant writes made by the
 * sync itself are skipped.
 */
export const createLandmarkSuperTileSync = (ctx: LandmarkSuperTileSyncContext) => {
  let syncing = false;
  return (previous: DomainTileState | undefined, tile: DomainTileState, commandId: string): void => {
    if (syncing || sameOwnership(previous, tile)) return;
    const superTile = landmarkSuperTileAt(ctx.tiles, tile.x, tile.y);
    if (!superTile) return;
    const changed: DomainTileState[] = [];
    syncing = true;
    try {
      for (const member of superTile.members) {
        if (member.x === tile.x && member.y === tile.y) continue;
        const current = ctx.tiles.get(simulationTileKey(member.x, member.y)) ?? member;
        if (sameOwnership(current, tile)) continue;
        const next = withSuperTileOwnership(current, tile);
        ctx.replaceTileState(simulationTileKey(member.x, member.y), next, commandId);
        changed.push(ctx.tiles.get(simulationTileKey(member.x, member.y)) ?? next);
      }
    } finally {
      syncing = false;
    }
    const playerId = tile.ownerId ?? previous?.ownerId;
    if (changed.length > 0 && playerId) {
      ctx.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: changed.map(member => ctx.tileDeltaFromState(member)) });
    }
  };
};

/**
 * Boot pass: bring every super tile's footprint in line with its centre
 * (worlds from before the rule, or footprints written while it was absent).
 * Mutates the map before the runtime builds its indexes. Returns the number
 * of footprint tiles changed.
 */
export const alignLandmarkSuperTiles = (tiles: Map<string, DomainTileState>): number => {
  let changed = 0;
  for (const centre of tiles.values()) {
    if (!centre.afc && !centre.naturalWonder) continue;
    if (landmarkFootprintCentre(tiles, centre.x, centre.y) !== centre) continue;
    for (const member of landmarkSuperTileMembers(tiles, centre)) {
      if (member === centre || !followsLandmarkOwnership(member) || sameOwnership(member, centre)) continue;
      tiles.set(simulationTileKey(member.x, member.y), withSuperTileOwnership(member, centre));
      changed += 1;
    }
  }
  return changed;
};
