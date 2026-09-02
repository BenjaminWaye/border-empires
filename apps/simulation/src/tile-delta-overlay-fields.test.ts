import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { tileDeltaFromState, type TileDeltaFromStateDeps } from "./runtime-tile-delta-from-state.js";
import { tileDeltaRevealOnly } from "./tile-delta-reveal-only.js";
import { TileDeltaStringifyCache } from "./tile-delta-stringify-cache/tile-delta-stringify-cache.js";

// Deliberately hardcoded and independent of tile-delta-overlay-fields.ts's
// own OVERLAY_JSON_FIELDS export: this list is what the test is verifying,
// so it must not come from the same source the implementation could regress
// (dropping a field from that array would silently pass a test that reads
// its expectations from the same array).
const EXPECTED_OVERLAY_JSON_FIELDS = [
  "shardSiteJson",
  "naturalWonderJson",
  "fortJson",
  "observatoryJson",
  "siegeOutpostJson",
  "economicStructureJson",
  "sabotageJson",
  "musterJson"
] as const;

/**
 * A tile with every overlay field on DomainTileState populated. Every
 * overlay field this tile carries must survive both delta-builders that
 * translate DomainTileState into the wire format -- forgetting one is the
 * exact bug (#1157) that made natural wonders disappear after EXPAND: the
 * stringify cache computed naturalWonderJson correctly, but the delta
 * builder never read it. Add a new field to this fixture whenever a new
 * overlay field is added to DomainTileState, so this test catches the next
 * one automatically.
 */
const fullyLoadedTile: DomainTileState = {
  x: 3,
  y: 4,
  terrain: "LAND",
  ownerId: "p1",
  ownershipState: "SETTLED",
  shardSite: { kind: "CACHE", amount: 5 },
  naturalWonder: { type: "DEEPWATER_ENGINE" },
  fort: { ownerId: "p1", status: "active" },
  observatory: { ownerId: "p1", status: "active" },
  siegeOutpost: { ownerId: "p1", status: "active" },
  economicStructure: { ownerId: "p1", type: "FOUNDRY", status: "active" },
  sabotage: { ownerId: "p2", endsAt: 1000, outputMultiplier: 0.5 },
  muster: { ownerId: "p1", amount: 10, mode: "HOLD", updatedAt: 0 }
};

const makeTileDeltaFromStateDeps = (): TileDeltaFromStateDeps => ({
  players: new Map(),
  tileDeltaStringifyCache: new TileDeltaStringifyCache(),
  now: () => 0,
  tileYieldCollectedAt: () => undefined,
  tileYieldEconomyContextForPlayer: () => {
    throw new Error("not expected: fullyLoadedTile has no player registered");
  },
  enrichTileWithTownContext: (tile) => tile,
  yieldViewEconomyContext: () => ({ tiles: new Map(), dockLinksByDockTileKey: new Map() }),
  reachBorderOwnerAt: () => undefined
});

describe("overlay JSON field parity across tile delta builders", () => {
  it("tileDeltaFromState includes every overlay field present on the tile, on first emission", () => {
    const deps = makeTileDeltaFromStateDeps();
    const delta = tileDeltaFromState(deps, fullyLoadedTile);
    for (const field of EXPECTED_OVERLAY_JSON_FIELDS) {
      expect(delta[field], `expected ${field} on tileDeltaFromState's output`).toBeTruthy();
    }
  });

  it("tileDeltaRevealOnly includes every overlay field present on the tile", () => {
    const cache = new TileDeltaStringifyCache();
    const delta = tileDeltaRevealOnly(fullyLoadedTile, cache);
    for (const field of EXPECTED_OVERLAY_JSON_FIELDS) {
      expect(delta[field], `expected ${field} on tileDeltaRevealOnly's output`).toBeTruthy();
    }
  });

  it("tileDeltaFromState still surfaces a cleared overlay field as an explicit key (not omitted)", () => {
    // A field going from set -> cleared (e.g. a collected shard site) must
    // remain a present key with an undefined/falsy value so subscribers can
    // tell "cleared" apart from "never mentioned" via `"xJson" in delta`.
    const deps = makeTileDeltaFromStateDeps();
    const withShard = { ...fullyLoadedTile, shardSite: { kind: "CACHE" as const, amount: 5 } };
    tileDeltaFromState(deps, withShard);
    const cleared = { ...fullyLoadedTile, shardSite: undefined };
    const delta = tileDeltaFromState(deps, cleared);
    expect("shardSiteJson" in delta).toBe(true);
    expect(delta.shardSiteJson).toBeFalsy();
  });
});
