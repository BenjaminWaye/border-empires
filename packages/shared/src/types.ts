export type Terrain = "LAND" | "SEA" | "COASTAL_SEA" | "MOUNTAIN";
export const isSeaTerrain = (terrain: Terrain): terrain is "SEA" | "COASTAL_SEA" => terrain === "SEA" || terrain === "COASTAL_SEA";
export type ResourceType = "FARM" | "WOOD" | "IRON" | "GEMS" | "FISH" | "FUR";
export type TileKey = `${number},${number}`;
export type PlayerId = string;
export type LandBiome = "GRASS" | "SAND" | "COASTAL_SAND";
export type ClusterType = "FERTILE_PLAINS" | "IRON_HILLS" | "CRYSTAL_BASIN" | "HORSE_STEPPES" | "ANCIENT_RUINS" | "COASTAL_SHOALS";
export type RegionType = "FERTILE_PLAINS" | "BROKEN_HIGHLANDS" | "DEEP_FOREST" | "ANCIENT_HEARTLAND" | "CRYSTAL_WASTES";
export type FrontierDecayKind = "NATURAL" | "ENCIRCLEMENT";
export type FortStatus = "under_construction" | "active" | "removing";
export type SiegeOutpostStatus = "under_construction" | "active" | "removing";
export type FortVariant = "FORT" | "IRON_BASTION" | "THUNDER_BASTION";
export type SiegeOutpostVariant = "SIEGE_OUTPOST" | "SIEGE_TOWER" | "DREAD_TOWER";
export type ObservatoryStatus = "under_construction" | "active" | "inactive" | "removing";
export type SeasonStatus = "active" | "archived";
export type OwnershipState = "FRONTIER" | "SETTLED" | "BARBARIAN";
export type TownType = "MARKET" | "FARMING";
export type EmpireVisualTint = "IRON" | "SUPPLY" | "FOOD" | "CRYSTAL" | "BALANCED";
export type EmpireBorderStyle = "SHARP" | "HEAVY" | "GLOW" | "DASHED" | "SOFT";
export type EmpireStructureAccent = "IRON" | "SUPPLY" | "FOOD" | "CRYSTAL" | "NEUTRAL";
export type EconomicStructureType =
  | "FARMSTEAD"
  | "WATERWORKS"
  | "CAMP"
  | "MINE"
  | "MARKET"
  | "GRANARY"
  | "SEED_GRANARY"
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
  | "ASTRAL_DOCK_PART"
  | "IMPERIAL_EXCHANGE"
  | "WORLD_ENGINE"
  | "AEGIS_DOME"
  | "ASTRAL_DOCK";
export type PopulationTier = "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
export type TownGrowthUpgradeTier = "CITY" | "GREAT_CITY" | "METROPOLIS";
export type ShardSiteKind = "CACHE" | "FALL";
export type SeasonVictoryPathId =
  | "TOWN_CONTROL"
  | "ECONOMIC_HEGEMONY"
  | "RESOURCE_MONOPOLY"
  | "MARITIME_SUPREMACY"
  | "DIPLOMATIC_DOMINANCE";

export interface EmpireVisualStyle {
  primaryOverlay: string;
  secondaryTint: EmpireVisualTint;
  borderStyle: EmpireBorderStyle;
  structureAccent: EmpireStructureAccent;
}

export interface TileHistory {
  lastOwnerId?: PlayerId | null;
  previousOwners: PlayerId[];
  captureCount: number;
  lastCapturedAt?: number | null;
  lastStructureType?: "FORT" | "SIEGE_OUTPOST" | "OBSERVATORY" | EconomicStructureType | null;
  structureHistory: Array<"FORT" | "SIEGE_OUTPOST" | "OBSERVATORY" | EconomicStructureType>;
  wasMountainCreatedByPlayer?: boolean;
  wasMountainRemovedByPlayer?: boolean;
}

