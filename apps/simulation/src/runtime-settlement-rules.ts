import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { grassShadeAt, landBiomeAt, terrainAt } from "@border-empires/shared";

import { multiplicativeEffectForPlayer } from "./tech-domain-bridge.js";

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
