import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import {
  FRONTIER_DECAY_MS,
  isSettledTownAnchor,
  TOWN_AUTO_FRONTIER_RADIUS
} from "../territory-automation/territory-automation.js";
import {
  isBuildCandidateTile,
  isHotFrontierTile,
  isStrategicFrontierTile
} from "../ai/planner-candidate-index.js";
import type { PlayerCandidateIndex } from "../player-candidate-index/player-candidate-index.js";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";
import type { LockRecord, SimulationTileWireDelta } from "../runtime-types.js";

type FrontierDecayAccumulators = {
  changedByOwner: Map<string, SimulationTileWireDelta[]>;
  expiredByOwner: Map<string, string[]>;
};

type FrontierDecayDeps = {
  nowMs: number;
  tiles: Map<string, DomainTileState>;
  locksByTile: ReadonlyMap<string, LockRecord>;
  pendingSettlementsByTile: ReadonlyMap<string, unknown>;
  frontierTilesByOwner: Map<string, Set<string>>;
  activeFortAnchorsByOwner: Map<string, Map<string, number>>;
  accumulators: FrontierDecayAccumulators;
  supportedTownKeysForTile: (playerId: string, x: number, y: number) => string[];
  setFrontierDecayTimerFields: (tileKey: string, tile: DomainTileState) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  nextTerritoryAutomationCommandId: (label: string, playerId: string, tileKey: string, nowMs: number) => string;
  emitTileDeltaBatch: (command: { commandId: string; playerId: string; tileDeltas: SimulationTileWireDelta[] }) => void;
  emitPlayerStateUpdate: (command: { commandId: string; playerId: string }) => void;
  bulkClearFrontierOwnership: (expiredTilesByOwner: Map<string, Array<[string, DomainTileState]>>, nowMs: number) => void;
  applyEncirclement: (changedKeys: string[], playerId: string, commandId: string) => void;
  /** When provided, yields the event loop between players and phases so the
   *  30s watchdog never fires during a full frontier-decay pass. */
  yieldToEventLoop?: () => Promise<void>;
};

export async function updateFrontierDecay(input: FrontierDecayDeps): Promise<void> {
  // No-op sentinel: every call site can unconditionally await yield_().
  const yield_ = input.yieldToEventLoop ?? (() => Promise.resolve());

  for (const arr of input.accumulators.changedByOwner.values()) arr.length = 0;
  for (const arr of input.accumulators.expiredByOwner.values()) arr.length = 0;

  const addChangedDelta = (playerId: string, delta: SimulationTileWireDelta): void => {
    const existing = input.accumulators.changedByOwner.get(playerId);
    if (existing) existing.push(delta);
    else input.accumulators.changedByOwner.set(playerId, [delta]);
  };
  const addExpiredKey = (playerId: string, tileKey: string): void => {
    const existing = input.accumulators.expiredByOwner.get(playerId);
    if (existing) existing.push(tileKey);
    else input.accumulators.expiredByOwner.set(playerId, [tileKey]);
  };

  const expiredTilesByOwner = new Map<string, Array<[string, DomainTileState]>>();

  // Phase 1: scan each player's frontier tiles.
  // frontierSupportedByActiveFort is O(9) per tile — yielding between
  // players ensures gRPC dispatch can run between players, not just between ticks.
  for (const [ownerId, frontierKeys] of input.frontierTilesByOwner) {
    for (const tileKey of frontierKeys) {
      if (input.locksByTile.has(tileKey)) continue;
      const tile = input.tiles.get(tileKey);
      if (!tile || tile.ownershipState !== "FRONTIER" || tile.ownerId !== ownerId) continue;

      if (frontierDecayPausedForTile(input, ownerId, tileKey, tile)) {
        if (tile.frontierDecayAt === undefined) continue;
        const queuedTile: DomainTileState = {
          ...tile,
          frontierDecayAt: undefined,
          frontierDecayKind: undefined
        };
        input.setFrontierDecayTimerFields(tileKey, queuedTile);
        addChangedDelta(ownerId, input.tileDeltaFromState(queuedTile));
        continue;
      }

      if (frontierSupportedByActiveFort(input, tile, ownerId)) {
        if (tile.frontierDecayAt === undefined) continue;
        const supportedTile: DomainTileState = {
          ...tile,
          frontierDecayAt: undefined,
          frontierDecayKind: undefined
        };
        input.setFrontierDecayTimerFields(tileKey, supportedTile);
        addChangedDelta(ownerId, input.tileDeltaFromState(supportedTile));
        continue;
      }

      const decayAt = tile.frontierDecayAt ?? input.nowMs + FRONTIER_DECAY_MS;
      if (decayAt <= input.nowMs) {
        const expiredTile: DomainTileState = {
          ...tile,
          ownerId: undefined,
          ownershipState: undefined,
          frontierDecayAt: undefined,
          frontierDecayKind: undefined,
          fort: undefined,
          observatory: undefined,
          siegeOutpost: undefined,
          economicStructure: undefined,
          sabotage: undefined
        };
        const bucket = expiredTilesByOwner.get(ownerId);
        if (bucket) bucket.push([tileKey, expiredTile]);
        else expiredTilesByOwner.set(ownerId, [[tileKey, expiredTile]]);
        continue;
      }

      if (tile.frontierDecayAt !== decayAt) {
        const decayingTile: DomainTileState = {
          ...tile,
          frontierDecayAt: decayAt,
          frontierDecayKind: "NATURAL"
        };
        input.setFrontierDecayTimerFields(tileKey, decayingTile);
        addChangedDelta(ownerId, input.tileDeltaFromState(decayingTile));
      }
    }
    // Yield after each player's frontier scan so gRPC commands and the
    // event-loop lag sampler can run between players, not just between ticks.
    await yield_();
  }

  // Phase 2: bulk-clear expired ownership. Yield before the call because
  // bulkClearFrontierOwnership iterates expired tiles + their 5×5 neighbourhoods
  // and refreshes playerCandidateIndex — can be heavy when many tiles expired.
  if (expiredTilesByOwner.size > 0) {
    await yield_();
    input.bulkClearFrontierOwnership(expiredTilesByOwner, input.nowMs);
    for (const [ownerId, pairs] of expiredTilesByOwner) {
      for (const [tileKey, expiredTile] of pairs) {
        // Only emit + encircle tiles that were actually cleared.  If the tile was
        // skipped by bulkClearFrontierOwnership (state changed during yield), its
        // ownershipState is still "FRONTIER" — emitting the stale delta would
        // diverge the client from the server.
        if (input.tiles.get(tileKey)?.ownershipState === "FRONTIER") continue;
        addChangedDelta(ownerId, input.tileDeltaFromState(expiredTile));
        addExpiredKey(ownerId, tileKey);
      }
    }
  }

  // Phase 3: emit TILE_DELTA_BATCH + PLAYER_UPDATE per player.
  // emitPlayerStateUpdate calls cachedEconomySnapshot which is O(settledTiles)
  // on a cold cache — yield between players so the economy rebuild for one
  // player doesn't block incoming gRPC for all other players.
  for (const [playerId, tileDeltas] of input.accumulators.changedByOwner) {
    if (tileDeltas.length === 0) continue;
    const commandId = input.nextTerritoryAutomationCommandId("frontier-decay", playerId, "batch", input.nowMs);
    input.emitTileDeltaBatch({ commandId, playerId, tileDeltas });
    input.emitPlayerStateUpdate({ commandId, playerId });
    await yield_();
  }

  // Phase 4: BFS encirclement per player with expired tiles.
  // applyEncirclement runs a BFS over the player's territory — yield between
  // players so each BFS doesn't block the event loop back-to-back.
  for (const [playerId, expiredKeys] of input.accumulators.expiredByOwner) {
    if (expiredKeys.length === 0) continue;
    const commandId = input.nextTerritoryAutomationCommandId("frontier-decay-encirclement", playerId, "batch", input.nowMs);
    input.applyEncirclement(expiredKeys, playerId, commandId);
    await yield_();
  }
}

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

