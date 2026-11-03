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

    const withManifest = evaluateGuide(baseInput({ checklist: footholdDone, manifestCount: 1, buildTargetTiles: [{ x: 1, y: 1 }] }), doneBeforeBuild);
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
    expect(town.kind === "step" && town.highlightTiles).toEqual([{ x: 5, y: 5 }]);

    const manpower = evaluateGuide(baseInput({ checklist: footholdDone }), pastLook);
    expect(manpower.kind === "step" && manpower.anchor).toBe("manpower");
    expect(evaluateGuide(baseInput({ checklist: footholdDone, openPanel: "manpower" }), pastLook)).toEqual(
      expect.objectContaining({ step: expect.objectContaining({ id: "manifest-open" }), anchor: "manifest" })
    );
  });

  it("never offers Finish while another step remains, even one that is only waiting", () => {
    const allButContestAndFinish = new Set(GUIDE_STEPS.filter((s) => s.id !== "contest-muster" && s.id !== "turn-finish").map((s) => s.id));
    const view = evaluateGuide(baseInput({ checklist: footholdDone }), allButContestAndFinish);
    if (view.kind !== "step") throw new Error("expected a step");
    expect(view.step.id).toBe("contest-muster");
    expect(view.waiting).toBe(true);
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
