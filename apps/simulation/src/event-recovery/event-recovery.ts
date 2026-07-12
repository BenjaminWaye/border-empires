import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { SimulationSeasonState } from "@border-empires/sim-protocol";
import { type DomainTileState } from "@border-empires/game-domain";

import { capturedTownAftermath } from "../runtime-capture-aftermath.js";
import { createSeedWorld, type SimulationSeedProfile, simulationTileKey } from "../seed-state/seed-state.js";
import { hydrateRecoveredTown, parseOptionalJson, recoverTownState } from "./event-recovery-town-helpers.js";
import type { ChosenTrickleResource } from "@border-empires/shared";
import type { DockRouteDefinition } from "../dock-network/dock-network.js";
import type { PendingSettlementRecord } from "../player-runtime-summary.js";

type RecoveredTileState = {
  x: number;
  y: number;
  terrain: DomainTileState["terrain"];
  resource?: DomainTileState["resource"];
  dockId?: DomainTileState["dockId"];
  shardSite?: DomainTileState["shardSite"];
  ownerId?: DomainTileState["ownerId"];
  ownershipState?: DomainTileState["ownershipState"];
  frontierDecayAt?: DomainTileState["frontierDecayAt"];
  frontierDecayKind?: DomainTileState["frontierDecayKind"];
  town?: DomainTileState["town"];
  fort?: DomainTileState["fort"];
  observatory?: DomainTileState["observatory"];
  siegeOutpost?: DomainTileState["siegeOutpost"];
  economicStructure?: DomainTileState["economicStructure"];
  sabotage?: DomainTileState["sabotage"];
  muster?: DomainTileState["muster"];
  // Phase 3 (dormant): Phase 4 will start writing this unified field. Accepted
  // here so post-Phase-4 snapshots can be loaded by a Phase-3-era binary without
  // crashing. The hydration layer ignores it until Phase 4 activates the reader.
  structure?: unknown;
};

export type RecoveredLock = {
  commandId: string;
  playerId: string;
  actionType: "ATTACK" | "EXPAND";
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  originKey: string;
  targetKey: string;
  resolvesAt: number;
  /**
   * Lock origin. Optional for back-compat with snapshots written before this
   * field existed; `createLocksFromInitialState` falls back to a commandId
   * prefix check for old snapshots.
   */
  source?: "player" | "automation";
  combatResolutionJson?: string;
};

export type RecoveredSimulationState = {
  tiles: RecoveredTileState[];
  docks?: DockRouteDefinition[];
  activeLocks: RecoveredLock[];
  season?: SimulationSeasonState;
  players?: Array<{
    id: string;
    name?: string;
    isAi?: boolean;
    points?: number;
    manpower?: number;
    manpowerUpdatedAt?: number;
    manpowerCapSnapshot?: number;
    techIds?: string[];
    domainIds?: string[];
    strategicResources?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
    chosenTrickleResource?: ChosenTrickleResource;
    imperialWardCharges?: number;
    allies?: string[];
    vision?: number;
    incomeMultiplier?: number;
    incomePerMinute?: number;
    ownedTownTileKeys?: string[];
  }>;
  pendingSettlements?: PendingSettlementRecord[];
  tileYieldCollectedAtByTile?: Array<{ tileKey: string; collectedAt: number }>;
  playerYieldCollectionEpochByPlayer?: Array<{ playerId: string; collectedAt: number }>;
};

type RecoveredSimulationAccumulator = {
  tiles: Map<string, RecoveredTileState>;
  docks: DockRouteDefinition[];
  activeLocks: Map<string, RecoveredLock>;
  season?: SimulationSeasonState;
  players: NonNullable<RecoveredSimulationState["players"]>;
  pendingSettlements: NonNullable<RecoveredSimulationState["pendingSettlements"]>;
  tileYieldCollectedAtByTile: Map<string, number>;
  playerYieldCollectionEpochByPlayer: Map<string, number>;
};

type TileDelta = Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"][number];

