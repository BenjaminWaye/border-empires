// @vitest-environment happy-dom
// Regressions for the guide while the player is inside a panel or screen:
// the card used to vanish behind the Manpower panel and the Manifest screen
// (exactly the screens its steps send the player to), discovery-tip toasts
// crowded the corner beside it, and the Manifest tree didn't show which
// Manifest the guide meant.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tileKey } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { renderDiscoveryTipOverlay } from "../client-discovery-tips/client-discovery-tip-overlay.js";
import { isDiscoveryTipSeen } from "../client-discovery-tips/client-discovery-tips-storage.js";
import { resetOnboardingChecklistOverlayForTests } from "../client-onboarding-checklist/client-onboarding-checklist-overlay.js";
import {
  announceDiscoveryTipForState,
  refreshOnboardingChecklistHighlight,
  renderDiscoveryTipOverlayForState,
  resetOnboardingUiOverlaysForTests,
  tickOnboardingUiGateForFrame
} from "../client-onboarding-ui-gate/client-onboarding-ui-overlays.js";
import { noteGuideMapPanned, resetGuideInputSignalsForTests } from "./tutorial-guide-input-signals.js";
import { resetGuideInputCacheForTests } from "./tutorial-guide-input.js";
import { resetGuideStorageMemoryForTests, setGuideStatus } from "./tutorial-guide-storage.js";
import { resetTutorialGuideForTests } from "./tutorial-guide.js";

const ME = "p1";
const EMAIL = "new@example.com";

const footholdDoneState = () => {
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
  const tiles: Array<Partial<Tile> & { x: number; y: number }> = [
    { x: 0, y: 0, ownerId: ME, ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT" } as never },
    { x: 2, y: 0, ownerId: ME, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } as never },
    { x: 1, y: 0, ownerId: ME, ownershipState: "SETTLED", resource: "FISH" },
    { x: 1, y: 1, ownerId: ME, ownershipState: "SETTLED", resource: "FISH" }
  ];
  for (const t of tiles) state.tiles.set(tileKey(t.x, t.y), { terrain: "LAND", ...t } as Tile);
  state.tilesRevision += 1;
  return state;
};

const card = () => document.getElementById("tutorial-guide-root");
const cardTitle = () => card()?.querySelector(".tg-title")?.textContent ?? "";
const click = (action: string) => (card()?.querySelector(`[data-guide-action="${action}"]`) as HTMLElement | null)?.click();
const styles = () => Array.from(document.head.querySelectorAll("style")).map((s) => s.textContent).join("\n");
const toast = () => document.getElementById("discovery-tip-overlay");

/** Starts the guide and skips to the step `skips` steps after Look around's first. */
const startAt = (state: ReturnType<typeof footholdDoneState>, skips: number): void => {
  setGuideStatus("active", EMAIL);
  noteGuideMapPanned();
  refreshOnboardingChecklistHighlight(state);
  for (let i = 0; i < skips; i += 1) click("skip");
  tickOnboardingUiGateForFrame(state, vi.fn());
};

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
  document.body.className = "";
  document.head.innerHTML = "";
  renderDiscoveryTipOverlay([], "reset@example.com", vi.fn());
  resetGuideStorageMemoryForTests();
  resetGuideInputSignalsForTests();
  resetGuideInputCacheForTests();
  resetTutorialGuideForTests();
  resetOnboardingChecklistOverlayForTests();
  resetOnboardingUiOverlaysForTests();
});

