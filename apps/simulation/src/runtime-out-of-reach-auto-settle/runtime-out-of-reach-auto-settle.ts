/**
 * Auto-settle for a captured/claimed town or dock that lands beyond its new
 * owner's reach. Towns and docks ARE reach anchors, but SETTLE is reach-gated,
 * so an anchor captured out of reach could otherwise never be settled by hand
 * and would sit as FRONTIER forever with no reach to grow into it with --
 * unlike a plain resource or wonder tile, which just stays FRONTIER (see
 * resolveLock in runtime-lock-resolution.ts, the only caller).
 *
 * Same cost/development-slot gates as a human's own SETTLE command
 * (settleRejectionForActor + hasAvailableDevelopmentSlot) -- a captured
 * anchor cannot bypass limits an ordinary settle would be subject to. If the
 * player can't afford it, the tile stays FRONTIER.
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

/** Caller must have already checked canAutoSettleCapturedAnchor. */
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
  /** The captured tile sits beyond the capturer's reach (see isTileBeyondReach). */
  targetBeyondReach: boolean;
  canAutoSettleCapturedAnchor: (playerId: string) => boolean;
  /** Player's "towns" auto-settle opt-in; omitted means allowed. Only gates the anchor branch. */
  isAnchorAutoSettleAllowed?: (playerId: string) => boolean;
};

/**
 * Whether a just-resolved capture (town/dock anchor OR a fort/observatory/
 * economic-structure building) should auto-settle instead of landing plain
 * FRONTIER. Anchors only auto-settle when they land beyond reach, where a
 * manual SETTLE would be rejected (see module doc comment); buildings auto-settle unconditionally
 * on capture -- an idle captured building produces no income and is barely
 * defensible, so leaving it FRONTIER by default just traps value. Both share
 * the same cost/dev-slot affordability gate, and barbarians never take this
 * path (their captures resolve straight to SETTLED elsewhere).
 */
export const capturedTileWillAutoSettle = (input: CapturedAutoSettleEligibilityInput): boolean => {
  if (input.playerId === "barbarian-1") return false;
  const anchorEligible =
    input.targetBeyondReach && input.isAnchorStructureTile && (input.isAnchorAutoSettleAllowed?.(input.playerId) ?? true);
  const eligible = anchorEligible || input.hasCapturedBuilding;
  return eligible && input.canAutoSettleCapturedAnchor(input.playerId);
};
