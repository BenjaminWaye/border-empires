// §6.3 rush-buy + Quickforge wonder: split out of client-tile-menu-view.ts
// (file-line growth cap) — the client-side price preview needs to replicate
// the server's Quickforge once-per-UTC-day discount (quickforgeAdjustedRushPrice,
// same shared formula the server uses at apps/simulation/src/runtime-natural-wonders.ts)
// so the "⏩💰N" chip isn't just wrong whenever the viewer owns the wonder.
import { quickforgeAdjustedRushPrice, rushBuyPriceGold } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

export type QuickforgeRushBuyContext = { hasQuickforge: boolean; wonderLastFreeRushBuyAt: number; nowMs: number };

export const rushBuyLabel = (remainingMs: number, totalMs: number, manpowerCost: number, quickforge: QuickforgeRushBuyContext): string => {
  const basePrice = rushBuyPriceGold(remainingMs, totalMs, manpowerCost);
  const price = quickforgeAdjustedRushPrice(quickforge.hasQuickforge, basePrice, quickforge.wonderLastFreeRushBuyAt, quickforge.nowMs);
  return `⏩ 💰${price}`;
};

// Whether the viewer owns a settled tile carrying the given natural wonder
// type — the same "owns this wonder" test the server derives per-player
// from settled tiles (refreshPlayerWonders in
// apps/simulation/src/runtime-natural-wonders.ts), reimplemented client-side
// since wonder ownership itself isn't sent to the client as a flag.
export const viewerOwnsWonderType = (tiles: ReadonlyMap<string, Tile>, viewerId: string, wonderType: string): boolean => {
  for (const tile of tiles.values()) {
    if (tile.ownerId === viewerId && tile.ownershipState === "SETTLED" && tile.naturalWonder?.type === wonderType) return true;
  }
  return false;
};

// Convenience for callers (client-action-flow.ts) that just want "the
// Quickforge context for the current viewer" in one call.
export const quickforgeRushBuyContextForState = (state: { tiles: ReadonlyMap<string, Tile>; me: string; wonderLastFreeRushBuyAt?: number | undefined }): QuickforgeRushBuyContext => ({
  hasQuickforge: viewerOwnsWonderType(state.tiles, state.me, "QUICKFORGE"),
  wonderLastFreeRushBuyAt: state.wonderLastFreeRushBuyAt ?? 0,
  nowMs: Date.now()
});
