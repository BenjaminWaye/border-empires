/**
 * Central neighbor re-emission for radius/topology yield sources.
 *
 * Root cause (docs/plans/2026-07-06-radius-yield-delivery.md): a Waterworks
 * boosting a nearby Farmstead's food output (or a Foundry boosting a nearby
 * Mine, or a Harbor Exchange/dock chain boosting dock income) recomputes
 * correctly server-side on the BENEFICIARY tile's own next read, but nothing
 * re-emits that beneficiary tile's delta when the SOURCE tile's projecting
 * status changes (build/remove/settle/capture/aether-purge/bombard/
 * worldbreaker). Without an explicit push, the client's cached value goes
 * stale until the beneficiary tile itself is mutated for an unrelated reason.
 *
 * `replaceTileState` is the single mutation choke point for tile state
 * (see runtime-lock-resolution.ts model: applyBreachToNeighbors), so hooking
 * neighbor detection there — rather than in each of the many command
 * handlers that call replaceTileState — automatically covers every mutation
 * path without per-handler edits.
 *
 * Encirclement needs no handling here: cut-off only clears FRONTIER tiles
 * (runtime-encirclement-application.ts), which never carry an active
 * projecting structure (only SETTLED tiles can).
 */

import type { DomainTileState } from "@border-empires/game-domain";
import { FOUNDRY_RADIUS, WATERWORKS_RADIUS } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { SimulationTileWireDelta } from "../runtime-types.js";
import { coordsInChebyshevRadius } from "../territory-automation/territory-automation.js";

const PROJECTING_SOURCE_TYPES = new Set(["WATERWORKS", "FOUNDRY", "CUSTOMS_HOUSE"]);

/** True when an active/settled/owned economic structure of one of the projecting types is present. */
const isActiveProjectingSource = (tile: DomainTileState | undefined): boolean =>
  Boolean(
    tile &&
      tile.ownerId &&
      tile.ownershipState === "SETTLED" &&
      tile.economicStructure?.status === "active" &&
      PROJECTING_SOURCE_TYPES.has(tile.economicStructure.type)
  );

/** True when the tile is a settled, owned dock tile. */
const isActiveOwnedDock = (tile: DomainTileState | undefined): boolean =>
  Boolean(tile && tile.ownerId && tile.ownershipState === "SETTLED" && tile.dockId);

// Iterates only the radius's own coordinates (O(radius^2), e.g. <=441 for
// WATERWORKS_RADIUS=10) and looks each up directly in the tile map, rather
// than scanning the owner's entire settled-tile array (which was O(territory)
// and, for a large multi-thousand-tile empire, a full-empire scan run
// synchronously inside replaceTileState on every source toggle).
const beneficiaryTilesWithinRadius = (
  ownerId: string,
  originX: number,
  originY: number,
  radius: number,
  beneficiaryStructureType: string,
  tiles: ReadonlyMap<string, DomainTileState>
): DomainTileState[] => {
  const out: DomainTileState[] = [];
  for (const { x, y } of coordsInChebyshevRadius(originX, originY, radius)) {
    const tile = tiles.get(`${x},${y}`);
    if (
      tile &&
      tile.ownerId === ownerId &&
      tile.economicStructure?.status === "active" &&
      tile.economicStructure.type === beneficiaryStructureType
    ) {
      out.push(tile);
    }
  }
  return out;
};

const adjacentOwnedDockTiles = (
  ownerId: string,
  originX: number,
  originY: number,
  tiles: ReadonlyMap<string, DomainTileState>
): DomainTileState[] => {
  const out: DomainTileState[] = [];
  // World-wrapping 8-neighbor scan via coordsInChebyshevRadius (radius 1) —
  // matches dockSupportedByCustomsHouse's wrap-aware keyFor lookup in
  // economy-network.ts, so a Customs House adjacent to a dock across the
  // map's x/y seam refreshes that dock's delta the same way it grants income.
  for (const { x, y } of coordsInChebyshevRadius(originX, originY, 1)) {
    const neighbor = tiles.get(`${x},${y}`);
    if (neighbor && isActiveOwnedDock(neighbor) && neighbor.ownerId === ownerId) out.push(neighbor);
  }
  return out;
};

const connectedOwnedDockTiles = (
  ownerId: string,
  tileKey: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>
): DomainTileState[] => {
  const linkedKeys = dockLinksByDockTileKey.get(tileKey) ?? [];
  const out: DomainTileState[] = [];
  for (const linkedKey of linkedKeys) {
    const linked = tiles.get(linkedKey);
    if (linked && isActiveOwnedDock(linked) && linked.ownerId === ownerId) out.push(linked);
  }
  return out;
};

/**
 * Given the previous and next state of a mutated tile, returns the set of
 * beneficiary tiles (belonging to the projecting structure's owner, and — on
 * an ownership change — the previous owner too) whose yield delta must be
 * re-emitted because a radius/topology source's projecting status changed.
 *
 * Returns an empty array when the tile mutation involves no projecting
 * source or dock-topology change — the common case, so callers should treat
 * an empty result as a fast no-op.
 */
