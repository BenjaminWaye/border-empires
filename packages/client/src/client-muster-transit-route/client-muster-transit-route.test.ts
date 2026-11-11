import { describe, expect, it, vi } from "vitest";
import { syncMusterTransitOverlay } from "../client-map-3d-muster-transit-sync.js";
import type { MusterTransit, MusterTransitOverlay } from "../client-map-3d-muster-transit-overlay.js";
import type { MusterBoatVoyage } from "../client-map-3d-muster-boat-overlay.js";
import type { Heightfield } from "../client-map-3d-heightfield/client-map-3d-heightfield.js";
import type { ClientState } from "../client-state/client-state.js";
import type { DockPair, Tile } from "../client-types.js";
import { routedSupplyLine } from "../client-muster-route-2d/client-muster-route-2d.js";
import { activeTransitLeg, clientMusterTransitRoute, isStraightRoute, marchStartAt, sailPath } from "./client-muster-transit-route.js";

// REGRESSION: a muster company marching from a flag on one island to a launch
// tile across a strait was drawn walking straight over the sea (3D) and its
// supply line cut across the water (2D). It now marches to the dock, sails
// the sea lane in a troop transport and marches out.
//
// Island A is x 0..9, sea at x = 10, island B is x 11..20. Docks (8,8) and
// (11,8) are paired with a one-tile sea lane. Flag (8,5) on A, launch (11,5) on B.
const tiles = new Map<string, Tile>();
for (let x = 0; x <= 20; x += 1) {
  for (let y = 0; y <= 10; y += 1) tiles.set(`${x},${y}`, { x, y, terrain: x === 10 ? "SEA" : "LAND", ...(x === 8 && y === 8 ? { ownerId: "me" } : {}) } as Tile);
}
const dockPairs: DockPair[] = [{ ax: 8, ay: 8, bx: 11, by: 8, route: [{ x: 10, y: 8 }] }];
const state = { tiles, dockPairs, me: "me" };
const flag = { x: 8, y: 5 };
const launch = { x: 11, y: 5 };
const isSea = (point: { x: number; y: number }): boolean => point.x === 10;

describe("clientMusterTransitRoute", () => {
  it("marches to the dock, sails, and marches out", () => {
    const route = clientMusterTransitRoute(state, flag, launch);
    expect(route.legs.map((leg) => leg.kind)).toEqual(["WALK", "SAIL", "WALK"]);
    for (const leg of route.legs) if (leg.kind === "WALK") for (const point of leg.points) expect(isSea(point)).toBe(false);
    const sail = route.legs[1]!;
    if (sail.kind !== "SAIL") throw new Error("expected a crossing");
    expect(sail.from).toEqual({ x: 8, y: 8 });
    expect(sailPath(state, sail.from, sail.to)).toEqual([{ x: 8, y: 8 }, { x: 10, y: 8 }, sail.to]);
  });

  it("spreads the server's arrival time over the legs in order", () => {
    const route = clientMusterTransitRoute(state, flag, launch);
    const total = route.transitMs;
    expect(activeTransitLeg(route, 0, total, 1)?.kind).toBe("WALK");
    expect(activeTransitLeg(route, 0, total, route.legMs[0]! + 1)?.kind).toBe("SAIL");
    const last = activeTransitLeg(route, 0, total, total - 1);
    expect(last?.kind === "WALK" && last.last).toBe(true);
    expect(activeTransitLeg(route, 0, total, total)).toBeUndefined();
  });

  it("does not board at a dock the player doesn't own", () => {
    const route = clientMusterTransitRoute({ ...state, me: "someone-else" }, { x: 8, y: 4 }, { x: 11, y: 4 });
    expect(route.legs.some((leg) => leg.kind === "SAIL")).toBe(false);
  });

  it("dates a server-fired march from its route, not from when it was first seen", () => {
    const route = clientMusterTransitRoute(state, flag, launch);
    // Seen 20 s into the march: it is placed 20 s along, not restarted at the flag.
    expect(marchStartAt(route, 100_000, 100_000 - route.transitMs + 20_000)).toBe(100_000 - route.transitMs);
  });

  it("draws a walk round an obstacle along the detour, not straight through it", () => {
    const walled = new Map(tiles);
    walled.set("5,2", { x: 5, y: 2, terrain: "MOUNTAIN" } as Tile);
    const from = { x: 3, y: 2 };
    const to = { x: 7, y: 2 };
    const route = clientMusterTransitRoute({ ...state, tiles: walled }, from, to);
    expect(isStraightRoute(route, from, to)).toBe(false);
    const line = routedSupplyLine({ ...state, tiles: walled }, { musterX: 3, musterY: 2, targetX: 7, targetY: 2, targetKey: "8,2", phase: "transit" }, 0);
    expect(line.points).not.toContainEqual({ x: 5, y: 2 });
  });
});

describe("drawing a dock march", () => {
  const syncAt = (offsetMs: number): { walks: MusterTransit[]; voyages: MusterBoatVoyage[] } => {
    const walks: MusterTransit[] = [];
    const voyages: MusterBoatVoyage[] = [];
    const overlay: MusterTransitOverlay = {
      clear: () => {}, addTransit: (t) => { walks.push(t); }, addVoyage: (v) => { voyages.push(v); }, commit: () => {}, tick: () => {}, dispose: () => {}
    };
    const route = clientMusterTransitRoute(state, flag, launch);
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const clientState = {
      me: "me", tiles, dockPairs, capture: undefined,
      musterTransitByCommand: new Map([["cmd", { musterX: 8, musterY: 5, marchToX: 11, marchToY: 5, targetX: 12, targetY: 5, transitStartAt: 100_000 - offsetMs, transitEndsAt: 100_000 - offsetMs + route.transitMs, manpower: 30 }]]),
      deferredAttackByCommand: new Map([["cmd", {}]]),
      outgoingMusterAttacksByTile: new Map(), incomingAttacksByTile: new Map(), activeBattles: new Map()
    } as unknown as ClientState;
    const heightfield = { elevationAt: () => 0, cornerYAt: () => 0 } as unknown as Heightfield;
    syncMusterTransitOverlay(clientState, () => "#f00", heightfield, overlay, 0, 0, (x, y) => `${x},${y}`);
    vi.useRealTimers();
    return { walks, voyages };
  };

  it("3D: walks over land to the dock, then sails with no one walking on the water", () => {
    const route = clientMusterTransitRoute(state, flag, launch);
    const start = syncAt(10);
    expect(start.voyages).toHaveLength(0);
    expect(start.walks).toHaveLength(1);
    expect(start.walks[0]!.path.some((p) => Math.floor(p.x) === 10)).toBe(false);
    const sailing = syncAt(route.legMs[0]! + 10);
    expect(sailing.walks).toHaveLength(0);
    expect(sailing.voyages).toHaveLength(1);
  });

  it("2D: the supply line goes through the dock and shows the boat while sailing", () => {
    const route = clientMusterTransitRoute(state, flag, launch);
    const line = { musterX: 8, musterY: 5, targetX: 11, targetY: 5, targetKey: "12,5", phase: "transit" as const, startAt: 0, arriveAt: route.transitMs };
    const walking = routedSupplyLine(state, line, 10);
    expect(walking.points).toContainEqual({ x: 8, y: 8 });
    expect(walking.boat).toBeUndefined();
    const sailing = routedSupplyLine(state, line, route.legMs[0]! + 10);
    expect(sailing.boat).toBeDefined();
  });
});