const cloneRecoveredTile = (tile: RecoveredTileState): RecoveredTileState => ({
  x: tile.x,
  y: tile.y,
  terrain: tile.terrain,
  ...(tile.resource ? { resource: tile.resource } : {}),
  ...(tile.dockId ? { dockId: tile.dockId } : {}),
  ...(tile.shardSite ? { shardSite: tile.shardSite } : {}),
  ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
  ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
  ...(typeof tile.frontierDecayAt === "number" ? { frontierDecayAt: tile.frontierDecayAt } : {}),
  ...(tile.town ? { town: tile.town } : {}),
  ...(tile.fort ? { fort: tile.fort } : {}),
  ...(tile.observatory ? { observatory: tile.observatory } : {}),
  ...(tile.siegeOutpost ? { siegeOutpost: tile.siegeOutpost } : {}),
  ...(tile.economicStructure ? { economicStructure: tile.economicStructure } : {}),
  ...(tile.sabotage ? { sabotage: tile.sabotage } : {})
});

export const createRecoveredSimulationAccumulator = (
  baseState: RecoveredSimulationState
): RecoveredSimulationAccumulator => {
  const tiles = new Map<string, RecoveredTileState>();
  for (const tile of baseState.tiles) {
    tiles.set(simulationTileKey(tile.x, tile.y), cloneRecoveredTile(tile));
  }
  const activeLocks = new Map<string, RecoveredLock>();
  for (const lock of baseState.activeLocks) {
    activeLocks.set(lock.commandId, { ...lock });
  }
  return {
    tiles,
    docks: baseState.docks ? baseState.docks.map((dock) => ({ ...dock, ...(dock.connectedDockIds ? { connectedDockIds: [...dock.connectedDockIds] } : {}) })) : [],
    activeLocks,
    ...(baseState.season ? { season: { ...baseState.season, ...(baseState.season.winner ? { winner: { ...baseState.season.winner } } : {}), victoryTrackers: baseState.season.victoryTrackers.map((tracker: SimulationSeasonState["victoryTrackers"][number]) => ({ ...tracker })) } } : {}),
    players: baseState.players
      ? baseState.players.map((player) => ({
          ...player,
          ...(player.techIds ? { techIds: [...player.techIds] } : {}),
          ...(player.domainIds ? { domainIds: [...player.domainIds] } : {}),
          ...(player.strategicResources ? { strategicResources: { ...player.strategicResources } } : {}),
          ...(player.allies ? { allies: [...player.allies] } : {}),
          ...(player.ownedTownTileKeys ? { ownedTownTileKeys: [...player.ownedTownTileKeys] } : {})
        }))
      : [],
    pendingSettlements: baseState.pendingSettlements ? [...baseState.pendingSettlements] : [],
    tileYieldCollectedAtByTile: new Map(
      (baseState.tileYieldCollectedAtByTile ?? []).map((entry) => [entry.tileKey, entry.collectedAt])
    ),
    playerYieldCollectionEpochByPlayer: new Map(
      (baseState.playerYieldCollectionEpochByPlayer ?? []).map((entry) => [entry.playerId, entry.collectedAt])
    ),
  };
};

