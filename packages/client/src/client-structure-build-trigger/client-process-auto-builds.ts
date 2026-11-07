import { structureRequiresClientPlacement, structureSkipsSettledRequirement, type BuildableStructureType } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

// The server fires durable build continuations; client-placement structures still need a player-picked site.
export const processAutoBuilds = (state: ClientState, trigger: (type: BuildableStructureType, tile: Tile) => void): void => {
  for (const [targetKey, structureType] of [...state.autoBuildTargets]) {
    const tile = state.tiles.get(targetKey);
    if (!tile || tile.ownerId !== state.me || tile.optimisticPending ||
        (!structureSkipsSettledRequirement(structureType) && tile.ownershipState !== "SETTLED")) continue;
    state.autoBuildTargets.delete(targetKey);
    if (structureRequiresClientPlacement(structureType)) trigger(structureType, tile);
  }
};
