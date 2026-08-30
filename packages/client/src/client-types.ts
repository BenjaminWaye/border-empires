import type { FrontierDecayKind, NaturalWonderType, Terrain } from "@border-empires/shared";
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
  watchtower?: { activated: boolean; activatedByPlayerId?: string; revealUntil?: number } | null; // Watchtower site (server-worldgen-watchtowers.ts); revealUntil is set only during the ~10s post-activation flicker window.
  naturalWonder?: { type: NaturalWonderType; claimedAt?: number } | null;
  town?: ClientTownWireSummary;
  fort?: {
    ownerId: string;
    status: "under_construction" | "active" | "removing";
    variant?: "FORT" | "TITANIUM_BASTION" | "THUNDER_BASTION" | "WOODEN_FORT";
    completesAt?: number;
    disabledUntil?: number;
    garrison?: number;
    garrisonCap?: number;
  };
  observatory?: { ownerId: string; status: "under_construction" | "active" | "inactive" | "removing"; completesAt?: number; cooldownUntil?: number };
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
  sabotage?: { ownerId: string; endsAt: number; outputMultiplier: number };
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
  muster?: {
    ownerId: string;
    amount: number;
    mode: "HOLD" | "ADVANCE" | "MARCH";
    targetX?: number;
    targetY?: number;
    setAt?: number;
    updatedAt: number;
  };
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

export type TechInfo = {
  id: string;
  name: string;
  tier: number;
  researchTimeSeconds?: number;
  rootId?: string;
  // Tech-tree redesign: which of the 4 player-facing branches (war, economy,
  // manpower, aether) this tech belongs to.
  branch?: string;
  requires?: string;
  prereqIds?: string[];
  description: string;
  mods: Partial<Record<"attack" | "defense" | "income" | "vision", number>>;
  effects?: Record<string, unknown>;
  requirements: {
    gold: number;
    resources: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>>;
    checklist?: Array<{ label: string; met: boolean }>;
    canResearch?: boolean;
  };
  grantsPowerup?: { id: string; charges: number };
};

export type DomainInfo = {
  id: string;
  tier: number;
  name: string;
  description: string;
  requiresTechId: string;
  mods: Partial<Record<"attack" | "defense" | "income" | "vision", number>>;
  effects?: Record<string, unknown>;
  requirements: {
    gold: number;
    resources: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>>;
    checklist?: Array<{ label: string; met: boolean }>;
    canResearch?: boolean;
  };
};

export type PendingResearch = {
  techId: string;
  startedAt: number;
  completesAt: number;
};

export type LeaderboardOverallEntry = { id: string; name: string; tiles: number; incomePerMinute: number; techs: number; manpowerCap: number; score: number; rank: number };
export type LeaderboardMetricEntry = { id: string; name: string; value: number; rank: number };

export type SeasonStatsView = {
  mostDeadlyTile?: { x: number; y: number; manpowerLost: number };
  longestRoad?: { tileCount: number };
};

export type SeasonWinnerView = {
  playerId: string;
  playerName: string;
  crownedAt: number;
  objectiveId: "TOWN_CONTROL" | "ECONOMIC_HEGEMONY" | "RESOURCE_MONOPOLY" | "MARITIME_SUPREMACY" | "DIPLOMATIC_DOMINANCE";
  objectiveName: string;
  // Persisted with the winner so a client that connects after crowning
  // (fresh login, reconnect) still gets these via INIT, not just the one-off
  // GLOBAL_STATUS_UPDATE broadcast at the moment of crowning.
  seasonStats?: SeasonStatsView;
};

export type MissionState = {
  id: string;
  name: string;
  description: string;
  target: number;
  progress: number;
  rewardPoints: number;
  rewardLabel?: string;
  expiresAt?: number;
  completed: boolean;
  claimed: boolean;
};

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
};

export type DockPair = { ax: number; ay: number; bx: number; by: number };
export type CrystalTargetingAbility = "aether_bridge" | "aether_wall" | "siphon" | "world_engine_strike" | "aether_emp" | "airport_bombard" | "imperial_exchange_levy";
export type GuideStep = {
  title: string;
  body: string;
};

export type TileVisibilityState = "unexplored" | "fogged" | "visible";

export type SurveySweepPingKind = "resource" | "town";
export type SurveySweepPing = {
  x: number;
  y: number;
  kind: SurveySweepPingKind;
  createdAt: number;
  expiresAt: number;
};