export interface TileUpkeepEntry {
  label: string;
  perMinute: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "GOLD", number>>;
}

export interface EconomicStructure {
  id: string;
  type: EconomicStructureType;
  tileKey: TileKey;
  ownerId: PlayerId;
  status: "under_construction" | "active" | "inactive" | "removing";
  completesAt?: number;
  disabledUntil?: number;
  inactiveReason?: "manual" | "upkeep";
  previousStatus?: "active" | "inactive";
  nextUpkeepAt: number;
  powered?: boolean;
  bombardCooldownUntil?: number;
}

export interface SeasonVictoryObjectiveView {
  id: SeasonVictoryPathId;
  name: string;
  description: string;
  leaderPlayerId?: PlayerId;
  leaderName: string;
  progressLabel: string;
  selfProgressLabel?: string;
  thresholdLabel: string;
  holdDurationSeconds: number;
  holdRemainingSeconds?: number;
  statusLabel: string;
  conditionMet: boolean;
}

export interface SeasonWinnerView {
  playerId: PlayerId;
  playerName: string;
  crownedAt: number;
  objectiveId: SeasonVictoryPathId;
  objectiveName: string;
}

export interface TruceRequest {
  id: string;
  fromPlayerId: PlayerId;
  toPlayerId: PlayerId;
  createdAt: number;
  expiresAt: number;
  durationHours: 12 | 24;
  fromName?: string;
  toName?: string;
}

export interface ActiveTruceView {
  otherPlayerId: PlayerId;
  otherPlayerName: string;
  startedAt: number;
  endsAt: number;
  createdByPlayerId: PlayerId;
}

export interface ActiveAetherBridgeView {
  bridgeId: string;
  ownerId: PlayerId;
  from: { x: number; y: number };
  to: { x: number; y: number };
  startedAt: number;
  endsAt: number;
}

export interface ActiveAetherWallView {
  wallId: string;
  ownerId: PlayerId;
  origin: { x: number; y: number };
  direction: "N" | "E" | "S" | "W";
  length: 1 | 2 | 3;
  startedAt: number;
  endsAt: number;
}

export type StrategicReplayEventType =
  | "OWNERSHIP"
  | "STRUCTURE"
  | "TRUCE_START"
  | "TRUCE_BREAK"
  | "AETHER_BRIDGE"
  | "HOLD_START"
  | "HOLD_BREAK"
  | "WINNER";

export interface StrategicReplayEvent {
  id: string;
  at: number;
  type: StrategicReplayEventType;
  label: string;
  playerId?: PlayerId;
  playerName?: string;
  targetPlayerId?: PlayerId;
  targetPlayerName?: string;
  ownerId?: PlayerId | null;
  ownershipState?: OwnershipState | null;
  x?: number;
  y?: number;
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  structureType?: "FORT" | "SIEGE_OUTPOST" | "OBSERVATORY" | EconomicStructureType;
  objectiveId?: SeasonVictoryPathId;
  objectiveName?: string;
  isBookmark?: boolean;
}

