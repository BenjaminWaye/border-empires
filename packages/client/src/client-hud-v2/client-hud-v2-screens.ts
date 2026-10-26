// Screen router for the new HUD. Manifest, AFC upgrades, Diplomacy and Ranks
// share one full-screen frame over the darkened map; Chronicle is a drawer
// over the live map; town and battle have their own runtimes. Opening one
// hides the map HUD (CSS, keyed off body classes set in the context module).

import { acknowledgeActivitySeen, requestPersonalActivity } from "../client-activity-dashboard/client-activity-dashboard-network.js";
import { counterOfferScreenInput } from "../client-alliance/client-alliance-counter-offer.js";
import { diplomacyTradeDepsFor, openDiplomacyTradeScreen } from "../client-diplomacy-trade/client-diplomacy-trade.js";
import type { BuildingCategory } from "../client-tile-menu-building-category/client-tile-menu-building-category.js";
import type { TileActionDef } from "../client-types.js";
import { battleClick, battleEscape, renderBattle } from "./client-hud-v2-battle-runtime.js";
import { chronicleHtml } from "./client-hud-v2-chronicle.js";
import {
  clearScreen,
  focusCamera,
  forgetWritten,
  FRAME_SKELETON,
  screen,
  screenCentre,
  setScreen,
  writeHtml,
  type HudV2Deps,
  type HudV2ScreenId
} from "./client-hud-v2-context.js";
import { dealSideHtml, dealSkeletonHtml, diplomacyListHtml, empireStance } from "./client-hud-v2-diplomacy.js";
import { MANIFEST_LEGEND_HTML, manifestDetailHtml, manifestHeadRightHtml, manifestTreeHtml } from "./client-hud-v2-manifest.js";
import { ranksBannerHtml, ranksBodyHtml } from "./client-hud-v2-ranks.js";
import { expandDockedMenu, suppressAutoExpand } from "./client-hud-v2-tile-dock.js";
import { closeTownScreen, renderTownScreen, runTileActionOn, stepTown } from "./client-hud-v2-town-runtime.js";

const TITLES: Partial<Record<HudV2ScreenId, string>> = { manifest: "Manifest", afc: "AFC Upgrades", diplomacy: "Diplomacy", ranks: "The Duke's Seat" };

/** Which body is in the frame now, so the diplomacy deal (hosting foreign DOM) is never rewritten under itself. */
let bodyMode = "";

const nameOf = (deps: HudV2Deps, id: string): string => deps.state.playerNames.get(id) ?? "";

export const openScreen = (deps: HudV2Deps, id: HudV2ScreenId, options: { diplomacyTarget?: string } = {}): void => {
  if (screen.id === "town") deps.actionFlow.hideTileActionMenu();
  if (screen.id && screen.id !== id) closeScreen(deps);
  if (id === "chronicle") {
    setScreen("chronicle", `<aside class="v2c-drawer" id="v2c-drawer" aria-label="Chronicle"></aside>`);
    requestPersonalActivity(deps.state, deps);
  } else {
    setScreen(id, FRAME_SKELETON);
    bodyMode = "";
    writeHtml("v2s-title", TITLES[id] ?? "");
  }
  if (id === "afc") {
    deps.state.activePanel = "domains";
  } else if (deps.state.activePanel) {
    deps.state.activePanel = null;
  }
  if (id === "diplomacy") screen.diplomacyTargetId = options.diplomacyTarget;
  renderScreen(deps);
  deps.renderHud();
};

export const closeScreen = (deps: HudV2Deps): void => {
  const id = screen.id;
  if (!id) return;
  if (id === "town") {
    closeTownScreen();
    deps.actionFlow.hideTileActionMenu();
    return;
  }
  if (id === "battle") {
    battleEscape();
    return;
  }
  if (id === "afc" && deps.state.activePanel === "domains") deps.state.activePanel = null;
  document.querySelector(".diplomacy-trade-overlay")?.remove();
  screen.diplomacyTargetId = undefined;
  bodyMode = "";
  clearScreen();
  deps.renderHud();
};

const ownedTechs = (deps: HudV2Deps): Set<string> => new Set(deps.state.techIds);