const applyTileDeltaToRecoveredAccumulator = (
  accumulator: RecoveredSimulationAccumulator,
  tileDelta: TileDelta
): void => {
  const tileKey = simulationTileKey(tileDelta.x, tileDelta.y);
  const existing = accumulator.tiles.get(tileKey);
  const recoveredTown = recoverTownState(tileDelta, existing);
  accumulator.tiles.set(tileKey, {
    x: tileDelta.x,
    y: tileDelta.y,
    terrain: tileDelta.terrain ?? existing?.terrain ?? "LAND",
    ...(tileDelta.resource ? { resource: tileDelta.resource as DomainTileState["resource"] } : existing?.resource ? { resource: existing.resource } : {}),
    ...(tileDelta.dockId ? { dockId: tileDelta.dockId } : existing?.dockId ? { dockId: existing.dockId } : {}),
    ...("shardSiteJson" in tileDelta
      ? (tileDelta.shardSiteJson
          ? { shardSite: parseOptionalJson<DomainTileState["shardSite"]>(tileDelta.shardSiteJson) }
          : {})
      : existing?.shardSite
        ? { shardSite: existing.shardSite }
        : {}),
    // For ownership + per-tile-structure fields, an empty-string delta value
    // means "explicit clear" (mirrors the existing shardSiteJson pattern just
    // above). Without the `in` check, a clearing event emitted by the
    // tile-shedding ticker (or by UNCAPTURE_TILE) wouldn't replay correctly
    // and the recovered state would preserve the prior owner/structures.
    ...("ownerId" in tileDelta
      ? (tileDelta.ownerId ? { ownerId: tileDelta.ownerId } : {})
      : existing?.ownerId ? { ownerId: existing.ownerId } : {}),
    ...("ownershipState" in tileDelta
      ? (tileDelta.ownershipState
          ? { ownershipState: tileDelta.ownershipState as DomainTileState["ownershipState"] }
          : {})
      : existing?.ownershipState
        ? { ownershipState: existing.ownershipState }
        : {}),
    ...("frontierDecayAt" in tileDelta
      ? typeof tileDelta.frontierDecayAt === "number"
        ? { frontierDecayAt: tileDelta.frontierDecayAt }
        : {}
      : typeof existing?.frontierDecayAt === "number"
        ? { frontierDecayAt: existing.frontierDecayAt }
        : {}),
    ...("frontierDecayKind" in tileDelta
      ? tileDelta.frontierDecayKind === "NATURAL" || tileDelta.frontierDecayKind === "ENCIRCLEMENT"
        ? { frontierDecayKind: tileDelta.frontierDecayKind }
        : {}
      : existing?.frontierDecayKind
        ? { frontierDecayKind: existing.frontierDecayKind }
        : {}),
    ...(recoveredTown ? { town: recoveredTown } : {}),
    ...("fortJson" in tileDelta
      ? (tileDelta.fortJson
          ? { fort: parseOptionalJson<DomainTileState["fort"]>(tileDelta.fortJson) }
          : {})
      : existing?.fort
        ? { fort: existing.fort }
        : {}),
    ...("observatoryJson" in tileDelta
      ? (tileDelta.observatoryJson
          ? { observatory: parseOptionalJson<DomainTileState["observatory"]>(tileDelta.observatoryJson) }
          : {})
      : existing?.observatory
        ? { observatory: existing.observatory }
        : {}),
    ...("siegeOutpostJson" in tileDelta
      ? (tileDelta.siegeOutpostJson
          ? { siegeOutpost: parseOptionalJson<DomainTileState["siegeOutpost"]>(tileDelta.siegeOutpostJson) }
          : {})
      : existing?.siegeOutpost
        ? { siegeOutpost: existing.siegeOutpost }
        : {}),
    ...("economicStructureJson" in tileDelta
      ? (tileDelta.economicStructureJson
          ? { economicStructure: parseOptionalJson<DomainTileState["economicStructure"]>(tileDelta.economicStructureJson) }
          : {})
      : existing?.economicStructure
        ? { economicStructure: existing.economicStructure }
        : {}),
    ...(tileDelta.sabotageJson
      ? { sabotage: parseOptionalJson<DomainTileState["sabotage"]>(tileDelta.sabotageJson) }
      : existing?.sabotage
        ? { sabotage: existing.sabotage }
        : {}),
    ...("musterJson" in tileDelta
      ? (tileDelta.musterJson
          ? { muster: parseOptionalJson<DomainTileState["muster"]>(tileDelta.musterJson) }
          : {})
      : existing?.muster
        ? { muster: existing.muster }
        : {})
  });
};

const spendRecoveredPlayerGold = (
  accumulator: RecoveredSimulationAccumulator,
  playerId: string,
  goldCost: number | undefined
): void => {
  if (typeof goldCost !== "number" || goldCost <= 0) return;
  const player = accumulator.players.find((entry) => entry.id === playerId);
  if (!player || typeof player.points !== "number") return;
  player.points -= goldCost;
};

const removeRecoveredPendingSettlement = (
  accumulator: RecoveredSimulationAccumulator,
  tileKey: string
): void => {
  accumulator.pendingSettlements = accumulator.pendingSettlements.filter(
    (settlement) => settlement.tileKey !== tileKey
  );
};

const removeRecoveredPendingSettlementIfOwnerChanged = (
  accumulator: RecoveredSimulationAccumulator,
  tileKey: string,
  nextOwnerId: string | undefined
): void => {
  const pendingSettlement = accumulator.pendingSettlements.find(
    (settlement) => settlement.tileKey === tileKey
  );
  if (!pendingSettlement || pendingSettlement.ownerId === nextOwnerId) return;
  removeRecoveredPendingSettlement(accumulator, tileKey);
};

