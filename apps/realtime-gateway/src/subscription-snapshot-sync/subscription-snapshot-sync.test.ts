import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { applyPlayerMessageToSnapshot, applyTileDeltasToSnapshot } from "./subscription-snapshot-sync.js";

const snapshot = (): PlayerSubscriptionSnapshot => ({
  playerId: "player-1",
  player: {
    id: "player-1",
    gold: 100,
    manpower: 10,
    manpowerCap: 100,
    incomePerMinute: 1,
    strategicResources: { FOOD: 0, IRON: 25, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
    strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
    developmentProcessLimit: 2,
    activeDevelopmentProcessCount: 0,
    pendingSettlements: [],
    techIds: [],
    domainIds: [],
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    modBreakdown: {
      attack: [{ label: "Base", mult: 1 }],
      defense: [{ label: "Base", mult: 1 }],
      income: [{ label: "Base", mult: 1 }],
      vision: [{ label: "Base", mult: 1 }]
    }
  },
  tiles: []
});

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

describe("applyPlayerMessageToSnapshot", () => {
  it("keeps progression modifiers in cached snapshots after tech updates", () => {
    const updated = applyPlayerMessageToSnapshot(snapshot(), {
      type: "TECH_UPDATE",
      gold: 75,
      techIds: ["tribal-warfare"],
      mods: { attack: 1.05, defense: 1.05, income: 1, vision: 1 },
      modBreakdown: {
        attack: [{ label: "Base", mult: 1 }, { label: "Warbands", mult: 1.05 }],
        defense: [{ label: "Base", mult: 1 }, { label: "Warbands", mult: 1.05 }],
        income: [{ label: "Base", mult: 1 }],
        vision: [{ label: "Base", mult: 1 }]
      }
    });

    expect(updated.player?.gold).toBe(75);
    expect(updated.player?.techIds).toEqual(["tribal-warfare"]);
    expect(updated.player?.mods?.attack).toBe(1.05);
    expect(updated.player?.modBreakdown?.attack).toContainEqual({ label: "Warbands", mult: 1.05 });
  });
});
