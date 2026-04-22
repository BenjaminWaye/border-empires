import { z } from "zod";
import { DurableCommandTypeSchema, type DurableCommandType } from "@border-empires/client-protocol";
import {
  ACCEPTANCE_RESOLUTION_COMMAND_TYPES as ACCEPTANCE_RESOLUTION_COMMAND_TYPES_UNTYPED,
  RECONNECT_COMMAND_TYPES as RECONNECT_COMMAND_TYPES_UNTYPED,
  RESTART_PARITY_COMMAND_TYPES as RESTART_PARITY_COMMAND_TYPES_UNTYPED
} from "./command-coverage-sets.js";

export const CommandEnvelopeSchema = z.object({
  commandId: z.string().min(1),
  sessionId: z.string().min(1),
  playerId: z.string().min(1),
  clientSeq: z.number().int().nonnegative(),
  issuedAt: z.number().int().nonnegative(),
  type: DurableCommandTypeSchema,
  payloadJson: z.string()
});

export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;

export const DURABLE_COMMAND_TYPES = [...DurableCommandTypeSchema.options] as readonly DurableCommandType[];

export const RESTART_PARITY_COMMAND_TYPES = RESTART_PARITY_COMMAND_TYPES_UNTYPED as readonly DurableCommandType[];
export const ACCEPTANCE_RESOLUTION_COMMAND_TYPES = ACCEPTANCE_RESOLUTION_COMMAND_TYPES_UNTYPED as readonly DurableCommandType[];
export const RECONNECT_COMMAND_TYPES = RECONNECT_COMMAND_TYPES_UNTYPED as readonly DurableCommandType[];

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

type SeasonVictoryPathId =
  | "TOWN_CONTROL"
  | "SETTLED_TERRITORY"
  | "ECONOMIC_HEGEMONY"
  | "RESOURCE_MONOPOLY"
  | "CONTINENT_FOOTPRINT";

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
  acceptLatencyP95Ms?: number;
};

export type SimulationEvent =
  | {
      eventType: "COMMAND_ACCEPTED";
      commandId: string;
      playerId: string;
      actionType: "ATTACK" | "EXPAND" | "BREAKTHROUGH_ATTACK";
      originX: number;
      originY: number;
      targetX: number;
      targetY: number;
      resolvesAt: number;
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
    }
  | {
      eventType: "COMBAT_RESOLVED";
      commandId: string;
      playerId: string;
      actionType: "ATTACK" | "EXPAND" | "BREAKTHROUGH_ATTACK";
      originX: number;
      originY: number;
      targetX: number;
      targetY: number;
      attackerWon: boolean;
      manpowerDelta?: number;
      pillagedGold?: number;
      pillagedStrategic?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
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
      strategic: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
    }
  | {
      eventType: "TILE_DELTA_BATCH";
      commandId: string;
      playerId: string;
      tileDeltas: Array<{
        x: number;
        y: number;
        terrain?: "LAND" | "SEA" | "MOUNTAIN" | undefined;
        resource?: string | undefined;
        dockId?: string | undefined;
        ownerId?: string | undefined;
        ownershipState?: string | undefined;
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
        yield?: { gold?: number; strategic?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> } | undefined;
        yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> } | undefined;
        yieldCap?: { gold: number; strategicEach: number } | undefined;
      }>;
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
    };

export type PlayerSubscriptionSnapshot = {
  playerId: string;
  player?: {
    id: string;
    name?: string;
    gold: number;
    manpower: number;
    manpowerCap: number;
    incomePerMinute: number;
    strategicResources: Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>;
    strategicProductionPerMinute: Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>;
    economyBreakdown?: Record<string, unknown>;
    upkeepPerMinute?: { food: number; iron: number; supply: number; crystal: number; oil: number; gold: number };
    upkeepLastTick?: Record<string, unknown>;
    developmentProcessLimit: number;
    activeDevelopmentProcessCount: number;
    pendingSettlements: Array<{ x: number; y: number; startedAt: number; resolvesAt: number }>;
    techIds: string[];
    domainIds: string[];
  };
  worldStatus?: WorldStatusSnapshot;
  tiles: Array<{
    x: number;
    y: number;
    terrain?: "LAND" | "SEA" | "MOUNTAIN" | undefined;
    resource?: string | undefined;
    dockId?: string | undefined;
    ownerId?: string | undefined;
    ownershipState?: string | undefined;
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
    yield?: { gold?: number; strategic?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> } | undefined;
    yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> } | undefined;
    yieldCap?: { gold: number; strategicEach: number } | undefined;
  }>;
};

export const SIMULATION_PROTO_PATH = new URL("./simulation.proto", import.meta.url);
