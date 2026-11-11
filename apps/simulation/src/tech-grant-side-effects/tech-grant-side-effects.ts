import type { DomainPlayer } from "@border-empires/game-domain";
import { commissionModuleIfApplicable, type AfcModuleCommissioningContext } from "../afc-module-commissioning.js";
import { buildTechUpdatePayload, grantTechToPlayer, revealResourceCategoryForTech } from "../tech-domain-bridge/tech-domain-bridge.js";

/**
 * What granting a tech needs from the runtime. A narrow slice of
 * RuntimeProgressionCommandContext, so the waystation TECH reward can share
 * the exact path paid research takes (runtime-progression-command-handlers.ts).
 */
export type TechGrantContext = AfcModuleCommissioningContext & {
  beforeResourceSupplyChange?: (id: string) => void;
  afterResourceSupplyChange?: (id: string) => void;
  invalidateUpkeepAccrual: (playerId: string) => void;
  invalidateResourceSlotDemand: (playerId: string) => void;
  invalidateEconomySnapshot: (playerId: string) => void;
  invalidateTileYieldContext: (playerId: string) => void;
  resyncVisionRadius: (playerId: string) => void;
  resyncRevealedResourceTilesForPlayer: (playerId: string, category: string) => void;
  sweepFrontierResourceTechUnlock: (playerId: string, revealedCategory: string) => void;
  incomePerMinuteForPlayer: (playerId: string) => number;
};

/**
 * Side effects of a player gaining a tech, run after the tech is added (and
 * after beforeResourceSupplyChange). Without commissionModuleIfApplicable, a
 * granted AFC_MODULE tech (e.g. the Titanium Forge Module) stays uninstalled
 * and its builds stay locked. The caller emits TECH_UPDATE.
 */
export function applyTechGrantSideEffects(context: TechGrantContext, playerId: string, techId: string, commandId: string): void {
  context.invalidateUpkeepAccrual(playerId);
  context.invalidateResourceSlotDemand(playerId);
  // A tech can grant a gold/growth/vision-adjacent effect that
  // multiplicativeEffectForPlayer/additiveEffectForPlayer feed into the
  // cached per-player tile-yield economy context (dockGoldOutputMult,
  // connectedTownStepBonusAdd, etc.) — without invalidating it here the
  // cache keeps serving pre-grant multipliers until something else
  // happens to invalidate it (e.g. a later tile mutation).
  context.afterResourceSupplyChange?.(playerId);
  context.invalidateEconomySnapshot(playerId);
  context.invalidateTileYieldContext(playerId);
  context.resyncVisionRadius(playerId);
  commissionModuleIfApplicable(context, playerId, techId, commandId);
  const revealCategory = revealResourceCategoryForTech(techId);
  if (revealCategory) {
    context.resyncRevealedResourceTilesForPlayer(playerId, revealCategory);
    context.sweepFrontierResourceTechUnlock(playerId, revealCategory);
  }
}

/**
 * Grants a tech outright (no cost, no prerequisite check) -- the waystation
 * TECH reward. Same steps as paid research: supply bracket, tech add, side
 * effects, then a TECH_UPDATE so a connected client picks it up.
 */
export function grantFreeTech(context: TechGrantContext, player: DomainPlayer, techId: string, commandId: string): void {
  context.beforeResourceSupplyChange?.(player.id);
  grantTechToPlayer(player, techId);
  applyTechGrantSideEffects(context, player.id, techId, commandId);
  context.emitEvent({
    eventType: "TECH_UPDATE",
    commandId,
    playerId: player.id,
    payloadJson: JSON.stringify(buildTechUpdatePayload(player, context.tiles.values(), { incomePerMinute: context.incomePerMinuteForPlayer(player.id) }))
  });
}
