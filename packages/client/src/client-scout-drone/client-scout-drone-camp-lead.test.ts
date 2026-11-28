import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { LEAD_ROUTE_LEG_TILES, isCampLeadRoute } from "./client-scout-drone-lead-route.js";
import { handleScoutPlanTap, scoutPlanIsFreeCampFlight } from "./client-scout-drone-plan.js";
import { scoutDockChargesLeft } from "./client-scout-drone-dock.js";

// Owner decision 2026-11-28: the guide's last chapter sends the drone to the nearest Insurgent camp. By then the
// first-15 playtesters had spent every charge, so that flight is free (the simulation decides:
// scout-drone-camp-lead.ts); the client must let the player plan it with no charge left.
const spentState = () => ({
  ...createInitialState(),
  me: "me",
  guideCampLead: { x: 40, y: 10 },
  scoutDroneCharges: { max: 8, refillMs: 14_400_000, usedAt: Array.from({ length: 8 }, () => 0) },
  tiles: new Map<string, Tile>([["10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "me", afc: { ownerId: "me", status: "active" } } as Tile]])
});

describe("the guide's free camp flight", () => {
  it("plans the whole route to the marked camp with every charge spent", () => {
    const state = spentState();
    expect(handleScoutPlanTap(state, 40, 10, 0)).toBe(true);
    expect(state.scoutDronePicking.stops).toEqual([
      { x: 25, y: 10 },
      { x: 40, y: 10 }
    ]);
    expect(scoutPlanIsFreeCampFlight(state, 0)).toBe(true);
    // The free flight spends no charge, so the dock's count doesn't go below what is left.
    expect(scoutDockChargesLeft(state, 0)).toBe(0);
  });

  it("any other fog tap with no charge left adds nothing", () => {
    const state = spentState();
    expect(handleScoutPlanTap(state, 30, 30, 0)).toBe(true);
    expect(state.scoutDronePicking.stops).toEqual([]);
    expect(scoutPlanIsFreeCampFlight(state, 0)).toBe(false);
  });

  it("the free route is the straight one: extra stops make it a normal flight", () => {
    const launch = { x: 10, y: 10 };
    const camp = { x: 10 + LEAD_ROUTE_LEG_TILES + 5, y: 10 };
    expect(isCampLeadRoute([{ x: 20, y: 10 }, camp], camp, launch)).toBe(true);
    expect(isCampLeadRoute([{ x: 12, y: 30 }, { x: 20, y: 10 }, camp], camp, launch)).toBe(false);
    expect(isCampLeadRoute([{ x: 20, y: 10 }], camp, launch)).toBe(false);
    expect(isCampLeadRoute([camp], undefined, launch)).toBe(false);
  });
});
