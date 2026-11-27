import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SCOUT_FINDS_MESSAGE_TYPE } from "@border-empires/shared";
import { SCOUT_CAMP_LEAD_REVEAL_RADIUS, SCOUT_CAMP_LEAD_REVEAL_TTL_MS, SCOUT_CAMP_LEAD_SEARCH_RADIUS, findScoutCampLead } from "./scout-drone-camp-lead.js";
import { H, W, harness, homeRow, land, lastPayload } from "./scout-drone-runtime.test-helpers.js";

// Owner (first-15-minutes playtest 2026-11-28): a new player spent all 8 charges
// and never found the Insurgent camp world gen posts ~20 tiles from his start.
// A launch now also shows the nearest live camp the player has never seen.

const camp = (x: number, y: number): DomainTileState => land(x, y, { ownerId: "barbarian-1", ownershipState: "SETTLED", campId: `${x},${y}` });
const campFrontier = (x: number, y: number, campId: string): DomainTileState => land(x, y, { ownerId: "barbarian-1", ownershipState: "FRONTIER", campId });
const tileMap = (tiles: DomainTileState[]): Map<string, DomainTileState> => new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
const lead = (tiles: DomainTileState[], explored: Set<string> = new Set(), from = { x: 2, y: 10 }) =>
  findScoutCampLead({ playerId: "me", from, campKeys: tiles.map((t) => `${t.x},${t.y}`), tiles: tileMap(tiles), isExplored: (_p, x, y) => explored.has(`${x},${y}`), worldWidth: W, worldHeight: H });

describe("findScoutCampLead", () => {
  it("picks the nearest live camp in range, skipping frontier, dead camps and far ones", () => {
    const deadCamp = land(4, 14, { ownerId: "barbarian-1", ownershipState: "FRONTIER", campId: "4,14" });
    expect(lead([deadCamp, campFrontier(3, 12, "2,30"), camp(2, 30), camp(20, 10), camp(2, 10 + SCOUT_CAMP_LEAD_SEARCH_RADIUS + 1)])).toEqual({ x: 20, y: 10 });
    expect(lead([camp(50, 40)])).toBeUndefined();
  });

  it("measures across the wrapping edge", () => {
    expect(lead([camp(30, 10), camp(W - 10, 10)])).toEqual({ x: W - 10, y: 10 });
  });

  it("shows nothing once the player has explored a live camp that near", () => {
    expect(lead([camp(2, 30), camp(20, 10)], new Set(["2,30"]))).toBeUndefined();
    expect(lead([camp(2, 30)], new Set(["20,10"]))).toEqual({ x: 2, y: 30 });
  });
});

describe("scout drone camp lead", () => {
  it("reveals the nearest unseen camp on the first launch, reports it, and lets the look expire", () => {
    const h = harness([...homeRow(), camp(2, 30)], undefined, () => false, { trackExplored: true, liveCampKeys: () => ["2,30"] });
    h.explore(9, 10, "me", "c1");
    expect(h.reveals).toContain(`+cells:me@2,30r${SCOUT_CAMP_LEAD_REVEAL_RADIUS}`);
    expect(h.explored.has("me@2,30")).toBe(true);
    expect(h.events).toContainEqual(expect.objectContaining({ eventType: "TILE_DELTA_BATCH", commandId: "scout-camp-lead:c1", playerId: "me", tileDeltas: [] }));
    const finds = h.messages.find((m) => m.payload.type === SCOUT_FINDS_MESSAGE_TYPE);
    expect(finds?.payload).toMatchObject({ finds: [{ kind: "defense", x: 2, y: 30 }] });

    h.advanceTo(h.runtime.flightFor("me")!.landsAt);
    expect(lastPayload(h).report).toMatchObject({ planetaryDefenseTiles: 1, sites: { planetaryDefense: [{ x: 2, y: 30 }] } });
    // Still live after landing, so the camp can be tapped and attacked.
    expect(h.runtime.gauge()).toMatchObject({ campLeadReveals: 1, campLeadsGranted: 1 });

    h.advanceTo(1_000 + SCOUT_CAMP_LEAD_REVEAL_TTL_MS);
    expect(h.reveals.at(-1)).toBe(`-cells:me@2,30r${SCOUT_CAMP_LEAD_REVEAL_RADIUS}`);
    expect(h.runtime.gauge()).toMatchObject({ campLeadReveals: 0, campLeadsGranted: 1 });
  });

  it("shows no camp on a later launch once the player has seen it", () => {
    const h = harness([...homeRow(), camp(2, 30)], undefined, () => false, { trackExplored: true, liveCampKeys: () => ["2,30"] });
    h.explore(9, 10, "me", "c1");
    h.advanceTo(h.runtime.flightFor("me")!.landsAt);
    h.explore(9, 12, "me", "c2");
    expect(h.reveals.filter((r) => r.startsWith("+cells:"))).toHaveLength(1);
    expect(h.runtime.gauge().campLeadsGranted).toBe(1);
  });
});
