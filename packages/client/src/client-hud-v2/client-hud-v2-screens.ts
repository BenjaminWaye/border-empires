// Screen router for the new HUD. Manifest, AFC upgrades, Diplomacy and Ranks
// share one full-screen frame over the darkened map; Chronicle is a drawer
// over the live map; town and battle have their own runtimes. Opening one
// hides the map HUD (CSS, keyed off body classes set in the context module).

import { counterOfferScreenInput } from "../client-alliance/client-alliance-counter-offer.js";
import { showCaptureAlert } from "../client-alerts/client-alerts.js";
import { diplomacyTradeDepsFor, openDiplomacyTradeScreen } from "../client-diplomacy-trade/client-diplomacy-trade.js";
import type { BuildingCategory } from "../client-tile-menu-building-category/client-tile-menu-building-category.js";
import type { TileActionDef } from "../client-types.js";
import { battleClick, battleEscape, renderBattle } from "./client-hud-v2-battle-runtime.js";
import { chronicleTabClick, loadChronicleTab, renderChronicle } from "./client-hud-v2-chronicle-runtime.js";
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
import { dealSkeletonHtml, diplomacyListHtml, empireStance } from "./client-hud-v2-diplomacy.js";
import { MANIFEST_LEGEND_HTML, manifestDetailHtml, manifestHeadRightHtml, manifestTreeHtml } from "./client-hud-v2-manifest.js";
import { profileHtml, type ProfileRelation } from "./client-hud-v2-profile.js";
import { ranksBannerHtml, ranksBodyHtml } from "./client-hud-v2-ranks.js";
import { expandDockedMenu, suppressAutoExpand } from "./client-hud-v2-tile-dock.js";
import { closeTownScreen, renderTownScreen, runTileActionOn, stepTown } from "./client-hud-v2-town-runtime.js";

const TITLES: Partial<Record<HudV2ScreenId, string>> = { manifest: "Manifest", afc: "AFC Upgrades", diplomacy: "Diplomacy", ranks: "The Duke's Seat" };

/** Which body is in the frame now, so the diplomacy deal (hosting foreign DOM) is never rewritten under itself. */
let bodyMode = "";

const nameOf = (deps: HudV2Deps, id: string): string => deps.state.playerNames.get(id) ?? "";

/** Screens a profile can be opened from and returns to when closed. */
const PROFILE_RETURNS: ReadonlySet<HudV2ScreenId> = new Set<HudV2ScreenId>(["manifest", "afc", "diplomacy", "ranks", "chronicle"]);
let profileReturn: HudV2ScreenId | undefined;

