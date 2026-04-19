import { EventEmitter } from "node:events";

import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import {
  validateFrontierCommand,
  type DomainPlayer,
  type DomainStrategicResourceKey,
  type DomainTileState,
  type FrontierCommandType
} from "@border-empires/game-domain";
import {
  ATTACK_MANPOWER_MIN,
  DEVELOPMENT_PROCESS_LIMIT,
  FRONTIER_CLAIM_COST,
  MANPOWER_BASE_REGEN_PER_MINUTE,
  MANPOWER_BASE_CAP,
  SETTLE_COST,
  rollFrontierCombat,
  structureBuildDurationMs,
  structureBuildGoldCost,
  structureCostDefinition,
  structurePlacementMetadata,
  structureShowsOnTile,
  type BuildableStructureType,
  type EconomicStructureType
} from "@border-empires/shared";
import {
  AETHER_BRIDGE_COOLDOWN_MS,
  AETHER_BRIDGE_CRYSTAL_COST,
  AETHER_BRIDGE_DURATION_MS,
  AETHER_BRIDGE_MAX_SEA_TILES,
  AETHER_WALL_COOLDOWN_MS,
  AETHER_WALL_CRYSTAL_COST,
  AETHER_WALL_DURATION_MS,
  AIRPORT_BOMBARD_OIL_COST,
  AIRPORT_BOMBARD_RANGE,
  BREAKTHROUGH_GOLD_COST,
  BREAKTHROUGH_IRON_COST,
  BREAKTHROUGH_REQUIRED_TECH_ID,
  ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS,
  CRYSTAL_SYNTHESIZER_OVERLOAD_CRYSTAL,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP,
  FUEL_PLANT_GOLD_UPKEEP,
  FUR_SYNTHESIZER_OVERLOAD_SUPPLY,
  FUR_SYNTHESIZER_GOLD_UPKEEP,
  IRONWORKS_OVERLOAD_IRON,
  IRONWORKS_GOLD_UPKEEP,
  REVEAL_EMPIRE_ACTIVATION_COST,
  REVEAL_EMPIRE_STATS_COOLDOWN_MS,
  REVEAL_EMPIRE_STATS_CRYSTAL_COST,
  SIPHON_COOLDOWN_MS,
  SIPHON_CRYSTAL_COST,
  SIPHON_DURATION_MS,
  SIPHON_PURGE_CRYSTAL_COST,
  SIPHON_SHARE,
  SYNTH_OVERLOAD_DISABLE_MS,
  SYNTH_OVERLOAD_GOLD_COST
  ,
  TERRAIN_SHAPING_COOLDOWN_MS,
  TERRAIN_SHAPING_CRYSTAL_COST,
  TERRAIN_SHAPING_GOLD_COST
} from "../../../packages/server/src/server-game-constants.js";
import { hasStrategicSettlementValue, rankSettlementTile } from "./ai-settlement-priority.js";
import { laneForCommand, type QueueLane } from "./command-lane.js";
import { isFrontierAdjacent } from "./frontier-adjacency.js";
import { chooseNextOwnedFrontierCommandFromLookup } from "./frontier-command-planner.js";
import { buildPlayerDefensibilityMetrics } from "./player-defensibility-metrics.js";
import {
  addPendingSettlementToSummary,
  applyTileToPlayerSummary,
  cloneStrategicProduction,
  createEmptyPlayerRuntimeSummary,
  removePendingSettlementFromSummary,
  removeTileFromPlayerSummary,
  type PendingSettlementRecord,
  type PlayerRuntimeSummary
} from "./player-runtime-summary.js";
import { buildPlayerUpdateEconomySnapshot } from "./player-update-economy.js";
import { createSeedWorld, type SimulationSeedProfile, simulationTileKey } from "./seed-state.js";
import type { RecoveredSimulationState } from "./event-recovery.js";
import type { RecoveredCommandHistory } from "./command-recovery.js";
import { buildSimulationSnapshotCommandEvents, type SimulationSnapshotSections } from "./snapshot-store.js";
import { buildDomainUpdatePayload, buildTechUpdatePayload, chooseDomainForPlayer, chooseTechForPlayer } from "./tech-domain-bridge.js";
import { buildTileYieldView } from "./tile-yield-view.js";

type LockRecord = {
  commandId: string;
  playerId: string;
  actionType: FrontierCommandType;
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  targetKey: string;
  originKey: string;
  resolvesAt: number;
};

type CrystalAbilityId =
  | "aether_bridge"
  | "aether_wall"
  | "siphon"
  | "reveal_empire_stats"
  | "create_mountain"
  | "remove_mountain";

type AetherWallDirection = "N" | "E" | "S" | "W";

type ActiveAetherBridgeView = {
  bridgeId: string;
  ownerId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  startedAt: number;
  endsAt: number;
};

type ActiveAetherWallView = {
  wallId: string;
  ownerId: string;
  origin: { x: number; y: number };
  direction: AetherWallDirection;
  length: 1 | 2 | 3;
  startedAt: number;
  endsAt: number;
};

type SimulationJob = {
  lane: QueueLane;
  run: () => void;
};

type StrategicResourceKey = DomainStrategicResourceKey;
type RuntimePlayer = DomainPlayer & {
  manpowerUpdatedAt?: number;
  manpowerCapSnapshot?: number;
};

type SimulationPersistence = {
  recordCommand: (command: CommandEnvelope) => void;
  recordEvent: (event: SimulationEvent) => void;
  snapshot: () => {
    commands: CommandEnvelope[];
    events: SimulationEvent[];
  };
};

export class InMemorySimulationPersistence implements SimulationPersistence {
  private readonly commands: CommandEnvelope[] = [];
  private readonly events: SimulationEvent[] = [];

  recordCommand(command: CommandEnvelope): void {
    this.commands.push(command);
  }

  recordEvent(event: SimulationEvent): void {
    this.events.push(event);
  }

  snapshot(): { commands: CommandEnvelope[]; events: SimulationEvent[] } {
    return {
      commands: [...this.commands],
      events: [...this.events]
    };
  }
}

type SimulationRuntimeOptions = {
  now?: () => number;
  persistence?: SimulationPersistence;
  backgroundBatchSize?: number;
  scheduleSoon?: (task: () => void) => void;
  scheduleAfter?: (delayMs: number, task: () => void) => void;
  initialState?: RecoveredSimulationState;
  initialCommandHistory?: RecoveredCommandHistory;
  seedProfile?: SimulationSeedProfile;
  seedTiles?: Map<string, DomainTileState>;
  initialPlayers?: Map<string, RuntimePlayer>;
};

const createPlayersFromRecoveredState = (initialState?: RecoveredSimulationState): Map<string, RuntimePlayer> | undefined => {
  if (!initialState?.players || initialState.players.length === 0) return undefined;
  return new Map(
    initialState.players.map((player) => [
      player.id,
      {
        id: player.id,
        isAi: player.isAi ?? false,
        name: player.name ?? player.id,
        points: player.points ?? 0,
        manpower: player.manpower ?? MANPOWER_BASE_CAP,
        ...(typeof player.manpowerUpdatedAt === "number" ? { manpowerUpdatedAt: player.manpowerUpdatedAt } : {}),
        ...(typeof player.manpowerCapSnapshot === "number" ? { manpowerCapSnapshot: player.manpowerCapSnapshot } : {}),
        techIds: new Set(player.techIds ?? []),
        domainIds: new Set(player.domainIds ?? []),
        mods: {
          attack: 1,
          defense: 1,
          income: player.incomeMultiplier ?? 1,
          vision: player.vision ?? 1
        },
        techRootId: "rewrite-recovered",
        allies: new Set(player.allies ?? []),
        strategicResources: {
          FOOD: player.strategicResources?.FOOD ?? 0,
          IRON: player.strategicResources?.IRON ?? 0,
          CRYSTAL: player.strategicResources?.CRYSTAL ?? 0,
          SUPPLY: player.strategicResources?.SUPPLY ?? 0,
          SHARD: player.strategicResources?.SHARD ?? 0,
          OIL: player.strategicResources?.OIL ?? 0
        },
        strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }
      }
    ])
  );
};

const priorityOrder: QueueLane[] = ["human_interactive", "human_noninteractive", "system", "ai"];
const SETTLE_DURATION_MS = 60_000;
const COLLECT_VISIBLE_COOLDOWN_MS = 20_000;

const strategicResourceForTile = (resource: DomainTileState["resource"] | undefined): StrategicResourceKey | undefined => {
  switch (resource) {
    case "FARM":
    case "FISH":
      return "FOOD";
    case "IRON":
      return "IRON";
    case "GEMS":
      return "CRYSTAL";
    case "FUR":
      return "SUPPLY";
    case "OIL":
      return "OIL";
    default:
      return undefined;
  }
};

const parseFrontierPayload = (payloadJson: string): { fromX: number; fromY: number; toX: number; toY: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (
      typeof parsed.fromX !== "number" ||
      typeof parsed.fromY !== "number" ||
      typeof parsed.toX !== "number" ||
      typeof parsed.toY !== "number"
    ) {
      return null;
    }
    return {
      fromX: parsed.fromX,
      fromY: parsed.fromY,
      toX: parsed.toX,
      toY: parsed.toY
    };
  } catch {
    return null;
  }
};

const parseSettlePayload = (payloadJson: string): { x: number; y: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
};

const parseTilePayload = (payloadJson: string): { x: number; y: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
};

const parseStructureTilePayload = (payloadJson: string): { x: number; y: number } | null => parseTilePayload(payloadJson);

const parseConverterTogglePayload = (payloadJson: string): { x: number; y: number; enabled: boolean } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number" || typeof parsed.enabled !== "boolean") return null;
    return {
      x: parsed.x,
      y: parsed.y,
      enabled: parsed.enabled
    };
  } catch {
    return null;
  }
};

const parseEconomicStructurePayload = (payloadJson: string): { x: number; y: number; structureType: EconomicStructureType } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number" || typeof parsed.structureType !== "string") return null;
    return {
      x: parsed.x,
      y: parsed.y,
      structureType: parsed.structureType as EconomicStructureType
    };
  } catch {
    return null;
  }
};

const parseRevealPayload = (payloadJson: string): { targetPlayerId: string } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.targetPlayerId !== "string" || parsed.targetPlayerId.length === 0) return null;
    return { targetPlayerId: parsed.targetPlayerId };
  } catch {
    return null;
  }
};

const parseAetherWallPayload = (
  payloadJson: string
): { x: number; y: number; direction: AetherWallDirection; length: 1 | 2 | 3 } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      (parsed.direction !== "N" && parsed.direction !== "E" && parsed.direction !== "S" && parsed.direction !== "W") ||
      (parsed.length !== 1 && parsed.length !== 2 && parsed.length !== 3)
    ) {
      return null;
    }
    return {
      x: parsed.x,
      y: parsed.y,
      direction: parsed.direction,
      length: parsed.length
    };
  } catch {
    return null;
  }
};

const parseAirportBombardPayload = (payloadJson: string): { fromX: number; fromY: number; toX: number; toY: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (
      typeof parsed.fromX !== "number" ||
      typeof parsed.fromY !== "number" ||
      typeof parsed.toX !== "number" ||
      typeof parsed.toY !== "number"
    ) {
      return null;
    }
    return {
      fromX: parsed.fromX,
      fromY: parsed.fromY,
      toX: parsed.toX,
      toY: parsed.toY
    };
  } catch {
    return null;
  }
};

const TECH_REQUIREMENTS_BY_STRUCTURE: Partial<Record<EconomicStructureType, string>> = {
  FARMSTEAD: "agriculture",
  CAMP: "leatherworking",
  MINE: "mining",
  MARKET: "trade",
  GRANARY: "pottery",
  BANK: "coinage",
  AIRPORT: "aeronautics",
  FUR_SYNTHESIZER: "workshops",
  ADVANCED_FUR_SYNTHESIZER: "advanced-synthetication",
  IRONWORKS: "alchemy",
  ADVANCED_IRONWORKS: "advanced-synthetication",
  CRYSTAL_SYNTHESIZER: "crystal-lattices",
  ADVANCED_CRYSTAL_SYNTHESIZER: "advanced-synthetication",
  FUEL_PLANT: "plastics",
  CARAVANARY: "ledger-keeping",
  FOUNDRY: "industrial-extraction",
  GARRISON_HALL: "organization",
  CUSTOMS_HOUSE: "trade",
  GOVERNORS_OFFICE: "civil-service",
  RADAR_SYSTEM: "radar"
};

const upgradeBaseTypeForEconomicStructure = (type: EconomicStructureType): EconomicStructureType | undefined => {
  if (type === "ADVANCED_FUR_SYNTHESIZER") return "FUR_SYNTHESIZER";
  if (type === "ADVANCED_IRONWORKS") return "IRONWORKS";
  if (type === "ADVANCED_CRYSTAL_SYNTHESIZER") return "CRYSTAL_SYNTHESIZER";
  return undefined;
};

const isConverterStructureType = (structureType: EconomicStructureType): boolean =>
  structureType === "FUR_SYNTHESIZER" ||
  structureType === "ADVANCED_FUR_SYNTHESIZER" ||
  structureType === "IRONWORKS" ||
  structureType === "ADVANCED_IRONWORKS" ||
  structureType === "CRYSTAL_SYNTHESIZER" ||
  structureType === "ADVANCED_CRYSTAL_SYNTHESIZER" ||
  structureType === "FUEL_PLANT";

const economicStructureGoldUpkeepPerInterval = (structureType: EconomicStructureType): number => {
  const perMinute =
    structureType === "ADVANCED_FUR_SYNTHESIZER" || structureType === "FUR_SYNTHESIZER" ? FUR_SYNTHESIZER_GOLD_UPKEEP / 10
      : structureType === "IRONWORKS" || structureType === "ADVANCED_IRONWORKS" ? IRONWORKS_GOLD_UPKEEP / 10
      : structureType === "CRYSTAL_SYNTHESIZER" || structureType === "ADVANCED_CRYSTAL_SYNTHESIZER" ? CRYSTAL_SYNTHESIZER_GOLD_UPKEEP / 10
      : structureType === "FUEL_PLANT" ? FUEL_PLANT_GOLD_UPKEEP / 10
      : 0;
  return perMinute * (ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS / 60_000);
};

const isSyntheticSettlementTown = (
  town: DomainTileState["town"] | undefined,
  x: number,
  y: number
): boolean =>
  Boolean(
    town &&
    town.populationTier === "SETTLEMENT" &&
    town.name === `Settlement ${x},${y}`
  );

