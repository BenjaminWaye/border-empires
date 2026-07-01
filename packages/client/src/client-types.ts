import type { FrontierDecayKind, Terrain } from "@border-empires/shared";

export type OptimisticStructureKind =
  | "FORT"
  | "OBSERVATORY"
  | "SIEGE_OUTPOST"
  | "ASTRAL_DOCK_PART"
  | "ASTRAL_DOCK"
  | "FARMSTEAD"
  | "WATERWORKS"
  | "CAMP"
  | "MINE"
  | "MARKET"
  | "GRANARY"
  | "CENSUS_HALL"
  | "BANK"
  | "CLEARING_HOUSE"
  | "AIRPORT"
  | "AETHER_TOWER"
  | "WOODEN_FORT"
  | "LIGHT_OUTPOST"
  | "FUR_SYNTHESIZER"
  | "ADVANCED_FUR_SYNTHESIZER"
  | "IRONWORKS"
  | "ADVANCED_IRONWORKS"
  | "CRYSTAL_SYNTHESIZER"
  | "ADVANCED_CRYSTAL_SYNTHESIZER"
  | "CARAVANARY"
  | "FOUNDRY"
  | "EXCHANGE_HOUSE"
  | "GARRISON_HALL"
  | "CUSTOMS_HOUSE"
  | "RAIL_DEPOT"
  | "GOVERNORS_OFFICE"
  | "RADAR_SYSTEM"
  | "IMPERIAL_EXCHANGE_PART"
  | "WORLD_ENGINE_PART"
  | "AEGIS_DOME_PART"
  | "IMPERIAL_EXCHANGE"
  | "WORLD_ENGINE"
  | "AEGIS_DOME";

