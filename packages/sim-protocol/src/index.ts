import { z } from "zod";
import { DurableCommandTypeSchema, type DurableCommandType } from "@border-empires/client-protocol";
import type { ChosenTrickleResource, PlayerRespawnNotice, VisibilityState, WorldStyle } from "@border-empires/shared";
import {
  ACCEPTANCE_RESOLUTION_COMMAND_TYPES as ACCEPTANCE_RESOLUTION_COMMAND_TYPES_UNTYPED,
  RECONNECT_COMMAND_TYPES as RECONNECT_COMMAND_TYPES_UNTYPED,
  RESTART_PARITY_COMMAND_TYPES as RESTART_PARITY_COMMAND_TYPES_UNTYPED
} from "./command-coverage-sets/command-coverage-sets.js";

const SimulationCommandTypeSchema = z.union([DurableCommandTypeSchema, z.literal("SYNC_ALLIANCE"), z.literal("WATCH_MUSTER"), z.literal("UNWATCH_MUSTER")]);

export const CommandEnvelopeSchema = z.object({
  commandId: z.string().min(1),
  sessionId: z.string().min(1),
  playerId: z.string().min(1),
  clientSeq: z.number().int().nonnegative(),
  issuedAt: z.number().int().nonnegative(),
  type: SimulationCommandTypeSchema,
  payloadJson: z.string()
});

export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;

export const DURABLE_COMMAND_TYPES = [...DurableCommandTypeSchema.options] as readonly DurableCommandType[];

export const RESTART_PARITY_COMMAND_TYPES = RESTART_PARITY_COMMAND_TYPES_UNTYPED as readonly DurableCommandType[];
export const ACCEPTANCE_RESOLUTION_COMMAND_TYPES = ACCEPTANCE_RESOLUTION_COMMAND_TYPES_UNTYPED as readonly DurableCommandType[];
export const RECONNECT_COMMAND_TYPES = RECONNECT_COMMAND_TYPES_UNTYPED as readonly DurableCommandType[];

export type StrategicResourceKey = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD";
export type FrontierCombatActionType = "ATTACK" | "EXPAND";
export type ManpowerBreakdownLine = {
  label: string;
  amount: number;
  note?: string;
};

export type ManpowerBreakdown = {
  cap: ManpowerBreakdownLine[];
  regen: ManpowerBreakdownLine[];
};

export type FrontierCombatResultChange = {
  x: number;
  y: number;
  ownerId?: string;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
};

export type LockedFrontierCombatResult = {
  attackType: FrontierCombatActionType;
  attackerWon: boolean;
  winnerId?: string;
  defenderOwnerId?: string;
  origin: { x: number; y: number };
  target: { x: number; y: number };
  changes: FrontierCombatResultChange[];
  pointsDelta: number;
  manpowerDelta: number;
  pillagedGold: number;
  pillagedShare: number;
  pillagedStrategic: Partial<Record<StrategicResourceKey, number>>;
  atkEff: number;
  defEff: number;
  winChance: number;
  levelDelta: number;
};

export type LeaderboardOverallEntry = {
  id: string;
  name: string;
  tiles: number;
  incomePerMinute: number;
  techs: number;
  score: number;
  rank: number;
};

export type LeaderboardMetricEntry = {
  id: string;
  name: string;
  value: number;
  rank: number;
};

export type AdminPlayerRow = {
  id: string;
  name: string;
  isAi: boolean;
  gold: number;
  settledTiles: number;
  ownedTiles: number;
  incomePerMinute: number;
  techs: number;
  manpower: number;
  food: number;
  iron: number;
  crystal: number;
  supply: number;
};

export type SeasonLifecycleStatus = "active" | "ended";

type SeasonVictoryPathId =
  | "TOWN_CONTROL"
  | "ECONOMIC_HEGEMONY"
  | "RESOURCE_MONOPOLY"
  | "MARITIME_SUPREMACY"
  | "DIPLOMATIC_DOMINANCE";

