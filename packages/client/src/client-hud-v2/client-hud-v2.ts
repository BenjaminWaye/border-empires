// Controller for the redesigned desktop HUD (flag-gated, see client-hud-v2-flag.ts).
// It mounts its own layer over the map and re-renders it from ClientState on a
// short timer, writing each region only when its HTML changed. Tile actions go
// through the existing handlers; the destination screens live in
// client-hud-v2-screens.ts, the town and battle screens in their runtimes.

import { musterFlagCap } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { readyAfcUpgradeCount } from "../client-afc-upgrade-ready/client-afc-upgrade-ready.js";
import { deriveDevelopmentPanelData } from "../client-development-panel/client-development-html.js";
import { busyDevelopmentProcessCount } from "../client-development-queue/client-development-queue.js";
import { nextManpowerRefillForPlayer } from "../client-manpower-gauge/client-manpower-refill.js";
import { buildManpowerPanelMusterFlags } from "../client-muster-flags-panel/client-muster-flags-panel.js";
import { battleOnBarAction, battleOnMenuView, installBattleWatch, reopenLiveBattle } from "./client-hud-v2-battle-runtime.js";
import { focusCamera, screen, SCREEN_HOST_ID, type HudV2Deps, type HudV2ScreenId } from "./client-hud-v2-context.js";
import { escapeOpensSettings } from "./client-hud-v2-escape.js";
import { hudV2GameOnScreen } from "./client-hud-v2-ready.js";
import { initHudV2Flag, isHudV2Active } from "./client-hud-v2-flag.js";
import { navHtml } from "./client-hud-v2-nav.js";
import { orbHtml } from "./client-hud-v2-orb.js";
import { overlaysHtml } from "./client-hud-v2-overlays.js";
import { resourceBarHtml } from "./client-hud-v2-resource-bar.js";
import { rivalsHtml, seasonClockHtml } from "./client-hud-v2-rivals.js";
import { closeScreen, openScreen, renderScreen, screenClick, screenEscape } from "./client-hud-v2-screens.js";
import { setDockListener } from "./client-hud-v2-tile-dock.js";
import { closeTownScreen, townOnMenuView } from "./client-hud-v2-town-runtime.js";
import { trackerHtml } from "./client-hud-v2-tracker.js";
import "./client-hud-v2.css";
import "./client-hud-v2-screens.css";
import "./client-hud-v2-town-battle.css";

export type { HudV2Deps } from "./client-hud-v2-context.js";

const FAST_TICK_MS = 250;
/** The tracker scans owned tiles, so it refreshes on every 4th tick (1 s) instead of every tick. */
const TRACKER_EVERY_TICKS = 4;

const shellHtml = `
  <div class="hud-v2-top"><div id="hud-v2-bar" class="hud-v2-bar"></div><div id="hud-v2-nav" class="hud-v2-nav"></div></div>
  <div class="hud-v2-right"><div id="hud-v2-season" class="hud-v2-season"></div><div id="hud-v2-rivals" class="hud-v2-rivals"></div></div>
  <aside id="hud-v2-tracker" class="hud-v2-tracker" aria-label="Tracker"></aside>
  <section id="hud-v2-tile" class="hud-v2-tile" hidden aria-label="Selected tile"></section>
  <div id="${SCREEN_HOST_ID}" class="hud-v2-screen"></div>
  <div id="hud-v2-overlays" class="hud-v2-overlays"></div>
  <div id="hud-v2-orb-slot" class="hud-v2-orb-slot"></div>`;

type Region = "bar" | "nav" | "season" | "rivals" | "tracker" | "orb-slot" | "overlays";

const written = new Map<Region, string>();

const writeRegion = (region: Region, html: string): void => {
  if (written.get(region) === html) return;
  const el = document.getElementById(`hud-v2-${region}`);
  if (!el) return;
  el.innerHTML = html;
  written.set(region, html);
};

const SCREEN_TARGETS: Readonly<Record<string, HudV2ScreenId>> = {
  manifest: "manifest",
  afc: "afc",
  diplomacy: "diplomacy",
  ranks: "ranks",
  chronicle: "chronicle"
};

const legacyButton = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);

/** Opens a screen, or a panel the way its legacy button would (so every side effect of that button still happens). */
const openTarget = (deps: HudV2Deps, open: string): void => {
  const id = SCREEN_TARGETS[open];
  if (id) {
    if (screen.id === id) closeScreen(deps);
    else openScreen(deps, id);
    return;
  }
  if (open === "battle") {
    // Attacks reopen the live battle; an expansion in progress just centres the map on it.
    const c = deps.state.capture;
    if (!reopenLiveBattle(deps) && c) {
      focusCamera(deps, c.target.x, c.target.y);
      deps.renderHud();
    }
    return;
  }
  if (screen.id === "town") closeTownScreen(true);
  if (open === "manpower") legacyButton('#stats-chips [data-panel="manpower"]')?.click();
  else if (open === "self") legacyButton("#stats-chips .stat-chip-player")?.click();
  else legacyButton(`#panel-actions [data-panel="${open}"]`)?.click();
  deps.renderHud();
};

