import { describe, expect, it } from "vitest";
import { tileKey } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { computeLocalReachSet } from "../client-reach-overlay/client-reach-overlay.js";
import { bestRelayBeaconSites, isRelayBeaconPlacementTile, isRelayBeaconSiteCandidate } from "./client-relay-beacon-site.js";

const ME = "me";

const owned = (x: number, y: number, extra: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ownerId: ME, ownershipState: "SETTLED", ...extra });
const land = (x: number, y: number, extra: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ...extra });

const tilesMap = (tiles: Tile[]): Map<string, Tile> => new Map(tiles.map((t) => [tileKey(t.x, t.y), t]));

const sites = (tiles: Map<string, Tile>, options: { targets?: Array<{ x: number; y: number }>; limit?: number } = {}) =>
  bestRelayBeaconSites(tiles, ME, { reach: computeLocalReachSet(tiles, ME), ...options });

describe("isRelayBeaconPlacementTile", () => {
  it("accepts only owned, settled land without a blocking structure", () => {
    expect(isRelayBeaconPlacementTile(owned(0, 0), ME)).toBe(true);
    expect(isRelayBeaconPlacementTile(owned(0, 0, { ownershipState: "FRONTIER" }), ME)).toBe(false);
    expect(isRelayBeaconPlacementTile(owned(0, 0, { ownerId: "rival" }), ME)).toBe(false);
    expect(isRelayBeaconPlacementTile(owned(0, 0, { terrain: "SEA" }), ME)).toBe(false);
    expect(isRelayBeaconPlacementTile(owned(0, 0, { optimisticPending: "settle" }), ME)).toBe(false);
    expect(isRelayBeaconPlacementTile(owned(0, 0, { observatory: { ownerId: ME, status: "active" } }), ME)).toBe(false);
    expect(isRelayBeaconPlacementTile(undefined, ME)).toBe(false);
  });
});

describe("isRelayBeaconSiteCandidate", () => {
  it("also accepts owned FRONTIER land, which the tile menu garrisons and then builds on", () => {
    expect(isRelayBeaconSiteCandidate(owned(0, 0), ME)).toBe(true);
    expect(isRelayBeaconSiteCandidate(owned(0, 0, { ownershipState: "FRONTIER" }), ME)).toBe(true);
    expect(isRelayBeaconSiteCandidate(owned(0, 0, { ownershipState: "FRONTIER", ownerId: "rival" }), ME)).toBe(false);
    expect(isRelayBeaconSiteCandidate(owned(0, 0, { ownershipState: "FRONTIER", terrain: "SEA" }), ME)).toBe(false);
    expect(isRelayBeaconSiteCandidate(owned(0, 0, { ownershipState: "FRONTIER", optimisticPending: "settle" }), ME)).toBe(false);
    expect(isRelayBeaconSiteCandidate(owned(0, 0, { ownershipState: "FRONTIER", observatory: { ownerId: ME, status: "active" } }), ME)).toBe(false);
  });
});

// A just-landed AFC at (20,20): the AFC tile is the only SETTLED tile, its
// radius-3 reach was auto-claimed FRONTIER, the player sees radius 4
// (AFC_VISION_RADIUS), and nothing beyond has ever been seen.
const freshLanding = (): Map<string, Tile> => {
  const tiles = new Map<string, Tile>();
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const x = 20 + dx;
      const y = 20 + dy;
      const inReach = Math.max(Math.abs(dx), Math.abs(dy)) <= 3;
      tiles.set(tileKey(x, y), inReach ? owned(x, y, { ownershipState: "FRONTIER" }) : land(x, y));
    }
  }
  tiles.set(tileKey(20, 20), owned(20, 20, { afc: { ownerId: ME, status: "active" } } as Partial<Tile>));
  return tiles;
};

