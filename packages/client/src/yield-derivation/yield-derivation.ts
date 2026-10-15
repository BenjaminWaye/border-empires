/**
 * Client-side yield-rate derivation.
 *
 * Imports constants from @border-empires/game-domain (shared package) to avoid
 * drift with apps/simulation/src/tile-yield-view.ts. Derives a tile's gold
 * yieldRate from tile data that is already present in the bootstrap payload
 * (townJson, dockId), so it doesn't need to be sent as a per-tile field
 * (PR A of bootstrap-payload-shrink). Tiles only produce gold directly —
 * strategic resources are slot-based — and never store yield.
 */

import {
  DOCK_CONNECTION_BONUS_PER_LINK_DEFAULT,
  DOCK_INCOME_PER_MIN,
  HARBOR_EXCHANGE_GOLD_PER_CONNECTED_DOCK,
  PASSIVE_INCOME_MULT,
  SETTLEMENT_BASE_GOLD_PER_MIN
} from "@border-empires/game-domain";

// Mirrors dockBaseGoldPerMinuteForPlayer's shape (apps/simulation/src/economy-network/economy-network.ts):
// base income + a per-connected-dock connection bonus, plus a flat
// per-connected-dock Harbor Exchange bonus when supported by an active,
// owned HARBOR_EXCHANGE. The client cannot see per-player tech multipliers
// (dockGoldOutputMultiplierForPlayer, wonderDockGoldMultiplier), so this
// uses the default connection-bonus rate absent tech overrides — a known
// approximation, same limitation as the rest of this module's dock income
// handling. Used for the tile menu's "Dock income" display so it reflects
// the connection and Harbor Exchange bonuses instead of a flat constant.
export const dockDisplayGoldPerMinute = (
  connectedDockCount: number,
  supportedByCustomsHouse: boolean
): number => {
  const base =
    DOCK_INCOME_PER_MIN *
    PASSIVE_INCOME_MULT *
    (1 + DOCK_CONNECTION_BONUS_PER_LINK_DEFAULT * connectedDockCount);
  const harborExchangeBonus = supportedByCustomsHouse
    ? HARBOR_EXCHANGE_GOLD_PER_CONNECTED_DOCK * connectedDockCount
    : 0;
  return base + harborExchangeBonus;
};

type YieldInput = {
  town?: { goldPerMinute?: number; populationTier?: string } | null;
  dockId?: string | null;
  sabotage?: { endsAt: number; outputMultiplier: number } | null;
};

export type TileYieldRate = { goldPerMinute: number };

export const deriveTileYieldRate = (
  tile: YieldInput,
  incomeMultiplier = 1.0
): TileYieldRate | undefined => {
  const townGoldPerMinute = (() => {
    if (!tile.town) return 0;
    // Persisted goldPerMinute already includes all sim-computed bonuses
    // (connected towns, population tier, mintworks, bank, income modifier).
    if (typeof tile.town.goldPerMinute === "number" && tile.town.goldPerMinute > 0.0001) {
      return tile.town.goldPerMinute;
    }
    // Fallback for new settlements before their first economy tick populates
    // the field — matches the sim's SETTLEMENT path in buildTileYieldView.
    if (
      !tile.town.populationTier ||
      tile.town.populationTier === "SETTLEMENT"
    ) {
      return SETTLEMENT_BASE_GOLD_PER_MIN * incomeMultiplier * PASSIVE_INCOME_MULT;
    }
    return 0;
  })();
  // Dock income: client lacks dock-link topology and dock-specific tech
  // multipliers, so we apply the closest available proxy (player income
  // modifier). Technically the sim uses dockGoldOutputMultiplierForPlayer
  // which is a different tech effect, but in practice they track closely.
  // The dock chain bonus (+50% per paired dock) cannot be derived without
  // topology data; known limitation.
  const dockGoldPerMinute = tile.dockId
    ? DOCK_INCOME_PER_MIN * PASSIVE_INCOME_MULT * incomeMultiplier
    : 0;
  const outputMultiplier = tile.sabotage && tile.sabotage.endsAt > Date.now() ? Math.max(0, Math.min(1, tile.sabotage.outputMultiplier)) : 1;
  const goldPerMinute = (townGoldPerMinute + dockGoldPerMinute) * outputMultiplier;

  if (goldPerMinute < 0.0001) return undefined;
  return { goldPerMinute: roundPositive(goldPerMinute, 4) };
};

/** Derive and attach yieldRate to a tile object if missing. */
export const ensureTileYield = <T extends YieldInput & { yieldRate?: TileYieldRate }>(
  tile: T,
  incomeMultiplier = 1.0
): T => {
  if (!tile.yieldRate) {
    const rate = deriveTileYieldRate(tile, incomeMultiplier);
    if (rate) (tile as Record<string, unknown>).yieldRate = rate;
  }
  return tile;
};

const roundPositive = (value: number, digits: number): number => {
  if (!(value > 0.0001)) return 0;
  return Number(value.toFixed(digits));
};