export interface Tile {
  x: number;
  y: number;
  terrain: Terrain;
  detailLevel?: "summary" | "full";
  fogged?: boolean;
  resource?: ResourceType;
  ownerId?: PlayerId;
  ownershipState?: OwnershipState;
  capital?: boolean | undefined;
  breachShockUntil?: number;
  frontierDecayAt?: number;
  frontierDecayKind?: FrontierDecayKind;
  continentId?: number;
  clusterId?: string;
  clusterType?: ClusterType;
  landBiome?: LandBiome;
  regionType?: RegionType;
  dockId?: string;
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
    kind: ShardSiteKind;
    amount: number;
    expiresAt?: number;
  } | null;
  town?: {
    name?: string;
    type: TownType;
    baseGoldPerMinute: number;
    supportCurrent: number;
    supportMax: number;
    goldPerMinute: number;
    cap: number;
    isFed: boolean;
    population: number;
    maxPopulation: number;
    populationGrowthPerMinute?: number;
    populationTier: PopulationTier;
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
    hasSeedGranary?: boolean;
    seedGranaryActive?: boolean;
    seedGranaryBuffed?: boolean;
    hasBank: boolean;
    bankActive: boolean;
    foodUpkeepPerMinute?: number;
    captureShockUntil?: number;
    populationBeforeCapture?: number;
    nearbyWarPausedUntil?: number;
    nearbyWarLastAt?: number;
    growthModifiers?: Array<{ label: "Recently captured" | "Nearby war" | "Long time peace"; deltaPerMinute: number }>;
    nextPopulationTierUpgrade?: {
      targetTier: TownGrowthUpgradeTier;
      requiredPopulation: number;
      foodCost: number;
      available: boolean;
    };
  };
  yield?: {
    gold?: number;
    strategic?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
  };
  yieldRate?: {
    goldPerMinute?: number;
    strategicPerDay?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
  };
  yieldCap?: {
    gold: number;
    strategicEach: number;
  };
  fort?: { ownerId: PlayerId; status: FortStatus; variant?: FortVariant; completesAt?: number; disabledUntil?: number; garrison?: number; garrisonCap?: number; garrisonUpdatedAt?: number };
  siegeOutpost?: { ownerId: PlayerId; status: SiegeOutpostStatus; variant?: SiegeOutpostVariant; completesAt?: number };
  observatory?: { ownerId: PlayerId; status: ObservatoryStatus; completesAt?: number; cooldownUntil?: number };
  economicStructure?: {
    ownerId: PlayerId;
    type: EconomicStructureType;
    status: "under_construction" | "active" | "inactive" | "removing";
    completesAt?: number;
    disabledUntil?: number;
    inactiveReason?: "manual" | "upkeep";
  };
  upkeepEntries?: TileUpkeepEntry[];
  sabotage?: { ownerId: PlayerId; endsAt: number; outputMultiplier: number };
  history?: TileHistory;
  lastChangedAt: number;
  muster?: {
    ownerId: string;
    amount: number;
    mode: "HOLD" | "ADVANCE";
    targetX?: number;
    targetY?: number;
    setAt?: number;
    updatedAt: number;
  };
}

export interface StatsMods {
  attack: number;
  defense: number;
  income: number;
  vision: number;
}

export type MissionKind =
  | "NEUTRAL_CAPTURES"
  | "ENEMY_CAPTURES"
  | "COMBAT_WINS"
  | "TILES_HELD"
  | "SETTLED_TILES_HELD"
  | "FARMS_HELD"
  | "CONTINENTS_HELD"
  | "TECH_PICKS";

export interface MissionState {
  id: string;
  kind: MissionKind;
  name: string;
  description: string;
  unlockPoints: number;
  prerequisiteId?: string;
  target: number;
  progress: number;
  rewardPoints: number;
  rewardLabel?: string;
  expiresAt?: number;
  completed: boolean;
  claimed: boolean;
}

export interface MissionStats {
  neutralCaptures: number;
  enemyCaptures: number;
  combatWins: number;
  maxTilesHeld: number;
  maxSettledTilesHeld: number;
  maxFarmsHeld: number;
  maxContinentsHeld: number;
  maxTechPicks: number;
}

export interface PendingResearch {
  techId: string;
  startedAt: number;
  completesAt: number;
}

export interface PlayerActivityEntry {
  id: string;
  title: string;
  detail: string;
  type: "combat" | "mission" | "error" | "info" | "alliance" | "tech";
  severity: "info" | "success" | "warn" | "error";
  at: number;
  tileKey?: TileKey;
  actionLabel?: string;
}

export type PlayerRespawnReasonCode = "eliminated" | "auth_recovery" | "startup_recovery";

