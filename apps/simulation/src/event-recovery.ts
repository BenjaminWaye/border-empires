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

type RecoveredPlayerState = NonNullable<RecoveredSimulationState["players"]>[number];
type TileDelta = Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"][number];
type PlayerUpdatePayload = {
  gold?: unknown;
  manpower?: unknown;
  manpowerCap?: unknown;
  strategicResources?: unknown;
};
type TechDomainPayload = {
  techIds?: unknown;
  domainIds?: unknown;
  mods?: unknown;
};

const parseJsonSafe = <T>(raw: string | undefined): T | undefined => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
};

const parseJsonRecord = (raw: string | undefined): Record<string, unknown> | undefined => {
  const parsed = parseJsonSafe<unknown>(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  return parsed as Record<string, unknown>;
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const sanitizeStrategicResources = (
  value: unknown
): Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const next: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> = {};
  const keys = ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"] as const;
  for (const key of keys) {
    const amount = input[key];
    if (typeof amount === "number" && Number.isFinite(amount)) next[key] = amount;
  }
  return Object.keys(next).length > 0 ? next : undefined;
};

const cloneRecoveredPlayer = (player: RecoveredPlayerState): RecoveredPlayerState => ({
  ...player,
  ...(player.techIds ? { techIds: [...player.techIds] } : {}),
  ...(player.domainIds ? { domainIds: [...player.domainIds] } : {}),
  ...(player.strategicResources ? { strategicResources: { ...player.strategicResources } } : {}),
  ...(player.allies ? { allies: [...player.allies] } : {})
});

const createFallbackRecoveredPlayer = (playerId: string): RecoveredPlayerState => ({
  id: playerId,
  points: 100,
  manpower: 150,
  strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
  allies: [],
  techIds: [],
  domainIds: [],
  vision: 1,
  incomeMultiplier: 1
});

const ensureRecoveredPlayer = (players: Map<string, RecoveredPlayerState>, playerId: string): RecoveredPlayerState => {
  const existing = players.get(playerId);
  if (existing) return existing;
  const created = createFallbackRecoveredPlayer(playerId);
  players.set(playerId, created);
  return created;
};

const applyTechDomainPayloadToPlayer = (player: RecoveredPlayerState, payload: TechDomainPayload): void => {
  if (isStringArray(payload.techIds)) player.techIds = [...payload.techIds];
  if (isStringArray(payload.domainIds)) player.domainIds = [...payload.domainIds];
  if (payload.mods && typeof payload.mods === "object" && !Array.isArray(payload.mods)) {
    const mods = payload.mods as Record<string, unknown>;
    if (typeof mods.vision === "number" && Number.isFinite(mods.vision)) player.vision = mods.vision;
    if (typeof mods.income === "number" && Number.isFinite(mods.income)) player.incomeMultiplier = mods.income;
  }
};

const applyPlayerUpdatePayloadToPlayer = (player: RecoveredPlayerState, payload: PlayerUpdatePayload): void => {
  if (typeof payload.gold === "number" && Number.isFinite(payload.gold)) player.points = payload.gold;
  if (typeof payload.manpower === "number" && Number.isFinite(payload.manpower)) player.manpower = payload.manpower;
  if (typeof payload.manpowerCap === "number" && Number.isFinite(payload.manpowerCap)) player.manpowerCapSnapshot = payload.manpowerCap;
  const strategicResources = sanitizeStrategicResources(payload.strategicResources);
  if (strategicResources) player.strategicResources = strategicResources;
};

const buildRecoveredTileFromDelta = (
  delta: TileDelta,
  previous: RecoveredTileState | undefined
): RecoveredTileState => {
  const parsedTown = parseJsonSafe<DomainTileState["town"]>(delta.townJson);
  const townFromFields =
    delta.townType || delta.townName || delta.townPopulationTier
      ? ({
          ...(previous?.town ?? {}),
          ...(delta.townType ? { type: delta.townType } : {}),
          ...(delta.townName ? { name: delta.townName } : {}),
          ...(delta.townPopulationTier ? { populationTier: delta.townPopulationTier } : {})
        } as DomainTileState["town"])
      : undefined;
  const town = parsedTown ?? townFromFields;
  const fort = parseJsonSafe<DomainTileState["fort"]>(delta.fortJson);
  const observatory = parseJsonSafe<DomainTileState["observatory"]>(delta.observatoryJson);
  const siegeOutpost = parseJsonSafe<DomainTileState["siegeOutpost"]>(delta.siegeOutpostJson);
  const economicStructure = parseJsonSafe<DomainTileState["economicStructure"]>(delta.economicStructureJson);
  const sabotage = parseJsonSafe<DomainTileState["sabotage"]>(delta.sabotageJson);
  const shardSite = parseJsonSafe<DomainTileState["shardSite"]>(delta.shardSiteJson);

  return {
    x: delta.x,
    y: delta.y,
    terrain: delta.terrain ?? previous?.terrain ?? "LAND",
    ...(delta.resource ? { resource: delta.resource as DomainTileState["resource"] } : {}),
    ...(delta.dockId ? { dockId: delta.dockId } : {}),
    ...(shardSite ? { shardSite } : {}),
    ...(delta.ownerId ? { ownerId: delta.ownerId } : {}),
    ...(delta.ownershipState ? { ownershipState: delta.ownershipState as DomainTileState["ownershipState"] } : {}),
    ...(town ? { town } : {}),
    ...(fort ? { fort } : {}),
    ...(observatory ? { observatory } : {}),
    ...(siegeOutpost ? { siegeOutpost } : {}),
    ...(economicStructure ? { economicStructure } : {}),
    ...(sabotage ? { sabotage } : {})
  };
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
  const tiles = new Map<string, RecoveredTileState>(
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
  const players = new Map<string, RecoveredPlayerState>(
    (baseState.players ?? []).map((player) => [player.id, cloneRecoveredPlayer(player)] as const)
  );

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

    if (event.eventType === "COMMAND_REJECTED" || event.eventType === "COMBAT_CANCELLED") {
      activeLocks.delete(event.commandId);
      continue;
    }

    if (event.eventType === "COMBAT_RESOLVED") {
      activeLocks.delete(event.commandId);
      if (event.attackerWon) {
        const previousTarget = tiles.get(simulationTileKey(event.targetX, event.targetY));
        tiles.set(simulationTileKey(event.targetX, event.targetY), {
          x: event.targetX,
          y: event.targetY,
          terrain: previousTarget?.terrain ?? "LAND",
          ...(previousTarget?.resource ? { resource: previousTarget.resource } : {}),
          ...(previousTarget?.dockId ? { dockId: previousTarget.dockId } : {}),
          ...(previousTarget?.town ? { town: previousTarget.town } : {}),
          ownerId: event.playerId,
          ownershipState: "FRONTIER"
        });
      }
      continue;
    }

    if (event.eventType === "TILE_DELTA_BATCH") {
      for (const tileDelta of event.tileDeltas) {
        const tileKey = simulationTileKey(tileDelta.x, tileDelta.y);
        const previous = tiles.get(tileKey);
        tiles.set(tileKey, buildRecoveredTileFromDelta(tileDelta, previous));
      }
      continue;
    }

    if (event.eventType === "PLAYER_MESSAGE") {
      if (event.messageType !== "PLAYER_UPDATE") continue;
      const payload = parseJsonRecord(event.payloadJson) as PlayerUpdatePayload | undefined;
      if (!payload) continue;
      const player = ensureRecoveredPlayer(players, event.playerId);
      applyPlayerUpdatePayloadToPlayer(player, payload);
      continue;
    }

    if (event.eventType === "TECH_UPDATE" || event.eventType === "DOMAIN_UPDATE") {
      const payload = parseJsonRecord(event.payloadJson) as TechDomainPayload | undefined;
      if (!payload) continue;
      const player = ensureRecoveredPlayer(players, event.playerId);
      applyTechDomainPayloadToPlayer(player, payload);
      continue;
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
    players: [...players.values()].sort((left, right) => left.id.localeCompare(right.id)),
    pendingSettlements: baseState.pendingSettlements ? [...baseState.pendingSettlements] : [],
    tileYieldCollectedAtByTile: baseState.tileYieldCollectedAtByTile ? [...baseState.tileYieldCollectedAtByTile] : [],
    collectVisibleCooldownByPlayer: baseState.collectVisibleCooldownByPlayer ? [...baseState.collectVisibleCooldownByPlayer] : []
  };
};
