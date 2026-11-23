// Launch-scope item 3 (docs/gdd.md §9, docs/core-loop.md §12 tensions 4 and 5):
// the first session teaches reach as how a House grows, says that land beyond
// reach can't be garrisoned, and has the player garrison one plain border tile.

import { describe, expect, it } from "vitest";
import { OUTPOST_REACH_RADIUS, RELAY_BEACON_FREE_FOOD_SLOT_COUNT, SETTLE_MANPOWER_COST } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { scanGuideGarrisonTargets } from "./tutorial-guide-garrison-targets.js";
import { BEACON_WHY, evaluateGuide, GARRISON_WHY, GUIDE_STEPS, type GuideInput } from "./tutorial-guide-steps.js";
import { TOWN_STEP } from "./tutorial-guide-foothold-copy.js";
import { turnFinishWhy } from "./tutorial-guide-turn-finish.js";

const ME = "me";
const key = (x: number, y: number): string => `${x},${y}`;
const land = (x: number, y: number, extra: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ...extra }) as Tile;
const mine = (x: number, y: number, state: "FRONTIER" | "SETTLED", extra: Partial<Tile> = {}): Tile => land(x, y, { ownerId: ME, ownershipState: state, ...extra });
const mapOf = (tiles: Tile[]): Map<string, Tile> => new Map(tiles.map((t) => [key(t.x, t.y), t]));
const everywhere = (): boolean => true;
const fromHome = (t: { x: number; y: number }): number => Math.abs(t.x - 10) + Math.abs(t.y - 10);
const scan = (tiles: Tile[], inReach: (x: number, y: number) => boolean = everywhere) => scanGuideGarrisonTargets(mapOf(tiles), ME, inReach, fromHome);

const afc = { ownerId: ME, status: "active" } as NonNullable<Tile["afc"]>;

describe("garrison-your-border step: completion and targets", () => {
  it("is not done by the landing: the AFC footprint is garrisoned at spawn", () => {
    const footprint = [mine(10, 10, "SETTLED", { afc }), mine(11, 10, "SETTLED"), mine(11, 11, "SETTLED"), mine(12, 12, "SETTLED")];
    expect(scan(footprint).garrisonedPlain).toBe(false);
  });

  it("is not done by a town, a resource, a dock or a Relay Beacon site the game or another step garrisoned", () => {
    const tiles = [
      mine(10, 10, "SETTLED", { afc }),
      mine(20, 10, "SETTLED", { resource: "FARM" }),
      mine(22, 10, "SETTLED", { dockId: "d1" }),
      mine(24, 10, "SETTLED", { economicStructure: { type: "RELAY_BEACON" } as NonNullable<Tile["economicStructure"]> })
    ];
    expect(scan(tiles).garrisonedPlain).toBe(false);
  });

  it("is done once a plain tile away from the AFC is garrisoned, but not while that garrison is still pending", () => {
    expect(scan([mine(10, 10, "SETTLED", { afc }), mine(15, 10, "SETTLED", { optimisticPending: "settle" } as Partial<Tile>)]).garrisonedPlain).toBe(false);
    expect(scan([mine(10, 10, "SETTLED", { afc }), mine(15, 10, "SETTLED")]).garrisonedPlain).toBe(true);
  });

  it("rings own frontier border tiles inside reach, those touching another owner first, never land beyond reach", () => {
    const tiles = [
      mine(10, 10, "SETTLED", { afc }),
      mine(13, 10, "FRONTIER"), // interior: all four neighbours are mine
      mine(12, 10, "FRONTIER"),
      mine(14, 10, "FRONTIER"),
      mine(13, 9, "FRONTIER"),
      mine(13, 11, "FRONTIER"),
      mine(15, 10, "FRONTIER"), // touches a rival
      land(16, 10, { ownerId: "rival", ownershipState: "SETTLED" }),
      mine(30, 30, "FRONTIER") // beyond reach
    ];
    const result = scan(tiles, (x) => x < 20);
    expect(result.targets[0]).toEqual({ x: 15, y: 10 });
    expect(result.targets).toHaveLength(3);
    expect(result.targets).not.toContainEqual({ x: 13, y: 10 });
    expect(result.targets).not.toContainEqual({ x: 30, y: 30 });
  });
});

