/**
 * Auto-settle for a captured/claimed town or dock that would otherwise decay
 * for being out of reach. Towns and docks ARE reach anchors, so decaying one
 * away is a dead end -- there is no reach to grow into it with, unlike a
 * plain resource or wonder tile, which decays normally with no special
 * treatment (see resolveLock in runtime-lock-resolution.ts, the only caller).
 *
 * Same cost/development-slot gates as a human's own SETTLE command
 * (settleRejectionForActor + hasAvailableDevelopmentSlot) -- a captured
 * anchor cannot bypass limits an ordinary settle would be subject to. If the
 * player can't afford it, the caller falls back to the normal decay path
 * instead (never both: paying the cost only to also decay would be pointless).
 */

import type { DomainTileState } from "@border-empires/game-domain";
import { settleRejectionForActor } from "../runtime-settlement-rules.js";

export type AutoSettleCapturedAnchorDeps = {
  getPlayer: (playerId: string) => { manpower: number; points: number } | undefined;
  hasAvailableDevelopmentSlot: (playerId: string) => boolean;
  startSettlementProcess: (input: {
    commandId: string;
    playerId: string;
    targetKey: string;
    target: DomainTileState;
    startedAt: number;
  }) => void;
  now: () => number;
};

/** Pure eligibility check -- no mutation. */
export const canAutoSettleCapturedAnchor = (deps: AutoSettleCapturedAnchorDeps, playerId: string): boolean => {
  const actor = deps.getPlayer(playerId);
  return Boolean(actor && !settleRejectionForActor(actor) && deps.hasAvailableDevelopmentSlot(playerId));
};

/** Caller must have already checked canAutoSettleCapturedAnchor and skipped stamping a decay timer on `target`. */
export const autoSettleCapturedAnchor = (
  deps: AutoSettleCapturedAnchorDeps,
  playerId: string,
  targetKey: string,
  target: DomainTileState,
  commandId: string
): void => {
  deps.startSettlementProcess({ commandId, playerId, targetKey, target, startedAt: deps.now() });
};

export type CapturedAutoSettleEligibilityInput = {
  playerId: string;
  isAnchorStructureTile: boolean;
  hasCapturedBuilding: boolean;
  outOfReachDecayAt: number | undefined;
  canAutoSettleCapturedAnchor: (playerId: string) => boolean;
};

/**
 * Whether a just-resolved capture (town/dock anchor OR a fort/observatory/
 * economic-structure building) should auto-settle instead of landing plain
 * FRONTIER. Anchors only auto-settle when they'd otherwise decay for being
 * out of reach (see module doc comment); buildings auto-settle unconditionally
 * on capture -- an idle captured building produces no income and is barely
 * defensible, so leaving it FRONTIER by default just traps value. Both share
 * the same cost/dev-slot affordability gate, and barbarians never take this
 * path (their captures resolve straight to SETTLED elsewhere).
 */
export const capturedTileWillAutoSettle = (input: CapturedAutoSettleEligibilityInput): boolean => {
  if (input.playerId === "barbarian-1") return false;
  const anchorEligible = input.outOfReachDecayAt !== undefined && input.isAnchorStructureTile;
  const eligible = anchorEligible || input.hasCapturedBuilding;
  return eligible && input.canAutoSettleCapturedAnchor(input.playerId);
};
