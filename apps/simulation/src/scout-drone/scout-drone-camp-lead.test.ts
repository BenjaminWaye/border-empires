import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SCOUT_DRONE_MAX_CHARGES, SCOUT_FINDS_MESSAGE_TYPE } from "@border-empires/shared";
import { SCOUT_CAMP_LEAD_REVEAL_RADIUS, SCOUT_CAMP_LEAD_REVEAL_TTL_MS, SCOUT_CAMP_LEAD_SEARCH_RADIUS, findScoutCampLead, isScoutCampLeadFlight } from "./scout-drone-camp-lead.js";
import { H, W, harness, homeRow, land, lastPayload } from "./scout-drone-runtime.test-helpers.js";

// Owner decision 2026-11-28 (first-15-minutes playtest: minutes 8-15 went dead,
// Explore spent, no one to fight): the guide's last chapter sends the drone to
// the nearest Insurgent camp. That guided flight is free and shows the camp;
// an ordinary Explore shows no camp (the always-on reveal was dropped).

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
  it("is the straight route to the camp: it ends there with no more stops than its legs", () => {
    expect(isScoutCampLeadFlight([{ x: 2, y: 30 }], { x: 2, y: 30 }, launch, W, H)).toBe(true);
    expect(isScoutCampLeadFlight([{ x: 2, y: 20 }, { x: 2, y: 30 }], { x: 2, y: 30 }, launch, W, H)).toBe(true);
    // A third stop rides along for free: refused as a guided flight.
    expect(isScoutCampLeadFlight([{ x: 40, y: 10 }, { x: 2, y: 20 }, { x: 2, y: 30 }], { x: 2, y: 30 }, launch, W, H)).toBe(false);
    expect(isScoutCampLeadFlight([{ x: 2, y: 29 }], { x: 2, y: 30 }, launch, W, H)).toBe(false);
  });
});

const campHarness = () => harness([...homeRow(), camp(2, 30)], undefined, () => false, { trackExplored: true, liveCampKeys: () => ["2,30"] });
const GUIDED = [{ x: 2, y: 20 }, { x: 2, y: 30 }];

describe("scout drone camp lead", () => {
  it("an ordinary Explore shows no camp (regression: every launch revealed one)", () => {
    const h = campHarness();
    h.explore(9, 10, "me", "c1");
    expect(h.reveals.filter((r) => r.startsWith("+cells:"))).toHaveLength(0);
    expect(h.explored.has("me@2,30")).toBe(false);
    expect(h.runtime.campLeadFor("me")).toEqual({ x: 2, y: 30 });
    expect(h.runtime.gauge().campLeadsGranted).toBe(0);
  });

  it("the guided flight to the lead shows the camp, reports it, costs no charge, and the look expires", () => {
    const h = campHarness();
    h.exploreRoute(GUIDED, "me", "c1");
    expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_RESOLVED", commandId: "c1" });
    expect(h.reveals).toContain(`+cells:me@2,30r${SCOUT_CAMP_LEAD_REVEAL_RADIUS}`);
    expect(h.explored.has("me@2,30")).toBe(true);
    expect(h.playerMap.get("me")!.scoutChargeSpends ?? []).toHaveLength(0);
    expect(h.events).toContainEqual(expect.objectContaining({ eventType: "TILE_DELTA_BATCH", commandId: "scout-camp-lead:c1", playerId: "me", tileDeltas: [] }));
    const finds = h.messages.find((m) => m.payload.type === SCOUT_FINDS_MESSAGE_TYPE);
    expect(finds?.payload).toMatchObject({ finds: [{ kind: "defense", x: 2, y: 30 }] });
    // Seen now: no more lead, so no second free flight while this camp stands.
    expect(h.runtime.campLeadFor("me")).toBeUndefined();

    h.advanceTo(h.runtime.flightFor("me")!.landsAt);
    expect(lastPayload(h).report).toMatchObject({ sites: { planetaryDefense: [{ x: 2, y: 30 }] } });
    // Still live after landing, so the camp can be tapped and attacked.
    expect(h.runtime.gauge()).toMatchObject({ campLeadReveals: 1, campLeadsGranted: 1 });

    h.advanceTo(1_000 + SCOUT_CAMP_LEAD_REVEAL_TTL_MS);
    expect(h.reveals.at(-1)).toBe(`-cells:me@2,30r${SCOUT_CAMP_LEAD_REVEAL_RADIUS}`);
    expect(h.runtime.gauge()).toMatchObject({ campLeadReveals: 0, campLeadsGranted: 1 });
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
    expect(h.reveals.filter((r) => r.startsWith("+cells:"))).toHaveLength(0);
  });
});