export type TileUpkeepEntry = {
  label: string;
  perMinute: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "GOLD", number>>;
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
  landBiome?: "GRASS" | "SAND" | "COASTAL_SAND";
  regionType?: "FERTILE_PLAINS" | "BROKEN_HIGHLANDS" | "DEEP_FOREST" | "ANCIENT_HEARTLAND" | "CRYSTAL_WASTES";
  dockId?: string;
  townType?: "MARKET" | "FARMING";
  townName?: string;
  townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
  // Set true when a town payload arrived but failed the renderable gate
  // (population missing or below MIN_RENDERABLE_TOWN_POPULATION). The
  // overview pane keys its spinner state off this — not off townType
  // presence, which can be set independently by tile-shell updates.
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
  town?: {
    name?: string;
    type: "MARKET" | "FARMING";
    baseGoldPerMinute: number;
    supportCurrent: number;
    supportMax: number;
    goldPerMinute: number;
    cap: number;
    isFed: boolean;
    population: number;
    maxPopulation: number;
    populationGrowthPerMinute?: number;
    populationTier: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
    connectedTownCount: number;
    connectedTownBonus: number;
    connectedTownNames?: string[];
    goldIncomePausedReason?: "MANPOWER_NOT_FULL";
    manpowerCurrent?: number;
    manpowerCap?: number;
    hasMarket: boolean;
    marketActive: boolean;
    hasGranary: boolean;
    granaryActive: boolean;
    hasSeedGranary?: boolean; seedGranaryActive?: boolean; seedGranaryBuffed?: boolean;
    hasBank: boolean;
    bankActive: boolean;
    hasClearingHouse?: boolean; clearingHouseActive?: boolean; clearingHouseTownNames?: string[];
    foodUpkeepPerMinute?: number;
    captureShockUntil?: number;
    populationBeforeCapture?: number;
    growthModifiers?: Array<{ label: "Recently captured" | "Nearby war" | "Long time peace"; deltaPerMinute: number }>;
    nextPopulationTierUpgrade?: {
      targetTier: "CITY" | "GREAT_CITY" | "METROPOLIS";
      requiredPopulation: number;
      foodCost: number;
      available: boolean;
    };
  };
  fort?: {
    ownerId: string;
    status: "under_construction" | "active" | "removing";
    variant?: "FORT" | "IRON_BASTION" | "THUNDER_BASTION";
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
      | "CAMP"
      | "MINE"
      | "MARKET"
      | "GRANARY"
      | "CENSUS_HALL"
      | "BANK"
      | "CLEARING_HOUSE"
      | "AIRPORT"
      | "AETHER_TOWER"
      | "WOODEN_FORT"
      | "LIGHT_OUTPOST"
      | "FUR_SYNTHESIZER"
      | "ADVANCED_FUR_SYNTHESIZER"
      | "IRONWORKS"
      | "ADVANCED_IRONWORKS"
      | "CRYSTAL_SYNTHESIZER"
      | "ADVANCED_CRYSTAL_SYNTHESIZER"
      | "CARAVANARY"
      | "FOUNDRY"
      | "EXCHANGE_HOUSE"
      | "GARRISON_HALL"
      | "CUSTOMS_HOUSE"
      | "RAIL_DEPOT"
      | "GOVERNORS_OFFICE"
      | "RADAR_SYSTEM"
      | "ASTRAL_DOCK_PART"
      | "ASTRAL_DOCK"
      | "IMPERIAL_EXCHANGE_PART"
      | "WORLD_ENGINE_PART"
      | "AEGIS_DOME_PART"
      | "IMPERIAL_EXCHANGE"
      | "WORLD_ENGINE"
      | "AEGIS_DOME";
    status: "under_construction" | "active" | "inactive" | "removing";
    completesAt?: number;
    disabledUntil?: number;
    inactiveReason?: "manual" | "upkeep";
    powered?: boolean; bombardCooldownUntil?: number;
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
      | "CAMP"
      | "MINE"
      | "MARKET"
      | "GRANARY"
      | "CENSUS_HALL"
      | "BANK"
      | "CLEARING_HOUSE"
      | "AIRPORT"
      | "WOODEN_FORT"
      | "LIGHT_OUTPOST"
      | "FUR_SYNTHESIZER"
      | "ADVANCED_FUR_SYNTHESIZER"
      | "IRONWORKS"
      | "ADVANCED_IRONWORKS"
      | "CRYSTAL_SYNTHESIZER"
      | "ADVANCED_CRYSTAL_SYNTHESIZER"
      | "CARAVANARY"
      | "FOUNDRY"
      | "GARRISON_HALL"
      | "CUSTOMS_HOUSE"
      | "RAIL_DEPOT"
      | "GOVERNORS_OFFICE"
      | "RADAR_SYSTEM"
      | "ASTRAL_DOCK_PART"
      | "ASTRAL_DOCK"
      | null;
    structureHistory: Array<
      | "FORT"
      | "SIEGE_OUTPOST"
      | "OBSERVATORY"
      | "FARMSTEAD"
      | "WATERWORKS"
      | "CAMP"
      | "MINE"
      | "MARKET"
      | "GRANARY"
      | "CENSUS_HALL"
      | "BANK"
      | "CLEARING_HOUSE"
      | "AIRPORT"
      | "WOODEN_FORT"
      | "LIGHT_OUTPOST"
      | "FUR_SYNTHESIZER"
      | "ADVANCED_FUR_SYNTHESIZER"
      | "IRONWORKS"
      | "ADVANCED_IRONWORKS"
      | "CRYSTAL_SYNTHESIZER"
      | "ADVANCED_CRYSTAL_SYNTHESIZER"
      | "CARAVANARY"
      | "FOUNDRY"
      | "GARRISON_HALL"
      | "CUSTOMS_HOUSE"
      | "RAIL_DEPOT"
      | "GOVERNORS_OFFICE"
      | "RADAR_SYSTEM"
      | "ASTRAL_DOCK_PART"
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
    mode: "HOLD" | "ADVANCE";
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
  secondaryTint: "IRON" | "SUPPLY" | "FOOD" | "CRYSTAL" | "BALANCED";
  borderStyle: "SHARP" | "HEAVY" | "GLOW" | "DASHED" | "SOFT";
  structureAccent: "IRON" | "SUPPLY" | "FOOD" | "CRYSTAL" | "NEUTRAL";
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
  strategicResources: Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>;
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
    | "CAMP"
    | "MINE"
    | "MARKET"
    | "GRANARY"
    | "BANK"
    | "AIRPORT"
    | "FUR_SYNTHESIZER"
    | "IRONWORKS"
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
  requires?: string;
  prereqIds?: string[];
  description: string;
  mods: Partial<Record<"attack" | "defense" | "income" | "vision", number>>;
  effects?: Record<string, unknown>;
  requirements: {
    gold: number;
    resources: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
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
    resources: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
    checklist?: Array<{ label: string; met: boolean }>;
    canResearch?: boolean;
  };
};

export type PendingResearch = {
  techId: string;
  startedAt: number;
  completesAt: number;
};

export type LeaderboardOverallEntry = { id: string; name: string; tiles: number; incomePerMinute: number; techs: number; score: number; rank: number };
export type LeaderboardMetricEntry = { id: string; name: string; value: number; rank: number };

export type SeasonWinnerView = {
  playerId: string;
  playerName: string;
  crownedAt: number;
  objectiveId: "TOWN_CONTROL" | "ECONOMIC_HEGEMONY" | "RESOURCE_MONOPOLY" | "MARITIME_SUPREMACY" | "DIPLOMATIC_DOMINANCE";
  objectiveName: string;
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
export type CrystalTargetingAbility = "aether_bridge" | "aether_wall" | "siphon" | "world_engine_strike" | "aether_emp" | "airport_bombard";
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
  | "MOUNTAIN";

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
    | "build_camp"
    | "build_mine"
    | "build_market"
    | "build_granary"
    | "build_census_hall"
    | "build_bank"
    | "build_clearing_house"
    | "build_airport"
    | "build_aether_tower"
    | "build_fur_synthesizer"
    | "upgrade_fur_synthesizer"
    | "build_ironworks"
    | "upgrade_ironworks"
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
    | "build_imperial_exchange_part"
    | "build_world_engine_part"
    | "build_aegis_dome_part"
    | "build_astral_dock_part"
    | "build_imperial_exchange"
    | "build_world_engine"
    | "build_aegis_dome"
    | "build_astral_dock"
    | "build_governors_office"
    | "build_radar_system"
    | "grow_town_to_city"
    | "grow_city_to_great_city"
    | "grow_great_city_to_monumental_city"
    | "remove_structure"
    | "abandon_territory"
    | "build_siege_camp"
    | "build_light_outpost"
    | "overload_fur_synthesizer"
    | "overload_ironworks"
    | "overload_crystal_synthesizer"
    | "enable_converter_structure"
    | "disable_converter_structure"
    | "muster_hold"
    | "muster_advance"
    | "muster_clear"
    | "offer_truce_12h"
    | "offer_truce_24h"
    | "break_truce"
    | "aether_lance"
    | "retort_recast_food"
    | "retort_recast_supply"
    | "retort_recast_iron"
    | "retort_recast_crystal"
    | "aether_wall"
    | "aether_bridge"
    | "imperial_exchange_levy_food"
    | "imperial_exchange_levy_iron"
    | "imperial_exchange_levy_crystal"
    | "imperial_exchange_levy_supply"
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

export type TileMenuTab = "overview" | "actions" | "buildings" | "crystal" | "progress";

export type TileMenuProgressView = {
  title: string;
  detail: string;
  remainingLabel: string;
  progress: number;
  note: string;
  cancelLabel?: string;
  cancelActionId?: "cancel_structure_build" | "cancel_queued_settlement" | "cancel_queued_build";
};

export type TileOverviewLine = {
  html: string;
  kind?: "effect" | "section" | "loading";
};

export type TileMenuView = {
  title: string;
  subtitle: string;
  subtitleHtml?: string;
  statusText?: string;
  statusTone?: "warning" | "neutral";
  tabs: TileMenuTab[];
  overviewKicker?: string;
  overviewLines: TileOverviewLine[];
  actions: TileActionDef[];
  buildings: TileActionDef[];
  crystal: TileActionDef[];
  progress?: TileMenuProgressView;
};
