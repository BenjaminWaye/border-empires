// @vitest-environment happy-dom
// Regressions from the 2026-11-12 mobile playtest (pt-newcomer-b, pt-achiever,
// pt-oldphone diaries): each case failed before the fix.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tileKey } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { resetOnboardingChecklistOverlayForTests } from "../client-onboarding-checklist/client-onboarding-checklist-overlay.js";
import { refreshOnboardingChecklistHighlight, tickOnboardingUiGateForFrame } from "../client-onboarding-ui-gate/client-onboarding-ui-overlays.js";
import { setDiscoveryTipCenterHandler } from "../client-discovery-tips/client-discovery-tip-overlay.js";
import { resetGuideInputSignalsForTests } from "./tutorial-guide-input-signals.js";
import { buildGuideInput, resetGuideInputCacheForTests } from "./tutorial-guide-input.js";
import { scanGuideFootholdTargets } from "./tutorial-guide-foothold-targets.js";
import { markGuideStepsCompleted, readGuideProgress, resetGuideStorageMemoryForTests, setGuideStatus } from "./tutorial-guide-storage.js";
import { evaluateGuide, GUIDE_STEPS, type GuideInput } from "./tutorial-guide-steps.js";
import { guideCardHtml } from "./tutorial-guide-card.js";
import { resetTutorialGuideForTests } from "./tutorial-guide.js";

const ME = "p1";
const EMAIL = "new@example.com";

const tile = (t: Partial<Tile> & { x: number; y: number }): Tile => ({ terrain: "LAND", ...t }) as Tile;

const stepInput = (overrides: Partial<GuideInput> = {}): GuideInput => ({
  checklist: { step: "DONE", townFound: true, townExpanded: true, foodFound: true, foodExpanded: true, foodSlotsFound: 4, foodSlotsClaimed: 4, foodSlotsTarget: 4, highlightTiles: [] },
  footholdTargets: { town: { pending: [], garrison: [], expand: [] }, food: { pending: [], garrison: [], expand: [] } },
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
  ownsRelayBeacon: true,
  beaconSite: () => undefined,
  buildTargetTiles: [],
  musterUnlocked: false,
  ownsMusterFlag: false,
  musterTargetTiles: [],
  ...overrides
});

const doneExcept = (ids: string[]): Set<string> => new Set(GUIDE_STEPS.filter((s) => !ids.includes(s.id)).map((s) => s.id));

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  resetGuideStorageMemoryForTests();
  resetGuideInputSignalsForTests();
  resetGuideInputCacheForTests();
  resetTutorialGuideForTests();
  resetOnboardingChecklistOverlayForTests();
  setDiscoveryTipCenterHandler(undefined);
});

describe("food step only marks tiles a garrison can reach (Sam stuck on 'Beyond your reach')", () => {
  it("drops own frontier and neutral food outside reach, but keeps a town outside reach (towns ignore reach)", () => {
    const town = { town: { type: "MARKET", populationTier: "TOWN" } as never };
    const tiles = [
      tile({ x: 1, y: 0, ownerId: ME, ownershipState: "FRONTIER", resource: "FARM" }),
      tile({ x: 2, y: 0, resource: "FARM" }),
      tile({ x: 3, y: 0, ownerId: ME, ownershipState: "FRONTIER", ...town }),
      tile({ x: 9, y: 9, ownerId: ME, ownershipState: "FRONTIER", resource: "FISH" })
    ];
    const inReach = (x: number, y: number) => x === 9 && y === 9;
    expect(scanGuideFootholdTargets(tiles, ME, () => 0, inReach)).toEqual({
      town: { pending: [], garrison: [{ x: 3, y: 0 }], expand: [] },
      food: { pending: [], garrison: [{ x: 9, y: 9 }], expand: [] }
    });
  });

  it("reads the server's reach and rescans when a REACH_UPDATE changes it without a tile change", () => {
    const state = createInitialState();
    state.me = ME;
    state.tiles.set(tileKey(1, 0), tile({ x: 1, y: 0, ownerId: ME, ownershipState: "FRONTIER", resource: "FARM" }));
    state.serverReach = new Set();
    state.serverReachRevision = 1;
    expect(buildGuideInput(state).footholdTargets.food.garrison).toEqual([]);
    state.serverReach = new Set([tileKey(1, 0)]);
    state.serverReachRevision = 2;
    expect(buildGuideInput(state).footholdTargets.food.garrison).toEqual([{ x: 1, y: 0 }]);
  });

  it("no longer tells the player their reach claimed a town it may not cover", () => {
    const view = evaluateGuide(
      stepInput({
        checklist: { ...stepInput().checklist, townExpanded: false },
        footholdTargets: { town: { pending: [], garrison: [{ x: 3, y: 0 }], expand: [] }, food: { pending: [], garrison: [], expand: [] } }
      }),
      new Set(["look-pan", "look-zoom"])
    );
    if (view.kind !== "step") throw new Error("expected a step");
    expect(view.step.id).toBe("foothold-take-town");
    expect(view.why).not.toMatch(/reach already claimed/);
  });
});

