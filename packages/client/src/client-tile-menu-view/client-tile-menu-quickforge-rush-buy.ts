// §6.3 rush-buy + Quickforge wonder: split out of client-tile-menu-view.ts
// (file-line growth cap) — the client-side price preview needs to replicate
// the server's Quickforge once-per-UTC-day discount (quickforgeAdjustedRushPrice,
// same shared formula the server uses at apps/simulation/src/runtime-natural-wonders.ts)
// so the "Rush ◉N" chip isn't just wrong whenever the viewer owns the wonder.
import { isRedesignedRelic, relicRemainingUses, RELIC_RULES, quickforgeAdjustedRushPrice, rushBuyPriceGold } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import type { BuildSpeedState } from "../client-build-speed/client-build-speed.js";
import { structureManpowerCostForState } from "../client-structure-manpower-cost/client-structure-manpower-cost.js";

export type QuickforgeRushBuyContext = {
  hasQuickforge: boolean;
  hasNanofabricator?: boolean;
  wonderLastFreeRushBuyAt: number;
  nowMs: number;
  // The server prices a rush on the manpower the build actually charged
  // (after AFC discounts); absent means no discount.
  manpowerCostFor?: (structureType: string, baseCost: number) => number;
};

export const rushBuyLabel = (remainingMs: number, totalMs: number, structureType: string, baseManpowerCost: number, quickforge: QuickforgeRushBuyContext): string => {
  const manpowerCost = quickforge.manpowerCostFor?.(structureType, baseManpowerCost) ?? baseManpowerCost;
  const basePrice = rushBuyPriceGold(remainingMs, totalMs, manpowerCost);
  const price = quickforge.hasNanofabricator ? Math.max(0, basePrice - RELIC_RULES.nanoDiscount) : quickforgeAdjustedRushPrice(quickforge.hasQuickforge, basePrice, quickforge.wonderLastFreeRushBuyAt, quickforge.nowMs);
  return `Rush ◉${price}`;
};

// Whether the viewer owns a settled tile carrying the given natural wonder
// type — the same "owns this wonder" test the server derives per-player
// from settled tiles (refreshPlayerWonders in
// apps/simulation/src/runtime-natural-wonders.ts), reimplemented client-side
// since wonder ownership itself isn't sent to the client as a flag.
export const viewerOwnsWonderType = (tiles: ReadonlyMap<string, Tile>, viewerId: string, wonderType: string): boolean => {
  for (const tile of tiles.values()) {
    if (tile.ownerId === viewerId && tile.ownershipState === "SETTLED" && tile.naturalWonder?.type === wonderType && !isRedesignedRelic(tile.naturalWonder)) return true;
  }
  return false;
};

// Convenience for callers (client-action-flow.ts) that just want "the
// Quickforge context for the current viewer" in one call.
export const quickforgeRushBuyContextForState = (state: BuildSpeedState & { tiles: ReadonlyMap<string, Tile>; me: string; wonderLastFreeRushBuyAt?: number | undefined }): QuickforgeRushBuyContext => ({
  manpowerCostFor: (structureType, baseCost) => structureManpowerCostForState(state, structureType, baseCost),
  hasNanofabricator: [...state.tiles.values()].some(tile => tile.ownerId === state.me && tile.ownershipState === "SETTLED" && tile.naturalWonder?.type === "QUICKFORGE" && isRedesignedRelic(tile.naturalWonder) && (relicRemainingUses(tile.naturalWonder) ?? 0) > 0),
  hasQuickforge: viewerOwnsWonderType(state.tiles, state.me, "QUICKFORGE"),
  wonderLastFreeRushBuyAt: state.wonderLastFreeRushBuyAt ?? 0,
  nowMs: Date.now()
});
