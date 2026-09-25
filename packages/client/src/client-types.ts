import type { FrontierDecayKind, MusterState, NaturalWonderType, ObservatorySiphonMode, Terrain, WaystationTileState } from "@border-empires/shared";
import type { ClientTownWireSummary } from "./client-tile-town-type.js";

export type OptimisticStructureKind =
  | "FORT"
  | "OBSERVATORY"
  | "SIEGE_OUTPOST"
  | "ASTRAL_DOCK_PART_1"
  | "ASTRAL_DOCK_PART_2"
  | "ASTRAL_DOCK_PART_3"
  | "ASTRAL_DOCK"
  | "FARMSTEAD"
  | "WATERWORKS"
  | "UMBRITE_RIG"
  | "MINE"
  | "MINTWORKS"
  | "GRANARY"
  | "CENSUS_HALL"
  | "CLEARING_HOUSE"
  | "AIRPORT"
  | "AETHER_TOWER"
  | "WOODEN_FORT"
  | "RELAY_BEACON"
  | "UMBRITE_SYNTHESIZER"
  | "ADVANCED_UMBRITE_SYNTHESIZER"
  | "TITANIUM_WORKS"
  | "ADVANCED_TITANIUM_WORKS"
  | "CRYSTAL_SYNTHESIZER"
  | "ADVANCED_CRYSTAL_SYNTHESIZER"
  | "CARAVANARY"
  | "FOUNDRY"
  | "GARRISON_HALL"
  | "CUSTOMS_HOUSE"
  | "RAIL_DEPOT"
  | "GOVERNORS_OFFICE"
  | "RADAR_SYSTEM"
  | "QUARTERMASTERS_OFFICE"
  | "LOGISTICS_GUILD"
  | "ASSEMBLY_WORKS"
  | "IMPERIAL_EXCHANGE_PART_1"
  | "IMPERIAL_EXCHANGE_PART_2"
  | "IMPERIAL_EXCHANGE_PART_3"
  | "WORLD_ENGINE_PART_1"
  | "WORLD_ENGINE_PART_2"
  | "WORLD_ENGINE_PART_3"
  | "AEGIS_DOME_PART_1"
  | "AEGIS_DOME_PART_2"
  | "AEGIS_DOME_PART_3"
  | "POPULATION_BUREAU_PART_1"
  | "POPULATION_BUREAU_PART_2"
  | "POPULATION_BUREAU_PART_3"
  | "TITANIUM_LEVY_PART_1"
  | "TITANIUM_LEVY_PART_2"
  | "TITANIUM_LEVY_PART_3"
  | "IMPERIAL_EXCHANGE"
  | "WORLD_ENGINE" | "AEGIS_DOME"
  | "POPULATION_BUREAU"
  | "TITANIUM_LEVY"
  | "WEAPONS_WORKSHOP"
  | "TITANIUM_WEAPONS_FACTORY"
  | "UMBRITE_WEAPONS_FACTORY";

export type TileUpkeepEntry = {
  label: string;
  perMinute: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "GOLD", number>>;
};

