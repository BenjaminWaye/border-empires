import { describe, expect, it } from "vitest";
import { buildLivePlayerEconomySnapshot } from "./live-economy-snapshot.js";

// Regression test for the Harbor Exchange dock-gold bug:
// domainTilesByKey (built via toDomainTile, snapshot-tile-cache.ts) used to
// omit economicStructure entirely, so dockSupportedByHarborExchange
// (economy-network.ts) could never see a real Harbor Exchange on the
// cold/reconnect snapshot path (buildLivePlayerEconomySnapshot) even though
// the live incremental path (player-update-economy.ts, which threads its
// own DomainTileState territory index) detected it correctly. Fixed by
// having toDomainTile parse and include economicStructure.
const dockTile = (overrides: Record<string, unknown>) => ({
  terrain: "LAND",
  ownerId: "p1",
  ownershipState: "SETTLED",
  ...overrides
});

const runtimeWithDocks = (harborExchangeJson?: string) => ({
  terrainEpoch: 1,
  tiles: [
    dockTile({ x: 0, y: 0, dockId: "dockA" }),
    dockTile({ x: 5, y: 5, dockId: "dockB" }),
    // Harbor Exchange adjacent (8-neighbor) to dockA.
    ...(harborExchangeJson
      ? [dockTile({ x: 1, y: 0, economicStructureJson: harborExchangeJson })]
      : []),
    // §5.4: a FISH tile gives the Harbor Exchange's own 1 FOOD slot demand
    // (§12) real supply, so it isn't itself FOOD-dormant — a dormant
    // structure is excluded from dockSupportedByHarborExchange regardless of
    // this bug, which would otherwise mask the fix being tested here.
    dockTile({ x: 9, y: 9, resource: "FISH" })
  ],
  players: [{ id: "p1" }],
  docks: [
    { dockId: "dockA", tileKey: "0,0", pairedDockId: "dockB" },
    { dockId: "dockB", tileKey: "5,5", pairedDockId: "dockA" }
  ]
});

const dockGoldSourceAmount = (snapshot: ReturnType<typeof buildLivePlayerEconomySnapshot>): number =>
  snapshot.economyBreakdown.GOLD.sources.find((bucket) => bucket.label === "Docks")?.amountPerMinute ?? 0;

describe("buildLivePlayerEconomySnapshot — Harbor Exchange dock-gold bonus", () => {
  it("adds a Harbor Exchange bonus to dock gold once economicStructure is visible on the reconnect path", () => {
    const withoutHarborExchange = buildLivePlayerEconomySnapshot("p1", runtimeWithDocks() as never);
    const withHarborExchange = buildLivePlayerEconomySnapshot(
      "p1",
      runtimeWithDocks(JSON.stringify({ type: "HARBOR_EXCHANGE", status: "active", ownerId: "p1" })) as never
    );
    expect(dockGoldSourceAmount(withHarborExchange)).toBeGreaterThan(dockGoldSourceAmount(withoutHarborExchange));
  });

  it("does not apply the bonus when the adjacent Harbor Exchange is still under construction", () => {
    const underConstruction = buildLivePlayerEconomySnapshot(
      "p1",
      runtimeWithDocks(JSON.stringify({ type: "HARBOR_EXCHANGE", status: "under_construction", ownerId: "p1" })) as never
    );
    const noStructure = buildLivePlayerEconomySnapshot("p1", runtimeWithDocks() as never);
    expect(dockGoldSourceAmount(underConstruction)).toBeCloseTo(dockGoldSourceAmount(noStructure), 10);
  });
});