export type SeasonVictoryObjectiveSnapshot = {
  id: SeasonVictoryPathId;
  name: string;
  description: string;
  leaderPlayerId?: string;
  leaderName: string;
  progressLabel: string;
  selfProgressLabel?: string;
  thresholdLabel: string;
  holdDurationSeconds: number;
  holdRemainingSeconds?: number;
  statusLabel: string;
  conditionMet: boolean;
};

export type SeasonWinnerSnapshot = {
  playerId: string;
  playerName: string;
  crownedAt: number;
  objectiveId: SeasonVictoryPathId;
  objectiveName: string;
};

export type SeasonVictoryTrackerSnapshot = {
  objectiveId: SeasonVictoryPathId;
  leaderPlayerId?: string;
  leaderName?: string;
  holdStartedAt?: number;
};

export type SimulationSeasonState = {
  seasonId: string;
  seasonSequence: number;
  rulesetId: string;
  worldSeed: number;
  /** Map shape used to generate this season's world. Absent on seasons created
   *  before this field existed — callers must treat that as "continents",
   *  the historical hardcoded default, never the current env's map style. */
  mapStyle?: WorldStyle;
  status: SeasonLifecycleStatus;
  startedAt: number;
  endedAt?: number;
  winner?: SeasonWinnerSnapshot;
  victoryTrackers: SeasonVictoryTrackerSnapshot[];
};

export type WorldStatusSnapshot = {
  leaderboard: {
    overall: LeaderboardOverallEntry[];
    selfOverall?: LeaderboardOverallEntry;
    selfByTiles?: LeaderboardMetricEntry;
    selfByIncome?: LeaderboardMetricEntry;
    selfByTechs?: LeaderboardMetricEntry;
    byTiles: LeaderboardMetricEntry[];
    byIncome: LeaderboardMetricEntry[];
    byTechs: LeaderboardMetricEntry[];
  };
  seasonVictory: SeasonVictoryObjectiveSnapshot[];
  seasonWinner?: SeasonWinnerSnapshot;
  acceptLatencyP95Ms?: number;
};

export type CurrentSeasonSummary = {
  season: string;
  seasonId: string;
  seasonSequence: number;
  status: SeasonLifecycleStatus;
  startedAt: number;
  endedAt?: number;
  worldSeed: number;
  rulesetId: string;
  seasonWinner?: SeasonWinnerSnapshot;
  leaderboard: WorldStatusSnapshot["leaderboard"];
  overall: LeaderboardOverallEntry[];
  byTiles: LeaderboardMetricEntry[];
  byIncome: LeaderboardMetricEntry[];
  byTechs: LeaderboardMetricEntry[];
  seasonVictory: SeasonVictoryObjectiveSnapshot[];
  onlinePlayers: number;
  totalPlayers: number;
  townCount: number;
  updatedAt: number;
};

export type SeasonArchiveRow = {
  seasonId: string;
  seasonSequence: number;
  endedAt: number;
  updatedAt: number;
  winner?: SeasonWinnerSnapshot;
  mostTerritory: Array<{ playerId: string; playerName: string; value: number }>;
  mostPoints: Array<{ playerId: string; playerName: string; value: number }>;
  longestSurvivalMs: Array<{ playerId: string; playerName: string; value: number }>;
  replayEvents: Array<Record<string, unknown>>;
};

