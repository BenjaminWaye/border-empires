// Extracted out of runtime/runtime.ts (500-line file cap, AGENTS.md): the
// coverage-deps bundles and active-index tile lookups that the Light/Siege
// Battery (runtime-outpost-vision.ts) and Observatory
// (runtime-observatory-vision.ts) vision-bonus seed/reconcile/resync calls
// share. Centralized so isStructureDormant's wiring can't drift between call
// sites.
import type { DomainTileState } from "@border-empires/game-domain";
import type { OutpostVisionCoverageDeps } from "./runtime-outpost-vision.js";
import type { ObservatoryVisionCoverageDeps } from "./runtime-observatory-vision.js";

export type StructureVisionWiringDeps = {
  readonly tiles: () => ReadonlyMap<string, DomainTileState>;
  readonly players: () => OutpostVisionCoverageDeps["players"];
  readonly coverage: () => OutpostVisionCoverageDeps["coverage"] & ObservatoryVisionCoverageDeps["coverage"];
  readonly callbacks: () => NonNullable<OutpostVisionCoverageDeps["callbacks"]>;
  readonly isStructureDormant: (ownerId: string, tileKey: string, field: "siegeBattery" | "economicStructure" | "observatory") => boolean;
  readonly activeRelayBeaconsByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  readonly activeSiegeBatteriesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  readonly activeObservatoriesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
};

export type StructureVisionWiring = {
  readonly outpostVisionDeps: () => OutpostVisionCoverageDeps;
  readonly observatoryVisionDeps: () => ObservatoryVisionCoverageDeps;
  /**
   * Resolved tiles for resyncPlayerOutpostVisionBonuses (a tech unlock's
   * effect on Light/Siege Battery vision rings) — sourced from the
   * active-only outpost indexes rather than a full tile scan; see
   * resyncPlayerOutpostVisionBonuses's own doc comment for the trade-off.
   */
  readonly ownedOutpostTilesForPlayer: (playerId: string) => DomainTileState[];
  /** Mirrors ownedOutpostTilesForPlayer, for the active-only Observatory index. */
  readonly ownedObservatoryTilesForPlayer: (playerId: string) => DomainTileState[];
};

export const createStructureVisionWiring = (deps: StructureVisionWiringDeps): StructureVisionWiring => {
  // Resolves active-structure-index tile keys into current tile states.
  const tilesForKeys = (tileKeys: Iterable<string>): DomainTileState[] => {
    const tiles: DomainTileState[] = [];
    for (const tileKey of tileKeys) {
      const tile = deps.tiles().get(tileKey);
      if (tile) tiles.push(tile);
    }
    return tiles;
  };
  return {
    outpostVisionDeps: () => ({
      players: deps.players(),
      coverage: deps.coverage(),
      isStructureDormant: deps.isStructureDormant,
      callbacks: deps.callbacks()
    }),
    observatoryVisionDeps: () => ({
      isStructureDormant: deps.isStructureDormant,
      coverage: deps.coverage(),
      callbacks: deps.callbacks()
    }),
    ownedOutpostTilesForPlayer: (playerId) =>
      tilesForKeys(new Set<string>([...(deps.activeRelayBeaconsByOwner.get(playerId) ?? []), ...(deps.activeSiegeBatteriesByOwner.get(playerId) ?? [])])),
    ownedObservatoryTilesForPlayer: (playerId) => tilesForKeys(deps.activeObservatoriesByOwner.get(playerId) ?? [])
  };
};