const shouldTileDeltaRemovePendingSettlement = (
  pendingSettlement: PendingSettlementRecord | undefined,
  tileDelta: TileDelta
): boolean => {
  if (!pendingSettlement) return false;
  if ("ownerId" in tileDelta && tileDelta.ownerId !== pendingSettlement.ownerId) return true;
  if ("ownershipState" in tileDelta && tileDelta.ownershipState !== "FRONTIER") return true;
  return false;
};

export const applySimulationEventsToRecoveredAccumulator = (
  accumulator: RecoveredSimulationAccumulator,
  events: SimulationEvent[]
): void => {
  for (const event of events) {
    if (event.eventType === "TILE_DELTA_BATCH") {
      spendRecoveredPlayerGold(accumulator, event.playerId, event.goldCost);
      for (const tileDelta of event.tileDeltas) {
        const tileKey = simulationTileKey(tileDelta.x, tileDelta.y);
        const pendingSettlement = accumulator.pendingSettlements.find(
          (settlement) => settlement.tileKey === tileKey
        );
        applyTileDeltaToRecoveredAccumulator(accumulator, tileDelta);
        if (shouldTileDeltaRemovePendingSettlement(pendingSettlement, tileDelta)) {
          removeRecoveredPendingSettlement(accumulator, tileKey);
        }
      }
      continue;
    }

    if (event.eventType === "TILE_YIELD_ANCHOR_UPDATED") {
      accumulator.tileYieldCollectedAtByTile.set(event.tileKey, event.collectedAt);
      continue;
    }

    if (event.eventType === "TILE_YIELD_ANCHOR_BATCH") {
      for (const anchor of event.anchors) {
        accumulator.tileYieldCollectedAtByTile.set(anchor.tileKey, anchor.collectedAt);
      }
      continue;
    }

    if (event.eventType === "PLAYER_YIELD_COLLECTION_EPOCH_UPDATED") {
      accumulator.playerYieldCollectionEpochByPlayer.set(event.playerId, event.collectedAt);
      continue;
    }

    if (event.eventType === "SETTLEMENT_STARTED") {
      spendRecoveredPlayerGold(accumulator, event.playerId, event.goldCost);
      removeRecoveredPendingSettlement(accumulator, event.tileKey);
      accumulator.pendingSettlements.push({
        ownerId: event.playerId,
        tileKey: event.tileKey,
        startedAt: event.startedAt,
        resolvesAt: event.resolvesAt,
        goldCost: event.goldCost
      });
      continue;
    }

    if (event.eventType === "COMMAND_ACCEPTED") {
      accumulator.activeLocks.set(event.commandId, {
        commandId: event.commandId,
        playerId: event.playerId,
        actionType: event.actionType,
        originX: event.originX,
        originY: event.originY,
        targetX: event.targetX,
        targetY: event.targetY,
        originKey: simulationTileKey(event.originX, event.originY),
        targetKey: simulationTileKey(event.targetX, event.targetY),
        resolvesAt: event.resolvesAt,
        ...(event.combatResult ? { combatResolutionJson: JSON.stringify({ result: event.combatResult, defenderGoldLoss: 0 }) } : {})
      });
      continue;
    }

    if (event.eventType === "COMBAT_CANCELLED") {
      accumulator.activeLocks.delete(event.commandId);
      for (const cancelledCommandId of event.cancelledCommandIds ?? []) {
        accumulator.activeLocks.delete(cancelledCommandId);
      }
      continue;
    }

    if (event.eventType === "COMBAT_RESOLVED") {
      if (accumulator.activeLocks.has(event.commandId)) {
        accumulator.activeLocks.delete(event.commandId);
      }
      if (event.attackerWon) {
        const targetKey = simulationTileKey(event.targetX, event.targetY);
        const previousTarget = accumulator.tiles.get(targetKey);
        const townAftermath = capturedTownAftermath(
          previousTarget?.town,
          previousTarget?.ownerId,
          event.playerId,
          Date.now()
        );
        accumulator.tiles.set(targetKey, {
          x: event.targetX,
          y: event.targetY,
          terrain: previousTarget?.terrain ?? "LAND",
          ...(previousTarget?.resource ? { resource: previousTarget.resource } : {}),
          ...(previousTarget?.dockId ? { dockId: previousTarget.dockId } : {}),
          ...(townAftermath.town ? { town: townAftermath.town } : {}),
          ownerId: event.playerId,
          ownershipState: event.playerId === "barbarian-1" ? "SETTLED" : "FRONTIER"
        });
        removeRecoveredPendingSettlementIfOwnerChanged(accumulator, targetKey, event.playerId);
      } else if (event.combatResult?.defenderOwnerId) {
        const originLost = event.combatResult.changes.some(
          (change: { x: number; y: number }) => change.x === event.originX && change.y === event.originY
        );
        if (originLost) {
          const originKey = simulationTileKey(event.originX, event.originY);
          const previousOrigin = accumulator.tiles.get(originKey);
          if (previousOrigin) {
            accumulator.tiles.set(originKey, {
              x: event.originX,
              y: event.originY,
              terrain: previousOrigin.terrain,
              ...(previousOrigin.resource ? { resource: previousOrigin.resource } : {}),
              ...(previousOrigin.dockId ? { dockId: previousOrigin.dockId } : {}),
              ...(previousOrigin.shardSite ? { shardSite: previousOrigin.shardSite } : {}),
              ...(previousOrigin.sabotage ? { sabotage: previousOrigin.sabotage } : {}),
              // Town survives the flip — mirrors the attacker-wins branch above and the runtime resolveLock path.
              ...(previousOrigin.town ? { town: previousOrigin.town } : {}),
              ownerId: event.combatResult.defenderOwnerId,
              ownershipState: "FRONTIER"
            });
            removeRecoveredPendingSettlementIfOwnerChanged(
              accumulator,
              originKey,
              event.combatResult.defenderOwnerId
            );
          }
        }
      }
    }
  }
};

