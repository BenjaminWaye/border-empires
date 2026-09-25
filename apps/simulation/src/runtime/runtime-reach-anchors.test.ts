import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { gatherReachAnchors, newlyActivatedReachAnchors, newlyDeactivatedReachAnchors } from "./runtime-reach-anchors.js";
import { createEmptyPlayerRuntimeSummary } from "../player-runtime-summary.js";

// Regression coverage for the AFC-as-reach-anchor fix (Phase 6, docs/
// manifest-tree-mapping-plan.md): before this fix, a House whose only tile
// was its Automated Fabrication Complex projected zero reach (gatherReachAnchors
// keyed reach strictly off ownedTownTierByTile), so its very first SETTLE/
// EXPAND was rejected OUT_OF_REACH -- reachable only via a real town, which
// the AFC deliberately never has.

const afcTile = (overrides: Partial<DomainTileState> = {}): DomainTileState => ({
  x: 10,
  y: 12,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "SETTLED",
  afc: { ownerId: "player-1", status: "active" },
  ...overrides
});

describe("AFC reach anchors", () => {
  it("gatherReachAnchors projects a TOWN-kind anchor from an owned, settled AFC tile", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    summary.ownedAfcTileKeys.add("10,12");
    const tiles = new Map<string, DomainTileState>([["10,12", afcTile()]]);

    const anchors = gatherReachAnchors({
      playerSummaries: new Map([["player-1", summary]]),
      tiles,
      activeRelayBeaconsByOwner: new Map(),
      activeSiegeOutpostsByOwner: new Map(),
      docks: [],
      tileSettledAtByKey: new Map(),
      now: 1000
    });

    expect(anchors).toEqual([{ x: 10, y: 12, ownerId: "player-1", activatedAt: 1000, kind: "TOWN" }]);
  });

  it("does not project an anchor for an AFC tile that is not SETTLED", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    summary.ownedAfcTileKeys.add("10,12");
    const tiles = new Map<string, DomainTileState>([["10,12", afcTile({ ownershipState: "FRONTIER" })]]);

    const anchors = gatherReachAnchors({
      playerSummaries: new Map([["player-1", summary]]),
      tiles,
      activeRelayBeaconsByOwner: new Map(),
      activeSiegeOutpostsByOwner: new Map(),
      docks: [],
      tileSettledAtByKey: new Map(),
      now: 1000
    });

    expect(anchors).toEqual([]);
  });

  it("newlyActivatedReachAnchors fires a TOWN anchor when a tile gains an AFC", () => {
    const anchors = newlyActivatedReachAnchors(undefined, afcTile(), 2000);
    expect(anchors).toEqual([{ x: 10, y: 12, ownerId: "player-1", activatedAt: 2000, kind: "TOWN" }]);
  });

  it("newlyDeactivatedReachAnchors fires when an AFC-owning tile is unsettled", () => {
    const previous = afcTile();
    const downgraded: DomainTileState = { ...previous, ownershipState: "FRONTIER" };
    const anchors = newlyDeactivatedReachAnchors(previous, downgraded, 3000);
    expect(anchors).toEqual([{ x: 10, y: 12, ownerId: "player-1", activatedAt: 3000, kind: "TOWN" }]);
  });
});
