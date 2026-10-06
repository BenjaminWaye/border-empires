import type { DomainTileState } from "@border-empires/game-domain";
import { scheduleAfcModuleDelivery, type AfcModuleDeliveryContext } from "../afc-module-delivery/afc-module-delivery.js";

export type StructureTimerRecoveryDeps = {
  tiles: ReadonlyMap<string, DomainTileState>;
  now: () => number;
  scheduleAfter: (delayMs: number, task: () => void) => void;
  completeStructureBuild: (tileKey: string, ownerId: string, structureType: string, commandId: string) => void;
  completeStructureRemoval: (tileKey: string, ownerId: string, commandId: string) => void;
  afcModuleDelivery: () => AfcModuleDeliveryContext;
};

type TimedStructure = { ownerId: string; status: string; completesAt?: number | undefined };

/**
 * In-flight structure work (under_construction / removing) and AFC module
 * call-downs survive in tile state across restarts, but the setTimeout
 * closure that completes them dies with the previous process. Without this,
 * restarted structures stay stuck at 0:00 forever and permanently occupy
 * development slots, and in-transit modules never dock. Extracted from the
 * SimulationRuntime constructor.
 */
export const rescheduleRecoveredStructureTimers = (deps: StructureTimerRecoveryDeps): void => {
  for (const [tileKey, tile] of deps.tiles) {
    const ownerId = tile.ownerId;
    if (!ownerId) continue;
    const recoveredCommandId = `recovered-build:${tileKey}`;
    const recover = (structure: TimedStructure | undefined, structureType: string): void => {
      if (structure?.ownerId !== ownerId || structure.completesAt == null) return;
      if (structure.status === "under_construction") {
        deps.scheduleAfter(Math.max(0, structure.completesAt - deps.now()), () => deps.completeStructureBuild(tileKey, ownerId, structureType, recoveredCommandId));
      } else if (structure.status === "removing") {
        deps.scheduleAfter(Math.max(0, structure.completesAt - deps.now()), () => deps.completeStructureRemoval(tileKey, ownerId, recoveredCommandId));
      }
    };
    recover(tile.fort, "FORT");
    recover(tile.observatory, "OBSERVATORY");
    recover(tile.siegeOutpost, "SIEGE_OUTPOST");
    recover(tile.economicStructure, tile.economicStructure?.type ?? "");
    const incoming = tile.afc?.ownerId === ownerId ? tile.afc.incomingModules ?? [] : [];
    for (const arrivesAt of new Set(incoming.map((entry) => entry.arrivesAt))) {
      scheduleAfcModuleDelivery(deps.afcModuleDelivery(), tileKey, ownerId, arrivesAt, `recovered-afc-module:${tileKey}`);
    }
  }
};
