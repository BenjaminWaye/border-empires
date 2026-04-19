import { MANPOWER_BASE_CAP } from "@border-empires/shared";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { createSeason20AiSeedWorld } from "./season-seed-world.js";

export const simulationTileKey = (x: number, y: number): string => `${x},${y}`;

export type SimulationSeedProfile = "default" | "stress-10ai" | "stress-20ai" | "stress-40ai" | "season-20ai";

export type SimulationSeedSummary = {
  profile: SimulationSeedProfile;
  humanPlayers: number;
  aiPlayers: number;
  totalTiles: number;
  totalSettledTiles: number;
  totalTownTiles: number;
  perPlayer: Array<{
    playerId: string;
    isAi: boolean;
    settledTiles: number;
    towns: number;
  }>;
};

export type SimulationSeedWorld = {
  players: Map<string, DomainPlayer>;
  tiles: Map<string, DomainTileState>;
  summary: SimulationSeedSummary;
};

const SIMULATION_PROFILE_WORLD_SEEDS = {
  default: 42,
  "stress-10ai": 1_010,
  "stress-20ai": 2_020,
  "stress-40ai": 4_040,
  "season-20ai": 20_260
} satisfies Record<SimulationSeedProfile, number>;

const createTown = (
  type: "MARKET" | "FARMING",
  populationTier: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS",
  name?: string
): NonNullable<DomainTileState["town"]> => ({
  type,
  populationTier,
  ...(name ? { name } : {})
});

const setTile = (tiles: Map<string, DomainTileState>, tile: DomainTileState): void => {
  tiles.set(simulationTileKey(tile.x, tile.y), tile);
};

const createPlayer = (id: string, isAi: boolean): DomainPlayer => ({
  id,
  isAi,
  name: id,
  points: 100,
  manpower: MANPOWER_BASE_CAP,
  techIds: new Set<string>(isAi ? ["breach-doctrine"] : []),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
  strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }
});

export const createSeedPlayers = (profile: SimulationSeedProfile = "default"): Map<string, DomainPlayer> => {
  if (profile === "default") {
    return new Map<string, DomainPlayer>([
      ["player-1", createPlayer("player-1", false)],
      ["player-2", createPlayer("player-2", true)]
    ]);
  }

  if (profile === "stress-10ai" || profile === "stress-20ai" || profile === "stress-40ai" || profile === "season-20ai") {
    const aiPlayerCount =
      profile === "stress-10ai" ? 10
        : profile === "stress-20ai" ? 20
          : profile === "stress-40ai" ? 40
            : 20;
    const players = new Map<string, DomainPlayer>([
      ["player-1", createPlayer("player-1", false)],
      ["barbarian-1", createPlayer("barbarian-1", false)]
    ]);
    for (let index = 0; index < aiPlayerCount; index += 1) {
      const playerId = `ai-${index + 1}`;
      players.set(playerId, createPlayer(playerId, true));
    }
    return players;
  }

  return new Map<string, DomainPlayer>();
};

const createDefaultSeedWorld = (): SimulationSeedWorld => {
  const players = createSeedPlayers("default");
  const tiles = new Map<string, DomainTileState>([
    [simulationTileKey(10, 10), { x: 10, y: 10, terrain: "LAND", resource: "FARM", ownerId: "player-1", ownershipState: "FRONTIER", town: createTown("FARMING", "SETTLEMENT", "Nauticus") }],
    [simulationTileKey(10, 11), { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }],
    [simulationTileKey(10, 12), { x: 10, y: 12, terrain: "LAND", resource: "IRON" }],
    [simulationTileKey(9, 10), { x: 9, y: 10, terrain: "SEA", resource: "FISH" }],
    [simulationTileKey(11, 10), { x: 11, y: 10, terrain: "MOUNTAIN" }]
  ]);

  return {
    players,
    tiles,
    summary: {
      profile: "default",
      humanPlayers: 1,
      aiPlayers: 1,
      totalTiles: tiles.size,
      totalSettledTiles: 0,
      totalTownTiles: 0,
      perPlayer: [
        { playerId: "player-1", isAi: false, settledTiles: 0, towns: 0 },
        { playerId: "player-2", isAi: true, settledTiles: 0, towns: 0 }
      ]
    }
  };
};

