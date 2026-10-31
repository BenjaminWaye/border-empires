import { TILE_OVERLAY_WIRE_FIELDS } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import { supportRingCandidates, MAX_SUPPORT_RING_RADIUS } from "@border-empires/shared";
import type { SimulationTileWireDelta } from "../runtime-types.js";
import { assignedTownKeyForSupportTile } from "../town-support-lookup.js";
import {
  filterTileDeltasForPlayer, type TileDeltaVisibilityFilterDeps, type TileDeltaVisibilityFilterOptions, type VisibilityCoverageReader
} from "../tile-delta-visibility-filter.js";

export type DistrictDeltaInput = Pick<SimulationTileWireDelta, "x" | "y"> & {
  [K in Exclude<keyof SimulationTileWireDelta, "x" | "y">]?: SimulationTileWireDelta[K] | undefined;
};

const normalizeDelta = (input: DistrictDeltaInput): SimulationTileWireDelta => {
  const out: SimulationTileWireDelta = { x: input.x, y: input.y };
  const copy = <K extends keyof SimulationTileWireDelta>(key: K): void => {
    const value = input[key];
    if (value !== undefined) out[key] = value as Exclude<SimulationTileWireDelta[K], undefined>;
  };
  for (const key of Object.keys(input) as Array<keyof SimulationTileWireDelta>) copy(key);
  // Undefined overlay/ownership fields are explicit clears, unlike absent
  // optional scalar data. Preserve their own-property presence on sparse wire.
  for (const { camel } of TILE_OVERLAY_WIRE_FIELDS) if (camel in input) out[camel] = input[camel];
  if ("ownerId" in input) out.ownerId = input.ownerId;
  if ("ownershipState" in input) out.ownershipState = input.ownershipState;
  return out;
};

type OverlayFields = Pick<SimulationTileWireDelta, "economicStructureJson" | "observatoryJson">;

// Derived only at the per-viewer wire boundary. Never mutate/persist a domain
// structure or cache these fields across viewers. Existing JSON overlay fields
// carry the additive metadata through both protocols without a schema break.
export const districtOverlayProjection = (
  tiles: ReadonlyMap<string, DomainTileState>, tile: DomainTileState,
  canSee: (key: string) => boolean
): OverlayFields => {
  if (!tile.economicStructure && !tile.observatory) return {};
  const key = tile.ownerId && tile.ownershipState === "SETTLED"
    ? assignedTownKeyForSupportTile(tiles, tile.ownerId, tile.x, tile.y) : undefined;
  const anchor = key ? tiles.get(key) : undefined;
  const supportAnchor = key && !canSee(key) ? undefined : anchor ? { x: anchor.x, y: anchor.y } : null;
  return {
    ...(tile.economicStructure ? { economicStructureJson: JSON.stringify({ ...tile.economicStructure, supportAnchor }) } : {}),
    ...(tile.observatory ? { observatoryJson: JSON.stringify({ ...tile.observatory, supportAnchor }) } : {})
  };
};

type FilterCallbacks = Pick<TileDeltaVisibilityFilterDeps, "summaryForPlayer" | "hasFullVision" | "onVisibilityAudit">;
export type DistrictProjectionState = Pick<TileDeltaVisibilityFilterDeps, "players" | "locksByTile" | "docks" | "dockLinksByDockTileKey"> & {
  readonly tiles: ReadonlyMap<string, DomainTileState>;
  readonly visibilityCoverage: VisibilityCoverageReader;
};

export const filterDistrictDeltasForRuntime = (
  state: DistrictProjectionState, deltas: readonly DistrictDeltaInput[], playerId: string,
  options: TileDeltaVisibilityFilterOptions | undefined, callbacks: FilterCallbacks
): SimulationTileWireDelta[] => {
  const deps: TileDeltaVisibilityFilterDeps = { ...state, ...callbacks };
  const visible = filterTileDeltasForPlayer(deps, deltas, playerId, options).map(normalizeDelta);
  if (!visible.length) return visible;
  const full = callbacks.hasFullVision?.(playerId) ?? false;
  const canSee = (key: string): boolean => full || state.visibilityCoverage.isVisible(playerId, key);
  const included = new Set(visible.map(tile => `${tile.x},${tile.y}`));
  const refreshed = new Set<string>();
  const result: SimulationTileWireDelta[] = [];
  for (const delta of visible) {
    const key = `${delta.x},${delta.y}`;
    const tile = state.tiles.get(key);
    // A forced combat result or ownership clear can be delivered outside live
    // vision. Do not use it to reveal other overlays or a hidden town anchor.
    if (!tile || delta.ownershipClearOnly || !canSee(key)) { result.push(delta); continue; }
    result.push({ ...delta, ...districtOverlayProjection(state.tiles, tile, canSee) });
    // A town capture/tier change/reveal changes neighbouring assignments even
    // though those buildings themselves did not mutate. Refresh bounded local
    // overlays, without copying combat/event payloads to those neighbours.
    if (!tile.town && !("townJson" in delta)) continue;
    for (const { tile: neighbor } of supportRingCandidates(state.tiles, tile.x, tile.y, MAX_SUPPORT_RING_RADIUS)) {
      const neighborKey = `${neighbor.x},${neighbor.y}`;
      if (included.has(neighborKey) || refreshed.has(neighborKey) || !canSee(neighborKey)) continue;
      if (!neighbor.economicStructure && !neighbor.observatory) continue;
      refreshed.add(neighborKey);
      result.push({ x: neighbor.x, y: neighbor.y, terrain: neighbor.terrain,
        ownerId: neighbor.ownerId, ownershipState: neighbor.ownershipState, visibilityState: "VISIBLE",
        ...districtOverlayProjection(state.tiles, neighbor, canSee) });
    }
  }
  return result;
};