export const openScreen = (deps: HudV2Deps, id: HudV2ScreenId, options: { diplomacyTarget?: string } = {}): void => {
  if (screen.id === "town") deps.actionFlow.hideTileActionMenu();
  const from = screen.id;
  if (screen.id && screen.id !== id) closeScreen(deps, { toMap: true });
  if (id === "profile") profileReturn = from && PROFILE_RETURNS.has(from) ? from : undefined;
  if (id === "chronicle") {
    setScreen("chronicle", `<aside class="v2c-drawer" id="v2c-drawer" aria-label="Chronicle"></aside>`);
    screen.chronicleUpdatesBaseline = undefined;
    screen.chronicleOpenUpdate = undefined;
    loadChronicleTab(deps, screen.chronicleTab);
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

/** Closes the open screen. A profile goes back to the screen it was opened from unless `toMap`. */
export const closeScreen = (deps: HudV2Deps, options: { toMap?: boolean } = {}): void => {
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
  const back = id === "profile" && !options.toMap ? profileReturn : undefined;
  if (id === "profile") {
    deps.state.activePlayerProfileId = undefined;
    profileReturn = undefined;
  }
  document.querySelector(".diplomacy-trade-overlay")?.remove();
  screen.diplomacyTargetId = undefined;
  bodyMode = "";
  clearScreen();
  if (back) openScreen(deps, back);
  else deps.renderHud();
};

const ownedTechs = (deps: HudV2Deps): Set<string> => new Set(deps.state.techIds);

/** Shared tile links request a tech detail; desktop HUD v2 owns its destination. */
export const openRequestedTechDetail = (deps: HudV2Deps): void => {
  const { state } = deps;
  if (state.activePanel !== "tech" || !state.techDetailOpen || !state.techUiSelectedId) return;
  screen.manifestSelectedId = state.techUiSelectedId;
  const tech = state.techCatalog.find(entry => entry.id === state.techUiSelectedId);
  if (tech?.branch) screen.manifestClosedLanes.delete(tech.branch);
  state.techDetailOpen = false;
  openScreen(deps, "manifest");
  const nodes = document.getElementById("v2m-scroll")?.querySelectorAll<HTMLElement>("[data-v2-manifest-select]");
  nodes?.forEach(node => {
    if (node.dataset.v2ManifestSelect === screen.manifestSelectedId)
      node.scrollIntoView?.({ block: "nearest", inline: "center" });
  });
};

/** The tree is rebuilt only when what it shows changes, not on every HUD tick. */
let manifestKey = "";

const renderManifest = (deps: HudV2Deps): void => {
  const nextCost = deps.state.techCatalog.find((t) => !deps.state.techIds.includes(t.id))?.requirements.gold ?? 0;
  const key = [deps.state.techIds.join(","), deps.state.techChoices.join(","), deps.state.techCatalog.filter((t) => t.requirements.canResearch).length, deps.state.techCatalog.length, screen.manifestSelectedId, [...screen.manifestClosedLanes].join(","), deps.state.gold >= nextCost, nextCost, bodyMode].join("|");
  if (key === manifestKey) return;
  manifestKey = key;
  const owned = ownedTechs(deps);
  const techs = deps.state.techCatalog;
  const afcTier = Math.max(0, ...techs.filter((t) => owned.has(t.id)).map((t) => t.tier));
  const input = { techs, owned, selectedId: screen.manifestSelectedId, closedLanes: screen.manifestClosedLanes, gold: deps.state.gold, afcTier, choices: new Set(deps.state.techChoices) };
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
    colorOf: (id: string) => deps.ownerColor(id)
  };
  writeHtml("v2s-head-right", ranksBannerHtml(input));
  bodyMode = "ranks";
  writeHtml("v2s-body", ranksBodyHtml(input));
};

const renderDiplomacy = (deps: HudV2Deps): void => {
  const { state } = deps;
  const target = screen.diplomacyTargetId;
  writeHtml("v2s-head-right", "");
  if (!target) {
    bodyMode = "list";
    writeHtml("v2s-body", diplomacyListHtml({
      me: state.me,
      resourceOffers: state.resourceTradeOffers,
      resourceAgreements: state.resourceTradeAgreements,
      metPlayerIds: state.metPlayerIds,
      allies: state.allies,
      activeTruces: state.activeTruces,
      incomingAlliance: state.incomingAllianceRequests,
      incomingTruce: state.incomingTruceRequests,
      leaderboard: state.leaderboard.overall,
      nameOf: (id) => nameOf(deps, id),
      colorOf: (id) => deps.ownerColor(id),
      nowMs: Date.now()
    }));
    return;
  }
  if (bodyMode !== `deal:${target}`) {
    writeHtml("v2s-body", dealSkeletonHtml(nameOf(deps, target) || "Empire", dealFacts(deps, target)));
    bodyMode = `deal:${target}`;
    hostTradeView(deps, target);
  }
};

/** The relation and both tile counts, for the deal's top line (the trade view shows goods, not standing). */
const dealFacts = (deps: HudV2Deps, target: string): string => {
  const { state } = deps;
  const tilesOf = (id: string): number | undefined =>
    (state.leaderboard.overall.find((e) => e.id === id) ?? (id === state.me ? state.leaderboard.selfOverall : undefined))?.tiles;
  const stance = empireStance(target, { allies: state.allies, activeTruces: state.activeTruces, nowMs: Date.now() });
  const theirs = tilesOf(target), mine = tilesOf(state.me);
  return [stance.kind === "met" ? "" : stance.label, theirs === undefined ? "" : `${theirs.toLocaleString("en-US")} tiles`, mine === undefined ? "" : `you ${mine.toLocaleString("en-US")}`]
    .filter(Boolean)
    .join(" · ");
};

/** The alert title for a sent offer; undefined for anything else the deal view sends (e.g. its stance lookup on open). */
export const offerSentTitle = (payload: unknown, extendsTruce = false): string | undefined => {
  if (typeof payload !== "object" || payload === null || !("type" in payload)) return undefined;
  if (payload.type === "RESOURCE_TRADE_REQUEST") return "Resource trade offered";
  if (payload.type === "ALLIANCE_REQUEST") return "Alliance offered";
  if (payload.type !== "TRUCE_REQUEST") return undefined;
  const hours = "durationHours" in payload ? payload.durationHours : undefined;
  return `${extendsTruce ? "Truce extension" : "Truce"} offered${typeof hours === "number" ? ` · ${hours}h` : ""}`;
};

/** Opens the existing trade view and moves it into the deal's middle column; closing it returns to the list. */
const hostTradeView = (deps: HudV2Deps, targetId: string, input?: Parameters<typeof openDiplomacyTradeScreen>[0]): void => {
  const { state } = deps;
  const offer = input ?? { targetName: nameOf(deps, targetId), targetPlayerId: targetId, kind: state.resourceTradeHoldings ? "trade" as const : "truce" as const, durationHours: 24 as const };
  // The deal view closes on send; say the offer went out (the reply replaces this alert, above the screen).
  const send = (payload: unknown, notSignedInMessage: string): boolean => {
    const sent = deps.sendGameMessage(payload, notSignedInMessage);
    const title = sent ? offerSentTitle(payload, state.activeTruces.some((t) => t.otherPlayerId === targetId && t.endsAt > Date.now())) : undefined;
    if (title) showCaptureAlert(state, title, `Waiting for ${offer.targetName}`, "success");
    return sent;
  };
  openDiplomacyTradeScreen(offer, diplomacyTradeDepsFor(state, send));
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


const profileRelation = (state: HudV2Deps["state"], id: string): ProfileRelation => {
  if (id === state.me) return { kind: "self" };
  if (state.allies.includes(id)) return { kind: "ally" };
  const truce = state.activeTruces.find((t) => t.otherPlayerId === id && t.endsAt > Date.now());
  return truce ? { kind: "truce", endsAt: truce.endsAt } : { kind: "none" };
};

const renderProfile = (deps: HudV2Deps): void => {
  const { state } = deps;
  const id = state.activePlayerProfileId;
  if (!id) return;
  const self = id === state.me;
  const social = state.socialViewByPlayerId.get(id);
  const name = nameOf(deps, id) || "Empire";
  writeHtml("v2s-title", self ? "Your Empire" : "Profile");
  writeHtml("v2s-back-label", profileReturn ? TITLES[profileReturn] ?? "Chronicle" : "Map");
  bodyMode = "profile";
  writeHtml("v2s-body", profileHtml({
    id,
    name,
    color: deps.ownerColor(id),
    relation: profileRelation(state, id),
    entry: state.leaderboard.overall.find((e) => e.id === id),
    career: state.careerStatsByPlayerId.get(id),
    holdings: state.galaxyHoldingsByPlayerId.get(id),
    pacts: self ? { allies: state.allies, activeTruces: state.activeTruces } : social,
    truceBreaks: self ? state.truceBreaksThisSeason : social === "loading" || social === undefined ? social : social.truceBreaksThisSeason,
    nameOf: (other) => nameOf(deps, other) || undefined,
    nowMs: Date.now()
  }));
};

/** Panels opened from the always-visible bar or orb, which sit above an open screen instead of being closed by it. */
const SCREEN_SAFE_PANELS: ReadonlySet<string> = new Set(["settings", "manpower", "economy", "defensibility"]);

/** Renders the open screen; called on the HUD's timer and after clicks. */
export const renderScreen = (deps: HudV2Deps): void => {
  // Legacy flows (a commission, a request) can reopen their side panel; the open screen replaces it.
  if (screen.id && screen.id !== "afc" && screen.id !== "town" && deps.state.activePanel && !SCREEN_SAFE_PANELS.has(deps.state.activePanel)) {
    deps.state.activePanel = null;
    deps.renderHud();
  }
  switch (screen.id) {
    case "manifest": return renderManifest(deps);
    case "ranks": return renderRanks(deps);
    case "diplomacy": return renderDiplomacy(deps);
    case "chronicle": return renderChronicle(deps);
    case "town": return renderTownScreen(deps);
    case "battle": return renderBattle(deps);
    case "profile": return renderProfile(deps);
    case "afc":
      if (deps.state.activePanel !== "domains") closeScreen(deps);
      return;
    default:
      return;
  }
};

const respondToRequest = (deps: HudV2Deps, kind: "alliance" | "truce", verb: "ACCEPT" | "REJECT", requestId: string): void => {
  const type = `${kind === "alliance" ? "ALLIANCE" : "TRUCE"}_${verb}`;
  deps.sendGameMessage({ type, requestId, ...(verb === "ACCEPT" ? {confirmedResourceSupply:true} : {}) }, kind === "alliance" ? "Finish sign-in before responding to alliance requests." : "Finish sign-in before responding to truces.");
};

/** Clicks inside an open screen; true when handled. */
export const screenClick = (deps: HudV2Deps, target: Element): boolean => {
  if (!screen.id) return false;
  if (screen.id === "battle" && battleClick(deps, target)) return true;
  if (target.closest("[data-v2-close]")) {
    closeScreen(deps);
    return true;
  }
  const diplomacyWith = target.closest<HTMLElement>("[data-v2-profile-diplomacy]")?.dataset.v2ProfileDiplomacy;
  if (diplomacyWith) {
    openScreen(deps, "diplomacy", { diplomacyTarget: diplomacyWith });
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
  // Building and ability chips open the same info card the old tech panel did (it draws above screens).
  const info = target.closest<HTMLElement>("[data-v2-info-structure], [data-v2-info-ability]");
  if (info) {
    deps.state.structureInfoKey = info.dataset.v2InfoStructure ?? "";
    deps.state.crystalAbilityInfoKey = info.dataset.v2InfoAbility ?? "";
    deps.renderHud();
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
    writeHtml("v2s-body", dealSkeletonHtml(input.targetName, input.targetPlayerId ? dealFacts(deps, input.targetPlayerId) : ""));
    bodyMode = `deal:${input.targetPlayerId}`;
    hostTradeView(deps, input.targetPlayerId, input);
    renderScreen(deps);
    return true;
  }
  if (chronicleTabClick(deps, target)) return true;
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
  const category = target.closest<HTMLElement>("[data-v2-build-category]");
  if (category) {
    screen.townCategory = category.dataset.v2BuildCategory as BuildingCategory;
    screen.townBuildSelection = undefined;
    renderTownScreen(deps);
    return true;
  }
  const build = target.closest<HTMLElement>("[data-v2-build-pick]");
  if (build) {
    screen.townBuildSelection = build.dataset.v2BuildPick;
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
  if (document.querySelector(".effort-confirm-overlay, .break-pact-overlay")) return true;
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
