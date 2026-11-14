import type { DomainTileState } from "@border-empires/game-domain";
import type { PlayerCandidateIndex } from "../player-candidate-index/player-candidate-index.js";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";
import { mirrorCandidateKeysIntoCache, resetCandidateKeysFromSummary, type PlannerTileKeysCacheEntry } from "../planner-tile-keys-cache.js";
import {
  rebuildPlannerCandidateIndexesForPlayer,
  refreshPlannerCandidateIndexesAroundTileChange,
  refreshPlayerCandidateIndexAnchorForTile
} from "../runtime-tile-index-maintenance.js";

// Extracted from runtime.ts (500-line source budget, AGENTS.md): the three
// planner candidate-index hooks the runtime calls on a player rebuild and on
// every tile write. Each one mirrors the rebuilt candidate keys into the
// planner's per-player tile-key cache so the two never drift apart.

export type PlannerCandidateWiringDeps = {
  readonly tiles: () => ReadonlyMap<string, DomainTileState>;
  readonly playerCandidateIndex: PlayerCandidateIndex;
  readonly plannerTileKeyCacheByPlayer: ReadonlyMap<string, PlannerTileKeysCacheEntry>;
  readonly summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  readonly markPlannerPlayerTileCollectionDirty: (playerId: string) => void;
};

export type PlannerCandidateWiring = {
  readonly rebuildForPlayer: (playerId: string) => void;
  readonly refreshAroundTileChange: (tileKey: string, previous?: DomainTileState, next?: DomainTileState) => void;
  readonly refreshAnchorForTile: (tileKey: string, previous: DomainTileState | undefined, next: DomainTileState) => void;
};

export const createPlannerCandidateWiring = (deps: PlannerCandidateWiringDeps): PlannerCandidateWiring => ({
  rebuildForPlayer: (playerId) => {
    rebuildPlannerCandidateIndexesForPlayer({
      playerId,
      tiles: deps.tiles(),
      summary: deps.summaryForPlayer(playerId),
      markPlannerPlayerTileCollectionDirty: (id) => deps.markPlannerPlayerTileCollectionDirty(id),
      onCandidateRebuildComplete: (id, summary) => {
        const entry = deps.plannerTileKeyCacheByPlayer.get(id);
        if (entry) resetCandidateKeysFromSummary(entry, summary);
      }
    });
  },
  refreshAroundTileChange: (tileKey, previous, next) => {
    refreshPlannerCandidateIndexesAroundTileChange({
      tileKey,
      previous,
      next,
      tiles: deps.tiles(),
      playerCandidateIndex: deps.playerCandidateIndex,
      summaryForPlayer: (playerId) => deps.summaryForPlayer(playerId),
      markPlannerPlayerTileCollectionDirty: (playerId) => deps.markPlannerPlayerTileCollectionDirty(playerId),
      onCandidateKeysUpdated: (playerId, affectedKeys, summary) => {
        const entry = deps.plannerTileKeyCacheByPlayer.get(playerId);
        if (entry) mirrorCandidateKeysIntoCache(entry, affectedKeys, summary);
      }
    });
  },
  refreshAnchorForTile: (tileKey, previous, next) => {
    refreshPlayerCandidateIndexAnchorForTile({ playerCandidateIndex: deps.playerCandidateIndex, tiles: deps.tiles(), tileKey, previous, next });
  }
});