export interface PlayerRespawnNotice {
  id: string;
  at: number;
  reasonCode: PlayerRespawnReasonCode;
  title: string;
  summary: string;
  detail: string;
  triggerEvent: string;
  playerId: PlayerId;
  playerName: string;
  previousTerritoryTiles: number;
  previousTerritoryStrength: number;
  previousExposure: number;
  wasEliminated: boolean;
  respawnPending: boolean;
  wasOnline?: boolean;
  previousHomeTileKey?: TileKey;
  spawnTileKey?: TileKey;
}

export interface Player {
  id: PlayerId;
  name: string;
  isAi?: boolean;
  aiVictoryPath?: SeasonVictoryPathId;
  profileComplete?: boolean;
  points: number;
  level: number;
  techRootId?: string;
  techIds: Set<string>;
  domainIds: Set<string>;
  mods: StatsMods;
  powerups: Record<string, number>;
  currentResearch?: PendingResearch;
  tileColor?: string;
  missions: MissionState[];
  missionStats: MissionStats;
  territoryTiles: Set<TileKey>;
  T: number;
  E: number;
  Ts: number;
  Es: number;
  stamina: number;
  staminaUpdatedAt: number;
  manpower: number;
  manpowerUpdatedAt: number;
  manpowerCapSnapshot?: number;
  allies: Set<PlayerId>;
  spawnOrigin?: TileKey;
  capitalTileKey?: TileKey | undefined;
  spawnShieldUntil: number;
  isEliminated: boolean;
  respawnPending: boolean;
  lastActiveAt: number;
  lastEconomyWakeAt?: number;
  activityInbox: PlayerActivityEntry[];
  lastRespawnNotice?: PlayerRespawnNotice;
}

export interface CombatLock {
  originKey: TileKey;
  targetKey: TileKey;
  attackerId: PlayerId;
  defenderId?: PlayerId;
  resolvesAt: number;
}

export interface Season {
  seasonId: string;
  startAt: number;
  endAt: number;
  worldSeed: number;
  techTreeConfigId: string;
  status: SeasonStatus;
}

export interface ClusterBonusDefinition {
  attackMult?: number;
  defenseMult?: number;
  incomeMult?: number;
  visionMult?: number;
}

export interface Cluster {
  clusterId: string;
  clusterType: ClusterType;
  controlThreshold: number;
  bonusDefinition: ClusterBonusDefinition;
}

export interface Dock {
  dockId: string;
  tileKey: TileKey;
  pairedDockId: string;
  connectedDockIds?: string[];
  baseGoldPerMinute?: number;
  effectiveGoldPerMinute?: number;
  cap?: number;
  cooldownUntil: number;
  routeCooldownUntilByDockId?: Partial<Record<string, number>>;
}

export interface BarbarianAgent {
  id: string;
  x: number;
  y: number;
  progress: number;
  lastActionAt: number;
  nextActionAt: number;
}

export interface Fort {
  fortId: string;
  ownerId: PlayerId;
  tileKey: TileKey;
  variant: FortVariant;
  status: FortStatus;
  startedAt: number;
  completesAt?: number;
  disabledUntil?: number;
  previousStatus?: "active";
}

export interface SiegeOutpost {
  siegeOutpostId: string;
  ownerId: PlayerId;
  tileKey: TileKey;
  variant: SiegeOutpostVariant;
  status: SiegeOutpostStatus;
  startedAt: number;
  completesAt?: number;
  previousStatus?: "active";
}

export interface Observatory {
  observatoryId: string;
  ownerId: PlayerId;
  tileKey: TileKey;
  status: ObservatoryStatus;
  completesAt?: number;
  cooldownUntil?: number;
  previousStatus?: "active" | "inactive";
}

export interface ActiveRevealEmpire {
  casterPlayerId: string;
  targetPlayerId: string;
  isActive: boolean;
}

export interface RevealEmpireStatsView {
  playerId: PlayerId;
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
}

export interface ActiveSabotage {
  targetTileKey: string;
  casterPlayerId: string;
  endsAt: number;
  outputMultiplier: number;
}
