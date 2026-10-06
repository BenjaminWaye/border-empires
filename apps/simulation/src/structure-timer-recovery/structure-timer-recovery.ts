import type { DomainTileState } from "@border-empires/game-domain";
import { scheduleAfcModuleDelivery, type AfcModuleDeliveryContext } from "../afc-module-delivery/afc-module-delivery.js";
import {
  scheduleStructureCompletion,
  structureTypeForField,
  tileHasPausedConstruction,
  type DevelopmentStructureField
} from "../attack-development-hold/attack-development-hold.js";

export type StructureTimerRecoveryDeps = {
  tiles: ReadonlyMap<string, DomainTileState>;
  now: () => number;
  scheduleAfter: (delayMs: number, task: () => void) => void;
  completeStructureBuild: (tileKey: string, ownerId: string, structureType: string, commandId: string) => void;
  completeStructureRemoval: (tileKey: string, ownerId: string, commandId: string) => void;
  /** True while an unresolved ATTACK targets the tile. */
  isTileUnderAttack: (tileKey: string) => boolean;
  /** Resumes a build an attack had paused (attack-development-hold.ts). */
  releaseDevelopmentHold: (tileKey: string, commandId: string) => void;
  afcModuleDelivery: () => AfcModuleDeliveryContext;
};

const STRUCTURE_FIELDS: readonly DevelopmentStructureField[] = ["fort", "observatory", "siegeOutpost", "economicStructure"];

/**
 * In-flight structure work (under_construction / removing) and AFC module
 * call-downs survive in tile state across restarts, but the setTimeout
 * closure that completes them dies with the previous process. Without this,
 * restarted structures stay stuck at 0:00 forever and permanently occupy
 * development slots, and in-transit modules never dock. Extracted from the
 * SimulationRuntime constructor.
 *
 * A build paused by an attack has no live timer by design; it resumes when the
 * lock on its tile goes away. A lock lost across the restart would leave it
 * paused forever, so a paused build whose tile has no attack lock is released
 * here, deferred a tick because releasing emits events and this runs inside the
 * runtime constructor.
 */
export const rescheduleRecoveredStructureTimers = (deps: StructureTimerRecoveryDeps): void => {
  for (const [tileKey, tile] of deps.tiles) {
    const ownerId = tile.ownerId;
    if (!ownerId) continue;
    const recoveredCommandId = `recovered-build:${tileKey}`;
    for (const field of STRUCTURE_FIELDS) {
      const structure = tile[field];
      if (structure?.ownerId !== ownerId || structure.completesAt == null) continue;
      if (structure.status === "under_construction") {
        if (structure.pausedAt !== undefined) continue;
        // Guarded timer: a later pause/resume moves the deadline and arms its own timer.
        scheduleStructureCompletion(deps, { tileKey, ownerId, field, structureType: structureTypeForField(tile, field), commandId: recoveredCommandId, completesAt: structure.completesAt });
      } else if (structure.status === "removing") {
        deps.scheduleAfter(Math.max(0, structure.completesAt - deps.now()), () => deps.completeStructureRemoval(tileKey, ownerId, recoveredCommandId));
      }
    }
    if (tileHasPausedConstruction(tile)) {
      deps.scheduleAfter(0, () => {
        if (!deps.isTileUnderAttack(tileKey)) deps.releaseDevelopmentHold(tileKey, recoveredCommandId);
      });
    }
    const incoming = tile.afc?.ownerId === ownerId ? tile.afc.incomingModules ?? [] : [];
    for (const arrivesAt of new Set(incoming.map((entry) => entry.arrivesAt))) {
      scheduleAfcModuleDelivery(deps.afcModuleDelivery(), tileKey, ownerId, arrivesAt, `recovered-afc-module:${tileKey}`);
    }
  }
};
