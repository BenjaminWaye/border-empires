export type Terrain = "LAND" | "SEA" | "COASTAL_SEA" | "MOUNTAIN";
export const isSeaTerrain = (terrain: Terrain): terrain is "SEA" | "COASTAL_SEA" => terrain === "SEA" || terrain === "COASTAL_SEA";
export type ResourceType = "FARM" | "TITANIUM" | "GEMS" | "FISH" | "UMBRITE";
export type TileKey = `${number},${number}`;
export type PlayerId = string;
export type LandBiome = "GRASS" | "SAND" | "COASTAL_SAND";
export type ClusterType = "FERTILE_PLAINS" | "TITANIUM_HILLS" | "CRYSTAL_BASIN" | "HORSE_STEPPES" | "ANCIENT_RUINS" | "COASTAL_SHOALS";
export type RegionType = "FERTILE_PLAINS" | "BROKEN_HIGHLANDS" | "DEEP_FOREST" | "ANCIENT_HEARTLAND" | "CRYSTAL_WASTES";
export type FrontierDecayKind = "NATURAL" | "ENCIRCLEMENT";
export type FortStatus = "under_construction" | "active" | "removing";
export type SiegeOutpostStatus = "under_construction" | "active" | "removing";
export type FortVariant = "FORT" | "TITANIUM_BASTION" | "THUNDER_BASTION" | "WOODEN_FORT";
export type SiegeOutpostVariant = "SIEGE_OUTPOST" | "SIEGE_TOWER" | "DREAD_TOWER";
export type ObservatoryStatus = "under_construction" | "active" | "inactive" | "removing";
export type SeasonStatus = "active" | "archived";
export type OwnershipState = "FRONTIER" | "SETTLED" | "BARBARIAN";
export type VisibilityState = "VISIBLE" | "FOG" | "UNEXPLORED";
export type TownType = "MARKET" | "FARMING";
export type { EmpireVisualTint, EmpireBorderStyle, EmpireStructureAccent } from "./empire-cosmetics-types.js";
export type { NaturalWonderType, NaturalWonderState } from "./natural-wonder-types.js";
import type { ConverterMode, EconomicStructure } from "./economic-structure.js";
export type { ConverterMode, EconomicStructure };

export type EconomicStructureType =
  | "FARMSTEAD"
  | "WATERWORKS"
  | "UMBRITE_RIG"
  | "MINE"
  | "MINTWORKS"
  | "GRANARY"
  | "SEED_GRANARY"
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
  | "ASTRAL_DOCK_PART_1"
  | "ASTRAL_DOCK_PART_2"
  | "ASTRAL_DOCK_PART_3"
  | "POPULATION_BUREAU_PART_1"
  | "POPULATION_BUREAU_PART_2"
  | "POPULATION_BUREAU_PART_3"
  | "TITANIUM_LEVY_PART_1"
  | "TITANIUM_LEVY_PART_2"
  | "TITANIUM_LEVY_PART_3"
  | "IMPERIAL_EXCHANGE"
  | "WORLD_ENGINE"
  | "AEGIS_DOME"
  | "ASTRAL_DOCK"
  | "POPULATION_BUREAU"
  | "TITANIUM_LEVY"
  | "WEAPONS_WORKSHOP"
  | "TITANIUM_WEAPONS_FACTORY"
  | "UMBRITE_WEAPONS_FACTORY";
// The late-game monument family: each is built in stages (a "*_PART"
// intermediate, then the finished structure below). Single source of truth
// for anything that needs to identify "is this a monument" (e.g. season
// winner stats).
export const MONUMENTAL_STRUCTURE_TYPES = ["IMPERIAL_EXCHANGE", "WORLD_ENGINE", "AEGIS_DOME", "ASTRAL_DOCK", "POPULATION_BUREAU", "TITANIUM_LEVY"] as const;
export type MonumentalStructureType = (typeof MONUMENTAL_STRUCTURE_TYPES)[number];
export type PopulationTier = "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
export type TownGrowthUpgradeTier = "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
export type ShardSiteKind = "CACHE" | "FALL";
export type SeasonVictoryPathId =
  | "TOWN_CONTROL"
  | "ECONOMIC_HEGEMONY"
  | "RESOURCE_MONOPOLY"
  | "MARITIME_SUPREMACY"
  | "DIPLOMATIC_DOMINANCE";