export type Tile = {
  x: number;
  y: number;
  terrain: Terrain;
  detailLevel?: "summary" | "full";
  fogged?: boolean;
  resource?: string;
  ownerId?: string;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
  /** Persistent-border reach owner (Runtime.reachBorder on the server), independent of ownerId/ownershipState. */
  reachOwnerId?: string;
  capital?: boolean;
  breachShockUntil?: number;
  frontierDecayAt?: number;
  frontierDecayKind?: FrontierDecayKind;
  clusterId?: string;
  clusterType?: string;
  landBiome?: "GRASS" | "SAND" | "COASTAL_SAND" | "TUNDRA";
  regionType?: "FERTILE_PLAINS" | "BROKEN_HIGHLANDS" | "DEEP_FOREST" | "ANCIENT_HEARTLAND" | "CRYSTAL_WASTES";
  dockId?: string;
  townType?: "MARKET" | "FARMING";
  townName?: string;
  townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
  // Set true when a town payload arrived but failed the renderable gate (population missing or below MIN_RENDERABLE_TOWN_POPULATION); the overview pane keys its spinner state off this, not townType presence.
  townDataPartial?: boolean;
  dock?: {
    baseGoldPerMinute: number;
    goldPerMinute: number;
    connectedDockCount: number;
    modifiers?: Array<{
      label: string;
      percent: number;
      deltaGoldPerMinute: number;
    }>;
  };
  shardSite?: {
    kind: "CACHE" | "FALL";
    amount: number;
    expiresAt?: number;
  } | null;
  watchtower?: { activated: boolean; activatedByPlayerId?: string; revealUntil?: number } | null; waystation?: WaystationTileState | null; // Watchtower site (server-worldgen-watchtowers.ts; revealUntil = ~10s post-activation flicker window) and Waystation site (server-worldgen-waystations.ts; permanent activation, no revealUntil -- grantedEffect/detail fields read by client-waystation-activation/'s result popup).
  naturalWonder?: { type: NaturalWonderType; claimedAt?: number } | null;
  town?: ClientTownWireSummary;
  fort?: {
    ownerId: string;
    status: "under_construction" | "active" | "removing";
    variant?: "FORT" | "TITANIUM_BASTION" | "THUNDER_BASTION" | "WOODEN_FORT";
    completesAt?: number;
    disabledUntil?: number;
  };
  observatory?: { ownerId: string; status: "under_construction" | "active" | "inactive" | "removing"; completesAt?: number; cooldownUntil?: number; siphon?: ObservatorySiphonMode };
  siegeOutpost?: {
    ownerId: string;
    status: "under_construction" | "active" | "removing";
    variant?: "SIEGE_OUTPOST" | "SIEGE_TOWER" | "DREAD_TOWER";
    completesAt?: number;
  };
  economicStructure?: {
    ownerId: string;
    type:
      | "FARMSTEAD"
      | "WATERWORKS"
      | "UMBRITE_RIG"
      | "MINE"
      | "MINTWORKS"
      | "GRANARY"
      | "CENSUS_HALL"
      | "CLEARING_HOUSE"
      | "AIRPORT"
      | "AETHER_TOWER"
      | "WOODEN_FORT"
      | "RELAY_BEACON"
      | "UMBRITE_SYNTHESIZER"
      | "ADVANCED_UMBRITE_SYNTHESIZER"
      | "TITANIUM_WORKS"
      | "ADVANCED_TITANIUM_WORKS"
      | "CRYSTAL_SYNTHESIZER"
      | "ADVANCED_CRYSTAL_SYNTHESIZER"
      | "CARAVANARY"
      | "FOUNDRY"
      | "GARRISON_HALL"
      | "CUSTOMS_HOUSE"
      | "RAIL_DEPOT"
      | "GOVERNORS_OFFICE"
      | "RADAR_SYSTEM"
      | "QUARTERMASTERS_OFFICE"
      | "LOGISTICS_GUILD"
      | "ASSEMBLY_WORKS"
      | "ASTRAL_DOCK_PART_1"
      | "ASTRAL_DOCK_PART_2"
      | "ASTRAL_DOCK_PART_3"
      | "ASTRAL_DOCK"
      | "IMPERIAL_EXCHANGE_PART_1"
      | "IMPERIAL_EXCHANGE_PART_2"
      | "IMPERIAL_EXCHANGE_PART_3"
      | "WORLD_ENGINE_PART_1"
      | "WORLD_ENGINE_PART_2"
      | "WORLD_ENGINE_PART_3"
      | "AEGIS_DOME_PART_1"
      | "AEGIS_DOME_PART_2"
      | "AEGIS_DOME_PART_3"
      | "POPULATION_BUREAU_PART_1"
      | "POPULATION_BUREAU_PART_2"
      | "POPULATION_BUREAU_PART_3"
      | "TITANIUM_LEVY_PART_1"
      | "TITANIUM_LEVY_PART_2"
      | "TITANIUM_LEVY_PART_3"
      | "IMPERIAL_EXCHANGE"
      | "WORLD_ENGINE"
      | "AEGIS_DOME"
      | "POPULATION_BUREAU"
      | "TITANIUM_LEVY"
      | "WEAPONS_WORKSHOP"
      | "TITANIUM_WEAPONS_FACTORY"
      | "UMBRITE_WEAPONS_FACTORY";
    status: "under_construction" | "active" | "inactive" | "removing";
    completesAt?: number;
    disabledUntil?: number;
    inactiveReason?: "manual" | "upkeep";
    converterMode?: "SYNTHESIZE" | "EXCHANGE"; modeLockedUntil?: number; powered?: boolean; bombardCooldownUntil?: number;
  };
  upkeepEntries?: TileUpkeepEntry[];
  sabotage?: { ownerId: string; endsAt: number; outputMultiplier: number; observatoryTileKey?: string };
  history?: {
    lastOwnerId?: string | null;
    previousOwners: string[];
    captureCount: number;
    lastCapturedAt?: number | null;
    lastStructureType?:
      | "FORT"
      | "SIEGE_OUTPOST"
      | "OBSERVATORY"
      | "FARMSTEAD"
      | "WATERWORKS"
      | "UMBRITE_RIG"
      | "MINE"
      | "MINTWORKS"
      | "GRANARY"
      | "CENSUS_HALL"
      | "CLEARING_HOUSE"
      | "AIRPORT"
      | "WOODEN_FORT"
      | "RELAY_BEACON"
      | "UMBRITE_SYNTHESIZER"
      | "ADVANCED_UMBRITE_SYNTHESIZER"
      | "TITANIUM_WORKS"
      | "ADVANCED_TITANIUM_WORKS"
      | "CRYSTAL_SYNTHESIZER"
      | "ADVANCED_CRYSTAL_SYNTHESIZER"
      | "CARAVANARY"
      | "FOUNDRY"
      | "GARRISON_HALL"
      | "CUSTOMS_HOUSE"
      | "RAIL_DEPOT"
      | "GOVERNORS_OFFICE"
      | "RADAR_SYSTEM"
      | "ASTRAL_DOCK_PART_1"
      | "ASTRAL_DOCK_PART_2"
      | "ASTRAL_DOCK_PART_3"
      | "ASTRAL_DOCK"
      | null;
    structureHistory: Array<
      | "FORT"
      | "SIEGE_OUTPOST"
      | "OBSERVATORY"
      | "FARMSTEAD"
      | "WATERWORKS"
      | "UMBRITE_RIG"
      | "MINE"
      | "MINTWORKS"
      | "GRANARY"
      | "CENSUS_HALL"
      | "CLEARING_HOUSE"
      | "AIRPORT"
      | "WOODEN_FORT"
      | "RELAY_BEACON"
      | "UMBRITE_SYNTHESIZER"
      | "ADVANCED_UMBRITE_SYNTHESIZER"
      | "TITANIUM_WORKS"
      | "ADVANCED_TITANIUM_WORKS"
      | "CRYSTAL_SYNTHESIZER"
      | "ADVANCED_CRYSTAL_SYNTHESIZER"
      | "CARAVANARY"
      | "FOUNDRY"
      | "GARRISON_HALL"
      | "CUSTOMS_HOUSE"
      | "RAIL_DEPOT"
      | "GOVERNORS_OFFICE"
      | "RADAR_SYSTEM"
      | "ASTRAL_DOCK_PART_1"
      | "ASTRAL_DOCK_PART_2"
      | "ASTRAL_DOCK_PART_3"
      | "ASTRAL_DOCK"
    >;
    wasMountainCreatedByPlayer?: boolean;
    wasMountainRemovedByPlayer?: boolean;
  };
  yield?: { gold?: number; strategic?: Record<string, number> };
  yieldRate?: { goldPerMinute?: number; strategicPerDay?: Record<string, number> };
  yieldCap?: { gold: number; strategicEach: number };
  optimisticPending?: "expand" | "settle" | "structure_build" | "structure_cancel" | "structure_remove";
  muster?: MusterState;
  /** Automated Fabrication Complex (Phase 6, docs/manifest-tree-mapping-plan.md). */
  afc?: { ownerId: string; status: "active" | "inactive"; activatedAt?: number };
};

