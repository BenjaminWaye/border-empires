import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { buildSnapshotTileDetail } from "./tile-detail-snapshot.js";

// Kept in a dedicated file rather than added to tile-detail-snapshot.test.ts,
// which is already over the repo's 500-line cap (AGENTS.md: files already
// over the cap may not grow further).
describe("buildSnapshotTileDetail — converter structure GOLD upkeep is mode-aware", () => {
  // Regression: structureUpkeepPerMinute (tile-detail-snapshot.ts) always
  // reported the SYNTHESIZE-mode GOLD upkeep rate for converter structures
  // (Aether Condenser / CRYSTAL_SYNTHESIZER etc.), even when the structure
  // was actually in EXCHANGE (Sell Off) mode, which pays no gold upkeep
  // (economicStructureGoldUpkeepPerInterval in runtime-structure-rules.ts).
  // The tile-detail Upkeep panel showed a stale "40.0/day" GOLD charge next
  // to a status line correctly saying "No gold upkeep while selling off."
  it("omits the GOLD upkeep entry for a converter structure in EXCHANGE mode", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: 20,
          y: 20,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          economicStructureJson: JSON.stringify({ type: "CRYSTAL_SYNTHESIZER", status: "active", converterMode: "EXCHANGE" })
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 20, 20);

    expect(detail && "upkeepEntries" in detail).toBe(false);
  });

  it("still reports the GOLD upkeep entry for a converter structure in SYNTHESIZE mode", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: 21,
          y: 21,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          economicStructureJson: JSON.stringify({ type: "CRYSTAL_SYNTHESIZER", status: "active", converterMode: "SYNTHESIZE" })
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 21, 21);

    expect(detail?.upkeepEntries).toEqual([
      { label: "CRYSTAL_SYNTHESIZER", perMinute: { GOLD: expect.any(Number) } }
    ]);
  });

  it("defaults to SYNTHESIZE (reports GOLD upkeep) when converterMode is absent, matching back-compat elsewhere", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: 22,
          y: 22,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          economicStructureJson: JSON.stringify({ type: "CRYSTAL_SYNTHESIZER", status: "active" })
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 22, 22);

    expect(detail?.upkeepEntries).toEqual([
      { label: "CRYSTAL_SYNTHESIZER", perMinute: { GOLD: expect.any(Number) } }
    ]);
  });
});
