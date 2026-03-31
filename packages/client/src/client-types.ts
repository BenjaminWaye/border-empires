export type OptimisticStructureKind =
  | "FORT"
  | "OBSERVATORY"
  | "SIEGE_OUTPOST"
  | "FARMSTEAD"
  | "CAMP"
  | "MINE"
  | "MARKET"
  | "GRANARY"
  | "BANK"
  | "AIRPORT"
  | "QUARTERMASTER"
  | "IRONWORKS"
  | "CRYSTAL_SYNTHESIZER"
  | "FUEL_PLANT"
  | "FOUNDRY"
  | "GOVERNORS_OFFICE"
  | "RADAR_SYSTEM";

export type Tile = {
  x: number;
  y: number;
  terrain: "LAND" | "SEA" | "MOUNTAIN";
  detailLevel?: "summary" | "full";
  fogged?: boolean;
  resource?: string;
  ownerId?: string;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
  capital?: boolean;
  breachShockUntil?: number;
  clusterId?: string;
  clusterType?: string;
  regionType?: "FERTILE_PLAINS" | "BROKEN_HIGHLANDS" | "DEEP_FOREST" | "ANCIENT_HEARTLAND" | "CRYSTAL_WASTES";
  dockId?: string;
  town?: {
    type: "MARKET" | "FARMING" | "ANCIENT";
    baseGoldPerMinute: number;
    supportCurrent: number;
    supportMax: number;
    goldPerMinute: number;
    cap: number;
    isFed: boolean;
    population: number;
    maxPopulation: number;
    populationGrowthPerMinute?: number;
    populationTier: "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
    connectedTownCount: number;
    connectedTownBonus: number;
    connectedTownNames?: string[];
    hasMarket: boolean;
    marketActive: boolean;
    hasGranary: boolean;
    granaryActive: boolean;
    hasBank: boolean;
    bankActive: boolean;
    foodUpkeepPerMinute?: number;
    growthModifiers?: Array<{ label: "Recently captured" | "Nearby war" | "Long time peace"; deltaPerMinute: number }>;
  };
  fort?: { ownerId: string; status: "under_construction" | "active"; completesAt?: number };
  observatory?: { ownerId: string; status: "under_construction" | "active" | "inactive"; completesAt?: number };
  siegeOutpost?: { ownerId: string; status: "under_construction" | "active"; completesAt?: number };
  economicStructure?: {
    ownerId: string;
    type:
      | "FARMSTEAD"
      | "CAMP"
      | "MINE"
      | "MARKET"
      | "GRANARY"
      | "BANK"
      | "AIRPORT"
      | "QUARTERMASTER"
      | "IRONWORKS"
      | "CRYSTAL_SYNTHESIZER"
      | "FUEL_PLANT"
      | "FOUNDRY"
      | "GOVERNORS_OFFICE"
      | "RADAR_SYSTEM";
    status: "under_construction" | "active" | "inactive";
    completesAt?: number;
  };
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
      | "CAMP"
      | "MINE"
      | "MARKET"
      | "GRANARY"
      | "BANK"
      | "AIRPORT"
      | "QUARTERMASTER"
      | "IRONWORKS"
      | "CRYSTAL_SYNTHESIZER"
      | "FUEL_PLANT"
      | "FOUNDRY"
      | "GOVERNORS_OFFICE"
      | "RADAR_SYSTEM"
      | null;
    structureHistory: Array<
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
      | "QUARTERMASTER"
      | "IRONWORKS"
      | "CRYSTAL_SYNTHESIZER"
      | "FUEL_PLANT"
      | "FOUNDRY"
      | "GOVERNORS_OFFICE"
      | "RADAR_SYSTEM"
    >;
    wasMountainCreatedByPlayer?: boolean;
    wasMountainRemovedByPlayer?: boolean;
  };
  yield?: { gold?: number; strategic?: Record<string, number> };
  yieldRate?: { goldPerMinute?: number; strategicPerDay?: Record<string, number> };
  yieldCap?: { gold: number; strategicEach: number };
  optimisticPending?: "expand" | "settle" | "structure_build" | "structure_cancel";
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
  expiresAt: number;
  fromName?: string;
  toName?: string;
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
    resources: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
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
    resources: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
    checklist?: Array<{ label: string; met: boolean }>;
    canResearch?: boolean;
  };
};

export type PendingResearch = {
  techId: string;
  startedAt: number;
  completesAt: number;
};

export type LeaderboardOverallEntry = { id: string; name: string; tiles: number; incomePerMinute: number; techs: number; score: number };
export type LeaderboardMetricEntry = { id: string; name: string; value: number };

export type SeasonVictoryObjectiveView = {
  id: "TOWN_CONTROL" | "SETTLED_TERRITORY" | "ECONOMIC_HEGEMONY" | "RESOURCE_MONOPOLY" | "CONTINENT_FOOTPRINT";
  name: string;
  description: string;
  leaderPlayerId?: string;
  leaderName: string;
  progressLabel: string;
  thresholdLabel: string;
  holdDurationSeconds: number;
  holdRemainingSeconds?: number;
  statusLabel: string;
  conditionMet: boolean;
};

export type SeasonWinnerView = {
  playerId: string;
  playerName: string;
  crownedAt: number;
  objectiveId: "TOWN_CONTROL" | "SETTLED_TERRITORY" | "ECONOMIC_HEGEMONY" | "RESOURCE_MONOPOLY" | "CONTINENT_FOOTPRINT";
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
  text: string;
  type: FeedType;
  severity: FeedSeverity;
  at: number;
};

export type DockPair = { ax: number; ay: number; bx: number; by: number };
export type CrystalTargetingAbility = "deep_strike" | "naval_infiltration" | "sabotage";

export type GuideStep = {
  title: string;
  body: string;
};

export type TileVisibilityState = "unexplored" | "fogged" | "visible";

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
    | "launch_attack"
    | "launch_breach_attack"
    | "reveal_empire"
    | "collect_yield"
    | "build_fortification"
    | "build_observatory"
    | "build_farmstead"
    | "build_camp"
    | "build_mine"
    | "build_market"
    | "build_granary"
    | "build_bank"
    | "build_airport"
    | "build_quartermaster"
    | "build_ironworks"
    | "build_crystal_synthesizer"
    | "build_fuel_plant"
    | "build_foundry"
    | "build_governors_office"
    | "build_radar_system"
    | "abandon_territory"
    | "build_siege_camp"
    | "deep_strike"
    | "naval_infiltration"
    | "sabotage_tile"
    | "create_mountain"
    | "remove_mountain";
  label: string;
  cost?: string;
  detail?: string | undefined;
  disabled?: boolean;
  disabledReason?: string;
  targetKey?: string;
  originKey?: string;
};

export type TileMenuTab = "overview" | "actions" | "progress";

export type TileMenuProgressView = {
  title: string;
  detail: string;
  remainingLabel: string;
  progress: number;
  note: string;
  cancelLabel?: string;
};

export type TileMenuView = {
  title: string;
  subtitle: string;
  tabs: TileMenuTab[];
  overviewKicker?: string;
  overviewLines: string[];
  actions: TileActionDef[];
  progress?: TileMenuProgressView;
};