const renderManifest = (deps: HudV2Deps): void => {
  const owned = ownedTechs(deps);
  const techs = deps.state.techCatalog;
  const afcTier = Math.max(0, ...techs.filter((t) => owned.has(t.id)).map((t) => t.tier));
  const input = { techs, owned, selectedId: screen.manifestSelectedId, closedLanes: screen.manifestClosedLanes, gold: deps.state.gold, afcTier };
  writeHtml("v2s-head-right", manifestHeadRightHtml(input));
  if (bodyMode !== "manifest") {
    writeHtml("v2s-body", `<div class="v2m-scroll" id="v2m-scroll" data-v2-scroll="manifest"></div>${MANIFEST_LEGEND_HTML}<div class="v2m-detail" id="v2m-detail"></div>`);
    bodyMode = "manifest";
    forgetWritten("v2m-scroll", "v2m-detail");
  }
  writeHtml("v2m-scroll", manifestTreeHtml(input));
  writeHtml("v2m-detail", manifestDetailHtml(input));
};

const renderRanks = (deps: HudV2Deps): void => {
  const lb = deps.state.leaderboard;
  const input = {
    me: deps.state.me,
    objectives: deps.state.seasonVictory,
    overall: lb.overall,
    selfOverall: lb.selfOverall,
    nameOf: (id: string) => nameOf(deps, id),
    colorOf: (id: string) => deps.state.playerColors.get(id)
  };
  writeHtml("v2s-head-right", ranksBannerHtml(input));
  bodyMode = "ranks";
  writeHtml("v2s-body", ranksBodyHtml(input));
};

const myTownCount = (deps: HudV2Deps): number => {
  let n = 0;
  for (const tile of deps.state.tiles.values()) if (tile.town && tile.ownerId === deps.state.me) n += 1;
  return n;
};

const renderDiplomacy = (deps: HudV2Deps): void => {
  const { state } = deps;
  const target = screen.diplomacyTargetId;
  writeHtml("v2s-head-right", "");
  if (!target) {
    bodyMode = "list";
    writeHtml("v2s-body", diplomacyListHtml({
      me: state.me,
      metPlayerIds: state.metPlayerIds,
      allies: state.allies,
      activeTruces: state.activeTruces,
      incomingAlliance: state.incomingAllianceRequests,
      incomingTruce: state.incomingTruceRequests,
      leaderboard: state.leaderboard.overall,
      nameOf: (id) => nameOf(deps, id),
      colorOf: (id) => state.playerColors.get(id),
      nowMs: Date.now()
    }));
    return;
  }
  if (bodyMode !== `deal:${target}`) {
    writeHtml("v2s-body", dealSkeletonHtml(nameOf(deps, target) || "Empire"));
    bodyMode = `deal:${target}`;
    forgetWritten("v2s-dip-you", "v2s-dip-them");
    hostTradeView(deps, target);
  }
  const tilesOf = (id: string): string => {
    const entry = state.leaderboard.overall.find((e) => e.id === id) ?? (id === state.me ? state.leaderboard.selfOverall : undefined);
    return entry ? entry.tiles.toLocaleString("en-US") : "—";
  };
  const stance = empireStance(target, { allies: state.allies, activeTruces: state.activeTruces, nowMs: Date.now() });
  writeHtml("v2s-dip-you", dealSideHtml({
    id: state.me,
    name: nameOf(deps, state.me) || "You",
    color: state.playerColors.get(state.me),
    role: "YOU",
    rows: [
      { label: "Tiles", value: tilesOf(state.me) },
      { label: "Towns", value: String(myTownCount(deps)) },
      { label: "Coin", value: Math.floor(state.gold).toLocaleString("en-US") },
      { label: "Shards", value: String(Math.floor(state.strategicResources.SHARD)) },
      { label: "Allies", value: state.allies.map((id) => nameOf(deps, id)).filter(Boolean).join(", ") || "—" }
    ]
  }));
  writeHtml("v2s-dip-them", dealSideHtml({
    id: target,
    name: nameOf(deps, target) || "Empire",
    color: state.playerColors.get(target),
    role: stance.label.toUpperCase(),
    rows: [{ label: "Tiles", value: tilesOf(target) }]
  }));
};

