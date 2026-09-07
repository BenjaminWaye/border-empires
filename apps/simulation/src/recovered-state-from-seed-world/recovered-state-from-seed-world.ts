// Maps a freshly generated seed world (seed-state.ts's createSeedWorld) into
// the RecoveredSimulationState shape the runtime boots from, so a brand-new
// season starts through exactly the same path as a season recovered from
// events/snapshot.
//
// Extracted out of simulation-service.ts, which is far over the repo's
// 500-line file cap and may not grow (see AGENTS.md's file-and-type-discipline
// rule). This is a pure tile-shape mapper with a single call site and no
// dependency on the service's closure state, so it owns itself cleanly here.
import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import type { createSeedWorld } from "../seed-state/seed-state.js";

export const recoveredStateFromSeedWorld = (
  seedWorld: ReturnType<typeof createSeedWorld>
): RecoveredSimulationState => ({
  tiles: [...seedWorld.tiles.values()]
    .map((tile) => ({
      x: tile.x,
      y: tile.y,
      terrain: tile.terrain,
      ...(tile.resource ? { resource: tile.resource } : {}),
      ...(tile.dockId ? { dockId: tile.dockId } : {}),
      ...(tile.shardSite ? { shardSite: tile.shardSite } : {}), ...(tile.naturalWonder ? { naturalWonder: tile.naturalWonder } : {}),
      ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
      ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
      ...(typeof tile.frontierDecayAt === "number" ? { frontierDecayAt: tile.frontierDecayAt } : {}),
      ...(tile.frontierDecayKind ? { frontierDecayKind: tile.frontierDecayKind } : {}),
      ...(tile.town ? { town: tile.town } : {}),
      ...(tile.fort ? { fort: tile.fort } : {}),
      ...(tile.observatory ? { observatory: tile.observatory } : {}),
      ...(tile.siegeOutpost ? { siegeOutpost: tile.siegeOutpost } : {}),
      ...(tile.economicStructure ? { economicStructure: tile.economicStructure } : {}),
      ...(tile.sabotage ? { sabotage: tile.sabotage } : {})
    }))
    .sort((left, right) => (left.x - right.x) || (left.y - right.y)),
  activeLocks: []
});