const createStressSeedWorld = (
  aiPlayerCount: number,
  profile: Extract<SimulationSeedProfile, "stress-10ai" | "stress-20ai" | "stress-40ai">
): SimulationSeedWorld => {
  const players = createSeedPlayers(profile);
  const tiles = new Map<string, DomainTileState>();
  const perPlayer: SimulationSeedSummary["perPlayer"] = [];

  for (let x = 0; x < 12; x += 1) {
    for (let y = 0; y < 14; y += 1) {
      const isSea = x >= 8 || y >= 12;
      const isMountain = !isSea && x === 6 && y >= 2 && y <= 9;
      setTile(tiles, {
        x,
        y,
        terrain: isSea ? "SEA" : isMountain ? "MOUNTAIN" : "LAND",
        ...(isSea && (x + y) % 3 === 0 ? { resource: "FISH" as const } : {}),
        ...(!isSea && !isMountain && x === 1 && y === 8 ? { resource: "FUR" as const } : {}),
        ...(!isSea && !isMountain && x === 3 && y === 2 ? { resource: "FARM" as const } : {}),
        ...(!isSea && !isMountain && x === 5 && y === 10 ? { resource: "IRON" as const } : {})
      });
    }
  }

  const humanSettledTiles: Array<{ x: number; y: number }> = [];
  for (let x = 0; x < 5; x += 1) {
    for (let y = 0; y < 10; y += 1) {
      humanSettledTiles.push({ x, y });
    }
  }
  for (const tile of humanSettledTiles) {
    const isHomeTown = tile.x === 2 && tile.y === 4;
    setTile(tiles, {
      x: tile.x,
      y: tile.y,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: tile.x === 4 ? "FRONTIER" : "SETTLED",
      ...(isHomeTown ? { town: createTown("FARMING", "SETTLEMENT", "Nauticus") } : {}),
      ...(tile.x === 0 && tile.y === 3 ? { resource: "FARM" as const } : {}),
      ...(tile.x === 1 && tile.y === 7 ? { resource: "FUR" as const } : {}),
      ...(tile.x === 3 && tile.y === 8 ? { resource: "IRON" as const } : {})
    });
  }
  perPlayer.push({
    playerId: "player-1",
    isAi: false,
    settledTiles: humanSettledTiles.length,
    towns: 3
  });

  for (let x = 25; x < 28; x += 1) {
    for (let y = 0; y < 3; y += 1) {
      setTile(tiles, {
        x,
        y,
        terrain: "LAND",
        ownerId: "barbarian-1",
        ownershipState: "FRONTIER"
      });
    }
  }

  for (let index = 0; index < aiPlayerCount; index += 1) {
    const playerId = `ai-${index + 1}`;
    const column = index % 5;
    const row = Math.floor(index / 5);
    const baseX = 5 + (column * 24);
    const baseY = row * 14;
    let settledTiles = 0;
    let towns = 0;

    for (let x = 0; x < 20; x += 1) {
      for (let y = 0; y < 10; y += 1) {
        const worldX = baseX + x;
        const worldY = baseY + y;
        const townRowOffset = index === 0 ? 1 : 0;
        const isTownTile = x % 2 === 1 && y === ((Math.floor(x / 2) + townRowOffset) % 10) && towns < 10;
        setTile(tiles, {
          x: worldX,
          y: worldY,
          terrain: "LAND",
          ownerId: playerId,
          ownershipState: "SETTLED",
          ...(isTownTile ? { town: createTown(index % 2 === 0 ? "MARKET" : "FARMING", "SETTLEMENT", `${playerId.toUpperCase()}-${towns + 1}`) } : {}),
          ...(x === 0 && y === 0 ? { resource: "FARM" as const } : {}),
          ...(x === 6 && y === 1 ? { resource: "IRON" as const } : {}),
          ...(x === 12 && y === 2 ? { resource: "FUR" as const } : {})
        });
        settledTiles += 1;
        if (isTownTile) towns += 1;
      }
    }

    perPlayer.push({
      playerId,
      isAi: true,
      settledTiles,
      towns
    });
  }

  return {
    players,
    tiles,
    summary: {
      profile,
      humanPlayers: 1,
      aiPlayers: aiPlayerCount,
      totalTiles: tiles.size,
      totalSettledTiles: perPlayer.reduce((sum, player) => sum + player.settledTiles, 0),
      totalTownTiles: perPlayer.reduce((sum, player) => sum + player.towns, 0),
      perPlayer
    }
  };
};

export const createSeedWorld = (profile: SimulationSeedProfile = "default"): SimulationSeedWorld => {
  if (profile === "stress-10ai") return createStressSeedWorld(10, "stress-10ai");
  if (profile === "stress-20ai") return createStressSeedWorld(20, "stress-20ai");
  if (profile === "stress-40ai") return createStressSeedWorld(40, "stress-40ai");
  if (profile === "season-20ai") {
    const generated = createSeason20AiSeedWorld(SIMULATION_PROFILE_WORLD_SEEDS["season-20ai"], createPlayer);
    return {
      players: generated.players,
      tiles: generated.tiles,
      summary: {
        profile: "season-20ai",
        humanPlayers: generated.humanPlayers,
        aiPlayers: generated.aiPlayers,
        totalTiles: generated.totalTiles,
        totalSettledTiles: generated.totalSettledTiles,
        totalTownTiles: generated.totalTownTiles,
        perPlayer: generated.perPlayer
      }
    };
  }
  return createDefaultSeedWorld();
};

export const parseSimulationSeedProfile = (value: string | undefined): SimulationSeedProfile =>
  value === "stress-10ai" || value === "stress-20ai" || value === "stress-40ai" || value === "season-20ai" ? value : "default";

export const simulationWorldSeedForProfile = (profile: SimulationSeedProfile): number =>
  SIMULATION_PROFILE_WORLD_SEEDS[profile];