export class SimulationRuntime {
  private readonly events = new EventEmitter();
  private readonly persistence: SimulationPersistence;
  private readonly now: () => number;
  private readonly players: Map<string, RuntimePlayer>;
  private readonly tiles: Map<string, DomainTileState>;
  private readonly playerSummaries = new Map<string, PlayerRuntimeSummary>();
  private readonly locksByTile: Map<string, LockRecord>;
  private readonly collectVisibleCooldownByPlayer = new Map<string, number>();
  private readonly tileYieldCollectedAtByTile = new Map<string, number>();
  private readonly revealTargetsByPlayer = new Map<string, Set<string>>();
  private readonly abilityCooldownsByPlayer = new Map<string, Partial<Record<CrystalAbilityId, number>>>();
  private readonly activeAetherBridgesByPlayer = new Map<string, ActiveAetherBridgeView[]>();
  private readonly activeAetherWallsByPlayer = new Map<string, ActiveAetherWallView[]>();
  private readonly pendingSettlementsByTile = new Map<string, PendingSettlementRecord>();
  private readonly jobsByLane: Record<QueueLane, SimulationJob[]> = {
    human_interactive: [],
    human_noninteractive: [],
    system: [],
    ai: []
  };
  private readonly recordedEventsByCommandId = new Map<string, SimulationEvent[]>();
  private readonly commandIdsByPlayerSeq = new Map<string, string>();
  private readonly backgroundBatchSize: number;
  private readonly scheduleSoon: (task: () => void) => void;
  private readonly scheduleAfter: (delayMs: number, task: () => void) => void;
  private drainScheduled = false;
  private draining = false;

  constructor(options: SimulationRuntimeOptions = {}) {
    const seedWorld = options.initialPlayers && options.seedTiles ? undefined : createSeedWorld(options.seedProfile);
    this.now = options.now ?? (() => Date.now());
    this.persistence = options.persistence ?? new InMemorySimulationPersistence();
    this.backgroundBatchSize = Math.max(1, options.backgroundBatchSize ?? 8);
    this.scheduleSoon = options.scheduleSoon ?? ((task) => queueMicrotask(task));
    this.scheduleAfter = options.scheduleAfter ?? ((delayMs, task) => void setTimeout(task, delayMs));
    this.players = createPlayersFromRecoveredState(options.initialState) ?? (options.initialPlayers ? new Map(options.initialPlayers) : seedWorld!.players);
    for (const player of this.players.values()) this.applyManpowerRegen(player);
    this.tiles = createTilesFromInitialState(options.initialState, options.seedTiles ?? seedWorld!.tiles);
    this.locksByTile = createLocksFromInitialState(options.initialState);
    for (const yieldEntry of options.initialState?.tileYieldCollectedAtByTile ?? []) {
      this.tileYieldCollectedAtByTile.set(yieldEntry.tileKey, yieldEntry.collectedAt);
    }
    for (const cooldown of options.initialState?.collectVisibleCooldownByPlayer ?? []) {
      this.collectVisibleCooldownByPlayer.set(cooldown.playerId, cooldown.cooldownUntil);
    }
    for (const playerId of this.players.keys()) {
      this.playerSummaries.set(playerId, createEmptyPlayerRuntimeSummary());
    }
    for (const [tileKey, tile] of this.tiles.entries()) {
      this.applyTileToPlayerSummaries(tileKey, tile);
    }
    for (const pendingSettlement of options.initialState?.pendingSettlements ?? []) {
      this.addPendingSettlement({ ...pendingSettlement });
      const delayMs = Math.max(0, pendingSettlement.resolvesAt - this.now());
      this.scheduleAfter(delayMs, () => {
        this.removePendingSettlement(pendingSettlement.tileKey);
        const latest = this.tiles.get(pendingSettlement.tileKey);
        if (!latest || latest.ownerId !== pendingSettlement.ownerId) {
          this.emitPlayerStateUpdate({ commandId: `recovered-settle:${pendingSettlement.tileKey}`, playerId: pendingSettlement.ownerId });
          return;
        }
        const settledTile: DomainTileState = {
          ...latest,
          ownerId: pendingSettlement.ownerId,
          ownershipState: "SETTLED",
          ...(latest.town ? { town: latest.town } : {})
        };
        this.tileYieldCollectedAtByTile.set(pendingSettlement.tileKey, this.now());
        this.replaceTileState(pendingSettlement.tileKey, settledTile);
        this.emitEvent({
          eventType: "TILE_DELTA_BATCH",
          commandId: `recovered-settle:${pendingSettlement.tileKey}`,
          playerId: pendingSettlement.ownerId,
          tileDeltas: [this.tileDeltaFromState(settledTile)]
        });
        this.emitPlayerStateUpdate({ commandId: `recovered-settle:${pendingSettlement.tileKey}`, playerId: pendingSettlement.ownerId });
      });
    }
    const recoveredCommandHistory = options.initialCommandHistory;
    hydrateCommandHistory({
      commandIdsByPlayerSeq: this.commandIdsByPlayerSeq,
      recordedEventsByCommandId: this.recordedEventsByCommandId,
      ...(recoveredCommandHistory ? { recoveredCommandHistory } : {})
    });
    for (const lock of uniqueLocksByCommandId(this.locksByTile.values())) {
      this.scheduleLockResolution(lock);
    }
    requeueRecoveredCommands({
      ...(recoveredCommandHistory ? { recoveredCommandHistory } : {}),
      queueCommandForProcessing: (command) => this.queueCommandForProcessing(command)
    });
  }

  onEvent(listener: (event: SimulationEvent) => void): () => void {
    this.events.on("event", listener);
    return () => this.events.off("event", listener);
  }

  enqueueBackgroundJob(job: () => void): void {
    this.enqueueJob("ai", job);
  }

  queueDepths(): Record<QueueLane, number> {
    return {
      human_interactive: this.jobsByLane.human_interactive.length,
      human_noninteractive: this.jobsByLane.human_noninteractive.length,
      system: this.jobsByLane.system.length,
      ai: this.jobsByLane.ai.length
    };
  }

  private summaryForPlayer(playerId: string): PlayerRuntimeSummary {
    const existing = this.playerSummaries.get(playerId);
    if (existing) return existing;
    const summary = createEmptyPlayerRuntimeSummary();
    this.playerSummaries.set(playerId, summary);
    return summary;
  }

  private playerManpowerCap(player: RuntimePlayer): number {
    const snapshotCap = Number.isFinite(player.manpowerCapSnapshot) ? Math.max(0, player.manpowerCapSnapshot ?? 0) : 0;
    return Math.max(MANPOWER_BASE_CAP, snapshotCap);
  }

  private effectiveManpowerAt(player: RuntimePlayer, nowMs = this.now()): number {
    const cap = this.playerManpowerCap(player);
    if (!Number.isFinite(player.manpower)) return cap;
    if (!Number.isFinite(player.manpowerUpdatedAt)) return Math.min(cap, Math.max(0, player.manpower));
    const updatedAt = player.manpowerUpdatedAt ?? nowMs;
    const elapsedMinutes = Math.max(0, (nowMs - updatedAt) / 60_000);
    const nextManpower =
      elapsedMinutes > 0 ? player.manpower + elapsedMinutes * MANPOWER_BASE_REGEN_PER_MINUTE : player.manpower;
    return Math.max(0, Math.min(cap, nextManpower));
  }

  private applyManpowerRegen(player: RuntimePlayer, nowMs = this.now()): void {
    const cap = this.playerManpowerCap(player);
    if (!Number.isFinite(player.manpower)) {
      player.manpower = cap;
      player.manpowerUpdatedAt = nowMs;
      player.manpowerCapSnapshot = cap;
      return;
    }
    if (!Number.isFinite(player.manpowerUpdatedAt)) {
      player.manpower = Math.max(0, Math.min(cap, player.manpower));
      player.manpowerUpdatedAt = nowMs;
      player.manpowerCapSnapshot = cap;
      return;
    }
    player.manpower = this.effectiveManpowerAt(player, nowMs);
    player.manpowerUpdatedAt = nowMs;
    player.manpowerCapSnapshot = cap;
  }

  private applyTileToPlayerSummaries(tileKey: string, tile: DomainTileState): void {
    if (!tile.ownerId) return;
    applyTileToPlayerSummary(this.summaryForPlayer(tile.ownerId), tileKey, tile);
  }

  private removeTileFromPlayerSummaries(tileKey: string, tile: DomainTileState): void {
    if (!tile.ownerId) return;
    removeTileFromPlayerSummary(this.summaryForPlayer(tile.ownerId), tileKey, tile);
  }

  private replaceTileState(tileKey: string, tile: DomainTileState): void {
    const previous = this.tiles.get(tileKey);
    if (previous) this.removeTileFromPlayerSummaries(tileKey, previous);
    this.tiles.set(tileKey, tile);
    this.applyTileToPlayerSummaries(tileKey, tile);
  }

  private addPendingSettlement(record: PendingSettlementRecord): void {
    this.pendingSettlementsByTile.set(record.tileKey, record);
    addPendingSettlementToSummary(this.summaryForPlayer(record.ownerId), record);
  }

  private removePendingSettlement(tileKey: string): PendingSettlementRecord | undefined {
    const record = this.pendingSettlementsByTile.get(tileKey);
    if (!record) return undefined;
    this.pendingSettlementsByTile.delete(tileKey);
    removePendingSettlementFromSummary(this.summaryForPlayer(record.ownerId), tileKey);
    return record;
  }

