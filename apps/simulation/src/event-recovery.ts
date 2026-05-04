import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { SimulationSeasonState } from "@border-empires/sim-protocol";
import { POPULATION_MAX, POPULATION_TOWN_MIN, type DomainTileState } from "@border-empires/game-domain";

import { createSeedWorld, type SimulationSeedProfile, simulationTileKey } from "./seed-state.js";
import { CITY_POPULATION_MIN, GREAT_CITY_POPULATION_MIN, METROPOLIS_POPULATION_MIN } from "@border-empires/shared";
import type { DockRouteDefinition } from "./dock-network.js";
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
  actionType: "ATTACK" | "EXPAND";
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  originKey: string;
  targetKey: string;
  resolvesAt: number;
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
    strategicResources?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
    allies?: string[];
    vision?: number;
    incomeMultiplier?: number;
  }>;
  pendingSettlements?: PendingSettlementRecord[];
  tileYieldCollectedAtByTile?: Array<{ tileKey: string; collectedAt: number }>;
  collectVisibleCooldownByPlayer?: Array<{ playerId: string; cooldownUntil: number }>;
};

type RecoveredSimulationAccumulator = {
  tiles: Map<string, RecoveredTileState>;
  docks: DockRouteDefinition[];
  activeLocks: Map<string, RecoveredLock>;
  season?: SimulationSeasonState;
  players: NonNullable<RecoveredSimulationState["players"]>;
  pendingSettlements: NonNullable<RecoveredSimulationState["pendingSettlements"]>;
  tileYieldCollectedAtByTile: NonNullable<RecoveredSimulationState["tileYieldCollectedAtByTile"]>;
  collectVisibleCooldownByPlayer: NonNullable<RecoveredSimulationState["collectVisibleCooldownByPlayer"]>;
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
    ...(baseState.season ? { season: { ...baseState.season, ...(baseState.season.winner ? { winner: { ...baseState.season.winner } } : {}), victoryTrackers: baseState.season.victoryTrackers.map((tracker) => ({ ...tracker })) } } : {}),
    players: baseState.players ? [...baseState.players] : [],
    pendingSettlements: baseState.pendingSettlements ? [...baseState.pendingSettlements] : [],
    tileYieldCollectedAtByTile: baseState.tileYieldCollectedAtByTile ? [...baseState.tileYieldCollectedAtByTile] : [],
    collectVisibleCooldownByPlayer: baseState.collectVisibleCooldownByPlayer ? [...baseState.collectVisibleCooldownByPlayer] : []
  };
};

const parseOptionalJson = <T>(value?: string): T | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

const SYNTHETIC_SETTLEMENT_POPULATION = 800;

const isSyntheticSettlementIdentity = (
  town: Pick<NonNullable<DomainTileState["town"]>, "name" | "populationTier"> | undefined,
  x: number,
  y: number
): boolean => Boolean(town && town.populationTier === "SETTLEMENT" && town.name === `Settlement ${x},${y}`);

const minimumPopulationForTier = (populationTier: NonNullable<DomainTileState["town"]>["populationTier"]): number => {
  if (populationTier === "METROPOLIS") return METROPOLIS_POPULATION_MIN;
  if (populationTier === "GREAT_CITY") return GREAT_CITY_POPULATION_MIN;
  if (populationTier === "CITY") return CITY_POPULATION_MIN;
  if (populationTier === "TOWN") return POPULATION_TOWN_MIN;
  return SYNTHETIC_SETTLEMENT_POPULATION;
};

const hydrateRecoveredTown = (
  town: DomainTileState["town"] | undefined,
  x: number,
  y: number
): DomainTileState["town"] | undefined => {
  if (!town) return undefined;
  const defaultPopulation = isSyntheticSettlementIdentity(town, x, y)
    ? SYNTHETIC_SETTLEMENT_POPULATION
    : minimumPopulationForTier(town.populationTier);
  const population = typeof town.population === "number" ? town.population : defaultPopulation;
  const maxPopulation = typeof town.maxPopulation === "number" ? town.maxPopulation : POPULATION_MAX;
  return {
    ...town,
    population,
    maxPopulation
  };
};

