// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { evaluateGuide, GUIDE_STEPS, type GuideInput } from "./tutorial-guide-steps.js";
import { guideCampOf, resetGuideCampForTests, type GuideCamp } from "./tutorial-guide-camp-input.js";
import { guideAllianceSeen, guideAllianceStanding } from "./tutorial-guide-contest-input.js";

// Owner decision 2026-11-28, after the first-15-minutes playtest (minutes 8-15 dead: Explore spent, Coin at 0,
// no one to fight): the guide's last chapter sends the drone to the nearest Insurgent camp and walks the player
// through taking it, and the Diplomacy chapter teaches that "Swear fealty" is the alliance.

const tile = (t: Partial<Tile> & { x: number; y: number }): Tile => ({ terrain: "LAND", ...t }) as Tile;
const campTile = (x: number, y: number): Tile => tile({ x, y, ownerId: "barbarian-1", ownershipState: "SETTLED" });

const campState = (tiles: Tile[], lead?: { x: number; y: number }) => {
  const state = { ...createInitialState(), me: "me", homeTile: { x: 10, y: 10 }, tiles: new Map(tiles.map((t) => [`${t.x},${t.y}`, t])) };
  if (lead) state.guideCampLead = lead;
  return state;
};

const home = [tile({ x: 10, y: 10, ownerId: "me", ownershipState: "SETTLED" }), tile({ x: 11, y: 10, ownerId: "me", ownershipState: "FRONTIER" })];

describe("the First battle chapter's camp", () => {
  beforeEach(() => resetGuideCampForTests());

  it("points at the server's lead while it is fog, then at the camp once seen, and sees it fall", () => {
    const state = campState(home, { x: 30, y: 10 });
    expect(guideCampOf(state)).toMatchObject({ target: { x: 30, y: 10 }, inFog: true, sighted: false, won: false });

    // The guided flight shows the camp; PLAYER_UPDATE then clears the lead.
    state.tiles.set("30,10", campTile(30, 10));
    state.guideCampLead = undefined;
    state.tilesRevision += 1;
    state.selected = { x: 30, y: 10 };
    expect(guideCampOf(state)).toMatchObject({ target: { x: 30, y: 10 }, inFog: false, sighted: true, won: false, selected: true, flagTiles: [{ x: 11, y: 10 }, { x: 10, y: 10 }] });

    state.tiles.set("30,10", tile({ x: 30, y: 10, ownerId: "me", ownershipState: "FRONTIER" }));
    state.tilesRevision += 1;
    expect(guideCampOf(state)).toMatchObject({ target: { x: 30, y: 10 }, sighted: true, won: true });
  });

  it("with no lead, picks the nearest live camp on the map near home, not frontier or far camps", () => {
    const state = campState([...home, tile({ x: 14, y: 10, ownerId: "barbarian-1", ownershipState: "FRONTIER" }), campTile(60, 10), campTile(25, 12)]);
    expect(guideCampOf(state)).toMatchObject({ target: { x: 25, y: 12 }, sighted: true, bordersMine: false });
    const none = guideCampOf(campState(home));
    expect(none.target).toBeUndefined();
    expect(none.sighted).toBe(false);
  });
});

const noCamp: GuideCamp = { inFog: false, sighted: false, won: false, bordersMine: false, selected: false, flagTiles: [] };
const stepInput = (overrides: Partial<GuideInput> = {}): GuideInput => ({
  checklist: { step: "DONE", townFound: true, townExpanded: true, foodFound: true, foodExpanded: true, foodSlotsFound: 4, foodSlotsClaimed: 4, foodSlotsTarget: 4, highlightTiles: [] },
  footholdTargets: { town: { outOfReach: 0, unreachable: 0, pending: [], garrison: [], expand: [] }, food: { outOfReach: 0, unreachable: 0, pending: [], garrison: [], expand: [] } },
  manufactoryResearched: true,
  manufactoryUnlocked: true,
  afcUpgradeReady: false,
  afcUpgradeInstalled: true,
  foodSlotFree: true,
  rivalHouseMet: false,
  diplomacyUsed: false,
  panned: true,
  zoomed: true,
  openPanel: null,
  hudV2: true,
  activityDashboardOpen: true,
  manifestCount: 1,
  ownsBuiltStructure: true,
  ownsRelayBeacon: true,
  beaconSite: () => undefined,
  buildTargetTiles: [],
  musterUnlocked: false,
  ownsMusterFlag: false,
  musterTargetTiles: [],
  attackLaunched: false,
  attackTargetTiles: () => [],
  truceStage: "none",
  camp: noCamp,
  allianceStanding: "ALLIANCE",
  allianceSeen: false,
  scout: "ready",
  exploreTarget: () => undefined,
  nothingToExplore: () => true,
  scoutFlights: 3,
  ...overrides
});

/** Everything before the First battle chapter done, as a player 8 minutes in. */
const beforeBattle = (): Set<string> => {
  const first = GUIDE_STEPS.findIndex((s) => s.id === "camp-scout");
  return new Set(GUIDE_STEPS.slice(0, first).map((s) => s.id));
};