export type SimulationEvent =
  | {
      eventType: "COMMAND_ACCEPTED";
      commandId: string;
      playerId: string;
      actionType: FrontierCombatActionType;
      originX: number;
      originY: number;
      targetX: number;
      targetY: number;
      resolvesAt: number;
      combatResult?: LockedFrontierCombatResult;
    }
  | {
      eventType: "COMMAND_REJECTED";
      commandId: string;
      playerId: string;
      code: string;
      message: string;
    }
  | {
      eventType: "COMBAT_CANCELLED";
      commandId: string;
      playerId: string;
      count: number;
      cancelledCommandIds?: string[];
    }
  | {
      eventType: "COMBAT_RESOLVED";
      commandId: string;
      playerId: string;
      actionType: FrontierCombatActionType;
      originX: number;
      originY: number;
      targetX: number;
      targetY: number;
      attackerWon: boolean;
      manpowerDelta?: number;
      pillagedGold?: number;
      pillagedStrategic?: Partial<Record<StrategicResourceKey, number>>;
      combatResult?: LockedFrontierCombatResult;
    }
  | {
      eventType: "COLLECT_RESULT";
      commandId: string;
      playerId: string;
      mode: "visible" | "tile";
      x?: number;
      y?: number;
      tiles: number;
      gold: number;
      strategic: Partial<Record<StrategicResourceKey, number>>;
    }
  | {
      eventType: "TILE_DELTA_BATCH";
      commandId: string;
      playerId: string;
      goldCost?: number;
      playerManpower?: number;
      tileDeltas: Array<{
        x: number;
        y: number;
        terrain?: "LAND" | "SEA" | "COASTAL_SEA" | "MOUNTAIN" | undefined;
        resource?: string | undefined;
        dockId?: string | undefined;
        ownerId?: string | undefined;
        ownershipState?: string | undefined;
        frontierDecayAt?: number | undefined;
        frontierDecayKind?: "NATURAL" | "ENCIRCLEMENT" | undefined;
        breachShockUntil?: number | undefined;
        townJson?: string | undefined;
        townType?: "MARKET" | "FARMING";
        townName?: string | undefined;
        townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
        fortJson?: string | undefined;
        observatoryJson?: string | undefined;
        siegeOutpostJson?: string | undefined;
        economicStructureJson?: string | undefined;
        sabotageJson?: string | undefined;
        shardSiteJson?: string | undefined;
        musterJson?: string | undefined;
        /** Fog-of-war authority tag — see VisibilityState in @border-empires/shared. */
        visibilityState?: VisibilityState | undefined;
        yield?: { gold?: number; strategic?: Partial<Record<StrategicResourceKey, number>> } | undefined;
        yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<StrategicResourceKey, number>> } | undefined;
        yieldCap?: { gold: number; strategicEach: number } | undefined;
        ownershipClearOnly?: boolean | undefined;
      }>;
    }
  | {
      eventType: "TILE_YIELD_ANCHOR_UPDATED";
      commandId: string;
      playerId: string;
      tileKey: string;
      collectedAt: number;
    }
  | {
      // Batched form for upkeep accrual: at non-trivial empire sizes the
      // per-tile UPDATED variant emits dozens-to-hundreds of events per
      // upkeep tick, each becoming a separate SQLite appendEvent. That
      // queue backlog has been observed to block the main event loop for
      // 25s+ at only ~2,000 owned tiles (well under 1% of the 450x450
      // map). Single batch event = single appendEvent.
      eventType: "TILE_YIELD_ANCHOR_BATCH";
      commandId: string;
      playerId: string;
      anchors: Array<{ tileKey: string; collectedAt: number }>;
    }
  | {
      eventType: "PLAYER_YIELD_COLLECTION_EPOCH_UPDATED";
      commandId: string;
      playerId: string;
      collectedAt: number;
    }
  | {
      eventType: "SETTLEMENT_STARTED";
      commandId: string;
      playerId: string;
      tileKey: string;
      startedAt: number;
      resolvesAt: number;
      goldCost: number;
    }
  | {
      eventType: "TECH_UPDATE";
      commandId: string;
      playerId: string;
      payloadJson: string;
    }
  | {
      eventType: "DOMAIN_UPDATE";
      commandId: string;
      playerId: string;
      payloadJson: string;
    }
  | {
      eventType: "PLAYER_MESSAGE";
      commandId: string;
      playerId: string;
      messageType: string;
      payloadJson: string;
    }
  | {
      /** Barbarian ate a non-barb player tile (gain > 0) but did not multiply —
       *  either progress below threshold or population cap blocking. */
      eventType: "BARB_ATE_TILE";
      commandId: string;
      playerId: string;
      originKey: string;
      targetKey: string;
      eatenOwnerId: string;
      eatenResource: string | null;
      eatenHasTown: boolean;
      gain: number;
      sourceProgress: number;
      newProgress: number;
      capBlocked: boolean;
    }
  | {
      /** Barbarian multiplied: origin tile kept, target tile also kept, net +1. */
      eventType: "BARB_MULTIPLIED";
      commandId: string;
      playerId: string;
      originKey: string;
      targetKey: string;
      eatenOwnerId: string | null;
      eatenResource: string | null;
      eatenHasTown: boolean;
      gain: number;
      sourceProgress: number;
      barbTileCount: number;
    };