export const radiusYieldRefreshBeneficiaryTiles = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  tiles: ReadonlyMap<string, DomainTileState>;
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  settledTilesForPlayer: (playerId: string) => readonly DomainTileState[];
}): DomainTileState[] => {
  // settledTilesForPlayer is no longer needed here (beneficiaryTilesWithinRadius
  // now looks up radius coords directly in `tiles`) but stays part of the
  // input contract since flushRadiusYieldRefresh's callers already build it.
  const { previous, next, tiles, dockLinksByDockTileKey } = input;

  const wasSource = isActiveProjectingSource(previous);
  const isSource = isActiveProjectingSource(next);
  const wasDock = isActiveOwnedDock(previous);
  const isDock = isActiveOwnedDock(next);
  const prevSourceType = wasSource ? previous?.economicStructure?.type : undefined;
  const nextSourceType = isSource ? next.economicStructure?.type : undefined;
  // A direct type swap between two projecting types in one mutation (e.g. a
  // future "convert structure" command turning a WATERWORKS straight into a
  // FOUNDRY with no intermediate removal) leaves wasSource === isSource
  // (both true), so it must be treated as its own change — otherwise neither
  // the old type's beneficiaries (which should lose the bonus) nor the new
  // type's beneficiaries (which should gain one) get refreshed.
  const sourceTypeChanged = wasSource && isSource && prevSourceType !== nextSourceType;
  // An active source/dock whose owner changed (rare, but possible if a future
  // ability transfers ownership without clearing the structure) still needs a
  // beneficiary refresh for both the old and new owner's neighbor tiles.
  const sourceOwnerChanged = wasSource && isSource && !sourceTypeChanged && previous?.ownerId !== next.ownerId;
  const dockOwnerChanged = wasDock && isDock && previous?.ownerId !== next.ownerId;

  if (
    wasSource === isSource &&
    !sourceTypeChanged &&
    wasDock === isDock &&
    !sourceOwnerChanged &&
    !dockOwnerChanged
  ) {
    return [];
  }

  const beneficiaries = new Map<string, DomainTileState>();
  const addAll = (list: readonly DomainTileState[]): void => {
    for (const tile of list) beneficiaries.set(`${tile.x},${tile.y}`, tile);
  };

  const ownerIds = new Set([previous?.ownerId, next.ownerId].filter((id): id is string => Boolean(id)));

  const refreshForSourceType = (structureType: string | undefined): void => {
    if (!structureType) return;
    for (const ownerId of ownerIds) {
      if (structureType === "WATERWORKS") {
        addAll(beneficiaryTilesWithinRadius(ownerId, next.x, next.y, WATERWORKS_RADIUS, "FARMSTEAD", tiles));
      } else if (structureType === "FOUNDRY") {
        addAll(beneficiaryTilesWithinRadius(ownerId, next.x, next.y, FOUNDRY_RADIUS, "MINE", tiles));
      } else if (structureType === "CUSTOMS_HOUSE") {
        addAll(adjacentOwnedDockTiles(ownerId, next.x, next.y, tiles));
      }
    }
  };

  if (sourceTypeChanged) {
    // Refresh beneficiaries of both the departing and arriving source types.
    refreshForSourceType(prevSourceType);
    refreshForSourceType(nextSourceType);
  } else if (wasSource !== isSource || sourceOwnerChanged) {
    refreshForSourceType(prevSourceType ?? nextSourceType);
  }

  if (wasDock !== isDock || dockOwnerChanged) {
    for (const ownerId of ownerIds) {
      addAll(connectedOwnedDockTiles(ownerId, input.tileKey, tiles, dockLinksByDockTileKey));
    }
  }

  beneficiaries.delete(input.tileKey);
  return [...beneficiaries.values()];
};

/**
 * Computes beneficiary tiles for the given mutation and, if any exist,
 * emits a single broadcast `TILE_DELTA_BATCH` carrying their fresh yield
 * deltas. Thin wrapper around `radiusYieldRefreshBeneficiaryTiles` so the
 * `replaceTileState` call site in runtime.ts stays a one-line call —
 * runtime.ts is already over the 500-line file cap and must not grow
 * (see docs/plans/2026-07-06-radius-yield-delivery.md constraints).
 */
export const flushRadiusYieldRefresh = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  tiles: ReadonlyMap<string, DomainTileState>;
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  settledTilesForPlayer: (playerId: string) => readonly DomainTileState[];
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
  now: () => number;
}): void => {
  const beneficiaries = radiusYieldRefreshBeneficiaryTiles(input);
  if (beneficiaries.length === 0) return;
  input.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: `radius-yield-refresh:${input.tileKey}:${input.now()}`,
    playerId: "__broadcast__",
    tileDeltas: beneficiaries.map((beneficiaryTile) => input.tileDeltaFromState(beneficiaryTile))
  });
};