const CHIP_FOCUS: Readonly<Record<string, ClientState["economyFocus"]>> = {
  coin: "GOLD", food: "FOOD", titanium: "TITANIUM", crystal: "CRYSTAL", umbrite: "UMBRITE", shard: "ALL"
};

/** Resource chips open the Economy panel on that resource; Integrity opens its own panel. */
const openResourcePanel = (deps: HudV2Deps, chip: string): void => {
  const { state } = deps;
  const panel: ClientState["activePanel"] = chip === "integrity" ? "defensibility" : "economy";
  const focus = CHIP_FOCUS[chip];
  // A second click on the same chip closes its panel.
  const alreadyOpen = state.activePanel === panel && (!focus || state.economyFocus === focus);
  if (focus) state.economyFocus = focus;
  state.activePanel = alreadyOpen ? null : panel;
  deps.renderHud();
};

const onLayerClick = (deps: HudV2Deps, event: MouseEvent): void => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || target.closest("#hud-v2-tile")) return;
  if (target.closest(`#${SCREEN_HOST_ID}`) && screenClick(deps, target)) return;
  const open = target.closest<HTMLElement>("[data-hud-v2-open]");
  if (open?.dataset.hudV2Open) {
    openTarget(deps, open.dataset.hudV2Open);
    return;
  }
  const chip = target.closest<HTMLElement>("[data-hud-v2-chip]");
  if (chip?.dataset.hudV2Chip) {
    openResourcePanel(deps, chip.dataset.hudV2Chip);
    return;
  }
  if (target.closest("[data-hud-v2-overlay='diplomacy']")) {
    deps.state.showDiplomacyOverlay = !deps.state.showDiplomacyOverlay;
    deps.requestViewRefresh();
    return;
  }
  const dip = target.closest<HTMLElement>("[data-hud-v2-diplomacy]");
  if (dip?.dataset.hudV2Diplomacy) {
    openScreen(deps, "diplomacy", { diplomacyTarget: dip.dataset.hudV2Diplomacy });
    return;
  }
  const profile = target.closest<HTMLElement>("[data-hud-v2-profile]");
  if (profile?.dataset.hudV2Profile) {
    deps.state.activePlayerProfileId = profile.dataset.hudV2Profile;
    deps.renderHud();
    return;
  }
  const focus = target.closest<HTMLElement>("[data-hud-v2-focus-x]");
  if (focus) {
    const x = Number(focus.dataset.hudV2FocusX);
    const y = Number(focus.dataset.hudV2FocusY);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      focusCamera(deps, x, y);
      deps.renderHud();
    }
  }
};

/**
 * Esc closes the open screen, profile or panel; with nothing open it toggles Settings (the system menu).
 * Runs in the capture phase so it sees the state before the map's own Esc handler clears the selection.
 */
const onEscape = (deps: HudV2Deps, event: KeyboardEvent): void => {
  if (event.key !== "Escape" || !isHudV2Active(deps.isMobile)) return;
  const el = event.target instanceof HTMLElement ? event.target : null;
  if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
  if (document.querySelector(".effort-confirm-overlay, .diplomacy-trade-overlay") && screen.id !== "diplomacy") return;
  const { state } = deps;
  // Whatever this handler closes, the keypress stops here: the map's own Esc would also cancel
  // the attack in flight, crystal targeting and placement (client-map-input.ts).
  const consume = (): void => {
    event.stopPropagation();
    deps.renderHud();
  };
  if (state.activePlayerProfileId) {
    state.activePlayerProfileId = undefined;
    consume();
    return;
  }
  // A panel over a screen (Settings from the gear) closes before the screen; AFC's panel is its screen.
  if (state.activePanel && screen.id !== "afc") {
    state.activePanel = null;
    consume();
    return;
  }
  if (screenEscape(deps)) {
    // Leaving the town screen also closes its tile menu (done in closeScreen); nothing else should react.
    event.stopPropagation();
    return;
  }
  if (escapeOpensSettings(state, document)) openTarget(deps, "settings");
};

const NAV_ACTIVE: Partial<Record<HudV2ScreenId, string>> = { manifest: "manifest", afc: "afc", diplomacy: "diplomacy", ranks: "ranks", chronicle: "chronicle" };