export type PlayerSubscriptionDock = {
  dockId: string;
  tileKey: string;
  pairedDockId: string;
  connectedDockIds?: string[];
};

export type PlayerSubscriptionSnapshot = {
  playerId: string;
  player?: {
    id: string;
    name?: string;
    gold: number;
    manpower: number;
    manpowerCap: number;
    manpowerRegenPerMinute?: number;
    logisticsThroughputPerMinute?: number;
    manpowerBreakdown?: ManpowerBreakdown;
    incomePerMinute: number;
    strategicResources: Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>;
    strategicProductionPerMinute: Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>;
    economyBreakdown?: Record<string, unknown>;
    upkeepPerMinute?: { food: number; iron: number; supply: number; crystal: number; gold: number };
    upkeepLastTick?: Record<string, unknown>;
    developmentProcessLimit: number;
    activeDevelopmentProcessCount: number;
    pendingSettlements: Array<{ x: number; y: number; startedAt: number; resolvesAt: number }>;
    autoSettlementQueue?: Array<{ x: number; y: number }>;
    techIds: string[];
    domainIds: string[];
    // Locked sub-choice for domains that ask the player to pick a resource
    // (Clockwork Stipend). Persisted with the player snapshot so the choice
    // survives reconnects and snapshot replays. Narrow type comes from
    // @border-empires/shared so client and sim can't drift on which keys
    // count as valid trickle picks.
    chosenTrickleResource?: ChosenTrickleResource;
    // Emperor-endorsement bonus (galaxy meta-layer Phase 1): remaining
    // Imperial Ward activations. The active 10-minute invulnerability window
    // itself is communicated via a one-off IMPERIAL_WARD_ACTIVATED player
    // message, not this snapshot field (same convention as Aegis Lock).
    imperialWardCharges?: number;
    mods?: Record<"attack" | "defense" | "income" | "vision", number>;
    modBreakdown?: Record<"attack" | "defense" | "income" | "vision", Array<{ label: string; mult: number }>>;
  };
  worldStatus?: WorldStatusSnapshot;
  season?: SimulationSeasonState;
  docks?: PlayerSubscriptionDock[];
  respawnNotice?: PlayerRespawnNotice;
  tiles: Array<{
    x: number;
    y: number;
    terrain?: "LAND" | "SEA" | "COASTAL_SEA" | "MOUNTAIN" | undefined;
    resource?: string | undefined;
    dockId?: string | undefined;
    ownerId?: string | undefined;
    ownershipState?: string | undefined;
    frontierDecayAt?: number | undefined;
    frontierDecayKind?: "NATURAL" | "ENCIRCLEMENT" | undefined;
    breachShockUntil?: number | undefined;
    townJson?: string | undefined;
    townType?: "MARKET" | "FARMING";
    townName?: string | undefined;
    townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
    fortJson?: string | undefined;
    observatoryJson?: string | undefined;
    siegeOutpostJson?: string | undefined;
    economicStructureJson?: string | undefined;
    sabotageJson?: string | undefined;
    shardSiteJson?: string | undefined;
    musterJson?: string | undefined;
    /** Fog-of-war authority tag — see VisibilityState in @border-empires/shared. */
    visibilityState?: VisibilityState | undefined;
    yield?: { gold?: number; strategic?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>> } | undefined;
    yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>> } | undefined;
    yieldCap?: { gold: number; strategicEach: number } | undefined;
    // Broadcast-only ghost-ownership cleanup marker (see
    // tile-delta-visibility-filter.ts). Rides on a delta only; never a
    // persisted tile field. applyTileDeltasToSnapshot uses it to avoid
    // inserting phantom non-visible tiles into the cached snapshot.
    ownershipClearOnly?: boolean | undefined;
  }>;
};

export type StartNextSeasonResponse = {
  ok: boolean;
  seasonId: string;
};

export const SIMULATION_PROTO_PATH = new URL("./simulation.proto", import.meta.url);

export * from "./snapshot-diagnostics/snapshot-diagnostics.js";