const stepId = (input: GuideInput, done = beforeBattle()): string | false => {
  const view = evaluateGuide(input, done);
  return view.kind === "step" && view.step.id;
};

describe("First battle: the guide's last chapter", () => {
  it("is the last chapter, right before Finish", () => {
    const chapters = GUIDE_STEPS.filter((s) => !s.acknowledge).map((s) => s.chapter);
    expect(chapters.at(-1)).toBe("contest");
    expect(GUIDE_STEPS.map((s) => s.id).slice(-6)).toEqual(["camp-scout", "contest-muster", "camp-odds", "contest-attack", "camp-win", "turn-finish"]);
  });

  it("walks scout -> flag -> odds -> attack -> win on the camp", () => {
    const lead = { x: 30, y: 10 };
    const scouting = evaluateGuide(stepInput({ camp: { ...noCamp, target: lead, inFog: true } }), beforeBattle());
    expect(scouting).toMatchObject({ kind: "step", step: { id: "camp-scout" }, title: "An Insurgent camp is near: tap the mark, then Go", highlightTiles: [lead], chapterTitle: "First battle" });

    const seen: GuideCamp = { ...noCamp, target: lead, sighted: true, flagTiles: [{ x: 11, y: 10 }] };
    const done = new Set([...beforeBattle(), "camp-scout"]);
    const muster = evaluateGuide(stepInput({ camp: seen, musterUnlocked: true }), done);
    expect(muster).toMatchObject({ step: { id: "contest-muster" }, title: "Raise a muster flag on your marked land nearest the camp", highlightTiles: [{ x: 11, y: 10 }] });

    done.add("contest-muster");
    expect(stepId(stepInput({ camp: seen, musterUnlocked: true, ownsMusterFlag: true }), done)).toBe("camp-odds");
    done.add("camp-odds");
    const attack = evaluateGuide(stepInput({ camp: { ...seen, selected: true }, musterUnlocked: true, ownsMusterFlag: true }), done);
    expect(attack).toMatchObject({ step: { id: "contest-attack" }, title: "Tap the camp, then March Attack from your flag", highlightTiles: [lead] });

    done.add("contest-attack");
    const fighting = evaluateGuide(stepInput({ camp: seen, musterUnlocked: true, attackLaunched: true }), done);
    expect(fighting).toMatchObject({ step: { id: "camp-win" }, title: "Your troops are fighting for the camp" });
    const won = evaluateGuide(stepInput({ camp: { ...seen, won: true }, musterUnlocked: true }), done);
    expect(won.kind === "step" && won.newlyCompleted).toContain("camp-win");
    expect(won.kind === "step" && won.step.id).toBe("turn-finish");
  });

  it("with no camp anywhere, waits without blocking Finish", () => {
    expect(stepId(stepInput())).toBe("turn-finish");
  });

  it("a player who raised a flag under the old Contest chapter skips the camp flight", () => {
    const view = evaluateGuide(stepInput({ camp: { ...noCamp, target: { x: 30, y: 10 }, inFog: true } }), new Set([...beforeBattle(), "contest-muster"]));
    expect(view.kind === "step" && view.newlyCompleted).toContain("camp-scout");
  });
});

describe("Diplomacy: Swear fealty is the alliance", () => {
  it("names the alliance button the player will see, Swear fealty against a House twice their size", () => {
    const done = new Set(GUIDE_STEPS.filter((s) => s.id !== "diplomacy-alliance" && s.id !== "turn-finish").map((s) => s.id));
    const view = evaluateGuide(stepInput({ rivalHouseMet: true, allianceStanding: "SWEAR" }), done);
    expect(view).toMatchObject({ step: { id: "diplomacy-alliance" }, title: "Tap a rival House, then Swear fealty" });
    expect(view.kind === "step" && view.why).toContain("Swear fealty");
    const seen = evaluateGuide(stepInput({ rivalHouseMet: true, allianceStanding: "SWEAR", allianceSeen: true }), done);
    expect(seen.kind === "step" && seen.newlyCompleted).toContain("diplomacy-alliance");
  });

  it("reads the standing from the met Houses, and sees the deal screen's alliance option", () => {
    expect(guideAllianceStanding(["a", "b"], (id) => (id === "b" ? "SWEAR" : "DEMAND"))).toBe("SWEAR");
    expect(guideAllianceStanding([], () => "SWEAR")).toBe("ALLIANCE");
    const none = { allies: [], outgoingAllianceRequests: [], incomingAllianceRequests: [] };
    document.body.innerHTML = `<button data-trade-kind="alliance:0" aria-pressed="false">Swear fealty</button>`;
    expect(guideAllianceSeen(none, document)).toBe(false);
    document.body.querySelector("button")!.setAttribute("aria-pressed", "true");
    expect(guideAllianceSeen(none, document)).toBe(true);
    document.body.innerHTML = "";
  });
});
