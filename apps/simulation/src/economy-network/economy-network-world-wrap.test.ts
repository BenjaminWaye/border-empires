import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_WIDTH } from "@border-empires/shared";
import { countSupportedStructures, hasSupportedStructure, supportTileBelongsToTown } from "./economy-network.js";

// Regression for the bug reported after PR #1712: a town on the map's east
// edge (x = WORLD_WIDTH - 1) has a support-ring neighbor that only exists via
// horizontal wraparound (x = 0), but supportTileBelongsToTown/
// hasSupportedStructure/countSupportedStructures built their neighbor lookup
// keys with plain `x + dx` instead of the file's own wrap-aware `keyFor`, so
// a Mintworks (or any support-ring structure) built on the wrapped tile was
// silently never counted for the edge town — it looked like the structure
// didn't exist. See also the wire-shaped duplicates in
// apps/simulation/src/live-town-summary.ts and
// apps/realtime-gateway/src/tile-detail-snapshot/tile-detail-snapshot.ts.
describe("support-ring lookups wrap at the map's x edge", () => {
  const edgeX = WORLD_WIDTH - 1;
  const townTile: DomainTileState = {
    x: edgeX,
    y: 48,
    terrain: "LAND",
    ownerId: "player-1",
    ownershipState: "SETTLED",
    town: { name: "Brynmarch Sound", type: "MARKET", populationTier: "CITY" }
  };
  // East neighbor of x = WORLD_WIDTH - 1 wraps to x = 0.
  const wrappedMintworksTile: DomainTileState = {
    x: 0,
    y: 48,
    terrain: "LAND",
    ownerId: "player-1",
    ownershipState: "SETTLED",
    economicStructure: { ownerId: "player-1", type: "MINTWORKS", status: "active" }
  };
  const tiles = new Map<string, DomainTileState>([
    [`${townTile.x},${townTile.y}`, townTile],
    [`${wrappedMintworksTile.x},${wrappedMintworksTile.y}`, wrappedMintworksTile]
  ]);

  it("assigns a wrapped support tile to the edge town", () => {
    expect(supportTileBelongsToTown("player-1", wrappedMintworksTile, townTile, tiles)).toBe(true);
  });

  it("hasSupportedStructure finds a Mintworks reachable only via wraparound", () => {
    expect(hasSupportedStructure("player-1", townTile, "MINTWORKS", tiles)).toBe(true);
  });

  it("countSupportedStructures counts a Mintworks reachable only via wraparound", () => {
    expect(countSupportedStructures("player-1", townTile, "MINTWORKS", tiles)).toBe(1);
  });
});
