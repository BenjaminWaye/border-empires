// Owner request 2026-11-25: a garrisoned City with plots you hold but haven't garrisoned had no Garrison
// button and no badge, so those plots sat idle. Only plots a Garrison could start on count.
import { SETTLE_COST } from "@border-empires/shared";
import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { garrisonableTownPlots, garrisonTownPlots, townPlotGarrison } from "./client-town-plot-garrison.js";

const land = (x: number, y: number, extra: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ...extra }) as Tile;
const NONE = { has: () => false };
const ALL = { has: () => true };

const setup = (townExtra: Partial<Tile> = {}) => {
  const town = land(10, 10, { ownerId: "me", ownershipState: "SETTLED", town: { populationTier: "TOWN" } as NonNullable<Tile["town"]>, ...townExtra });
  const ring = [
    land(9, 9, { ownerId: "me", ownershipState: "FRONTIER" }), // garrisonable
    land(10, 9, { ownerId: "me", ownershipState: "FRONTIER" }), // garrisonable
    land(11, 9, { ownerId: "me", ownershipState: "SETTLED" }), // already garrisoned
    land(9, 10, { ownerId: "rival", ownershipState: "FRONTIER" }), // enemy territory
    land(11, 10), // neutral
    land(9, 11, { ownerId: "me", ownershipState: "FRONTIER", optimisticPending: "settle" }), // garrisoning
    { x: 10, y: 11, terrain: "SEA" } as Tile,
    land(11, 11, { ownerId: "me", ownershipState: "FRONTIER" }) // garrisonable unless queued
  ];
  const tiles = new Map([town, ...ring].map((t) => [`${t.x},${t.y}`, t] as const));
  return { town, tiles };
};

describe("garrisonableTownPlots", () => {
  it("lists only your own frontier plots a Garrison could start on now", () => {
    const { town, tiles } = setup();
    expect(garrisonableTownPlots(tiles, "me", town, NONE, ALL).map((t) => `${t.x},${t.y}`)).toEqual(["9,9", "10,9", "11,11"]);
  });

  it("skips plots already queued or planned, and ones outside your reach", () => {
    const { town, tiles } = setup();
    expect(garrisonableTownPlots(tiles, "me", town, new Set(["11,11"]), ALL)).toHaveLength(2);
    expect(garrisonableTownPlots(tiles, "me", town, NONE, new Set(["9,9"]))).toHaveLength(1);
  });

  it("is empty for an ungarrisoned, rival or Settlement town (their own Garrison covers the ring)", () => {
    expect(garrisonableTownPlots(setup().tiles, "me", setup({ ownershipState: "FRONTIER" }).town, NONE, ALL)).toEqual([]);
    expect(garrisonableTownPlots(setup().tiles, "me", setup({ ownerId: "rival" }).town, NONE, ALL)).toEqual([]);
    expect(garrisonableTownPlots(setup().tiles, "me", setup({ town: { populationTier: "SETTLEMENT" } as NonNullable<Tile["town"]> }).town, NONE, ALL)).toEqual([]);
  });
});

describe("townPlotGarrison / garrisonTownPlots", () => {
  it("prices every plot, and never blocks on manpower", () => {
    const plots = [land(1, 1), land(2, 2)];
    expect(townPlotGarrison([], { gold: 1000, settleManpowerCost: 25 })).toBeUndefined();
    const coin = SETTLE_COST > 0 ? `${2 * SETTLE_COST} coin, ` : "";
    expect(townPlotGarrison(plots, { gold: 1000, settleManpowerCost: 25 })).toEqual({ count: 2, cost: `2 plots · ${coin}50 manpower` });
    // Short on manpower still queues: each Garrison waits for a refill batch.
    expect(townPlotGarrison(plots, { gold: SETTLE_COST, settleManpowerCost: 25 })?.disabledReason).toBeUndefined();
    if (SETTLE_COST > 0) expect(townPlotGarrison(plots, { gold: 0, settleManpowerCost: 25 })?.disabledReason).toBe(`Need ${SETTLE_COST} coin`);
  });

  it("queues one Garrison per plot through the paced development queue", () => {
    const request = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const process = vi.fn();
    expect(garrisonTownPlots([land(1, 1), land(2, 2)], request, process)).toBe(1);
    expect(request).toHaveBeenCalledWith(1, 1, { forceQueue: true, suppressWarnings: true });
    expect(process).toHaveBeenCalledOnce();
  });
});