  private pendingSettlementsSnapshotForPlayer(playerId: string): Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> {
    return [...this.summaryForPlayer(playerId).pendingSettlementsByTile.values()]
      .map((settlement) => {
        const [rawX, rawY] = settlement.tileKey.split(",");
        const x = Number(rawX);
        const y = Number(rawY);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y, startedAt: settlement.startedAt, resolvesAt: settlement.resolvesAt } : undefined;
      })
      .filter((settlement): settlement is NonNullable<typeof settlement> => Boolean(settlement))
      .sort((left, right) => (left.resolvesAt - right.resolvesAt) || (left.x - right.x) || (left.y - right.y));
  }

  chooseNextOwnedFrontierCommand(
    playerId: string,
    clientSeq: number,
    issuedAt: number,
    sessionPrefix: "ai-runtime" | "system-runtime"
  ): CommandEnvelope | undefined {
    for (const lock of this.locksByTile.values()) {
      if (lock.playerId === playerId) return undefined;
    }
    const ownedTiles = [...this.summaryForPlayer(playerId).territoryTileKeys]
      .map((tileKey) => this.tiles.get(tileKey))
      .filter((tile): tile is DomainTileState => Boolean(tile))
      .sort((left, right) => (left.x - right.x) || (left.y - right.y));
    const player = this.players.get(playerId);
    return chooseNextOwnedFrontierCommandFromLookup(this.tiles, ownedTiles, playerId, clientSeq, issuedAt, sessionPrefix, {
      canAttack: (player?.points ?? 0) >= FRONTIER_CLAIM_COST && (player?.manpower ?? 0) >= ATTACK_MANPOWER_MIN,
      canExpand: (player?.points ?? 0) >= FRONTIER_CLAIM_COST
    });
  }

  chooseNextAutomationCommand(
    playerId: string,
    clientSeq: number,
    issuedAt: number,
    sessionPrefix: "ai-runtime" | "system-runtime"
  ): CommandEnvelope | undefined {
    const player = this.players.get(playerId);
    if (!player) return undefined;
    const summary = this.summaryForPlayer(playerId);
    if (
      sessionPrefix === "ai-runtime" &&
      summary.activeDevelopmentProcessCount < DEVELOPMENT_PROCESS_LIMIT &&
      player.points >= SETTLE_COST
    ) {
      const rankedFrontierTiles = [...summary.frontierTileKeys]
        .map((tileKey) => this.tiles.get(tileKey))
        .filter((tile): tile is DomainTileState => tile !== undefined)
        .filter((tile) => tile.terrain === "LAND" && tile.ownerId === playerId)
        .filter((tile) => !summary.pendingSettlementsByTile.has(simulationTileKey(tile.x, tile.y)))
        .sort(
          (left, right) =>
            rankSettlementTile(playerId, right, this.tiles) - rankSettlementTile(playerId, left, this.tiles) ||
            (left.x - right.x) ||
            (left.y - right.y)
        );
      const nextFrontierTile = rankedFrontierTiles.find((tile) => hasStrategicSettlementValue(playerId, tile, this.tiles));
      if (nextFrontierTile) {
        return {
          commandId: `${sessionPrefix}-${playerId}-${clientSeq}-${issuedAt}`,
          sessionId: `${sessionPrefix}:${playerId}`,
          playerId,
          clientSeq,
          issuedAt,
          type: "SETTLE",
          payloadJson: JSON.stringify({ x: nextFrontierTile.x, y: nextFrontierTile.y })
        };
      }
    }
    return this.chooseNextOwnedFrontierCommand(playerId, clientSeq, issuedAt, sessionPrefix);
  }

  submitCommand(command: CommandEnvelope): void {
    const existingEvents = this.recordedEventsByCommandId.get(command.commandId);
    if (existingEvents) {
      for (const event of existingEvents) this.events.emit("event", event);
      return;
    }

    const playerSeqKey = `${command.playerId}:${command.clientSeq}`;
    const existingCommandId = this.commandIdsByPlayerSeq.get(playerSeqKey);
    if (existingCommandId) {
      const replayEvents = this.recordedEventsByCommandId.get(existingCommandId);
      if (replayEvents) {
        for (const event of replayEvents) this.events.emit("event", event);
      }
      return;
    }

    this.commandIdsByPlayerSeq.set(playerSeqKey, command.commandId);
    this.persistence.recordCommand(command);
    this.queueCommandForProcessing(command);
  }

  snapshot(): { commands: CommandEnvelope[]; events: SimulationEvent[] } {
    return this.persistence.snapshot();
  }

  exportSnapshotSections(): SimulationSnapshotSections {
    return {
      initialState: {
        tiles: [...this.tiles.values()]
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
        activeLocks: [...new Map([...this.locksByTile.entries()].map(([, lock]) => [lock.commandId, lock])).values()]
          .map((lock) => ({
            commandId: lock.commandId,
            playerId: lock.playerId,
            actionType: lock.actionType,
            originX: lock.originX,
            originY: lock.originY,
            targetX: lock.targetX,
            targetY: lock.targetY,
            originKey: lock.originKey,
            targetKey: lock.targetKey,
            resolvesAt: lock.resolvesAt
          }))
          .sort((left, right) => left.commandId.localeCompare(right.commandId))
        ,
        players: [...this.players.values()]
          .map((player) => ({
            id: player.id,
            ...(player.name ? { name: player.name } : {}),
            isAi: player.isAi,
            points: player.points,
            manpower: player.manpower,
            ...(typeof player.manpowerUpdatedAt === "number" ? { manpowerUpdatedAt: player.manpowerUpdatedAt } : {}),
            ...(typeof player.manpowerCapSnapshot === "number" ? { manpowerCapSnapshot: player.manpowerCapSnapshot } : {}),
            techIds: [...player.techIds].sort(),
            domainIds: [...(player.domainIds ?? [])].sort(),
            strategicResources: { ...(player.strategicResources ?? {}) },
            allies: [...player.allies].sort(),
            vision: player.mods?.vision ?? 1,
            incomeMultiplier: player.mods?.income ?? 1
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
        pendingSettlements: [...this.pendingSettlementsByTile.values()]
          .map((settlement) => ({ ...settlement }))
          .sort((left, right) => left.tileKey.localeCompare(right.tileKey)),
        tileYieldCollectedAtByTile: [...this.tileYieldCollectedAtByTile.entries()]
          .map(([tileKey, collectedAt]) => ({ tileKey, collectedAt }))
          .sort((left, right) => left.tileKey.localeCompare(right.tileKey)),
        collectVisibleCooldownByPlayer: [...this.collectVisibleCooldownByPlayer.entries()]
          .map(([playerId, cooldownUntil]) => ({ playerId, cooldownUntil }))
          .sort((left, right) => left.playerId.localeCompare(right.playerId))
      },
      commandEvents: buildSimulationSnapshotCommandEvents(this.recordedEventsByCommandId)
    };
  }

  exportState(): {
    tiles: Array<{
      x: number;
      y: number;
      terrain: "LAND" | "SEA" | "MOUNTAIN";
      resource?: string;
      dockId?: string;
      shardSiteJson?: string;
      ownerId?: string;
      ownershipState?: string;
      townJson?: string;
      townType?: "MARKET" | "FARMING";
      townName?: string;
      townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
      fortJson?: string;
      observatoryJson?: string;
      siegeOutpostJson?: string;
      economicStructureJson?: string;
      sabotageJson?: string;
    }>;
    players: Array<{
      id: string;
      name?: string;
      points: number;
      manpower: number;
      manpowerCapSnapshot?: number;
      techIds: string[];
      domainIds: string[];
      strategicResources: Partial<Record<StrategicResourceKey, number>>;
      allies: string[];
      vision: number;
      visionRadiusBonus: number;
      incomeMultiplier?: number;
      territoryTileKeys: string[];
      settledTileCount?: number;
      townCount?: number;
      incomePerMinute?: number;
      strategicProductionPerMinute?: Record<StrategicResourceKey, number>;
      activeDevelopmentProcessCount?: number;
    }>;
    pendingSettlements: Array<PendingSettlementRecord>;
    activeLocks: Array<{ commandId: string; playerId: string; originKey: string; targetKey: string; resolvesAt: number }>;
    tileYieldCollectedAtByTile: Array<{ tileKey: string; collectedAt: number }>;
  } {
    return {
      tiles: [...this.tiles.values()]
        .map((tile) => ({
          x: tile.x,
          y: tile.y,
          terrain: tile.terrain,
          ...(tile.resource ? { resource: tile.resource } : {}),
          ...(tile.dockId ? { dockId: tile.dockId } : {}),
          ...(tile.shardSite ? { shardSiteJson: JSON.stringify(tile.shardSite) } : {}),
          ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
          ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
          ...(tile.town ? { townJson: JSON.stringify(tile.town) } : {}),
          ...(tile.town?.type ? { townType: tile.town.type } : {}),
          ...(tile.town?.name ? { townName: tile.town.name } : {}),
          ...(tile.town?.populationTier ? { townPopulationTier: tile.town.populationTier } : {}),
          ...(tile.fort ? { fortJson: JSON.stringify(tile.fort) } : {}),
          ...(tile.observatory ? { observatoryJson: JSON.stringify(tile.observatory) } : {}),
          ...(tile.siegeOutpost ? { siegeOutpostJson: JSON.stringify(tile.siegeOutpost) } : {}),
          ...(tile.economicStructure ? { economicStructureJson: JSON.stringify(tile.economicStructure) } : {}),
          ...(tile.sabotage ? { sabotageJson: JSON.stringify(tile.sabotage) } : {})
        }))
        .sort((left, right) => (left.x - right.x) || (left.y - right.y)),
      players: [...this.players.values()]
        .map((player) => {
          this.applyManpowerRegen(player);
          const summary = this.summaryForPlayer(player.id);
          return {
            id: player.id,
            ...(player.name ? { name: player.name } : {}),
            points: player.points,
            manpower: player.manpower,
            ...(typeof player.manpowerCapSnapshot === "number" ? { manpowerCapSnapshot: player.manpowerCapSnapshot } : {}),
            techIds: [...player.techIds].sort(),
            domainIds: [...(player.domainIds ?? [])].sort(),
            strategicResources: { ...(player.strategicResources ?? {}) },
            allies: [...player.allies].sort(),
            vision: player.mods?.vision ?? 1,
            visionRadiusBonus: 0,
            incomeMultiplier: player.mods?.income ?? 1,
            territoryTileKeys: [...summary.territoryTileKeys].sort(),
            settledTileCount: summary.settledTileCount,
            townCount: summary.townCount,
            incomePerMinute: Math.round(summary.goldIncomePerMinute * (player.mods?.income ?? 1) * 100) / 100,
            strategicProductionPerMinute: cloneStrategicProduction(summary.strategicProductionPerMinute),
            activeDevelopmentProcessCount: summary.activeDevelopmentProcessCount
          };
        })
        .sort((left, right) => left.id.localeCompare(right.id)),
      pendingSettlements: [...this.pendingSettlementsByTile.values()]
        .map((settlement) => ({ ...settlement }))
        .sort((left, right) => left.tileKey.localeCompare(right.tileKey)),
      activeLocks: [...new Map([...this.locksByTile.entries()].map(([, lock]) => [lock.commandId, lock])).values()]
        .map((lock) => ({
          commandId: lock.commandId,
          playerId: lock.playerId,
          originKey: lock.originKey,
          targetKey: lock.targetKey,
          resolvesAt: lock.resolvesAt
        }))
        .sort((left, right) => left.commandId.localeCompare(right.commandId)),
      tileYieldCollectedAtByTile: [...this.tileYieldCollectedAtByTile.entries()]
        .map(([tileKey, collectedAt]) => ({ tileKey, collectedAt }))
        .sort((left, right) => left.tileKey.localeCompare(right.tileKey))
    };
  }

  private settledTileCountForPlayer(playerId: string): number {
    return this.summaryForPlayer(playerId).settledTileCount;
  }

  private strategicProductionPerMinuteForPlayer(playerId: string): Record<StrategicResourceKey, number> {
    return cloneStrategicProduction(this.summaryForPlayer(playerId).strategicProductionPerMinute);
  }

  private incomePerMinuteForPlayer(playerId: string): number {
    const player = this.players.get(playerId);
    const incomeMult = player?.mods?.income ?? 1;
    return Math.round(this.summaryForPlayer(playerId).goldIncomePerMinute * incomeMult * 100) / 100;
  }

  private activeDevelopmentProcessCountForPlayer(playerId: string): number {
    return this.summaryForPlayer(playerId).activeDevelopmentProcessCount;
  }

  private pendingSettlementsForPlayer(playerId: string): Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> {
    return this.pendingSettlementsSnapshotForPlayer(playerId);
  }

  private emitPlayerStateUpdate(command: Pick<CommandEnvelope, "commandId" | "playerId">, playerId = command.playerId): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.applyManpowerRegen(player);
    const summary = this.summaryForPlayer(playerId);
    const economy = buildPlayerUpdateEconomySnapshot(player, summary, this.tiles);
    const metrics = buildPlayerDefensibilityMetrics(playerId, this.tiles);
    player.strategicProductionPerMinute = economy.strategicProductionPerMinute;
    this.emitPlayerMessage(
      { commandId: command.commandId, playerId },
      {
        type: "PLAYER_UPDATE",
        gold: player.points,
        manpower: player.manpower,
        manpowerCap: this.playerManpowerCap(player),
        incomePerMinute: economy.incomePerMinute,
        strategicResources: {
          FOOD: player.strategicResources?.FOOD ?? 0,
          IRON: player.strategicResources?.IRON ?? 0,
          CRYSTAL: player.strategicResources?.CRYSTAL ?? 0,
          SUPPLY: player.strategicResources?.SUPPLY ?? 0,
          SHARD: player.strategicResources?.SHARD ?? 0,
          OIL: player.strategicResources?.OIL ?? 0
        },
        strategicProductionPerMinute: economy.strategicProductionPerMinute,
        economyBreakdown: economy.economyBreakdown,
        upkeepPerMinute: economy.upkeepPerMinute,
        upkeepLastTick: economy.upkeepLastTick,
        T: metrics.T,
        E: metrics.E,
        Ts: metrics.Ts,
        Es: metrics.Es,
        pendingSettlements: this.pendingSettlementsForPlayer(playerId),
        developmentProcessLimit: DEVELOPMENT_PROCESS_LIMIT,
        activeDevelopmentProcessCount: this.activeDevelopmentProcessCountForPlayer(playerId)
      }
    );
  }

  private rejectIfNoDevelopmentSlot(command: CommandEnvelope, code: string, message: string): boolean {
    if (this.activeDevelopmentProcessCountForPlayer(command.playerId) < DEVELOPMENT_PROCESS_LIMIT) return false;
    this.emitEvent({
      eventType: "COMMAND_REJECTED",
      commandId: command.commandId,
      playerId: command.playerId,
      code,
      message
    });
    return true;
  }

  private enqueueJob(lane: QueueLane, run: () => void): void {
    this.jobsByLane[lane].push({ lane, run });
    this.scheduleDrain();
  }

  private scheduleDrain(): void {
    if (this.drainScheduled || this.draining) return;
    this.drainScheduled = true;
    this.scheduleSoon(() => {
      this.drainScheduled = false;
      this.drainQueues();
    });
  }

  private drainQueues(): void {
    if (this.draining) return;
    this.draining = true;
    let shouldYieldForBackground = false;
    try {
      let next = this.shiftNextJob();
      let backgroundJobsProcessed = 0;
      while (next) {
        if ((next.lane === "system" || next.lane === "ai") && backgroundJobsProcessed >= this.backgroundBatchSize) {
          this.jobsByLane[next.lane].unshift(next);
          shouldYieldForBackground = true;
          break;
        }
        next.run();
        if (next.lane === "system" || next.lane === "ai") {
          backgroundJobsProcessed += 1;
        }
        next = this.shiftNextJob();
      }
    } finally {
      this.draining = false;
      if (this.hasQueuedJobs()) {
        if (shouldYieldForBackground) {
          this.scheduleAfter(0, () => this.drainQueues());
        } else {
          this.scheduleDrain();
        }
      }
    }
  }

  private shiftNextJob(): SimulationJob | undefined {
    for (const lane of priorityOrder) {
      const next = this.jobsByLane[lane].shift();
      if (next) return next;
    }
    return undefined;
  }

  private hasQueuedJobs(): boolean {
    return priorityOrder.some((lane) => this.jobsByLane[lane].length > 0);
  }

  private handleFrontierCommand(command: CommandEnvelope, actionType: FrontierCommandType): void {
    const actor = this.players.get(command.playerId);
    const payload = parseFrontierPayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    this.applyManpowerRegen(actor);

    const from = this.tiles.get(simulationTileKey(payload.fromX, payload.fromY));
    const to = this.tiles.get(simulationTileKey(payload.toX, payload.toY));
    if (!from || !to) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNKNOWN_TILE",
        message: "origin or target tile not found"
      });
      return;
    }

    const originLock = this.locksByTile.get(simulationTileKey(from.x, from.y));
    const targetLock = this.locksByTile.get(simulationTileKey(to.x, to.y));
    const validation = validateFrontierCommand({
      now: this.now(),
      actor,
      actionType,
      from,
      to,
      originLockedUntil: originLock?.resolvesAt,
      targetLockedUntil: targetLock?.resolvesAt,
      actionGoldCost: FRONTIER_CLAIM_COST,
      breakthroughGoldCost: BREAKTHROUGH_GOLD_COST,
      breakthroughRequiredTechId: BREAKTHROUGH_REQUIRED_TECH_ID,
      isAdjacent: isFrontierAdjacent(from.x, from.y, to.x, to.y),
      isDockCrossing: false,
      isBridgeCrossing: false,
      targetShielded: this.crossingBlockedByAetherWall(from.x, from.y, to.x, to.y),
      defenderIsAlliedOrTruced: Boolean(to.ownerId && actor.allies.has(to.ownerId))
    });

    if (!validation.ok) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: validation.code,
        message: validation.message
      });
      return;
    }

    if (actionType === "BREAKTHROUGH_ATTACK" && (actor.strategicResources?.IRON ?? 0) < BREAKTHROUGH_IRON_COST) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "INSUFFICIENT_RESOURCE",
        message: "insufficient IRON for breakthrough"
      });
      return;
    }

    if (actionType === "BREAKTHROUGH_ATTACK") {
      actor.points = Math.max(0, actor.points - BREAKTHROUGH_GOLD_COST);
      this.spendStrategicResource(actor, "IRON", BREAKTHROUGH_IRON_COST);
      this.emitPlayerStateUpdate(command);
    }

    const lock: LockRecord = {
      commandId: command.commandId,
      playerId: command.playerId,
      actionType,
      originX: validation.origin.x,
      originY: validation.origin.y,
      targetX: validation.target.x,
      targetY: validation.target.y,
      originKey: simulationTileKey(validation.origin.x, validation.origin.y),
      targetKey: simulationTileKey(validation.target.x, validation.target.y),
      resolvesAt: validation.resolvesAt
    };
    this.locksByTile.set(lock.originKey, lock);
    this.locksByTile.set(lock.targetKey, lock);
    this.emitEvent({
      eventType: "COMMAND_ACCEPTED",
      commandId: command.commandId,
      playerId: command.playerId,
      actionType,
      originX: validation.origin.x,
      originY: validation.origin.y,
      targetX: validation.target.x,
      targetY: validation.target.y,
      resolvesAt: validation.resolvesAt
    });
    this.scheduleLockResolution(lock);
  }

  private handleSettleCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseSettlePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    this.applyManpowerRegen(actor);

    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNKNOWN_TILE",
        message: "tile not found"
      });
      return;
    }
    if (target.ownerId !== command.playerId || target.ownershipState !== "FRONTIER") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SETTLE_INVALID",
        message: "tile is not one of your frontier tiles"
      });
      return;
    }
    if (target.terrain !== "LAND") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SETTLE_INVALID",
        message: "tile is not valid land"
      });
      return;
    }

    if (this.pendingSettlementsByTile.has(targetKey)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SETTLE_INVALID",
        message: "tile is already settling"
      });
      return;
    }
    if (this.rejectIfNoDevelopmentSlot(command, "SETTLE_INVALID", "development slots are busy")) return;
    if (actor.points < SETTLE_COST) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "INSUFFICIENT_GOLD",
        message: "insufficient gold to settle"
      });
      return;
    }

    actor.points -= SETTLE_COST;
    const startedAt = this.now();
    const resolvesAt = startedAt + SETTLE_DURATION_MS;
    this.addPendingSettlement({
      ownerId: command.playerId,
      tileKey: targetKey,
      startedAt,
      resolvesAt,
      goldCost: SETTLE_COST
    });
    this.emitPlayerStateUpdate(command);

    this.scheduleAfter(SETTLE_DURATION_MS, () => {
      this.removePendingSettlement(targetKey);
      const latest = this.tiles.get(targetKey);
      if (!latest || latest.ownerId !== command.playerId) {
        this.emitPlayerStateUpdate(command);
        return;
      }
      const settledTile: DomainTileState = {
        ...latest,
        ownerId: command.playerId,
        ownershipState: "SETTLED",
        ...(latest.town ? { town: latest.town } : {})
      };
      this.tileYieldCollectedAtByTile.set(targetKey, this.now());
      this.replaceTileState(targetKey, settledTile);
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: command.commandId,
        playerId: command.playerId,
        tileDeltas: [
          {
            x: settledTile.x,
            y: settledTile.y,
            ...(settledTile.terrain ? { terrain: settledTile.terrain } : {}),
            ...(settledTile.resource ? { resource: settledTile.resource } : {}),
            ...(settledTile.ownerId ? { ownerId: settledTile.ownerId } : {}),
            ...(settledTile.ownershipState ? { ownershipState: settledTile.ownershipState } : {}),
            ...(settledTile.town?.type ? { townType: settledTile.town.type } : {}),
            ...(settledTile.town?.name ? { townName: settledTile.town.name } : {}),
            ...(settledTile.town?.populationTier ? { townPopulationTier: settledTile.town.populationTier } : {})
          }
        ]
      });
      this.emitPlayerStateUpdate(command);
    });
  }

  private handleCollectVisibleCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    if (!actor) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "unknown player"
      });
      return;
    }
    this.applyManpowerRegen(actor);

    const now = this.now();
    const cooldownUntil = this.collectVisibleCooldownByPlayer.get(command.playerId) ?? 0;
    if (cooldownUntil > now) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "COLLECT_COOLDOWN",
        message: "collect visible is on cooldown"
      });
      return;
    }

    let tiles = 0;
    let gold = 0;
    const strategic: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> = {};
    const touchedTileDeltas: Array<ReturnType<SimulationRuntime["tileDeltaFromState"]>> = [];
    for (const tile of this.tiles.values()) {
      if (tile.ownerId !== command.playerId || tile.ownershipState !== "SETTLED") continue;
      const collected = this.collectTileYield(tile, now);
      const touched = collected.gold > 0 || Object.values(collected.strategic).some((value) => Number(value) > 0);
      if (!touched) continue;
      tiles += 1;
      gold += collected.gold;
      touchedTileDeltas.push(this.tileDeltaFromState(tile));
      for (const [resource, amount] of Object.entries(collected.strategic) as Array<
        ["FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number]
      >) {
        strategic[resource] = (strategic[resource] ?? 0) + amount;
      }
    }
    actor.points += gold;
    this.collectVisibleCooldownByPlayer.set(command.playerId, now + COLLECT_VISIBLE_COOLDOWN_MS);
    if (touchedTileDeltas.length > 0) {
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: command.commandId,
        playerId: command.playerId,
        tileDeltas: touchedTileDeltas
      });
    }
    this.emitEvent({
      eventType: "COLLECT_RESULT",
      commandId: command.commandId,
      playerId: command.playerId,
      mode: "visible",
      tiles,
      gold,
      strategic
    });
    this.emitPlayerStateUpdate(command);
  }

  private handleCollectTileCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    this.applyManpowerRegen(actor);
    const target = this.tiles.get(simulationTileKey(payload.x, payload.y));
    if (!target || target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "COLLECT_EMPTY",
        message: "tile is not a settled owned tile"
      });
      return;
    }

    const collected = this.collectTileYield(target, this.now());
    const gold = collected.gold;
    const strategic = collected.strategic;
    const touched = gold > 0 || Object.values(strategic).some((value) => Number(value) > 0);
    if (!touched) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "COLLECT_EMPTY",
        message: "yield is empty"
      });
      return;
    }
    actor.points += gold;
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(target)]
    });
    this.emitEvent({
      eventType: "COLLECT_RESULT",
      commandId: command.commandId,
      playerId: command.playerId,
      mode: "tile",
      x: payload.x,
      y: payload.y,
      tiles: 1,
      gold,
      strategic
    });
    this.emitPlayerStateUpdate(command);
  }

  private handleUncaptureTileCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }

    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNKNOWN_TILE",
        message: "tile not found"
      });
      return;
    }
    if (target.ownerId !== command.playerId) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNCAPTURE_NOT_OWNER",
        message: "tile is not owned by you"
      });
      return;
    }
    if (this.ownedTileCountForPlayer(command.playerId) <= 1) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNCAPTURE_LAST_TILE",
        message: "cannot uncapture your last tile"
      });
      return;
    }
    if (target.town?.populationTier === "SETTLEMENT") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNCAPTURE_SETTLEMENT",
        message: "cannot abandon your settlement"
      });
      return;
    }
    if (this.locksByTile.has(targetKey)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "LOCKED",
        message: "tile locked in combat"
      });
      return;
    }

    const updatedTile: DomainTileState = {
      ...target,
      ownerId: undefined,
      ownershipState: undefined,
      fort: undefined,
      observatory: undefined,
      siegeOutpost: undefined,
      economicStructure: undefined
    };
    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
    this.emitPlayerStateUpdate(command);
  }

  private handleOverloadSynthesizerCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }

    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    const structure = target?.economicStructure;
    if (!target || !structure || structure.ownerId !== command.playerId) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SYNTH_OVERLOAD_INVALID",
        message: "no owned synthesizer on tile"
      });
      return;
    }
    if (!actor.techIds.has("overload-protocols")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SYNTH_OVERLOAD_INVALID",
        message: "unlock synthesizer overload via Overload Protocols first"
      });
      return;
    }
    if (
      structure.type !== "FUR_SYNTHESIZER" &&
      structure.type !== "ADVANCED_FUR_SYNTHESIZER" &&
      structure.type !== "IRONWORKS" &&
      structure.type !== "ADVANCED_IRONWORKS" &&
      structure.type !== "CRYSTAL_SYNTHESIZER" &&
      structure.type !== "ADVANCED_CRYSTAL_SYNTHESIZER"
    ) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SYNTH_OVERLOAD_INVALID",
        message: "only synthesizer structures can overload"
      });
      return;
    }
    if (structure.status === "under_construction" || structure.status === "removing") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SYNTH_OVERLOAD_INVALID",
        message: "synthesizer is not ready"
      });
      return;
    }
    if (structure.disabledUntil && structure.disabledUntil > this.now()) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SYNTH_OVERLOAD_INVALID",
        message: "synthesizer is recovering from overload"
      });
      return;
    }
    if (actor.points < SYNTH_OVERLOAD_GOLD_COST) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SYNTH_OVERLOAD_INVALID",
        message: "insufficient gold for synthesizer overload"
      });
      return;
    }

    actor.points -= SYNTH_OVERLOAD_GOLD_COST;
    if (structure.type === "FUR_SYNTHESIZER" || structure.type === "ADVANCED_FUR_SYNTHESIZER") {
      this.addStrategicResource(actor, "SUPPLY", FUR_SYNTHESIZER_OVERLOAD_SUPPLY);
    } else if (structure.type === "IRONWORKS" || structure.type === "ADVANCED_IRONWORKS") {
      this.addStrategicResource(actor, "IRON", IRONWORKS_OVERLOAD_IRON);
    } else {
      this.addStrategicResource(actor, "CRYSTAL", CRYSTAL_SYNTHESIZER_OVERLOAD_CRYSTAL);
    }

    const reenabledAt = this.now() + SYNTH_OVERLOAD_DISABLE_MS;
    const updatedTile: DomainTileState = {
      ...target,
      economicStructure: {
        ...structure,
        status: "inactive",
        disabledUntil: reenabledAt,
        nextUpkeepAt: reenabledAt,
        inactiveReason: undefined
      }
    };
    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
    this.emitPlayerStateUpdate(command);
  }

  private handleSetConverterStructureEnabledCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseConverterTogglePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }

    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    const structure = target?.economicStructure;
    if (!target || !structure || structure.ownerId !== command.playerId) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CONVERTER_TOGGLE_INVALID",
        message: "no owned converter on tile"
      });
      return;
    }
    if (!isConverterStructureType(structure.type)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CONVERTER_TOGGLE_INVALID",
        message: "only converter structures can be toggled"
      });
      return;
    }
    if (structure.status === "under_construction" || structure.status === "removing") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CONVERTER_TOGGLE_INVALID",
        message: "converter is not ready"
      });
      return;
    }
    if (structure.disabledUntil && structure.disabledUntil > this.now()) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CONVERTER_TOGGLE_INVALID",
        message: "converter is recovering from overload"
      });
      return;
    }

    if (payload.enabled) {
      if (target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "CONVERTER_TOGGLE_INVALID",
          message: "converter requires settled owned tile"
        });
        return;
      }
      const upkeep = economicStructureGoldUpkeepPerInterval(structure.type);
      if (actor.points < upkeep) {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "CONVERTER_TOGGLE_INVALID",
          message: "insufficient gold for converter upkeep"
        });
        return;
      }
      actor.points -= upkeep;
    }

    const updatedTile: DomainTileState = {
      ...target,
      economicStructure: {
        ...structure,
        status: payload.enabled ? "active" : "inactive",
        inactiveReason: payload.enabled ? undefined : "manual",
        nextUpkeepAt: this.now() + ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS
      }
    };
    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
  }

  private handleRevealEmpireCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseRevealPayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    if (!actor.techIds.has("cryptography") && this.revealTargetsForPlayer(actor.id).size === 0) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REVEAL_EMPIRE_INVALID",
        message: "unlock reveal capability via tech/domain first"
      });
      return;
    }
    if (payload.targetPlayerId === actor.id) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REVEAL_EMPIRE_INVALID",
        message: "cannot reveal yourself"
      });
      return;
    }
    if (!this.players.has(payload.targetPlayerId) || actor.allies.has(payload.targetPlayerId)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REVEAL_EMPIRE_INVALID",
        message: "target empire not found or not hostile"
      });
      return;
    }
    const reveals = this.revealTargetsForPlayer(actor.id);
    if (reveals.has(payload.targetPlayerId)) {
      reveals.delete(payload.targetPlayerId);
    } else {
      if (this.revealCapacityForPlayer(actor) < 1 || reveals.size >= 1) {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "REVEAL_EMPIRE_INVALID",
          message: "only one revealed empire allowed"
        });
        return;
      }
      if (!this.spendStrategicResource(actor, "CRYSTAL", REVEAL_EMPIRE_ACTIVATION_COST)) {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "REVEAL_EMPIRE_INVALID",
          message: "insufficient crystal to activate reveal"
        });
        return;
      }
      reveals.clear();
      reveals.add(payload.targetPlayerId);
    }
    this.emitPlayerMessage(command, {
      type: "REVEAL_EMPIRE_UPDATE",
      activeTargets: [...reveals].sort(),
      revealCapacity: this.revealCapacityForPlayer(actor)
    });
  }

  private handleRevealEmpireStatsCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseRevealPayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const target = this.players.get(payload.targetPlayerId);
    if (!actor.techIds.has("surveying")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REVEAL_EMPIRE_STATS_INVALID",
        message: "requires Surveying"
      });
      return;
    }
    if (!target || payload.targetPlayerId === actor.id || actor.allies.has(payload.targetPlayerId)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REVEAL_EMPIRE_STATS_INVALID",
        message: "target empire not found or not hostile"
      });
      return;
    }
    if (this.abilityOnCooldown(actor.id, "reveal_empire_stats")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REVEAL_EMPIRE_STATS_INVALID",
        message: "reveal empire stats is cooling down"
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "CRYSTAL", REVEAL_EMPIRE_STATS_CRYSTAL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REVEAL_EMPIRE_STATS_INVALID",
        message: "insufficient CRYSTAL for empire stats reveal"
      });
      return;
    }
    this.startAbilityCooldown(actor.id, "reveal_empire_stats", REVEAL_EMPIRE_STATS_COOLDOWN_MS);
    this.emitPlayerMessage(command, {
      type: "REVEAL_EMPIRE_STATS_RESULT",
      stats: this.buildRevealEmpireStats(target)
    });
  }

  private handleCastAetherBridgeCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const target = this.tiles.get(simulationTileKey(payload.x, payload.y));
    if (!actor.techIds.has("navigation")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AETHER_BRIDGE_INVALID",
        message: "requires Aether Bridge"
      });
      return;
    }
    if (this.abilityOnCooldown(actor.id, "aether_bridge")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AETHER_BRIDGE_INVALID",
        message: "aether bridge is cooling down"
      });
      return;
    }
    if (!target || !this.isCoastalLand(target.x, target.y)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AETHER_BRIDGE_INVALID",
        message: "target must be coastal land"
      });
      return;
    }
    const origin = this.closestAetherBridgeOrigin(actor.id, target.x, target.y);
    if (!origin) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AETHER_BRIDGE_INVALID",
        message: "no settled coastal tile can reach this target"
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "CRYSTAL", AETHER_BRIDGE_CRYSTAL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AETHER_BRIDGE_INVALID",
        message: "insufficient CRYSTAL for aether bridge"
      });
      return;
    }
    this.startAbilityCooldown(actor.id, "aether_bridge", AETHER_BRIDGE_COOLDOWN_MS);
    const active = this.activeAetherBridgesForPlayer(actor.id);
    active.push({
      bridgeId: `${command.commandId}:bridge`,
      ownerId: actor.id,
      from: origin,
      to: { x: target.x, y: target.y },
      startedAt: this.now(),
      endsAt: this.now() + AETHER_BRIDGE_DURATION_MS
    });
    this.activeAetherBridgesByPlayer.set(actor.id, active);
    this.emitPlayerMessage(command, {
      type: "AETHER_BRIDGE_UPDATE",
      bridges: active
    });
  }

  private handleCastAetherWallCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseAetherWallPayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    if (!actor.techIds.has("harborcraft")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AETHER_WALL_INVALID",
        message: "requires Aether Moorings"
      });
      return;
    }
    if (this.abilityOnCooldown(actor.id, "aether_wall")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AETHER_WALL_INVALID",
        message: "aether wall is cooling down"
      });
      return;
    }
    const segments = this.wallSegments(payload.x, payload.y, payload.direction, payload.length);
    for (const segment of segments) {
      const base = this.tiles.get(simulationTileKey(segment.baseX, segment.baseY));
      const outward = this.tiles.get(simulationTileKey(segment.toX, segment.toY));
      if (!base || base.terrain !== "LAND" || base.ownerId !== actor.id || base.ownershipState !== "SETTLED") {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "AETHER_WALL_INVALID",
          message: "wall must anchor on your settled land"
        });
        return;
      }
      if (!outward || outward.terrain !== "LAND" || outward.ownerId === actor.id) {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "AETHER_WALL_INVALID",
          message: "wall must face passable land"
        });
        return;
      }
      if (this.crossingBlockedByAetherWall(segment.fromX, segment.fromY, segment.toX, segment.toY)) {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "AETHER_WALL_INVALID",
          message: "that border already has an aether wall"
        });
        return;
      }
    }
    if (!this.spendStrategicResource(actor, "CRYSTAL", AETHER_WALL_CRYSTAL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AETHER_WALL_INVALID",
        message: "insufficient CRYSTAL for aether wall"
      });
      return;
    }
    this.startAbilityCooldown(actor.id, "aether_wall", AETHER_WALL_COOLDOWN_MS);
    const active = this.activeAetherWallsForPlayer(actor.id);
    active.push({
      wallId: `${command.commandId}:wall`,
      ownerId: actor.id,
      origin: { x: payload.x, y: payload.y },
      direction: payload.direction,
      length: payload.length,
      startedAt: this.now(),
      endsAt: this.now() + AETHER_WALL_DURATION_MS
    });
    this.activeAetherWallsByPlayer.set(actor.id, active);
    this.emitPlayerMessage(command, {
      type: "AETHER_WALL_UPDATE",
      walls: active
    });
  }

  private handleSiphonTileCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!actor.techIds.has("logistics")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SIPHON_INVALID",
        message: "requires Logistics"
      });
      return;
    }
    if (this.abilityOnCooldown(actor.id, "siphon")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SIPHON_INVALID",
        message: "siphon is cooling down"
      });
      return;
    }
    if (!target || target.terrain !== "LAND" || !target.ownerId || target.ownerId === actor.id || actor.allies.has(target.ownerId)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SIPHON_INVALID",
        message: "target enemy-controlled town or resource tile"
      });
      return;
    }
    if (!target.town && !target.resource) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SIPHON_INVALID",
        message: "target must be a town or resource tile"
      });
      return;
    }
    if (!this.ownedActiveObservatoryWithinRange(actor.id, target.x, target.y)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SIPHON_INVALID",
        message: "target must be within 30 tiles of your observatory"
      });
      return;
    }
    if (target.sabotage) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SIPHON_INVALID",
        message: "tile already siphoned"
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "CRYSTAL", SIPHON_CRYSTAL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SIPHON_INVALID",
        message: "insufficient CRYSTAL for siphon"
      });
      return;
    }
    this.startAbilityCooldown(actor.id, "siphon", SIPHON_COOLDOWN_MS);
    const updatedTile: DomainTileState = {
      ...target,
      sabotage: {
        ownerId: actor.id,
        endsAt: this.now() + SIPHON_DURATION_MS,
        outputMultiplier: 1 - SIPHON_SHARE
      }
    };
    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
  }

  private handlePurgeSiphonCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target || target.ownerId !== actor.id || !target.sabotage) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "PURGE_SIPHON_INVALID",
        message: "tile is not siphoned"
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "CRYSTAL", SIPHON_PURGE_CRYSTAL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "PURGE_SIPHON_INVALID",
        message: "insufficient CRYSTAL to purge siphon"
      });
      return;
    }
    const updatedTile: DomainTileState = { ...target, sabotage: undefined };
    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
  }

  private handleCreateMountainCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!actor.techIds.has("terrain-engineering")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CREATE_MOUNTAIN_INVALID",
        message: "requires Terrain Engineering"
      });
      return;
    }
    if (this.abilityOnCooldown(actor.id, "create_mountain")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CREATE_MOUNTAIN_INVALID",
        message: "create mountain is cooling down"
      });
      return;
    }
    if (
      !target ||
      target.terrain !== "LAND" ||
      target.town ||
      target.dockId ||
      target.fort ||
      target.observatory ||
      target.siegeOutpost ||
      target.economicStructure
    ) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CREATE_MOUNTAIN_INVALID",
        message: "cannot create mountain on this tile"
      });
      return;
    }
    if (!this.ownedLandWithinRange(actor.id, target.x, target.y, 2)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CREATE_MOUNTAIN_INVALID",
        message: "target must be within 2 tiles of your land"
      });
      return;
    }
    if (actor.points < TERRAIN_SHAPING_GOLD_COST || !this.spendStrategicResource(actor, "CRYSTAL", TERRAIN_SHAPING_CRYSTAL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CREATE_MOUNTAIN_INVALID",
        message: "insufficient resources for create mountain"
      });
      return;
    }
    actor.points -= TERRAIN_SHAPING_GOLD_COST;
    this.startAbilityCooldown(actor.id, "create_mountain", TERRAIN_SHAPING_COOLDOWN_MS);
    const updatedTile: DomainTileState = {
      ...target,
      terrain: "MOUNTAIN",
      ownerId: undefined,
      ownershipState: undefined,
      sabotage: undefined,
      fort: undefined,
      observatory: undefined,
      siegeOutpost: undefined,
      economicStructure: undefined
    };
    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
  }

  private handleRemoveMountainCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!actor.techIds.has("terrain-engineering")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REMOVE_MOUNTAIN_INVALID",
        message: "requires Terrain Engineering"
      });
      return;
    }
    if (this.abilityOnCooldown(actor.id, "remove_mountain")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REMOVE_MOUNTAIN_INVALID",
        message: "remove mountain is cooling down"
      });
      return;
    }
    if (!target || target.terrain !== "MOUNTAIN") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REMOVE_MOUNTAIN_INVALID",
        message: "target must be mountain"
      });
      return;
    }
    if (!this.ownedLandWithinRange(actor.id, target.x, target.y, 2)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REMOVE_MOUNTAIN_INVALID",
        message: "target must be within 2 tiles of your land"
      });
      return;
    }
    if (actor.points < TERRAIN_SHAPING_GOLD_COST || !this.spendStrategicResource(actor, "CRYSTAL", TERRAIN_SHAPING_CRYSTAL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REMOVE_MOUNTAIN_INVALID",
        message: "insufficient resources for remove mountain"
      });
      return;
    }
    actor.points -= TERRAIN_SHAPING_GOLD_COST;
    this.startAbilityCooldown(actor.id, "remove_mountain", TERRAIN_SHAPING_COOLDOWN_MS);
    const updatedTile: DomainTileState = { ...target, terrain: "LAND" };
    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
  }

  private handleAirportBombardCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseAirportBombardPayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const airport = this.tiles.get(simulationTileKey(payload.fromX, payload.fromY));
    if (
      !airport ||
      airport.ownerId !== actor.id ||
      airport.economicStructure?.ownerId !== actor.id ||
      airport.economicStructure.type !== "AIRPORT" ||
      airport.economicStructure.status !== "active"
    ) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AIRPORT_BOMBARD_INVALID",
        message: "select an active airport first"
      });
      return;
    }
    if (Math.max(Math.abs(payload.toX - payload.fromX), Math.abs(payload.toY - payload.fromY)) > AIRPORT_BOMBARD_RANGE) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AIRPORT_BOMBARD_INVALID",
        message: "target must be within 30 tiles of the airport"
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "OIL", AIRPORT_BOMBARD_OIL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AIRPORT_BOMBARD_INVALID",
        message: "insufficient OIL for bombardment"
      });
      return;
    }
    const changedTiles: Array<ReturnType<SimulationRuntime["tileDeltaFromState"]>> = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const tileKey = simulationTileKey(payload.toX + dx, payload.toY + dy);
        const tile = this.tiles.get(tileKey);
        if (!tile || tile.terrain !== "LAND" || !tile.ownerId || tile.ownerId === actor.id || actor.allies.has(tile.ownerId)) continue;
        const updatedTile: DomainTileState = {
          ...tile,
          ownerId: undefined,
          ownershipState: undefined,
          town: undefined,
          fort: undefined,
          observatory: undefined,
          siegeOutpost: undefined,
          economicStructure: undefined,
          sabotage: undefined
        };
        this.replaceTileState(tileKey, updatedTile);
        changedTiles.push(this.tileDeltaFromState(updatedTile));
      }
    }
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: changedTiles
    });
  }

  private handleCollectShardCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    const amount = target?.shardSite?.amount ?? 0;
    if (!target || !target.shardSite || amount <= 0) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "COLLECT_EMPTY",
        message: "no shard present"
      });
      return;
    }
    this.addStrategicResource(actor, "SHARD", amount);
    const updatedTile: DomainTileState = { ...target, shardSite: undefined };
    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
    this.emitEvent({
      eventType: "COLLECT_RESULT",
      commandId: command.commandId,
      playerId: command.playerId,
      mode: "tile",
      x: payload.x,
      y: payload.y,
      tiles: 1,
      gold: 0,
      strategic: { SHARD: amount }
    });
  }

  private handleChooseTechCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    if (!actor) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "unknown player"
      });
      return;
    }
    let techId = "";
    try {
      const parsed = JSON.parse(command.payloadJson) as { techId?: unknown };
      if (typeof parsed.techId === "string") techId = parsed.techId;
    } catch {
      techId = "";
    }
    if (!techId) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "TECH_INVALID",
        message: "missing tech id"
      });
      return;
    }
    const outcome = chooseTechForPlayer(actor, techId, this.tiles.values());
    if (!outcome.ok) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "TECH_INVALID",
        message: outcome.reason
      });
      return;
    }
    this.emitEvent({
      eventType: "TECH_UPDATE",
      commandId: command.commandId,
      playerId: command.playerId,
      payloadJson: JSON.stringify(buildTechUpdatePayload(actor, this.tiles.values()))
    });
  }

  private handleChooseDomainCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    if (!actor) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "unknown player"
      });
      return;
    }
    let domainId = "";
    try {
      const parsed = JSON.parse(command.payloadJson) as { domainId?: unknown };
      if (typeof parsed.domainId === "string") domainId = parsed.domainId;
    } catch {
      domainId = "";
    }
    if (!domainId) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "DOMAIN_INVALID",
        message: "missing domain id"
      });
      return;
    }
    const outcome = chooseDomainForPlayer(actor, domainId, this.tiles.values());
    if (!outcome.ok) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "DOMAIN_INVALID",
        message: outcome.reason
      });
      return;
    }
    this.emitEvent({
      eventType: "DOMAIN_UPDATE",
      commandId: command.commandId,
      playerId: command.playerId,
      payloadJson: JSON.stringify(buildDomainUpdatePayload(actor, this.tiles.values()))
    });
  }

  private emitPlayerMessage(command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: Record<string, unknown>): void {
    const messageType = typeof payload.type === "string" ? payload.type : "UNKNOWN";
    this.emitEvent({
      eventType: "PLAYER_MESSAGE",
      commandId: command.commandId,
      playerId: command.playerId,
      messageType,
      payloadJson: JSON.stringify(payload)
    });
  }

  private revealTargetsForPlayer(playerId: string): Set<string> {
    let targets = this.revealTargetsByPlayer.get(playerId);
    if (!targets) {
      targets = new Set<string>();
      this.revealTargetsByPlayer.set(playerId, targets);
    }
    return targets;
  }

  private revealCapacityForPlayer(player: DomainPlayer): number {
    return player.techIds.has("cryptography") || this.revealTargetsForPlayer(player.id).size > 0 ? 1 : 0;
  }

  private abilityCooldownUntil(playerId: string, abilityId: CrystalAbilityId): number {
    return this.abilityCooldownsByPlayer.get(playerId)?.[abilityId] ?? 0;
  }

  private abilityOnCooldown(playerId: string, abilityId: CrystalAbilityId): boolean {
    return this.abilityCooldownUntil(playerId, abilityId) > this.now();
  }

  private startAbilityCooldown(playerId: string, abilityId: CrystalAbilityId, durationMs: number): void {
    const existing = this.abilityCooldownsByPlayer.get(playerId) ?? {};
    this.abilityCooldownsByPlayer.set(playerId, {
      ...existing,
      [abilityId]: this.now() + durationMs
    });
  }

  private ownedLandWithinRange(playerId: string, x: number, y: number, range: number): boolean {
    for (let dy = -range; dy <= range; dy += 1) {
      for (let dx = -range; dx <= range; dx += 1) {
        const tile = this.tiles.get(simulationTileKey(x + dx, y + dy));
        if (tile?.ownerId === playerId && tile.terrain === "LAND") return true;
      }
    }
    return false;
  }

  private ownedActiveObservatoryWithinRange(playerId: string, x: number, y: number, range = 30): boolean {
    for (const tile of this.tiles.values()) {
      if (
        tile.ownerId === playerId &&
        tile.observatory?.ownerId === playerId &&
        tile.observatory.status === "active" &&
        Math.max(Math.abs(tile.x - x), Math.abs(tile.y - y)) <= range
      ) {
        return true;
      }
    }
    return false;
  }

  private isCoastalLand(x: number, y: number): boolean {
    const tile = this.tiles.get(simulationTileKey(x, y));
    if (!tile || tile.terrain !== "LAND") return false;
    return [
      this.tiles.get(simulationTileKey(x, y - 1)),
      this.tiles.get(simulationTileKey(x + 1, y)),
      this.tiles.get(simulationTileKey(x, y + 1)),
      this.tiles.get(simulationTileKey(x - 1, y))
    ].some((neighbor) => neighbor?.terrain === "SEA");
  }

  private seaTileCountBetween(ax: number, ay: number, bx: number, by: number): number | undefined {
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    if (steps <= 1) return 0;
    let seaTiles = 0;
    for (let index = 1; index < steps; index += 1) {
      const x = Math.round(ax + ((bx - ax) * index) / steps);
      const y = Math.round(ay + ((by - ay) * index) / steps);
      const tile = this.tiles.get(simulationTileKey(x, y));
      if (!tile || tile.terrain !== "SEA") return undefined;
      seaTiles += 1;
    }
    return seaTiles;
  }

  private closestAetherBridgeOrigin(playerId: string, targetX: number, targetY: number): { x: number; y: number } | undefined {
    let best: { x: number; y: number; seaTiles: number; distance: number } | undefined;
    for (const tile of this.tiles.values()) {
      if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED" || !this.isCoastalLand(tile.x, tile.y)) continue;
      const seaTiles = this.seaTileCountBetween(tile.x, tile.y, targetX, targetY);
      if (seaTiles === undefined || seaTiles > AETHER_BRIDGE_MAX_SEA_TILES) continue;
      const distance = Math.max(Math.abs(tile.x - targetX), Math.abs(tile.y - targetY));
      if (!best || seaTiles < best.seaTiles || (seaTiles === best.seaTiles && distance < best.distance)) {
        best = { x: tile.x, y: tile.y, seaTiles, distance };
      }
    }
    return best ? { x: best.x, y: best.y } : undefined;
  }

  private wallSegments(originX: number, originY: number, direction: AetherWallDirection, length: 1 | 2 | 3): Array<{
    baseX: number;
    baseY: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  }> {
    const segments: Array<{ baseX: number; baseY: number; fromX: number; fromY: number; toX: number; toY: number }> = [];
    for (let index = 0; index < length; index += 1) {
      const baseX = direction === "N" || direction === "S" ? originX + index : originX;
      const baseY = direction === "E" || direction === "W" ? originY + index : originY;
      const toX = direction === "E" ? baseX + 1 : direction === "W" ? baseX - 1 : baseX;
      const toY = direction === "S" ? baseY + 1 : direction === "N" ? baseY - 1 : baseY;
      segments.push({ baseX, baseY, fromX: baseX, fromY: baseY, toX, toY });
    }
    return segments;
  }

  private activeAetherBridgesForPlayer(playerId: string): ActiveAetherBridgeView[] {
    const active = (this.activeAetherBridgesByPlayer.get(playerId) ?? []).filter((bridge) => bridge.endsAt > this.now());
    this.activeAetherBridgesByPlayer.set(playerId, active);
    return active;
  }

  private activeAetherWallsForPlayer(playerId: string): ActiveAetherWallView[] {
    const active = (this.activeAetherWallsByPlayer.get(playerId) ?? []).filter((wall) => wall.endsAt > this.now());
    this.activeAetherWallsByPlayer.set(playerId, active);
    return active;
  }

  private crossingBlockedByAetherWall(fromX: number, fromY: number, toX: number, toY: number): boolean {
    for (const walls of this.activeAetherWallsByPlayer.values()) {
      for (const wall of walls) {
        if (wall.endsAt <= this.now()) continue;
        for (const segment of this.wallSegments(wall.origin.x, wall.origin.y, wall.direction, wall.length)) {
          if (
            (segment.fromX === fromX && segment.fromY === fromY && segment.toX === toX && segment.toY === toY) ||
            (segment.fromX === toX && segment.fromY === toY && segment.toX === fromX && segment.toY === fromY)
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private buildRevealEmpireStats(target: DomainPlayer): Record<string, unknown> {
    let settledTiles = 0;
    let frontierTiles = 0;
    let controlledTowns = 0;
    for (const tile of this.tiles.values()) {
      if (tile.ownerId !== target.id) continue;
      if (tile.ownershipState === "SETTLED") settledTiles += 1;
      if (tile.ownershipState === "FRONTIER") frontierTiles += 1;
      if (tile.town) controlledTowns += 1;
    }
    return {
      playerId: target.id,
      playerName: target.name ?? target.id,
      revealedAt: this.now(),
      tiles: settledTiles + frontierTiles,
      settledTiles,
      frontierTiles,
      controlledTowns,
      incomePerMinute: 0,
      techCount: target.techIds.size,
      gold: target.points,
      manpower: target.manpower,
      manpowerCap: Math.max(target.manpower, 100),
      strategicResources: {
        FOOD: target.strategicResources?.FOOD ?? 0,
        IRON: target.strategicResources?.IRON ?? 0,
        CRYSTAL: target.strategicResources?.CRYSTAL ?? 0,
        SUPPLY: target.strategicResources?.SUPPLY ?? 0,
        SHARD: target.strategicResources?.SHARD ?? 0,
        OIL: target.strategicResources?.OIL ?? 0
      }
    };
  }

  private emitEvent(event: SimulationEvent): void {
    this.persistence.recordEvent(event);
    const existingEvents = this.recordedEventsByCommandId.get(event.commandId) ?? [];
    existingEvents.push(event);
    this.recordedEventsByCommandId.set(event.commandId, existingEvents);
    this.events.emit("event", event);
  }

  private scheduleLockResolution(lock: LockRecord): void {
    this.scheduleAfter(Math.max(1, lock.resolvesAt - this.now()), () => {
      this.resolveLock(lock);
    });
  }

  private tileDeltaFromState(tile: DomainTileState): {
    x: number;
    y: number;
    terrain?: "LAND" | "SEA" | "MOUNTAIN";
    resource?: string;
    dockId?: string;
    shardSiteJson?: string;
    ownerId?: string;
    ownershipState?: string;
      townJson?: string;
      townType?: "MARKET" | "FARMING";
      townName?: string;
      townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
      fortJson?: string | undefined;
      observatoryJson?: string | undefined;
      siegeOutpostJson?: string | undefined;
      economicStructureJson?: string | undefined;
      sabotageJson?: string | undefined;
      yield?: { gold?: number; strategic?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> } | undefined;
      yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> } | undefined;
      yieldCap?: { gold: number; strategicEach: number } | undefined;
    } {
    const yieldView = buildTileYieldView(tile, this.tileYieldCollectedAtByTile.get(simulationTileKey(tile.x, tile.y)), this.now());
    return {
      x: tile.x,
      y: tile.y,
      ...(tile.terrain ? { terrain: tile.terrain } : {}),
      ...(tile.resource ? { resource: tile.resource } : {}),
      ...(tile.dockId ? { dockId: tile.dockId } : {}),
      ...(tile.shardSite ? { shardSiteJson: JSON.stringify(tile.shardSite) } : {}),
      ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
      ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
      ...(tile.town ? { townJson: JSON.stringify(tile.town) } : {}),
      ...(tile.town?.type ? { townType: tile.town.type } : {}),
      ...(tile.town?.name ? { townName: tile.town.name } : {}),
      ...(tile.town?.populationTier ? { townPopulationTier: tile.town.populationTier } : {}),
      fortJson: tile.fort ? JSON.stringify(tile.fort) : undefined,
      observatoryJson: tile.observatory ? JSON.stringify(tile.observatory) : undefined,
      siegeOutpostJson: tile.siegeOutpost ? JSON.stringify(tile.siegeOutpost) : undefined,
      economicStructureJson: tile.economicStructure ? JSON.stringify(tile.economicStructure) : undefined,
      sabotageJson: tile.sabotage ? JSON.stringify(tile.sabotage) : undefined,
      ...(yieldView?.yield ? { yield: yieldView.yield } : {}),
      ...(yieldView?.yieldRate ? { yieldRate: yieldView.yieldRate } : {}),
      ...(yieldView?.yieldCap ? { yieldCap: yieldView.yieldCap } : {})
    };
  }

  private collectTileYield(
    tile: DomainTileState,
    now: number
  ): {
    gold: number;
    strategic: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
  } {
    const tileKey = simulationTileKey(tile.x, tile.y);
    const yieldView = buildTileYieldView(tile, this.tileYieldCollectedAtByTile.get(tileKey), now);
    const gold = Math.floor((yieldView?.yield?.gold ?? 0) * 100) / 100;
    const strategic: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> = {};
    for (const [resource, amount] of Object.entries(yieldView?.yield?.strategic ?? {}) as Array<
      ["FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number]
    >) {
      const rounded = Math.floor(amount * 100) / 100;
      if (rounded > 0) {
        strategic[resource] = rounded;
        this.addStrategicResource(this.players.get(tile.ownerId!)!, resource, rounded);
      }
    }
    if (gold > 0 || Object.keys(strategic).length > 0) this.tileYieldCollectedAtByTile.set(tileKey, now);
    return { gold, strategic };
  }

  private strategicResourceAmount(player: DomainPlayer, resource: StrategicResourceKey): number {
    return player.strategicResources?.[resource] ?? 0;
  }

  private spendStrategicResource(player: DomainPlayer, resource: StrategicResourceKey, amount: number): boolean {
    const current = this.strategicResourceAmount(player, resource);
    if (current + 1e-6 < amount) return false;
    player.strategicResources = {
      ...(player.strategicResources ?? {}),
      [resource]: Math.max(0, current - amount)
    };
    return true;
  }

  private addStrategicResource(player: DomainPlayer, resource: StrategicResourceKey, amount: number): void {
    const current = this.strategicResourceAmount(player, resource);
    player.strategicResources = {
      ...(player.strategicResources ?? {}),
      [resource]: current + amount
    };
  }

  private ownedTileCountForPlayer(playerId: string): number {
    let count = 0;
    for (const tile of this.tiles.values()) {
      if (tile.ownerId === playerId) count += 1;
    }
    return count;
  }

  private adjacentTileStates(x: number, y: number): DomainTileState[] {
    const tiles: DomainTileState[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const tile = this.tiles.get(simulationTileKey(x + dx, y + dy));
        if (tile) tiles.push(tile);
      }
    }
    return tiles;
  }

  private supportedTownKeysForTile(playerId: string, x: number, y: number): string[] {
    return this.adjacentTileStates(x, y)
      .filter((tile) => tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.town)
      .map((tile) => simulationTileKey(tile.x, tile.y));
  }

  private supportedDockKeysForTile(playerId: string, x: number, y: number): string[] {
    return this.adjacentTileStates(x, y)
      .filter((tile) => tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.dockId)
      .map((tile) => simulationTileKey(tile.x, tile.y));
  }

  private economicStructureForSupportedTown(playerId: string, townKey: string, structureType: EconomicStructureType): DomainTileState | undefined {
    const [townXRaw, townYRaw] = townKey.split(",");
    const townX = Number(townXRaw);
    const townY = Number(townYRaw);
    return this.adjacentTileStates(townX, townY).find(
      (tile) => tile.ownerId === playerId && tile.economicStructure?.ownerId === playerId && tile.economicStructure.type === structureType
    );
  }

  private firstAvailableTownSupportTile(playerId: string, townKey: string, structureType: EconomicStructureType): DomainTileState | undefined {
    const [townXRaw, townYRaw] = townKey.split(",");
    const townX = Number(townXRaw);
    const townY = Number(townYRaw);
    return this.adjacentTileStates(townX, townY).find((tile) => {
      if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") return false;
      if (tile.town || tile.fort || tile.observatory || tile.siegeOutpost || tile.economicStructure) return false;
      return structureShowsOnTile(structureType, {
        ownershipState: tile.ownershipState,
        resource: tile.resource,
        dockId: tile.dockId,
        townPopulationTier: undefined,
        supportedTownCount: this.supportedTownKeysForTile(playerId, tile.x, tile.y).length,
        supportedDockCount: this.supportedDockKeysForTile(playerId, tile.x, tile.y).length
      });
    });
  }

  private ownedStructureCountForPlayer(playerId: string, structureType: BuildableStructureType): number {
    let count = 0;
    for (const tile of this.tiles.values()) {
      if (structureType === "FORT" && tile.fort?.ownerId === playerId) count += 1;
      else if (structureType === "OBSERVATORY" && tile.observatory?.ownerId === playerId) count += 1;
      else if (structureType === "SIEGE_OUTPOST" && tile.siegeOutpost?.ownerId === playerId) count += 1;
      else if (tile.economicStructure?.ownerId === playerId && tile.economicStructure.type === structureType) count += 1;
    }
    return count;
  }

  private handleBuildFortCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }

    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNKNOWN_TILE",
        message: "tile not found"
      });
      return;
    }
    if (!actor.techIds.has("masonry")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "unlock forts via Masonry first"
      });
      return;
    }
    if (target.terrain !== "LAND") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "fort requires land tile"
      });
      return;
    }
    if (target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "fort tile must be settled and owned"
      });
      return;
    }
    if (!structureShowsOnTile("FORT", {
      ownershipState: target.ownershipState,
      resource: target.resource,
      dockId: target.dockId,
      townPopulationTier: target.town?.populationTier,
      supportedTownCount: 0,
      supportedDockCount: 0
    })) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "fort cannot be built on this tile"
      });
      return;
    }
    if (target.fort || target.observatory || target.siegeOutpost || target.economicStructure) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "tile already has structure"
      });
      return;
    }
    if (this.rejectIfNoDevelopmentSlot(command, "BUILD_INVALID", "development slots are busy")) return;

    const goldCost = structureBuildGoldCost("FORT", this.ownedStructureCountForPlayer(command.playerId, "FORT"));
    if (actor.points < goldCost) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "INSUFFICIENT_GOLD",
        message: "insufficient gold for fort"
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "IRON", 45)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "insufficient IRON for fort"
      });
      return;
    }

    actor.points -= goldCost;
    const startedTile: DomainTileState = {
      ...target,
      fort: {
        ownerId: command.playerId,
        status: "under_construction",
        completesAt: this.now() + structureBuildDurationMs("FORT")
      }
    };
    this.replaceTileState(targetKey, startedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(startedTile)]
    });
    this.emitPlayerStateUpdate(command);
    this.scheduleAfter(structureBuildDurationMs("FORT"), () => {
      const latest = this.tiles.get(targetKey);
      if (!latest || latest.ownerId !== command.playerId || !latest.fort || latest.fort.ownerId !== command.playerId) return;
      const { completesAt: _ignoredCompletesAt, ...activeFort } = latest.fort;
      const completedTile: DomainTileState = {
        ...latest,
        fort: { ...activeFort, status: "active" }
      };
      this.replaceTileState(targetKey, completedTile);
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: command.commandId,
        playerId: command.playerId,
        tileDeltas: [this.tileDeltaFromState(completedTile)]
      });
      this.emitPlayerStateUpdate(command);
    });
  }

  private handleBuildObservatoryCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }

    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNKNOWN_TILE",
        message: "tile not found"
      });
      return;
    }
    if (!actor.techIds.has("cartography")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "unlock observatories via Cartography first"
      });
      return;
    }
    if (target.terrain !== "LAND") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "observatory requires land tile"
      });
      return;
    }
    if (target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "observatory requires settled owned tile"
      });
      return;
    }
    if (!structureShowsOnTile("OBSERVATORY", {
      ownershipState: target.ownershipState,
      resource: target.resource,
      dockId: target.dockId,
      townPopulationTier: target.town?.populationTier,
      supportedTownCount: 0,
      supportedDockCount: 0
    })) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "observatory cannot be built on this tile"
      });
      return;
    }
    if (target.fort || target.observatory || target.siegeOutpost || target.economicStructure) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "tile already has structure"
      });
      return;
    }
    if (this.rejectIfNoDevelopmentSlot(command, "BUILD_INVALID", "development slots are busy")) return;

    const goldCost = structureBuildGoldCost("OBSERVATORY", this.ownedStructureCountForPlayer(command.playerId, "OBSERVATORY"));
    if (actor.points < goldCost) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "INSUFFICIENT_GOLD",
        message: "insufficient gold for observatory"
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "CRYSTAL", 45)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "insufficient CRYSTAL for observatory"
      });
      return;
    }

    actor.points -= goldCost;
    const startedTile: DomainTileState = {
      ...target,
      observatory: {
        ownerId: command.playerId,
        status: "under_construction",
        completesAt: this.now() + structureBuildDurationMs("OBSERVATORY")
      }
    };
    this.replaceTileState(targetKey, startedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(startedTile)]
    });
    this.emitPlayerStateUpdate(command);
    this.scheduleAfter(structureBuildDurationMs("OBSERVATORY"), () => {
      const latest = this.tiles.get(targetKey);
      if (!latest || latest.ownerId !== command.playerId || !latest.observatory || latest.observatory.ownerId !== command.playerId) return;
      const { completesAt: _ignoredCompletesAt, ...activeObservatory } = latest.observatory;
      const completedTile: DomainTileState = {
        ...latest,
        observatory: { ...activeObservatory, status: "active" }
      };
      this.replaceTileState(targetKey, completedTile);
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: command.commandId,
        playerId: command.playerId,
        tileDeltas: [this.tileDeltaFromState(completedTile)]
      });
      this.emitPlayerStateUpdate(command);
    });
  }

  private handleBuildSiegeOutpostCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }

    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNKNOWN_TILE",
        message: "tile not found"
      });
      return;
    }
    if (!actor.techIds.has("leatherworking")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "unlock siege outposts via Leatherworking first"
      });
      return;
    }
    if (target.terrain !== "LAND") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "siege outpost requires land tile"
      });
      return;
    }
    if (target.ownerId !== command.playerId) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "siege outpost tile must be owned"
      });
      return;
    }
    if (
      !structureShowsOnTile("SIEGE_OUTPOST", {
        ownershipState: target.ownershipState,
        resource: target.resource,
        dockId: target.dockId,
        townPopulationTier: target.town?.populationTier,
        supportedTownCount: this.supportedTownKeysForTile(command.playerId, target.x, target.y).length,
        supportedDockCount: this.supportedDockKeysForTile(command.playerId, target.x, target.y).length
      })
    ) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "siege outpost cannot be built on this tile"
      });
      return;
    }
    const upgradingLightOutpost =
      target.economicStructure?.ownerId === command.playerId &&
      target.economicStructure.type === "LIGHT_OUTPOST" &&
      (target.economicStructure.status === "active" || target.economicStructure.status === "inactive");
    if (target.siegeOutpost || target.fort || target.observatory || (target.economicStructure && !upgradingLightOutpost)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "tile already has structure"
      });
      return;
    }
    if (this.rejectIfNoDevelopmentSlot(command, "BUILD_INVALID", "development slots are busy")) return;

    const goldCost = structureBuildGoldCost("SIEGE_OUTPOST", this.ownedStructureCountForPlayer(command.playerId, "SIEGE_OUTPOST"));
    if (actor.points < goldCost) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "INSUFFICIENT_GOLD",
        message: "insufficient gold for siege outpost"
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "SUPPLY", 45)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "insufficient SUPPLY for siege outpost"
      });
      return;
    }

    actor.points -= goldCost;
    const startedTile: DomainTileState = {
      ...target,
      ...(upgradingLightOutpost ? { economicStructure: undefined } : {}),
      siegeOutpost: {
        ownerId: command.playerId,
        status: "under_construction",
        completesAt: this.now() + structureBuildDurationMs("SIEGE_OUTPOST")
      }
    };
    this.replaceTileState(targetKey, startedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(startedTile)]
    });
    this.emitPlayerStateUpdate(command);
    this.scheduleAfter(structureBuildDurationMs("SIEGE_OUTPOST"), () => {
      const latest = this.tiles.get(targetKey);
      if (!latest || latest.ownerId !== command.playerId || !latest.siegeOutpost || latest.siegeOutpost.ownerId !== command.playerId) return;
      const { completesAt: _ignoredCompletesAt, ...activeSiegeOutpost } = latest.siegeOutpost;
      const completedTile: DomainTileState = {
        ...latest,
        siegeOutpost: { ...activeSiegeOutpost, status: "active" }
      };
      this.replaceTileState(targetKey, completedTile);
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: command.commandId,
        playerId: command.playerId,
        tileDeltas: [this.tileDeltaFromState(completedTile)]
      });
      this.emitPlayerStateUpdate(command);
    });
  }

  private handleBuildEconomicStructureCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseEconomicStructurePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }

    let target = this.tiles.get(simulationTileKey(payload.x, payload.y));
    if (!target) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNKNOWN_TILE",
        message: "tile not found"
      });
      return;
    }

    const requiredTechId = TECH_REQUIREMENTS_BY_STRUCTURE[payload.structureType];
    if (requiredTechId && !actor.techIds.has(requiredTechId)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: `unlock ${payload.structureType.toLowerCase().replaceAll("_", " ")} first`
      });
      return;
    }

    if (structurePlacementMetadata(payload.structureType).placementMode === "town_support" && target.town) {
      const supportTarget = this.firstAvailableTownSupportTile(command.playerId, simulationTileKey(target.x, target.y), payload.structureType);
      if (!supportTarget) {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "BUILD_INVALID",
          message: `${payload.structureType.toLowerCase().replaceAll("_", " ")} needs an open support tile next to this town`
        });
        return;
      }
      if (this.economicStructureForSupportedTown(command.playerId, simulationTileKey(target.x, target.y), payload.structureType)) {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "BUILD_INVALID",
          message: `town already has ${payload.structureType.toLowerCase().replaceAll("_", " ")}`
        });
        return;
      }
      target = supportTarget;
    }

    if (target.terrain !== "LAND") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "structure requires land tile"
      });
      return;
    }
    if (target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "structure requires settled owned tile"
      });
      return;
    }

    const targetKey = simulationTileKey(target.x, target.y);
    const upgradeBaseType = upgradeBaseTypeForEconomicStructure(payload.structureType);
    const upgradingBaseEconomic =
      upgradeBaseType &&
      target.economicStructure?.ownerId === command.playerId &&
      target.economicStructure.type === upgradeBaseType &&
      (target.economicStructure.status === "active" || target.economicStructure.status === "inactive");
    if (
      !structureShowsOnTile(payload.structureType, {
        ownershipState: target.ownershipState,
        resource: target.resource,
        dockId: target.dockId,
        townPopulationTier: target.town?.populationTier,
        supportedTownCount: this.supportedTownKeysForTile(command.playerId, target.x, target.y).length,
        supportedDockCount: this.supportedDockKeysForTile(command.playerId, target.x, target.y).length
      })
    ) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: `${payload.structureType.toLowerCase().replaceAll("_", " ")} cannot be built on this tile`
      });
      return;
    }
    if (target.fort || target.observatory || target.siegeOutpost || (target.economicStructure && !upgradingBaseEconomic)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "tile already has structure"
      });
      return;
    }
    if (this.rejectIfNoDevelopmentSlot(command, "BUILD_INVALID", "development slots are busy")) return;

    const goldCost = structureBuildGoldCost(payload.structureType, this.ownedStructureCountForPlayer(command.playerId, payload.structureType));
    if (actor.points < goldCost) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "INSUFFICIENT_GOLD",
        message: `insufficient gold for ${payload.structureType.toLowerCase().replaceAll("_", " ")}`
      });
      return;
    }
    const resourceCost = structureCostDefinition(payload.structureType).resourceCost;
    if (resourceCost && !this.spendStrategicResource(actor, resourceCost.resource, resourceCost.amount)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: `insufficient ${resourceCost.resource} for ${payload.structureType.toLowerCase().replaceAll("_", " ")}`
      });
      return;
    }

    actor.points -= goldCost;
    const startedTile: DomainTileState = {
      ...target,
      ...(upgradingBaseEconomic ? { economicStructure: undefined } : {}),
      economicStructure: {
        ownerId: command.playerId,
        type: payload.structureType,
        status: "under_construction",
        completesAt: this.now() + structureBuildDurationMs(payload.structureType)
      }
    };
    this.replaceTileState(targetKey, startedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(startedTile)]
    });
    this.emitPlayerStateUpdate(command);
    this.scheduleAfter(structureBuildDurationMs(payload.structureType), () => {
      const latest = this.tiles.get(targetKey);
      if (
        !latest ||
        latest.ownerId !== command.playerId ||
        !latest.economicStructure ||
        latest.economicStructure.ownerId !== command.playerId ||
        latest.economicStructure.type !== payload.structureType
      ) {
        return;
      }
      const { completesAt: _ignoredCompletesAt, ...activeStructure } = latest.economicStructure;
      const completedTile: DomainTileState = {
        ...latest,
        economicStructure: { ...activeStructure, status: "active" }
      };
      this.replaceTileState(targetKey, completedTile);
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: command.commandId,
        playerId: command.playerId,
        tileDeltas: [this.tileDeltaFromState(completedTile)]
      });
      this.emitPlayerStateUpdate(command);
    });
  }

  private handleCancelFortBuildCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }

    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target?.fort || target.fort.ownerId !== command.playerId || target.fort.status !== "under_construction") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "FORT_CANCEL_INVALID",
        message: "no fort under construction on tile"
      });
      return;
    }

    const updatedTile: DomainTileState = { ...target, fort: undefined };
    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
  }

  private handleCancelStructureBuildCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }

    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "STRUCTURE_CANCEL_INVALID",
        message: "no removable structure action on tile"
      });
      return;
    }

    let updatedTile: DomainTileState | undefined;
    if (target.fort?.ownerId === command.playerId && (target.fort.status === "under_construction" || target.fort.status === "removing")) {
      updatedTile = {
        ...target,
        fort:
          target.fort.status === "under_construction"
            ? undefined
            : {
                ...target.fort,
                status: target.fort.previousStatus ?? "active",
                previousStatus: undefined,
                completesAt: undefined
              }
      };
    } else if (
      target.observatory?.ownerId === command.playerId &&
      (target.observatory.status === "under_construction" || target.observatory.status === "removing")
    ) {
      updatedTile = {
        ...target,
        observatory:
          target.observatory.status === "under_construction"
            ? undefined
            : {
                ...target.observatory,
                status: target.observatory.previousStatus ?? "active",
                previousStatus: undefined,
                completesAt: undefined
              }
      };
    } else if (
      target.siegeOutpost?.ownerId === command.playerId &&
      (target.siegeOutpost.status === "under_construction" || target.siegeOutpost.status === "removing")
    ) {
      updatedTile = {
        ...target,
        siegeOutpost:
          target.siegeOutpost.status === "under_construction"
            ? undefined
            : {
                ...target.siegeOutpost,
                status: target.siegeOutpost.previousStatus ?? "active",
                previousStatus: undefined,
                completesAt: undefined
              }
      };
    } else if (
      target.economicStructure?.ownerId === command.playerId &&
      (target.economicStructure.status === "under_construction" || target.economicStructure.status === "removing")
    ) {
      updatedTile = {
        ...target,
        economicStructure:
          target.economicStructure.status === "under_construction"
            ? undefined
            : {
                ...target.economicStructure,
                status: target.economicStructure.previousStatus ?? "inactive",
                previousStatus: undefined,
                completesAt: undefined
              }
      };
    }

    if (!updatedTile) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "STRUCTURE_CANCEL_INVALID",
        message: "no removable structure action on tile"
      });
      return;
    }

    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
  }

  private handleRemoveStructureCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }

    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target || target.terrain !== "LAND" || target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "STRUCTURE_REMOVE_INVALID",
        message: "structure requires settled owned tile"
      });
      return;
    }

    const fort = target.fort?.ownerId === command.playerId ? target.fort : undefined;
    const observatory = target.observatory?.ownerId === command.playerId ? target.observatory : undefined;
    const siegeOutpost = target.siegeOutpost?.ownerId === command.playerId ? target.siegeOutpost : undefined;
    const economicStructure = target.economicStructure?.ownerId === command.playerId ? target.economicStructure : undefined;
    const ownedStructure = fort ?? observatory ?? siegeOutpost ?? economicStructure;

    if (!ownedStructure) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "STRUCTURE_REMOVE_INVALID",
        message: "no owned structure on tile"
      });
      return;
    }
    if (ownedStructure.status === "under_construction") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "STRUCTURE_REMOVE_INVALID",
        message: "cancel construction instead"
      });
      return;
    }
    if (ownedStructure.status === "removing") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "STRUCTURE_REMOVE_INVALID",
        message: "structure is already being removed"
      });
      return;
    }
    if (this.rejectIfNoDevelopmentSlot(command, "STRUCTURE_REMOVE_INVALID", "development slots are busy")) return;

    let updatedTile: DomainTileState;
    let removeDurationMs: number;
    if (fort) {
      removeDurationMs = structureBuildDurationMs("FORT");
      updatedTile = {
        ...target,
        fort: {
          ...fort,
          status: "removing",
          previousStatus: "active",
          completesAt: this.now() + removeDurationMs
        }
      };
    } else if (observatory) {
      removeDurationMs = structureBuildDurationMs("OBSERVATORY");
      updatedTile = {
        ...target,
        observatory: {
          ...observatory,
          status: "removing",
          previousStatus: observatory.status === "inactive" ? "inactive" : "active",
          completesAt: this.now() + removeDurationMs
        }
      };
    } else if (siegeOutpost) {
      removeDurationMs = structureBuildDurationMs("SIEGE_OUTPOST");
      updatedTile = {
        ...target,
        siegeOutpost: {
          ...siegeOutpost,
          status: "removing",
          previousStatus: "active",
          completesAt: this.now() + removeDurationMs
        }
      };
    } else {
      const structure = economicStructure as NonNullable<typeof economicStructure>;
      removeDurationMs = structureBuildDurationMs(structure.type);
      updatedTile = {
        ...target,
        economicStructure: {
          ...structure,
          status: "removing",
          previousStatus: structure.status === "inactive" ? "inactive" : "active",
          completesAt: this.now() + removeDurationMs
        }
      };
    }

    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
    this.emitPlayerStateUpdate(command);

    this.scheduleAfter(removeDurationMs, () => {
      const latest = this.tiles.get(targetKey);
      if (!latest || latest.ownerId !== command.playerId) return;

      let completedTile: DomainTileState | undefined;
      if (latest.fort?.ownerId === command.playerId && latest.fort.status === "removing") {
        completedTile = { ...latest, fort: undefined };
      } else if (latest.observatory?.ownerId === command.playerId && latest.observatory.status === "removing") {
        completedTile = { ...latest, observatory: undefined };
      } else if (latest.siegeOutpost?.ownerId === command.playerId && latest.siegeOutpost.status === "removing") {
        completedTile = { ...latest, siegeOutpost: undefined };
      } else if (latest.economicStructure?.ownerId === command.playerId && latest.economicStructure.status === "removing") {
        completedTile = { ...latest, economicStructure: undefined };
      }
      if (!completedTile) return;

      this.replaceTileState(targetKey, completedTile);
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: command.commandId,
        playerId: command.playerId,
        tileDeltas: [this.tileDeltaFromState(completedTile)]
      });
      this.emitPlayerStateUpdate(command);
    });
  }

  private handleCancelSiegeOutpostBuildCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }

    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target?.siegeOutpost || target.siegeOutpost.ownerId !== command.playerId || target.siegeOutpost.status !== "under_construction") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SIEGE_OUTPOST_CANCEL_INVALID",
        message: "no siege outpost under construction on tile"
      });
      return;
    }

    const updatedTile: DomainTileState = { ...target, siegeOutpost: undefined };
    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
    this.emitPlayerStateUpdate(command);
  }

  private visibleRadiusForPlayer(playerId: string): number {
    const player = this.players.get(playerId);
    return Math.max(1, Math.floor(4 * (player?.mods?.vision ?? 1)));
  }

  private buildCaptureRevealTileDeltas(playerId: string, centerX: number, centerY: number): Array<ReturnType<SimulationRuntime["tileDeltaFromState"]>> {
    const radius = this.visibleRadiusForPlayer(playerId);
    const deltas = new Map<string, ReturnType<SimulationRuntime["tileDeltaFromState"]>>();
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const tile = this.tiles.get(simulationTileKey(centerX + dx, centerY + dy));
        if (!tile) continue;
        deltas.set(simulationTileKey(tile.x, tile.y), this.tileDeltaFromState(tile));
      }
    }
    return [...deltas.values()].sort((left, right) => (left.x - right.x) || (left.y - right.y));
  }

  private resolveLock(lock: LockRecord): void {
    const originLock = this.locksByTile.get(lock.originKey);
    const targetLock = this.locksByTile.get(lock.targetKey);
    if (originLock?.commandId !== lock.commandId || targetLock?.commandId !== lock.commandId) return;

    this.locksByTile.delete(lock.originKey);
    this.locksByTile.delete(lock.targetKey);
    const previousTarget = this.tiles.get(lock.targetKey);
    const previousOwnerId = previousTarget?.ownerId;
    const targetWasSettled = previousTarget?.ownershipState === "SETTLED";
    const combat = rollFrontierCombat(previousTarget ?? { terrain: "LAND" }, lock.actionType);
    const defenderTileCountBeforeCapture = previousOwnerId
      ? Math.max(1, [...this.tiles.values()].filter((tile) => tile.ownerId === previousOwnerId && tile.ownershipState === "SETTLED").length)
      : 0;
    const attacker = this.players.get(lock.playerId);
    const defender = previousOwnerId ? this.players.get(previousOwnerId) : undefined;
    const pillage =
      combat.attackerWon && attacker && defender && targetWasSettled
        ? this.computeSettledCapturePlunder({ attacker, defender, defenderTileCountBeforeCapture, target: previousTarget })
        : undefined;
    if (attacker && (lock.actionType === "EXPAND" || lock.actionType === "ATTACK")) {
      attacker.points = Math.max(0, attacker.points - FRONTIER_CLAIM_COST);
    }
    this.emitEvent({
      eventType: "COMBAT_RESOLVED",
      commandId: lock.commandId,
      playerId: lock.playerId,
      actionType: lock.actionType,
      originX: lock.originX,
      originY: lock.originY,
      targetX: lock.targetX,
      targetY: lock.targetY,
      attackerWon: combat.attackerWon,
      ...(typeof pillage?.gold === "number" && pillage.gold > 0.01 ? { pillagedGold: pillage.gold } : {}),
      ...(pillage?.strategic && Object.keys(pillage.strategic).length > 0 ? { pillagedStrategic: pillage.strategic } : {})
    });
    if (combat.attackerWon) {
      const resolvedTarget: DomainTileState = {
        x: lock.targetX,
        y: lock.targetY,
        terrain: previousTarget?.terrain ?? "LAND",
        ...(previousTarget?.resource ? { resource: previousTarget.resource } : {}),
        ...(previousTarget?.dockId ? { dockId: previousTarget.dockId } : {}),
        ...(previousTarget?.town ? { town: previousTarget.town } : {}),
        ownerId: lock.playerId,
        ownershipState: "FRONTIER"
      };
      this.replaceTileState(lock.targetKey, resolvedTarget);
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: lock.commandId,
        playerId: lock.playerId,
        tileDeltas: this.buildCaptureRevealTileDeltas(lock.playerId, lock.targetX, lock.targetY)
      });
    }
    if (attacker) this.emitPlayerStateUpdate({ commandId: lock.commandId, playerId: attacker.id });
    if (combat.attackerWon && previousOwnerId && previousOwnerId !== lock.playerId) this.respawnIfEliminated(previousOwnerId, lock.commandId);
  }

  private computeSettledCapturePlunder(input: {
    attacker: DomainPlayer;
    defender: DomainPlayer;
    defenderTileCountBeforeCapture: number;
    target: DomainTileState;
  }): { gold: number; strategic: Partial<Record<StrategicResourceKey, number>> } {
    const share = 1 / Math.max(1, input.defenderTileCountBeforeCapture);
    const defenderGoldShare = Math.max(0, input.defender.points * share);
    const storedYieldGold = input.target.town ? 1 : 0;
    const gold = Math.round((defenderGoldShare + storedYieldGold) * 100) / 100;
    if (gold > 0) {
      input.defender.points = Math.max(0, input.defender.points - defenderGoldShare);
      input.attacker.points += gold;
    }

    const strategic: Partial<Record<StrategicResourceKey, number>> = {};
    const strategicResource = strategicResourceForTile(input.target.resource);
    if (strategicResource) {
      strategic[strategicResource] = 1;
    }
    return { gold, strategic };
  }

  private respawnIfEliminated(playerId: string, commandId: string): void {
    const actor = this.players.get(playerId);
    if (!actor) return;
    const stillOwnsTiles = [...this.tiles.values()].some((tile) => tile.ownerId === playerId);
    if (stillOwnsTiles) return;

    for (const tile of this.tiles.values()) {
      if (tile.terrain !== "LAND" || tile.ownerId) continue;
      const respawnedTile: DomainTileState = {
        ...tile,
        ownerId: playerId,
        ownershipState: "SETTLED",
        town: tile.town ?? {
          name: `Respawn ${tile.x},${tile.y}`,
          type: "FARMING",
          populationTier: "SETTLEMENT"
        }
      };
      actor.manpower = Math.max(actor.manpower, 100);
      this.tileYieldCollectedAtByTile.set(simulationTileKey(tile.x, tile.y), this.now());
      this.replaceTileState(simulationTileKey(tile.x, tile.y), respawnedTile);
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: `${commandId}:respawn:${playerId}`,
        playerId,
        tileDeltas: [
          {
            x: respawnedTile.x,
            y: respawnedTile.y,
            terrain: respawnedTile.terrain,
            ...(respawnedTile.resource ? { resource: respawnedTile.resource } : {}),
            ownerId: playerId,
            ownershipState: "SETTLED",
            ...(respawnedTile.town?.type ? { townType: respawnedTile.town.type } : {}),
            ...(respawnedTile.town?.name ? { townName: respawnedTile.town.name } : {}),
            ...(respawnedTile.town?.populationTier ? { townPopulationTier: respawnedTile.town.populationTier } : {})
          }
        ]
      });
      return;
    }
  }

  private queueCommandForProcessing(command: CommandEnvelope): void {
    this.enqueueJob(laneForCommand(command), () => {
      if (
        command.type !== "ATTACK" &&
        command.type !== "EXPAND" &&
        command.type !== "BREAKTHROUGH_ATTACK" &&
        command.type !== "SETTLE" &&
        command.type !== "BUILD_FORT" &&
        command.type !== "BUILD_OBSERVATORY" &&
        command.type !== "BUILD_SIEGE_OUTPOST" &&
        command.type !== "BUILD_ECONOMIC_STRUCTURE" &&
        command.type !== "CANCEL_FORT_BUILD" &&
        command.type !== "CANCEL_STRUCTURE_BUILD" &&
        command.type !== "REMOVE_STRUCTURE" &&
        command.type !== "CANCEL_SIEGE_OUTPOST_BUILD" &&
        command.type !== "UNCAPTURE_TILE" &&
        command.type !== "COLLECT_VISIBLE" &&
        command.type !== "COLLECT_TILE" &&
        command.type !== "CHOOSE_TECH" &&
        command.type !== "CHOOSE_DOMAIN" &&
        command.type !== "OVERLOAD_SYNTHESIZER" &&
        command.type !== "SET_CONVERTER_STRUCTURE_ENABLED" &&
        command.type !== "REVEAL_EMPIRE" &&
        command.type !== "REVEAL_EMPIRE_STATS" &&
        command.type !== "CAST_AETHER_BRIDGE" &&
        command.type !== "CAST_AETHER_WALL" &&
        command.type !== "SIPHON_TILE" &&
        command.type !== "PURGE_SIPHON" &&
        command.type !== "CREATE_MOUNTAIN" &&
        command.type !== "REMOVE_MOUNTAIN" &&
        command.type !== "AIRPORT_BOMBARD" &&
        command.type !== "COLLECT_SHARD"
      ) {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "UNSUPPORTED",
          message: `${command.type} not yet migrated to the new simulation service`
        });
        return;
      }

      if (command.type === "SETTLE") {
        this.handleSettleCommand(command);
        return;
      }

      if (command.type === "BUILD_FORT") {
        this.handleBuildFortCommand(command);
        return;
      }

      if (command.type === "BUILD_OBSERVATORY") {
        this.handleBuildObservatoryCommand(command);
        return;
      }

      if (command.type === "BUILD_SIEGE_OUTPOST") {
        this.handleBuildSiegeOutpostCommand(command);
        return;
      }

      if (command.type === "BUILD_ECONOMIC_STRUCTURE") {
        this.handleBuildEconomicStructureCommand(command);
        return;
      }

      if (command.type === "CANCEL_FORT_BUILD") {
        this.handleCancelFortBuildCommand(command);
        return;
      }

      if (command.type === "CANCEL_STRUCTURE_BUILD") {
        this.handleCancelStructureBuildCommand(command);
        return;
      }

      if (command.type === "REMOVE_STRUCTURE") {
        this.handleRemoveStructureCommand(command);
        return;
      }

      if (command.type === "CANCEL_SIEGE_OUTPOST_BUILD") {
        this.handleCancelSiegeOutpostBuildCommand(command);
        return;
      }

      if (command.type === "COLLECT_VISIBLE") {
        this.handleCollectVisibleCommand(command);
        return;
      }

      if (command.type === "COLLECT_TILE") {
        this.handleCollectTileCommand(command);
        return;
      }

      if (command.type === "UNCAPTURE_TILE") {
        this.handleUncaptureTileCommand(command);
        return;
      }

      if (command.type === "CHOOSE_TECH") {
        this.handleChooseTechCommand(command);
        return;
      }

      if (command.type === "CHOOSE_DOMAIN") {
        this.handleChooseDomainCommand(command);
        return;
      }

      if (command.type === "OVERLOAD_SYNTHESIZER") {
        this.handleOverloadSynthesizerCommand(command);
        return;
      }

      if (command.type === "SET_CONVERTER_STRUCTURE_ENABLED") {
        this.handleSetConverterStructureEnabledCommand(command);
        return;
      }

      if (command.type === "REVEAL_EMPIRE") {
        this.handleRevealEmpireCommand(command);
        return;
      }

      if (command.type === "REVEAL_EMPIRE_STATS") {
        this.handleRevealEmpireStatsCommand(command);
        return;
      }

      if (command.type === "CAST_AETHER_BRIDGE") {
        this.handleCastAetherBridgeCommand(command);
        return;
      }

      if (command.type === "CAST_AETHER_WALL") {
        this.handleCastAetherWallCommand(command);
        return;
      }

      if (command.type === "SIPHON_TILE") {
        this.handleSiphonTileCommand(command);
        return;
      }

      if (command.type === "PURGE_SIPHON") {
        this.handlePurgeSiphonCommand(command);
        return;
      }

      if (command.type === "CREATE_MOUNTAIN") {
        this.handleCreateMountainCommand(command);
        return;
      }

      if (command.type === "REMOVE_MOUNTAIN") {
        this.handleRemoveMountainCommand(command);
        return;
      }

      if (command.type === "AIRPORT_BOMBARD") {
        this.handleAirportBombardCommand(command);
        return;
      }

      if (command.type === "COLLECT_SHARD") {
        this.handleCollectShardCommand(command);
        return;
      }

      this.handleFrontierCommand(command, command.type);
    });
  }
}

