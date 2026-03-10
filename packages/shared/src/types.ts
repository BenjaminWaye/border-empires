export type Terrain = "LAND" | "SEA" | "MOUNTAIN";
export type ResourceType = "FARM" | "WOOD" | "IRON" | "GEMS";
export type TileKey = `${number},${number}`;
export type PlayerId = string;

export interface Tile {
  x: number;
  y: number;
  terrain: Terrain;
  resource?: ResourceType;
  ownerId?: PlayerId;
  lastChangedAt: number;
}

export interface StatsMods {
  attack: number;
  defense: number;
  income: number;
  vision: number;
}

export interface Player {
  id: PlayerId;
  name: string;
  points: number;
  level: number;
  techRootId?: string;
  techIds: Set<string>;
  mods: StatsMods;
  powerups: Record<string, number>;
  tileColor?: string;
  territoryTiles: Set<TileKey>;
  T: number;
  E: number;
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
