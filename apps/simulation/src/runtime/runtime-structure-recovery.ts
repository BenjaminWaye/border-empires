import type { DomainTileState } from "@border-empires/game-domain";
import type { CombatLockTileReader } from "../combat-lock-index/combat-lock-index.js";
import {
  releaseDevelopmentHold,
  scheduleStructureCompletion,
  structureTypeForField,
  tileHasPausedConstruction,
  type AttackDevelopmentHoldContext,
  type DevelopmentStructureField
} from "../attack-development-hold/attack-development-hold.js";

export type StructureRecoveryContext = {
  holdContext: AttackDevelopmentHoldContext;
  locksByTile: CombatLockTileReader;
  completeStructureRemoval: (tileKey: string, ownerId: string, commandId: string) => void;
};

const STRUCTURE_FIELDS: readonly DevelopmentStructureField[] = ["fort", "observatory", "siegeOutpost", "economicStructure"];

/**
 * In-flight structure work (under_construction / removing) survives in tile
 * state across restarts, but the setTimeout closure that completes it dies
 * with the previous process. Without this, restarted structures stay stuck
 * at 0:00 forever and permanently occupy development slots.
 *
 * A build paused by an attack (attack-development-hold.ts) has no live timer
 * by design; it resumes when the lock on its tile goes away. A lock lost across
 * the restart would leave it paused forever, so a paused build with no lock on
 * its tile is released here (deferred a tick: releasing emits events, which
 * the runtime constructor shouldn't).
 */
export const recoverInFlightStructureWork = (ctx: StructureRecoveryContext, tiles: ReadonlyMap<string, DomainTileState>): void => {
  for (const [tileKey, tile] of tiles) {
    const ownerId = tile.ownerId;
    if (!ownerId) continue;
    const recoveredCommandId = `recovered-build:${tileKey}`;
    for (const field of STRUCTURE_FIELDS) {
      const structure = tile[field];
      if (structure?.ownerId !== ownerId || typeof structure.completesAt !== "number") continue;
      if (structure.status === "under_construction") {
        if (structure.pausedAt !== undefined) continue;
        scheduleStructureCompletion(ctx.holdContext, { tileKey, ownerId, field, structureType: structureTypeForField(tile, field), commandId: recoveredCommandId, completesAt: structure.completesAt });
      } else if (structure.status === "removing") {
        ctx.holdContext.scheduleAfter(Math.max(0, structure.completesAt - ctx.holdContext.now()), () => ctx.completeStructureRemoval(tileKey, ownerId, recoveredCommandId));
      }
    }
    if (tileHasPausedConstruction(tile)) {
      ctx.holdContext.scheduleAfter(0, () => {
        if (!ctx.locksByTile.targetLockAt(tileKey)) releaseDevelopmentHold(ctx.holdContext, tileKey, recoveredCommandId);
      });
    }
  }
};