const input = (overrides: Partial<GuideInput>): GuideInput =>
  ({
    checklist: { step: "DONE", townFound: true, townExpanded: true, foodFound: true, foodExpanded: true, foodSlotsFound: 4, foodSlotsClaimed: 4, foodSlotsTarget: 4, highlightTiles: [] },
    footholdTargets: { town: { outOfReach: 0, unreachable: 0, pending: [], garrison: [], expand: [] }, food: { outOfReach: 0, unreachable: 0, pending: [], garrison: [], expand: [] } },
    panned: true,
    zoomed: true,
    openPanel: null,
    hudV2: false,
    activityDashboardOpen: false,
    manifestCount: 0,
    manufactoryResearched: false,
    manufactoryUnlocked: false,
    afcUpgradeReady: false,
    afcUpgradeInstalled: false,
    foodSlotFree: true,
    rivalHouseMet: false,
    diplomacyUsed: false,
    ownsBuiltStructure: false,
    ownsRelayBeacon: false,
    beaconSite: () => ({ x: 3, y: 3 }),
    garrison: () => ({ garrisonedPlain: false, targets: [] }),
    buildTargetTiles: [{ x: 1, y: 1 }],
    musterUnlocked: false,
    ownsMusterFlag: false,
    musterTargetTiles: [],
    scout: "none",
    exploreTarget: () => undefined,
    nothingToExplore: () => true,
    scoutFlights: 0,
    ...overrides
  }) as GuideInput;

const pastFoothold = new Set(["look-pan", "look-zoom", "look-explore", "foothold-take-town", "foothold-take-food"]);

describe("the guide teaches reach, not Expand To, as how a House grows", () => {
  it("asks for a Relay Beacon after the foothold and completes only on a beacon, not on claimed land", () => {
    const view = evaluateGuide(input({}), pastFoothold);
    if (view.kind !== "step") throw new Error("expected a step");
    expect(view.step.id).toBe("reach-beacon");
    expect(view.newlyCompleted).not.toContain("reach-beacon");
    expect(evaluateGuide(input({ ownsRelayBeacon: true }), pastFoothold)).toEqual(expect.objectContaining({ newlyCompleted: expect.arrayContaining(["reach-beacon"]) }));
  });

  it("says the beacon moves reach, with the numbers from the rules, and that land beyond reach can't be garrisoned", () => {
    expect(BEACON_WHY).toContain(`${OUTPOST_REACH_RADIUS} tiles`);
    expect(BEACON_WHY).toContain(`first ${RELAY_BEACON_FREE_FOOD_SLOT_COUNT} need no food slot`);
    expect(BEACON_WHY).toContain("beyond your reach can't be garrisoned");
    // The old line charged a food slot the first beacons don't use.
    expect(BEACON_WHY).not.toContain("uses one food slot");
  });

  it("limits Expand To to crossing for a town or dock", () => {
    expect(TOWN_STEP.expand.why).toMatch(/Cross only for a town or dock/);
    expect(TOWN_STEP.expand.why).toMatch(/can't be garrisoned/);
  });

  it("then has the player garrison a marked border tile, explaining why plain land needs it", () => {
    const targets = [{ x: 7, y: 7 }];
    const view = evaluateGuide(input({ ownsRelayBeacon: true, garrison: () => ({ garrisonedPlain: false, targets }) }), pastFoothold);
    expect(view).toEqual(
      expect.objectContaining({ title: "Tap a marked border tile and Garrison it", chapterTitle: "Your reach", highlightTiles: targets, why: GARRISON_WHY })
    );
    expect(GARRISON_WHY).toContain(`${SETTLE_MANPOWER_COST} manpower`);
    expect(GARRISON_WHY).toContain("no defence");
    const done = evaluateGuide(input({ ownsRelayBeacon: true, garrison: () => ({ garrisonedPlain: true, targets: [] }) }), pastFoothold);
    expect(done.kind === "step" && done.step.id).toBe("manpower-open");
  });

  it("doesn't send a player whose saved progress is already past it back to the garrison step", () => {
    const saved = new Set([...pastFoothold, "reach-beacon", "manpower-open"]);
    const view = evaluateGuide(input({ ownsRelayBeacon: true }), saved);
    if (view.kind !== "step") throw new Error("expected a step");
    expect(view.newlyCompleted).toContain("reach-garrison");
    expect(view.step.id).toBe("manifest-open");
  });

  it("keeps the garrison step in the Your reach chapter, right after the beacon", () => {
    const ids = GUIDE_STEPS.map((s) => s.id);
    expect(ids.indexOf("reach-garrison")).toBe(ids.indexOf("reach-beacon") + 1);
  });

  it("sends the player off with the real loop, without 'expand' as a verb", () => {
    for (const why of [turnFinishWhy({ current: 100, cap: 720 }, "Chronicle"), turnFinishWhy({ current: 2000, cap: 720 }, "Chronicle")]) {
      expect(why).toContain("push your reach with beacons");
      expect(why).not.toMatch(/\bexpand\b/);
    }
  });
});
