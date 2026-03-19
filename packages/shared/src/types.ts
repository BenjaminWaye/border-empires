export type Terrain = "LAND" | "SEA" | "MOUNTAIN";
export type ResourceType = "FARM" | "WOOD" | "IRON" | "GEMS" | "FISH" | "FUR";
export type TileKey = `${number},${number}`;
export type PlayerId = string;
export type LandBiome = "GRASS" | "SAND" | "COASTAL_SAND";
export type ClusterType = "FERTILE_PLAINS" | "IRON_HILLS" | "CRYSTAL_BASIN" | "HORSE_STEPPES" | "ANCIENT_RUINS" | "COASTAL_SHOALS";
export type RegionType = "FERTILE_PLAINS" | "BROKEN_HIGHLANDS" | "DEEP_FOREST" | "ANCIENT_HEARTLAND" | "CRYSTAL_WASTES";
export type FortStatus = "under_construction" | "active";
export type SiegeOutpostStatus = "under_construction" | "active";
export type SeasonStatus = "active" | "archived";
export type OwnershipState = "FRONTIER" | "SETTLED" | "BARBARIAN";
export type TownType = "MARKET" | "FARMING" | "ANCIENT";

export interface Tile {
  x: number;
  y: number;
  terrain: Terrain;
  fogged?: boolean;
  resource?: ResourceType;
  ownerId?: PlayerId;
  ownershipState?: OwnershipState;
  breachShockUntil?: number;
  continentId?: number;
  clusterId?: string;
  clusterType?: ClusterType;
  regionType?: RegionType;
  dockId?: string;
  town?: {
    type: TownType;
    baseGoldPerMinute: number;
    supportCurrent: number;
    supportMax: number;
    goldPerMinute: number;
    foodUpkeepPerMinute?: number;
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
  fort?: { ownerId: PlayerId; status: FortStatus; completesAt?: number };
  siegeOutpost?: { ownerId: PlayerId; status: SiegeOutpostStatus; completesAt?: number };
  lastChangedAt: number;
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

export interface Player {
  id: PlayerId;
  name: string;
  points: number;
  level: number;
  techRootId?: string;
  techIds: Set<string>;
  domainIds: Set<string>;
  mods: StatsMods;
  powerups: Record<string, number>;
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
  allies: Set<PlayerId>;
  spawnOrigin?: TileKey;
  spawnShieldUntil: number;
  isEliminated: boolean;
  respawnPending: boolean;
  lastActiveAt: number;
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
  cooldownUntil: number;
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
  status: FortStatus;
  startedAt: number;
  completesAt: number;
}

export interface SiegeOutpost {
  siegeOutpostId: string;
  ownerId: PlayerId;
  tileKey: TileKey;
  status: SiegeOutpostStatus;
  startedAt: number;
  completesAt: number;
}
