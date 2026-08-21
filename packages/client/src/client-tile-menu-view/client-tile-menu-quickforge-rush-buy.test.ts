import { describe, expect, it } from "vitest";

import { constructionProgressForTile } from "./client-tile-menu-view.js";
import type { Tile } from "../client-types.js";

describe("Quickforge rush-buy price preview", () => {
  it("discounts the rush-buy preview by 40 gold when the viewer owns an unused Quickforge today, but not once it's been used", () => {
    const nowMs = Date.now();
    const tile: Tile = {
      x: 90,
      y: 329,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: {
        ownerId: "me",
        type: "RELAY_BEACON",
        status: "under_construction",
        completesAt: nowMs + 60_000 // still mostly remaining -> a price bigger than 40
      }
    };

    const withoutQuickforge = constructionProgressForTile(tile, () => "1:00", { hasQuickforge: false, wonderLastFreeRushBuyAt: 0, nowMs });
    const withUnusedQuickforge = constructionProgressForTile(tile, () => "1:00", { hasQuickforge: true, wonderLastFreeRushBuyAt: 0, nowMs });
    const withUsedQuickforge = constructionProgressForTile(tile, () => "1:00", { hasQuickforge: true, wonderLastFreeRushBuyAt: nowMs, nowMs });

    const priceOf = (label: string | undefined) => Number(label?.match(/💰(\d+)/)?.[1]);
    const basePrice = priceOf(withoutQuickforge?.rushBuyLabel);
    expect(priceOf(withUnusedQuickforge?.rushBuyLabel)).toBe(Math.max(0, basePrice - 40));
    expect(priceOf(withUsedQuickforge?.rushBuyLabel)).toBe(basePrice);
  });
});
