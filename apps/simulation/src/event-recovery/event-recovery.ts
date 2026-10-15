import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { SimulationSeasonState } from "@border-empires/sim-protocol";
import { type DomainTileState } from "@border-empires/game-domain";

import { capturedTownAftermath } from "../runtime-capture-aftermath.js";
import { createSeedWorld, type SimulationSeedProfile, simulationTileKey } from "../seed-state/seed-state.js";
import { recoverTownState } from "./event-recovery-town-helpers.js";
import { recoverOverlaySubstructures } from "./event-recovery-overlays.js";
import { overlaySubstructuresFrom, type TileOverlays } from "../tile-overlay-fields/tile-overlay-fields.js";
import { applyProgressionUpdateToRecoveredPlayer } from "./event-recovery-progression-helpers.js";
import { cloneRecoveredPlayerState, type RecoveredPlayerState } from "./event-recovery-player-state.js";
import type { DockRouteDefinition } from "../dock-network/dock-network.js";
import type { PendingSettlementRecord } from "../player-runtime-summary.js";

type RecoveredTileState = {
  x: number;
  y: number;
  terrain: DomainTileState["terrain"];
  landBiome?: DomainTileState["landBiome"];
  resource?: DomainTileState["resource"];
  prospectSignature?: DomainTileState["prospectSignature"];
  dockId?: DomainTileState["dockId"];
  ownerId?: DomainTileState["ownerId"];
  ownershipState?: DomainTileState["ownershipState"];
  frontierDecayAt?: DomainTileState["frontierDecayAt"];
  frontierDecayKind?: DomainTileState["frontierDecayKind"];
  town?: DomainTileState["town"];
  // Phase 3 (dormant): Phase 4 will start writing this unified field. Accepted
  // here so post-Phase-4 snapshots can be loaded by a Phase-3-era binary without
  // crashing. The hydration layer ignores it until Phase 4 activates the reader.
  structure?: unknown;
} & TileOverlays;

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
  players?: RecoveredPlayerState[];
  pendingSettlements?: PendingSettlementRecord[];
  playerYieldCollectionEpochByPlayer?: Array<{ playerId: string; collectedAt: number }>;
};

type RecoveredSimulationAccumulator = {
  tiles: Map<string, RecoveredTileState>;
  docks: DockRouteDefinition[];
  activeLocks: Map<string, RecoveredLock>;
  season?: SimulationSeasonState;
  players: NonNullable<RecoveredSimulationState["players"]>;
  pendingSettlements: NonNullable<RecoveredSimulationState["pendingSettlements"]>;
  playerYieldCollectionEpochByPlayer: Map<string, number>;
};

type TileDelta = Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"][number];

const cloneRecoveredTile = (tile: RecoveredTileState): RecoveredTileState => ({
  x: tile.x,
  y: tile.y,
  terrain: tile.terrain,
  ...(tile.landBiome ? { landBiome: tile.landBiome } : {}),
  ...(tile.resource ? { resource: tile.resource } : {}),
  ...(tile.prospectSignature ? { prospectSignature: tile.prospectSignature } : {}),
  ...(tile.dockId ? { dockId: tile.dockId } : {}),
  ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
  ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
  ...(typeof tile.frontierDecayAt === "number" ? { frontierDecayAt: tile.frontierDecayAt } : {}),
  ...(tile.frontierDecayKind ? { frontierDecayKind: tile.frontierDecayKind } : {}),
  ...(tile.town ? { town: tile.town } : {}),
  // Overlays from the shared table: this list was once hand-written with no
  // muster line, so every restart dropped every active muster flag.
  ...overlaySubstructuresFrom(tile)
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
    players: baseState.players ? baseState.players.map(cloneRecoveredPlayerState) : [],
    pendingSettlements: baseState.pendingSettlements ? [...baseState.pendingSettlements] : [],
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
    ...(existing?.landBiome ? { landBiome: existing.landBiome } : {}),
    ...(tileDelta.resource ? { resource: tileDelta.resource as DomainTileState["resource"] } : existing?.resource ? { resource: existing.resource } : {}),
    ...(tileDelta.prospectSignature ? { prospectSignature: tileDelta.prospectSignature } : existing?.prospectSignature ? { prospectSignature: existing.prospectSignature } : {}),
    ...(tileDelta.dockId ? { dockId: tileDelta.dockId } : existing?.dockId ? { dockId: existing.dockId } : {}),
    // For ownership + per-tile-structure fields, an empty-string delta value
    // means "explicit clear" (same rule as the overlays, see
    // recoverOverlaySubstructures below). Without the `in` check, a clearing
    // event emitted by the tile-shedding ticker (or by UNCAPTURE_TILE)
    // wouldn't replay correctly and the recovered state would preserve the
    // prior owner/structures.
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
      ? tileDelta.frontierDecayKind
        ? { frontierDecayKind: tileDelta.frontierDecayKind }
        : {}
      : existing?.frontierDecayKind
        ? { frontierDecayKind: existing.frontierDecayKind }
        : {}),
    ...(recoveredTown ? { town: recoveredTown } : {}),
    ...recoverOverlaySubstructures(tileDelta, existing)
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

    if (event.eventType === "SETTLEMENT_STARTED") {
      spendRecoveredPlayerGold(accumulator, event.playerId, event.goldCost);
      removeRecoveredPendingSettlement(accumulator, event.tileKey);
      accumulator.pendingSettlements.push({
        ownerId: event.playerId,
        tileKey: event.tileKey,
        startedAt: event.startedAt,
        resolvesAt: event.resolvesAt,
        goldCost: event.goldCost,
        commandId: event.commandId
      });
      continue;
    }

    if (event.eventType === "TECH_UPDATE" || event.eventType === "DOMAIN_UPDATE") {
      const player = accumulator.players.find((entry) => entry.id === event.playerId);
      if (player) applyProgressionUpdateToRecoveredPlayer(player, event.payloadJson);
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
              ...(previousOrigin.naturalWonder ? { naturalWonder: previousOrigin.naturalWonder } : {}),
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