describe("a Waystation's free Manifest doesn't skip the Manifest and Build chapters (Sam: step 4 -> 10)", () => {
  it("excludes Waystation-granted techs from the commissioned Manifest count", () => {
    const state = createInitialState();
    state.me = ME;
    state.techRootId = "root";
    state.techIds = ["root", "crystal-lattices"];
    state.tiles.set(
      tileKey(4, 4),
      tile({ x: 4, y: 4, ownerId: ME, ownershipState: "FRONTIER", waystation: { activated: true, activatedByPlayerId: ME, grantedEffect: "TECH", grantedTechId: "crystal-lattices" } as never })
    );
    expect(buildGuideInput(state).manifestCount).toBe(0);
    state.techIds = ["root", "crystal-lattices", "trade"];
    expect(buildGuideInput(state).manifestCount).toBe(1);
  });

  it("goes from the manpower step to Open Manifests, not to the Chronicle", () => {
    const done = new Set(["look-pan", "look-zoom", "foothold-take-town", "foothold-take-food", "reach-beacon", "manpower-open"]);
    const view = evaluateGuide(stepInput({ manifestCount: 0 }), done);
    expect(view.kind === "step" && view.step.id).toBe("manifest-open");
  });
});

describe("guide progress reads as steps done, with waiting chapters named (Tom: 2 -> 4 -> 5 -> 7 -> 10)", () => {
  it("drops the chapter fraction from the header and names the chapters it comes back to", () => {
    const view = evaluateGuide(
      stepInput({ manifestCount: 1, manufactoryResearched: true, ownsBuiltStructure: true }),
      doneExcept(["afc-upgrade", "contest-muster", "diplomacy-truce", "turn-activity", "turn-finish"])
    );
    if (view.kind !== "step") throw new Error("expected a step");
    expect(view.step.id).toBe("turn-activity");
    expect(view.laterChapterTitles).toEqual(["AFC upgrade", "Contest", "Diplomacy"]);
    const html = guideCardHtml(view, true);
    expect(html).not.toMatch(/\d+\/10 /);
    expect(html).toContain("Later: AFC upgrade, Contest, Diplomacy");
    expect(html).toContain(`${view.completedCount}/${view.totalCount}`);
  });
});

describe("build step without a town (Tom skipped the town step)", () => {
  it("asks for a town first and marks the town to take, not 'your marked town'", () => {
    const view = evaluateGuide(
      stepInput({
        manifestCount: 1,
        manufactoryResearched: true,
        manufactoryUnlocked: true,
        buildTargetTiles: [],
        footholdTargets: { town: { pending: [], garrison: [], expand: [{ x: 7, y: 2 }] }, food: { pending: [], garrison: [], expand: [] } }
      }),
      doneExcept(["build-first", "contest-muster", "diplomacy-truce", "turn-activity", "turn-finish"])
    );
    if (view.kind !== "step") throw new Error("expected a step");
    expect(view.step.id).toBe("build-first");
    expect(view.title).toBe("A Manufactory needs a town. Tap the marked town and Expand To it");
    expect(view.highlightTiles).toEqual([{ x: 7, y: 2 }]);
  });
});

describe("last step names the Chronicle on the new HUD", () => {
  it("doesn't mention an Activity dashboard the player can't find", () => {
    const view = evaluateGuide(stepInput(), doneExcept(["turn-finish"]));
    if (view.kind !== "step") throw new Error("expected a step");
    expect(view.step.id).toBe("turn-finish");
    expect(view.why).toContain("Chronicle");
    expect(view.why).not.toContain("Activity dashboard");
  });
});