export interface EmpireVisualStyle {
  primaryOverlay: string;
  secondaryTint: import("./empire-cosmetics-types.js").EmpireVisualTint;
  borderStyle: import("./empire-cosmetics-types.js").EmpireBorderStyle;
  structureAccent: import("./empire-cosmetics-types.js").EmpireStructureAccent;
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
  perMinute: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "GOLD", number>>;
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
  // Deadliest-tile / longest-road misc stats, captured once at crowning and
  // persisted with the winner (see sim-protocol's SeasonWinnerSnapshot) so a
  // reconnecting/late-joining client still gets them via INIT.
  seasonStats?: {
    mostDeadlyTile?: { x: number; y: number; manpowerLost: number };
    longestRoad?: { tileCount: number };
  };
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
    modifiers?: Array<{ label: string; percent: number; deltaGoldPerMinute: number }>;
  };
  shardSite?: {
    kind: ShardSiteKind;
    amount: number;
    expiresAt?: number;
  } | null;
  naturalWonder?: import("./natural-wonder-types.js").NaturalWonderState | null;
  // Watchtower site: world-generated scouting structure. Dormant until a player expands onto its tile, then a one-time 10s vision pulse (revealUntil).
  watchtower?: { activated: boolean; activatedByPlayerId?: string; revealUntil?: number } | null;
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
    // Weapons Factory network totals: this town's connected-network count of
    // active Titanium/Umbrite Weapons Factories, self-inclusive of the whole
    // network (mirrors ConnectedTownNetworkEntry in
    // apps/simulation/src/economy-network/economy-network.ts, the same
    // scope combat actually reads from).
    connectedTitaniumWeaponsFactoryCount?: number;
    connectedUmbriteWeaponsFactoryCount?: number;
    manpowerCurrent?: number;
    manpowerCap?: number;
    hasMintworks: boolean;
    mintworksActive: boolean;
    // mintworks-stacking task: real count of active Mintworks in this town's
    // support ring, feeding mintworksGoldProductionMultiplier() — hasMintworks/
    // mintworksActive stay as-is for existing boolean consumers. Optional (not
    // required) so the large number of existing test-fixture town objects
    // across the monorepo don't all need updating under
    // exactOptionalPropertyTypes; every real read site treats a missing
    // value as 0 via `?? 0`.
    mintworksCount?: number;
    hasGranary: boolean;
    granaryActive: boolean;
    hasSeedGranary?: boolean;
    seedGranaryActive?: boolean;
    seedGranaryBuffed?: boolean;
    foodUpkeepPerMinute?: number;
    captureShockUntil?: number;
    populationBeforeCapture?: number;
    nearbyWarPausedUntil?: number;
    nearbyWarLastAt?: number;
    growthModifiers?: Array<{ label: "Recently captured" | "Nearby war" | "Long time peace"; deltaPerMinute: number }>;
    nextPopulationTierUpgrade?: {
      targetTier: TownGrowthUpgradeTier;
      requiredPopulation: number;
      goldCost: number;
      available: boolean;
    };
    // Census Hall (tech-tree redesign): the population/cap bonus currently
    // granted by this town's own Census Hall (+20,000 per connected city
    // with an active Incubation Engine/Granary) -- tracked so a later drop
    // in connected Granaries can claw the bonus back down rather than only
    // ever growing it.
    censusHallAppliedBonus?: number;
    // Unified building modifier display (stage 3): one group per building
    // type this town's support ring has active copies of, each with a
    // "<count> <Building>" heading (e.g. "3 Garrison Halls") and every
    // numeric stat that building contributes, summed across its own active
    // copies. Building types are never merged into a shared, unlabeled stat
    // bucket (Weapons Workshop and Titanium Weapons Factory both feed
    // "Empire attack", but get separate headings/totals) — every number
    // in the panel traces back to a specific building. Covers both flat
    // per-copy numbers and percent-per-copy ones (rendered as a percentage —
    // see StructureModifier's `unit` field in game-domain). Buildings whose
    // effect scales off something other than their own count in this town
    // (Census Hall off connected Incubation Engines, Customs House off
    // connected docks, Rail Depot/Assembly Works off other network
    // buildings, one-time bursts) are deliberately excluded — see
    // structureModifiersFor's rawValue contract in game-domain.
    townModifierTotals?: Array<{
      heading: string;
      modifiers: Array<{ statLabel: string; valueText: string; tone: "positive" | "negative" | "neutral" }>;
    }>;
  };
  yield?: {
    gold?: number;
    strategic?: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>>;
  };
  yieldRate?: {
    goldPerMinute?: number;
    strategicPerDay?: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>>;
  };
  yieldCap?: {
    gold: number;
    strategicEach: number;
  };
  // activatedAt (fort/siegeOutpost/observatory/economicStructure below): when
  // this structure went active, set on build completion and refreshed on
  // capture — ranks which structure loses power first on a resource-slot
  // shortfall (§5.4: newest built-or-captured goes dormant first).
  fort?: { ownerId: PlayerId; status: FortStatus; variant?: FortVariant; completesAt?: number; activatedAt?: number; disabledUntil?: number; garrison?: number; garrisonCap?: number; garrisonUpdatedAt?: number };
  siegeOutpost?: { ownerId: PlayerId; status: SiegeOutpostStatus; variant?: SiegeOutpostVariant; completesAt?: number; activatedAt?: number };
  observatory?: { ownerId: PlayerId; status: ObservatoryStatus; completesAt?: number; activatedAt?: number; cooldownUntil?: number };
  economicStructure?: {
    ownerId: PlayerId;
    type: EconomicStructureType;
    status: "under_construction" | "active" | "inactive" | "removing";
    completesAt?: number;
    activatedAt?: number;
    disabledUntil?: number;
    inactiveReason?: "manual" | "upkeep";
    converterMode?: ConverterMode;
    modeLockedUntil?: number;
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
  strategicResources: Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>;
}

export interface ActiveSabotage {
  targetTileKey: string;
  casterPlayerId: string;
  endsAt: number;
  outputMultiplier: number;
}
