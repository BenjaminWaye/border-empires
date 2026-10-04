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

// Regression: a barbarian that captured a player's town/dock/beacon used to
// become a live reach anchor for `barbarian-1` (barb tiles go SETTLED the
// instant they win and keep the structure), so a fresh spawn next to it lost
// every contested reach tile -- the AFC owner saw almost no reach around it.
// Barbarian land is environment: it holds no anchors.
describe("barbarian-owned tiles hold no reach anchors", () => {
  const barbTown = (overrides: Partial<DomainTileState> = {}): DomainTileState => ({
    x: 14,
    y: 12,
    terrain: "LAND",
    ownerId: "barbarian-1",
    ownershipState: "SETTLED",
    town: { name: "Captured", type: "FARMING", populationTier: "SETTLEMENT" },
    ...overrides
  });
  const gather = (overrides: Partial<Parameters<typeof gatherReachAnchors>[0]>) =>
    gatherReachAnchors({
      playerSummaries: new Map(),
      tiles: new Map(),
      activeRelayBeaconsByOwner: new Map(),
      activeSiegeOutpostsByOwner: new Map(),
      docks: [],
      tileSettledAtByKey: new Map(),
      now: 1000,
      ...overrides
    });

  it("gatherReachAnchors skips a barbarian's town tiles but keeps a player's", () => {
    const barbSummary = createEmptyPlayerRuntimeSummary();
    barbSummary.ownedTownTierByTile.set("14,12", "SETTLEMENT");
    const playerSummary = createEmptyPlayerRuntimeSummary();
    playerSummary.ownedAfcTileKeys.add("10,12");
    const anchors = gather({
      playerSummaries: new Map([
        ["barbarian-1", barbSummary],
        ["player-1", playerSummary]
      ]),
      tiles: new Map([
        ["14,12", barbTown()],
        ["10,12", afcTile()]
      ])
    });
    expect(anchors.map((anchor) => anchor.ownerId)).toEqual(["player-1"]);
  });

  it("gatherReachAnchors skips barbarian-owned beacons, siege outposts and docks", () => {
    const tiles = new Map<string, DomainTileState>([
      ["20,20", { x: 20, y: 20, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" }],
      ["21,20", { x: 21, y: 20, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" }],
      ["22,20", { x: 22, y: 20, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED", dockId: "dock-1" }]
    ]);
    const anchors = gather({
      tiles,
      activeRelayBeaconsByOwner: new Map([["barbarian-1", new Set(["20,20"])]]),
      activeSiegeOutpostsByOwner: new Map([["barbarian-1", new Set(["21,20"])]]),
      docks: [{ dockId: "dock-1", tileKey: "22,20", pairedDockId: "dock-2", connectedDockIds: [] }]
    });
    expect(anchors).toEqual([]);
  });

  it("a barbarian capturing a player's town deactivates the player's anchor and activates none for the barbarian", () => {
    const owned: DomainTileState = { ...barbTown(), ownerId: "player-1", town: barbTown().town! };
    const captured = barbTown();
    expect(newlyActivatedReachAnchors(owned, captured, 4000)).toEqual([]);
    expect(newlyDeactivatedReachAnchors(owned, captured, 4000)).toEqual([
      { x: 14, y: 12, ownerId: "player-1", activatedAt: 4000, kind: "TOWN" }
    ]);
  });

  it("a player recapturing a barbarian-held town activates the player's anchor and reports no barbarian deactivation", () => {
    const heldByBarb = barbTown();
    const recaptured: DomainTileState = { ...heldByBarb, ownerId: "player-1" };
    expect(newlyActivatedReachAnchors(heldByBarb, recaptured, 5000)).toEqual([
      { x: 14, y: 12, ownerId: "player-1", activatedAt: 5000, kind: "TOWN" }
    ]);
    expect(newlyDeactivatedReachAnchors(heldByBarb, recaptured, 5000)).toEqual([]);
  });
});
