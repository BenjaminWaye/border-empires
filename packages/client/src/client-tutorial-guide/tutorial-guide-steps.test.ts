import { describe, expect, it } from "vitest";
import { evaluateGuide, GUIDE_STEPS, type GuideInput } from "./tutorial-guide-steps.js";

const baseInput = (overrides: Partial<GuideInput> = {}): GuideInput => ({
  checklist: {
    step: "EXPAND_TOWN",
    townFound: false,
    townExpanded: false,
    foodFound: false,
    foodExpanded: false,
    foodSlotsFound: 0,
    foodSlotsClaimed: 0,
    foodSlotsTarget: 4,
    highlightTiles: [{ x: 5, y: 5 }]
  },
  footholdTargets: { town: { garrison: [], expand: [] }, food: { garrison: [], expand: [] } },
  manufactoryUnlocked: false,
  afcTile: undefined,
  rivalHouseMet: false,
  diplomacyUsed: false,
  panned: false,
  zoomed: false,
  tileSelected: false,
  openPanel: null,
  hudV2: false,
  activityDashboardOpen: false,
  manifestCount: 0,
  ownsBuiltStructure: false,
  buildTargetTiles: [],
  musterUnlocked: false,
  ownsMusterFlag: false,
  musterTargetTiles: [],
  ...overrides
});

const footholdDone: GuideInput["checklist"] = {
  step: "DONE",
  townFound: true,
  townExpanded: true,
  foodFound: true,
  foodExpanded: true,
  foodSlotsFound: 4,
  foodSlotsClaimed: 4,
  foodSlotsTarget: 4,
  highlightTiles: []
};

const ids = (prefix: string) => GUIDE_STEPS.filter((s) => s.id.startsWith(prefix)).map((s) => s.id);