describe("bestRelayBeaconSites", () => {
  it("doesn't recommend the just-landed AFC: a beacon at the edge of its reach reveals far more land", () => {
    // Regression (playtest): the AFC was the only SETTLED tile after landing,
    // so it was the only candidate and got recommended, though a beacon there
    // only reveals the ring just past the AFC's own vision.
    const tiles = freshLanding();
    const [best] = sites(tiles);
    expect(best).toBeDefined();
    expect(best).not.toMatchObject({ x: 20, y: 20 });
    expect(Math.max(Math.abs((best?.x ?? 20) - 20), Math.abs((best?.y ?? 20) - 20))).toBe(3);
    // Same map with the frontier ruled out as sites (an observatory on each), leaving only the AFC.
    const afcOnly = new Map([...tiles].map(([k, t]) => [k, t.ownershipState === "FRONTIER" ? { ...t, observatory: { ownerId: ME, status: "active" } } : t] as [string, Tile]));
    const [afcSite] = sites(afcOnly);
    expect(afcSite).toMatchObject({ x: 20, y: 20 });
    const afcOnlyScore = afcSite?.score ?? 0;
    expect(best?.score ?? 0).toBeGreaterThan(afcOnlyScore);
  });

  it("counts fogged land as revealed, but not fogged water", () => {
    const base = [owned(10, 10, { townType: "FARMING", townPopulationTier: "TOWN" })];
    const visibleRing: Tile[] = [];
    for (let dy = -5; dy <= 5; dy += 1) for (let dx = -5; dx <= 5; dx += 1) if (dx || dy) visibleRing.push(land(10 + dx, 10 + dy));
    const allVisible = sites(tilesMap([...visibleRing, ...base]))[0]?.score ?? 0;
    const fogLand = sites(tilesMap([...visibleRing, land(15, 15, { fogged: true }), ...base]))[0]?.score ?? 0;
    const fogSea = sites(tilesMap([...visibleRing, land(15, 15, { fogged: true, terrain: "SEA" }), ...base]))[0]?.score ?? 0;
    expect(fogLand).toBe(allVisible + 1);
    expect(fogSea).toBeLessThan(allVisible);
  });


  it("prefers the site that newly reaches a valuable tile over one that only reaches plain land", () => {
    const tiles = tilesMap([
      owned(10, 10, { townType: "FARMING", townPopulationTier: "TOWN" }),
      owned(7, 10),
      owned(13, 10),
      land(18, 10, { resource: "FISH" }) // 5 from (13,10), out of the town's radius-3 reach
    ]);
    expect(sites(tiles)[0]).toMatchObject({ x: 13, y: 10 });
  });

  it("never credits ground already inside the player's reach", () => {
    // Every tile within a beacon radius of (11,10) is known land, and all but
    // its x=16 edge column is already in the radius-5 reach of an existing
    // active beacon at (10,10) -- only that 11-tile column is new.
    const tiles = new Map<string, Tile>();
    for (let y = 4; y <= 16; y += 1) for (let x = 4; x <= 17; x += 1) tiles.set(tileKey(x, y), land(x, y));
    tiles.set(tileKey(10, 10), owned(10, 10, { economicStructure: { ownerId: ME, type: "RELAY_BEACON", status: "active" } }));
    tiles.set(tileKey(11, 10), owned(11, 10));
    expect(sites(tiles)).toEqual([{ x: 11, y: 10, score: 11, coversTarget: false }]);
  });

  it("counts a beacon still under construction as already claiming its disk", () => {
    const base = [owned(10, 10, { townType: "FARMING", townPopulationTier: "TOWN" }), owned(13, 10), land(18, 10, { resource: "FISH" })];
    const withoutPending = sites(tilesMap(base));
    const withPending = sites(
      tilesMap([...base, owned(13, 11, { economicStructure: { ownerId: ME, type: "RELAY_BEACON", status: "under_construction" } })])
    );
    expect(withoutPending[0]?.score).toBeGreaterThan(withPending[0]?.score ?? 0);
  });

  it("ranks a site that covers a target first, and otherwise the site closest to the target", () => {
    const tiles = tilesMap([owned(10, 10, { townType: "FARMING", townPopulationTier: "TOWN" }), owned(10, 13), owned(13, 10)]);
    expect(sites(tiles, { targets: [{ x: 18, y: 10 }] })[0]).toMatchObject({ x: 13, y: 10, coversTarget: true });
    expect(sites(tiles, { targets: [{ x: 10, y: 30 }] })[0]).toMatchObject({ x: 10, y: 13, coversTarget: false });
  });

  it("keeps multiple picks at least a beacon radius apart", () => {
    const tiles = tilesMap([owned(10, 10), owned(11, 10), owned(12, 10), owned(20, 10)]);
    const picks = sites(tiles, { limit: 3 });
    expect(picks).toHaveLength(2);
    expect(picks.map(({ x, y }) => ({ x, y }))).toContainEqual({ x: 20, y: 10 });
    for (const a of picks) for (const b of picks) if (a !== b) expect(Math.abs(a.x - b.x)).toBeGreaterThan(5);
  });

  it("returns nothing when the player has no tile a beacon could go on", () => {
    expect(sites(tilesMap([owned(10, 10, { ownershipState: "FRONTIER", terrain: "SEA" }), owned(11, 10, { ownerId: "rival" }), land(14, 10)]))).toEqual([]);
  });
});
