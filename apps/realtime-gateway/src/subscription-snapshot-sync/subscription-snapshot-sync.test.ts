import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { applyTileDeltasToSnapshot } from "./subscription-snapshot-sync.js";

// applyPlayerMessageToSnapshot's tests moved to @border-empires/sim-protocol's
// subscription-snapshot-merge module (see docs/player-wire-refactor-plan.md's
// Phase 1+2 follow-up) -- this file now covers only this app's own
// applyTileDeltasToSnapshot implementation (WeakMap-indexed lookup; apps/
// simulation's copy uses a binary-search strategy instead -- same behavior,
// different perf tradeoff, deliberately left as two implementations).
describe("applyTileDeltasToSnapshot", () => {
  const baseTiles: PlayerSubscriptionSnapshot["tiles"] = [
    { x: 1, y: 1, terrain: "LAND", ownerId: "player-a", ownershipState: "SETTLED" },
    { x: 2, y: 2, terrain: "LAND" },
    { x: 3, y: 3, terrain: "SEA" }
  ];
  const baseSnapshot = (): PlayerSubscriptionSnapshot => ({ playerId: "player-1", tiles: [...baseTiles] });

  it("returns the same snapshot reference when delta is empty", () => {
    const s = baseSnapshot();
    expect(applyTileDeltasToSnapshot(s, [])).toBe(s);
  });

  it("updates existing tile fields without rebuilding unrelated tiles", () => {
    const result = applyTileDeltasToSnapshot(baseSnapshot(), [
      { x: 1, y: 1, ownerId: "player-b", ownershipState: "FRONTIER" }
    ]);
    expect(result.tiles.find(t => t.x === 1 && t.y === 1)).toMatchObject({
      terrain: "LAND",
      ownerId: "player-b",
      ownershipState: "FRONTIER"
    });
    expect(result.tiles.find(t => t.x === 2 && t.y === 2)).toEqual(baseTiles[1]);
  });

  it("inserts new tiles and keeps the array sorted", () => {
    const result = applyTileDeltasToSnapshot(baseSnapshot(), [
      { x: 0, y: 0, terrain: "LAND", ownerId: "player-c", ownershipState: "SETTLED" },
      { x: 4, y: 4, terrain: "SEA" }
    ]);
    expect(result.tiles).toHaveLength(5);
    const keys = result.tiles.map(t => `${t.x},${t.y}`);
    expect(keys).toEqual([...keys].sort());
  });

  it("does not sort when only existing tiles are updated", () => {
    const s = baseSnapshot();
    const result = applyTileDeltasToSnapshot(s, [{ x: 2, y: 2, ownerId: "player-b" }]);
    // Sorted order unchanged — tiles array length is the same
    expect(result.tiles).toHaveLength(3);
    const keys = result.tiles.map(t => `${t.x},${t.y}`);
    expect(keys).toEqual(["1,1", "2,2", "3,3"]);
  });

  it("does NOT insert a phantom tile for a clear-only delta the snapshot has never seen", () => {
    // Regression: broadcast-only ghost-ownership clears reach every player
    // regardless of visibility; inserting them accumulated phantom neutral
    // tiles that leaked fog-of-war on reconnect.
    const result = applyTileDeltasToSnapshot(baseSnapshot(), [
      { x: 49, y: 288, ownerId: undefined, ownershipState: undefined, ownershipClearOnly: true }
    ]);
    expect(result.tiles).toHaveLength(3);
    expect(result.tiles.some(t => t.x === 49 && t.y === 288)).toBe(false);
  });

  it("still applies a clear-only delta to a tile already in the snapshot", () => {
    const result = applyTileDeltasToSnapshot(baseSnapshot(), [
      { x: 1, y: 1, ownerId: undefined, ownershipState: undefined, ownershipClearOnly: true }
    ]);
    const tile = result.tiles.find(t => t.x === 1 && t.y === 1);
    expect(tile?.ownerId).toBeUndefined();
    expect(tile?.ownershipState).toBeUndefined();
    expect(tile?.terrain).toBe("LAND");
  });

  it("handles large snapshot with small delta efficiently (all updates, no insertions)", () => {
    const largeTiles: PlayerSubscriptionSnapshot["tiles"] = Array.from({ length: 12_000 }, (_, i) => ({
      x: i,
      y: 0,
      terrain: "LAND" as const,
      ownerId: "player-a"
    }));
    const largeSnapshot: PlayerSubscriptionSnapshot = { playerId: "player-1", tiles: largeTiles };
    const delta = Array.from({ length: 45 }, (_, i) => ({ x: i * 10, y: 0, ownerId: "player-b" }));
    const result = applyTileDeltasToSnapshot(largeSnapshot, delta);
    expect(result.tiles).toHaveLength(12_000);
    expect(result.tiles.find(t => t.x === 0)?.ownerId).toBe("player-b");
    expect(result.tiles.find(t => t.x === 1)?.ownerId).toBe("player-a");
  });
});
