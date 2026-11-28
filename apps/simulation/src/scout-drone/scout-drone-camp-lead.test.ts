import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SCOUT_DRONE_MAX_CHARGES, SCOUT_FINDS_MESSAGE_TYPE } from "@border-empires/shared";
import { SCOUT_CAMP_LEAD_REVEAL_RADIUS, SCOUT_CAMP_LEAD_SEARCH_RADIUS, findScoutCampLead, isScoutCampLeadFlight } from "./scout-drone-camp-lead.js";
import { H, W, harness, homeRow, land, lastPayload, type Harness } from "./scout-drone-runtime.test-helpers.js";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

// Owner decision 2026-11-28 (first-15-minutes playtest: minutes 8-15 went dead,
// Explore spent, no one to fight): the guide's last chapter sends the drone to
// the nearest Insurgent camp. That guided flight is free and shows the camp;
// an ordinary Explore shows no camp (the always-on reveal was dropped).
// Owner decisions in the PR #3063 review: the camp shows when the drone ARRIVES
// over it, not at launch, and stays shown until it falls or the player moves
// past the guide's chapter (SCOUT_CAMP_LEAD_DONE), not for a fixed time.

const camp = (x: number, y: number): DomainTileState => land(x, y, { ownerId: "barbarian-1", ownershipState: "SETTLED", campId: `${x},${y}` });
const campFrontier = (x: number, y: number, campId: string): DomainTileState => land(x, y, { ownerId: "barbarian-1", ownershipState: "FRONTIER", campId });
const tileMap = (tiles: DomainTileState[]): Map<string, DomainTileState> => new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
const lead = (tiles: DomainTileState[], explored: Set<string> = new Set(), origins = [{ x: 2, y: 10 }]) =>
  findScoutCampLead({ playerId: "me", origins, campKeys: tiles.map((t) => `${t.x},${t.y}`), tiles: tileMap(tiles), isExplored: (_p, x, y) => explored.has(`${x},${y}`), worldWidth: W, worldHeight: H });

describe("findScoutCampLead", () => {
  it("picks the nearest live camp in range, skipping frontier, dead camps and far ones", () => {
    const deadCamp = land(4, 14, { ownerId: "barbarian-1", ownershipState: "FRONTIER", campId: "4,14" });
    expect(lead([deadCamp, campFrontier(3, 12, "2,30"), camp(2, 30), camp(20, 10), camp(2, 10 + SCOUT_CAMP_LEAD_SEARCH_RADIUS + 1)])).toEqual({ x: 20, y: 10 });
    expect(lead([camp(50, 40)])).toBeUndefined();
  });

  it("measures across the wrapping edge, from the nearest of several AFCs", () => {
    expect(lead([camp(30, 10), camp(W - 10, 10)])).toEqual({ x: W - 10, y: 10 });
    expect(lead([camp(50, 40)], new Set(), [{ x: 2, y: 10 }, { x: 45, y: 40 }])).toEqual({ x: 50, y: 40 });
  });

  it("shows nothing once the player has explored a live camp that near", () => {
    expect(lead([camp(2, 30), camp(20, 10)], new Set(["2,30"]))).toBeUndefined();
    expect(lead([camp(2, 30)], new Set(["20,10"]))).toEqual({ x: 2, y: 30 });
  });
});

describe("isScoutCampLeadFlight", () => {
  const launch = { x: 2, y: 10 };
  it("is exactly the straight route to the camp, stop for stop", () => {
    expect(isScoutCampLeadFlight([{ x: 2, y: 25 }], { x: 2, y: 25 }, launch, W, H)).toBe(true);
    expect(isScoutCampLeadFlight([{ x: 2, y: 20 }, { x: 2, y: 30 }], { x: 2, y: 30 }, launch, W, H)).toBe(true);
    // A third stop rides along for free: refused as a guided flight.
    expect(isScoutCampLeadFlight([{ x: 40, y: 10 }, { x: 2, y: 20 }, { x: 2, y: 30 }], { x: 2, y: 30 }, launch, W, H)).toBe(false);
    // Regression (PR #3063 review): the right stop count, but the first stop is a scouting leg the other way.
    expect(isScoutCampLeadFlight([{ x: 2, y: 0 }, { x: 2, y: 30 }], { x: 2, y: 30 }, launch, W, H)).toBe(false);
    expect(isScoutCampLeadFlight([{ x: 2, y: 30 }], { x: 2, y: 30 }, launch, W, H)).toBe(false);
    expect(isScoutCampLeadFlight([{ x: 2, y: 29 }], { x: 2, y: 30 }, launch, W, H)).toBe(false);
  });
});