export const finalizeRecoveredSimulationAccumulator = (
  accumulator: RecoveredSimulationAccumulator
): RecoveredSimulationState => ({
  tiles: [...accumulator.tiles.values()]
    .map((tile) => cloneRecoveredTile(tile))
    .sort((left, right) => (left.x - right.x) || (left.y - right.y)),
  ...(accumulator.docks.length ? { docks: accumulator.docks.map((dock) => ({ ...dock, ...(dock.connectedDockIds ? { connectedDockIds: [...dock.connectedDockIds] } : {}) })) } : {}),
  activeLocks: [...accumulator.activeLocks.values()].sort((left, right) => left.commandId.localeCompare(right.commandId)),
  ...("season" in accumulator && accumulator.season ? { season: accumulator.season } : {}),
  players: [...accumulator.players],
  pendingSettlements: [...accumulator.pendingSettlements],
  tileYieldCollectedAtByTile: [...accumulator.tileYieldCollectedAtByTile.entries()]
    .map(([tileKey, collectedAt]) => ({ tileKey, collectedAt }))
    .sort((left, right) => left.tileKey.localeCompare(right.tileKey)),
  playerYieldCollectionEpochByPlayer: [...accumulator.playerYieldCollectionEpochByPlayer.entries()]
    .map(([playerId, collectedAt]) => ({ playerId, collectedAt }))
    .sort((left, right) => left.playerId.localeCompare(right.playerId)),
});

export const recoverSimulationStateFromEvents = (
  events: SimulationEvent[],
  seedProfile: SimulationSeedProfile = "default"
): RecoveredSimulationState => {
  const seedWorld = createSeedWorld(seedProfile);
  return applySimulationEventsToRecoveredState(
    {
      tiles: [...seedWorld.tiles.values()]
        .map((tile) => cloneRecoveredTile(tile))
        .sort((left, right) => (left.x - right.x) || (left.y - right.y)),
      docks: seedWorld.docks.map((dock) => ({ ...dock, ...(dock.connectedDockIds ? { connectedDockIds: [...dock.connectedDockIds] } : {}) })),
      activeLocks: [],
      players: [],
      pendingSettlements: [],
      tileYieldCollectedAtByTile: [],
      playerYieldCollectionEpochByPlayer: [],
    },
    events
  );
};

export const applySimulationEventsToRecoveredState = (
  baseState: RecoveredSimulationState,
  events: SimulationEvent[]
): RecoveredSimulationState => {
  const accumulator = createRecoveredSimulationAccumulator(baseState);
  applySimulationEventsToRecoveredAccumulator(accumulator, events);
  return finalizeRecoveredSimulationAccumulator(accumulator);
};