describe("tutorial guide over panels and screens", () => {
  // Playtest day 1 (oldphone, optimiser, achiever): the minimised "?" launcher sat on Settings' Back button,
  // the Diplomacy and Manpower headings and the Manifest price line.
  it("keeps the minimised launcher off every open panel and screen, and brings it back on the map", () => {
    const state = footholdDoneState();
    startAt(state, 2);
    click("toggle");
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()?.querySelector(".tg-launcher")?.hasAttribute("hidden")).toBe(false);
    expect(card()?.classList.contains("tg-over-ui")).toBe(false);
    expect(styles()).toContain("#tutorial-guide-root.tg-over-ui .tg-launcher { display: none !important; }");
    for (const panel of ["settings", "manpower"] as const) {
      state.activePanel = panel;
      tickOnboardingUiGateForFrame(state, vi.fn());
      expect(card()?.classList.contains("tg-over-ui")).toBe(true);
    }
    state.activePanel = null;
    document.body.classList.add("hud-v2-screen-open", "hud-v2-screen-diplomacy");
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()?.classList.contains("tg-over-ui")).toBe(true);
    document.body.classList.remove("hud-v2-screen-open", "hud-v2-screen-diplomacy");
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()?.classList.contains("tg-over-ui")).toBe(false);
  });

  it("lifts the card above an open side panel, such as Manpower, and drops it back once closed", () => {
    const state = footholdDoneState();
    startAt(state, 2); // zoom, relay beacon -> manpower
    expect(cardTitle()).toBe("Tap your manpower gauge");
    expect(card()?.classList.contains("tg-raised")).toBe(false);

    state.activePanel = "manpower";
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardTitle()).toBe("Open Manifests");
    expect(card()?.classList.contains("tg-raised")).toBe(true);
    // Above the side panel (z-index 25, 47 over a HUD v2 screen) and the HUD v2 screens (44).
    expect(styles()).toMatch(/#tutorial-guide-root\.tg-raised \{ z-index: 48; \}/);

    state.activePanel = null;
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()?.classList.contains("tg-raised")).toBe(false);
  });

  it("keeps the guide visible over compact Manpower without showing it over Settings", () => {
    const state = footholdDoneState();
    document.body.classList.add("hud-v2", "hud-v2-compact");
    document.body.innerHTML = '<div id="hud" class="desktop-side-panel-open"></div>';
    startAt(state, 2);
    state.activePanel = "manpower";
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardTitle()).toBe("Open Manifests");
    expect(card()?.classList.contains("tg-raised")).toBe(true);
    expect(styles()).toContain("body.hud-v2-compact #tutorial-guide-root.tg-over-manpower { display: block !important; }");
    state.activePanel = "settings";
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()?.classList.contains("tg-raised")).toBe(false);
    expect(card()?.classList.contains("tg-over-manpower")).toBe(false);
  });

  it("stays visible on the new HUD's Manifest screen and marks the recommended Manifest there", () => {
    const state = footholdDoneState();
    document.body.classList.add("hud-v2");
    startAt(state, 3); // ... manpower -> open Manifests
    expect(cardTitle()).toBe("Open Manifests");

    const host = document.createElement("div");
    host.innerHTML = `<button class="v2m-node" data-v2-manifest-select="trade"></button><button class="v2m-node" data-v2-manifest-select="agriculture"></button>`;
    document.body.appendChild(host);
    document.body.classList.add("hud-v2-screen-open", "hud-v2-screen-manifest", "hud-v2-screen-frame");
    tickOnboardingUiGateForFrame(state, vi.fn());

    expect(cardTitle()).toBe("Commission the Industrial Tooling Module");
    expect(card()?.classList.contains("tg-raised")).toBe(true);
    // The frame screens hide the corner bubble (.onb-root); the guide overrides that by id.
    expect(styles()).toMatch(/body\.hud-v2-screen-manifest #tutorial-guide-root, body\.hud-v2-screen-diplomacy #tutorial-guide-root \{ display: block !important; \}/);
    // Frame screens no step points to (AFC, Ranks, Profile, Towns) keep hiding it.
    expect(styles()).not.toMatch(/hud-v2-screen-frame #tutorial-guide-root/);
    const pick = host.querySelector('[data-v2-manifest-select="trade"]');
    expect(pick?.classList.contains("tg-manifest-pick")).toBe(true);
    expect(pick?.querySelector(".tg-manifest-pick-badge")?.textContent).toBe("Guide pick");
    expect(host.querySelector('[data-v2-manifest-select="agriculture"]')?.classList.contains("tg-manifest-pick")).toBe(false);

    // The tree rebuilds its markup: the next frame marks the new node.
    host.innerHTML = `<button class="v2m-node" data-v2-manifest-select="trade"></button>`;
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(host.querySelector('[data-v2-manifest-select="trade"]')?.classList.contains("tg-manifest-pick")).toBe(true);

    // Once commissioned the guide moves on and the mark goes.
    state.techIds = ["trade"];
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(host.querySelector(".tg-manifest-pick")).toBeNull();
  });

  it("marks the recommended card in the legacy tech tree, not the small links that share its data attribute", () => {
    const state = footholdDoneState();
    const tree = document.createElement("div");
    tree.innerHTML = `<button class="tech-card" data-tech-card="trade"></button><button class="manifest-lead__link" data-tech-card="trade"></button>`;
    document.body.appendChild(tree);
    startAt(state, 4);
    expect(tree.querySelector('.tech-card[data-tech-card="trade"]')?.classList.contains("tg-manifest-pick")).toBe(true);
    expect(tree.querySelector(".manifest-lead__link")?.classList.contains("tg-manifest-pick")).toBe(false);
  });

  it("re-marks the legacy tree when the HUD rebuilds it, before the next frame", async () => {
    const state = footholdDoneState();
    const tree = document.createElement("div");
    tree.innerHTML = `<button class="tech-card" data-tech-card="trade"></button>`;
    document.body.appendChild(tree);
    startAt(state, 4);
    tree.innerHTML = `<button class="tech-card" data-tech-card="trade"></button>`; // renderHud rewrites the grid
    await Promise.resolve();
    expect(tree.querySelector(".tech-card")?.classList.contains("tg-manifest-pick")).toBe(true);
    expect(tree.querySelectorAll(".tg-manifest-pick-badge")).toHaveLength(1);
  });

  it("does not lift the card over Settings, whose modal dim shares the raised layer", () => {
    const state = footholdDoneState();
    startAt(state, 3);
    state.activePanel = "settings";
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()?.classList.contains("tg-raised")).toBe(false);
  });
});

