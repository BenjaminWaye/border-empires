import { MANPOWER_BASE_CAP, type DomainPlayer, type DomainTileState } from "@border-empires/game-domain";
import type { WorldStyle } from "@border-empires/shared";

import { createSeasonSeedWorldAsync } from "../season-seed-world.js";
import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";

export type SimulationRulesetId = "seasonal-default";
export type SimulationMapStyle = WorldStyle;

export type GeneratedSeasonWorld = {
  initialPlayers: Map<string, DomainPlayer>;
  initialState: RecoveredSimulationState;
  worldSeed: number;
  mapStyle: SimulationMapStyle;
};

export const parseSimulationMapStyle = (value: string | undefined): SimulationMapStyle =>
  value === "islands" || value === "continents" ? value : "continents";

const SEASONAL_AI_NAMES = [
  "Alden Vale",
  "Sigrid Storm",
  "Milo Ash",
  "Freja Sund",
  "Edvin Frost",
  "Clara North",
  "Hugo Bjork",
  "Linnea Skald",
  "Rowan Hale",
  "Tove Falk",
  "Astrid Wold",
  "Niko Reed",
  "Maren Dusk",
  "Ivar Stone",
  "Elin Birch",
  "Rasmus Pike",
  "Kara Venn",
  "Oskar Flint",
  "Solveig Moor",
  "Bryn Holt"
] as const;

export const seasonalAiNameForId = (id: string): string | undefined => {
  const match = /^ai-(\d+)$/.exec(id);
  if (!match) return undefined;
  const index = Number(match[1]) - 1;
  return SEASONAL_AI_NAMES[index];
};

export const seasonalPlayerNameForId = (id: string): string => {
  if (id === "barbarian-1") return "Barbarians";
  return seasonalAiNameForId(id) ?? id;
};

const createRuntimePlayer = (id: string): DomainPlayer => ({
  id,
  isAi: false,
  name: seasonalPlayerNameForId(id),
  points: id === "barbarian-1" ? Number.MAX_SAFE_INTEGER : 100,
  manpower: id === "barbarian-1" ? Number.MAX_SAFE_INTEGER : MANPOWER_BASE_CAP,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-seasonal",
  allies: new Set<string>(),
  strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
  strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 }
});

const toRecoveredTile = (tile: DomainTileState): RecoveredSimulationState["tiles"][number] => ({
  x: tile.x,
  y: tile.y,
  terrain: tile.terrain,
  ...(tile.resource ? { resource: tile.resource } : {}),
  ...(tile.dockId ? { dockId: tile.dockId } : {}),
  ...(tile.shardSite ? { shardSite: tile.shardSite } : {}),
  ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
  ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
  ...(tile.town ? { town: tile.town } : {}),
  ...(tile.fort ? { fort: tile.fort } : {}),
  ...(tile.observatory ? { observatory: tile.observatory } : {}),
  ...(tile.siegeOutpost ? { siegeOutpost: tile.siegeOutpost } : {}),
  ...(tile.economicStructure ? { economicStructure: tile.economicStructure } : {}),
  ...(tile.sabotage ? { sabotage: tile.sabotage } : {})
});

const toRecoveredPlayer = (player: DomainPlayer): NonNullable<RecoveredSimulationState["players"]>[number] => ({
  id: player.id,
  ...(player.name ? { name: player.name } : {}),
  ...(typeof player.isAi === "boolean" ? { isAi: player.isAi } : {}),
  ...(typeof player.points === "number" ? { points: player.points } : {}),
  ...(typeof player.manpower === "number" ? { manpower: player.manpower } : {}),
  ...(player.techIds ? { techIds: [...player.techIds] } : {}),
  ...(player.domainIds ? { domainIds: [...player.domainIds] } : {}),
  ...(player.strategicResources ? { strategicResources: { ...player.strategicResources } } : {}),
  ...(player.allies ? { allies: [...player.allies] } : {}),
  ...(player.mods ? { vision: player.mods.vision, incomeMultiplier: player.mods.income } : {})
});

export const generateSeasonWorld = async (
  rulesetId: SimulationRulesetId,
  requestedWorldSeed: number,
  options: {
    aiPlayerCount?: number;
    mapStyle?: SimulationMapStyle;
    onYield?: () => Promise<void>;
  } = {}
): Promise<GeneratedSeasonWorld> => {
  if (rulesetId !== "seasonal-default") {
    throw new Error(`unsupported simulation ruleset: ${rulesetId}`);
  }
  const mapStyle = options.mapStyle ?? "continents";

  const generated = await createSeasonSeedWorldAsync(
    requestedWorldSeed,
    (id, isAi) => ({
      ...createRuntimePlayer(id),
      isAi
    }),
    {
      humanPlayerCount: 0,
      aiPlayerCount: Math.max(0, options.aiPlayerCount ?? 20),
      style: mapStyle,
      // The old 20-30 minSignificantIslands/maxSignificantIslands and 0.22
      // maxLargestIslandShare bounds were tuned to reject-sample CONTINENT seeds
      // until the coastline noise happened to look archipelago-like — a stand-in
      // for a real islands generator. Now that style="islands" actually invokes
      // buildIslands() (55 scattered blobs), that upper bound is permanently
      // unsatisfiable (true output is ~44-65 significant islands) and the
      // acceptance loop below would burn all 16 iterations regenerating the full
      // world every season bootstrap (~73s) for nothing.
      //
      // Keep only a generous floor, well below the natural range, as a safety
      // net against a truly degenerate seed (e.g. blobs coincidentally merging
      // into one dominant landmass) — not a real design bound, just a sanity
      // check that doesn't reintroduce the always-reject perf regression.
      ...(mapStyle === "islands" ? { minSignificantIslands: 10 } : {}),
      ...(options.onYield ? { onYield: options.onYield } : {})
    }
  );

  const strippedTiles = [...generated.tiles.values()]
    .map((tile) => toRecoveredTile(tile))
    .sort((left, right) => (left.x - right.x) || (left.y - right.y));

  const initialPlayers = new Map<string, DomainPlayer>(
    [...generated.players.entries()].filter(([playerId]) => playerId === "barbarian-1" || playerId.startsWith("ai-"))
  );

  return {
    initialPlayers,
    initialState: {
      tiles: strippedTiles,
      docks: generated.docks.map((dock) => ({
        dockId: dock.dockId,
        tileKey: dock.tileKey,
        pairedDockId: dock.pairedDockId,
        ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {})
      })),
      activeLocks: [],
      players: [...initialPlayers.values()].map((player) => toRecoveredPlayer(player)),
      pendingSettlements: [],
      tileYieldCollectedAtByTile: [],
      playerYieldCollectionEpochByPlayer: []
    },
    worldSeed: generated.worldSeed ?? requestedWorldSeed,
    mapStyle
  };
};
