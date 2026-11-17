import { describe, expect, it } from "vitest";
import { tileKey, WORLD_WIDTH } from "@border-empires/shared";
import type { ScoutDroneFlight } from "@border-empires/shared";
import { GUIDE_EXPLORE_OVERSHOOT, GUIDE_EXPLORE_SEARCH_RADIUS, guideExploreTarget, guideScoutStatus } from "./tutorial-guide-explore-target.js";
import { evaluateGuide, GUIDE_STEPS, type GuideInput } from "./tutorial-guide-steps.js";
import { guideTargetAction, type GuideTargetSet } from "./tutorial-guide-foothold-targets.js";

const HOME = { x: 50, y: 50 };

/** Everything within `radius` of home discovered, plus extra keys. */
const discoveredAround = (radius: number, extra: string[] = []): Set<string> => {
  const set = new Set(extra);
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) set.add(tileKey(HOME.x + dx, HOME.y + dy));
  return set;
};

const emptySet = (): GuideTargetSet => ({ outOfReach: 0, pending: [], garrison: [], expand: [] });

const input = (overrides: Partial<GuideInput> = {}): GuideInput => ({
  checklist: {
    step: "EXPAND_TOWN",
    townFound: false,
    townExpanded: false,
    foodFound: false,
    foodExpanded: false,
    foodSlotsFound: 0,
    foodSlotsClaimed: 0,
    foodSlotsTarget: 4,
    highlightTiles: []
  },
  footholdTargets: { town: emptySet(), food: emptySet() },
  manufactoryResearched: false,
  manufactoryUnlocked: false,
  afcUpgradeReady: false,
  afcUpgradeInstalled: false,
  foodSlotFree: true,
  rivalHouseMet: false,
  diplomacyUsed: false,
  panned: true,
  zoomed: true,
  openPanel: null,
  hudV2: true,
  activityDashboardOpen: false,
  manifestCount: 0,
  ownsBuiltStructure: false,
  ownsRelayBeacon: false,
  beaconSite: () => undefined,
  buildTargetTiles: [],
  musterUnlocked: false,
  ownsMusterFlag: false,
  musterTargetTiles: [],
  scout: "ready",
  exploreTarget: () => ({ x: 70, y: 50 }),
  nothingToExplore: () => false,
  ...overrides
});

const flight = (landsAt: number): ScoutDroneFlight => ({ launchedAt: 0, landsAt, targetX: 0, targetY: 0, steps: [{ x: 0, y: 0, at: 0 }], turnIndex: 0, endReason: "TARGET" });

describe("guide explore target", () => {
  it("points past the nearest unexplored tile, along the same line, at ground still unexplored", () => {
    // Seen out to radius 5, except that the east is unknown from x = 56.
    const target = guideExploreTarget(discoveredAround(5), HOME);
    const distance = Math.max(Math.abs(target!.x - HOME.x), Math.abs(target!.y - HOME.y));
    expect(distance).toBe(6 + GUIDE_EXPLORE_OVERSHOOT);
  });

  it("wraps across the world seam", () => {
    const target = guideExploreTarget(new Set([tileKey(0, 0)]), { x: 0, y: 0 });
    expect(target).toBeDefined();
    expect(target!.x).toBeGreaterThanOrEqual(0);
    expect(target!.x).toBeLessThan(WORLD_WIDTH);
  });

  it("falls back to the nearest unexplored tile when the pushed-out one has been seen", () => {
    // Only (56, 44) is unknown inside a fully seen square: the pushed-out tile is seen.
    const seen = discoveredAround(GUIDE_EXPLORE_SEARCH_RADIUS + GUIDE_EXPLORE_OVERSHOOT);
    seen.delete(tileKey(56, 44));
    expect(guideExploreTarget(seen, HOME)).toEqual({ x: 56, y: 44 });
  });

  it("has nothing to point at once all ground near home is seen, or before home is known", () => {
    expect(guideExploreTarget(discoveredAround(GUIDE_EXPLORE_SEARCH_RADIUS), HOME)).toBeUndefined();
    expect(guideExploreTarget(new Set(), undefined)).toBeUndefined();
  });

  it("reads the drone as out while it flies, ready on landing, and absent without an AFC", () => {
    expect(guideScoutStatus(flight(2_000), true, 1_000)).toBe("out");
    expect(guideScoutStatus(flight(500), true, 1_000)).toBe("ready");
    expect(guideScoutStatus(undefined, false, 1_000)).toBe("none");
  });
});

