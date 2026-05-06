import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { createSeedWorld, parseSimulationSeedProfile, type SimulationSeedProfile } from "../../simulation/src/seed-state.js";

export const fallbackInitialStateFromSeed = (
  playerId: string,
  seedProfile: SimulationSeedProfile
): PlayerSubscriptionSnapshot => {
  const seedWorld = createSeedWorld(seedProfile);
  return {
  playerId,
  ...(seedWorld.docks.length
    ? {
        docks: seedWorld.docks.map((dock) => ({
          dockId: dock.dockId,
          tileKey: dock.tileKey,
          pairedDockId: dock.pairedDockId,
          ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {})
        }))
      }
    : {}),
  tiles: [...seedWorld.tiles.values()]
    .map((tile) => ({
      x: tile.x,
      y: tile.y,
      terrain: tile.terrain,
      ...(tile.resource ? { resource: tile.resource } : {}),
      ...(tile.dockId ? { dockId: tile.dockId } : {}),
      ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
      ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
      ...(tile.town?.type ? { townType: tile.town.type } : {}),
      ...(tile.town?.name ? { townName: tile.town.name } : {}),
      ...(tile.town?.populationTier ? { townPopulationTier: tile.town.populationTier } : {})
    }))
    .sort((left, right) => (left.x - right.x) || (left.y - right.y))
  };
};

export { parseSimulationSeedProfile };
export type { SimulationSeedProfile };
