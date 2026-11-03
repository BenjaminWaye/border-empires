import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { SETTLE_COST, SETTLE_MANPOWER_COST, grassShadeAt, isHillsTileAt, landBiomeAt, terrainAt } from "@border-empires/shared";

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

export const SETTLE_DURATION_MS = 60_000;
export const FOREST_SETTLEMENT_MULT = 2;
// Hills are mutually exclusive with forest (see isHillsTileAt), so this never
// stacks with FOREST_SETTLEMENT_MULT — both terrains independently double
// settle time. (EXPAND-side forest/hills treatment is 1.5x, not 2x — the two
// mechanics are tuned independently.)
export const HILLS_SETTLEMENT_MULT = 2;

const isForestSettlementTile = (x: number, y: number): boolean =>
  terrainAt(x, y) === "LAND" &&
  landBiomeAt(x, y) === "GRASS" &&
  grassShadeAt(x, y) === "DARK";

export const settlementBaseDurationMsForTile = (tile: Pick<DomainTileState, "x" | "y">): number => {
  if (isForestSettlementTile(tile.x, tile.y)) return SETTLE_DURATION_MS * FOREST_SETTLEMENT_MULT;
  if (isHillsTileAt(tile.x, tile.y)) return SETTLE_DURATION_MS * HILLS_SETTLEMENT_MULT;
  return SETTLE_DURATION_MS;
};

export const settlementDurationMsForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">,
  baseDurationMs = SETTLE_DURATION_MS
): number => {
  const speedMultiplier = multiplicativeEffectForPlayer(player, "settlementSpeedMult");
  return Math.max(1, Math.round(baseDurationMs / speedMultiplier));
};
