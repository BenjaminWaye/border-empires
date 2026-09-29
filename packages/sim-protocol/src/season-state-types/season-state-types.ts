import type { MonumentalStructureType, WorldStyle } from "@border-empires/shared";
import type { GalaxySpecialization } from "../galaxy-specialization.js";

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
  // Bounded per-player score-over-time samples for the season-end screen's
  // score graph, captured once at crowning from the live in-memory sampler
  // (see score-history-sampler.ts) so a reconnecting/late-joining client
  // still gets the full graph via INIT rather than only the live broadcast.
  scoreHistory?: ScoreHistorySeries[];
};

export type ScoreHistoryPoint = { t: number; score: number };

export type ScoreHistorySeries = {
  playerId: string;
  playerName: string;
  points: ScoreHistoryPoint[];
};

export type SeasonVictoryTrackerSnapshot = {
  objectiveId: SeasonVictoryPathId;
  leaderPlayerId?: string;
  leaderName?: string;
  holdStartedAt?: number;
};

// Galactic meta-layer (docs/galactic-campaign-design.md §3): the record given
// to every competitive player who did NOT win the season outright, one entry
// per player, computed once at the moment a winner is crowned (see
// updateSeasonVictoryTrackers / season-galaxy-tiers.ts). OUTPOST is a minor
// permanent holding (specialization set); STIPEND is a one-time Inf/Prod
// payout with no territory (influence/production set, no specialization).
export type SeasonGalaxyTierSnapshot = {
  playerId: string;
  playerName: string;
  tier: "OUTPOST" | "STIPEND";
  specialization?: GalaxySpecialization;
  influence?: number;
  production?: number;
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
  /** Worldgen algorithm version this season was generated under (see
   *  CURRENT_WORLDGEN_VERSION / worldgenVersion in @border-empires/shared).
   *  Must be re-passed to setWorldSeed on every resume/render so a season
   *  keeps reproducing its original terrain instead of drifting whenever the
   *  worldgen algorithm changes later. Absent on seasons created before this
   *  field existed — callers must treat that as version 1 (setWorldSeed's own
   *  default), never "latest". */
  worldgenVersion?: number;
  status: SeasonLifecycleStatus;
  startedAt: number;
  endedAt?: number;
  /** Set when this season was created with a future start time and is
   *  currently `"pending"`. Absent once the season is `"active"`/`"ended"`
   *  or if it was never gated on a scheduled start. */
  scheduledStartAt?: number;
  winner?: SeasonWinnerSnapshot;
  /** Outpost/Stipend tier records for every non-winning competitive player,
   *  computed once at the moment `winner` is crowned (§3 of
   *  docs/galactic-campaign-design.md). Absent before crowning and on seasons
   *  archived before this field existed. */
  galaxyTiers?: SeasonGalaxyTierSnapshot[];
  victoryTrackers: SeasonVictoryTrackerSnapshot[];
  /** Player ids that have explicitly joined this season (via JoinSeason),
   *  distinct from ids merely known to the runtime (e.g. AI/barbarian seed
   *  players, which are never added here). Absent/undefined on seasons
   *  persisted before this field existed — callers must treat that as "no
   *  membership recorded" rather than "nobody has joined". */
  joinedPlayerIds?: string[];
  /** Joined players who joined as guests (Firebase anonymous accounts).
   *  Counted against the guest allowance inside the season cap; a player is
   *  removed once they log in with a real account. */
  guestPlayerIds?: string[];
  /** Galactic meta-layer (docs/galactic-campaign-design.md §7/§11): set when
   *  this season was auto-scheduled as a Defense Campaign for a specific,
   *  previously-awarded galaxy territory (identified by that territory's
   *  *original* seasonId) rather than a fresh Frontier Sector. Structurally
   *  identical to any other season -- open to anyone, no incumbent bonus --
   *  this field only matters at the gateway's galaxy layer, which reads it
   *  off the archived row once the season ends to transfer that territory's
   *  ownership to whoever won this one, instead of minting a new Planet for
   *  this season's own (otherwise-irrelevant) seasonId. */
  defenseCampaignTargetSeasonId?: string;
};

export type SeasonStats = {
  mostDeadlyTile?: { x: number; y: number; manpowerLost: number };
  longestRoad?: { tileCount: number };
};
