import { describe, expect, it } from "vitest";
import { evaluateGuide, guideBeaconSite, guideRecommendsAfcUpgrade, guideRecommendsManifest, RECOMMENDED_FIRST_AFC_UPGRADE_ID, GUIDE_STEPS, type GuideInput } from "./tutorial-guide-steps.js";

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
  footholdTargets: { town: { pending: [], garrison: [], expand: [] }, food: { pending: [], garrison: [], expand: [] } },
  manufactoryResearched: false,
  manufactoryUnlocked: false,
  afcUpgradeReady: false,
  afcUpgradeInstalled: false,
  foodSlotFree: true,
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
  ownsRelayBeacon: false,
  beaconSite: () => undefined,
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
    const view = evaluateGuide(baseInput({ panned: true, zoomed: true, manifestCount: 1, manufactoryResearched: true }), new Set());
    if (view.kind !== "step") throw new Error("expected a step");
    expect(view.newlyCompleted).toEqual(expect.arrayContaining(["look-pan", "look-zoom", "manifest-open", "manifest-commission"]));
    expect(view.step.id).toBe("look-select");
  });

  it("teaches the Manifest before building: Build waits until one is commissioned", () => {
    const manifestIndex = GUIDE_STEPS.findIndex((s) => s.id === "manifest-commission");
    const buildIndex = GUIDE_STEPS.findIndex((s) => s.id === "build-first");
    expect(manifestIndex).toBeLessThan(buildIndex);

    // Manifest steps marked done via Skip, but the Industrial Tooling Module never commissioned.
    const doneBeforeBuild = new Set([...ids("look"), ...ids("foothold"), ...ids("reach"), ...ids("manpower"), ...ids("manifest")]);
    const noManifest = evaluateGuide(baseInput({ checklist: footholdDone, buildTargetTiles: [{ x: 1, y: 1 }] }), doneBeforeBuild);
    // Build isn't available, so the guide moves on rather than asking for the impossible.
    expect(noManifest.kind === "step" && noManifest.step.id).not.toBe("build-first");

    const withManifest = evaluateGuide(
      baseInput({ checklist: footholdDone, manifestCount: 1, manufactoryResearched: true, manufactoryUnlocked: true, buildTargetTiles: [{ x: 1, y: 1 }] }),
      doneBeforeBuild
    );
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

  it("points at the HUD button for panel steps and only rings the checklist's beacon site when no town is in sight", () => {
    const pastLook = new Set(ids("look"));
    const found = { ...baseInput().checklist, townFound: true };
    // The checklist's other highlights (here a town it targets) are not a beacon site.
    expect(evaluateGuide(baseInput({ checklist: found }), pastLook)).toEqual(expect.objectContaining({ highlightTiles: [] }));
    const town = evaluateGuide(baseInput({ checklist: { ...found, relayBeaconSite: { x: 6, y: 6 } } }), pastLook);
    expect(town.kind === "step" && town.highlightTiles).toEqual([{ x: 6, y: 6 }]);

    const manpower = evaluateGuide(baseInput({ checklist: footholdDone, ownsRelayBeacon: true }), pastLook);
    expect(manpower.kind === "step" && manpower.anchor).toBe("manpower");
    expect(evaluateGuide(baseInput({ checklist: footholdDone, ownsRelayBeacon: true, openPanel: "manpower" }), pastLook)).toEqual(
      expect.objectContaining({ step: expect.objectContaining({ id: "manifest-open" }), anchor: "manifest" })
    );
  });

  it("tells the player to Garrison a town that is already their frontier, Expand To a neutral town in vision, else build a beacon", () => {
    const pastFind = new Set([...ids("look"), "foothold-find-town"]);
    const found = { ...baseInput().checklist, townFound: true };

    const garrison = evaluateGuide(baseInput({ checklist: found, footholdTargets: { town: { pending: [], garrison: [{ x: 3, y: 0 }], expand: [{ x: 9, y: 9 }] }, food: { pending: [], garrison: [], expand: [] } } }), pastFind);
    expect(garrison).toEqual(expect.objectContaining({ title: "Tap the marked town and Garrison it", highlightTiles: [{ x: 3, y: 0 }] }));
    expect(garrison.kind === "step" && garrison.why).toMatch(/frontier/);

    const expand = evaluateGuide(baseInput({ checklist: found, footholdTargets: { town: { pending: [], garrison: [], expand: [{ x: 9, y: 9 }] }, food: { pending: [], garrison: [], expand: [] } } }), pastFind);
    expect(expand).toEqual(expect.objectContaining({ title: "Tap the marked town and Expand To it", highlightTiles: [{ x: 9, y: 9 }] }));

    const beacon = evaluateGuide(baseInput({ checklist: { ...found, step: "EXPAND_RELAY_BEACON", highlightTiles: [{ x: 1, y: 1 }], relayBeaconSite: { x: 1, y: 1 } } }), pastFind);
    expect(beacon).toEqual(expect.objectContaining({ title: "No town in sight: build a Relay Beacon at the edge of your land", highlightTiles: [{ x: 1, y: 1 }] }));

    // Right after Expand To, the town is our pending frontier: don't ask for a Garrison that is already queued.
    const pending = evaluateGuide(
      baseInput({ checklist: found, footholdTargets: { town: { pending: [{ x: 3, y: 0 }], garrison: [], expand: [] }, food: { pending: [], garrison: [], expand: [] } } }),
      pastFind
    );
    expect(pending).toEqual(expect.objectContaining({ title: "Your claim on the marked town is underway", highlightTiles: [{ x: 3, y: 0 }] }));
  });

  it("treats food like towns: Garrison own frontier food, Expand To food in vision, else a beacon, and shows the grain and fish icons", () => {
    const pastTown = new Set([...ids("look"), "foothold-find-town", "foothold-take-town", "foothold-find-food"]);
    const checklist = { ...footholdDone, step: "EXPAND_FOOD" as const, foodExpanded: false, foodSlotsClaimed: 1, highlightTiles: [{ x: 1, y: 1 }] };
    const food = (garrison: Array<{ x: number; y: number }>, expand: Array<{ x: number; y: number }>) => ({ town: { pending: [], garrison: [], expand: [] }, food: { pending: [], garrison, expand } });

    const garrison = evaluateGuide(baseInput({ checklist, footholdTargets: food([{ x: 2, y: 2 }], [{ x: 8, y: 8 }]) }), pastTown);
    expect(garrison).toEqual(expect.objectContaining({ title: "Tap a marked food tile and Garrison it (1/4 slots)", highlightTiles: [{ x: 2, y: 2 }], lookFor: ["FOOD", "FISH"] }));

    const expand = evaluateGuide(baseInput({ checklist, footholdTargets: food([], [{ x: 8, y: 8 }]) }), pastTown);
    expect(expand).toEqual(expect.objectContaining({ title: "Tap a marked food tile and Expand To it (1/4 slots)", highlightTiles: [{ x: 8, y: 8 }] }));

    const beacon = evaluateGuide(baseInput({ checklist: { ...checklist, relayBeaconSite: { x: 1, y: 1 } } }), pastTown);
    expect(beacon).toEqual(expect.objectContaining({ title: "No food in sight: build a Relay Beacon at the edge of your land", highlightTiles: [{ x: 1, y: 1 }] }));
  });

  it("offers Finish once every other step left is waiting, but not while one can still be done", () => {
    const waitingOnly = new Set(GUIDE_STEPS.filter((s) => !["contest-muster", "diplomacy-truce", "turn-finish"].includes(s.id)).map((s) => s.id));
    const noContact = evaluateGuide(baseInput({ checklist: footholdDone }), waitingOnly);
    expect(noContact).toEqual(expect.objectContaining({ step: expect.objectContaining({ id: "turn-finish" }), waiting: false }));

    const contact = evaluateGuide(baseInput({ checklist: footholdDone, musterUnlocked: true }), waitingOnly);
    expect(contact.kind === "step" && contact.step.id).toBe("contest-muster");
  });

  it("recommends the Industrial Tooling Module, then a Manufactory once the module is installed", () => {
    const beforeManifest = new Set([...ids("look"), ...ids("foothold"), ...ids("reach"), ...ids("manpower"), "manifest-open"]);
    expect(evaluateGuide(baseInput({ checklist: footholdDone }), beforeManifest)).toEqual(
      expect.objectContaining({ title: "Commission the Industrial Tooling Module", anchor: "manifest" })
    );
    // Another Manifest doesn't complete the recommended one (so Finish isn't offered while it is still a 10-Coin click away).
    expect(evaluateGuide(baseInput({ checklist: footholdDone, manifestCount: 1 }), beforeManifest)).toEqual(
      expect.objectContaining({ step: expect.objectContaining({ id: "manifest-commission" }), waiting: false })
    );
    const allButBuild = new Set(GUIDE_STEPS.filter((s) => s.id !== "build-first").map((s) => s.id));
    expect(evaluateGuide(baseInput({ checklist: footholdDone, manifestCount: 1 }), allButBuild)).toEqual(
      expect.objectContaining({ waiting: true, title: "Commission the Industrial Tooling Module to unlock the Manufactory." })
    );
    // Commissioned but still docking at the AFC: the tile menu has no Manufactory yet.
    expect(evaluateGuide(baseInput({ checklist: footholdDone, manifestCount: 1, manufactoryResearched: true, buildTargetTiles: [{ x: 4, y: 4 }] }), allButBuild)).toEqual(
      expect.objectContaining({ waiting: false, title: "Your Industrial Tooling Module is docking at your AFC: then build a Manufactory on your marked town" })
    );
    expect(
      evaluateGuide(baseInput({ checklist: footholdDone, manifestCount: 1, manufactoryResearched: true, manufactoryUnlocked: true, buildTargetTiles: [{ x: 4, y: 4 }] }), allButBuild)
    ).toEqual(expect.objectContaining({ title: "Tap your marked town and build a Manufactory", highlightTiles: [{ x: 4, y: 4 }] }));
  });

  it("asks the player to tap their AFC, ringing it", () => {
    const view = evaluateGuide(baseInput({ panned: true, zoomed: true, afcTile: { x: 7, y: 7 } }), new Set());
    expect(view).toEqual(expect.objectContaining({ title: "Tap your AFC to see what you can do there", highlightTiles: [{ x: 7, y: 7 }] }));
  });

  it("shows the diplomacy step only after meeting a rival House and completes it on opening Diplomacy", () => {
    const allButDiplomacy = new Set(GUIDE_STEPS.filter((s) => s.id !== "diplomacy-truce" && s.id !== "turn-finish").map((s) => s.id));
    expect(evaluateGuide(baseInput({ checklist: footholdDone }), allButDiplomacy)).toEqual(expect.objectContaining({ step: expect.objectContaining({ id: "turn-finish" }) }));
    expect(evaluateGuide(baseInput({ checklist: footholdDone, rivalHouseMet: true }), allButDiplomacy)).toEqual(
      expect.objectContaining({ title: "A rival House is near: open Allies to offer a truce", anchor: "diplomacy" })
    );
    expect(evaluateGuide(baseInput({ checklist: footholdDone, rivalHouseMet: true, hudV2: true }), allButDiplomacy)).toEqual(
      expect.objectContaining({ title: "A rival House is near: open Diplomacy to offer a truce" })
    );
    // Opening Allies before meeting anyone doesn't silently complete it.
    const early = evaluateGuide(baseInput({ checklist: footholdDone, diplomacyUsed: true }), allButDiplomacy);
    expect(early.kind === "step" && early.newlyCompleted).not.toContain("diplomacy-truce");
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

  it("teaches a Relay Beacon after the foothold, ringing the best site, and ticks it off once one is built", () => {
    const footholdIndex = GUIDE_STEPS.findIndex((s) => s.id === "foothold-take-food");
    const beaconIndex = GUIDE_STEPS.findIndex((s) => s.id === "reach-beacon");
    const manifestIndex = GUIDE_STEPS.findIndex((s) => s.id === "manifest-open");
    expect(footholdIndex).toBeLessThan(beaconIndex);
    // A beacon needs no Manifest, so it is taught before the Manifest chapter.
    expect(beaconIndex).toBeLessThan(manifestIndex);

    const pastFoothold = new Set([...ids("look"), ...ids("foothold")]);
    const site = { x: 12, y: 3 };
    const input = baseInput({ checklist: footholdDone, beaconSite: () => site });
    const view = evaluateGuide(input, pastFoothold);
    expect(view).toEqual(expect.objectContaining({ title: "Tap the marked tile and build a Relay Beacon", chapterTitle: "Your reach", highlightTiles: [site] }));
    // The marked tile's build menu badges the beacon as Recommended.
    expect(guideBeaconSite("reach-beacon", input)).toEqual(site);

    expect(evaluateGuide(baseInput({ checklist: footholdDone }), pastFoothold)).toEqual(
      expect.objectContaining({ title: "Build a Relay Beacon on a tile at the edge of your land", highlightTiles: [] })
    );

    const built = evaluateGuide(baseInput({ checklist: footholdDone, ownsRelayBeacon: true }), pastFoothold);
    expect(built.kind === "step" && built.newlyCompleted).toContain("reach-beacon");
    expect(built.kind === "step" && built.step.id).toBe("manpower-open");
  });

  it("only badges a beacon site while a step asks for a beacon", () => {
    const input = baseInput({ checklist: { ...footholdDone, relayBeaconSite: { x: 1, y: 1 } }, beaconSite: () => ({ x: 2, y: 2 }) });
    expect(guideBeaconSite("manpower-open", input)).toBeUndefined();
    expect(guideBeaconSite("foothold-take-town", input)).toEqual({ x: 1, y: 1 });
  });

  it("recommends a Manifest only on the Manifest steps", () => {
    expect(guideRecommendsManifest("manifest-open")).toBe(true);
    expect(guideRecommendsManifest("manifest-commission")).toBe(true);
    expect(guideRecommendsManifest("build-first")).toBe(false);
  });

  it("does not send a player already past it back to the new Relay Beacon step", () => {
    // Saved progress from before the step existed: the foothold and Manpower are done, no beacon built.
    const saved = new Set([...ids("look"), ...ids("foothold"), "manpower-open"]);
    const view = evaluateGuide(baseInput({ checklist: footholdDone }), saved);
    if (view.kind !== "step") throw new Error("expected a step");
    expect(view.newlyCompleted).toContain("reach-beacon");
    expect(view.step.id).toBe("manifest-open");
  });

  describe("AFC upgrade and food slot before the first Manufactory", () => {
    const beforeAfc = new Set([...ids("look"), ...ids("foothold"), ...ids("reach"), ...ids("manpower"), ...ids("manifest")]);
    const withManifest = { checklist: footholdDone, manifestCount: 1, manufactoryResearched: true, buildTargetTiles: [{ x: 1, y: 1 }] };

    it("recommends the Founding Concession once a Manifest unlocks an AFC upgrade", () => {
      expect(RECOMMENDED_FIRST_AFC_UPGRADE_ID).toBe("afc-exchequer-1");
      const view = evaluateGuide(baseInput({ ...withManifest, afcUpgradeReady: true }), beforeAfc);
      if (view.kind !== "step") throw new Error("expected a step");
      expect(view.step.id).toBe("afc-upgrade");
      expect(view.anchor).toBe("afc");
      expect(view.title).toMatch(/Founding Concession/);
      expect(guideRecommendsAfcUpgrade(view.step.id)).toBe(true);
      expect(guideRecommendsAfcUpgrade("build-first")).toBe(false);
    });

    it("does not block the guide while the upgrade is not unlocked yet, and ticks off once one is installed", () => {
      const waiting = evaluateGuide(baseInput({ ...withManifest, foodSlotFree: true }), beforeAfc);
      expect(waiting.kind === "step" && waiting.step.id).toBe("build-first");
      const installed = evaluateGuide(baseInput({ ...withManifest, afcUpgradeInstalled: true, afcUpgradeReady: false }), beforeAfc);
      if (installed.kind !== "step") throw new Error("expected a step");
      expect(installed.newlyCompleted).toContain("afc-upgrade");
    });

    it("works the player through finding a food slot before the Manufactory when none is free", () => {
      const afcDone = new Set([...beforeAfc, "afc-upgrade"]);
      const food = { pending: [], garrison: [], expand: [{ x: 7, y: 7 }] };
      const noSlot = evaluateGuide(
        baseInput({ ...withManifest, foodSlotFree: false, manufactoryUnlocked: true, footholdTargets: { town: food, food } }),
        afcDone
      );
      if (noSlot.kind !== "step") throw new Error("expected a step");
      expect(noSlot.step.id).toBe("build-food-slot");
      expect(noSlot.title).toMatch(/free food slot/i);
      expect(noSlot.highlightTiles).toEqual([{ x: 7, y: 7 }]);
      expect(noSlot.step.lookFor).toEqual(["FOOD", "FISH"]);

      const slotFree = evaluateGuide(baseInput({ ...withManifest, foodSlotFree: true, manufactoryUnlocked: true }), new Set([...afcDone, "build-food-slot"]));
      expect(slotFree.kind === "step" && slotFree.step.id).toBe("build-first");
    });

    it("skips the food-slot step when a slot is already free, and does not tick it early when it is not yet reachable", () => {
      const free = evaluateGuide(baseInput({ ...withManifest, foodSlotFree: true }), new Set([...beforeAfc, "afc-upgrade"]));
      if (free.kind !== "step") throw new Error("expected a step");
      expect(free.newlyCompleted).toContain("build-food-slot");
      expect(free.step.id).toBe("build-first");

      // Slot free before the Manifest is commissioned (e.g. spare slot, later used by a beacon): not ticked off yet.
      const early = evaluateGuide(baseInput({ checklist: footholdDone, foodSlotFree: true }), beforeAfc);
      if (early.kind !== "step") throw new Error("expected a step");
      expect(early.newlyCompleted).not.toContain("build-food-slot");
    });

    it("sends the player to a Relay Beacon when no food is in sight for the slot", () => {
      const input = baseInput({ ...withManifest, foodSlotFree: false, checklist: { ...footholdDone, relayBeaconSite: { x: 3, y: 3 } } });
      expect(guideBeaconSite("build-food-slot", input)).toEqual({ x: 3, y: 3 });
    });
  });
});
