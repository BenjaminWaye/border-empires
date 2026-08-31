import { describe, expect, it } from "vitest";

import type { TerritoryFlip } from "./territory-flip-log.js";
import {
  alliancePairKeySet,
  computeBiggestSwing24h,
  computeFrontlineHotspots,
  computeTerritoryMomentum,
  computeWars
} from "./territory-flip-log-aggregations.js";

const flip = (overrides: Partial<TerritoryFlip>): TerritoryFlip => ({
  tileId: "t-1",
  x: 1,
  y: 1,
  fromOwner: undefined,
  toOwner: undefined,
  at: 1_000,
  ...overrides
});

describe("computeWars", () => {
  it("groups flips into unordered pairs, counting either direction", () => {
    const flips = [
      flip({ tileId: "t-1", fromOwner: "p1", toOwner: "p2", at: 100 }),
      flip({ tileId: "t-2", fromOwner: "p2", toOwner: "p1", at: 200 })
    ];
    const wars = computeWars(flips, new Set());
    expect(wars).toEqual([{ playerA: "p1", playerB: "p2", tileFlips24h: 2, lastFlipAt: 200 }]);
  });

  it("excludes pairs with an active alliance", () => {
    const flips = [flip({ fromOwner: "p1", toOwner: "p2" })];
    const allied = alliancePairKeySet([{ playerA: "p1", playerB: "p2" }]);
    expect(computeWars(flips, allied)).toEqual([]);
  });

  it("ignores flips onto/off neutral land", () => {
    const flips = [flip({ fromOwner: undefined, toOwner: "p1" })];
    expect(computeWars(flips, new Set())).toEqual([]);
  });
});

describe("computeTerritoryMomentum", () => {
  it("computes gains, losses, and net per player", () => {
    const flips = [
      flip({ fromOwner: undefined, toOwner: "p1" }),
      flip({ fromOwner: "p1", toOwner: "p2" }),
      flip({ fromOwner: "p2", toOwner: "p1" })
    ];
    const momentum = computeTerritoryMomentum(flips);
    const byPlayer = Object.fromEntries(momentum.map((m) => [m.playerId, m]));
    expect(byPlayer.p1).toEqual({ playerId: "p1", tilesGained24h: 2, tilesLost24h: 1, net24h: 1 });
    expect(byPlayer.p2).toEqual({ playerId: "p2", tilesGained24h: 1, tilesLost24h: 1, net24h: 0 });
  });
});

describe("computeBiggestSwing24h", () => {
  it("returns null with no flips", () => {
    expect(computeBiggestSwing24h([])).toBeNull();
  });

  it("returns the player who lost the most tiles with the flip time window", () => {
    const flips = [
      flip({ fromOwner: "p1", toOwner: "p2", at: 100 }),
      flip({ fromOwner: "p1", toOwner: "p2", at: 500 }),
      flip({ fromOwner: "p3", toOwner: "p2", at: 300 })
    ];
    expect(computeBiggestSwing24h(flips)).toEqual({ playerId: "p1", tilesLost: 2, windowStart: 100, windowEnd: 500 });
  });
});

describe("computeFrontlineHotspots", () => {
  it("groups by tile and sorts by flip count, capping at top 20", () => {
    const flips = [
      flip({ tileId: "hot", x: 5, y: 5, fromOwner: "p1", toOwner: "p2", at: 1 }),
      flip({ tileId: "hot", x: 5, y: 5, fromOwner: "p2", toOwner: "p1", at: 2 }),
      flip({ tileId: "cold", x: 9, y: 9, fromOwner: "p1", toOwner: "p3", at: 3 })
    ];
    const hotspots = computeFrontlineHotspots(flips);
    expect(hotspots[0]).toEqual({ tileId: "hot", x: 5, y: 5, flips24h: 2, contestedBy: ["p1", "p2"] });
    expect(hotspots[1]!.tileId).toBe("cold");
  });
});
