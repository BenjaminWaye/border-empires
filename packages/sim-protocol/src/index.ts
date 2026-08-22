import { z } from "zod";
import { DurableCommandTypeSchema, type DurableCommandType } from "@border-empires/client-protocol";
import type { ChosenTrickleResource, MonumentalStructureType, PlayerRespawnNotice, SlotResource, VisibilityState, WorldStyle } from "@border-empires/shared";
import {
  ACCEPTANCE_RESOLUTION_COMMAND_TYPES as ACCEPTANCE_RESOLUTION_COMMAND_TYPES_UNTYPED,
  RECONNECT_COMMAND_TYPES as RECONNECT_COMMAND_TYPES_UNTYPED,
  RESTART_PARITY_COMMAND_TYPES as RESTART_PARITY_COMMAND_TYPES_UNTYPED
} from "./command-coverage-sets/command-coverage-sets.js";

// DEV_QUEUE_*/WAYPOINT_* now live on DurableCommandTypeSchema itself (see
// @border-empires/client-protocol) now that the gateway forwards them like
// any other durable command -- no separate literals needed here.
const SimulationCommandTypeSchema = z.union([
  DurableCommandTypeSchema,
  z.literal("SYNC_ALLIANCE"),
  z.literal("SYNC_TRUCE"),
  z.literal("WATCH_MUSTER"),
  z.literal("UNWATCH_MUSTER")
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
  /**
   * FOOD/TITANIUM/CRYSTAL/UMBRITE run on the resource-slots pillar
   * (docs/manpower-economy-rewrite-plan.md §5): supply from settled resource
   * tiles vs. demand occupied by existing structures, not a spendable
   * stockpile — there is no banked quantity to report for these.
   */
  resourceSlotSupply: { FOOD: number; TITANIUM: number; CRYSTAL: number; UMBRITE: number };
  resourceSlotDemand: { FOOD: number; TITANIUM: number; CRYSTAL: number; UMBRITE: number };
  /** SHARD is the one strategic resource still a real banked stockpile. */
  shardStockpile: number;
  /** Persistent reach-border tile count granted to this player (see packages/shared/src/reach/reach.ts). */
  reachTiles: number;
  /** ownedTiles - settledTiles, i.e. FRONTIER-state tiles this player owns. */
  frontierTiles: number;
};

export type RecentCommand = {
  playerId: string;
  type: string;
  commandId: string;
  issuedAt: number;
};

export type GetRecentCommandsResponse = {
  ok: boolean;
  commands: RecentCommand[];
};

export type AiDecisionDiagnostic = {
  playerId: string;
  tick: number;
  canExpand: boolean;
  canAttack: boolean;
  scores: Record<string, number>;
  vetoes: Record<string, string | undefined>;
  frontierState: {
    neutralCount: number;
    economicCount: number;
    townSupportCount: number;
    scoutCount: number;
    enemyCount: number;
    barbarianCount: number;
  };
  points: number;
  manpower: number;
  devSlotAvailable: boolean;
  winner: string;
  winnerScore: number;
};

export type GetAiDecisionDiagnosticsResponse = {
  ok: boolean;
  diagnostics: AiDecisionDiagnostic[];
};

export type SeasonLifecycleStatus = "pending" | "active" | "ended";

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
  /** The current leader's progress toward this objective's win threshold, as a
   *  0..1 fraction (1 once conditionMet is true; clamped, never negative or
   *  above 1). Optional so older cached/broadcast objective snapshots that
   *  predate this field (see mergeSelfProgress/seasonVictoryForBroadcast in
   *  apps/simulation/src/season-victory-objectives) remain valid without a
   *  migration. Introduced for the galactic meta-layer's Outpost/Stipend
   *  tiering (docs/galactic-campaign-design.md §3), which needs a numeric
   *  progress measure — the existing progressLabel is display text only. */
  progress?: number;
};

// A point-in-time snapshot of the winning player's economy, taken at the
// moment they're crowned — the base "planet stats" carried forward once the
// planet is named (see galaxy-routes.ts).
export type SeasonWinnerStats = {
  ironPerMinute: number;
  goldPerMinute: number;
  supplyPerMinute: number;
  foodPerMinute: number;
  crystalPerMinute: number;
  totalPopulation: number;
  monumentalBuildings: Partial<Record<MonumentalStructureType, number>>;
};

