import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";

import { createSeedWorld, type SimulationSeedProfile, simulationTileKey } from "./seed-state.js";
import type { PendingSettlementRecord } from "./player-runtime-summary.js";

type RecoveredTileState = {
  x: number;
  y: number;
  terrain: DomainTileState["terrain"];
  resource?: DomainTileState["resource"];
  dockId?: DomainTileState["dockId"];
  shardSite?: DomainTileState["shardSite"];
  ownerId?: DomainTileState["ownerId"];
  ownershipState?: DomainTileState["ownershipState"];
  town?: DomainTileState["town"];
  fort?: DomainTileState["fort"];
  observatory?: DomainTileState["observatory"];
  siegeOutpost?: DomainTileState["siegeOutpost"];
  economicStructure?: DomainTileState["economicStructure"];
  sabotage?: DomainTileState["sabotage"];
};

export type RecoveredLock = {
  commandId: string;
  playerId: string;
  actionType: "ATTACK" | "EXPAND" | "BREAKTHROUGH_ATTACK";
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  originKey: string;
  targetKey: string;
  resolvesAt: number;
};

export type RecoveredSimulationState = {
  tiles: RecoveredTileState[];
  activeLocks: RecoveredLock[];
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
    strategicResources?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
    allies?: string[];
    vision?: number;
    incomeMultiplier?: number;
  }>;
  pendingSettlements?: PendingSettlementRecord[];
  tileYieldCollectedAtByTile?: Array<{ tileKey: string; collectedAt: number }>;
  collectVisibleCooldownByPlayer?: Array<{ playerId: string; cooldownUntil: number }>;
};

export const recoverSimulationStateFromEvents = (
  events: SimulationEvent[],
  seedProfile: SimulationSeedProfile = "default"
): RecoveredSimulationState =>
  applySimulationEventsToRecoveredState(
    {
      tiles: [...createSeedWorld(seedProfile).tiles.values()]
        .map((tile) => ({
          x: tile.x,
          y: tile.y,
          terrain: tile.terrain,
          ...(tile.resource ? { resource: tile.resource } : {}),
          ...(tile.dockId ? { dockId: tile.dockId } : {}),
          ...(tile.shardSite ? { shardSite: tile.shardSite } : {}),
          ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
          ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
          ...(tile.town ? { town: tile.town } : {}),
          ...(tile.fort ? { fort: tile.fort } : {}),
          ...(tile.observatory ? { observatory: tile.observatory } : {}),
          ...(tile.siegeOutpost ? { siegeOutpost: tile.siegeOutpost } : {}),
          ...(tile.economicStructure ? { economicStructure: tile.economicStructure } : {}),
          ...(tile.sabotage ? { sabotage: tile.sabotage } : {})
        }))
        .sort((left, right) => (left.x - right.x) || (left.y - right.y)),
      activeLocks: [],
      players: [],
      pendingSettlements: [],
      tileYieldCollectedAtByTile: [],
      collectVisibleCooldownByPlayer: []
    },
    events
  );

export const applySimulationEventsToRecoveredState = (
  baseState: RecoveredSimulationState,
  events: SimulationEvent[]
): RecoveredSimulationState => {
  const tiles = new Map(
    baseState.tiles.map((tile) => [
      simulationTileKey(tile.x, tile.y),
      {
        x: tile.x,
        y: tile.y,
        terrain: tile.terrain,
        ...(tile.resource ? { resource: tile.resource } : {}),
        ...(tile.dockId ? { dockId: tile.dockId } : {}),
        ...(tile.shardSite ? { shardSite: tile.shardSite } : {}),
        ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
        ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
        ...(tile.town ? { town: tile.town } : {}),
        ...(tile.fort ? { fort: tile.fort } : {}),
        ...(tile.observatory ? { observatory: tile.observatory } : {}),
        ...(tile.siegeOutpost ? { siegeOutpost: tile.siegeOutpost } : {}),
        ...(tile.economicStructure ? { economicStructure: tile.economicStructure } : {}),
        ...(tile.sabotage ? { sabotage: tile.sabotage } : {})
      }
    ])
  );
  const activeLocks = new Map<string, RecoveredLock>();

  for (const lock of baseState.activeLocks) {
    activeLocks.set(lock.commandId, { ...lock });
  }

  for (const event of events) {
    if (event.eventType === "COMMAND_ACCEPTED") {
      activeLocks.set(event.commandId, {
        commandId: event.commandId,
        playerId: event.playerId,
        actionType: event.actionType,
        originX: event.originX,
        originY: event.originY,
        targetX: event.targetX,
        targetY: event.targetY,
        originKey: simulationTileKey(event.originX, event.originY),
        targetKey: simulationTileKey(event.targetX, event.targetY),
        resolvesAt: event.resolvesAt
      });
      continue;
    }

    if (event.eventType === "COMBAT_RESOLVED") {
      const existingLock = activeLocks.get(event.commandId);
      if (existingLock) activeLocks.delete(event.commandId);
      if (event.attackerWon) {
        tiles.set(simulationTileKey(event.targetX, event.targetY), {
          x: event.targetX,
          y: event.targetY,
          terrain: "LAND",
          ownerId: event.playerId,
          ownershipState: "FRONTIER"
        });
      }
    }
  }

  return {
    tiles: [...tiles.values()]
      .map((tile) => ({
        x: tile.x,
        y: tile.y,
        terrain: tile.terrain,
        ...(tile.resource ? { resource: tile.resource } : {}),
        ...(tile.dockId ? { dockId: tile.dockId } : {}),
        ...(tile.shardSite ? { shardSite: tile.shardSite } : {}),
        ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
        ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
        ...(tile.town ? { town: tile.town } : {}),
        ...(tile.fort ? { fort: tile.fort } : {}),
        ...(tile.observatory ? { observatory: tile.observatory } : {}),
        ...(tile.siegeOutpost ? { siegeOutpost: tile.siegeOutpost } : {}),
        ...(tile.economicStructure ? { economicStructure: tile.economicStructure } : {}),
        ...(tile.sabotage ? { sabotage: tile.sabotage } : {})
      }))
      .sort((left, right) => (left.x - right.x) || (left.y - right.y)),
    activeLocks: [...activeLocks.values()].sort((left, right) => left.commandId.localeCompare(right.commandId)),
    players: baseState.players ? [...baseState.players] : [],
    pendingSettlements: baseState.pendingSettlements ? [...baseState.pendingSettlements] : [],
    tileYieldCollectedAtByTile: baseState.tileYieldCollectedAtByTile ? [...baseState.tileYieldCollectedAtByTile] : [],
    collectVisibleCooldownByPlayer: baseState.collectVisibleCooldownByPlayer ? [...baseState.collectVisibleCooldownByPlayer] : []
  };
};