function frontierDecayPausedForTile(
  input: Pick<FrontierDecayDeps, "pendingSettlementsByTile" | "supportedTownKeysForTile" | "tiles">,
  playerId: string,
  tileKey: string,
  tile: DomainTileState
): boolean {
  if (input.pendingSettlementsByTile.has(tileKey)) return true;
  if (tile.resource || tile.town || tile.dockId) return true;
  return input.supportedTownKeysForTile(playerId, tile.x, tile.y).some((townKey) => {
    const town = input.tiles.get(townKey)?.town;
    return Boolean(town && town.populationTier !== "SETTLEMENT");
  });
}

function frontierSupportedByActiveFort(
  input: Pick<FrontierDecayDeps, "activeFortAnchorsByOwner" | "tiles" | "nowMs">,
  tile: DomainTileState,
  playerId: string
): boolean {
  const anchors = input.activeFortAnchorsByOwner.get(playerId);
  if (!anchors || anchors.size === 0) return false;
  // TOWN_AUTO_FRONTIER_RADIUS=1 means only the 9 cells around the tile can
  // ever be supporting anchors.  Check neighbors directly (O(9)) rather than
  // iterating the full anchor set (O(N_towns × frontier_tiles)).
  for (let dy = -TOWN_AUTO_FRONTIER_RADIUS; dy <= TOWN_AUTO_FRONTIER_RADIUS; dy++) {
    for (let dx = -TOWN_AUTO_FRONTIER_RADIUS; dx <= TOWN_AUTO_FRONTIER_RADIUS; dx++) {
      const nx = ((tile.x + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
      const ny = ((tile.y + dy) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
      const nk = `${nx},${ny}`;
      if (!anchors.has(nk)) continue;
      const neighbor = input.tiles.get(nk);
      if (neighbor && isSettledTownAnchor(neighbor, playerId)) return true;
    }
  }
  return false;
}

function wasPlayerCandidateAnchor(tile: DomainTileState, ownerId: string): boolean {
  const hadTown = isSettledTownAnchor(tile, ownerId);
  const hadSweep = Boolean(
    tile.siegeOutpost?.ownerId === ownerId &&
    tile.siegeOutpost.status === "active" &&
    tile.siegeOutpost.sweepActive
  );
  return hadTown || hadSweep;
}
