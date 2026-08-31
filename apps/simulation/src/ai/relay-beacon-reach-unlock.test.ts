import { describe, expect, it } from "vitest";

import type { StructurePlannerTile } from "./structure-command-planner.js";
import { chooseBestRelayBeaconBuild } from "./relay-beacon-command-planner.js";

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

const REACH_RADIUS_FOR_TESTS = 5; // mirrors OUTPOST_REACH_RADIUS (config.ts) — not imported to keep this file's fixtures self-contained.

/**
 * Fills every cell in `radius` of each center with a known, non-LAND filler
 * tile (SEA — excluded by the `terrain !== "LAND"` check same as any other
 * non-LAND tile), so a test's lookup map represents "everything else here is
 * already known and uninteresting" instead of "never delivered to this
 * player" (fog). Required since UNEXPLORED_TILE_COVERAGE_WEIGHT
 * (relay-beacon-command-planner.ts) now scores any scanned cell absent from
 * the lookup map as unexplored — a synthetic test map that just omits the
 * "rest of the world" would otherwise silently score dozens of phantom fog
 * tiles per candidate. Real filler tiles are added first, so an explicit
 * tile passed after (Map construction keeps the last write per key) always
 * wins — pass filler tiles before your test's real tiles into lookupOf.
 */
const knownVoid = (centers: readonly { x: number; y: number }[], radius = REACH_RADIUS_FOR_TESTS): StructurePlannerTile[] => {
  const seen = new Set<string>();
  const filler: StructurePlannerTile[] = [];
  for (const center of centers) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = center.x + dx;
        const y = center.y + dy;
        const key = `${x},${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        filler.push(tile({ x, y, terrain: "SEA", ownerId: undefined, ownershipState: undefined }));
      }
    }
  }
  return filler;
};

describe("relay beacon unlocks a reach-locked AI", () => {
  it("selects an owned FRONTIER site and reports needsSettle so the caller settles first", () => {
    // A frontier tile with a resource tile just out of reach beside it — the
    // exact shape of "my only remaining ground is frontier, and there is a
    // prize next to it". Before this change no frontier tile was ever a
    // candidate, so a reach-locked AI found no beacon site at all.
    const site = tile({ x: 100, y: 100, ownershipState: "FRONTIER" });
    const prize = tile({ x: 102, y: 100, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [...knownVoid([{ x: 100, y: 100 }]), site, prize];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 122, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [site]
    );

    expect(plan).toBeDefined();
    expect(plan?.tile.x).toBe(100);
    expect(plan?.tile.y).toBe(100);
    expect(plan?.needsSettle).toBe(true);
  });

  it("prefers an equally-placed SETTLED site over a FRONTIER one (no needless settle)", () => {
    const frontierSite = tile({ x: 100, y: 100, ownershipState: "FRONTIER" });
    const settledSite = tile({ x: 100, y: 102, ownershipState: "SETTLED" });
    // One prize reachable from both candidate sites — distance ≥ 2 from each
    // (Chebyshev distance 1 is plain-EXPAND range, excluded from beacon
    // coverage; see estimateNewReachCoverage's doc).
    const prize = tile({ x: 100, y: 104, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [
      ...knownVoid([
        { x: 100, y: 100 },
        { x: 100, y: 102 }
      ]),
      frontierSite,
      settledSite,
      prize
    ];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 122, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [frontierSite, settledSite]
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
    const tiles = [...knownVoid([{ x: 100, y: 100 }]), site, plainLand];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [site]
    );

    expect(plan).toBeDefined();
    expect(plan?.tile.x).toBe(100);
    expect(plan?.tile.y).toBe(100);
    // One plain unowned LAND tile in scan radius, weight 1 — the floor value
    // scoreBuildBeacon's graduated consideration (decisions.ts) treats as
    // "not worth it" (RELAY_BEACON_SITE_VALUE_FLOOR). See that file's
    // "graduated on site value" tests for the scoring side of this.
    expect(plan?.siteValue).toBe(1);
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
    const tiles = [
      ...knownVoid([
        { x: 50, y: 50 },
        { x: 150, y: 150 }
      ]),
      plainSite,
      plainLand,
      valuableSite,
      prize
    ];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [plainSite, valuableSite]
    );

    expect(plan?.tile.x).toBe(150);
    expect(plan?.tile.y).toBe(150);
    // One valuable tile (VALUABLE_TARGET_COVERAGE_WEIGHT=8) in scan radius —
    // well above the floor, so this site would score meaningfully on
    // scoreBuildBeacon's graduated consideration, unlike the plain-land-only
    // site above.
    expect(plan?.siteValue).toBe(8);
  });

  it("still refuses a site whose scan reveals literally nothing new (fully boxed in)", () => {
    const site = tile({ x: 100, y: 100, ownershipState: "SETTLED" });
    // Every cell in the scan box is known and either owned by this player or
    // non-LAND — genuinely nothing left to newly cover, unlike the "just
    // never synced" case fog-scoring now treats as explorable.
    const ownedFiller = knownVoid([{ x: 100, y: 100 }]).map((t) => ({ ...t, terrain: "LAND" as const, ownerId: "ai-1" }));
    const tiles = [...ownedFiller, site];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [site]
    );

    expect(plan).toBeUndefined();
  });
});

describe("relay beacon values unexplored (fogged) tiles, not just currently-visible ones", () => {
  // Confirmed live: beacon site scoring only ever looked at tiles already
  // delivered to the AI worker (tilesByKey) — a candidate whose scan radius
  // pushed vision into genuinely fresh fog scored identically to one that
  // revealed nothing at all, because an absent map entry contributed 0. That
  // meant beacon placement was blind to the entire point of building one:
  // pushing reach (and vision) 5 tiles further out. See
  // UNEXPLORED_TILE_COVERAGE_WEIGHT's doc in relay-beacon-command-planner.ts.

  it("scores a site bordering genuine fog above a site whose whole scan radius is already known-empty", () => {
    const knownEmptySite = tile({ x: 50, y: 50, ownershipState: "SETTLED" });
    const foggedSite = tile({ x: 150, y: 150, ownershipState: "SETTLED" });
    const tiles = [
      // knownEmptySite's entire radius is explicitly known and uninteresting.
      ...knownVoid([{ x: 50, y: 50 }]),
      knownEmptySite,
      // foggedSite's radius is left almost entirely absent from the lookup —
      // genuine fog on every side.
      foggedSite
    ];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [knownEmptySite, foggedSite]
    );

    expect(plan).toBeDefined();
    expect(plan?.tile.x).toBe(150);
    expect(plan?.tile.y).toBe(150);
    // 120 fogged cells, but UNEXPLORED_TILE_SAMPLE_CAP (4) caps the credit —
    // see that constant's doc for why raw fog-tile count can't be allowed to
    // score unbounded (it would otherwise dwarf even an urgent economic
    // build need).
    expect(plan?.siteValue).toBe(4 * 4);
  });

  it("a large purely-fogged area can still outscore a single confirmed valuable tile, but only up to the sample cap", () => {
    const foggedOnlySite = tile({ x: 50, y: 50, ownershipState: "SETTLED" });
    const valuableSite = tile({ x: 150, y: 150, ownershipState: "SETTLED" });
    // Surround valuableSite's radius with known-empty filler except for one
    // real prize, so its score is dominated by the single valuable tile
    // rather than also picking up fog credit.
    const prize = tile({ x: 152, y: 150, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [valuableSite, ...knownVoid([{ x: 150, y: 150 }]), prize, foggedOnlySite];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [foggedOnlySite, valuableSite]
    );

    // Capped fog credit (4 * 4 = 16) still beats one valuable tile (8) on raw
    // score — by design, per the live "AI should keep pushing beacons to
    // both open new territory and reveal fog" direction, a huge unexplored
    // area outweighs a single already-known prize. This test exists to make
    // that trade-off explicit and intentional, not to assert the opposite.
    expect(plan?.tile.x).toBe(50);
    expect(plan?.tile.y).toBe(50);
  });
});

describe("relay beacon coverage excludes ground an existing beacon already claims", () => {
  // Regression: gatherReachAnchors (runtime.ts) only grants real reach once a
  // beacon's status flips to "active" — a beacon mid-construction contributes
  // nothing yet. A player can have several builds in flight at once
  // (DEVELOPMENT_PROCESS_LIMIT = 3), so before this fix, two beacon
  // candidates proposed a few ticks apart could each see the same unclaimed
  // land as "new" coverage, since estimateNewReachCoverage only excluded
  // tiles already OWNED — not tiles a sibling beacon (finished or still
  // under construction) was already about to cover. That let the AI queue
  // several beacons clustered right next to each other.

  it("scores a candidate lower when its coverage overlaps an existing (still-constructing) beacon's radius", () => {
    // existingBeacon's own reach radius (OUTPOST_REACH_RADIUS = 5) already
    // covers `prize` at distance 2 — a second candidate 3 tiles further out
    // whose own radius also reaches `prize` shouldn't get credit for it.
    const existingBeacon = tile({
      x: 100,
      y: 100,
      economicStructure: { ownerId: "ai-1", type: "RELAY_BEACON", status: "under_construction" }
    });
    const candidate = tile({ x: 103, y: 100, ownershipState: "SETTLED" });
    const prize = tile({ x: 102, y: 100, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [...knownVoid([{ x: 103, y: 100 }]), existingBeacon, candidate, prize];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [candidate]
    );

    // prize sits within existingBeacon's radius, so it's excluded from
    // candidate's coverage score — nothing else unowned (or fogged, since
    // knownVoid fills candidate's whole radius) is in range.
    expect(plan).toBeUndefined();
  });

  it("does NOT exclude a beacon's radius once it's queued for removal (nothing left to double-claim)", () => {
    // A beacon mid-demolition ("removing") is not defending anything and
    // never will again — its radius must NOT be treated as claimed, or a
    // genuinely open prize right next to it could never be proposed again.
    const removingBeacon = tile({
      x: 100,
      y: 100,
      economicStructure: { ownerId: "ai-1", type: "RELAY_BEACON", status: "removing" }
    });
    const candidate = tile({ x: 103, y: 100, ownershipState: "SETTLED" });
    // Distance ≥ 2 from BOTH candidate and removingBeacon — Chebyshev
    // distance 1 from any owned tile is plain-EXPAND range, excluded from
    // beacon coverage regardless of which owned tile it's adjacent to.
    const prize = tile({ x: 98, y: 100, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [...knownVoid([{ x: 103, y: 100 }]), removingBeacon, candidate, prize];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [candidate]
    );

    expect(plan?.tile.x).toBe(103);
    expect(plan?.siteValue).toBe(8);
  });

  it("still scores a candidate normally when its coverage lies outside every existing beacon's radius", () => {
    const existingBeacon = tile({
      x: 100,
      y: 100,
      economicStructure: { ownerId: "ai-1", type: "RELAY_BEACON", status: "active" }
    });
    const candidate = tile({ x: 200, y: 100, ownershipState: "SETTLED" });
    const prize = tile({ x: 202, y: 100, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [...knownVoid([{ x: 200, y: 100 }]), existingBeacon, candidate, prize];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [candidate]
    );

    expect(plan?.tile.x).toBe(200);
    expect(plan?.siteValue).toBe(8);
  });
});
