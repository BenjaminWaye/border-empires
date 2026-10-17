/**
 * Central neighbor re-emission for dock-income yield sources.
 *
 * Root cause (docs/plans/2026-07-06-radius-yield-delivery.md): a dock's gold
 * rate depends on its neighbors — an adjacent Harbor Exchange and its linked
 * docks — and is server-authoritative on the wire (the client can't re-derive
 * dock-link topology; see tileYieldNeedsServerAuthority). It recomputes
 * correctly on the dock tile's own next read, but nothing re-emits that dock's
 * delta when the SOURCE tile changes (build/remove/settle/capture/aether-purge/
 * bombard/worldbreaker). Without an explicit push, the client's cached rate
 * goes stale until the dock itself is mutated for an unrelated reason.
 *
 * Hydroworks/Ore Refinery radius boosts used to be refreshed here too, but
 * they only ever fed the retired per-tile strategic yield; their beneficiaries
 * carry no server-computed value any more, so they're no longer re-emitted.
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
import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { SimulationTileWireDelta } from "../runtime-types.js";
import { coordsInChebyshevRadius } from "../territory-automation/territory-automation.js";

// §5.4: deliberately NOT dormancy-aware. This module only decides WHEN to
// re-push a dock's delta (so a client's cached rate doesn't go stale), not
// what the delta's value is — that's computed downstream (economy-network.ts/
// tile-yield-view.ts, which ARE dormancy-aware).
/** True when an active, settled, owned Harbor Exchange sits on the tile. */
const isActiveHarborExchange = (tile: DomainTileState | undefined): boolean =>
  Boolean(
    tile &&
      tile.ownerId &&
      tile.ownershipState === "SETTLED" &&
      tile.economicStructure?.status === "active" &&
      tile.economicStructure.type === "HARBOR_EXCHANGE"
  );

/** True when the tile is a settled, owned dock tile. */
const isActiveOwnedDock = (tile: DomainTileState | undefined): boolean =>
  Boolean(tile && tile.ownerId && tile.ownershipState === "SETTLED" && tile.dockId);

const adjacentOwnedDockTiles = (
  ownerId: string,
  originX: number,
  originY: number,
  tiles: ReadonlyMap<string, DomainTileState>
): DomainTileState[] => {
  const out: DomainTileState[] = [];
  // World-wrapping 8-neighbor scan via coordsInChebyshevRadius (radius 1) —
  // matches dockSupportedByHarborExchange's wrap-aware keyFor lookup in
  // economy-network.ts, so a Harbor Exchange adjacent to a dock across the
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
 * Given the previous and next state of a mutated tile, returns the dock tiles
 * (belonging to the source's owner, and — on an ownership change — the
 * previous owner too) whose yield delta must be re-emitted because a Harbor
 * Exchange or a linked dock changed.
 *
 * Returns an empty array when the mutation involves no Harbor Exchange or
 * dock change — the common case, so callers should treat an empty result as
 * a fast no-op.
 */
export const radiusYieldRefreshBeneficiaryTiles = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  tiles: ReadonlyMap<string, DomainTileState>;
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  settledTilesForPlayer: (playerId: string) => readonly DomainTileState[];
}): DomainTileState[] => {
  // settledTilesForPlayer is no longer needed here but stays part of the input
  // contract since flushRadiusYieldRefresh's callers already build it.
  const { previous, next, tiles, dockLinksByDockTileKey } = input;

  const wasExchange = isActiveHarborExchange(previous);
  const isExchange = isActiveHarborExchange(next);
  const wasDock = isActiveOwnedDock(previous);
  const isDock = isActiveOwnedDock(next);
  // An active exchange/dock whose owner changed (rare, but possible if a
  // future ability transfers ownership without clearing the structure) still
  // needs a refresh for both the old and new owner's docks.
  const exchangeOwnerChanged = wasExchange && isExchange && previous?.ownerId !== next.ownerId;
  const dockOwnerChanged = wasDock && isDock && previous?.ownerId !== next.ownerId;

  if (wasExchange === isExchange && wasDock === isDock && !exchangeOwnerChanged && !dockOwnerChanged) {
    return [];
  }

  const beneficiaries = new Map<string, DomainTileState>();
  const addAll = (list: readonly DomainTileState[]): void => {
    for (const tile of list) beneficiaries.set(`${tile.x},${tile.y}`, tile);
  };
  const ownerIds = new Set([previous?.ownerId, next.ownerId].filter((id): id is string => Boolean(id)));

  if (wasExchange !== isExchange || exchangeOwnerChanged) {
    for (const ownerId of ownerIds) addAll(adjacentOwnedDockTiles(ownerId, next.x, next.y, tiles));
  }
  if (wasDock !== isDock || dockOwnerChanged) {
    for (const ownerId of ownerIds) addAll(connectedOwnedDockTiles(ownerId, input.tileKey, tiles, dockLinksByDockTileKey));
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
