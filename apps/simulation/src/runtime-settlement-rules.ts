import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { SETTLE_COST, SETTLE_MANPOWER_COST, grassShadeAt, landBiomeAt, terrainAt } from "@border-empires/shared";

import { multiplicativeEffectForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";

export type SettleActorLike = { points: number; manpower: number };
export type SettleRejection = { code: "INSUFFICIENT_MANPOWER" | "INSUFFICIENT_GOLD"; message: string };

// Manpower-economy rewrite (docs/manpower-economy-rewrite-plan.md §4.1-4.3):
// Settle is now gated on manpower as its primary cost — check manpower first
// so a manpower-poor player sees INSUFFICIENT_MANPOWER, not a stale gold
// rejection, even though the (now-nominal) gold cost still applies too.
export const settleRejectionForActor = (actor: SettleActorLike): SettleRejection | null => {
  if (actor.manpower < SETTLE_MANPOWER_COST) {
    return { code: "INSUFFICIENT_MANPOWER", message: `need ${SETTLE_MANPOWER_COST} manpower to settle` };
  }
  if (actor.points < SETTLE_COST) {
    return { code: "INSUFFICIENT_GOLD", message: "insufficient gold to settle" };
  }
  return null;
};

export const applySettleCost = (actor: SettleActorLike): void => {
  actor.points -= SETTLE_COST;
  actor.manpower -= SETTLE_MANPOWER_COST;
};

export const refundSettleCost = (actor: SettleActorLike, goldCost: number, manpowerCap: number): void => {
  actor.points += goldCost;
  actor.manpower = Math.min(manpowerCap, actor.manpower + SETTLE_MANPOWER_COST);
};

export const SETTLE_DURATION_MS = 60_000;
export const FOREST_SETTLEMENT_MULT = 2;
export const MAX_SETTLE_DURATION_MS = SETTLE_DURATION_MS * FOREST_SETTLEMENT_MULT;

const isForestSettlementTile = (x: number, y: number): boolean =>
  terrainAt(x, y) === "LAND" &&
  landBiomeAt(x, y) === "GRASS" &&
  grassShadeAt(x, y) === "DARK";

export const settlementBaseDurationMsForTile = (tile: Pick<DomainTileState, "x" | "y">): number =>
  isForestSettlementTile(tile.x, tile.y) ? SETTLE_DURATION_MS * FOREST_SETTLEMENT_MULT : SETTLE_DURATION_MS;

export const settlementDurationMsForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">,
  baseDurationMs = SETTLE_DURATION_MS
): number => {
  const speedMultiplier = multiplicativeEffectForPlayer(player, "settlementSpeedMult");
  return Math.max(1, Math.round(baseDurationMs / speedMultiplier));
};