/** Opens the existing trade view and moves it into the deal's middle column; closing it returns to the list. */
const hostTradeView = (deps: HudV2Deps, targetId: string, input?: Parameters<typeof openDiplomacyTradeScreen>[0]): void => {
  const { state } = deps;
  const ally = state.allies.includes(targetId);
  openDiplomacyTradeScreen(
    input ?? { targetName: nameOf(deps, targetId), targetPlayerId: targetId, kind: ally ? "alliance" : "truce", durationHours: 24 },
    diplomacyTradeDepsFor(state, deps.sendGameMessage)
  );
  const host = document.getElementById("v2s-dip-host");
  const overlay = document.querySelector<HTMLElement>(".diplomacy-trade-overlay");
  if (!host || !overlay) return;
  host.appendChild(overlay);
  new MutationObserver((_, observer) => {
    if (host.querySelector(".diplomacy-trade-overlay")) return;
    observer.disconnect();
    if (screen.id === "diplomacy" && screen.diplomacyTargetId === targetId) {
      screen.diplomacyTargetId = undefined;
      renderScreen(deps);
    }
  }).observe(host, { childList: true });
};

const renderChronicle = (deps: HudV2Deps): void => {
  const { state } = deps;
  const dash = state.activityDashboard;
  writeHtml("v2c-drawer", chronicleHtml({
    me: state.me,
    timeline: dash.timeline,
    loading: dash.loading,
    error: dash.error,
    rivalFilter: screen.chronicleRival,
    selectedId: screen.chronicleSelectedId,
    nameOf: (id) => state.playerNames.get(id),
    colorOf: (id) => state.playerColors.get(id),
    techName: (id) => state.techCatalog.find((t) => t.id === id)?.name,
    nowMs: Date.now()
  }));
  if (dash.timeline) acknowledgeActivitySeen(state, state.bridgeDebugSeasonId, deps);
};

/** Renders the open screen; called on the HUD's timer and after clicks. */
export const renderScreen = (deps: HudV2Deps): void => {
  switch (screen.id) {
    case "manifest": return renderManifest(deps);
    case "ranks": return renderRanks(deps);
    case "diplomacy": return renderDiplomacy(deps);
    case "chronicle": return renderChronicle(deps);
    case "town": return renderTownScreen(deps);
    case "battle": return renderBattle(deps);
    case "afc":
      if (deps.state.activePanel !== "domains") closeScreen(deps);
      return;
    default:
      return;
  }
};

const respondToRequest = (deps: HudV2Deps, kind: "alliance" | "truce", verb: "ACCEPT" | "REJECT", requestId: string): void => {
  const type = `${kind === "alliance" ? "ALLIANCE" : "TRUCE"}_${verb}`;
  deps.sendGameMessage({ type, requestId }, kind === "alliance" ? "Finish sign-in before responding to alliance requests." : "Finish sign-in before responding to truces.");
};

