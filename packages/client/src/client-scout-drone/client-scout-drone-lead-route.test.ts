import { describe, expect, it } from "vitest";
import { WORLD_WIDTH } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { LEAD_ROUTE_LEG_TILES, leadRouteStops } from "./client-scout-drone-lead-route.js";
import { handleScoutPlanTap } from "./client-scout-drone-plan.js";

describe("leadRouteStops", () => {
  it("lays one stop per leg along the line, ending on the town", () => {
    const stops = leadRouteStops({ x: 10, y: 10 }, { x: 10 + 3 * LEAD_ROUTE_LEG_TILES, y: 10 }, 8);
    expect(stops).toEqual([1, 2, 3].map((i) => ({ x: 10 + i * LEAD_ROUTE_LEG_TILES, y: 10 })));
  });

  it("takes the short way round the wrap and stops at the charges left", () => {
    // 38 tiles west across the wrap: three legs of 13 or so, and one charge buys only the first.
    const stops = leadRouteStops({ x: 2, y: 10 }, { x: WORLD_WIDTH - 36, y: 10 }, 1);
    expect(stops).toEqual([{ x: WORLD_WIDTH - 11, y: 10 }]);
    expect(leadRouteStops({ x: 2, y: 10 }, { x: 40, y: 10 }, 0)).toEqual([]);
  });
});

// Playtest Run 4: one tap on a far town was pulled back to the same 20 tiles every flight.
describe("tapping the guide's marked town", () => {
  it("plans the whole way there; any other fog tap is one stop", () => {
    const state = {
      ...createInitialState(),
      me: "me",
      guideTownLead: { x: 70, y: 10 },
      tiles: new Map<string, Tile>([["10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "me", afc: { ownerId: "me", status: "active" } } as Tile]])
    };
    expect(handleScoutPlanTap(state, 70, 10, 0)).toBe(true);
    expect(state.scoutDronePicking.stops.at(-1)).toEqual({ x: 70, y: 10 });
    expect(state.scoutDronePicking.stops.length).toBe(Math.ceil(60 / LEAD_ROUTE_LEG_TILES));
    const other = { ...state, scoutDronePicking: { ...state.scoutDronePicking, active: false, stops: [] } };
    expect(handleScoutPlanTap(other, 50, 40, 0)).toBe(true);
    expect(other.scoutDronePicking.stops).toEqual([{ x: 50, y: 40 }]);
  });
});