const createTilesFromInitialState = (
  initialState: RecoveredSimulationState | undefined,
  seedTiles: Map<string, DomainTileState>
): Map<string, DomainTileState> => {
  const mergedTiles = new Map(seedTiles);
  if (!initialState) return mergedTiles;

  for (const tile of initialState.tiles) {
    const tileKey = simulationTileKey(tile.x, tile.y);
    const seededTile = mergedTiles.get(tileKey);
    const hydratedTown =
      tile.town && !isSyntheticSettlementTown(tile.town, tile.x, tile.y)
        ? tile.town
        : undefined;
    mergedTiles.set(tileKey, {
      x: tile.x,
      y: tile.y,
      terrain: tile.terrain ?? seededTile?.terrain ?? "LAND",
      ...(tile.resource ? { resource: tile.resource } : {}),
      ...(tile.dockId ? { dockId: tile.dockId } : {}),
      ...(tile.shardSite ? { shardSite: tile.shardSite } : {}),
      ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
      ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
      ...(hydratedTown ? { town: hydratedTown } : {}),
      ...(tile.fort ? { fort: tile.fort } : {}),
      ...(tile.observatory ? { observatory: tile.observatory } : {}),
      ...(tile.siegeOutpost ? { siegeOutpost: tile.siegeOutpost } : {}),
      ...(tile.economicStructure ? { economicStructure: tile.economicStructure } : {}),
      ...(tile.sabotage ? { sabotage: tile.sabotage } : {})
    });
  }
  return mergedTiles;
};

