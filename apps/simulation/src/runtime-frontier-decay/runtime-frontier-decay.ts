import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { isSettledTownAnchor } from "../territory-automation/territory-automation.js";
import {
  isBuildCandidateTile,
  isHotFrontierTile,
  isStrategicFrontierTile
} from "../ai/planner-candidate-index.js";
import type { PlayerCandidateIndex } from "../player-candidate-index/player-candidate-index.js";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";

type BulkClearFrontierOwnershipInput = {
  expiredTilesByOwner: Map<string, Array<[string, DomainTileState]>>;
  nowMs: number;
  tiles: Map<string, DomainTileState>;
  playerCandidateIndex: PlayerCandidateIndex;
  invalidateTileStringifyCache: (tileKey: string) => void;
  removeTileFromPlayerSummaries: (tileKey: string, tile: DomainTileState) => void;
  applyTileToPlayerSummaries: (tileKey: string, tile: DomainTileState) => void;
  tileSettledAtByKey: Map<string, number>;
  fortPatrolGraceUntilByTile: Map<string, number>;
  removeFrontierTileFromOwnerIndex: (tileKey: string, ownerId: string) => void;
  refreshFortAnchorIndexForTile: (
    tileKey: string,
    previous: DomainTileState | undefined,
    next: DomainTileState
  ) => void;
  cancelPendingSettlementIfOwnerChanged: (
    tileKey: string,
    nextOwnerId: string | undefined,
    commandId: string
  ) => void;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  markPlannerPlayerTileCollectionDirty: (playerId: string) => void;
};

export function bulkClearFrontierOwnership(input: BulkClearFrontierOwnershipInput): void {
  const dirtyPlannerKeysByPlayer = new Map<string, Set<string>>();
  const dirtyWatchedKeys = new Set<string>();
  const commandIdPrefix = `frontier-decay-expired-bulk:${input.nowMs}`;

  for (const [ownerId, pairs] of input.expiredTilesByOwner) {
    for (const [tileKey, expiredTile] of pairs) {
      const previous = input.tiles.get(tileKey);
      // Guard: skip tiles whose state changed since Phase 1 identified them for
      // expiry.  updateFrontierDecay is async; gRPC commands (settle, claim, fort
      // attack) may have run during the yield_() before this call and mutated the
      // tile.  Overwriting a post-yield SETTLED or re-claimed tile would corrupt
      // game state until the next frontier-decay tick.
      if (!previous || previous.ownershipState !== "FRONTIER" || previous.ownerId !== ownerId) continue;

      input.invalidateTileStringifyCache(tileKey);
      if (previous) input.removeTileFromPlayerSummaries(tileKey, previous);
      input.tiles.set(tileKey, expiredTile);
      input.applyTileToPlayerSummaries(tileKey, expiredTile);
      input.tileSettledAtByKey.delete(tileKey);
      input.fortPatrolGraceUntilByTile.delete(tileKey);
      input.removeFrontierTileFromOwnerIndex(tileKey, ownerId);
      input.refreshFortAnchorIndexForTile(tileKey, previous, expiredTile);
      input.cancelPendingSettlementIfOwnerChanged(tileKey, expiredTile.ownerId, commandIdPrefix);

      const ex = expiredTile.x;
      const ey = expiredTile.y;
      let ownerSet = dirtyPlannerKeysByPlayer.get(ownerId);
      if (!ownerSet) {
        ownerSet = new Set<string>();
        dirtyPlannerKeysByPlayer.set(ownerId, ownerSet);
      }
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = ((ex + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
          const ny = ((ey + dy) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
          const nk = `${nx},${ny}`;
          ownerSet.add(nk);
          dirtyWatchedKeys.add(nk);
          const neighborOwner = input.tiles.get(nk)?.ownerId;
          if (neighborOwner && neighborOwner !== ownerId) {
            let neighborSet = dirtyPlannerKeysByPlayer.get(neighborOwner);
            if (!neighborSet) {
              neighborSet = new Set<string>();
              dirtyPlannerKeysByPlayer.set(neighborOwner, neighborSet);
            }
            neighborSet.add(nk);
          }
        }
      }

      const prevOwnerId = previous?.ownerId;
      if (previous && prevOwnerId && wasPlayerCandidateAnchor(previous, prevOwnerId)) {
        input.playerCandidateIndex.unregisterAnchor(tileKey);
      }
    }
  }

  for (const [pid, candidateKeys] of dirtyPlannerKeysByPlayer) {
    const summary = input.summaryForPlayer(pid);
    for (const candidateKey of candidateKeys) {
      summary.hotFrontierTileKeys.delete(candidateKey);
      summary.strategicFrontierTileKeys.delete(candidateKey);
      summary.buildCandidateTileKeys.delete(candidateKey);
      const candidateTile = input.tiles.get(candidateKey);
      if (!candidateTile || candidateTile.ownerId !== pid) continue;
      if (isHotFrontierTile(pid, candidateTile, input.tiles)) summary.hotFrontierTileKeys.add(candidateKey);
      if (isStrategicFrontierTile(pid, candidateTile, input.tiles)) summary.strategicFrontierTileKeys.add(candidateKey);
      if (isBuildCandidateTile(pid, candidateTile, input.tiles)) summary.buildCandidateTileKeys.add(candidateKey);
    }
    input.markPlannerPlayerTileCollectionDirty(pid);
  }

  for (const watchedKey of dirtyWatchedKeys) {
    input.playerCandidateIndex.refreshAroundTile(watchedKey, (key) => input.tiles.get(key));
  }
}

function wasPlayerCandidateAnchor(tile: DomainTileState, ownerId: string): boolean {
  return isSettledTownAnchor(tile, ownerId);
}
