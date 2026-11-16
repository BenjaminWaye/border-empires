import { followsLandmarkOwnership, landmarkFootprintCentre, landmarkSuperTileAt, landmarkSuperTileMembers, WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";

import { simulationTileKey } from "../seed-state/seed-state.js";

type TileLookup = { get(key: string): DomainTileState | undefined };

/** The ownership fields every member of an AFC/relic super tile shares. */
const SHARED_FIELDS = ["ownerId", "ownershipState", "frontierDecayAt", "frontierDecayKind", "healAt", "captureHoldUntil"] as const;
// A drain that keeps finding new conflicts after this many passes is a hook
// ping-pong; stop rather than spin the main thread.
const MAX_DRAIN_PASSES = 64;

const sameOwnership = (a: DomainTileState | undefined, b: DomainTileState): boolean =>
  SHARED_FIELDS.every(field => a?.[field] === b[field]);
const sameOwner = (a: DomainTileState | undefined, b: DomainTileState): boolean =>
  a?.ownerId === b.ownerId && a?.ownershipState === b.ownershipState;
const isLandmark = (tile: DomainTileState | undefined): boolean => Boolean(tile?.afc || tile?.naturalWonder);
const tileKeyOf = (tile: { x: number; y: number }): string => simulationTileKey(tile.x, tile.y);

/** `member` carrying `source`'s ownership fields; absent source fields are removed, and a muster flag never outlives its owner. */
export const withSuperTileOwnership = (member: DomainTileState, source: DomainTileState): DomainTileState => {
  const next: DomainTileState = { ...member };
  for (const field of SHARED_FIELDS) {
    if (source[field] === undefined) delete next[field];
    else (next as Record<(typeof SHARED_FIELDS)[number], unknown>)[field] = source[field];
  }
  if (next.muster && next.muster.ownerId !== next.ownerId) delete next.muster;
  return next;
};

/**
 * Where an action aimed at (x, y) lands: the landmark centre when (x, y) is a
 * member of an AFC/relic super tile, otherwise the tile itself.
 */
export const superTileActionTarget = (tiles: TileLookup, tile: DomainTileState): DomainTileState =>
  landmarkSuperTileAt(tiles, tile.x, tile.y)?.centre ?? tile;

/** Whether a 3×3 AFC footprint at (x, y) holds plain land another player owns (an AFC must not seize it). */
export const footprintHeldByRival = (tiles: TileLookup, x: number, y: number, playerId: string): boolean => {
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    const tile = tiles.get(simulationTileKey(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT)));
    if (tile?.ownerId && tile.ownerId !== playerId && followsLandmarkOwnership(tile)) return true;
  }
  return false;
};

export type LandmarkSuperTileSyncContext = {
  tiles: TileLookup;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"][number];
  emitEvent: (event: SimulationEvent) => void;
};

type PendingSync = { sourceKey: string; commandId: string; previousOwnerId: string | undefined };

/**
 * Keeps every member of an AFC/relic super tile on one owner. Runtime wraps
 * each tile write in `write`; `record` notes ownership changes, and the
 * mirroring runs only once the outermost write (with all of its hooks) has
 * finished, so a hook that rewrites a member mid-capture cannot split the
 * site. When the centre itself changed in that write, the centre wins.
 */
export const createLandmarkSuperTileSync = (ctx: LandmarkSuperTileSyncContext) => {
  let depth = 0;
  let draining = false;
  const mirroring = new Set<string>();
  const pending = new Map<string, PendingSync>(); // centre key -> ownership source; bounded by super tiles touched in one write

  const record = (previous: DomainTileState | undefined, tile: DomainTileState, commandId: string): void => {
    const key = tileKeyOf(tile);
    if (mirroring.has(key)) return;
    const becameLandmark = !isLandmark(previous) && isLandmark(tile);
    if (!becameLandmark && sameOwner(previous, tile)) return;
    const superTile = landmarkSuperTileAt(ctx.tiles, tile.x, tile.y);
    if (!superTile) return;
    const centreKey = tileKeyOf(superTile.centre);
    const existing = pending.get(centreKey);
    if (existing?.sourceKey === centreKey && key !== centreKey) return;
    pending.set(centreKey, { sourceKey: key, commandId, previousOwnerId: existing?.previousOwnerId ?? previous?.ownerId });
  };

  const mirror = (entry: PendingSync): void => {
    const source = ctx.tiles.get(entry.sourceKey);
    const superTile = source ? landmarkSuperTileAt(ctx.tiles, source.x, source.y) : undefined;
    if (!source || !superTile) return;
    const changed: DomainTileState[] = [];
    for (const member of superTile.members) {
      const memberKey = tileKeyOf(member);
      const current = ctx.tiles.get(memberKey);
      if (memberKey === entry.sourceKey || !current || sameOwnership(current, source)) continue;
      mirroring.add(memberKey);
      try {
        ctx.replaceTileState(memberKey, withSuperTileOwnership(current, source), entry.commandId);
      } finally {
        mirroring.delete(memberKey);
      }
      changed.push(ctx.tiles.get(memberKey) ?? current);
    }
    const playerId = source.ownerId ?? entry.previousOwnerId;
    if (changed.length > 0 && playerId) {
      ctx.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: entry.commandId, playerId, tileDeltas: changed.map(member => ctx.tileDeltaFromState(member)) });
    }
  };

  const drain = (): void => {
    if (draining) return;
    draining = true;
    try {
      for (let pass = 0; pending.size > 0; pass += 1) {
        if (pass >= MAX_DRAIN_PASSES) {
          console.warn(JSON.stringify({ event: "landmark_super_tile_drain_capped", pending: pending.size }));
          pending.clear();
          break;
        }
        const [centreKey, entry] = pending.entries().next().value as [string, PendingSync];
        pending.delete(centreKey);
        mirror(entry);
      }
    } finally {
      draining = false;
    }
  };

  /** Runs one tile write; the outermost write drains the recorded super-tile syncs afterwards. */
  const write = (apply: () => void): void => {
    depth += 1;
    try {
      apply();
    } finally {
      depth -= 1;
    }
    if (depth === 0) drain();
  };

  return { write, record };
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
    if (!isLandmark(centre)) continue;
    if (landmarkFootprintCentre(tiles, centre.x, centre.y) !== centre) continue;
    for (const member of landmarkSuperTileMembers(tiles, centre)) {
      if (member === centre || sameOwnership(member, centre)) continue;
      tiles.set(tileKeyOf(member), withSuperTileOwnership(member, centre));
      changed += 1;
    }
  }
  return changed;
};