export type TerrainTextureId =
  | "SEA_DEEP"
  | "SEA_COAST"
  | "SAND"
  | "GRASS_LIGHT"
  | "GRASS_DARK"
  | "MOUNTAIN"
  | "TUNDRA";

export type TileActionDef = {
  id:
    | "settle_land"
    | "settle_connected_frontier"
    | "launch_attack"
    | "attack_connected_region"
    | "reveal_empire"
    | "reveal_empire_stats"
    | "survey_sweep"
    | "collect_yield"
    | "collect_shard"
    | "build_fortification"
    | "build_wooden_fort"
    | "build_observatory"
    | "build_farmstead"
    | "build_waterworks"
    | "build_umbrite_rig"
    | "build_mine"
    | "build_mintworks"
    | "build_granary"
    | "build_census_hall"
    | "build_bank"
    | "build_clearing_house"
    | "build_airport"
    | "build_aether_tower"
    | "build_umbrite_synthesizer"
    | "upgrade_umbrite_synthesizer"
    | "build_titanium_works"
    | "upgrade_titanium_works"
    | "build_crystal_synthesizer"
    | "upgrade_crystal_synthesizer"
    | "build_fuel_plant"
    | "build_caravanary"
    | "build_foundry"
    | "build_garrison_hall"
    | "build_customs_house"
    | "build_lockworks_port"
    | "build_rail_depot"
    | "build_exchange_house"
    | "build_imperial_exchange_part_1"
    | "build_imperial_exchange_part_2"
    | "build_imperial_exchange_part_3"
    | "build_world_engine_part_1"
    | "build_world_engine_part_2"
    | "build_world_engine_part_3"
    | "build_aegis_dome_part_1"
    | "build_aegis_dome_part_2"
    | "build_aegis_dome_part_3"
    | "build_astral_dock_part_1"
    | "build_astral_dock_part_2"
    | "build_astral_dock_part_3"
    | "build_population_bureau_part_1"
    | "build_population_bureau_part_2"
    | "build_population_bureau_part_3"
    | "build_titanium_levy_part_1"
    | "build_titanium_levy_part_2"
    | "build_titanium_levy_part_3"
    | "build_imperial_exchange"
    | "build_world_engine"
    | "build_aegis_dome"
    | "build_astral_dock"
    | "build_population_bureau"
    | "build_titanium_levy"
    | "build_governors_office"
    | "build_radar_system"
    | "build_quartermasters_office"
    | "build_logistics_guild"
    | "build_assembly_works"
    | "build_weapons_workshop"
    | "build_titanium_weapons_factory"
    | "build_umbrite_weapons_factory"
    | "grow_settlement_to_town"
    | "grow_town_to_city"
    | "grow_city_to_great_city"
    | "grow_great_city_to_monumental_city"
    | "remove_structure"
    | "abandon_territory"
    | "build_siege_camp"
    | "build_relay_beacon"
    | "build_relay_beacon_frontier"
    | "enable_converter_structure"
    | "disable_converter_structure" | "set_converter_structure_mode"
    | "muster_hold" | "muster_advance" | "muster_march" | "muster_march_cancel"
    | "muster_clear"
    | "offer_truce_12h"
    | "offer_truce_24h"
    | "break_truce"
    | "aether_lance"
    | "retort_recast_food"
    | "retort_recast_titanium"
    | "retort_recast_crystal"
    | "aether_wall"
    | "aether_bridge"
    | "imperial_exchange_levy"
    | "siphon_tile"
    | "aether_emp"
    | "world_engine_strike"
    | "airport_bombard"
    | "aegis_lock"
    | "city_overclock"
    | "astral_dock_launch"
    | "purge_siphon"
    | "create_mountain"
    | "remove_mountain"
    | "cancel_waypoint"
    | "clear_waypoint_and_expand_here"
    | "expand_here";
  label: string;
  cost?: string;
  detail?: string | undefined;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  targetKey?: string;
  originKey?: string;
};

// Tile action menu view types (TileMenuTab, TileMenuProgressView,
// TileOverviewLine, TileCombatBreakdown, TileMenuView) moved to
// client-tile-menu-types.ts (file-line cap) -- re-exported here so existing
// importers of this path don't need to change.
export type { TileMenuTab, TileMenuProgressView, TileOverviewLine, TileCombatBreakdown, TileMenuView } from "./client-tile-menu-types.js";
