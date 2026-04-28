import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { MANPOWER_BASE_CAP } from "@border-empires/shared";

import { createSeason20AiSeedWorld } from "./season-seed-world.js";
import type { RecoveredSimulationState } from "./event-recovery.js";

export type SimulationRulesetId = "seasonal-default";

export type GeneratedSeasonWorld = {
  initialPlayers: Map<string, DomainPlayer>;
  initialState: RecoveredSimulationState;
  worldSeed: number;
};

const createRuntimePlayer = (id: string): DomainPlayer => ({
  id,
  isAi: false,
  name: id,
  points: 100,
  manpower: MANPOWER_BASE_CAP,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-seasonal",
  allies: new Set<string>(),
  strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
  strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }
});

const toRecoveredTile = (tile: DomainTileState): RecoveredSimulationState["tiles"][number] => ({
  x: tile.x,
  y: tile.y,
  terrain: tile.terrain,
  ...(tile.resource ? { resource: tile.resource } : {}),
  ...(tile.dockId ? { dockId: tile.dockId } : {}),
  ...(tile.shardSite ? { shardSite: tile.shardSite } : {}),
  ...(tile.town ? { town: tile.town } : {}),
  ...(tile.fort ? { fort: tile.fort } : {}),
  ...(tile.observatory ? { observatory: tile.observatory } : {}),
  ...(tile.siegeOutpost ? { siegeOutpost: tile.siegeOutpost } : {}),
  ...(tile.economicStructure ? { economicStructure: tile.economicStructure } : {}),
  ...(tile.sabotage ? { sabotage: tile.sabotage } : {})
});

export const generateSeasonWorld = (
  rulesetId: SimulationRulesetId,
  requestedWorldSeed: number
): GeneratedSeasonWorld => {
  if (rulesetId !== "seasonal-default") {
    throw new Error(`unsupported simulation ruleset: ${rulesetId}`);
  }

  const generated = createSeason20AiSeedWorld(requestedWorldSeed, (id, isAi) => ({
    ...createRuntimePlayer(id),
    isAi
  }));

  const strippedTiles = [...generated.tiles.values()]
    .map((tile) => {
      const neutralTile: DomainTileState = {
        x: tile.x,
        y: tile.y,
        terrain: tile.terrain,
        ...(tile.resource ? { resource: tile.resource } : {}),
        ...(tile.dockId ? { dockId: tile.dockId } : {}),
        ...(tile.shardSite ? { shardSite: tile.shardSite } : {}),
        ...(tile.town ? { town: tile.town } : {}),
        ...(tile.fort ? { fort: tile.fort } : {}),
        ...(tile.observatory ? { observatory: tile.observatory } : {}),
        ...(tile.siegeOutpost ? { siegeOutpost: tile.siegeOutpost } : {}),
        ...(tile.economicStructure ? { economicStructure: tile.economicStructure } : {}),
        ...(tile.sabotage ? { sabotage: tile.sabotage } : {})
      };
      return toRecoveredTile(neutralTile);
    })
    .sort((left, right) => (left.x - right.x) || (left.y - right.y));

  return {
    initialPlayers: new Map<string, DomainPlayer>([["barbarian-1", createRuntimePlayer("barbarian-1")]]),
    initialState: {
      tiles: strippedTiles,
      docks: generated.docks.map((dock) => ({
        dockId: dock.dockId,
        tileKey: dock.tileKey,
        pairedDockId: dock.pairedDockId,
        ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {})
      })),
      activeLocks: [],
      players: [
        {
          id: "barbarian-1",
          name: "Barbarians",
          isAi: false,
          points: 100,
          manpower: MANPOWER_BASE_CAP,
          techIds: [],
          domainIds: [],
          strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
          allies: [],
          vision: 1,
          incomeMultiplier: 1
        }
      ],
      pendingSettlements: [],
      tileYieldCollectedAtByTile: [],
      collectVisibleCooldownByPlayer: []
    },
    worldSeed: generated.worldSeed ?? requestedWorldSeed
  };
};
