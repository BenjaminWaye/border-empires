import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { clearBarbariansAroundAfcLanding } from "./afc-landing-barbarian-clear.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

const SIZE = 25;

const buildWorld = (overrides: Record<string, Partial<DomainTileState>> = {}): Map<string, DomainTileState> => {
  const tiles = new Map<string, DomainTileState>();
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const key = simulationTileKey(x, y);
      tiles.set(key, { x, y, terrain: "LAND", ...overrides[key] });
    }
  }
  return tiles;
};

const barb = (extra: Partial<DomainTileState> = {}): Partial<DomainTileState> => ({ ownerId: "barbarian-1", ownershipState: "SETTLED", ...extra });

const run = (
  tiles: Map<string, DomainTileState>,
  options: { locks?: string[]; pending?: string[] } = {}
) => {
  const replaced: Array<{ tileKey: string; commandId: string | undefined }> = [];
  const logs: Array<Record<string, unknown>> = [];
  const released = clearBarbariansAroundAfcLanding(
    {
      tiles,
      locksByTile: new Map((options.locks ?? []).map((key) => [key, true])),
      pendingSettlementsByTile: new Map((options.pending ?? []).map((key) => [key, true])),
      replaceTileState: (tileKey, tile, commandId) => {
        tiles.set(tileKey, tile);
        replaced.push({ tileKey, commandId });
      },
      runtimeLogInfo: (payload) => logs.push(payload)
    },
    10,
    10,
    "cmd-1"
  );
  return { released, replaced, logs };
};

describe("clearBarbariansAroundAfcLanding", () => {
  it("releases barbarian tiles within AFC reach to neutral, keeping static features", () => {
    const tiles = buildWorld({
      "11,10": barb({ resource: "FARM", muster: { ownerId: "barbarian-1", amount: 4, mode: "HOLD", updatedAt: 1 } }),
      "13,13": barb({ town: { type: "FARMING", populationTier: "SETTLEMENT" } }), // far corner of the radius-3 square
      "8,9": barb({ dockId: "dock-1" }),
      // A structure a barbarian captured is re-stamped to barbarian-1; it must not survive onto a tile the new
      // player is about to auto-claim.
      "12,12": barb({ resource: "FARM", economicStructure: { ownerId: "barbarian-1", type: "RELAY_BEACON", status: "active" } })
    });
    const { released, replaced, logs } = run(tiles);
    expect(released.map((tile) => simulationTileKey(tile.x, tile.y)).sort()).toEqual(["11,10", "12,12", "13,13", "8,9"]);
    expect(tiles.get("11,10")).toEqual({ x: 11, y: 10, terrain: "LAND", resource: "FARM" });
    expect(tiles.get("13,13")).toEqual({ x: 13, y: 13, terrain: "LAND", town: { type: "FARMING", populationTier: "SETTLEMENT" } });
    expect(tiles.get("8,9")).toEqual({ x: 8, y: 9, terrain: "LAND", dockId: "dock-1" });
    expect(tiles.get("12,12")).toEqual({ x: 12, y: 12, terrain: "LAND", resource: "FARM" });
    expect(replaced.every((entry) => entry.commandId === "cmd-1")).toBe(true);
    expect(logs).toEqual([{ type: "afc_landing_barbarians_cleared", commandId: "cmd-1", x: 10, y: 10, cleared: 4 }]);
  });

  it("leaves barbarians outside the reach radius and other players' tiles alone", () => {
    const tiles = buildWorld({
      "14,10": barb(), // radius 4: outside
      "10,6": barb(), // radius 4: outside
      "12,11": { ownerId: "player-2", ownershipState: "SETTLED" },
      "9,9": { ownerId: "ai-1", ownershipState: "FRONTIER" }
    });
    const { released, logs } = run(tiles);
    expect(released).toEqual([]);
    expect(logs).toEqual([]);
    expect(tiles.get("14,10")?.ownerId).toBe("barbarian-1");
    expect(tiles.get("10,6")?.ownerId).toBe("barbarian-1");
    expect(tiles.get("12,11")?.ownerId).toBe("player-2");
    expect(tiles.get("9,9")?.ownerId).toBe("ai-1");
  });

  it("skips tiles with a combat lock or pending settlement in flight", () => {
    const tiles = buildWorld({ "11,10": barb(), "10,11": barb(), "9,10": barb() });
    const { released } = run(tiles, { locks: ["11,10"], pending: ["10,11"] });
    expect(released.map((tile) => simulationTileKey(tile.x, tile.y))).toEqual(["9,10"]);
    expect(tiles.get("11,10")?.ownerId).toBe("barbarian-1");
    expect(tiles.get("10,11")?.ownerId).toBe("barbarian-1");
  });

  it("only clears what the AFC's land-gated reach actually covers (nothing behind water)", () => {
    const overrides: Record<string, Partial<DomainTileState>> = {};
    for (let y = 0; y < SIZE; y += 1) overrides[simulationTileKey(11, y)] = { terrain: "SEA" };
    overrides["12,10"] = barb(); // land, but only reachable across the sea column
    overrides["9,10"] = barb(); // same landmass as the AFC
    const tiles = buildWorld(overrides);
    const { released } = run(tiles);
    expect(released.map((tile) => simulationTileKey(tile.x, tile.y))).toEqual(["9,10"]);
    expect(tiles.get("12,10")?.ownerId).toBe("barbarian-1");
  });
});