export type SeasonVictoryObjectiveView = {
  id: "TOWN_CONTROL" | "ECONOMIC_HEGEMONY" | "RESOURCE_MONOPOLY" | "MARITIME_SUPREMACY" | "DIPLOMATIC_DOMINANCE";
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

export type TileTimedProgress = {
  startAt: number;
  resolvesAt: number;
  target: { x: number; y: number };
  awaitingServerConfirm?: boolean;
  confirmRefreshRequestedAt?: number;
};

export type EmpireVisualStyle = {
  primaryOverlay: string;
  secondaryTint: "TITANIUM" | "UMBRITE" | "FOOD" | "CRYSTAL" | "BALANCED";
  borderStyle: "SHARP" | "HEAVY" | "GLOW" | "DASHED" | "SOFT";
  structureAccent: "TITANIUM" | "UMBRITE" | "FOOD" | "CRYSTAL" | "NEUTRAL";
};

export type AllianceRequest = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt?: number;
  fromName?: string;
  toName?: string;
};

export type ActiveAllianceBreakView = {
  otherPlayerId: string;
  otherPlayerName: string;
  startedAt: number;
  endsAt: number;
  createdByPlayerId: string;
};

export type RecentAllianceBreakView = ActiveAllianceBreakView & {
  finalizedAt: number;
};

export type TruceRequest = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt: number;
  durationHours: 12 | 24;
  fromName?: string;
  toName?: string;
};

export type ActiveTruceView = {
  otherPlayerId: string;
  otherPlayerName: string;
  startedAt: number;
  endsAt: number;
  createdByPlayerId: string;
};
export type { TruceBreakView } from "./client-player-profile/client-player-profile-types.js";
export type PlayerRespawnReasonCode = "eliminated" | "auth_recovery" | "startup_recovery";
export type PlayerRespawnNotice = {
  id: string;
  at: number;
  reasonCode: PlayerRespawnReasonCode;
  title: string;
  summary: string;
  detail: string;
  triggerEvent: string;
  playerId: string;
  playerName: string;
  previousTerritoryTiles: number;
  previousTerritoryStrength: number;
  previousExposure: number;
  wasEliminated: boolean;
  respawnPending: boolean;
  wasOnline?: boolean;
  previousHomeTileKey?: string;
  spawnTileKey?: string;
};

