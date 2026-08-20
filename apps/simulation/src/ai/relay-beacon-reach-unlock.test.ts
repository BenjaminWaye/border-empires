import { describe, expect, it } from "vitest";

import { chooseBestRelayBeaconBuild, type StructurePlannerTile } from "./structure-command-planner.js";

/**
 * Regression cover for the reach-lock deadlock observed on staging: five AI
 * players sat completely idle for 15+ minutes, having claimed every tile
 * inside their reach and holding hundreds of FRONTIER tiles they could never
 * convert. The AI has no standalone SETTLE decision (deliberate), so its only
 * escape is a RELAY_BEACON — and it was blocked: beacon sites were
 * restricted to already-SETTLED tiles, so a reach-locked AI (whose remaining
 * ground was all FRONTIER) found no beacon site at all.
 *
 * (The build's other precondition, isReachStarved, was later removed
 * entirely — decisions.ts's scoreBuildBeacon now gates on the same three
 * plain fields BUILD_BEACON always needed: a site exists, a dev slot is
 * free, and no enemy is at the frontier right now. See decisions.ts's
 * scoreBuildBeacon doc comment for why the bundled precondition function
 * was replaced with direct, individually-understandable checks.)
 */

const tile = (over: Partial<StructurePlannerTile> = {}): StructurePlannerTile => ({
  x: 100,
  y: 100,
  terrain: "LAND",
  ownerId: "ai-1",
  ownershipState: "SETTLED",
  ...over
});

const lookupOf = (tiles: readonly StructurePlannerTile[]): Map<string, StructurePlannerTile> =>
  new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));

describe("relay beacon unlocks a reach-locked AI", () => {
  it("selects an owned FRONTIER site and reports needsSettle so the caller settles first", () => {
    // A frontier tile with a resource tile just out of reach beside it — the
    // exact shape of "my only remaining ground is frontier, and there is a
    // prize next to it". Before this change no frontier tile was ever a
    // candidate, so a reach-locked AI found no beacon site at all.
    const site = tile({ x: 100, y: 100, ownershipState: "FRONTIER" });
    const prize = tile({ x: 102, y: 100, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [site, prize];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 122, townCount: 3 },
      tiles,
      lookupOf(tiles),
      tiles
    );

    expect(plan).toBeDefined();
    expect(plan?.tile.x).toBe(100);
    expect(plan?.tile.y).toBe(100);
    expect(plan?.needsSettle).toBe(true);
  });

  it("prefers an equally-placed SETTLED site over a FRONTIER one (no needless settle)", () => {
    const frontierSite = tile({ x: 100, y: 100, ownershipState: "FRONTIER" });
    const settledSite = tile({ x: 100, y: 102, ownershipState: "SETTLED" });
    // One prize reachable from both candidate sites.
    const prize = tile({ x: 100, y: 101, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [frontierSite, settledSite, prize];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 122, townCount: 3 },
      tiles,
      lookupOf(tiles),
      tiles
    );

    expect(plan?.needsSettle).toBe(false);
    expect(plan?.tile.y).toBe(102);
  });
});

describe("relay beacon fires without an already-visible prize (maximize newly-revealed land)", () => {
  // Regression for a second live dead end: chooseBestRelayBeaconBuild used
  // to require a KNOWN town/resource/dock/wonder tile in a candidate's scan
  // radius before proposing it at all — but that scan only sees tiles
  // already synced locally, so genuinely new ground just past current
  // vision was invisible to it. Once ordinary EXPAND stopped (nothing
  // adjacent+in-reach worth claiming), there was no longer any mechanism
  // left that could reveal new fog, so an AI could get stuck on WAIT
  // forever even with real, unclaimed land plausibly one step further out.
  // Confirmed live: multiple AI empires vetoed on every decision class
  // simultaneously with zero visible neutral candidates.

  it("proposes a site whose scan reveals only plain unowned land, no known valuable tile anywhere", () => {
    const site = tile({ x: 100, y: 100, ownershipState: "SETTLED" });
    // Plain, unowned, no resource/dock/town/wonder -- the exact "nothing
    // known is valuable nearby" scenario that used to make hasValuable
    // false and skip this candidate entirely.
    const plainLand = tile({ x: 102, y: 100, ownerId: undefined, ownershipState: undefined });
    const tiles = [site, plainLand];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      tiles
    );

    expect(plan).toBeDefined();
    expect(plan?.tile.x).toBe(100);
    expect(plan?.tile.y).toBe(100);
  });

  it("still prefers a site that reaches a known valuable tile over one that only reveals plain land", () => {
    // Two otherwise-equal candidate sites, on opposite sides of the AI's
    // territory: one's scan radius only reaches plain unowned land, the
    // other's reaches a real resource tile. VALUABLE_TARGET_COVERAGE_WEIGHT
    // must still make the valuable-adjacent site win.
    const plainSite = tile({ x: 50, y: 50, ownershipState: "SETTLED" });
    const plainLand = tile({ x: 52, y: 50, ownerId: undefined, ownershipState: undefined });
    const valuableSite = tile({ x: 150, y: 150, ownershipState: "SETTLED" });
    const prize = tile({ x: 152, y: 150, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [plainSite, plainLand, valuableSite, prize];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      tiles
    );

    expect(plan?.tile.x).toBe(150);
    expect(plan?.tile.y).toBe(150);
  });

  it("still refuses a site whose scan reveals literally nothing new (fully boxed in)", () => {
    const site = tile({ x: 100, y: 100, ownershipState: "SETTLED" });
    // Only tile in the map besides the candidate itself is also mine --
    // no unowned land anywhere in the scan radius.
    const ownLand = tile({ x: 102, y: 100 });
    const tiles = [site, ownLand];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      tiles
    );

    expect(plan).toBeUndefined();
  });
});