/** Clicks inside an open screen; true when handled. */
export const screenClick = (deps: HudV2Deps, target: Element): boolean => {
  if (!screen.id) return false;
  if (screen.id === "battle" && battleClick(deps, target)) return true;
  if (target.closest("[data-v2-close]")) {
    closeScreen(deps);
    return true;
  }
  const lane = target.closest<HTMLElement>("[data-v2-manifest-lane]");
  if (lane) {
    const id = lane.dataset.v2ManifestLane ?? "";
    if (screen.manifestClosedLanes.has(id)) screen.manifestClosedLanes.delete(id);
    else screen.manifestClosedLanes.add(id);
    renderScreen(deps);
    return true;
  }
  const pick = target.closest<HTMLElement>("[data-v2-manifest-select]");
  if (pick) {
    screen.manifestSelectedId = pick.dataset.v2ManifestSelect ?? "";
    renderScreen(deps);
    return true;
  }
  const commission = target.closest<HTMLButtonElement>("[data-v2-manifest-commission]");
  if (commission && !commission.disabled) {
    deps.actionFlow.chooseTech(commission.dataset.v2ManifestCommission);
    return true;
  }
  const open = target.closest<HTMLElement>("[data-v2-dip-open]");
  if (open) {
    screen.diplomacyTargetId = open.dataset.v2DipOpen;
    renderScreen(deps);
    return true;
  }
  if (target.closest("[data-v2-dip-back]")) {
    document.querySelector(".diplomacy-trade-overlay")?.remove();
    return true;
  }
  const accept = target.closest<HTMLElement>("[data-v2-dip-accept]");
  const reject = target.closest<HTMLElement>("[data-v2-dip-reject]");
  const respond = accept ?? reject;
  if (respond) {
    const kind = (respond.dataset.v2DipAccept ?? respond.dataset.v2DipReject) === "alliance" ? "alliance" : "truce";
    respondToRequest(deps, kind, accept ? "ACCEPT" : "REJECT", respond.dataset.requestId ?? "");
    return true;
  }
  const counter = target.closest<HTMLElement>("[data-v2-dip-counter]");
  if (counter) {
    const kind = counter.dataset.v2DipCounter === "alliance" ? "alliance" : "truce";
    const input = counterOfferScreenInput(kind, counter.dataset.requestId ?? "", {
      playerNameForOwner: (id) => (id ? deps.state.playerNames.get(id) : undefined),
      state: deps.state
    });
    if (!input) return true;
    screen.diplomacyTargetId = input.targetPlayerId;
    writeHtml("v2s-body", dealSkeletonHtml(input.targetName));
    bodyMode = `deal:${input.targetPlayerId}`;
    forgetWritten("v2s-dip-you", "v2s-dip-them");
    hostTradeView(deps, input.targetPlayerId, input);
    renderScreen(deps);
    return true;
  }
  const filter = target.closest<HTMLElement>("[data-v2-chronicle-filter]");
  if (filter) {
    screen.chronicleRival = filter.dataset.v2ChronicleFilter ?? "";
    renderScreen(deps);
    return true;
  }
  const show = target.closest<HTMLElement>("[data-v2-chronicle-show]");
  if (show) {
    const x = Number(show.dataset.x);
    const y = Number(show.dataset.y);
    screen.chronicleSelectedId = show.dataset.v2ChronicleShow;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      focusCamera(deps, x, y);
      const tile = deps.state.tiles.get(`${deps.wrapX(x)},${deps.wrapY(y)}`);
      if (tile) {
        suppressAutoExpand();
        const centre = screenCentre();
        deps.actionFlow.openSingleTileActionMenu(tile, centre.x, centre.y);
      }
    }
    renderScreen(deps);
    deps.renderHud();
    return true;
  }
  if (screen.id === "town") return townClick(deps, target);
  return false;
};

const townClick = (deps: HudV2Deps, target: Element): boolean => {
  const step = target.closest<HTMLElement>("[data-v2-town-step]");
  if (step) {
    stepTown(deps, Number(step.dataset.v2TownStep));
    return true;
  }
  const category = target.closest<HTMLElement>("[data-v2-town-category]");
  if (category) {
    screen.townCategory = category.dataset.v2TownCategory as BuildingCategory;
    screen.townBuildSelection = undefined;
    renderTownScreen(deps);
    return true;
  }
  const build = target.closest<HTMLElement>("[data-v2-town-build]");
  if (build) {
    screen.townBuildSelection = build.dataset.v2TownBuild;
    renderTownScreen(deps);
    return true;
  }
  const action = target.closest<HTMLButtonElement>("[data-hud-v2-action]");
  if (action && !action.disabled) {
    runTileActionOn(deps, action.dataset.hudV2Action as TileActionDef["id"], action.dataset.targetKey, action.dataset.originKey);
    return true;
  }
  if (target.closest("[data-hud-v2-tab]")) {
    expandDockedMenu("actions");
    return true;
  }
  return false;
};

/** Esc while a screen is open; true when it handled the key. Foreign dialogs (effort sheet, trade view) handle their own. */
export const screenEscape = (deps: HudV2Deps): boolean => {
  if (!screen.id) return false;
  if (document.querySelector(".effort-confirm-overlay")) return true;
  if (screen.id === "diplomacy" && screen.diplomacyTargetId) {
    if (!document.querySelector(".diplomacy-trade-overlay")) {
      screen.diplomacyTargetId = undefined;
      renderScreen(deps);
    }
    return true;
  }
  closeScreen(deps);
  return true;
};