const createLocksFromInitialState = (initialState?: RecoveredSimulationState): Map<string, LockRecord> => {
  const locksByTile = new Map<string, LockRecord>();
  if (!initialState) return locksByTile;

  for (const lock of initialState.activeLocks) {
    const hydratedLock: LockRecord = {
      commandId: lock.commandId,
      playerId: lock.playerId,
      actionType: lock.actionType,
      originX: lock.originX,
      originY: lock.originY,
      targetX: lock.targetX,
      targetY: lock.targetY,
      originKey: lock.originKey,
      targetKey: lock.targetKey,
      resolvesAt: lock.resolvesAt
    };
    locksByTile.set(hydratedLock.originKey, hydratedLock);
    locksByTile.set(hydratedLock.targetKey, hydratedLock);
  }

  return locksByTile;
};

const uniqueLocksByCommandId = (locks: Iterable<LockRecord>): LockRecord[] => {
  const deduped = new Map<string, LockRecord>();
  for (const lock of locks) {
    if (!deduped.has(lock.commandId)) deduped.set(lock.commandId, lock);
  }
  return [...deduped.values()];
};

const hydrateCommandHistory = ({
  commandIdsByPlayerSeq,
  recordedEventsByCommandId,
  recoveredCommandHistory
}: {
  commandIdsByPlayerSeq: Map<string, string>;
  recordedEventsByCommandId: Map<string, SimulationEvent[]>;
  recoveredCommandHistory?: RecoveredCommandHistory;
}): void => {
  if (!recoveredCommandHistory) return;

  for (const command of recoveredCommandHistory.commands) {
    commandIdsByPlayerSeq.set(`${command.playerId}:${command.clientSeq}`, command.commandId);
  }
  for (const [commandId, events] of recoveredCommandHistory.eventsByCommandId.entries()) {
    recordedEventsByCommandId.set(commandId, [...events]);
  }
};

const requeueRecoveredCommands = ({
  recoveredCommandHistory,
  queueCommandForProcessing
}: {
  recoveredCommandHistory?: RecoveredCommandHistory;
  queueCommandForProcessing: (command: CommandEnvelope) => void;
}): void => {
  if (!recoveredCommandHistory) return;

  for (const command of recoveredCommandHistory.commands) {
    if (command.status !== "QUEUED") continue;
    if (recoveredCommandHistory.eventsByCommandId.has(command.commandId)) continue;
    queueCommandForProcessing({
      commandId: command.commandId,
      sessionId: command.sessionId,
      playerId: command.playerId,
      clientSeq: command.clientSeq,
      issuedAt: command.queuedAt,
      type: command.type,
      payloadJson: command.payloadJson
    });
  }
};