const renderFast = (state: ClientState, nowMs: number): void => {
  writeRegion("bar", resourceBarHtml({
    gold: state.gold,
    incomePerMinute: state.incomePerMinute,
    slotSupply: state.resourceSlots.supply,
    slotDemand: state.resourceSlots.demand,
    shard: state.strategicResources.SHARD,
    integrityPct: state.defensibilityPct
  }));
  writeRegion("nav", navHtml({
    name: state.playerNames.get(state.me) ?? "You",
    color: state.playerColors.get(state.me) ?? "#b08a3e",
    afcReady: readyAfcUpgradeCount(state),
    diplomacyRequests: state.incomingAllianceRequests.length + state.incomingTruceRequests.length,
    active: screen.id ? NAV_ACTIVE[screen.id] : undefined
  }));
  writeRegion("season", seasonClockHtml(state.seasonVictory));
  writeRegion("rivals", rivalsHtml({
    me: state.me,
    metPlayerIds: state.metPlayerIds,
    allies: state.allies,
    activeTruces: state.activeTruces,
    nameOf: (id) => state.playerNames.get(id) ?? "",
    colorOf: (id) => state.playerColors.get(id),
    nowMs
  }));
  writeRegion("overlays", overlaysHtml(state.showDiplomacyOverlay));
  writeRegion("orb-slot", orbHtml({ manpower: state.manpower, manpowerCap: state.manpowerCap, nextRefillAt: nextManpowerRefillForPlayer(state.me, nowMs), nowMs }));
};

/** The tracker's tile scans (three passes over every known tile), reused until tiles change or it goes stale. */
const TRACKER_SCAN_MAX_AGE_MS = 5_000;
let trackerScan: { key: string; at: number; freeBuildSlots: number; flags: ReturnType<typeof buildManpowerPanelMusterFlags>; building: ReturnType<typeof deriveDevelopmentPanelData>["activeSlots"] } | undefined;

const trackerScanKey = (state: ClientState): string =>
  [state.tilesRevision, state.settleProgressByTile.size, state.developmentQueue.length, state.activeDevelopmentProcessCount, state.manpower, state.manpowerCap].join("|");

const renderTracker = (state: ClientState, nowMs: number): void => {
  const key = trackerScanKey(state);
  if (!trackerScan || trackerScan.key !== key || nowMs - trackerScan.at > TRACKER_SCAN_MAX_AGE_MS) {
    const busy = Math.max(state.activeDevelopmentProcessCount, busyDevelopmentProcessCount(state.tiles.values(), state.me, state.settleProgressByTile.size));
    const development = deriveDevelopmentPanelData(state.tiles, state.me, state.settleProgressByTile, state.developmentQueue, busy, state.developmentProcessLimit);
    trackerScan = {
      key,
      at: nowMs,
      freeBuildSlots: Math.max(0, development.limit - development.busy),
      flags: buildManpowerPanelMusterFlags(state.tiles.values(), state.me, state.manpowerCap, state.manpower, state.musterAmountRateByTile),
      building: development.activeSlots
    };
  }
  const elapsed = nowMs - trackerScan.at;
  const capture = state.capture && !state.capture.silent ? { x: state.capture.target.x, y: state.capture.target.y, resolvesAt: state.capture.resolvesAt } : undefined;
  writeRegion("tracker", trackerHtml({
    freeBuildSlots: trackerScan.freeBuildSlots,
    afcReady: readyAfcUpgradeCount(state),
    flags: trackerScan.flags,
    flagCap: musterFlagCap(state.manpowerCap, 0),
    // Timers count down between scans without rescanning the tiles.
    building: trackerScan.building.map((b) => ({ ...b, remainingMs: Math.max(0, b.remainingMs - elapsed) })),
    capture,
    nowMs
  }));
};

let started = false;

export const installHudV2 = (deps: HudV2Deps): void => {
  if (started || typeof document === "undefined") return;
  if (!initHudV2Flag(window.location.search)) return;
  started = true;
  const layer = document.createElement("div");
  layer.id = "hud-v2";
  layer.innerHTML = shellHtml;
  (document.getElementById("hud") ?? document.body).appendChild(layer);
  layer.addEventListener("click", (event) => onLayerClick(deps, event));
  window.addEventListener("keydown", (event) => onEscape(deps, event), true);
  setDockListener({
    onMenuView: (view, tileKey) => {
      battleOnMenuView(view, tileKey);
      return townOnMenuView(deps, view, tileKey);
    },
    onMenuHidden: () => {
      if (screen.id === "town") closeTownScreen(true);
    },
    onBarAction: battleOnBarAction
  });
  installBattleWatch(deps);
  let tick = 0;
  const frame = (): void => {
    // body.hud-v2 (which hides the legacy chrome) follows the flag alone, so the old HUD never flashes during
    // loading; sign-in, map preparation, the first load and the season lobby only hold the new layer back.
    const flagOn = isHudV2Active(deps.isMobile);
    const onScreen = flagOn && hudV2GameOnScreen(deps.state, document.body);
    document.body.classList.toggle("hud-v2", flagOn);
    document.body.classList.toggle("hud-v2-waiting", flagOn && !onScreen);
    // The overlay's toggle and legend live in this HUD; without it (phone width) the tint goes too.
    if (!flagOn && deps.state.showDiplomacyOverlay) deps.state.showDiplomacyOverlay = false;
    if (!onScreen || !deps.state.me) return;
    const nowMs = Date.now();
    renderFast(deps.state, nowMs);
    if (tick % TRACKER_EVERY_TICKS === 0) renderTracker(deps.state, nowMs);
    if (screen.id && screen.id !== "town") renderScreen(deps);
    tick += 1;
  };
  frame();
  setInterval(frame, FAST_TICK_MS);
};
