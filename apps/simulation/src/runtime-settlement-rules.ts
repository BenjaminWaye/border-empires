import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { SETTLE_COST, SETTLE_MANPOWER_COST, garrisonBaseDurationMsAt } from "@border-empires/shared";

import { multiplicativeEffectForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import { creditManpower } from "./runtime-manpower-ceiling.js";

export type SettleActorLike = { points: number; manpower: number } & Partial<Pick<DomainPlayer, "techIds" | "domainIds">>;

/** Garrison manpower after Expansion Doctrine (AFC Dominion IV); bare actors (tests, previews) pay the base price. */
export const settleManpowerCostFor = (actor: SettleActorLike): number =>
  actor.techIds ? Math.ceil(SETTLE_MANPOWER_COST * multiplicativeEffectForPlayer({ techIds: actor.techIds, ...(actor.domainIds ? { domainIds: actor.domainIds } : {}) }, "settleManpowerCostMult")) : SETTLE_MANPOWER_COST;
export type SettleRejection = { code: "INSUFFICIENT_MANPOWER" | "INSUFFICIENT_GOLD"; message: string };

// Manpower-economy rewrite:
// Settle is now gated on manpower as its primary cost — check manpower first
// so a manpower-poor player sees INSUFFICIENT_MANPOWER, not a stale gold
// rejection, even though the (now-nominal) gold cost still applies too.
export const settleRejectionForActor = (actor: SettleActorLike): SettleRejection | null => {
  const manpowerCost = settleManpowerCostFor(actor);
  if (actor.manpower < manpowerCost) {
    return { code: "INSUFFICIENT_MANPOWER", message: `need ${manpowerCost} manpower to garrison` };
  }
  if (actor.points < SETTLE_COST) {
    return { code: "INSUFFICIENT_GOLD", message: "insufficient coin to garrison" };
  }
  return null;
};

export const applySettleCost = (actor: SettleActorLike): void => {
  actor.points -= SETTLE_COST;
  actor.manpower -= settleManpowerCostFor(actor);
};

export const refundSettleCost = (actor: SettleActorLike, goldCost: number, manpowerCap: number): void => {
  actor.points += goldCost;
  creditManpower(actor, settleManpowerCostFor(actor), manpowerCap);
};

// Garrison time equals the EXPAND (frontier claim) time on the same tile --
// one shared formula, forest/hills included (shared garrison-duration.ts).
export const settlementBaseDurationMsForTile = (tile: Pick<DomainTileState, "x" | "y">): number =>
  garrisonBaseDurationMsAt(tile.x, tile.y);

export const settlementDurationMsForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">,
  baseDurationMs: number
): number => {
  const speedMultiplier = multiplicativeEffectForPlayer(player, "settlementSpeedMult");
  return Math.max(1, Math.round(baseDurationMs / speedMultiplier));
};
