import { z } from "zod";
import { DurableCommandTypeSchema, type DurableCommandType } from "@border-empires/client-protocol";
import type { ChosenTrickleResource, FrontierDecayKind, PlayerRespawnNotice, SlotResource, VisibilityState, WaypointWireStep } from "@border-empires/shared";
import {
  ACCEPTANCE_RESOLUTION_COMMAND_TYPES as ACCEPTANCE_RESOLUTION_COMMAND_TYPES_UNTYPED,
  RECONNECT_COMMAND_TYPES as RECONNECT_COMMAND_TYPES_UNTYPED,
  RESTART_PARITY_COMMAND_TYPES as RESTART_PARITY_COMMAND_TYPES_UNTYPED
} from "./command-coverage-sets/command-coverage-sets.js";
import type {
  ScoreHistorySeries,
  SeasonGalaxyTierSnapshot,
  SeasonLifecycleStatus,
  SeasonStats,
  SeasonVictoryObjectiveSnapshot,
  SeasonWinnerSnapshot,
  SimulationSeasonState
} from "./season-state-types/season-state-types.js";

// DEV_QUEUE_*/WAYPOINT_* now live on DurableCommandTypeSchema itself (see
// @border-empires/client-protocol) now that the gateway forwards them like
// any other durable command -- no separate literals needed here.
const SimulationCommandTypeSchema = z.union([
  DurableCommandTypeSchema,
  z.literal("SYNC_ALLIANCE"),
  z.literal("SYNC_TRUCE"),
  z.literal("WATCH_MUSTER"),
  z.literal("UNWATCH_MUSTER"),
  // Gateway-forwarded, never persisted: releases stranded frontier tiles in the chunk a player is viewing.
  z.literal("CHECK_STRANDED_REGION")
]);

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

export type StrategicResourceKey = "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD";
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
  manpowerCap: number;
  score: number; rank: number;
};

export type LeaderboardMetricEntry = {
  id: string;
  name: string;
  value: number;
  rank: number;
};

export * from "./season-state-types/season-state-types.js";

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
  shardRainNotice?: Record<string, unknown>;
};

export type CurrentSeasonSummary = {
  season: string;
  seasonId: string;
  seasonSequence: number;
  status: SeasonLifecycleStatus;
  startedAt: number;
  endedAt?: number;
  worldSeed: number;
  /** See SimulationSeasonState.worldWidth/worldHeight; absent = unknown. */
  worldWidth?: number;
  worldHeight?: number;
  rulesetId: string;
  seasonWinner?: SeasonWinnerSnapshot;
  seasonGalaxyTiers?: SeasonGalaxyTierSnapshot[];
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
  seasonStats?: SeasonStats;
  // Live in-memory score-history samples for the current season (see
  // score-history-sampler.ts). Not persisted on CurrentSeasonSummary itself
  // (it is a pure activity feed, rebuilt on restart) -- once the season ends
  // the authoritative copy lives on seasonWinner.scoreHistory instead.
  scoreHistory?: ScoreHistorySeries[];
  defenseCampaignTargetSeasonId?: string;
};

export type SeasonArchiveRow = {
  seasonId: string;
  seasonSequence: number;
  endedAt: number;
  updatedAt: number;
  winner?: SeasonWinnerSnapshot;
  galaxyTiers?: SeasonGalaxyTierSnapshot[];
  mostTerritory: Array<{ playerId: string; playerName: string; value: number }>;
  mostPoints: Array<{ playerId: string; playerName: string; value: number }>;
  longestSurvivalMs: Array<{ playerId: string; playerName: string; value: number }>;
  replayEvents: Array<Record<string, unknown>>;
  defenseCampaignTargetSeasonId?: string;
  seasonStats?: SeasonStats;
};

// One player's full-leaderboard snapshot (not top-N truncated, unlike
// SeasonArchiveRow's mostPoints/mostTerritory) at the end of a season they
// played -- backs career stats (seasons played, best rank) on the player
// profile. See season-participation-store.ts (apps/simulation).
export type SeasonParticipationRow = {
  seasonId: string;
  seasonSequence: number;
  playerId: string;
  playerName: string;
  rank: number;
  score: number;
  tiles: number;
  incomePerMinute: number;
  techs: number;
  endedAt: number;
};

// Moved to simulation-event.ts (this file is already over the file-line cap).
export type { SimulationEvent, CombatBroadcastPayload } from "./simulation-event.js";

// Galactic meta-layer: victory-path -> planet specialization mapping (§3 of
// docs/galactic-campaign-design.md). Kept in its own module, same reason.
export type { GalaxySpecialization } from "./galaxy-specialization.js";
export { GALAXY_SPECIALIZATION_NAME, specializationForVictoryPath } from "./galaxy-specialization.js";

export type { PlayerSubscriptionDock, PlayerSubscriptionSnapshot } from "./player-subscription-snapshot-types.js";

export type StartNextSeasonResponse = {
  ok: boolean;
  seasonId: string;
};

export const SIMULATION_PROTO_PATH = new URL("./simulation.proto", import.meta.url);

export * from "./snapshot-diagnostics/snapshot-diagnostics.js";
export * from "./subscription-snapshot-merge/subscription-snapshot-merge.js";
export * from "./admin-diagnostics-types.js";
export * from "./reconnect-passthrough-fields/reconnect-passthrough-fields.js";
