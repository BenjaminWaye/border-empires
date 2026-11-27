// Regression: growing a Town to a City claimed the new outer plots but left them ungarrisoned (unless the
// "towns" auto-garrison switch was on), and a garrisoned town had no way to garrison all its plots at once.
import { beforeEach, describe, expect, it, vi } from "vitest";

const reach = new Set<string>();
vi.mock("../client-reach-authoritative/client-reach-authoritative.js", () => ({ resolveMyReachCached: () => reach }));

import { DEV_QUEUE_TOTAL_CAP, NEW_PLAYER_AUTO_SETTLE_PREFS } from "@border-empires/shared";
import { loadedAutoSettleState } from "../client-auto-settle-prompt/client-auto-settle-prefs.js";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { garrisonTownPlotsAction, handleTownPlotAction, plotsGainedByGrowth } from "./client-town-plot-garrison.js";
import { TOWN_RING_AFTER_SETTLE_WINDOW_MS, processTownRingGarrisons } from "./client-town-ring-garrison.js";

const key = (x: number, y: number): string => `${x},${y}`;
const land = (x: number, y: number, extra: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ...extra }) as Tile;

/** A garrisoned TOWN at (10,10): ring 1 all garrisoned except (11,10) frontier; ring 2 neutral land. */
const setup = (tier = "TOWN") => {
  const state = createInitialState();
  state.me = "me";
  state.manpower = 1_000;
  state.gold = 1_000;
  state.settleManpowerCost = 5;
  const town = land(10, 10, { ownerId: "me", ownershipState: "SETTLED", town: { name: "Ash", type: "FARMING", populationTier: tier } as NonNullable<Tile["town"]> });
  for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
    const ring = Math.max(Math.abs(dx), Math.abs(dy));
    if (ring === 1) state.tiles.set(key(10 + dx, 10 + dy), land(10 + dx, 10 + dy, { ownerId: "me", ownershipState: "SETTLED" }));
    if (ring === 2) state.tiles.set(key(10 + dx, 10 + dy), land(10 + dx, 10 + dy));
  }
  state.tiles.set(key(11, 10), land(11, 10, { ownerId: "me", ownershipState: "FRONTIER" }));
  state.tiles.set(key(10, 10), town);
  return { state, town };
};

beforeEach(() => {
  reach.clear();
  for (let dy = -3; dy <= 3; dy += 1) for (let dx = -3; dx <= 3; dx += 1) reach.add(key(10 + dx, 10 + dy));
});