export type ActiveAetherBridgeView = {
  bridgeId: string;
  ownerId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  startedAt: number;
  endsAt: number;
};

export type ActiveAetherWallView = {
  wallId: string;
  ownerId: string;
  origin: { x: number; y: number };
  direction: "N" | "E" | "S" | "W";
  length: 1 | 2 | 3;
  startedAt: number;
  endsAt: number;
};

export type RevealEmpireStatsView = {
  playerId: string;
  playerName: string;
  revealedAt: number;
  tiles: number;
  settledTiles: number;
  frontierTiles: number;
  controlledTowns: number;
  incomePerMinute: number;
  techCount: number;
  gold: number;
  manpower: number;
  manpowerCap: number;
  strategicResources: Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>;
};

export type StrategicReplayEventType =
  | "OWNERSHIP"
  | "STRUCTURE"
  | "TRUCE_START"
  | "TRUCE_BREAK"
  | "AETHER_BRIDGE"
  | "HOLD_START"
  | "HOLD_BREAK"
  | "WINNER";

export type StrategicReplayEvent = {
  id: string;
  at: number;
  type: StrategicReplayEventType;
  label: string;
  playerId?: string;
  playerName?: string;
  targetPlayerId?: string;
  targetPlayerName?: string;
  ownerId?: string | null;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN" | null;
  x?: number;
  y?: number;
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  structureType?:
    | "FORT"
    | "SIEGE_OUTPOST"
    | "OBSERVATORY"
    | "FARMSTEAD"
    | "UMBRITE_RIG"
    | "MINE"
    | "MINTWORKS"
    | "GRANARY"
    | "AIRPORT"
    | "UMBRITE_SYNTHESIZER"
    | "TITANIUM_WORKS"
    | "CRYSTAL_SYNTHESIZER"
    | "CARAVANARY"
    | "FOUNDRY"
    | "GARRISON_HALL"
    | "CUSTOMS_HOUSE"
    | "GOVERNORS_OFFICE"
    | "RADAR_SYSTEM";
  objectiveId?: string;
  objectiveName?: string;
  isBookmark?: boolean;
};

// TechInfo/DomainInfo/PendingResearch live in ./client-tech-info-types.js —
// re-exported here so existing importers of this module don't need to
// change their import path.
export type { TechInfo, DomainInfo, PendingResearch } from "./client-tech-info-types.js";

// Leaderboard/season-summary/mission view types (LeaderboardOverallEntry,
// LeaderboardMetricEntry, SeasonStatsView, SeasonWinnerView, MissionState)
// moved to client-leaderboard-season-types.ts (file-line cap) -- re-exported
// here so existing importers of this path don't need to change.
export type { LeaderboardOverallEntry, LeaderboardMetricEntry, SeasonStatsView, SeasonWinnerView, ScoreHistorySeriesView, ScoreHistoryPointView, MissionState } from "./client-leaderboard-season-types.js";

export type FeedType = "combat" | "mission" | "error" | "info" | "alliance" | "tech";
export type FeedSeverity = "info" | "success" | "warn" | "error";

export type FeedEntry = {
  title?: string;
  text: string;
  type: FeedType;
  severity: FeedSeverity;
  at: number;
  focusX?: number;
  focusY?: number;
  actionLabel?: string;
  unread?: boolean;
};

export type DockPair = { ax: number; ay: number; bx: number; by: number; route?: Array<{ x: number; y: number }> };
export type CrystalTargetingAbility = "aether_bridge" | "aether_wall" | "siphon" | "world_engine_strike" | "aether_emp" | "airport_bombard" | "imperial_exchange_levy";
export type GuideStep = {
  title: string;
  body: string;
};

export type TileVisibilityState = "unexplored" | "fogged" | "visible";

export type { SurveySweepPingKind, SurveySweepPing } from "./client-types-survey-sweep.js";

export type TerrainTextureId =
  | "SEA_DEEP"
  | "SEA_COAST"
  | "SAND"
  | "GRASS_LIGHT"
  | "GRASS_DARK"
  | "MOUNTAIN"
  | "TUNDRA";

export type { TileActionDef } from "./client-tile-action-def-types.js";

// Tile action menu view types (TileMenuTab, TileMenuProgressView,
// TileOverviewLine, TileCombatBreakdown, TileMenuView) moved to
// client-tile-menu-types.ts (file-line cap) -- re-exported here so existing
// importers of this path don't need to change.
export type { TileMenuTab, TileMenuProgressView, TileOverviewLine, TileCombatBreakdown, TileMenuView, CaptureCombatSnapshot } from "./client-tile-menu-types.js";
