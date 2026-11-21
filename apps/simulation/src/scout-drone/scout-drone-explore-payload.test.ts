import { describe, expect, it } from "vitest";
import { SCOUT_DRONE_MAX_STOPS } from "@border-empires/shared";
import { parseScoutDroneExploreStops } from "./scout-drone-explore-payload.js";

const parse = (payload: unknown): ReturnType<typeof parseScoutDroneExploreStops> => parseScoutDroneExploreStops(JSON.stringify(payload), 100, 60);

describe("parseScoutDroneExploreStops", () => {
  it("uses (x, y) as the only stop when there are no waypoints, wrapped to the world", () => {
    expect(parse({ x: 105, y: -1 })).toEqual([{ x: 5, y: 59 }]);
  });

  it("uses the waypoints in order when given, capped at the stop limit", () => {
    expect(parse({ x: 1, y: 1, waypoints: [{ x: 1, y: 1 }, { x: 2, y: 3 }] })).toEqual([{ x: 1, y: 1 }, { x: 2, y: 3 }]);
    const many = Array.from({ length: SCOUT_DRONE_MAX_STOPS + 3 }, (_, i) => ({ x: i, y: 0 }));
    expect(parse({ x: 0, y: 0, waypoints: many })).toHaveLength(SCOUT_DRONE_MAX_STOPS);
  });

  it("rejects bad JSON, missing coordinates and malformed waypoint lists", () => {
    expect(parseScoutDroneExploreStops("{bad", 100, 60)).toBeUndefined();
    expect(parse({ x: 1.5, y: 2 })).toBeUndefined();
    expect(parse(null)).toBeUndefined();
    expect(parse({ x: 1, y: 2, waypoints: [] })).toBeUndefined();
    expect(parse({ x: 1, y: 2, waypoints: [{ x: 1 }] })).toBeUndefined();
    expect(parse({ x: 1, y: 2, waypoints: "nope" })).toBeUndefined();
  });
});