export type SeasonWinnerSnapshot = {
  playerId: string;
  playerName: string;
  crownedAt: number;
  objectiveId: SeasonVictoryPathId;
  objectiveName: string;
  stats?: SeasonWinnerStats;
  // Deadliest-tile / longest-road misc stats, captured once at crowning time
  // and persisted with the winner so a reconnecting/late-joining client can
  // still see them on the season-end screen (they otherwise only ever went
  // out on the single GLOBAL_STATUS_UPDATE broadcast at crowning).
  seasonStats?: SeasonStats;
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
  /** Set when this season was created with a future start time and is
   *  currently `"pending"`. Absent once the season is `"active"`/`"ended"`
   *  or if it was never gated on a scheduled start. */
  scheduledStartAt?: number;
  winner?: SeasonWinnerSnapshot;
  victoryTrackers: SeasonVictoryTrackerSnapshot[];
  /** Player ids that have explicitly joined this season (via JoinSeason),
   *  distinct from ids merely known to the runtime (e.g. AI/barbarian seed
   *  players, which are never added here). Absent/undefined on seasons
   *  persisted before this field existed — callers must treat that as "no
   *  membership recorded" rather than "nobody has joined". */
  joinedPlayerIds?: string[];
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
  seasonStats?: SeasonStats;
};

export type SeasonStats = {
  mostDeadlyTile?: { x: number; y: number; manpowerLost: number };
  longestRoad?: { tileCount: number };
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

// Moved to simulation-event.ts (this file is already over the file-line cap).
export type { SimulationEvent, CombatBroadcastPayload } from "./simulation-event.js";

// Galactic meta-layer: victory-path -> planet specialization mapping (§3 of
// docs/galactic-campaign-design.md). Kept in its own module, same reason.
export type { GalaxySpecialization } from "./galaxy-specialization.js";
export { GALAXY_SPECIALIZATION_NAME, specializationForVictoryPath } from "./galaxy-specialization.js";

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
    strategicResources: Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>;
    strategicProductionPerMinute: Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>;
    // §5 (resource slots, docs/manpower-economy-rewrite-plan.md): global
    // per-resource supply/demand pool (§5.6 v1 scope) — the same numbers
    // hasFreeResourceSlots gates BUILD_STRUCTURE on server-side. Lets the
    // client check real slot availability for FOOD/TITANIUM/CRYSTAL/UMBRITE
    // instead of the retired stockpile amounts (§14.3).
    resourceSlots?: {
      supply: Record<SlotResource, number>;
      demand: Record<SlotResource, number>;
    };
    // §14.2: per-structure dormancy detail — which tile+field keys
    // ("x,y:fort"/"observatory"/"siegeOutpost"/"economicStructure") are
    // currently dormant, and which of their required resource(s) are short.
    // Feeds the client's greyed-out/"unpowered" structure indicator.
    dormantStructures?: Array<{ key: string; resources: SlotResource[] }>;
    economyBreakdown?: Record<string, unknown>;
    upkeepPerMinute?: { food: number; titanium: number; umbrite: number; crystal: number; gold: number };
    upkeepLastTick?: Record<string, unknown>;
    developmentProcessLimit: number;
    activeDevelopmentProcessCount: number;
    pendingSettlements: Array<{ x: number; y: number; startedAt: number; resolvesAt: number }>;
    autoSettlementQueue?: Array<{ x: number; y: number }>;
    // Server-durable dev/expand queue tail (see runtime-dev-queue.ts /
    // runtime-waypoint-queue.ts): drains on its own while the player is
    // disconnected, capped at DEV_QUEUE_SERVER_CAP each. Not restart-durable
    // (in-memory only, see PlayerRuntimeSummary) -- only survives the running
    // process's lifetime, not a process restart.
    devQueue?: Array<{ tileKey: string; x: number; y: number; kind: "SETTLE" | "BUILD"; structureType?: string; queuedAt: number }>;
    waypointQueue?: Array<{ x: number; y: number; trackBarbarian?: boolean; queuedAt: number }>;
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
    // Quickforge wonder: ms timestamp of this player's last discounted
    // rush-buy (0/absent = never used this UTC day). Sent purely so the
    // client's rush-buy price preview can replicate the server's exact
    // once-per-UTC-day discount gate (quickforgeAdjustedRushPrice in
    // @border-empires/shared) — the server remains authoritative on price.
    wonderLastFreeRushBuyAt?: number;
    // §20: durable "what happened while I was away" feed — distinct from the
    // ephemeral PLAYER_MESSAGE toast. Most-recent-last on the wire (matches
    // the server's append order); the client reverses for most-recent-first
    // display. type is a free string, not a union, so new event types the
    // server adds don't require a client-protocol version bump to deliver —
    // an unrecognized type just falls back to a generic icon client-side.
    eventLog?: Array<{ id: string; type: string; text: string; occurredAt: number; x?: number; y?: number }>;
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
    frontierDecayKind?: "ENCIRCLEMENT" | undefined;
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
    naturalWonderJson?: string | undefined;
    watchtowerJson?: string | undefined;
    musterJson?: string | undefined;
    /** Fog-of-war authority tag — see VisibilityState in @border-empires/shared. */
    visibilityState?: VisibilityState | undefined;
    yield?: { gold?: number; strategic?: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>> } | undefined;
    yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>> } | undefined;
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