const campHarness = (extraCamps: DomainTileState[] = []) =>
  harness([...homeRow(), camp(2, 30), ...extraCamps], undefined, () => false, { trackExplored: true, liveCampKeys: () => ["2,30", ...extraCamps.map((t) => `${t.x},${t.y}`)] });
const GUIDED = [{ x: 2, y: 20 }, { x: 2, y: 30 }];
const campLooks = (h: Harness): string[] => h.reveals.filter((r) => r.startsWith("+cells:") || r.startsWith("-cells:"));
const campDone = (h: Harness, commandId: string): void =>
  h.runtime.handleCampLeadDone({ commandId, playerId: "me", sessionId: "s", type: "SCOUT_CAMP_LEAD_DONE", payloadJson: "{}" } as unknown as CommandEnvelope);
/** The time the guided drone is over the camp on its way out. */
const arrivalAt = (h: Harness): number => {
  const flight = h.runtime.flightFor("me")!;
  return flight.steps[flight.turnIndex]!.at;
};
const fall = (h: Harness, x: number, y: number): void => {
  h.tiles.set(`${x},${y}`, land(x, y, { ownerId: "me", ownershipState: "FRONTIER" }));
};

describe("scout drone camp lead", () => {
  it("an ordinary Explore shows no camp (regression: every launch revealed one)", () => {
    const h = campHarness();
    h.explore(9, 10, "me", "c1");
    expect(campLooks(h)).toHaveLength(0);
    expect(h.explored.has("me@2,30")).toBe(false);
    expect(h.runtime.campLeadFor("me")).toEqual({ x: 2, y: 30 });
    expect(h.runtime.gauge().campLeadsGranted).toBe(0);
  });

  it("shows the camp when the drone arrives over it, not at launch (owner decision 1)", () => {
    const h = campHarness();
    h.exploreRoute(GUIDED, "me", "c1");
    expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_RESOLVED", commandId: "c1" });
    expect(h.playerMap.get("me")!.scoutChargeSpends ?? []).toHaveLength(0);
    // At launch: no look, and the camp is still unseen.
    expect(campLooks(h)).toHaveLength(0);
    expect(h.explored.has("me@2,30")).toBe(false);
    expect(h.runtime.campLeadFor("me")).toEqual({ x: 2, y: 30 });

    h.advanceTo(arrivalAt(h) - 1);
    expect(campLooks(h)).toHaveLength(0);
    h.advanceTo(arrivalAt(h));
    expect(campLooks(h)).toEqual([`+cells:me@2,30r${SCOUT_CAMP_LEAD_REVEAL_RADIUS}`]);
    expect(h.events).toContainEqual(expect.objectContaining({ eventType: "TILE_DELTA_BATCH", commandId: "scout-camp-lead:c1", playerId: "me", tileDeltas: [] }));
    const finds = h.messages.filter((m) => m.payload.type === SCOUT_FINDS_MESSAGE_TYPE).flatMap((m) => m.payload.finds as unknown[]);
    expect(finds).toContainEqual({ kind: "defense", x: 2, y: 30 });
    // Seen now: no more lead, so no second free flight while this camp stands.
    expect(h.runtime.campLeadFor("me")).toBeUndefined();

    h.advanceTo(h.runtime.flightFor("me")!.landsAt);
    expect(lastPayload(h).report).toMatchObject({ sites: { planetaryDefense: [{ x: 2, y: 30 }] } });
    expect(h.runtime.gauge()).toMatchObject({ campLeadReveals: 1, campLeadsGranted: 1, campLeadFreeFlights: 1, campLeadFlightsUnarrived: 0 });
  });

  it("a guided drone called home before the camp shows nothing", () => {
    const h = campHarness();
    h.exploreRoute(GUIDED, "me", "c1");
    h.advanceTo(h.runtime.flightFor("me")!.steps[2]!.at);
    h.recall("me", "r1");
    h.advanceTo(h.runtime.flightFor("me")!.landsAt);
    expect(campLooks(h)).toHaveLength(0);
    expect(h.runtime.gauge()).toMatchObject({ campLeadReveals: 0, campLeadsGranted: 0, campLeadFlightsUnarrived: 1 });
    // Still unseen: the free flight is offered again.
    expect(h.runtime.campLeadFor("me")).toEqual({ x: 2, y: 30 });
  });

  it("keeps the camp shown until it falls, then offers the next camp's free flight (owner decisions 2 and 3)", () => {
    const h = campHarness([camp(30, 10)]);
    h.exploreRoute(GUIDED, "me", "c1");
    h.advanceTo(h.runtime.flightFor("me")!.landsAt);
    // Long past the old 10-minute look: still shown while the camp stands.
    h.advanceTo(h.now() + 6 * 60 * 60_000);
    expect(h.runtime.gauge()).toMatchObject({ campLeadReveals: 1, campLeadsEndedCampFell: 0 });
    expect(campLooks(h).filter((r) => r.startsWith("-cells:"))).toHaveLength(0);
    expect(h.runtime.campLeadFor("me")).toBeUndefined();

    fall(h, 2, 30);
    h.advanceTo(h.now() + 1_000);
    expect(campLooks(h).at(-1)).toBe(`-cells:me@2,30r${SCOUT_CAMP_LEAD_REVEAL_RADIUS}`);
    expect(h.runtime.gauge()).toMatchObject({ campLeadReveals: 0, campLeadsEndedCampFell: 1 });
    expect(h.runtime.campLeadFor("me")).toEqual({ x: 30, y: 10 });
  });

  it("ends the look when the player moves past the guide's chapter (owner decision 2)", () => {
    const h = campHarness();
    campDone(h, "early");
    expect(h.runtime.gauge()).toMatchObject({ campLeadDoneNoLook: 1, campLeadsEndedGuideDone: 0 });
    h.exploreRoute(GUIDED, "me", "c1");
    h.advanceTo(h.runtime.flightFor("me")!.landsAt);
    campDone(h, "done");
    expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_RESOLVED", commandId: "done" });
    expect(campLooks(h).at(-1)).toBe(`-cells:me@2,30r${SCOUT_CAMP_LEAD_REVEAL_RADIUS}`);
    expect(h.events).toContainEqual(expect.objectContaining({ eventType: "TILE_DELTA_BATCH", commandId: "scout-camp-lead-expire:done" }));
    expect(h.runtime.gauge()).toMatchObject({ campLeadReveals: 0, campLeadsEndedGuideDone: 1 });
  });

  it("flies the guided route with every charge spent (playtest: Explore was spent by minute 8)", () => {
    const h = campHarness();
    h.playerMap.get("me")!.scoutChargeSpends = Array.from({ length: SCOUT_DRONE_MAX_CHARGES }, () => 1_000);
    h.explore(9, 10, "me", "spent");
    expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_REJECTED", code: "SCOUT_NO_CHARGES" });
    h.exploreRoute(GUIDED, "me", "guided");
    expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_RESOLVED", commandId: "guided" });
    expect(h.playerMap.get("me")!.scoutChargeSpends).toHaveLength(SCOUT_DRONE_MAX_CHARGES);
  });

  it("a route that only ends at the camp but carries extra stops pays as usual and shows no camp", () => {
    const h = campHarness();
    h.exploreRoute([{ x: 9, y: 10 }, ...GUIDED], "me", "padded");
    expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_RESOLVED", commandId: "padded" });
    expect(h.playerMap.get("me")!.scoutChargeSpends?.length ?? 0).toBeGreaterThan(0);
    h.advanceTo(h.runtime.flightFor("me")!.landsAt);
    expect(campLooks(h)).toHaveLength(0);
  });

  it("a guided route a known rival border cuts short of the camp is an ordinary flight", () => {
    const tiles = [...homeRow(), camp(2, 30), ...[0, 1, 2, 3, 4].map((x) => land(x, 25, { ownerId: "rival", ownershipState: "SETTLED" }))];
    const h = harness(tiles, undefined, (_p, _x, y) => y === 25, { trackExplored: true, liveCampKeys: () => ["2,30"] });
    h.playerMap.get("me")!.scoutChargeSpends = Array.from({ length: SCOUT_DRONE_MAX_CHARGES }, () => 1_000);
    h.exploreRoute(GUIDED, "me", "cut");
    expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_REJECTED", code: "SCOUT_NO_CHARGES" });
    expect(h.runtime.gauge()).toMatchObject({ campLeadRoutesCutShort: 1, campLeadFreeFlights: 0 });
  });
});