/** A just-landed player with a neutral town in sight, map clear of dialogs. */
const newPlayerState = () => {
  const state = createInitialState();
  state.authSessionReady = true;
  state.profileSetupRequired = false;
  state.changelog.open = false;
  state.activityDashboard.open = false;
  state.needsSeasonJoin = false;
  state.joinSeasonOverlayOpen = false;
  state.respawnOverlayOpen = false;
  state.seasonWinner = undefined;
  state.me = ME;
  state.authEmail = EMAIL;
  state.firstChunkAt = 1;
  state.tiles.set(tileKey(0, 0), tile({ x: 0, y: 0, ownerId: ME, ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT" } as never }));
  state.tiles.set(tileKey(2, 0), tile({ x: 2, y: 0, town: { type: "MARKET", populationTier: "TOWN" } as never }));
  state.tilesRevision += 1;
  return state;
};

const card = () => document.getElementById("tutorial-guide-root");
const click = (selector: string) => (card()?.querySelector(selector) as HTMLElement | null)?.click();

describe("Show me on a phone (Tom: target ended up under the card)", () => {
  it("folds the card to its launcher when the card covers the screen centre the camera moves the target to", () => {
    const centre = vi.fn();
    setDiscoveryTipCenterHandler(centre);
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(375);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(667);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 10, right: 260, top: 300, bottom: 480, width: 250, height: 180, x: 10, y: 300, toJSON: () => ({}) } as DOMRect);
    setGuideStatus("active", EMAIL);
    markGuideStepsCompleted(["look-pan", "look-zoom"], EMAIL);
    const state = newPlayerState();
    refreshOnboardingChecklistHighlight(state);
    click('[data-guide-action="show-me"]');
    expect(centre).toHaveBeenCalledWith({ x: 2, y: 0 });
    expect(card()?.querySelector(".tg-card")?.hasAttribute("hidden")).toBe(true);
    expect(card()?.querySelector(".tg-launcher")?.hasAttribute("hidden")).toBe(false);
    vi.restoreAllMocks();
  });

  it("keeps the card open when it is clear of the centre (desktop corner)", () => {
    setDiscoveryTipCenterHandler(vi.fn());
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1440);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(900);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 16, right: 286, top: 560, bottom: 710, width: 270, height: 150, x: 16, y: 560, toJSON: () => ({}) } as DOMRect);
    setGuideStatus("active", EMAIL);
    markGuideStepsCompleted(["look-pan", "look-zoom"], EMAIL);
    refreshOnboardingChecklistHighlight(newPlayerState());
    click('[data-guide-action="show-me"]');
    expect(card()?.querySelector(".tg-card")?.hasAttribute("hidden")).toBe(false);
    vi.restoreAllMocks();
  });
});

describe("Finish acknowledges the completed guide (Tom: 'No reward, no badge, nothing')", () => {
  it("shows a Guide complete card with every step ticked, which survives the next frame and Close removes", () => {
    setGuideStatus("active", EMAIL);
    markGuideStepsCompleted(GUIDE_STEPS.filter((s) => s.id !== "turn-finish").map((s) => s.id), EMAIL);
    const state = newPlayerState();
    refreshOnboardingChecklistHighlight(state);
    click('[data-guide-action="finish"]');
    expect(readGuideProgress(EMAIL).status).toBe("done");
    expect(card()?.textContent).toContain("Guide complete");
    expect(card()?.textContent).toContain(`${GUIDE_STEPS.length}/${GUIDE_STEPS.length}`);
    expect(card()?.textContent).toContain("Every step done.");
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()?.textContent).toContain("Guide complete");
    click("[data-guide-complete-close]");
    expect(card()).toBeNull();
  });
});

describe("a Waystation's free Manifest doesn't soft-lock the guide on a Manifest the player can't afford", () => {
  const manifestDone = new Set(["look-pan", "look-zoom", "foothold-take-town", "foothold-take-food", "reach-beacon", "manpower-open", "manifest-open"]);

  it("reads the next Manifest's price from the catalog and the player's Coin", () => {
    const state = createInitialState();
    state.me = ME;
    state.gold = 10;
    state.techCatalog = [{ id: "trade", name: "Industrial Tooling Module", tier: 1, description: "", mods: {}, requirements: { gold: 40, resources: {} } }];
    expect(buildGuideInput(state).manifestPrice).toEqual({ cost: 40, coin: 10 });
  });

  it("waits with the price instead of asking for a 40-coin Manifest with 10 coin, and doesn't offer Finish meanwhile", () => {
    const broke = stepInput({ manifestPrice: { cost: 40, coin: 10 } });
    const first = evaluateGuide(broke, manifestDone);
    expect(first.kind === "step" && first.step.id).not.toBe("manifest-commission");
    const view = evaluateGuide(broke, new Set([...manifestDone, "turn-activity"]));
    if (view.kind !== "step") throw new Error("expected a step");
    expect(view.step.id).toBe("manifest-commission");
    expect(view.waiting).toBe(true);
    expect(view.title).toBe("Save up 40 coin for your next Manifest");
  });

  it("asks for the Manifest once the player can pay for it", () => {
    const view = evaluateGuide(stepInput({ manifestPrice: { cost: 40, coin: 40 } }), manifestDone);
    if (view.kind !== "step") throw new Error("expected a step");
    expect(view.step.id).toBe("manifest-commission");
    expect(view.waiting).toBe(false);
  });
});