describe("guide steps with the scout drone", () => {
  it("asks a new House to Explore right after looking around, marking the target", () => {
    const view = evaluateGuide(input(), new Set());
    if (view.kind !== "step") throw new Error("expected a step");
    expect(view.step.id).toBe("look-explore");
    expect(view.chapterTitle).toBe("Explore");
    expect(view.title).toBe("Tap the marked unexplored ground and Explore");
    expect(view.highlightTiles).toEqual([{ x: 70, y: 50 }]);
  });

  it("ticks Explore off once the drone is in the air, or once nothing near home is left unexplored", () => {
    const view = evaluateGuide(input({ scout: "out" }), new Set());
    expect(view.kind === "step" && view.newlyCompleted).toContain("look-explore");
    const exhausted = evaluateGuide(input({ exploreTarget: () => undefined, nothingToExplore: () => true }), new Set());
    expect(exhausted.kind === "step" && exhausted.newlyCompleted).toContain("look-explore");
  });

  it("does not tick Explore off before home is known (no target yet, but not exhausted): completion is sticky", () => {
    const view = evaluateGuide(input({ exploreTarget: () => undefined, nothingToExplore: () => false }), new Set());
    expect(view.kind === "step" && view.newlyCompleted).not.toContain("look-explore");
    expect(view.kind === "step" && view.step.id).toBe("look-explore");
  });

  it("skips Explore for a House with no AFC, and counts it done for players already past it", () => {
    const noAfc = evaluateGuide(input({ scout: "none" }), new Set());
    expect(noAfc.kind === "step" && noAfc.step.id).toBe("foothold-take-town");
    const later = evaluateGuide(input({ scout: "none" }), new Set(["look-pan", "look-zoom", "foothold-take-town"]));
    expect(later.kind === "step" && later.newlyCompleted).toContain("look-explore");
  });

  it("with no town known, the town step asks for a drone flight before a Relay Beacon", () => {
    const done = new Set(["look-pan", "look-zoom", "look-explore"]);
    const explore = evaluateGuide(input(), done);
    expect(explore).toEqual(
      expect.objectContaining({ title: "No town in sight: tap the marked unexplored ground and Explore", highlightTiles: [{ x: 70, y: 50 }] })
    );
    const scouting = evaluateGuide(input({ scout: "out" }), done);
    expect(scouting).toEqual(expect.objectContaining({ title: "Your scout drone is out: wait for its report", highlightTiles: [] }));
    // Nothing left to explore nearby: back to the beacon.
    const beacon = evaluateGuide(input({ exploreTarget: () => undefined, nothingToExplore: () => true }), done);
    expect(beacon.kind === "step" && beacon.title).toMatch(/^No town in sight: build a Relay Beacon/);
  });

  it("a town the drone found, now back under fog, is still asked for with Expand To", () => {
    const town: GuideTargetSet = { ...emptySet(), expand: [{ x: 60, y: 50 }] };
    expect(guideTargetAction(town, "ready", true)).toBe("expand");
  });

  it("food known only outside reach asks for a beacon even with the drone ready: exploring can't bring it into reach", () => {
    const food: GuideTargetSet = { ...emptySet(), outOfReach: 3 };
    expect(guideTargetAction(food, "ready", true)).toBe("beacon");
    const done = new Set(["look-pan", "look-zoom", "look-explore", "foothold-take-town"]);
    const view = evaluateGuide(input({ footholdTargets: { town: emptySet(), food } }), done);
    expect(view.kind === "step" && view.title).toMatch(/^No food in your reach: build a Relay Beacon/);
  });

  it("first-contact steps tell the player to Explore while they wait", () => {
    const notes = GUIDE_STEPS.filter((s) => s.id === "contest-muster" || s.id === "diplomacy-truce").map((s) => s.waitingNote);
    expect(notes).toHaveLength(2);
    for (const note of notes) expect(note).toMatch(/^Explore to find/);
  });
});

describe("guide input from client state", () => {
  it("reads the drone and the explore target, and has no drone while the AFC is lost", async () => {
    const { createInitialState } = await import("../client-state/client-state.js");
    const { buildGuideInput, resetGuideInputCacheForTests } = await import("./tutorial-guide-input.js");
    resetGuideInputCacheForTests();
    const state = createInitialState();
    state.me = "me";
    state.homeTile = HOME;
    state.discoveredTiles = discoveredAround(3);
    const ready = buildGuideInput(state);
    expect(ready.scout).toBe("ready");
    expect(ready.exploreTarget()).toBeDefined();
    expect(ready.nothingToExplore()).toBe(false);
    // A drone flight grows the discovered set without a tiles change: the target follows it.
    state.discoveredTiles = discoveredAround(GUIDE_EXPLORE_SEARCH_RADIUS);
    expect(buildGuideInput(state).exploreTarget()).toBeUndefined();
    expect(buildGuideInput(state).nothingToExplore()).toBe(true);
    state.homeTile = undefined;
    expect(buildGuideInput(state).nothingToExplore()).toBe(false);
    state.homeTile = HOME;
    state.scoutDroneFlight = flight(Date.now() + 60_000);
    expect(buildGuideInput(state).scout).toBe("out");
    state.scoutDroneFlight = undefined;
    state.afcRecovery = { requiredSince: 1 } as never;
    expect(buildGuideInput(state).scout).toBe("none");
  });
});