describe("garrisoning a town's plots", () => {
  it("growing Town -> City garrisons the new outer plots once the server claims them", () => {
    const { state, town } = setup();
    expect(plotsGainedByGrowth(state, town)).toHaveLength(16);
    const sendGameMessage = vi.fn();
    const requestSettlement = vi.fn((_x: number, _y: number) => true);
    expect(handleTownPlotAction("grow_town_to_city", town, { state, sendGameMessage, requestSettlement, now: 1_000 })).toBe(false);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "UPGRADE_TOWN_TIER", x: 10, y: 10 });

    // The upgrade lands: the town is a City and the server claimed ring 2 as FRONTIER.
    state.tiles.set(key(10, 10), { ...town, town: { ...town.town!, populationTier: "CITY" } });
    state.tiles.set(key(12, 10), land(12, 10, { ownerId: "me", ownershipState: "FRONTIER" }));
    state.tiles.set(key(8, 8), land(8, 8, { ownerId: "me", ownershipState: "FRONTIER" }));
    processTownRingGarrisons(state, { now: 2_000, reach, isSettling: () => false, requestSettlement });
    expect(requestSettlement).toHaveBeenCalledWith(12, 10);
    expect(requestSettlement).toHaveBeenCalledWith(8, 8);
  });

  it("garrisons nothing when the server rejects the upgrade, even plots that are already your frontier", () => {
    const { state, town } = setup();
    state.tiles.set(key(12, 10), land(12, 10, { ownerId: "me", ownershipState: "FRONTIER" }));
    const requestSettlement = vi.fn((_x: number, _y: number) => true);
    handleTownPlotAction("grow_town_to_city", town, { state, sendGameMessage: vi.fn(), requestSettlement, now: 1_000 });
    // Rejected (no coin / FOOD slot): the town stays a Town.
    processTownRingGarrisons(state, { now: 2_000, reach, isSettling: () => false, requestSettlement });
    expect(requestSettlement).not.toHaveBeenCalled();
    processTownRingGarrisons(state, { now: 2_000 + TOWN_RING_AFTER_SETTLE_WINDOW_MS, reach, isSettling: () => false, requestSettlement });
    expect(state.townRingGarrisons.size).toBe(0);
    expect(requestSettlement).not.toHaveBeenCalled();
  });

  it("leaves to the server only the plots whose own auto-garrison switch is on", () => {
    const { state, town } = setup();
    state.tiles.set(key(12, 10), land(12, 10, { resource: "FARM" }));
    state.autoSettle = loadedAutoSettleState({ ...NEW_PLAYER_AUTO_SETTLE_PREFS, answered: true, towns: true, FARM: false });
    handleTownPlotAction("grow_town_to_city", town, { state, sendGameMessage: vi.fn(), requestSettlement: vi.fn((_x: number, _y: number) => true), now: 1_000 });
    expect(state.townRingGarrisons.get(key(10, 10))?.ringKeys).toEqual([key(12, 10)]);
  });

  it("keeps ring tiles a pending town Garrison is still waiting on", () => {
    const { state, town } = setup();
    state.townRingGarrisons.set(key(10, 10), { ringKeys: [key(9, 9)], startedAt: 0, townSettledAt: 500 });
    handleTownPlotAction("grow_town_to_city", town, { state, sendGameMessage: vi.fn(), requestSettlement: vi.fn((_x: number, _y: number) => true), now: 1_000 });
    expect(state.townRingGarrisons.get(key(10, 10))?.ringKeys).toContain(key(9, 9));
  });

  it("Garrison N plots waits for manpower instead of refusing, but not past a full queue", () => {
    const { state, town } = setup("CITY");
    state.manpower = 0;
    expect(garrisonTownPlotsAction(state, town)?.disabled).toBeFalsy();
    state.developmentQueue = Array.from({ length: DEV_QUEUE_TOTAL_CAP }, (_, i) => ({ kind: "BUILD", tileKey: `q${i}` }) as never);
    expect(garrisonTownPlotsAction(state, town)).toMatchObject({ disabled: true, disabledReason: "Queue has room for 0 more" });
  });

  it("offers Garrison N plots on a garrisoned town and garrisons each claimed in-reach plot", () => {
    const { state, town } = setup("CITY");
    state.tiles.set(key(12, 12), land(12, 12, { ownerId: "me", ownershipState: "FRONTIER" }));
    state.tiles.set(key(8, 12), land(8, 12, { ownerId: "me", ownershipState: "FRONTIER" }));
    reach.delete(key(8, 12)); // out of reach: a SETTLE would be rejected
    const action = garrisonTownPlotsAction(state, state.tiles.get(key(10, 10))!);
    expect(action).toMatchObject({ id: "garrison_town_plots", label: "Garrison 2 plots" });
    expect(action?.disabled).toBeFalsy();
    const requestSettlement = vi.fn((_x: number, _y: number) => true);
    expect(handleTownPlotAction("garrison_town_plots", town, { state, sendGameMessage: vi.fn(), requestSettlement, now: 0 })).toBe(true);
    expect(requestSettlement.mock.calls.map(([x, y]) => key(x, y)).sort()).toEqual(["11,10", "12,12"]);
  });

  it("offers nothing when every plot is garrisoned, or the town itself is not", () => {
    const { state, town } = setup();
    state.tiles.set(key(11, 10), land(11, 10, { ownerId: "me", ownershipState: "SETTLED" }));
    expect(garrisonTownPlotsAction(state, town)).toBeUndefined();
    state.tiles.set(key(11, 10), land(11, 10, { ownerId: "me", ownershipState: "FRONTIER" }));
    expect(garrisonTownPlotsAction(state, { ...town, ownershipState: "FRONTIER" })).toBeUndefined();
  });
});
