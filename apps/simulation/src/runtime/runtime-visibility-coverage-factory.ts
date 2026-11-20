import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { DomainPlayer } from "@border-empires/game-domain";

import { effectiveVisionRadiusForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";
import { VisibilityCoverageTracker } from "../visibility-coverage-cache.js";
import type { VisionFootprintTable } from "../vision-footprint-table.js";

export type RuntimeVisibilityCoverageDeps = {
  readonly players: () => ReadonlyMap<string, DomainPlayer>;
  readonly summaryForPlayer: (playerId: string) => { territoryTileKeys: ReadonlySet<string>; frontierTileKeys: ReadonlySet<string> };
  readonly footprintTable: VisionFootprintTable | undefined;
  /** Every tile entering a player's vision for the first time since it was last unseen (explored-tiles-store.ts). */
  readonly onFirstSeen: (viewerId: string, tileKey: string) => void;
  /** Every 0→1 / 1→0 coverage edge (Planetary Defense camp awake counts). */
  readonly onCoverageEdge?: (viewerId: string, tileKey: string, entered: boolean) => void;
};

/** The runtime's O(radius²)-per-change coverage for the TILE_DELTA_BATCH hot path (see visibility-coverage-cache.ts). */
export const createRuntimeVisibilityCoverage = (deps: RuntimeVisibilityCoverageDeps): VisibilityCoverageTracker =>
  new VisibilityCoverageTracker(WORLD_WIDTH, WORLD_HEIGHT, {
    visionRadiusForPlayer: (id) => { const p = deps.players().get(id); return p ? effectiveVisionRadiusForPlayer(p) : 1; },
    getPlayer: (id) => deps.players().get(id),
    settledTileKeysForPlayer: (id) => {
      const summary = deps.summaryForPlayer(id);
      if (summary.frontierTileKeys.size === 0) return summary.territoryTileKeys;
      const settled = new Set<string>();
      for (const key of summary.territoryTileKeys) if (!summary.frontierTileKeys.has(key)) settled.add(key);
      return settled;
    },
    frontierTileKeysForPlayer: (id) => deps.summaryForPlayer(id).frontierTileKeys,
    onFirstSeen: deps.onFirstSeen,
    ...(deps.onCoverageEdge ? { onCoverageEdge: deps.onCoverageEdge } : {})
  }, deps.footprintTable);