describe("discovery tips while the guide runs", () => {
  it("retires tips the guide teaches, holds the rest, and shows them once the guide is hidden", () => {
    const state = footholdDoneState();
    startAt(state, 0);
    state.discoveryTipQueue.push("TOWN", "DOCK");
    renderDiscoveryTipOverlayForState(state, vi.fn());
    expect(toast()).toBeNull();
    // The guide's town step covers "First Town Discovered!": dropped, as if dismissed.
    expect(state.discoveryTipQueue).toEqual(["DOCK"]);
    expect(isDiscoveryTipSeen("TOWN", EMAIL)).toBe(true);

    click("hide");
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(toast()?.textContent).toMatch(/Dock Discovered/);
  });

  it("lets tips through while the card is minimised", () => {
    const state = footholdDoneState();
    startAt(state, 0);
    state.discoveryTipQueue.push("DOCK");
    renderDiscoveryTipOverlayForState(state, vi.fn());
    expect(toast()).toBeNull();
    click("toggle"); // minimise
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(toast()?.textContent).toMatch(/Dock Discovered/);
  });

  it("never holds urgent feedback, and keeps first contact and muster tips rather than retiring them", () => {
    const state = footholdDoneState();
    startAt(state, 0);
    state.discoveryTipQueue.push("DOCK");
    renderDiscoveryTipOverlayForState(state, vi.fn());
    announceDiscoveryTipForState(state, "OUT_OF_REACH_EXPAND", vi.fn(), { x: 9, y: 9 });
    expect(toast()?.textContent).toMatch(/Beyond Your Reach/);
    expect(state.discoveryTipQueue).toEqual(["OUT_OF_REACH_EXPAND", "DOCK"]);

    state.discoveryTipQueue.push("ENEMY_EMPIRE");
    renderDiscoveryTipOverlayForState(state, vi.fn());
    expect(state.discoveryTipQueue).toContain("ENEMY_EMPIRE");
    expect(isDiscoveryTipSeen("ENEMY_EMPIRE", EMAIL)).toBe(false);
  });

  it("marks the recommended AFC upgrade card with a Guide pick badge, and clears only its own mark", async () => {
    const { syncGuideAfcPick } = await import("./tutorial-guide-afc-pick.js");
    const { syncGuideManifestPick } = await import("./tutorial-guide-manifest-pick.js");
    document.body.innerHTML = '<button class="afc-upgrade-card" data-afc-upgrade-card="afc-exchequer-1">Founding Concession</button><button class="afc-upgrade-card" data-afc-upgrade-card="other">Other</button>';
    syncGuideAfcPick("afc-exchequer-1");
    const card = document.querySelector('[data-afc-upgrade-card="afc-exchequer-1"]');
    expect(card?.querySelector(".tg-manifest-pick-badge")?.textContent).toBe("Guide pick");
    expect(document.querySelector('[data-afc-upgrade-card="other"] .tg-manifest-pick-badge')).toBeNull();
    // The Manifest marker syncing with nothing must not strip the AFC mark (no flicker).
    syncGuideManifestPick(undefined);
    expect(card?.querySelector(".tg-manifest-pick-badge")).not.toBeNull();
    syncGuideAfcPick(undefined);
    expect(card?.querySelector(".tg-manifest-pick-badge")).toBeNull();
  });

  it("recommends Build Manufactory in the tile menu of a marked town, only while the guide's build step is up", async () => {
    const { setGuideManufactoryTargets, injectGuideManufactoryRecommendation } = await import("./tutorial-guide-manufactory-recommendation.js");
    const menu = () => {
      const buildings: Array<{ id: string; recommended?: boolean }> = [{ id: "build_manufactory", recommended: false }, { id: "build_market" }];
      return { actions: [] as Array<{ id: string; recommended?: boolean }>, buildings, tabs: ["actions", "buildings"] };
    };
    setGuideManufactoryTargets([{ x: 4, y: 4 }]);
    const marked = menu();
    injectGuideManufactoryRecommendation(marked as never, { x: 4, y: 4 });
    expect(marked.buildings[0]?.recommended).toBe(true);
    expect(marked.actions.map((a) => a.id)).toEqual(["build_manufactory"]);
    const other = menu();
    injectGuideManufactoryRecommendation(other as never, { x: 9, y: 9 });
    expect(other.buildings[0]?.recommended).toBe(false);
    setGuideManufactoryTargets(undefined);
    const cleared = menu();
    injectGuideManufactoryRecommendation(cleared as never, { x: 4, y: 4 });
    expect(cleared.buildings[0]?.recommended).toBe(false);
  });
});
