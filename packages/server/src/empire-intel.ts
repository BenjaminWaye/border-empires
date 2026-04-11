import type { RevealEmpireStatsView } from "@border-empires/shared";

type StrategicStockMap = Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>;

export const buildRevealEmpireStatsView = (input: {
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
  strategicResources: StrategicStockMap;
}): RevealEmpireStatsView => ({
  playerId: input.playerId,
  playerName: input.playerName,
  revealedAt: input.revealedAt,
  tiles: input.tiles,
  settledTiles: input.settledTiles,
  frontierTiles: Math.max(0, input.frontierTiles),
  controlledTowns: input.controlledTowns,
  incomePerMinute: input.incomePerMinute,
  techCount: input.techCount,
  gold: input.gold,
  manpower: input.manpower,
  manpowerCap: input.manpowerCap,
  strategicResources: { ...input.strategicResources }
});