describe("tutorial guide steps", () => {
  it("starts a fresh account on the first Look around step", () => {
    const view = evaluateGuide(baseInput(), new Set());
    expect(view.kind === "step" && view.step.id).toBe("look-pan");
  });

  it("completes steps from game state, in any order, and reports them for persisting", () => {
    const view = evaluateGuide(baseInput({ panned: true, zoomed: true, manifestCount: 1 }), new Set());
    if (view.kind !== "step") throw new Error("expected a step");
    expect(view.newlyCompleted).toEqual(expect.arrayContaining(["look-pan", "look-zoom", "manifest-open", "manifest-commission"]));
    expect(view.step.id).toBe("look-select");
  });

  it("teaches the Manifest before building: Build waits until one is commissioned", () => {
    const manifestIndex = GUIDE_STEPS.findIndex((s) => s.id === "manifest-commission");
    const buildIndex = GUIDE_STEPS.findIndex((s) => s.id === "build-first");
    expect(manifestIndex).toBeLessThan(buildIndex);

    const doneBeforeBuild = new Set([...ids("look"), ...ids("foothold"), ...ids("manpower"), ...ids("manifest")]);
    const noManifest = evaluateGuide(baseInput({ checklist: footholdDone, buildTargetTiles: [{ x: 1, y: 1 }] }), doneBeforeBuild);
    // With no Manifest, Build isn't available, so the guide moves on rather than asking for the impossible.
    expect(noManifest.kind === "step" && noManifest.step.id).not.toBe("build-first");

    const withManifest = evaluateGuide(baseInput({ checklist: footholdDone, manifestCount: 1, manufactoryUnlocked: true, buildTargetTiles: [{ x: 1, y: 1 }] }), doneBeforeBuild);
    if (withManifest.kind !== "step") throw new Error("expected a step");
    expect(withManifest.step.id).toBe("build-first");
    expect(withManifest.highlightTiles).toEqual([{ x: 1, y: 1 }]);
  });

  it("shows the waiting note (and no highlights) when only a not-yet-available step is left", () => {
    const allButContest = new Set(GUIDE_STEPS.filter((s) => s.id !== "contest-muster").map((s) => s.id));
    const view = evaluateGuide(baseInput({ checklist: footholdDone, musterTargetTiles: [{ x: 2, y: 2 }] }), allButContest);
    if (view.kind !== "step") throw new Error("expected a step");
    expect(view.waiting).toBe(true);
    expect(view.title).toMatch(/Planetary Defense/);
    expect(view.highlightTiles).toEqual([]);

    const unlocked = evaluateGuide(baseInput({ checklist: footholdDone, musterUnlocked: true, musterTargetTiles: [{ x: 2, y: 2 }] }), allButContest);
    expect(unlocked.kind === "step" && unlocked.highlightTiles).toEqual([{ x: 2, y: 2 }]);
  });

  it("points at the HUD button for panel steps and uses the checklist's highlights for the foothold", () => {
    const pastLook = new Set(ids("look"));
    const town = evaluateGuide(baseInput({ checklist: { ...baseInput().checklist, townFound: true } }), pastLook);
    expect(town.kind === "step" && town.highlightTiles).toEqual([{ x: 5, y: 5 }]); // no town in sight: the beacon site from the checklist

    const manpower = evaluateGuide(baseInput({ checklist: footholdDone }), pastLook);
    expect(manpower.kind === "step" && manpower.anchor).toBe("manpower");
    expect(evaluateGuide(baseInput({ checklist: footholdDone, openPanel: "manpower" }), pastLook)).toEqual(
      expect.objectContaining({ step: expect.objectContaining({ id: "manifest-open" }), anchor: "manifest" })
    );
  });

  it("tells the player to Garrison a town that is already their frontier, Expand To a neutral town in vision, else build a beacon", () => {
    const pastFind = new Set([...ids("look"), "foothold-find-town"]);
    const found = { ...baseInput().checklist, townFound: true };

    const garrison = evaluateGuide(baseInput({ checklist: found, footholdTargets: { town: { garrison: [{ x: 3, y: 0 }], expand: [{ x: 9, y: 9 }] }, food: { garrison: [], expand: [] } } }), pastFind);
    expect(garrison).toEqual(expect.objectContaining({ title: "Tap the marked town and Garrison it", highlightTiles: [{ x: 3, y: 0 }] }));
    expect(garrison.kind === "step" && garrison.why).toMatch(/frontier/);

    const expand = evaluateGuide(baseInput({ checklist: found, footholdTargets: { town: { garrison: [], expand: [{ x: 9, y: 9 }] }, food: { garrison: [], expand: [] } } }), pastFind);
    expect(expand).toEqual(expect.objectContaining({ title: "Tap the marked town and Expand To it", highlightTiles: [{ x: 9, y: 9 }] }));

    const beacon = evaluateGuide(baseInput({ checklist: { ...found, step: "EXPAND_RELAY_BEACON", highlightTiles: [{ x: 1, y: 1 }] } }), pastFind);
    expect(beacon).toEqual(expect.objectContaining({ title: "No town in sight: build a Relay Beacon on the marked tile", highlightTiles: [{ x: 1, y: 1 }] }));
  });

  it("treats food like towns: Garrison own frontier food, Expand To food in vision, else a beacon, and shows the grain and fish icons", () => {
    const pastTown = new Set([...ids("look"), "foothold-find-town", "foothold-take-town", "foothold-find-food"]);
    const checklist = { ...footholdDone, step: "EXPAND_FOOD" as const, foodExpanded: false, foodSlotsClaimed: 1, highlightTiles: [{ x: 1, y: 1 }] };
    const food = (garrison: Array<{ x: number; y: number }>, expand: Array<{ x: number; y: number }>) => ({ town: { garrison: [], expand: [] }, food: { garrison, expand } });

    const garrison = evaluateGuide(baseInput({ checklist, footholdTargets: food([{ x: 2, y: 2 }], [{ x: 8, y: 8 }]) }), pastTown);
    expect(garrison).toEqual(expect.objectContaining({ title: "Tap a marked food tile and Garrison it (1/4 slots)", highlightTiles: [{ x: 2, y: 2 }], lookFor: ["FOOD", "FISH"] }));

    const expand = evaluateGuide(baseInput({ checklist, footholdTargets: food([], [{ x: 8, y: 8 }]) }), pastTown);
    expect(expand).toEqual(expect.objectContaining({ title: "Tap a marked food tile and Expand To it (1/4 slots)", highlightTiles: [{ x: 8, y: 8 }] }));

    const beacon = evaluateGuide(baseInput({ checklist }), pastTown);
    expect(beacon).toEqual(expect.objectContaining({ title: "No food in sight: build a Relay Beacon on the marked tile", highlightTiles: [{ x: 1, y: 1 }] }));
  });

  it("offers Finish once every other step left is waiting, but not while one can still be done", () => {
    const waitingOnly = new Set(GUIDE_STEPS.filter((s) => !["contest-muster", "diplomacy-truce", "turn-finish"].includes(s.id)).map((s) => s.id));
    const noContact = evaluateGuide(baseInput({ checklist: footholdDone }), waitingOnly);
    expect(noContact).toEqual(expect.objectContaining({ step: expect.objectContaining({ id: "turn-finish" }), waiting: false }));

    const contact = evaluateGuide(baseInput({ checklist: footholdDone, musterUnlocked: true }), waitingOnly);
    expect(contact.kind === "step" && contact.step.id).toBe("contest-muster");
  });

  it("recommends the Industrial Tooling Module, then a Manufactory on the player's town (waiting until it is commissioned)", () => {
    const beforeManifest = new Set([...ids("look"), ...ids("foothold"), ...ids("manpower"), "manifest-open"]);
    expect(evaluateGuide(baseInput({ checklist: footholdDone }), beforeManifest)).toEqual(
      expect.objectContaining({ title: "Commission the Industrial Tooling Module", anchor: "manifest" })
    );
    const allButBuild = new Set(GUIDE_STEPS.filter((s) => s.id !== "build-first").map((s) => s.id));
    // Another Manifest commissioned: the build step waits with a pointer to the right one.
    expect(evaluateGuide(baseInput({ checklist: footholdDone, manifestCount: 1 }), allButBuild)).toEqual(
      expect.objectContaining({ waiting: true, title: "Commission the Industrial Tooling Module to unlock the Manufactory." })
    );
    expect(evaluateGuide(baseInput({ checklist: footholdDone, manifestCount: 1, manufactoryUnlocked: true, buildTargetTiles: [{ x: 4, y: 4 }] }), allButBuild)).toEqual(
      expect.objectContaining({ title: "Tap your marked town and build a Manufactory", highlightTiles: [{ x: 4, y: 4 }] })
    );
  });

  it("asks the player to tap their AFC, ringing it", () => {
    const view = evaluateGuide(baseInput({ panned: true, zoomed: true, afcTile: { x: 7, y: 7 } }), new Set());
    expect(view).toEqual(expect.objectContaining({ title: "Tap your AFC to see what you can do there", highlightTiles: [{ x: 7, y: 7 }] }));
  });

  it("shows the diplomacy step only after meeting a rival House and completes it on opening Diplomacy", () => {
    const allButDiplomacy = new Set(GUIDE_STEPS.filter((s) => s.id !== "diplomacy-truce" && s.id !== "turn-finish").map((s) => s.id));
    expect(evaluateGuide(baseInput({ checklist: footholdDone }), allButDiplomacy)).toEqual(expect.objectContaining({ step: expect.objectContaining({ id: "turn-finish" }) }));
    expect(evaluateGuide(baseInput({ checklist: footholdDone, rivalHouseMet: true }), allButDiplomacy)).toEqual(
      expect.objectContaining({ title: "A rival House is near: open Diplomacy to offer a truce", anchor: "diplomacy" })
    );
    const opened = evaluateGuide(baseInput({ checklist: footholdDone, rivalHouseMet: true, diplomacyUsed: true }), allButDiplomacy);
    expect(opened.kind === "step" && opened.newlyCompleted).toContain("diplomacy-truce");
  });

  it("names the Chronicle under the new desktop HUD", () => {
    const allButActivity = new Set(GUIDE_STEPS.filter((s) => s.id !== "turn-activity" && s.id !== "turn-finish").map((s) => s.id));
    expect(evaluateGuide(baseInput({ checklist: footholdDone, hudV2: true }), allButActivity)).toEqual(expect.objectContaining({ title: "Open the Chronicle" }));
    expect(evaluateGuide(baseInput({ checklist: footholdDone }), allButActivity)).toEqual(expect.objectContaining({ title: "Open the Activity dashboard" }));
  });

  it("only finishes on the acknowledge step's own Finish, then reports done", () => {
    const allButFinish = new Set(GUIDE_STEPS.filter((s) => s.id !== "turn-finish").map((s) => s.id));
    const last = evaluateGuide(baseInput(), allButFinish);
    expect(last.kind === "step" && last.step.acknowledge).toBe(true);
    expect(evaluateGuide(baseInput(), new Set(GUIDE_STEPS.map((s) => s.id)))).toEqual({ kind: "done" });
  });
});
