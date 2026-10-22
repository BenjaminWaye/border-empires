// Per-runtime island naming state that is derived, not persisted: the island
// registry and each island's generated default name. Cached per tile map (a
// new season builds a new SimulationRuntime with a new map), so the NAME_ISLAND
// handler and the ISLAND_NAMES ticker share one build without runtime wiring.
import { generatedIslandName, type DomainPlayer, type DomainTileState } from "@border-empires/game-domain";
import { getWorldSeed, type IslandNameClaim } from "@border-empires/shared";
import { buildIslandRegistry, type IslandRecord, type IslandRegistry } from "./island-registry.js";

export type IslandNamesWorld = {
  readonly registry: IslandRegistry;
  readonly defaultNameFor: (island: IslandRecord) => string;
};

const worldsByTiles = new WeakMap<ReadonlyMap<string, DomainTileState>, IslandNamesWorld>();

export const islandNamesWorldFor = (tiles: ReadonlyMap<string, DomainTileState>): IslandNamesWorld => {
  const cached = worldsByTiles.get(tiles);
  if (cached) return cached;
  const registry = buildIslandRegistry(tiles);
  const worldSeed = getWorldSeed();
  const defaultNames = new Map<string, string>();
  const world: IslandNamesWorld = {
    registry,
    defaultNameFor: (island) => {
      let name = defaultNames.get(island.id);
      if (name === undefined) {
        name = generatedIslandName(worldSeed, island.id, island.landTilesAtBuild);
        defaultNames.set(island.id, name);
      }
      return name;
    }
  };
  worldsByTiles.set(tiles, world);
  return world;
};

/** LAND tiles of `island` (live terrain) and how many `playerId` garrisons. */
export const islandStandingFor = (
  island: IslandRecord,
  tiles: ReadonlyMap<string, DomainTileState>,
  playerId: string,
  width: number
): { namerGarrisoned: number; landTiles: number } => {
  let landTiles = 0;
  let namerGarrisoned = 0;
  for (const cell of island.cells) {
    const tile = tiles.get(`${cell % width},${Math.floor(cell / width)}`);
    if (!tile || tile.terrain !== "LAND") continue;
    landTiles += 1;
    if (tile.ownerId === playerId && tile.ownershipState === "SETTLED") namerGarrisoned += 1;
  }
  return { namerGarrisoned, landTiles };
};

/** Every live claim, newest first per island (an older duplicate is ignored). */
export const currentIslandClaims = (
  players: ReadonlyMap<string, DomainPlayer>
): Map<string, { playerId: string; claim: IslandNameClaim }> => {
  const byIsland = new Map<string, { playerId: string; claim: IslandNameClaim }>();
  for (const player of players.values()) {
    for (const claim of player.islandNames ?? []) {
      const existing = byIsland.get(claim.islandId);
      if (!existing || claim.namedAt > existing.claim.namedAt) byIsland.set(claim.islandId, { playerId: player.id, claim });
    }
  }
  return byIsland;
};

/** Drops every player's claim on `islandId` except `keepPlayerId`'s. */
export const releaseIslandClaims = (players: ReadonlyMap<string, DomainPlayer>, islandId: string, keepPlayerId?: string): void => {
  for (const player of players.values()) {
    if (player.id === keepPlayerId || !player.islandNames?.some((claim) => claim.islandId === islandId)) continue;
    const remaining = player.islandNames.filter((claim) => claim.islandId !== islandId);
    if (remaining.length > 0) player.islandNames = remaining;
    else delete player.islandNames;
  }
};