const recoverTownState = (
  tileDelta: TileDelta,
  existing?: RecoveredTileState
): DomainTileState["town"] | undefined => {
  const parsedTown = parseOptionalJson<DomainTileState["town"]>(tileDelta.townJson);
  if (parsedTown) {
    return hydrateRecoveredTown({
      ...existing?.town,
      ...parsedTown,
      ...(tileDelta.townName ? { name: tileDelta.townName } : {}),
      type: parsedTown.type ?? tileDelta.townType ?? existing?.town?.type ?? "FARMING",
      populationTier: parsedTown.populationTier ?? tileDelta.townPopulationTier ?? existing?.town?.populationTier ?? "SETTLEMENT"
    }, tileDelta.x, tileDelta.y);
  }
  if (tileDelta.townName || tileDelta.townType || tileDelta.townPopulationTier) {
    return hydrateRecoveredTown({
      ...existing?.town,
      ...(tileDelta.townName ? { name: tileDelta.townName } : {}),
      type: tileDelta.townType ?? existing?.town?.type ?? "FARMING",
      populationTier: tileDelta.townPopulationTier ?? existing?.town?.populationTier ?? "SETTLEMENT"
    }, tileDelta.x, tileDelta.y);
  }
  return hydrateRecoveredTown(existing?.town, tileDelta.x, tileDelta.y);
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
    ...(tileDelta.shardSiteJson
      ? { shardSite: parseOptionalJson<DomainTileState["shardSite"]>(tileDelta.shardSiteJson) }
      : existing?.shardSite
        ? { shardSite: existing.shardSite }
        : {}),
    ...(tileDelta.ownerId ? { ownerId: tileDelta.ownerId } : existing?.ownerId ? { ownerId: existing.ownerId } : {}),
    ...(tileDelta.ownershipState
      ? { ownershipState: tileDelta.ownershipState as DomainTileState["ownershipState"] }
      : existing?.ownershipState
        ? { ownershipState: existing.ownershipState }
        : {}),
    ...(recoveredTown ? { town: recoveredTown } : {}),
    ...(tileDelta.fortJson
      ? { fort: parseOptionalJson<DomainTileState["fort"]>(tileDelta.fortJson) }
      : existing?.fort
        ? { fort: existing.fort }
        : {}),
    ...(tileDelta.observatoryJson
      ? { observatory: parseOptionalJson<DomainTileState["observatory"]>(tileDelta.observatoryJson) }
      : existing?.observatory
        ? { observatory: existing.observatory }
        : {}),
    ...(tileDelta.siegeOutpostJson
      ? { siegeOutpost: parseOptionalJson<DomainTileState["siegeOutpost"]>(tileDelta.siegeOutpostJson) }
      : existing?.siegeOutpost
        ? { siegeOutpost: existing.siegeOutpost }
        : {}),
    ...(tileDelta.economicStructureJson
      ? { economicStructure: parseOptionalJson<DomainTileState["economicStructure"]>(tileDelta.economicStructureJson) }
      : existing?.economicStructure
        ? { economicStructure: existing.economicStructure }
        : {}),
    ...(tileDelta.sabotageJson
      ? { sabotage: parseOptionalJson<DomainTileState["sabotage"]>(tileDelta.sabotageJson) }
      : existing?.sabotage
        ? { sabotage: existing.sabotage }
        : {})
  });
};

export const applySimulationEventsToRecoveredAccumulator = (
  accumulator: RecoveredSimulationAccumulator,
  events: SimulationEvent[]
): void => {
  for (const event of events) {
    if (event.eventType === "TILE_DELTA_BATCH") {
      for (const tileDelta of event.tileDeltas) {
        applyTileDeltaToRecoveredAccumulator(accumulator, tileDelta);
      }
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

    if (event.eventType === "COMBAT_RESOLVED") {
      if (accumulator.activeLocks.has(event.commandId)) {
        accumulator.activeLocks.delete(event.commandId);
      }
      if (event.attackerWon) {
        accumulator.tiles.set(simulationTileKey(event.targetX, event.targetY), {
          x: event.targetX,
          y: event.targetY,
          terrain: "LAND",
          ownerId: event.playerId,
          ownershipState: "FRONTIER"
        });
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
  tileYieldCollectedAtByTile: [...accumulator.tileYieldCollectedAtByTile],
  collectVisibleCooldownByPlayer: [...accumulator.collectVisibleCooldownByPlayer]
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
      collectVisibleCooldownByPlayer: []
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
