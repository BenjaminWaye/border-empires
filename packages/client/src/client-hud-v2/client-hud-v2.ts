// Controller for the redesigned desktop HUD (flag-gated, see client-hud-v2-flag.ts).
// It mounts its own layer over the map and re-renders it from ClientState on a
// short timer, writing each region only when its HTML changed. Panels, profiles
// and tile actions all go through the existing handlers, so the legacy panels
// still do the work; this layer only replaces how you reach them.

import { musterFlagCap } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { readyAfcUpgradeCount } from "../client-afc-upgrade-ready/client-afc-upgrade-ready.js";
import { deriveDevelopmentPanelData } from "../client-development-panel/client-development-html.js";
import { busyDevelopmentProcessCount } from "../client-development-queue/client-development-queue.js";
import { nextManpowerRefillForPlayer } from "../client-manpower-gauge/client-manpower-refill.js";
import { buildManpowerPanelMusterFlags } from "../client-muster-flags-panel/client-muster-flags-panel.js";
import { initHudV2Flag, isHudV2Active } from "./client-hud-v2-flag.js";
import { navHtml } from "./client-hud-v2-nav.js";
import { orbHtml } from "./client-hud-v2-orb.js";
import { resourceBarHtml } from "./client-hud-v2-resource-bar.js";
import { rivalsHtml, seasonClockHtml } from "./client-hud-v2-rivals.js";
import { trackerHtml } from "./client-hud-v2-tracker.js";
import "./client-hud-v2.css";

export type HudV2Deps = {
  state: ClientState;
  renderHud: () => void;
  requestViewRefresh: () => void;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  isMobile: () => boolean;
};

const FAST_TICK_MS = 250;
/** The tracker scans owned tiles, so it refreshes on every 4th tick (1 s) instead of every tick. */
const TRACKER_EVERY_TICKS = 4;

const shellHtml = `
  <div class="hud-v2-top"><div id="hud-v2-bar" class="hud-v2-bar"></div><div id="hud-v2-nav" class="hud-v2-nav"></div></div>
  <div class="hud-v2-right"><div id="hud-v2-season" class="hud-v2-season"></div><div id="hud-v2-rivals" class="hud-v2-rivals"></div></div>
  <aside id="hud-v2-tracker" class="hud-v2-tracker" aria-label="Tracker"></aside>
  <section id="hud-v2-tile" class="hud-v2-tile" hidden aria-label="Selected tile"></section>
  <div id="hud-v2-orb-slot" class="hud-v2-orb-slot"></div>`;

type Region = "bar" | "nav" | "season" | "rivals" | "tracker" | "orb-slot";

const written = new Map<Region, string>();

const writeRegion = (region: Region, html: string): void => {
  if (written.get(region) === html) return;
  const el = document.getElementById(`hud-v2-${region}`);
  if (!el) return;
  el.innerHTML = html;
  written.set(region, html);
};

const legacyPanelButton = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);

/** Opens a panel the way its legacy button would, so every side effect of that button still happens. */
const openTarget = (deps: HudV2Deps, open: string): void => {
  if (open === "activity") legacyPanelButton("[data-open-activity-dashboard]")?.click();
  else if (open === "manpower") legacyPanelButton('#stats-chips [data-panel="manpower"]')?.click();
  else if (open === "self") legacyPanelButton("#stats-chips .stat-chip-player")?.click();
  else legacyPanelButton(`#panel-actions [data-panel="${open}"]`)?.click();
  deps.renderHud();
};

const focusTile = (deps: HudV2Deps, x: number, y: number): void => {
  const { state } = deps;
  state.camX = deps.wrapX(x);
  state.camY = deps.wrapY(y);
  state.camSubX = 0;
  state.camSubY = 0;
  state.selected = { x: state.camX, y: state.camY };
  deps.requestViewRefresh();
  deps.renderHud();
};

const onLayerClick = (deps: HudV2Deps, event: MouseEvent): void => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || target.closest("#hud-v2-tile")) return;
  const open = target.closest<HTMLElement>("[data-hud-v2-open]");
  if (open?.dataset.hudV2Open) {
    openTarget(deps, open.dataset.hudV2Open);
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
    if (Number.isFinite(x) && Number.isFinite(y)) focusTile(deps, x, y);
  }
};

/**
 * Esc with nothing open toggles Settings (the system menu); with a panel open it closes it.
 * Runs in the capture phase so it sees the state before the map's own Esc handler clears the selection.
 */
const onEscape = (deps: HudV2Deps, event: KeyboardEvent): void => {
  if (event.key !== "Escape" || !isHudV2Active(deps.isMobile)) return;
  const el = event.target instanceof HTMLElement ? event.target : null;
  if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
  const { state } = deps;
  if (state.activePlayerProfileId) {
    state.activePlayerProfileId = undefined;
    deps.renderHud();
    return;
  }
  if (state.activePanel) {
    state.activePanel = null;
    deps.renderHud();
    return;
  }
  const busy = state.tileActionMenu.visible || state.capture !== undefined || state.buildingPlacement.active;
  if (!busy) openTarget(deps, "settings");
};

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
    activePanel: state.activePanel
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
  writeRegion("orb-slot", orbHtml({ manpower: state.manpower, manpowerCap: state.manpowerCap, nextRefillAt: nextManpowerRefillForPlayer(state.me, nowMs), nowMs }));
};

const renderTracker = (state: ClientState, nowMs: number): void => {
  const busy = Math.max(state.activeDevelopmentProcessCount, busyDevelopmentProcessCount(state.tiles.values(), state.me, state.settleProgressByTile.size));
  const development = deriveDevelopmentPanelData(state.tiles, state.me, state.settleProgressByTile, state.developmentQueue, busy, state.developmentProcessLimit);
  const capture = state.capture && !state.capture.silent ? { x: state.capture.target.x, y: state.capture.target.y, resolvesAt: state.capture.resolvesAt } : undefined;
  writeRegion("tracker", trackerHtml({
    freeBuildSlots: Math.max(0, development.limit - development.busy),
    afcReady: readyAfcUpgradeCount(state),
    flags: buildManpowerPanelMusterFlags(state.tiles.values(), state.me, state.manpowerCap, state.manpower, state.musterAmountRateByTile),
    flagCap: musterFlagCap(state.manpowerCap, 0),
    building: development.activeSlots,
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
  let tick = 0;
  const frame = (): void => {
    const active = isHudV2Active(deps.isMobile);
    document.body.classList.toggle("hud-v2", active);
    if (!active || !deps.state.me) return;
    const nowMs = Date.now();
    renderFast(deps.state, nowMs);
    if (tick % TRACKER_EVERY_TICKS === 0) renderTracker(deps.state, nowMs);
    tick += 1;
  };
  frame();
  setInterval(frame, FAST_TICK_MS);
};
