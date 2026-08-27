import { describe, expect, it } from "vitest";

import { tileOverviewModifiersForTile } from "./client-tile-overview-modifiers.js";
import type { Tile } from "../client-types.js";

// Regression: switching a converter (Aether Condenser / CRYSTAL_SYNTHESIZER,
// Titanium Works, Umbrite Works) to Sell Off (EXCHANGE) mode always produced
// real gold (EXCHANGE_GOLD_PER_SLOT_PER_DAY, player-update-economy.ts), but
// the Modifiers panel showed nothing at all for it -- synthesizerModifiers
// (structure-modifier-catalog-economic.ts) returned undefined for EXCHANGE
// mode instead of surfacing the payout, so neither the structure's own tile
// nor the town overview ever displayed a "gold production" line for Sell Off
// mode. Split into its own file (rather than added to
// client-tile-overview-modifiers.test.ts) to keep that file under the repo's
// 500-line cap.
describe("tileOverviewModifiersForTile — converter Sell Off gold", () => {
  it("shows a Sell Off gold modifier for an Aether Condenser in EXCHANGE (Sell Off) mode", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "CRYSTAL_SYNTHESIZER", status: "active", converterMode: "EXCHANGE" }
    } satisfies Tile);
    expect(modifiers).toContainEqual({ reason: "Sell Off gold", effect: "+10/day", tone: "positive" });
  });
});
