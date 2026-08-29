// Stage 6 of the runtime.ts god-class breakup: the small amount of genuinely
// inline combat/lock resolution logic that survived Stages 1-5. Nearly the
// entire combat/lock resolution subsystem (resolveLock, buildLockedCombatResolution,
// encirclement, plunder, muster-source resolution, respawn, barbarian walk,
// resource steal) was already extracted in earlier stages into
// runtime-lock-resolution.ts, runtime-combat-support.ts,
// runtime-encirclement-application.ts, runtime-muster-source.ts,
// runtime-resource-steal.ts, and runtime-respawn-helpers.ts. This module
// extracts the three remaining inline methods: requiredMusterForTarget
// (pure), and consumeOriginMuster / applyFortGarrisonAttrition (both thin
// tile-state mutations threaded through a small context).
import type { DomainTileState } from "@border-empires/game-domain";
import {
  BARBARIAN_RAID_COST,
  FORT_GARRISON_ATTRITION_MAX,
  FORT_GARRISON_ATTRITION_MIN,
  FRONTIER_ATTACK_MUSTER_COST,
  requiredMusterForFort
} from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { SimulationTileWireDelta } from "./runtime-types.js";

/**
 * Manpower an attacker must have mustered to strike this target: a flat
 * per-fort-tier floor (structure-costs.ts's ATTACK_MANPOWER_LOSS_RANGE max —
 * you can never lose more than you brought), lowered for barbarian raids
 * and FRONTIER targets (forts only defend once SETTLED). No longer scaled
 * by the fort's actual garrison fill — that's a separate combat-power
 * mechanic (see garrisonScaledMult in frontier-combat.ts), not a muster gate.
 *
 * Pure function of the target tile - no runtime dependencies.
 */
export function requiredMusterForTarget(target: DomainTileState): number {
  // Barbarian tiles are raided cheaply from the pool (handled in validateFrontierCommand).
  if (target.ownerId === "barbarian-1") return BARBARIAN_RAID_COST;
  if (target.ownershipState === "FRONTIER") return FRONTIER_ATTACK_MUSTER_COST;
  return requiredMusterForFort(target.fort?.status === "active" ? target.fort.variant : undefined);
}

export interface RuntimeCombatResolutionContext {
  tiles: Map<string, DomainTileState>;
  now: () => number;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  emitEvent: (event: SimulationEvent) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
}

/**
 * Spend mustered manpower from the origin tile after a resolved attack under
 * the muster system. The pool is untouched (it was already drained into the
 * muster during accumulation).
 */
export function consumeOriginMuster(context: RuntimeCombatResolutionContext, originKey: string, playerId: string, amount: number): void {
  const tile = context.tiles.get(originKey);
  if (!tile?.muster || tile.muster.ownerId !== playerId) return;
  const nextAmount = Math.max(0, tile.muster.amount - amount);
  const updatedTile: DomainTileState = {
    ...tile,
    muster: { ...tile.muster, amount: nextAmount, updatedAt: context.now() }
  };
  context.replaceTileState(originKey, updatedTile);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: `muster-spend:${originKey}:${context.now()}`,
    playerId,
    tileDeltas: [context.tileDeltaFromState(updatedTile)]
  });
}

/**
 * Reduce a defending fort's garrison after a repulsed assault.
 * The attrition fraction is a random draw in [MIN, MAX] applied to the attacking force.
 */
export function applyFortGarrisonAttrition(context: RuntimeCombatResolutionContext, targetKey: string, attackingForce: number): void {
  const tile = context.tiles.get(targetKey);
  if (!tile?.fort || tile.fort.status !== "active" || tile.fort.garrison == null) return;
  const fraction = FORT_GARRISON_ATTRITION_MIN +
    Math.random() * (FORT_GARRISON_ATTRITION_MAX - FORT_GARRISON_ATTRITION_MIN);
  const loss = fraction * attackingForce;
  const updatedTile: DomainTileState = {
    ...tile,
    fort: { ...tile.fort, garrison: Math.max(0, tile.fort.garrison - loss), garrisonUpdatedAt: context.now() }
  };
  context.replaceTileState(targetKey, updatedTile);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: `fort-attrition:${targetKey}:${context.now()}`,
    playerId: tile.fort.ownerId,
    tileDeltas: [context.tileDeltaFromState(updatedTile)]
  });
}
