import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";
import { parseTileVisibilityDebugQuery, TILE_VISIBILITY_DEBUG_MAX_RADIUS } from "./runtime-tile-visibility-debug.js";

const runtimeWith = (allies: string[] = []) =>
  new SimulationRuntime({
    now: () => 60_000,
    initialPlayers: new Map([
      ["viewer", buildPlayer("viewer", { allies: new Set(allies) })],
      ["rival", buildPlayer("rival", { allies: new Set(allies.includes("rival") ? ["viewer"] : []) })]
    ]),
    seedTiles: new Map(),
    initialState: {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "viewer", ownershipState: "SETTLED" },
        // Far beyond the viewer's own vision radius.
        { x: 100, y: 100, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED" }
      ],
      activeLocks: []
    }
  });

describe("runtime.tileVisibilityDebug", () => {
  it("names the viewer's own land as the reason it sees its own tile", () => {
    const report = runtimeWith().tileVisibilityDebug({ playerId: "viewer", x: 10, y: 10, radius: 0 });
    expect(report.playerKnown).toBe(true);
    expect(report.fullVisionActive).toBe(false);
    expect(report.tiles).toHaveLength(1);
    expect(report.tiles[0]).toMatchObject({ x: 10, y: 10, visible: true, ownerId: "viewer", ownershipState: "SETTLED" });
    expect(report.tiles[0]!.reasons).toContain("radius:self");
  });

  it("reports a rival tile out of sight as not visible with no reasons", () => {
    const report = runtimeWith().tileVisibilityDebug({ playerId: "viewer", x: 100, y: 100, radius: 0 });
    expect(report.tiles[0]).toMatchObject({ x: 100, y: 100, visible: false, reasons: [], ownerId: "rival" });
  });

  it("attributes a rival tile to the alliance when the two are allied", () => {
    const report = runtimeWith(["rival"]).tileVisibilityDebug({ playerId: "viewer", x: 100, y: 100, radius: 0 });
    expect(report.allies).toEqual(["rival"]);
    expect(report.tiles[0]!.visible).toBe(true);
    expect(report.tiles[0]!.reasons).toContain("radius:ally:rival");
  });

  it("scans a (2r+1)² square, wrapping at the map edge, and clamps the radius", () => {
    const runtime = runtimeWith();
    expect(runtime.tileVisibilityDebug({ playerId: "viewer", x: 0, y: 0, radius: 1 }).tiles).toHaveLength(9);
    const clamped = runtime.tileVisibilityDebug({ playerId: "viewer", x: 10, y: 10, radius: 99 });
    expect(clamped.tiles).toHaveLength((2 * TILE_VISIBILITY_DEBUG_MAX_RADIUS + 1) ** 2);
    const corner = runtime.tileVisibilityDebug({ playerId: "viewer", x: 0, y: 0, radius: 1 }).tiles[0]!;
    expect(corner.x).toBeGreaterThan(0);
    expect(corner.y).toBeGreaterThan(0);
  });

  it("flags an unknown player instead of throwing", () => {
    const report = runtimeWith().tileVisibilityDebug({ playerId: "nobody", x: 10, y: 10, radius: 0 });
    expect(report.playerKnown).toBe(false);
    expect(report.tiles[0]!.visible).toBe(false);
  });
});

describe("parseTileVisibilityDebugQuery", () => {
  it("parses playerId/x/y and defaults radius to 0", () => {
    expect(parseTileVisibilityDebugQuery(new URLSearchParams("playerId=p&x=3&y=4"))).toEqual({ playerId: "p", x: 3, y: 4, radius: 0 });
  });

  it("rejects missing or non-integer values", () => {
    for (const query of ["x=3&y=4", "playerId=p&x=3", "playerId=p&x=a&y=4", "playerId=p&x=3&y=4&radius=-1"]) {
      expect(parseTileVisibilityDebugQuery(new URLSearchParams(query))).toBeUndefined();
    }
  });
});
