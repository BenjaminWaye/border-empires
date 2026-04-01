import "./style.css";
import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  updateProfile,
  type User
} from "firebase/auth";
import {
  CHUNK_SIZE,
  DEVELOPMENT_PROCESS_LIMIT,
  ECONOMIC_STRUCTURE_BUILD_MS,
  FORT_BUILD_MS,
  FORT_DEFENSE_MULT,
  FRONTIER_CLAIM_COST,
  FRONTIER_CLAIM_MS,
  OBSERVATORY_BUILD_MS,
  SETTLE_COST,
  SETTLE_MS,
  SIEGE_OUTPOST_ATTACK_MULT,
  SIEGE_OUTPOST_BUILD_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  exposureRatio,
  grassShadeAt,
  landBiomeAt,
  setWorldSeed,
  structureBuildGoldCost,
  structureCostDefinition,
  terrainAt
} from "@border-empires/shared";
import {
  COLLECT_VISIBLE_COOLDOWN_MS,
  GUIDE_AUTO_OPEN_STORAGE_KEY,
  GUIDE_STORAGE_KEY,
  MAX_ZOOM,
  MIN_ZOOM,
  OBSERVATORY_PROTECTION_RADIUS,
  OBSERVATORY_VISION_BONUS,
  canAffordCost,
  formatGoldAmount,
  frontierClaimCostLabelForTile,
  frontierClaimDurationMsForTile,
  guideSteps,
  isForestTile,
  settleDurationMsForTile
} from "./client-constants.js";
import { initClientDom } from "./client-dom.js";
import { tileActionMenuHtml } from "./client-tile-menu-html.js";
import {
  allianceRequestsHtml,
  alliesHtml,
  feedHtml,
  leaderboardHtml,
  missionCardsHtml,
  strategicRibbonHtml
} from "./client-panel-html.js";
import { createInitialState, storageSet } from "./client-state.js";
import { domainOwnedHtml, formatDomainBenefitSummary, formatTechBenefitSummary, techCurrentModsHtml, techOwnedHtml } from "./client-tech-html.js";
import type {
  AllianceRequest,
  CrystalTargetingAbility,
  DockPair,
  DomainInfo,
  EmpireVisualStyle,
  FeedEntry,
  FeedSeverity,
  FeedType,
  LeaderboardMetricEntry,
  LeaderboardOverallEntry,
  MissionState,
  OptimisticStructureKind,
  SeasonVictoryObjectiveView,
  SeasonWinnerView,
  TechInfo,
  Tile,
  TileMenuProgressView,
  TileMenuTab,
  TileMenuView,
  TileOverviewLine,
  TileTimedProgress
} from "./client-types.js";

const formatManpowerAmount = (value: number): string => Math.round(value).toString();

const {
  allianceBreakBtn,
  allianceBreakIdEl,
  allianceRequestsEl,
  allianceSendBtn,
  allianceTargetEl,
  alliesListEl,
  authColorPresetButtons,
  authBusyCopyEl,
  authBusyModalEl,
  authBusyTitleEl,
  authDisplayNameEl,
  authEmailEl,
  authEmailLinkBtn,
  authEmailResetBtn,
  authEmailSentAddressEl,
  authGoogleBtn,
  authLoginBtn,
  authOverlayEl,
  authPanelEl,
  authPasswordEl,
  authProfileColorEl,
  authProfileNameEl,
  authProfileSaveBtn,
  authRegisterBtn,
  authStatusEl,
  canvas,
  captureBarEl,
  captureCancelBtn,
  captureCardEl,
  captureTargetEl,
  captureTimeEl,
  captureTitleEl,
  captureWrapEl,
  centerMeBtn,
  centerMeDesktopBtn,
  collectVisibleDesktopBtn,
  collectVisibleDesktopMetaEl,
  collectVisibleMobileBtn,
  collectVisibleMobileMetaEl,
  ctx,
  feedEl,
  guideOverlayEl,
  holdBuildMenuEl,
  hoverEl,
  hud,
  leaderboardEl,
  mapLoadingMetaEl,
  mapLoadingOverlayEl,
  mapLoadingRowEl,
  mapLoadingSpinnerEl,
  mapLoadingTitleEl,
  miniMapBase,
  miniMapCtx,
  miniMapEl,
  miniMapLabelEl,
  miniMapWrapEl,
  missionsEl,
  mobileAllianceBreakBtn,
  mobileAllianceBreakIdEl,
  mobileAllianceRequestsEl,
  mobileAllianceSendBtn,
  mobileAllianceTargetEl,
  mobileAlliesListEl,
  mobileCoreEl,
  mobileCoreHelpEl,
  mobilePanelDefensibilityEl,
  mobileFeedEl,
  mobileLeaderboardEl,
  mobilePanelCoreEl,
  mobilePanelEconomyEl,
  mobilePanelIntelEl,
  mobilePanelMissionsEl,
  mobilePanelSocialEl,
  mobilePanelTechEl,
  mobileSheetEl,
  mobileSheetHeadEl,
  mobileTechChoiceDetailsEl,
  mobileTechChoicesGridEl,
  mobileTechChooseBtn,
  mobileTechCurrentModsEl,
  mobileTechDetailCardEl,
  mobileTechDomainsEl,
  mobileTechOwnedEl,
  mobileTechPickEl,
  mobileTechPointsEl,
  mobileTechTreeExpandToggleEl,
  panelActionButtons,
  panelAllianceEl,
  panelCloseBtn,
  panelDefensibilityEl,
  panelEconomyEl,
  panelFeedEl,
  panelLeaderboardEl,
  panelMissionsEl,
  panelSettingsEl,
  panelSettingsPreviewEl,
  panelTechEl,
  panelTitleEl,
  selectedEl,
  sidePanelBodyEl,
  sidePanelEl,
  statsChipsEl,
  targetingOverlayEl,
  techChoiceDetailsEl,
  techChoicesGridEl,
  techChooseBtn,
  techCurrentModsEl,
  techDetailCardEl,
  techDomainsEl,
  techOwnedEl,
  techPickEl,
  techPointsEl,
  techTreeExpandToggleEl,
  tileActionMenuEl
} = initClientDom();

const state = createInitialState();

const toggleExpandedModKey = (modKey: "attack" | "defense" | "income" | "vision"): void => {
  state.expandedModKey = state.expandedModKey === modKey ? null : modKey;
  techCurrentModsEl.innerHTML = techCurrentModsHtml(state.mods, state.expandedModKey, state.modBreakdown);
  mobileTechCurrentModsEl.innerHTML = techCurrentModsHtml(state.mods, state.expandedModKey, state.modBreakdown);
};

const handleTechModChipClick = (ev: Event): void => {
  const target = ev.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest<HTMLElement>("[data-mod-chip]");
  if (!button) return;
  const modKey = button.dataset.modChip;
  if (modKey === "attack" || modKey === "defense" || modKey === "income" || modKey === "vision") {
    toggleExpandedModKey(modKey);
  }
};

techCurrentModsEl.addEventListener("click", handleTechModChipClick);
mobileTechCurrentModsEl.addEventListener("click", handleTechModChipClick);

const firebaseConfig = (() => {
  const apiKey = (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) ?? "AIzaSyCJP6fuxWLAHykFOTWDyxnkaNVnVAlNX8g";
  const authDomain = (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ?? "border-empires.firebaseapp.com";
  const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? "border-empires";
  const appId = (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) ?? "1:979056688511:web:d0af9a130d6eabacf36e4a";
  if (!apiKey || !authDomain || !projectId || !appId) return undefined;
  const config: FirebaseOptions = { apiKey, authDomain, projectId, appId };
  const storageBucket = (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ?? "border-empires.firebasestorage.app";
  const messagingSenderId = (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) ?? "979056688511";
  const measurementId = (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined) ?? "G-8FH65YL4QD";
  if (storageBucket) config.storageBucket = storageBucket;
  if (messagingSenderId) config.messagingSenderId = messagingSenderId;
  if (measurementId) config.measurementId = measurementId;
  return config;
})();

const firebaseApp = firebaseConfig ? (getApps()[0] ?? initializeApp(firebaseConfig)) : undefined;
const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : undefined;
const googleProvider = firebaseAuth ? new GoogleAuthProvider() : undefined;
let authToken = "";
let authUid = "";
let authEmailLinkSentTo = "";
let authEmailLinkPending = false;
const EMAIL_LINK_STORAGE_KEY = "be_auth_email_link";
miniMapBase.width = miniMapEl.width;
miniMapBase.height = miniMapEl.height;
const miniMapBaseCtx = miniMapBase.getContext("2d");
if (!miniMapBaseCtx) throw new Error("missing minimap base context");
let miniMapBaseReady = false;
let miniMapLastDrawCamX = Number.NaN;
let miniMapLastDrawCamY = Number.NaN;
let miniMapLastDrawZoom = Number.NaN;
let miniMapLastDrawAt = 0;
const TERRAIN_COLOR_CACHE_LIMIT = 120_000;
const terrainColorCache = new Map<string, string>();
const terrainColorCacheOrder: string[] = [];
const clearRenderCaches = (): void => {
  terrainColorCache.clear();
  terrainColorCacheOrder.length = 0;
  state.dockRouteCache.clear();
  miniMapBaseReady = false;
  miniMapLastDrawCamX = Number.NaN;
  miniMapLastDrawCamY = Number.NaN;
  miniMapLastDrawZoom = Number.NaN;
};

const key = (x: number, y: number): string => `${x},${y}`;
const parseKey = (k: string): { x: number; y: number } => {
  const [xs, ys] = k.split(",");
  return { x: Number(xs), y: Number(ys) };
};
type BuildableStructureId = "FORT" | "OBSERVATORY" | "SIEGE_OUTPOST" | NonNullable<Tile["economicStructure"]>["type"];
const ownedStructureCount = (structureType: BuildableStructureId): number => {
  let count = 0;
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me) continue;
    if (structureType === "FORT" && tile.fort) count += 1;
    else if (structureType === "OBSERVATORY" && tile.observatory) count += 1;
    else if (structureType === "SIEGE_OUTPOST" && tile.siegeOutpost) count += 1;
    else if (tile.economicStructure?.type === structureType) count += 1;
  }
  return count;
};
const structureGoldCost = (structureType: BuildableStructureId): number => structureBuildGoldCost(structureType, ownedStructureCount(structureType));
const structureCostText = (structureType: BuildableStructureId, resourceOverride?: string): string => {
  const def = structureCostDefinition(structureType);
  const goldCost = structureGoldCost(structureType);
  if (resourceOverride) return `${goldCost} gold + ${resourceOverride}`;
  if (def.resourceCost) return `${goldCost} gold + ${def.resourceCost.amount} ${def.resourceCost.resource}`;
  return `${goldCost} gold`;
};
const wrapX = (x: number): number => (x + WORLD_WIDTH) % WORLD_WIDTH;
const wrapY = (y: number): number => (y + WORLD_HEIGHT) % WORLD_HEIGHT;
const FULL_MAP_CHUNK_RADIUS = Math.max(Math.ceil(WORLD_WIDTH / CHUNK_SIZE / 2), Math.ceil(WORLD_HEIGHT / CHUNK_SIZE / 2));
type TileVisibilityState = "unexplored" | "fogged" | "visible";
const tileVisibilityStateAt = (x: number, y: number, tile?: Tile): TileVisibilityState => {
  if (state.fogDisabled) return "visible";
  const k = key(x, y);
  if (!state.discoveredTiles.has(k)) return "unexplored";
  if (!tile || tile.fogged) return "fogged";
  return "visible";
};
const worldIndex = (x: number, y: number): number => y * WORLD_WIDTH + x;
const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const ownerColor = (ownerId: string): string => {
  if (ownerId === "barbarian") return "#2f3842";
  const h = hashString(ownerId) % 360;
  return `hsl(${h} 70% 48%)`;
};
const effectiveColor = (ownerId: string): string => state.playerColors.get(ownerId) ?? ownerColor(ownerId);
const visualStyleForOwner = (ownerId: string): EmpireVisualStyle | undefined => state.playerVisualStyles.get(ownerId);
const playerNameForOwner = (ownerId?: string | null): string | undefined => {
  if (!ownerId) return undefined;
  if (ownerId === state.me) return state.meName || "you";
  if (ownerId === "barbarian") return "Barbarians";
  return state.playerNames.get(ownerId);
};
const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => `${c}${c}`).join("") : clean;
  const value = Number.parseInt(full, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
};
const rgbToHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const blendHex = (base: string, target: string, amount: number): string => {
  if (!base.startsWith("#") || !target.startsWith("#")) return base;
  const a = hexToRgb(base);
  const b = hexToRgb(target);
  return rgbToHex(a.r + (b.r - a.r) * amount, a.g + (b.g - a.g) * amount, a.b + (b.b - a.b) * amount);
};
const tintTargetForStyle = (style: EmpireVisualStyle | undefined): string | undefined => {
  if (!style) return undefined;
  if (style.secondaryTint === "IRON") return "#3d4755";
  if (style.secondaryTint === "SUPPLY") return "#6b4f2e";
  if (style.secondaryTint === "FOOD") return "#718b42";
  if (style.secondaryTint === "CRYSTAL") return "#4677b8";
  return undefined;
};
const effectiveOverlayColor = (ownerId: string): string => {
  const base = effectiveColor(ownerId);
  const tint = tintTargetForStyle(visualStyleForOwner(ownerId));
  return tint ? blendHex(base, tint, 0.24) : base;
};
const borderColorForOwner = (ownerId: string, stateName?: Tile["ownershipState"]): string => {
  if (ownerId === "barbarian") return "rgba(95, 108, 122, 0.8)";
  const style = visualStyleForOwner(ownerId);
  if (!style) return stateName === "FRONTIER" ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.55)";
  if (style.borderStyle === "HEAVY") return "rgba(58, 66, 82, 0.9)";
  if (style.borderStyle === "DASHED") return "rgba(198, 167, 112, 0.82)";
  if (style.borderStyle === "SOFT") return "rgba(176, 221, 133, 0.88)";
  if (style.borderStyle === "GLOW") return "rgba(126, 208, 255, 0.92)";
  return stateName === "FRONTIER" ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.55)";
};
const shouldDrawOwnershipBorder = (tile: Tile): boolean => {
  if (!tile.ownerId || tile.ownershipState === "FRONTIER") return false;
  if (tile.ownerId === "barbarian") return true;
  const style = visualStyleForOwner(tile.ownerId);
  return Boolean(style && style.borderStyle !== "SHARP");
};
const borderLineWidthForOwner = (ownerId: string, stateName?: Tile["ownershipState"]): number => {
  const style = visualStyleForOwner(ownerId);
  if (!style) return stateName === "SETTLED" ? 2 : 1;
  if (style.borderStyle === "HEAVY") return 3;
  if (style.borderStyle === "GLOW") return 2.5;
  if (style.borderStyle === "SOFT") return 2.25;
  return stateName === "SETTLED" ? 2 : 1.5;
};
const sharesBorderTerritory = (tile: Tile, neighbor?: Tile): boolean => {
  if (!neighbor) return false;
  if (neighbor.fogged) return false;
  if (neighbor.ownerId !== tile.ownerId) return false;
  return neighbor.ownershipState === tile.ownershipState;
};
const drawExposedTileBorder = (tile: Tile, px: number, py: number, size: number): void => {
  const top = state.tiles.get(key(wrapX(tile.x), wrapY(tile.y - 1)));
  const right = state.tiles.get(key(wrapX(tile.x + 1), wrapY(tile.y)));
  const bottom = state.tiles.get(key(wrapX(tile.x), wrapY(tile.y + 1)));
  const left = state.tiles.get(key(wrapX(tile.x - 1), wrapY(tile.y)));
  const x1 = px + 1;
  const y1 = py + 1;
  const x2 = px + size - 2;
  const y2 = py + size - 2;
  ctx.beginPath();
  if (!sharesBorderTerritory(tile, top)) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y1);
  }
  if (!sharesBorderTerritory(tile, right)) {
    ctx.moveTo(x2, y1);
    ctx.lineTo(x2, y2);
  }
  if (!sharesBorderTerritory(tile, bottom)) {
    ctx.moveTo(x2, y2);
    ctx.lineTo(x1, y2);
  }
  if (!sharesBorderTerritory(tile, left)) {
    ctx.moveTo(x1, y2);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
};
const structureAccentColor = (ownerId: string, fallback: string): string => {
  const style = visualStyleForOwner(ownerId);
  if (!style) return fallback;
  if (style.structureAccent === "IRON") return "rgba(160, 176, 196, 0.96)";
  if (style.structureAccent === "SUPPLY") return "rgba(232, 176, 94, 0.95)";
  if (style.structureAccent === "FOOD") return "rgba(176, 233, 122, 0.95)";
  if (style.structureAccent === "CRYSTAL") return "rgba(131, 221, 255, 0.95)";
  return fallback;
};
const shortOwnerHistoryLabel = (ownerId?: string | null): string => {
  if (!ownerId) return "Unknown";
  if (ownerId === state.me) return "you";
  if (ownerId === "barbarian") return "Barbarians";
  return playerNameForOwner(ownerId) ?? `Empire ${ownerId.slice(0, 8)}`;
};
const tileHistoryLines = (tile: Tile): string[] => {
  const history = tile.history;
  if (!history) return [];
  const lines: string[] = [];
  const currentStructureType =
    tile.fort
      ? "FORT"
      : tile.siegeOutpost
        ? "SIEGE_OUTPOST"
        : tile.observatory
          ? "OBSERVATORY"
          : tile.economicStructure?.type;
  if (history.captureCount > 0) lines.push(`Captured ${history.captureCount} time${history.captureCount === 1 ? "" : "s"}`);
  if (history.lastOwnerId) lines.push(`Last held by ${shortOwnerHistoryLabel(history.lastOwnerId)}`);
  if (history.wasMountainCreatedByPlayer) lines.push("Artificial mountain");
  if (history.wasMountainRemovedByPlayer) lines.push("Former mountain pass");
  if (history.lastStructureType && history.lastStructureType !== currentStructureType) {
    const label =
      history.lastStructureType === "FORT"
        ? "Former Fort site"
        : history.lastStructureType === "SIEGE_OUTPOST"
          ? "Former Siege Outpost site"
          : history.lastStructureType === "OBSERVATORY"
            ? "Former Observatory site"
            : history.lastStructureType === "FARMSTEAD"
              ? "Former Farmstead site"
              : history.lastStructureType === "CAMP"
                ? "Former Camp site"
                : history.lastStructureType === "MINE"
                  ? "Former Mine site"
                  : history.lastStructureType === "MARKET"
                    ? "Former Market site"
                    : history.lastStructureType === "GRANARY"
                      ? "Former Granary site"
                      : history.lastStructureType === "BANK"
                        ? "Former Bank site"
                        : history.lastStructureType === "AIRPORT"
                          ? "Former Airport site"
                          : history.lastStructureType === "QUARTERMASTER"
                            ? "Former Quartermaster site"
                            : history.lastStructureType === "IRONWORKS"
                              ? "Former Ironworks site"
                              : history.lastStructureType === "CRYSTAL_SYNTHESIZER"
                                ? "Former Crystal Synthesizer site"
                                : history.lastStructureType === "FUEL_PLANT"
                                  ? "Former Fuel Plant site"
                                  : history.lastStructureType === "FOUNDRY"
                                    ? "Former Foundry site"
                                    : history.lastStructureType === "GOVERNORS_OFFICE"
                                      ? "Former Governor's Office site"
                                      : "Former Radar System site";
    lines.push(label);
  }
  return lines;
};
const economicStructureIcon = (type: Tile["economicStructure"] extends infer T ? T extends { type: infer U } ? U : never : never): string => {
  if (type === "FARMSTEAD") return "▥";
  if (type === "CAMP") return "⛺";
  if (type === "MINE") return "⛏";
  if (type === "GRANARY") return "◫";
  return "▣";
};
const economicStructureName = (type: Tile["economicStructure"] extends infer T ? T extends { type: infer U } ? U : never : never): string => {
  if (type === "FARMSTEAD") return "Farmstead";
  if (type === "CAMP") return "Camp";
  if (type === "MINE") return "Mine";
  if (type === "GRANARY") return "Granary";
  if (type === "BANK") return "Bank";
  if (type === "AIRPORT") return "Airport";
  if (type === "CARAVANARY") return "Caravanary";
  if (type === "QUARTERMASTER") return "Quartermaster";
  if (type === "IRONWORKS") return "Ironworks";
  if (type === "CRYSTAL_SYNTHESIZER") return "Crystal Synthesizer";
  if (type === "FUEL_PLANT") return "Fuel Plant";
  if (type === "FOUNDRY") return "Foundry";
  if (type === "GARRISON_HALL") return "Garrison Hall";
  if (type === "CUSTOMS_HOUSE") return "Customs House";
  if (type === "GOVERNORS_OFFICE") return "Governor's Office";
  if (type === "RADAR_SYSTEM") return "Radar System";
  return "Market";
};

const economicStructureBenefitText = (type: Tile["economicStructure"] extends infer T ? T extends { type: infer U } ? U : never : never): string => {
  if (type === "MARKET") return "Nearby town: +50% fed gold output and +50% gold storage cap.";
  if (type === "GRANARY") return "Nearby town: +20% population growth and +20% gold storage cap.";
  if (type === "BANK") return "Nearby town: +50% city income and +1 flat income.";
  if (type === "AIRPORT") return "Launches oil-fueled bombardment against enemy territory.";
  if (type === "CARAVANARY") return "Boosts the nearby town's connected-town income bonus by 25%.";
  if (type === "QUARTERMASTER") return "Converts gold into steady supply output.";
  if (type === "IRONWORKS") return "Converts gold into steady iron output.";
  if (type === "CRYSTAL_SYNTHESIZER") return "Converts gold into steady crystal output.";
  if (type === "FUEL_PLANT") return "Converts gold into steady oil output.";
  if (type === "FOUNDRY") return "Doubles active mine output in a 10-tile radius.";
  if (type === "GARRISON_HALL") return "Boosts settled-tile defense by 20% in a 10-tile radius.";
  if (type === "CUSTOMS_HOUSE") return "Boosts income from a nearby dock by 50%.";
  if (type === "GOVERNORS_OFFICE") return "Reduces food and settled-tile upkeep in a 10-tile radius.";
  if (type === "RADAR_SYSTEM") return "Blocks enemy airport bombardment in a 30-tile radius.";
  if (type === "FARMSTEAD") return "Improves food output on this tile.";
  if (type === "CAMP") return "Improves supply output on this tile.";
  if (type === "MINE") return "Improves iron or crystal output on this tile.";
  return "Strengthens this tile's economy.";
};

type StructureInfoKey =
  | "FORT"
  | "OBSERVATORY"
  | "FARMSTEAD"
  | "CAMP"
  | "MINE"
  | "MARKET"
  | "GRANARY"
  | "BANK"
  | "CARAVANARY"
  | "QUARTERMASTER"
  | "IRONWORKS"
  | "CRYSTAL_SYNTHESIZER"
  | "FUEL_PLANT"
  | "FOUNDRY"
  | "CUSTOMS_HOUSE"
  | "GOVERNORS_OFFICE"
  | "GARRISON_HALL"
  | "AIRPORT"
  | "RADAR_SYSTEM"
  | "SIEGE_OUTPOST";

const structureInfoForKey = (type: StructureInfoKey): { title: string; detail: string } => {
  if (type === "FORT") return { title: "Fort", detail: "Forts add fortified defense on border or dock tiles. An active fort also stops that origin tile from being counter-taken when your attack fails." };
  if (type === "OBSERVATORY") return { title: "Observatory", detail: "Observatories add local vision and project a protection field that blocks hostile crystal actions in the area." };
  if (type === "FARMSTEAD") return { title: "Farmstead", detail: "Farmsteads increase food yield on farm and fish tiles by 50%." };
  if (type === "CAMP") return { title: "Camp", detail: "Camps increase supply yield on wood and fur tiles by 50%." };
  if (type === "MINE") return { title: "Mine", detail: "Mines increase iron or crystal yield on mineral tiles by 50%." };
  if (type === "MARKET") return { title: "Market", detail: "Markets are built on a support tile for a town. They increase that fed town's gold output by 50% and its gold storage cap by 50%." };
  if (type === "GRANARY") return { title: "Granary", detail: "Granaries are built on a support tile for a town. They increase that town's population growth and gold storage cap by 20%." };
  if (type === "BANK") return { title: "Bank", detail: "Banks are built on a support tile for a town. They increase city income by 50% and add +1 flat income." };
  if (type === "CARAVANARY") return { title: "Caravanary", detail: "Caravanaries are built on a support tile for a town. They increase that town's connected-town income bonus by 25%." };
  if (type === "QUARTERMASTER") return { title: "Quartermaster", detail: "Quartermasters convert heavy gold upkeep into steady supply output on a support tile." };
  if (type === "IRONWORKS") return { title: "Ironworks", detail: "Ironworks convert heavy gold upkeep into steady iron output on a support tile." };
  if (type === "CRYSTAL_SYNTHESIZER") return { title: "Crystal Synthesizer", detail: "Crystal Synthesizers convert heavy gold upkeep into steady crystal output on a support tile." };
  if (type === "FUEL_PLANT") return { title: "Fuel Plant", detail: "Fuel plants convert heavy gold upkeep into steady oil output on a support tile." };
  if (type === "FOUNDRY") return { title: "Foundry", detail: "Foundries double active mine output within 10 tiles." };
  if (type === "CUSTOMS_HOUSE") return { title: "Customs House", detail: "Customs houses are built beside a dock and increase that dock's income by 50%." };
  if (type === "GOVERNORS_OFFICE") return { title: "Governor's Office", detail: "Governor's offices reduce local town food upkeep and settled-tile upkeep within 10 tiles." };
  if (type === "GARRISON_HALL") return { title: "Garrison Hall", detail: "Garrison halls increase settled-tile defense by 20% within 10 tiles." };
  if (type === "AIRPORT") return { title: "Airport", detail: "Airports launch oil-fueled bombardments against enemy territory within 30 tiles." };
  if (type === "RADAR_SYSTEM") return { title: "Radar System", detail: "Radar systems block enemy airport bombardment within 30 tiles and reveal the origin." };
  return { title: "Siege Outpost", detail: "Siege outposts are offensive staging structures for border tiles. They improve attacks launched from their tile." };
};

const structureInfoButtonHtml = (type: StructureInfoKey, label?: string): string =>
  `<button class="inline-info-link" type="button" data-structure-info="${type}">${label ?? structureInfoForKey(type).title}</button>`;

const ownedSpecialSiteCount = (): number => {
  let count = 0;
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me) continue;
    if (tile.town || tile.dockId || tile.resource) count += 1;
  }
  return count;
};

const wrappedTileDistance = (x: number, y: number, focus: { x: number; y: number }): number => {
  const dx = Math.min(Math.abs(x - focus.x), WORLD_WIDTH - Math.abs(x - focus.x));
  const dy = Math.min(Math.abs(y - focus.y), WORLD_HEIGHT - Math.abs(y - focus.y));
  return dx + dy;
};

const firstCaptureGuidanceTarget = (): { tile: Tile; label: string } | undefined => {
  if (!state.authSessionReady) return undefined;
  if (ownedSpecialSiteCount() > 0) return undefined;
  const focus = state.homeTile ?? state.selected ?? { x: Math.round(state.camX), y: Math.round(state.camY) };
  const targets = [...state.tiles.values()]
    .filter((tile) => !tile.fogged && tile.terrain === "LAND" && tile.ownerId !== state.me && !isTileOwnedByAlly(tile))
    .filter((tile) => tile.town || tile.dockId || tile.resource)
    .map((tile) => {
      const reachable = Boolean(pickOriginForTarget(tile.x, tile.y, false)) || Boolean(tile.dockId);
      const label = tile.town
        ? "Capture a town"
        : tile.dockId
          ? "Capture a dock"
          : `Capture ${prettyToken(resourceLabel(tile.resource!)).toLowerCase()}`;
      const kindRank = tile.town ? 0 : tile.dockId ? 1 : 2;
      return { tile, label, reachable, kindRank, distance: wrappedTileDistance(tile.x, tile.y, focus) };
    })
    .sort((a, b) => Number(b.reachable) - Number(a.reachable) || a.kindRank - b.kindRank || a.distance - b.distance);
  return targets[0] ? { tile: targets[0].tile, label: targets[0].label } : undefined;
};

const displayTownGoldPerMinute = (tile: Tile): number => {
  if (!tile.town) return 0;
  return tile.town.goldPerMinute;
};

const strategicResourceKeyForTile = (tile: Tile): "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | undefined => {
  if (tile.resource === "FARM" || tile.resource === "FISH") return "FOOD";
  if (tile.resource === "IRON") return "IRON";
  if (tile.resource === "GEMS") return "CRYSTAL";
  if (tile.resource === "WOOD" || tile.resource === "FUR") return "SUPPLY";
  return undefined;
};

const storedYieldSummary = (tile: Tile): string => {
  const parts: string[] = [];
  const gold = tile.yield?.gold ?? 0;
  const goldCap = tile.yieldCap?.gold ?? 0;
  const canStoreGold = Boolean(tile.town || tile.dockId || (tile.yieldRate?.goldPerMinute ?? 0) > 0.01 || gold > 0.01);
  if (canStoreGold && (gold > 0.01 || goldCap > 0)) {
    parts.push(`${resourceIconForKey("GOLD")} ${gold.toFixed(1)} / ${goldCap.toFixed(0)}`);
  }
  const strategicCap = tile.yieldCap?.strategicEach ?? 0;
  const strategicEntries = new Map<string, number>(
    Object.entries(tile.yield?.strategic ?? {}).map(([resource, value]) => [resource, Number(value)])
  );
  const primaryStrategic = strategicResourceKeyForTile(tile);
  if (primaryStrategic && strategicCap > 0 && !strategicEntries.has(primaryStrategic)) strategicEntries.set(primaryStrategic, 0);
  for (const [resource, value] of strategicEntries) {
    if (Number(value) <= 0.01 && strategicCap <= 0) continue;
    parts.push(`${resourceIconForKey(resource)} ${Number(value).toFixed(2)} / ${strategicCap.toFixed(1)}`);
  }
  return parts.join(" · ");
};

const inspectionHtmlForTile = (tile: Tile): string => {
  const ownerLabel = tile.ownerId ? (playerNameForOwner(tile.ownerId) ?? tile.ownerId.slice(0, 8)) : "neutral";
  const tags = [
    tile.ownershipState ? prettyToken(tile.ownershipState) : "",
    tile.regionType ? prettyToken(tile.regionType) : "",
    tile.clusterType ? prettyToken(tile.clusterType) : "",
    tile.capital ? "Capital" : "",
    tile.dockId ? "Dock" : "",
    tile.fort ? `Fort ${prettyToken(tile.fort.status)}` : "",
    tile.observatory ? `Observatory ${prettyToken(tile.observatory.status)}` : "",
    tile.economicStructure ? `${economicStructureName(tile.economicStructure.type)} ${prettyToken(tile.economicStructure.status)}` : "",
    hostileObservatoryProtectingTile(tile) ? "Protected Field" : "",
    tile.siegeOutpost ? `Siege ${prettyToken(tile.siegeOutpost.status)}` : "",
    tile.sabotage && tile.sabotage.endsAt > Date.now() ? `Sabotaged ${Math.ceil((tile.sabotage.endsAt - Date.now()) / 60000)}m` : "",
    tile.breachShockUntil && tile.breachShockUntil > Date.now() ? "Breach-shocked" : ""
  ].filter(Boolean);
  const townBits: string[] = [];
  let upkeepLine = "";
  if (tile.town) {
    const growthPct =
      tile.town.population > 0 && typeof tile.town.populationGrowthPerMinute === "number"
        ? (tile.town.populationGrowthPerMinute / tile.town.population) * 100
        : 0;
    const growthPctLabel =
      Math.abs(growthPct) < 0.05
        ? `${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(2)}%/m`
        : `${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(1)}%/m`;
    townBits.push(`${prettyToken(tile.town.type)} town`);
    townBits.push(`Support ${tile.town.supportCurrent}/${tile.town.supportMax}`);
    townBits.push(
      `Population ${Math.round(tile.town.population).toLocaleString()} (${growthPctLabel}) (${prettyToken(tile.town.populationTier)})`
    );
    townBits.push(`Connected towns ${tile.town.connectedTownCount} (+${Math.round(tile.town.connectedTownBonus * 100)}%)`);
    if (!tile.town.isFed) townBits.push("Unfed");
    if (typeof tile.town.foodUpkeepPerMinute === "number") {
      upkeepLine = `Upkeep: ${resourceIconForKey("FOOD")} ${tile.town.foodUpkeepPerMinute.toFixed(2)}/m`;
    }
  }
  const prodStrategic = Object.entries(tile.yieldRate?.strategicPerDay ?? {})
    .filter(([, v]) => Number(v) > 0)
    .map(([r, v]) => `${resourceIconForKey(r)} ${Number(v).toFixed(1)}/day`);
  const prodInfo = (() => {
    const gpm = tile.yieldRate?.goldPerMinute ?? 0;
    const parts: string[] = [];
    if (tile.town) {
      parts.push(`${gpm.toFixed(2)} / m${tile.town.isFed ? "" : " - Unfed"}`);
    } else if (gpm > 0) {
      parts.push(`${resourceIconForKey("GOLD")} ${gpm.toFixed(2)}/m`);
    }
    parts.push(...prodStrategic);
    return parts.length > 0 ? parts.join("  ") : "";
  })();
  const historyLines = tileHistoryLines(tile);
  const terrainAndResource = (() => {
    const terrainText = prettyToken(terrainLabel(tile.x, tile.y, tile.terrain));
    if (!tile.resource) return terrainText;
    return `${terrainText} - ${prettyToken(resourceLabel(tile.resource))}`;
  })();
  const topLine = [
    `<strong>${tile.x}, ${tile.y}</strong>`,
    terrainAndResource
  ]
    .filter(Boolean)
    .join(" · ");
  const metaLine = [`Owner ${ownerLabel}`, ...tags].filter(Boolean).join(" · ");
  const extraLine = townBits.length > 0 ? townBits.join(" · ") : prodInfo;
  const storedYield = storedYieldSummary(tile);
  const settleProgress = settlementProgressForTile(tile.x, tile.y);
  const settleLine = settleProgress ? `Settling... ${formatCountdownClock(settleProgress.resolvesAt - Date.now())}` : "";
  const constructionLine = constructionCountdownLineForTile(tile);
  const forestExpandLine =
    tile.terrain === "LAND" && !tile.ownerId && pickOriginForTarget(tile.x, tile.y, false) && isForestTile(tile.x, tile.y)
      ? `Forest slows frontier expansion to ${Math.round(frontierClaimDurationMsForTile(tile.x, tile.y) / 1000)}s`
      : "";
  const sabotageLine =
    tile.sabotage && tile.sabotage.endsAt > Date.now()
      ? `Output ${Math.round(tile.sabotage.outputMultiplier * 100)}% until ${new Date(tile.sabotage.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "";
  const structureLine = tile.economicStructure && tile.economicStructure.status === "inactive" ? `Inactive - upkeep not paid` : "";
  return `
    <div class="hover-line">${topLine}</div>
    <div class="hover-subline">${metaLine}</div>
    ${extraLine ? `<div class="hover-subline">${extraLine}</div>` : ""}
    ${upkeepLine ? `<div class="hover-subline">${upkeepLine}</div>` : ""}
    ${prodInfo ? `<div class="hover-subline">Production: ${prodInfo}</div>` : ""}
    ${forestExpandLine ? `<div class="hover-subline hover-accent">${forestExpandLine}</div>` : ""}
    ${settleLine ? `<div class="hover-subline hover-accent">${settleLine}</div>` : ""}
    ${constructionLine ? `<div class="hover-subline hover-accent">${constructionLine}</div>` : ""}
    ${storedYield ? `<div class="hover-subline">Stored yield ${storedYield}</div>` : ""}
    ${structureLine ? `<div class="hover-subline">${structureLine}</div>` : ""}
    ${sabotageLine ? `<div class="hover-subline hover-accent">${sabotageLine}</div>` : ""}
    ${historyLines.map((line) => `<div class="hover-subline">${line}</div>`).join("")}
  `;
};

const hasCollectableYield = (t: Tile | undefined): boolean => {
  if (!t?.yield) return false;
  if ((t.yield.gold ?? 0) > 0.01) return true;
  return Object.values(t.yield.strategic ?? {}).some((v) => Number(v) > 0.01);
};

const visibleCollectSummary = (): { tileCount: number; gold: number; resourceKinds: number } => {
  let tileCount = 0;
  let gold = 0;
  const activeResources = new Set<string>();
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me || tile.ownershipState !== "SETTLED") continue;
    if (tileVisibilityStateAt(tile.x, tile.y, tile) !== "visible") continue;
    if (!hasCollectableYield(tile)) continue;
    tileCount += 1;
    gold += tile.yield?.gold ?? 0;
    for (const [resource, amount] of Object.entries(tile.yield?.strategic ?? {})) {
      if (Number(amount) > 0.01) activeResources.add(resource);
    }
  }
  return { tileCount, gold, resourceKinds: activeResources.size };
};

const clearPendingCollectVisibleDelta = (): void => {
  state.pendingCollectVisibleDelta.gold = 0;
  for (const resource of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"] as const) {
    state.pendingCollectVisibleDelta.strategic[resource] = 0;
  }
};

const clearPendingCollectTileDelta = (tileKey?: string): void => {
  if (tileKey) {
    state.pendingCollectTileDelta.delete(tileKey);
    return;
  }
  state.pendingCollectTileDelta.clear();
};

const revertOptimisticVisibleCollectDelta = (): void => {
  const delta = state.pendingCollectVisibleDelta;
  if (delta.gold > 0) state.gold = Math.max(0, state.gold - delta.gold);
  for (const resource of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"] as const) {
    const amount = delta.strategic[resource] ?? 0;
    if (amount > 0) state.strategicResources[resource] = Math.max(0, state.strategicResources[resource] - amount);
  }
  clearPendingCollectVisibleDelta();
};

const revertOptimisticTileCollectDelta = (tileKey: string): void => {
  const delta = state.pendingCollectTileDelta.get(tileKey);
  if (!delta) return;
  if (delta.gold > 0) state.gold = Math.max(0, state.gold - delta.gold);
  for (const resource of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"] as const) {
    const amount = delta.strategic[resource] ?? 0;
    if (amount > 0) state.strategicResources[resource] = Math.max(0, state.strategicResources[resource] - amount);
  }
  const tile = state.tiles.get(tileKey);
  if (tile && delta.previousYield) tile.yield = delta.previousYield;
  else if (tile) delete tile.yield;
  state.pendingCollectTileDelta.delete(tileKey);
};

const applyOptimisticVisibleCollect = (): number => {
  state.pendingCollectVisibleKeys.clear();
  clearPendingCollectVisibleDelta();
  let touched = 0;
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me || tile.ownershipState !== "SETTLED") continue;
    if (tileVisibilityStateAt(tile.x, tile.y, tile) !== "visible") continue;
    if (!hasCollectableYield(tile)) continue;
    state.pendingCollectVisibleKeys.add(key(tile.x, tile.y));
    const gold = tile.yield?.gold ?? 0;
    if (gold > 0) {
      state.gold += gold;
      state.pendingCollectVisibleDelta.gold += gold;
      state.goldAnimUntil = Date.now() + 350;
      state.goldAnimDir = 1;
    }
    for (const resource of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"] as const) {
      const amount = Number(tile.yield?.strategic?.[resource] ?? 0);
      if (amount <= 0) continue;
      state.strategicResources[resource] += amount;
      state.pendingCollectVisibleDelta.strategic[resource] += amount;
      state.strategicAnim[resource] = { until: Date.now() + 350, dir: 1 };
    }
    tile.yield = { gold: 0, strategic: {} };
    touched += 1;
  }
  return touched;
};

const applyOptimisticTileCollect = (tile: Tile): boolean => {
  const tileKey = key(tile.x, tile.y);
  const gold = tile.yield?.gold ?? 0;
  const strategic = {
    FOOD: Number(tile.yield?.strategic?.FOOD ?? 0),
    IRON: Number(tile.yield?.strategic?.IRON ?? 0),
    CRYSTAL: Number(tile.yield?.strategic?.CRYSTAL ?? 0),
    SUPPLY: Number(tile.yield?.strategic?.SUPPLY ?? 0),
    SHARD: Number(tile.yield?.strategic?.SHARD ?? 0)
  } as Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>;
  const touched = gold > 0 || Object.values(strategic).some((amount) => amount > 0);
  if (!touched) return false;

  state.pendingCollectTileDelta.set(tileKey, {
    gold,
    strategic,
    ...(tile.yield
      ? { previousYield: { gold: tile.yield.gold ?? 0, strategic: { ...(tile.yield.strategic ?? {}) } } }
      : {})
  });
  if (gold > 0) {
    state.gold += gold;
    state.goldAnimUntil = Date.now() + 350;
    state.goldAnimDir = 1;
  }
  for (const resource of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"] as const) {
    const amount = strategic[resource] ?? 0;
    if (amount <= 0) continue;
    state.strategicResources[resource] += amount;
    state.strategicAnim[resource] = { until: Date.now() + 350, dir: 1 };
  }
  tile.yield = { gold: 0, strategic: {} };
  return true;
};
const isCoastalLand = (x: number, y: number): boolean => {
  if (terrainAt(x, y) !== "LAND") return false;
  const n = [
    terrainAt(wrapX(x), wrapY(y - 1)),
    terrainAt(wrapX(x + 1), wrapY(y)),
    terrainAt(wrapX(x), wrapY(y + 1)),
    terrainAt(wrapX(x - 1), wrapY(y))
  ];
  return n.includes("SEA");
};
const isCoastalSea = (x: number, y: number): boolean => {
  if (terrainAt(x, y) !== "SEA") return false;
  const n = [
    terrainAt(wrapX(x), wrapY(y - 1)),
    terrainAt(wrapX(x + 1), wrapY(y)),
    terrainAt(wrapX(x), wrapY(y + 1)),
    terrainAt(wrapX(x - 1), wrapY(y))
  ];
  return n.includes("LAND");
};
const tileNoise = (x: number, y: number, seed: number): number => {
  const h = hashString(`${wrapX(x)}:${wrapY(y)}:${seed}`);
  return (h % 10_000) / 10_000;
};
const smoothstep = (t: number): number => t * t * (3 - 2 * t);
const groupedNoise = (x: number, y: number, cell: number, seed: number): number => {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const tx = (x % cell) / cell;
  const ty = (y % cell) / cell;
  const sx = smoothstep(tx);
  const sy = smoothstep(ty);
  const n00 = tileNoise(gx, gy, seed);
  const n10 = tileNoise(gx + 1, gy, seed);
  const n01 = tileNoise(gx, gy + 1, seed);
  const n11 = tileNoise(gx + 1, gy + 1, seed);
  const ix0 = n00 + (n10 - n00) * sx;
  const ix1 = n01 + (n11 - n01) * sx;
  return ix0 + (ix1 - ix0) * sy;
};
const landTone = (x: number, y: number): string => {
  const biome = landBiomeAt(x, y);
  if (biome === "COASTAL_SAND") return "#c8b27c";
  if (biome === "SAND") {
    const v = groupedNoise(x, y, 32, 907);
    return v < 0.5 ? "#bfa36e" : "#c9b07a";
  }
  const shade = grassShadeAt(x, y);
  return shade === "DARK" ? "#3f8a5c" : "#4d976a";
};
const terrainColorAt = (x: number, y: number, terrain: Tile["terrain"]): string => {
  if (terrain === "SEA") return isCoastalSea(x, y) ? "#1f6ea0" : "#0b3d91";
  if (terrain === "MOUNTAIN") return "#8b8d92";
  return landTone(x, y);
};
const cachedTerrainColorAt = (x: number, y: number, terrain: Tile["terrain"]): string => {
  const k = `${x},${y},${terrain}`;
  const hit = terrainColorCache.get(k);
  if (hit) return hit;
  const c = terrainColorAt(x, y, terrain);
  terrainColorCache.set(k, c);
  terrainColorCacheOrder.push(k);
  if (terrainColorCacheOrder.length > TERRAIN_COLOR_CACHE_LIMIT) {
    const drop = terrainColorCacheOrder.shift();
    if (drop) terrainColorCache.delete(drop);
  }
  return c;
};

type TerrainTextureId =
  | "SEA_DEEP"
  | "SEA_COAST"
  | "SAND"
  | "GRASS_LIGHT"
  | "GRASS_DARK"
  | "MOUNTAIN";

const TERRAIN_TEXTURE_SIZE = 64;
const createTownOverlaySet = (
  sources: Record<NonNullable<Tile["town"]>["populationTier"], string>
): Record<NonNullable<Tile["town"]>["populationTier"], HTMLImageElement> => {
  const set = {
    TOWN: new Image(),
    CITY: new Image(),
    GREAT_CITY: new Image(),
    METROPOLIS: new Image()
  };
  set.TOWN.src = sources.TOWN;
  set.CITY.src = sources.CITY;
  set.GREAT_CITY.src = sources.GREAT_CITY;
  set.METROPOLIS.src = sources.METROPOLIS;
  return set;
};

const overlayAssetVersion = "20260328a";
const overlaySrc = (filename: string): string => `/overlays/${filename}?v=${overlayAssetVersion}`;
const loadOverlayImage = (filename: string): HTMLImageElement => {
  const image = new Image();
  image.decoding = "async";
  image.src = overlaySrc(filename);
  return image;
};
const createOverlayVariantSet = (filenames: readonly string[]): HTMLImageElement[] => filenames.map(loadOverlayImage);
const overlayVariantIndexAt = (x: number, y: number, count: number): number => {
  const hash = (((x + 1) * 374761393) ^ ((y + 1) * 668265263)) >>> 0;
  return hash % count;
};

const defaultTownOverlayByTier = createTownOverlaySet({
  TOWN: overlaySrc("town-overlay-sand.svg"),
  CITY: overlaySrc("city-overlay-sand.svg"),
  GREAT_CITY: overlaySrc("great-city-overlay-sand.svg"),
  METROPOLIS: overlaySrc("metropolis-overlay-sand.svg")
});

const grassTownOverlayByTier = createTownOverlaySet({
  TOWN: overlaySrc("town-overlay-grass.svg"),
  CITY: overlaySrc("city-overlay-grass.svg"),
  GREAT_CITY: overlaySrc("great-city-overlay-grass.svg"),
  METROPOLIS: overlaySrc("metropolis-overlay-grass.svg")
});
const ancientTownOverlayByBiome = {
  SAND: loadOverlayImage("ancient-town-overlay-sand.svg"),
  GRASS: loadOverlayImage("ancient-town-overlay-grass.svg")
} as const;
const dockOverlayVariants = createOverlayVariantSet(["dock-overlay-1.svg", "dock-overlay-2.svg", "dock-overlay-3.svg"]);
const structureOverlayImages = {
  OBSERVATORY: loadOverlayImage("observatory-overlay.svg"),
  MARKET: loadOverlayImage("market-overlay.svg"),
  GRANARY: loadOverlayImage("granary-overlay.svg")
} as const;
const builtResourceOverlayVariants = {
  FARM_FARMSTEAD: createOverlayVariantSet(["farm-farmstead-overlay-1.svg", "farm-farmstead-overlay-2.svg", "farm-farmstead-overlay-3.svg"]),
  FISH_FARMSTEAD: createOverlayVariantSet(["fish-farmstead-overlay-1.svg", "fish-farmstead-overlay-2.svg", "fish-farmstead-overlay-3.svg"]),
  FUR_CAMP: createOverlayVariantSet(["fur-camp-overlay-1.svg", "fur-camp-overlay-2.svg", "fur-camp-overlay-3.svg"]),
  IRON_MINE: createOverlayVariantSet(["iron-mine-overlay-1.svg", "iron-mine-overlay-2.svg", "iron-mine-overlay-3.svg"]),
  GEMS_MINE: createOverlayVariantSet(["gems-mine-overlay-1.svg", "gems-mine-overlay-2.svg", "gems-mine-overlay-3.svg", "gems-mine-overlay-4.svg"])
} as const;
const resourceOverlayVariants = {
  FARM: createOverlayVariantSet(["farm-overlay-1.svg", "farm-overlay-2.svg", "farm-overlay-3.svg"]),
  FISH: createOverlayVariantSet(["fish-overlay-1.svg", "fish-overlay-2.svg", "fish-overlay-3.svg"]),
  FUR: createOverlayVariantSet(["fur-overlay-1.svg", "fur-overlay-2.svg", "fur-overlay-3.svg"]),
  IRON: createOverlayVariantSet(["iron-overlay-1.svg", "iron-overlay-2.svg", "iron-overlay-3.svg"]),
  GEMS: createOverlayVariantSet(["gems-overlay-1.svg", "gems-overlay-2.svg", "gems-overlay-3.svg", "gems-overlay-4.svg"])
} as const;
const textureCanvas = (): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = TERRAIN_TEXTURE_SIZE;
  c.height = TERRAIN_TEXTURE_SIZE;
  return c;
};
const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
const tint = (r: number, g: number, b: number, d: number): [number, number, number] => [
  clamp255(r + d),
  clamp255(g + d),
  clamp255(b + d)
];
const terrainTextures = new Map<TerrainTextureId, HTMLCanvasElement>();
const makeTerrainTexture = (
  base: [number, number, number],
  opts: { grain: number; waveA?: number; waveB?: number; crack?: number; grass?: boolean; rock?: boolean }
): HTMLCanvasElement => {
  const c = textureCanvas();
  const tctx = c.getContext("2d");
  if (!tctx) return c;
  const img = tctx.createImageData(TERRAIN_TEXTURE_SIZE, TERRAIN_TEXTURE_SIZE);
  const data = img.data;
  const [br, bg, bb] = base;
  for (let y = 0; y < TERRAIN_TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TERRAIN_TEXTURE_SIZE; x += 1) {
      const i = (y * TERRAIN_TEXTURE_SIZE + x) * 4;
      const wave =
        Math.sin((x + y * 0.8) * (opts.waveA ?? 0)) * 0.5 +
        Math.cos((y - x * 0.6) * (opts.waveB ?? 0)) * 0.5;
      const grain =
        Math.sin((x * 12.9898 + y * 78.233) * 0.017) * 0.5 +
        Math.sin((x * 93.17 - y * 51.11) * 0.021) * 0.5;
      let d = grain * opts.grain + wave * (opts.waveA ? 10 : 0);
      if (opts.crack) {
        const crack = Math.sin((x * 0.9 + y * 0.2) * 0.25) + Math.cos((y * 1.1 - x * 0.3) * 0.21);
        d -= Math.max(0, crack) * opts.crack;
      }
      if (opts.grass) {
        const blade = Math.sin((x * 0.7 + y * 1.3) * 0.33) * 8 + Math.cos((x * 1.1 - y * 0.8) * 0.27) * 6;
        d += blade * 0.25;
      }
      if (opts.rock) {
        const pebble = Math.sin((x * 0.42 + y * 0.58) * 0.9) * Math.cos((x * 0.66 - y * 0.31) * 0.8);
        d += pebble * 14;
      }
      const [r, g, b] = tint(br, bg, bb, d);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  tctx.putImageData(img, 0, 0);
  return c;
};
const initTerrainTextures = (): void => {
  terrainTextures.set("SEA_DEEP", makeTerrainTexture([71, 128, 158], { grain: 9, waveA: 0.34, waveB: 0.28 }));
  terrainTextures.set("SEA_COAST", makeTerrainTexture([103, 154, 182], { grain: 8, waveA: 0.31, waveB: 0.26 }));
  terrainTextures.set("SAND", makeTerrainTexture([214, 184, 135], { grain: 11, waveA: 0.18, waveB: 0.14 }));
  terrainTextures.set("GRASS_LIGHT", makeTerrainTexture([119, 142, 66], { grain: 10, grass: true }));
  terrainTextures.set("GRASS_DARK", makeTerrainTexture([94, 124, 48], { grain: 10, grass: true }));
  const mountain = makeTerrainTexture([126, 126, 129], { grain: 9, crack: 8, rock: true });
  const mctx = mountain.getContext("2d");
  if (mctx) {
    mctx.fillStyle = "rgba(78, 79, 82, 0.82)";
    mctx.beginPath();
    mctx.moveTo(8, 50);
    mctx.lineTo(28, 20);
    mctx.lineTo(46, 50);
    mctx.closePath();
    mctx.fill();
    mctx.fillStyle = "rgba(97, 99, 103, 0.85)";
    mctx.beginPath();
    mctx.moveTo(20, 50);
    mctx.lineTo(41, 26);
    mctx.lineTo(56, 50);
    mctx.closePath();
    mctx.fill();
    mctx.fillStyle = "rgba(225, 228, 232, 0.75)";
    mctx.beginPath();
    mctx.moveTo(27, 23);
    mctx.lineTo(32, 31);
    mctx.lineTo(37, 23);
    mctx.closePath();
    mctx.fill();
  }
  terrainTextures.set("MOUNTAIN", mountain);
};
const terrainTextureIdAt = (x: number, y: number, terrain: Tile["terrain"]): TerrainTextureId => {
  if (terrain === "SEA") return isCoastalSea(x, y) ? "SEA_COAST" : "SEA_DEEP";
  if (terrain === "MOUNTAIN") return "MOUNTAIN";
  const biome = landBiomeAt(x, y);
  if (biome === "SAND" || biome === "COASTAL_SAND") return "SAND";
  return grassShadeAt(x, y) === "DARK" ? "GRASS_DARK" : "GRASS_LIGHT";
};
const drawTerrainTile = (wx: number, wy: number, terrain: Tile["terrain"], px: number, py: number, size: number): void => {
  if (size < 8) {
    ctx.fillStyle = cachedTerrainColorAt(wx, wy, terrain);
    ctx.fillRect(px, py, size, size);
    return;
  }
  const id = terrainTextureIdAt(wx, wy, terrain);
  const tex = terrainTextures.get(id);
  if (!tex) {
    ctx.fillStyle = cachedTerrainColorAt(wx, wy, terrain);
    ctx.fillRect(px, py, size, size);
    return;
  }
  ctx.drawImage(tex, 0, 0, tex.width, tex.height, px, py, size, size);
};

const drawForestOverlay = (wx: number, wy: number, px: number, py: number, size: number): void => {
  if (size < 12 || !isForestTile(wx, wy)) return;
  const pulse = 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(Date.now() / 900 + wx * 0.17 + wy * 0.11));
  const treeCount = size >= 44 ? 4 : size >= 24 ? 3 : 2;
  const anchors: Array<[number, number]> =
    treeCount === 4
      ? [
          [0.22, 0.6],
          [0.42, 0.44],
          [0.62, 0.58],
          [0.8, 0.42]
        ]
      : treeCount === 3
        ? [
            [0.24, 0.62],
            [0.5, 0.42],
            [0.76, 0.58]
          ]
        : [
            [0.34, 0.6],
            [0.68, 0.5]
          ];

  ctx.save();
  for (let i = 0; i < anchors.length; i += 1) {
    const anchor = anchors[i];
    if (!anchor) continue;
    const [ax, ay] = anchor;
    const trunkW = Math.max(1, size * 0.045);
    const canopyW = size * (0.2 + i * 0.015);
    const canopyH = canopyW * 0.92;
    const tx = px + size * ax;
    const ty = py + size * ay;
    ctx.fillStyle = `rgba(28, 54, 27, ${0.4 + pulse * 0.16})`;
    ctx.fillRect(tx - trunkW / 2, ty - size * 0.02, trunkW, size * 0.12);
    ctx.fillStyle = `rgba(14, 41, 18, ${0.72 + pulse * 0.12})`;
    ctx.beginPath();
    ctx.moveTo(tx, ty - canopyH * 0.64);
    ctx.lineTo(tx - canopyW * 0.46, ty + canopyH * 0.14);
    ctx.lineTo(tx + canopyW * 0.46, ty + canopyH * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(52, 96, 45, ${0.32 + pulse * 0.08})`;
    ctx.beginPath();
    ctx.moveTo(tx, ty - canopyH * 0.52);
    ctx.lineTo(tx - canopyW * 0.24, ty - canopyH * 0.05);
    ctx.lineTo(tx + canopyW * 0.12, ty - canopyH * 0.14);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};

const drawBarbarianSkullOverlay = (px: number, py: number, size: number): void => {
  if (size < 10) return;

  const skullSize = Math.max(6, size * 0.48);
  const cx = px + size / 2;
  const cy = py + size / 2 - skullSize * 0.02;
  const craniumRadius = skullSize * 0.28;
  const jawWidth = skullSize * 0.38;
  const jawHeight = skullSize * 0.2;
  const jawX = cx - jawWidth / 2;
  const jawY = cy + skullSize * 0.1;

  ctx.save();
  ctx.fillStyle = "rgba(196, 203, 210, 0.72)";
  ctx.strokeStyle = "rgba(56, 62, 70, 0.5)";
  ctx.lineWidth = Math.max(1, size * 0.04);

  ctx.beginPath();
  ctx.arc(cx, cy - skullSize * 0.08, craniumRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.roundRect(jawX, jawY, jawWidth, jawHeight, Math.max(1, skullSize * 0.05));
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(43, 48, 56, 0.82)";
  const eyeRadius = skullSize * 0.065;
  ctx.beginPath();
  ctx.arc(cx - skullSize * 0.11, cy - skullSize * 0.09, eyeRadius, 0, Math.PI * 2);
  ctx.arc(cx + skullSize * 0.11, cy - skullSize * 0.09, eyeRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx, cy - skullSize * 0.01);
  ctx.lineTo(cx - skullSize * 0.05, cy + skullSize * 0.08);
  ctx.lineTo(cx + skullSize * 0.05, cy + skullSize * 0.08);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(43, 48, 56, 0.65)";
  ctx.lineWidth = Math.max(1, size * 0.03);
  const toothTop = jawY + jawHeight * 0.18;
  const toothBottom = jawY + jawHeight * 0.82;
  for (const offset of [-0.09, 0, 0.09]) {
    const toothX = cx + skullSize * offset;
    ctx.beginPath();
    ctx.moveTo(toothX, toothTop);
    ctx.lineTo(toothX, toothBottom);
    ctx.stroke();
  }

  ctx.restore();
};

const drawIncomingAttackOverlay = (wx: number, wy: number, px: number, py: number, size: number, resolvesAt: number): void => {
  if (size < 10) return;
  const remainingMs = Math.max(0, resolvesAt - Date.now());
  const urgency = Math.max(0.2, Math.min(1, 1 - remainingMs / 4000));
  const phase = Date.now() / 180 + wx * 0.9 + wy * 0.7;
  const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(phase));
  const alpha = 0.18 + pulse * (0.16 + urgency * 0.22);
  const ringInset = 1 + Math.max(0, Math.floor((size * 0.08) * (1 - pulse)));

  ctx.save();
  ctx.fillStyle = `rgba(255, 72, 72, ${alpha.toFixed(3)})`;
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2);

  ctx.strokeStyle = `rgba(255, 214, 214, ${(0.38 + urgency * 0.34 + pulse * 0.08).toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + ringInset, py + ringInset, size - ringInset * 2, size - ringInset * 2);

  const cx = px + size / 2;
  const cy = py + size / 2;
  const arm = Math.max(3, size * 0.18);
  ctx.strokeStyle = `rgba(72, 10, 10, ${(0.52 + urgency * 0.22).toFixed(3)})`;
  ctx.lineWidth = Math.max(1.5, size * 0.07);
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy - arm);
  ctx.lineTo(cx + arm, cy + arm);
  ctx.moveTo(cx + arm, cy - arm);
  ctx.lineTo(cx - arm, cy + arm);
  ctx.stroke();
  ctx.restore();
};
const drawTownOverlay = (tile: Tile, px: number, py: number, size: number): void => {
  if (!tile.town) return;
  if (size < 16) {
    drawTownMarker(px, py, size, true);
    if (!tile.town.isFed) {
      const badgeSize = Math.max(6, size * 0.24);
      const badgeX = px + size - badgeSize - 1;
      const badgeY = py + 1;
      ctx.fillStyle = "rgba(201, 74, 56, 0.96)";
      ctx.beginPath();
      ctx.moveTo(badgeX, badgeY + badgeSize);
      ctx.lineTo(badgeX + badgeSize * 0.5, badgeY);
      ctx.lineTo(badgeX + badgeSize, badgeY + badgeSize);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }
  const accent =
    tile.town.type === "MARKET"
      ? "rgba(255, 212, 102, 0.9)"
      : tile.town.type === "FARMING"
        ? "rgba(162, 241, 132, 0.88)"
        : "rgba(198, 171, 255, 0.9)";
  const biome = landBiomeAt(tile.x, tile.y);
  const overlaySet = biome === "GRASS" ? grassTownOverlayByTier : defaultTownOverlayByTier;
  const overlay =
    tile.town.type === "ANCIENT" && tile.town.populationTier === "TOWN"
      ? biome === "GRASS"
        ? ancientTownOverlayByBiome.GRASS
        : ancientTownOverlayByBiome.SAND
      : overlaySet[tile.town.populationTier];
  if (!overlay.complete || !overlay.naturalWidth) {
    const marker = Math.max(4, Math.floor(size * 0.34));
    const mx = px + Math.floor((size - marker) / 2);
    const my = py + Math.floor((size - marker) / 2);
    ctx.fillStyle = "rgba(10, 14, 24, 0.82)";
    ctx.fillRect(mx - 1, my - 1, marker + 2, marker + 2);
    if (tile.town.type === "MARKET") ctx.fillStyle = "rgba(255, 212, 102, 0.95)";
    else if (tile.town.type === "FARMING") ctx.fillStyle = "rgba(162, 241, 132, 0.95)";
    else ctx.fillStyle = "rgba(198, 171, 255, 0.95)";
    ctx.fillRect(mx, my, marker, marker);
    return;
  }

  const scaleByTier =
    tile.town.populationTier === "TOWN"
      ? 1.46
      : tile.town.populationTier === "CITY"
        ? 1.58
        : tile.town.populationTier === "GREAT_CITY"
          ? 1.72
          : 1.86;
  const drawSize = size * scaleByTier;
  const offsetX = (drawSize - size) / 2;
  const offsetY =
    tile.town.populationTier === "TOWN"
      ? drawSize * 0.28
      : tile.town.populationTier === "CITY"
        ? drawSize * 0.32
        : tile.town.populationTier === "GREAT_CITY"
          ? drawSize * 0.35
          : drawSize * 0.39;

  ctx.drawImage(overlay, px - offsetX, py - offsetY, drawSize, drawSize);

  if (tile.town.type !== "ANCIENT") {
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(2, size * 0.08);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px + size * 0.22, py + size * 0.88);
    ctx.lineTo(px + size * 0.78, py + size * 0.88);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  if (!tile.town.isFed) {
    const badgeSize = Math.max(8, size * 0.24);
    const badgeX = px + size * 0.72;
    const badgeY = py + size * 0.08;

    ctx.fillStyle = "rgba(201, 74, 56, 0.96)";
    ctx.beginPath();
    ctx.moveTo(badgeX, badgeY + badgeSize);
    ctx.lineTo(badgeX + badgeSize * 0.5, badgeY);
    ctx.lineTo(badgeX + badgeSize, badgeY + badgeSize);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(39, 14, 9, 0.78)";
    ctx.lineWidth = Math.max(1.2, size * 0.035);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 243, 219, 0.98)";
    ctx.font = `bold ${Math.max(8, size * 0.16)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", badgeX + badgeSize * 0.5, badgeY + badgeSize * 0.62);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  drawTownMarker(px, py, size, false);
};
const drawCenteredOverlay = (overlay: HTMLImageElement | undefined, px: number, py: number, size: number, scale = 1.08): void => {
  if (!overlay || !overlay.complete || !overlay.naturalWidth) return;
  const drawSize = size * scale;
  const offset = (drawSize - size) / 2;
  ctx.drawImage(overlay, px - offset, py - offset, drawSize, drawSize);
};
const drawCenteredOverlayWithAlpha = (
  overlay: HTMLImageElement | undefined,
  px: number,
  py: number,
  size: number,
  scale = 1.08,
  alpha = 1
): void => {
  if (!overlay || !overlay.complete || !overlay.naturalWidth) return;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * alpha;
  drawCenteredOverlay(overlay, px, py, size, scale);
  ctx.globalAlpha = prevAlpha;
};
const drawResourceMarkerIcon = (resource: string | undefined, x: number, y: number, badge: number): void => {
  const icon =
    resource === "FARM" || resource === "FISH"
      ? "🍞"
      : resource === "IRON"
        ? "⛏"
        : resource === "GEMS"
          ? "💎"
          : resource === "FUR"
            ? "🦊"
            : resource === "WOOD"
              ? "🪵"
              : "";
  if (!icon) return;
  ctx.font = `${Math.max(8, badge * 0.8)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, x + badge / 2, y + badge / 2 + 0.5);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
};
const drawResourceCornerMarker = (tile: Tile, px: number, py: number, size: number): void => {
  if (!tile.resource) return;
  const color = resourceColor(tile.resource);
  if (!color) return;
  const badge = Math.max(9, size * 0.22);
  const inset = Math.max(2, size * 0.03);
  ctx.fillStyle = "rgba(12, 16, 28, 0.78)";
  ctx.fillRect(px + inset - 1, py + inset - 1, badge + 2, badge + 2);
  ctx.fillStyle = color;
  ctx.fillRect(px + inset, py + inset, badge, badge);
  ctx.fillStyle = "rgba(22, 24, 28, 0.95)";
  drawResourceMarkerIcon(tile.resource, px + inset, py + inset, badge);
};
const drawTownMarker = (px: number, py: number, size: number, fullTile = false): void => {
  const badge = fullTile ? Math.max(8, size - 2) : Math.max(9, size * 0.22);
  const inset = fullTile ? 1 : Math.max(2, size * 0.03);
  const x = px + inset;
  const y = py + inset;
  ctx.fillStyle = "rgba(12, 16, 28, 0.78)";
  ctx.fillRect(x - 1, y - 1, badge + 2, badge + 2);
  ctx.fillStyle = "rgba(255, 208, 102, 0.98)";
  ctx.fillRect(x, y, badge, badge);
  const coinRadius = Math.max(2, badge * 0.28);
  const coinX = x + badge / 2;
  const coinY = y + badge / 2;
  ctx.fillStyle = "rgba(255, 233, 153, 0.98)";
  ctx.beginPath();
  ctx.arc(coinX, coinY, coinRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(173, 112, 18, 0.95)";
  ctx.lineWidth = Math.max(1, badge * 0.08);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 247, 221, 0.88)";
  ctx.lineWidth = Math.max(0.8, badge * 0.04);
  ctx.beginPath();
  ctx.arc(coinX - coinRadius * 0.18, coinY - coinRadius * 0.16, Math.max(1, coinRadius * 0.45), 0, Math.PI * 2);
  ctx.stroke();
};
const resourceOverlayForTile = (tile: Tile): HTMLImageElement | undefined => {
  if (!tile.resource) return undefined;
  const variants = resourceOverlayVariants[tile.resource as keyof typeof resourceOverlayVariants];
  if (!variants) return undefined;
  return variants[overlayVariantIndexAt(tile.x, tile.y, variants.length)];
};
const builtResourceOverlayForTile = (tile: Tile): HTMLImageElement | undefined => {
  if (!tile.resource || !tile.economicStructure) return undefined;
  const key =
    tile.resource === "FARM" && tile.economicStructure.type === "FARMSTEAD"
      ? "FARM_FARMSTEAD"
      : tile.resource === "FISH" && tile.economicStructure.type === "FARMSTEAD"
        ? "FISH_FARMSTEAD"
        : tile.resource === "FUR" && tile.economicStructure.type === "CAMP"
          ? "FUR_CAMP"
          : tile.resource === "IRON" && tile.economicStructure.type === "MINE"
            ? "IRON_MINE"
            : tile.resource === "GEMS" && tile.economicStructure.type === "MINE"
              ? "GEMS_MINE"
              : undefined;
  if (!key) return undefined;
  const variants = builtResourceOverlayVariants[key];
  return variants[overlayVariantIndexAt(tile.x, tile.y, variants.length)];
};
const resourceOverlayScaleForTile = (tile: Tile): number => {
  if (tile.resource === "FISH") return 1.3;
  if (tile.resource === "IRON") return 1.2;
  return 1.08;
};
const economicStructureOverlayAlpha = (tile: Tile): number => {
  const status = tile.economicStructure?.status;
  if (status === "active") return 1;
  if (status === "under_construction") return 0.8;
  return 0.7;
};
const clusterTint = (clusterType: string | undefined): string | undefined => {
  if (clusterType === "FERTILE_PLAINS") return "rgba(233,242,123,0.28)";
  if (clusterType === "IRON_HILLS") return "rgba(199,206,216,0.26)";
  if (clusterType === "CRYSTAL_BASIN") return "rgba(177,117,255,0.3)";
  if (clusterType === "HORSE_STEPPES") return "rgba(191,163,110,0.26)";
  if (clusterType === "ANCIENT_RUINS") return "rgba(250,173,93,0.28)";
  if (clusterType === "COASTAL_SHOALS") return "rgba(110,201,255,0.32)";
  return undefined;
};
const clusterMarkerColor = (clusterType: string | undefined): string | undefined => {
  if (clusterType === "FERTILE_PLAINS") return "#e9f27b";
  if (clusterType === "IRON_HILLS") return "#c7ced8";
  if (clusterType === "CRYSTAL_BASIN") return "#b175ff";
  if (clusterType === "HORSE_STEPPES") return "#d6b48a";
  if (clusterType === "ANCIENT_RUINS") return "#faad5d";
  if (clusterType === "COASTAL_SHOALS") return "#6ec9ff";
  return undefined;
};
const resourceColor = (resource: string | undefined): string | undefined => {
  if (resource === "FARM") return "#e9f27b";
  if (resource === "FISH") return "#6ec9ff";
  if (resource === "FUR") return "#d6b48a";
  if (resource === "WOOD") return "#7b4f2c";
  if (resource === "IRON") return "#c7ced8";
  if (resource === "GEMS") return "#b175ff";
  return undefined;
};
const resourceLabel = (resource: string | undefined): string => {
  if (resource === "FARM") return "GRAIN";
  if (resource === "FUR") return "FUR";
  if (resource === "FISH") return "FISH";
  if (resource === "IRON") return "IRON";
  if (resource === "GEMS") return "GEMS";
  if (resource === "WOOD") return "WOOD";
  return resource ?? "";
};
const strategicLabel = (resource: string): string => {
  if (resource === "FOOD") return "Food";
  if (resource === "IRON") return "Iron";
  if (resource === "CRYSTAL") return "Crystal";
  if (resource === "SUPPLY") return "Supply";
  if (resource === "SHARD") return "Shard";
  return resource;
};
const resourceIconForKey = (resource: string): string => {
  if (resource === "GOLD") return "◉";
  if (resource === "FOOD") return "🍞";
  if (resource === "IRON") return "⛏";
  if (resource === "CRYSTAL") return "💎";
  if (resource === "SUPPLY") return "🦊";
  if (resource === "SHARD") return "✦";
  return "•";
};
const yieldCapForResource = (tile: Tile, resource: string): number | undefined => {
  if (!tile.yieldCap) return undefined;
  if (resource === "GOLD") return tile.yieldCap.gold;
  if (resource === "FOOD" || resource === "IRON" || resource === "CRYSTAL" || resource === "SUPPLY" || resource === "SHARD") {
    return tile.yieldCap.strategicEach;
  }
  return undefined;
};
const formatYieldSummary = (tile: Tile): string => {
  const parts: string[] = [];
  const gold = tile.yield?.gold ?? 0;
  const goldCap = yieldCapForResource(tile, "GOLD");
  if (gold > 0.01 || (goldCap ?? 0) > 0) {
    parts.push(`${resourceIconForKey("GOLD")} ${gold.toFixed(1)} / ${(goldCap ?? 0).toFixed(1)}`);
  }
  for (const key of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"] as const) {
    const amount = Number(tile.yield?.strategic?.[key] ?? 0);
    const cap = yieldCapForResource(tile, key);
    if (amount <= 0.01 && (cap ?? 0) <= 0) continue;
    parts.push(`${resourceIconForKey(key)} ${amount.toFixed(1)} / ${(cap ?? 0).toFixed(1)}`);
  }
  return parts.length > 0 ? `Yield: ${parts.join("  ")}` : "";
};
const formatUpkeepSummary = (upkeep: typeof state.upkeepPerMinute): string => {
  const parts: string[] = [];
  if (upkeep.food > 0.001) parts.push(`${resourceIconForKey("FOOD")} ${upkeep.food.toFixed(2)}/m`);
  if (upkeep.iron > 0.001) parts.push(`${resourceIconForKey("IRON")} ${upkeep.iron.toFixed(2)}/m`);
  if (upkeep.supply > 0.001) parts.push(`${resourceIconForKey("SUPPLY")} ${upkeep.supply.toFixed(2)}/m`);
  if (upkeep.crystal > 0.001) parts.push(`${resourceIconForKey("CRYSTAL")} ${upkeep.crystal.toFixed(2)}/m`);
  if (upkeep.gold > 0.001) parts.push(`${resourceIconForKey("GOLD")} ${upkeep.gold.toFixed(2)}/m`);
  return parts.length > 0 ? `Empire upkeep: ${parts.join("  ")}` : "";
};
type EconomyBucket = {
  label: string;
  amountPerMinute: number;
  count: number;
  note?: string;
};

type DefensibilityBreakdown = {
  settledTiles: number;
  exposedEdges: number;
  internalEdges: number;
  naturalShieldEdges: number;
  borderEdges: number;
  exposedEdgeRatio: number;
  rating: "Strong" | "Stable" | "Fragile" | "Very Exposed";
  tips: string[];
};

type WeakDefensibilityTile = {
  tile: Tile;
  exposedSides: Array<"north" | "east" | "south" | "west">;
};

const settledOwnedTiles = (): Tile[] =>
  [...state.tiles.values()].filter((tile) => tile.ownerId === state.me && tile.terrain === "LAND" && tile.ownershipState === "SETTLED" && !tile.fogged);

const exposedSidesForTile = (tile: Tile): Array<"north" | "east" | "south" | "west"> => {
  const dirs = [
    { name: "north" as const, x: tile.x, y: tile.y - 1 },
    { name: "east" as const, x: tile.x + 1, y: tile.y },
    { name: "south" as const, x: tile.x, y: tile.y + 1 },
    { name: "west" as const, x: tile.x - 1, y: tile.y }
  ];
  const out: Array<"north" | "east" | "south" | "west"> = [];
  for (const dir of dirs) {
    const neighbor = state.tiles.get(key(wrapX(dir.x), wrapY(dir.y)));
    if (neighbor?.ownerId === state.me && neighbor.terrain === "LAND" && neighbor.ownershipState === "SETTLED" && !neighbor.fogged) continue;
    const terrain = terrainAt(dir.x, dir.y);
    if (terrain === "SEA" || terrain === "MOUNTAIN") continue;
    out.push(dir.name);
  }
  return out;
};

const weakDefensibilityTiles = (): WeakDefensibilityTile[] =>
  settledOwnedTiles()
    .map((tile) => ({ tile, exposedSides: exposedSidesForTile(tile) }))
    .filter((entry) => entry.exposedSides.length >= 2);

const defensibilityBreakdown = (): DefensibilityBreakdown => {
  const tiles = settledOwnedTiles();
  let exposedEdges = 0;
  let internalEdges = 0;
  let naturalShieldEdges = 0;
  for (const tile of tiles) {
    const neighbors = [
      { x: wrapX(tile.x), y: wrapY(tile.y - 1) },
      { x: wrapX(tile.x + 1), y: wrapY(tile.y) },
      { x: wrapX(tile.x), y: wrapY(tile.y + 1) },
      { x: wrapX(tile.x - 1), y: wrapY(tile.y) }
    ];
    for (const neighbor of neighbors) {
      const neighborTile = state.tiles.get(key(neighbor.x, neighbor.y));
      if (neighborTile?.ownerId === state.me && neighborTile.terrain === "LAND" && neighborTile.ownershipState === "SETTLED" && !neighborTile.fogged) {
        internalEdges += 1;
        continue;
      }
      const terrain = terrainAt(neighbor.x, neighbor.y);
      if (terrain === "SEA" || terrain === "MOUNTAIN") {
        naturalShieldEdges += 1;
        continue;
      }
      exposedEdges += 1;
    }
  }
  const borderEdges = naturalShieldEdges + exposedEdges;
  const exposedEdgeRatio = borderEdges > 0 ? exposedEdges / borderEdges : 0;
  const rating =
    exposedEdgeRatio <= 0.18 ? "Strong" : exposedEdgeRatio <= 0.32 ? "Stable" : exposedEdgeRatio <= 0.5 ? "Fragile" : "Very Exposed";
  const tips: string[] = [];
  if (exposedEdges > naturalShieldEdges) tips.push("Anchor more of your border on coastlines or mountains to replace exposed edges with natural shields.");
  if (tiles.length > 0 && exposedEdges / tiles.length > 1.6) tips.push("Your empire is stretched thin. Fill inward gaps and avoid long one-tile corridors.");
  if (internalEdges < borderEdges * 1.4) tips.push("Compact blocks defend better than snakes. Settling tiles that connect nearby clusters will lift defensibility fastest.");
  if (tips.length === 0) tips.push("Your current shape is efficient. Keep expanding in compact blocks and preserve natural barriers where possible.");
  return { settledTiles: tiles.length, exposedEdges, internalEdges, naturalShieldEdges, borderEdges, exposedEdgeRatio, rating, tips };
};

const defensibilityPanelHtml = (): string => {
  const summary = defensibilityBreakdown();
  const rounded = Math.round(state.defensibilityPct);
  const weakCount = weakDefensibilityTiles().length;
  return `<div class="defense-panel">
    <article class="card defense-hero-card">
      <div class="defense-hero-head">
        <div>
          <div class="defense-kicker">Empire Shape</div>
          <strong>${rounded}% defensibility</strong>
        </div>
        <span class="defense-rating defense-rating-${summary.rating.toLowerCase().replace(/ /g, "-")}">${summary.rating}</span>
      </div>
      <p class="defense-copy">Compact settled land with fewer exposed sides defends better. Coastlines and mountains count as safer borders than open land.</p>
      <button class="panel-btn defense-toggle-btn" type="button" data-toggle-weak-def="true">${state.showWeakDefensibility ? "Hide Weak Tiles" : "Show Weak Tiles"}${weakCount > 0 ? ` (${weakCount})` : ""}</button>
    </article>
    <article class="card defense-breakdown-card">
      <div class="defense-stat-grid">
        <div class="defense-stat"><span>Settled tiles</span><strong>${summary.settledTiles}</strong></div>
        <div class="defense-stat"><span>Exposed edges</span><strong>${summary.exposedEdges}</strong></div>
        <div class="defense-stat"><span>Natural shields</span><strong>${summary.naturalShieldEdges}</strong></div>
        <div class="defense-stat"><span>Connected interiors</span><strong>${Math.round(summary.internalEdges / 2)}</strong></div>
      </div>
    </article>
    <article class="card defense-breakdown-card">
      <strong>How this works</strong>
      <div class="defense-line"><span>Open land borders</span><strong class="is-negative">${Math.round(summary.exposedEdgeRatio * 100)}%</strong></div>
      <div class="defense-line"><span>Coast / mountain cover</span><strong class="is-positive">${summary.borderEdges > 0 ? Math.round((summary.naturalShieldEdges / summary.borderEdges) * 100) : 0}%</strong></div>
      <div class="defense-line"><span>Shape efficiency</span><strong>${rounded >= 100 ? "Maxed" : rounded >= 70 ? "Good" : rounded >= 45 ? "Needs work" : "Very loose"}</strong></div>
    </article>
    <article class="card defense-breakdown-card">
      <strong>Tips to improve</strong>
      ${summary.tips.map((tip) => `<div class="defense-tip">${tip}</div>`).join("")}
    </article>
  </div>`;
};

const economySourceLabelForTile = (tile: Tile, resource: Exclude<EconomyFocusKey, "ALL">): string => {
  if (resource === "GOLD") {
    if (tile.town) return "Towns";
    if (tile.dockId) return "Docks";
    if (tile.resource) return `${prettyToken(resourceLabel(tile.resource))} sites`;
    return tile.economicStructure ? `${economicStructureName(tile.economicStructure.type)} tiles` : "Settled land";
  }
  if (resource === "SHARD") return tile.town ? "Ancient towns" : "Shard sites";
  if (tile.resource) return prettyToken(resourceLabel(tile.resource));
  if (tile.town && resource === "FOOD") return "Town support";
  return tile.economicStructure ? economicStructureName(tile.economicStructure.type) : "Empire effects";
};

const accumulateEconomyBucket = (map: Map<string, EconomyBucket>, label: string, amountPerMinute: number): void => {
  if (amountPerMinute <= 0.0001) return;
  const current = map.get(label);
  if (current) {
    current.amountPerMinute += amountPerMinute;
    current.count += 1;
    return;
  }
  map.set(label, { label, amountPerMinute, count: 1 });
};

const setEconomyBucketNote = (map: Map<string, EconomyBucket>, label: string, note: string): void => {
  const bucket = map.get(label);
  if (bucket) bucket.note = note;
};

const resourceUpkeepPerMinute = (resource: Exclude<EconomyFocusKey, "ALL">): number => {
  if (resource === "GOLD") return state.upkeepPerMinute.gold;
  if (resource === "FOOD") return state.upkeepPerMinute.food;
  if (resource === "IRON") return state.upkeepPerMinute.iron;
  if (resource === "CRYSTAL") return state.upkeepPerMinute.crystal;
  if (resource === "SUPPLY") return state.upkeepPerMinute.supply;
  return 0;
};

const resourceNetPerMinute = (resource: Exclude<EconomyFocusKey, "ALL">): number => {
  if (resource === "GOLD") return state.incomePerMinute - state.upkeepPerMinute.gold;
  return state.strategicProductionPerMinute[resource] - resourceUpkeepPerMinute(resource);
};

const economyDetailForResource = (resource: Exclude<EconomyFocusKey, "ALL">): { sources: EconomyBucket[]; sinks: EconomyBucket[] } => {
  const sources = new Map<string, EconomyBucket>();
  const sinks = new Map<string, EconomyBucket>();
  let settledTileCount = 0;
  let fortCount = 0;
  let outpostCount = 0;
  let observatoryCount = 0;
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me || tile.terrain !== "LAND" || tile.ownershipState !== "SETTLED") continue;
    if (tile.fogged) continue;
    settledTileCount += 1;
    const amountPerMinute =
      resource === "GOLD"
        ? tile.yieldRate?.goldPerMinute ?? 0
        : Number(tile.yieldRate?.strategicPerDay?.[resource] ?? 0) / 1440;
    accumulateEconomyBucket(sources, economySourceLabelForTile(tile, resource), amountPerMinute);
    if (resource === "FOOD" && tile.town?.foodUpkeepPerMinute) {
      accumulateEconomyBucket(sinks, "Town upkeep", tile.town.foodUpkeepPerMinute);
    }
    if (tile.fort?.ownerId === state.me && tile.fort.status === "active") fortCount += 1;
    if (tile.siegeOutpost?.ownerId === state.me && tile.siegeOutpost.status === "active") outpostCount += 1;
    if (tile.observatory?.ownerId === state.me && tile.observatory.status === "active") observatoryCount += 1;
  }
  if (resource === "GOLD") {
    const settledUpkeep = (settledTileCount / 40) * 0.1;
    const fortUpkeep = fortCount * 0.2;
    const outpostUpkeep = outpostCount * 0.2;
    accumulateEconomyBucket(sinks, "Settled land upkeep", settledUpkeep);
    accumulateEconomyBucket(sinks, "Fort upkeep", fortUpkeep);
    accumulateEconomyBucket(sinks, "Siege outpost upkeep", outpostUpkeep);
    if (settledTileCount > 0) setEconomyBucketNote(sinks, "Settled land upkeep", `${settledTileCount} settled tiles`);
    if (fortCount > 0) setEconomyBucketNote(sinks, "Fort upkeep", `${fortCount} active fort${fortCount === 1 ? "" : "s"}`);
    if (outpostCount > 0) setEconomyBucketNote(sinks, "Siege outpost upkeep", `${outpostCount} active outpost${outpostCount === 1 ? "" : "s"}`);
  } else if (resource === "CRYSTAL") {
    const revealUpkeep = Math.min(1, state.activeRevealTargets.length) * 0.015;
    const observatoryUpkeep = observatoryCount * 0.025;
    accumulateEconomyBucket(sinks, "Empire reveal upkeep", revealUpkeep);
    accumulateEconomyBucket(sinks, "Observatory upkeep", observatoryUpkeep);
    if (state.activeRevealTargets.length > 0) setEconomyBucketNote(sinks, "Empire reveal upkeep", `${Math.min(1, state.activeRevealTargets.length)} active reveal`);
    if (observatoryCount > 0) setEconomyBucketNote(sinks, "Observatory upkeep", `${observatoryCount} active observator${observatoryCount === 1 ? "y" : "ies"}`);
  } else if (resource === "IRON") {
    const fortUpkeep = fortCount * 0.025;
    accumulateEconomyBucket(sinks, "Fort upkeep", fortUpkeep);
    if (fortCount > 0) setEconomyBucketNote(sinks, "Fort upkeep", `${fortCount} active fort${fortCount === 1 ? "" : "s"}`);
  } else if (resource === "SUPPLY") {
    const outpostUpkeep = outpostCount * 0.025;
    accumulateEconomyBucket(sinks, "Siege outpost upkeep", outpostUpkeep);
    if (outpostCount > 0) setEconomyBucketNote(sinks, "Siege outpost upkeep", `${outpostCount} active outpost${outpostCount === 1 ? "" : "s"}`);
  }
  const totalUpkeep = resourceUpkeepPerMinute(resource);
  const knownUpkeep = [...sinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0);
  const residualUpkeep = Math.max(0, totalUpkeep - knownUpkeep);
  if (residualUpkeep > 0.0001) {
    accumulateEconomyBucket(sinks, resource === "FOOD" ? "Other empire upkeep" : "Other upkeep modifiers", residualUpkeep);
  }
  return {
    sources: [...sources.values()].sort((a, b) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label)),
    sinks: [...sinks.values()].sort((a, b) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label))
  };
};

const openEconomyPanel = (focus: EconomyFocusKey = "ALL"): void => {
  state.economyFocus = focus;
  setActivePanel("economy");
};

const economySummaryCardHtml = (resource: Exclude<EconomyFocusKey, "ALL">, selected: boolean): string => {
  const stock = resource === "GOLD" ? state.gold : state.strategicResources[resource as Exclude<EconomyFocusKey, "ALL" | "GOLD">];
  const gross = resource === "GOLD" ? state.incomePerMinute : state.strategicProductionPerMinute[resource];
  const upkeep = resourceUpkeepPerMinute(resource);
  const net = resourceNetPerMinute(resource);
  const icon = resourceIconForKey(resource);
  const label = prettyToken(resource);
  return `<button class="economy-summary-card${selected ? " is-active" : ""}" type="button" data-economy-focus="${resource}">
    <div class="economy-summary-head"><span>${icon}</span><strong>${label}</strong></div>
    <div class="economy-summary-stock">${stock.toFixed(1)}</div>
    <div class="economy-summary-rates">
      <span>Gross ${gross.toFixed(2)}/m</span>
      <span>Upkeep ${upkeep.toFixed(2)}/m</span>
      <span class="economy-rate ${rateToneClass(net)}">Net ${net >= 0 ? "+" : ""}${net.toFixed(2)}/m</span>
    </div>
  </button>`;
};

const economyPanelHtml = (): string => {
  const focus = state.economyFocus;
  const resources: Array<Exclude<EconomyFocusKey, "ALL">> = ["GOLD", "FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"];
  const mobile = window.matchMedia("(max-width: 900px)").matches;
  const visibleResources = mobile ? [focus === "ALL" ? "GOLD" : focus] : focus === "ALL" ? resources : [focus];
  const totals = formatUpkeepSummary(state.upkeepPerMinute);
  return `
    <div class="economy-panel">
      <div class="economy-summary-grid">
        ${resources.map((resource) => economySummaryCardHtml(resource, resource === focus)).join("")}
      </div>
      ${totals ? `<div class="economy-overview-note">${mobile ? "Tap a resource above to switch the breakdown." : totals}</div>` : mobile ? `<div class="economy-overview-note">Tap a resource above to switch the breakdown.</div>` : ""}
      ${visibleResources
        .map((resource) => {
          const detail = economyDetailForResource(resource);
          const net = resourceNetPerMinute(resource);
          const stock = resource === "GOLD" ? state.gold : state.strategicResources[resource as Exclude<EconomyFocusKey, "ALL" | "GOLD">];
          return `<section class="economy-detail-card card">
            <div class="economy-detail-head">
              <div>
                <div class="economy-detail-kicker">${resourceIconForKey(resource)} ${prettyToken(resource)}</div>
                <strong>${stock.toFixed(1)} in reserve</strong>
              </div>
              <div class="economy-rate ${rateToneClass(net)}">${net >= 0 ? "+" : ""}${net.toFixed(2)}/m</div>
            </div>
            <div class="economy-detail-columns">
              <div class="economy-detail-column">
                <h4>Income Sources</h4>
                ${detail.sources.length > 0 ? detail.sources.map((bucket) => `<div class="economy-line"><span>${bucket.label}${bucket.count > 1 ? ` · ${bucket.count}` : ""}${bucket.note ? `<small>${bucket.note}</small>` : ""}</span><strong>+${bucket.amountPerMinute.toFixed(2)}/m</strong></div>`).join("") : '<div class="economy-line muted"><span>No current income</span></div>'}
              </div>
              <div class="economy-detail-column">
                <h4>Upkeep</h4>
                ${detail.sinks.length > 0 ? detail.sinks.map((bucket) => `<div class="economy-line is-negative"><span>${bucket.label}${bucket.count > 1 ? ` · ${bucket.count}` : ""}${bucket.note ? `<small>${bucket.note}</small>` : ""}</span><strong>-${bucket.amountPerMinute.toFixed(2)}/m</strong></div>`).join("") : '<div class="economy-line muted"><span>No upkeep on this resource</span></div>'}
              </div>
            </div>
            ${resource === "FOOD" ? `<div class="economy-footnote">Food coverage ${Math.round((state.upkeepLastTick.foodCoverage ?? 1) * 100)}% · unfed towns stop producing until food support catches up.</div>` : ""}
          </section>`;
        })
        .join("")}
    </div>
  `;
};
const rateToneClass = (rate: number): string => {
  if (rate > 0.001) return "positive";
  if (rate < -0.001) return "negative";
  return "neutral";
};
const prettyToken = (value: string): string =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
const combatResolutionSummary = (msg: Record<string, unknown>): string => {
  const origin = msg.origin as { x: number; y: number } | undefined;
  const target = msg.target as { x: number; y: number } | undefined;
  const attackType = prettyToken(String(msg.attackType ?? "ATTACK"));
  const attackerWon = Boolean(msg.attackerWon);
  const changes = (msg.changes as Array<{ x: number; y: number; ownerId?: string; ownershipState?: string }> | undefined) ?? [];
  const winnerName = playerNameForOwner(msg.winnerId as string | undefined) ?? String(msg.winnerId ?? "").slice(0, 8);
  const atkEff = typeof msg.atkEff === "number" ? msg.atkEff : undefined;
  const defEff = typeof msg.defEff === "number" ? msg.defEff : undefined;
  const winChance = typeof msg.winChance === "number" ? msg.winChance : undefined;
  const pointsDelta = typeof msg.pointsDelta === "number" ? msg.pointsDelta : 0;
  const bits = [`${attackType}: ${attackerWon ? "you captured the target" : "your attack failed"}`];
  if (origin && target) {
    bits.push(`from (${origin.x}, ${origin.y})`);
    bits.push(`into (${target.x}, ${target.y})`);
    if (attackerWon) {
      bits.push(`captured (${target.x}, ${target.y})`);
    } else if (changes.length === 0) {
      bits.push(`origin held at (${origin.x}, ${origin.y})`);
    } else {
      bits.push(`lost (${origin.x}, ${origin.y})`);
    }
  } else if (origin) {
    bits.push(attackerWon ? "target captured" : changes.length === 0 ? `origin held at (${origin.x}, ${origin.y})` : `lost (${origin.x}, ${origin.y})`);
  } else if (target) {
    bits.push(attackerWon ? `captured (${target.x}, ${target.y})` : `failed to take (${target.x}, ${target.y})`);
  } else {
    bits.push(attackerWon ? "target captured" : "attack failed");
  }
  bits.push(`winner ${winnerName}`);
  if (typeof winChance === "number") bits.push(`roll ${(winChance * 100).toFixed(0)}%`);
  if (typeof atkEff === "number" && typeof defEff === "number") bits.push(`atk ${atkEff.toFixed(1)} vs def ${defEff.toFixed(1)}`);
  if (pointsDelta > 0) bits.push(`+${pointsDelta.toFixed(1)} pts`);
  return bits.join(" · ");
};
const playerNameOrFallback = (ownerId: string | undefined): string => {
  if (!ownerId) return "neutral territory";
  if (ownerId === "barbarian") return "Barbarians";
  return playerNameForOwner(ownerId) ?? ownerId.slice(0, 8);
};

const conqueredTileLabel = (tile: Tile | undefined, target: { x: number; y: number } | undefined): string => {
  if (tile?.town) return "Town";
  if (tile?.resource) return prettyToken(resourceLabel(tile.resource));
  if (target) return prettyToken(terrainLabel(target.x, target.y, tile?.terrain ?? terrainAt(target.x, target.y)));
  return "Territory";
};

const combatResolutionAlert = (
  msg: Record<string, unknown>,
  context?: { targetTileBefore: Tile | undefined; originTileBefore: Tile | undefined }
): { title: string; detail: string; tone: "success" | "warn" } => {
  const attackType = typeof msg.attackType === "string" ? msg.attackType : "";
  const origin = msg.origin as { x: number; y: number } | undefined;
  const target = msg.target as { x: number; y: number } | undefined;
  const attackerWon = Boolean(msg.attackerWon);
  const changes = (msg.changes as Array<{ x: number; y: number; ownerId?: string; ownershipState?: string }> | undefined) ?? [];
  if (attackType === "SETTLE") {
    const settledChange = changes.find((change) => change.ownershipState === "SETTLED");
    const settledTarget = settledChange ? { x: settledChange.x, y: settledChange.y } : target;
    return {
      title: "Settlement Complete",
      detail: settledTarget ? `${prettyToken(terrainLabel(settledTarget.x, settledTarget.y, terrainAt(settledTarget.x, settledTarget.y)))} was settled.` : "Land was settled.",
      tone: "success"
    };
  }
  const targetOwnerName = playerNameOrFallback(context?.targetTileBefore?.ownerId);
  const targetLabel = conqueredTileLabel(context?.targetTileBefore, target);
  if (attackerWon) {
    return {
      title: "Victory",
      detail: `${targetLabel} was conquered from ${targetOwnerName}.`,
      tone: "success"
    };
  }
  const originLost = Boolean(origin && changes.some((change) => change.x === origin.x && change.y === origin.y));
  return {
    title: "Attack Beaten Back",
    detail: originLost && origin ? `Attack on ${targetOwnerName} was beaten back and we lost (${origin.x}, ${origin.y}).` : `Attack on ${targetOwnerName} was beaten back.`,
    tone: "warn"
  };
};
const terrainLabel = (x: number, y: number, terrain: Tile["terrain"]): string => {
  if (terrain !== "LAND") return terrain;
  const biome = landBiomeAt(x, y);
  if (biome === "GRASS") return isForestTile(x, y) ? "FOREST" : "GRASS";
  return "SAND";
};
const toroidDelta = (from: number, to: number, dim: number): number => {
  let d = to - from;
  if (d > dim / 2) d -= dim;
  if (d < -dim / 2) d += dim;
  return d;
};
const worldToScreen = (wx: number, wy: number, size: number, halfW: number, halfH: number): { sx: number; sy: number } => {
  const dx = toroidDelta(state.camX, wx, WORLD_WIDTH);
  const dy = toroidDelta(state.camY, wy, WORLD_HEIGHT);
  return {
    sx: (dx + halfW + 0.5) * size,
    sy: (dy + halfH + 0.5) * size
  };
};

const dockRouteKey = (ax: number, ay: number, bx: number, by: number): string => `${ax},${ay}->${bx},${by}`;
const manhattanToroid = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return dx + dy;
};
const manhattanLinear = (ax: number, ay: number, bx: number, by: number): number => Math.abs(ax - bx) + Math.abs(ay - by);
const nearestSeaNeighbor = (x: number, y: number, tx: number, ty: number): { x: number; y: number } | undefined => {
  const candidates = [
    { x: wrapX(x), y: wrapY(y - 1) },
    { x: wrapX(x + 1), y: wrapY(y) },
    { x: wrapX(x), y: wrapY(y + 1) },
    { x: wrapX(x - 1), y: wrapY(y) }
  ].filter((p) => terrainAt(p.x, p.y) === "SEA");
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => manhattanLinear(a.x, a.y, tx, ty) - manhattanLinear(b.x, b.y, tx, ty));
  return candidates[0];
};

const reconstructSeaPath = (cameFrom: Map<number, number>, endIdx: number): Array<{ x: number; y: number }> => {
  const out: Array<{ x: number; y: number }> = [];
  let cur = endIdx;
  while (true) {
    out.push({ x: cur % WORLD_WIDTH, y: Math.floor(cur / WORLD_WIDTH) });
    const prev = cameFrom.get(cur);
    if (prev === undefined) break;
    cur = prev;
  }
  out.reverse();
  return out;
};
const computeDockSeaRoute = (ax: number, ay: number, bx: number, by: number): Array<{ x: number; y: number }> => {
  const cacheK = dockRouteKey(ax, ay, bx, by);
  const cached = state.dockRouteCache.get(cacheK);
  if (cached) return cached;

  const aSea = nearestSeaNeighbor(ax, ay, bx, by);
  const bSea = nearestSeaNeighbor(bx, by, ax, ay);
  if (!aSea || !bSea) {
    state.dockRouteCache.set(cacheK, []);
    return [];
  }

  const start = worldIndex(aSea.x, aSea.y);
  const goal = worldIndex(bSea.x, bSea.y);
  const open: number[] = [start];
  const inOpen = new Set<number>([start]);
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[start, 0]]);
  const fScore = new Map<number, number>([[start, manhattanLinear(aSea.x, aSea.y, bSea.x, bSea.y)]]);
  const maxExpanded = 24_000;
  let expanded = 0;
  let solved = false;

  while (open.length > 0 && expanded < maxExpanded) {
    let bestI = 0;
    let bestF = fScore.get(open[0]!) ?? Number.POSITIVE_INFINITY;
    for (let i = 1; i < open.length; i += 1) {
      const score = fScore.get(open[i]!) ?? Number.POSITIVE_INFINITY;
      if (score < bestF) {
        bestF = score;
        bestI = i;
      }
    }
    const current = open.splice(bestI, 1)[0]!;
    inOpen.delete(current);
    expanded += 1;
    if (current === goal) {
      solved = true;
      break;
    }
    const cx = current % WORLD_WIDTH;
    const cy = Math.floor(current / WORLD_WIDTH);
    const neighbors = [
      { x: cx, y: cy - 1 },
      { x: cx + 1, y: cy },
      { x: cx, y: cy + 1 },
      { x: cx - 1, y: cy }
    ];
    for (const n of neighbors) {
      if (n.x < 0 || n.y < 0 || n.x >= WORLD_WIDTH || n.y >= WORLD_HEIGHT) continue;
      if (terrainAt(n.x, n.y) !== "SEA") continue;
      const ni = worldIndex(n.x, n.y);
      const tentative = (gScore.get(current) ?? Number.POSITIVE_INFINITY) + 1;
      if (tentative >= (gScore.get(ni) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(ni, current);
      gScore.set(ni, tentative);
      fScore.set(ni, tentative + manhattanLinear(n.x, n.y, bSea.x, bSea.y));
      if (!inOpen.has(ni)) {
        inOpen.add(ni);
        open.push(ni);
      }
    }
  }

  let seaPath: Array<{ x: number; y: number }> = [];
  if (solved) seaPath = reconstructSeaPath(cameFrom, goal);
  const route = seaPath;
  state.dockRouteCache.set(cacheK, route);
  return route;
};

const markDockDiscovered = (tile: Tile): void => {
  if (tile.dockId && !tile.fogged) state.discoveredDockTiles.add(key(tile.x, tile.y));
};

const isDockRouteVisibleForPlayer = (pair: DockPair): boolean => {
  if (state.fogDisabled) return true;
  if (state.selected && ((state.selected.x === pair.ax && state.selected.y === pair.ay) || (state.selected.x === pair.bx && state.selected.y === pair.by))) {
    return true;
  }
  return state.discoveredDockTiles.has(key(pair.ax, pair.ay)) && state.discoveredDockTiles.has(key(pair.bx, pair.by));
};

const buildMiniMapBase = (): void => {
  const w = miniMapBase.width;
  const h = miniMapBase.height;
  miniMapBaseCtx.clearRect(0, 0, w, h);
  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      const wx = Math.floor((px / w) * WORLD_WIDTH);
      const wy = Math.floor((py / h) * WORLD_HEIGHT);
      const tt = terrainAt(wx, wy);
      miniMapBaseCtx.fillStyle = cachedTerrainColorAt(wx, wy, tt);
      miniMapBaseCtx.fillRect(px, py, 1, 1);
    }
  }
  miniMapBaseReady = true;
  miniMapLastDrawCamX = Number.NaN;
};

const drawMiniMap = (): void => {
  const nowMs = performance.now();
  const miniMapChanged = state.camX !== miniMapLastDrawCamX || state.camY !== miniMapLastDrawCamY || state.zoom !== miniMapLastDrawZoom;
  if (!miniMapChanged && nowMs - miniMapLastDrawAt < 140) return;
  const w = miniMapEl.width;
  const h = miniMapEl.height;
  miniMapCtx.clearRect(0, 0, w, h);
  if (!miniMapBaseReady) {
    miniMapCtx.fillStyle = "#0b1320";
    miniMapCtx.fillRect(0, 0, w, h);
    miniMapCtx.strokeStyle = "rgba(255,255,255,0.25)";
    miniMapCtx.strokeRect(0.5, 0.5, w - 1, h - 1);
    return;
  }
  miniMapCtx.drawImage(miniMapBase, 0, 0);
  if (!state.fogDisabled) {
    for (let py = 0; py < h; py += 1) {
      for (let px = 0; px < w; px += 1) {
        const wx = Math.floor((px / w) * WORLD_WIDTH);
        const wy = Math.floor((py / h) * WORLD_HEIGHT);
        const t = state.tiles.get(key(wx, wy));
        const vis = tileVisibilityStateAt(wx, wy, t);
        if (vis === "unexplored") {
          miniMapCtx.fillStyle = "#000000";
          miniMapCtx.fillRect(px, py, 1, 1);
        } else if (vis === "fogged") {
          miniMapCtx.fillStyle = "rgba(0,0,0,0.62)";
          miniMapCtx.fillRect(px, py, 1, 1);
        }
      }
    }
  }

  const viewTilesW = canvas.width / state.zoom;
  const viewTilesH = canvas.height / state.zoom;
  const vx = ((state.camX - viewTilesW / 2 + WORLD_WIDTH) % WORLD_WIDTH) / WORLD_WIDTH;
  const vy = ((state.camY - viewTilesH / 2 + WORLD_HEIGHT) % WORLD_HEIGHT) / WORLD_HEIGHT;
  const vw = Math.min(1, viewTilesW / WORLD_WIDTH);
  const vh = Math.min(1, viewTilesH / WORLD_HEIGHT);

  miniMapCtx.strokeStyle = "rgba(255, 240, 180, 0.95)";
  miniMapCtx.lineWidth = 1.5;
  miniMapCtx.strokeRect(vx * w, vy * h, Math.max(2, vw * w), Math.max(2, vh * h));

  const px = (state.camX / WORLD_WIDTH) * w;
  const py = (state.camY / WORLD_HEIGHT) * h;
  miniMapCtx.fillStyle = "#ffd166";
  miniMapCtx.beginPath();
  miniMapCtx.arc(px, py, 2.8, 0, Math.PI * 2);
  miniMapCtx.fill();

  // Dock hints on minimap for faster navigation/discovery.
  miniMapCtx.fillStyle = "rgba(127, 238, 255, 0.9)";
  for (const pair of state.dockPairs) {
    if (!isDockRouteVisibleForPlayer(pair)) continue;
    const aKnown = state.tiles.get(key(pair.ax, pair.ay));
    const bKnown = state.tiles.get(key(pair.bx, pair.by));
    if (!state.fogDisabled && ((!aKnown || aKnown.fogged) && (!bKnown || bKnown.fogged))) continue;
    const adx = Math.floor((pair.ax / WORLD_WIDTH) * w);
    const ady = Math.floor((pair.ay / WORLD_HEIGHT) * h);
    const bdx = Math.floor((pair.bx / WORLD_WIDTH) * w);
    const bdy = Math.floor((pair.by / WORLD_HEIGHT) * h);
    miniMapCtx.fillRect(adx - 1, ady - 1, 3, 3);
    miniMapCtx.fillRect(bdx - 1, bdy - 1, 3, 3);
  }
  for (const t of state.tiles.values()) {
    if (!t.town) continue;
    if (!state.fogDisabled && t.fogged) continue;
    const tx = Math.floor((t.x / WORLD_WIDTH) * w);
    const ty = Math.floor((t.y / WORLD_HEIGHT) * h);
    miniMapCtx.fillStyle = !t.town.isFed ? "rgba(255, 112, 92, 0.94)" : "rgba(6, 10, 18, 0.86)";
    miniMapCtx.beginPath();
    miniMapCtx.arc(tx, ty, hasCollectableYield(t) ? 3.6 : 3.2, 0, Math.PI * 2);
    miniMapCtx.fill();
    if (!t.town.isFed) miniMapCtx.fillStyle = "rgba(255, 167, 148, 0.96)";
    else if (hasCollectableYield(t)) miniMapCtx.fillStyle = "rgba(255, 220, 118, 0.96)";
    else if (t.town.type === "MARKET") miniMapCtx.fillStyle = "rgba(255, 214, 112, 0.94)";
    else if (t.town.type === "FARMING") miniMapCtx.fillStyle = "rgba(157, 236, 130, 0.94)";
    else miniMapCtx.fillStyle = "rgba(196, 169, 255, 0.94)";
    miniMapCtx.beginPath();
    miniMapCtx.arc(tx, ty, hasCollectableYield(t) ? 2.1 : 1.8, 0, Math.PI * 2);
    miniMapCtx.fill();
  }
  miniMapLastDrawCamX = state.camX;
  miniMapLastDrawCamY = state.camY;
  miniMapLastDrawZoom = state.zoom;
  miniMapLastDrawAt = nowMs;
};

const pushFeed = (msg: string, type: FeedType = "info", severity: FeedSeverity = "info"): void => {
  state.feed.unshift({ text: msg, type, severity, at: Date.now() });
  state.feed = state.feed.slice(0, 18);
};

const showCaptureAlert = (title: string, detail: string, tone: "success" | "error" | "warn" = "error"): void => {
  state.captureAlert = { title, detail, until: Date.now() + 12_000, tone };
};

const notifyInsufficientGoldForFrontierAction = (action: "claim" | "attack"): void => {
  const label = action === "claim" ? "Frontier claim" : "Attack";
  const detail = `${label} costs ${formatGoldAmount(FRONTIER_CLAIM_COST)} gold. You have ${formatGoldAmount(state.gold)}.`;
  showCaptureAlert("Insufficient gold", detail, "error");
  pushFeed(detail, "combat", "warn");
};

const showCollectVisibleCooldownAlert = (): void => {
  const remaining = state.collectVisibleCooldownUntil - Date.now();
  if (remaining <= 0) return;
  state.captureAlert = {
    title: "Collect Visible Cooldown",
    detail: `Retry in ${formatCooldownShort(remaining)}.`,
    until: state.collectVisibleCooldownUntil,
    tone: "warn"
  };
};

const centerOnOwnedTile = (): void => {
  const own = [...state.tiles.values()].find((t) => t.ownerId === state.me);
  if (own) {
    state.camX = own.x;
    state.camY = own.y;
    return;
  }
  if (state.homeTile) {
    state.camX = state.homeTile.x;
    state.camY = state.homeTile.y;
  }
};

const requestViewRefresh = (radius = 2, force = false): void => {
  if (ws.readyState !== ws.OPEN) return;
  if (!state.authSessionReady) return;
  const effectiveRadius = state.fogDisabled ? FULL_MAP_CHUNK_RADIUS : radius;
  const cx = Math.floor(state.camX / CHUNK_SIZE);
  const cy = Math.floor(state.camY / CHUNK_SIZE);
  const elapsed = Date.now() - state.lastSubAt;
  const sameSub = cx === state.lastSubCx && cy === state.lastSubCy && effectiveRadius === state.lastSubRadius;
  if (!force && sameSub && elapsed < 700) return;
  state.lastSubCx = cx;
  state.lastSubCy = cy;
  state.lastSubRadius = effectiveRadius;
  state.lastSubAt = Date.now();
  ws.send(
    JSON.stringify({
      type: "SUBSCRIBE_CHUNKS",
      cx,
      cy,
      radius: effectiveRadius
    })
  );
};

const maybeRefreshForCamera = (force = false): void => {
  if (ws.readyState !== ws.OPEN) return;
  if (!state.authSessionReady) return;
  if (!force && (state.actionInFlight || state.capture || state.actionQueue.length > 0)) return;
  const cx = Math.floor(state.camX / CHUNK_SIZE);
  const cy = Math.floor(state.camY / CHUNK_SIZE);
  const chunkChanged = cx !== state.lastSubCx || cy !== state.lastSubCy;
  if (force || chunkChanged) requestViewRefresh();
};

const isMobile = (): boolean => window.matchMedia("(max-width: 900px)").matches;

const panelTitle = (panel: NonNullable<typeof state.activePanel>): string => {
  if (panel === "missions") return "Missions";
  if (panel === "tech") return "Technology Tree";
  if (panel === "alliance") return "Alliances";
  if (panel === "economy") return "Economy";
  if (panel === "defensibility") return "Defensibility";
  if (panel === "leaderboard") return "Leaderboard";
  if (panel === "feed") return "Activity Feed";
  return "Player Identity";
};

const panelToMobile = (panel: NonNullable<typeof state.activePanel>): typeof state.mobilePanel => {
  if (panel === "missions") return "missions";
  if (panel === "tech") return "tech";
  if (panel === "alliance") return "social";
  if (panel === "defensibility") return "defensibility";
  if (panel === "economy") return "economy";
  return "intel";
};

const mobileNavLabelHtml = (panel: typeof state.mobilePanel, opts?: { techReady?: boolean; attackAlertUnread?: boolean }): string => {
  if (panel === "core") return '<span class="tab-icon">⌂</span>';
  if (panel === "missions") return '<span class="tab-icon">◎</span>';
  if (panel === "tech") {
    return opts?.techReady
      ? '<span class="tab-icon">⚡</span><span class="tech-ready-dot" aria-label="upgrade available"></span>'
      : '<span class="tab-icon">⚡</span>';
  }
  if (panel === "social") return '<span class="tab-icon">👥</span>';
  return opts?.attackAlertUnread
    ? '<span class="tab-icon">🔔</span><span class="attack-alert-dot" aria-label="under attack">🔥</span>'
    : '<span class="tab-icon">🔔</span>';
};

const viewportSize = (): { width: number; height: number } => {
  const vv = window.visualViewport;
  if (vv) return { width: Math.round(vv.width), height: Math.round(vv.height) };
  return { width: window.innerWidth, height: window.innerHeight };
};

const setActivePanel = (panel: typeof state.activePanel): void => {
  if (state.activePanel === panel) {
    state.activePanel = null;
    renderMobilePanels();
    return;
  }
  state.activePanel = panel;
  if (panel === "feed") state.unreadAttackAlerts = 0;
  if (isMobile() && panel) {
    state.mobilePanel = panelToMobile(panel);
    if (state.mobilePanel === "intel") state.unreadAttackAlerts = 0;
  }
  renderMobilePanels();
};

const renderMobilePanels = (): void => {
  const nav = hud.querySelector<HTMLDivElement>("#mobile-nav");
  if (!nav) return;

  panelActionButtons.forEach((btn) => {
    const panel = btn.dataset.panel as typeof state.activePanel;
    btn.classList.toggle("active", panel === state.activePanel);
  });

  const sideSections = sidePanelBodyEl.querySelectorAll<HTMLElement>(".panel-body");
  sideSections.forEach((s) => {
    s.style.display = s.id === `panel-${state.activePanel}` ? "grid" : "none";
  });
  sidePanelEl.classList.toggle("tech-panel-active", state.activePanel === "tech" && state.techTreeExpanded);
  mobileSheetEl.classList.toggle("tech-panel-active", state.mobilePanel === "tech" && state.techTreeExpanded);

  if (!isMobile()) {
    nav.style.display = "none";
    mobileSheetEl.style.display = "none";
    mobileCoreEl.style.display = "none";
    sidePanelEl.style.display = state.activePanel ? "grid" : "none";
    if (state.activePanel) panelTitleEl.textContent = panelTitle(state.activePanel);
    return;
  }

  sidePanelEl.style.display = "none";
  nav.style.display = "grid";
  mobileCoreEl.style.display = state.mobilePanel === "core" ? "grid" : "none";
  mobileSheetEl.style.display = state.mobilePanel === "core" ? "none" : "grid";

  const mobileSections: Array<[HTMLElement, typeof state.mobilePanel]> = [
    [mobilePanelCoreEl, "core"],
    [mobilePanelMissionsEl, "missions"],
    [mobilePanelTechEl, "tech"],
    [mobilePanelSocialEl, "social"],
    [mobilePanelDefensibilityEl, "defensibility"],
    [mobilePanelEconomyEl, "economy"],
    [mobilePanelIntelEl, "intel"]
  ];
  for (const [el, panel] of mobileSections) {
    el.style.display = panel === state.mobilePanel ? "grid" : "none";
  }

  if (state.mobilePanel === "missions") mobileSheetHeadEl.textContent = "Missions";
  else if (state.mobilePanel === "tech") mobileSheetHeadEl.textContent = "Technology Tree";
  else if (state.mobilePanel === "social") mobileSheetHeadEl.textContent = "Alliances";
  else if (state.mobilePanel === "defensibility") mobileSheetHeadEl.textContent = "Defensibility";
  else if (state.mobilePanel === "economy") mobileSheetHeadEl.textContent = "Economy";
  else if (state.mobilePanel === "intel") mobileSheetHeadEl.textContent = "Intel";
  else mobileSheetHeadEl.textContent = "Core";

  const buttons = nav.querySelectorAll<HTMLButtonElement>("button[data-mobile-panel]");
  buttons.forEach((b) => {
    const panel = b.dataset.mobilePanel as typeof state.mobilePanel | undefined;
    if (panel) b.innerHTML = mobileNavLabelHtml(panel);
    b.classList.toggle("active", panel === state.mobilePanel);
  });
};

const bindTechTreeDragScroll = (): void => {
  const scrollRegions = hud.querySelectorAll<HTMLElement>("[data-tech-tree-scroll]");
  scrollRegions.forEach((region) => {
    if (region.dataset.dragBound === "1") return;
    region.dataset.dragBound = "1";
    region.scrollLeft = state.techTreeScrollLeft;
    region.scrollTop = state.techTreeScrollTop;
    let pointerId = -1;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    const release = (): void => {
      if (pointerId !== -1) {
        try {
          region.releasePointerCapture(pointerId);
        } catch {
          // Ignore if pointer capture was not established.
        }
      }
      pointerId = -1;
      region.classList.remove("dragging");
    };
    region.onpointerdown = (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const target = event.target;
      if (event.pointerType === "mouse" && target instanceof Element && target.closest("[data-tech-card]")) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = region.scrollLeft;
      startTop = region.scrollTop;
      region.classList.add("dragging");
      region.setPointerCapture(event.pointerId);
      if (event.pointerType !== "mouse") event.preventDefault();
    };
    region.onpointermove = (event) => {
      if (event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      region.scrollLeft = startLeft - dx;
      region.scrollTop = startTop - dy;
      state.techTreeScrollLeft = region.scrollLeft;
      state.techTreeScrollTop = region.scrollTop;
      if (event.pointerType !== "mouse") event.preventDefault();
    };
    region.onscroll = () => {
      state.techTreeScrollLeft = region.scrollLeft;
      state.techTreeScrollTop = region.scrollTop;
    };
    region.onpointerup = release;
    region.onpointercancel = release;
    region.onlostpointercapture = release;
  });
};

const selectedTile = (): Tile | undefined => {
  if (!state.selected) return undefined;
  const existing = state.tiles.get(key(state.selected.x, state.selected.y));
  if (existing) return existing;
  const visibility = tileVisibilityStateAt(state.selected.x, state.selected.y);
  if (visibility === "unexplored") return undefined;
  return {
    x: state.selected.x,
    y: state.selected.y,
    terrain: terrainAt(state.selected.x, state.selected.y),
    fogged: visibility !== "visible"
  };
};

const applyOptimisticTileState = (
  x: number,
  y: number,
  mutate: (tile: Tile) => void
): void => {
  const tileKey = key(x, y);
  if (!state.optimisticTileSnapshots.has(tileKey)) {
    const existing = state.tiles.get(tileKey);
    state.optimisticTileSnapshots.set(tileKey, existing ? { ...existing } : undefined);
  }
  const current =
    state.tiles.get(tileKey) ??
    ({
      x,
      y,
      terrain: terrainAt(x, y),
      fogged: false
    } satisfies Tile);
  const next = { ...current };
  mutate(next);
  state.tiles.set(tileKey, next);
  if (!next.fogged) state.discoveredTiles.add(tileKey);
};

const clearOptimisticTileState = (tileKey: string, revert = false): void => {
  if (!state.optimisticTileSnapshots.has(tileKey)) return;
  const previous = state.optimisticTileSnapshots.get(tileKey);
  state.optimisticTileSnapshots.delete(tileKey);
  if (!revert) {
    const current = state.tiles.get(tileKey);
    if (current?.optimisticPending) {
      const next = { ...current };
      delete next.optimisticPending;
      state.tiles.set(tileKey, next);
    }
    return;
  }
  if (previous) {
    state.tiles.set(tileKey, previous);
    if (!previous.fogged) state.discoveredTiles.add(tileKey);
    else state.discoveredTiles.delete(tileKey);
  } else {
    state.tiles.delete(tileKey);
    state.discoveredTiles.delete(tileKey);
  }
};

const tileHasStructureKind = (tile: Tile, kind: OptimisticStructureKind): boolean => {
  if (kind === "FORT") return Boolean(tile.fort);
  if (kind === "OBSERVATORY") return Boolean(tile.observatory);
  if (kind === "SIEGE_OUTPOST") return Boolean(tile.siegeOutpost);
  return tile.economicStructure?.type === kind;
};

const tileHasUnderConstructionStructureKind = (tile: Tile, kind: OptimisticStructureKind): boolean => {
  if (kind === "FORT") return tile.fort?.status === "under_construction";
  if (kind === "OBSERVATORY") return tile.observatory?.status === "under_construction";
  if (kind === "SIEGE_OUTPOST") return tile.siegeOutpost?.status === "under_construction";
  return tile.economicStructure?.type === kind && tile.economicStructure?.status === "under_construction";
};

const applyOptimisticStructureBuild = (x: number, y: number, kind: OptimisticStructureKind): void => {
  const completesAt =
    Date.now() +
    (kind === "FORT"
      ? FORT_BUILD_MS
      : kind === "OBSERVATORY"
        ? OBSERVATORY_BUILD_MS
        : kind === "SIEGE_OUTPOST"
          ? SIEGE_OUTPOST_BUILD_MS
          : ECONOMIC_STRUCTURE_BUILD_MS);
  applyOptimisticTileState(x, y, (tile) => {
    tile.optimisticPending = "structure_build";
    if (kind === "FORT") {
      tile.fort = { ownerId: state.me, status: "under_construction", completesAt };
      return;
    }
    if (kind === "OBSERVATORY") {
      tile.observatory = { ownerId: state.me, status: "under_construction", completesAt };
      return;
    }
    if (kind === "SIEGE_OUTPOST") {
      tile.siegeOutpost = { ownerId: state.me, status: "under_construction", completesAt };
      return;
    }
    tile.economicStructure = { ownerId: state.me, type: kind, status: "under_construction", completesAt };
  });
};

const applyOptimisticStructureCancel = (x: number, y: number): void => {
  applyOptimisticTileState(x, y, (tile) => {
    tile.optimisticPending = "structure_cancel";
    delete tile.fort;
    delete tile.observatory;
    delete tile.siegeOutpost;
    delete tile.economicStructure;
  });
};

const shouldPreserveOptimisticExpand = (tileKey: string): boolean => {
  if (!tileKey) return false;
  const tile = state.tiles.get(tileKey);
  return tile?.ownerId === state.me && tile.optimisticPending === "expand";
};

const mergeServerTileWithOptimisticState = (incoming: Tile): Tile => {
  const tileKey = key(incoming.x, incoming.y);
  const existing = state.tiles.get(tileKey);
  const settlementProgress = state.settleProgressByTile.get(tileKey);
  if (settlementProgress && (existing?.ownerId === state.me || incoming.ownerId === state.me)) {
    return {
      ...incoming,
      ownerId: state.me,
      ownershipState: settlementProgress.awaitingServerConfirm ? "SETTLED" : existing?.ownershipState === "SETTLED" ? "SETTLED" : "FRONTIER",
      fogged: false,
      optimisticPending: "settle"
    };
  }
  if (!existing?.optimisticPending || existing.ownerId !== state.me) return incoming;
  if (existing.optimisticPending === "expand") {
    if (incoming.ownerId === state.me && incoming.ownershipState === "FRONTIER") return incoming;
    const merged: Tile = {
      ...incoming,
      ownerId: existing.ownerId,
      fogged: false,
      optimisticPending: existing.optimisticPending
    };
    if (existing.ownershipState) merged.ownershipState = existing.ownershipState;
    return merged;
  }
  if (existing.optimisticPending === "settle") {
    if (incoming.ownerId === state.me && incoming.ownershipState === "SETTLED") return incoming;
    return {
      ...incoming,
      ownerId: existing.ownerId,
      ownershipState: "SETTLED",
      fogged: false,
      optimisticPending: existing.optimisticPending
    };
  }
  if (existing.optimisticPending === "structure_build") {
    const optimisticKind =
      existing.fort?.status === "under_construction"
        ? "FORT"
        : existing.observatory?.status === "under_construction"
          ? "OBSERVATORY"
          : existing.siegeOutpost?.status === "under_construction"
            ? "SIEGE_OUTPOST"
            : existing.economicStructure?.status === "under_construction"
              ? existing.economicStructure.type
              : undefined;
    if (!optimisticKind) return incoming;
    if (tileHasStructureKind(incoming, optimisticKind)) return incoming;
    const merged: Tile = {
      ...incoming,
      optimisticPending: existing.optimisticPending
    };
    if (existing.fort) merged.fort = existing.fort;
    if (existing.observatory) merged.observatory = existing.observatory;
    if (existing.siegeOutpost) merged.siegeOutpost = existing.siegeOutpost;
    if (existing.economicStructure) merged.economicStructure = existing.economicStructure;
    return merged;
  }
  if (existing.optimisticPending === "structure_cancel") {
    const previous = state.optimisticTileSnapshots.get(tileKey);
    const cancelledKind =
      previous?.fort?.status === "under_construction"
        ? "FORT"
        : previous?.observatory?.status === "under_construction"
          ? "OBSERVATORY"
          : previous?.siegeOutpost?.status === "under_construction"
            ? "SIEGE_OUTPOST"
            : previous?.economicStructure?.status === "under_construction"
              ? previous.economicStructure.type
              : undefined;
    if (!cancelledKind) return incoming;
    if (!tileHasUnderConstructionStructureKind(incoming, cancelledKind)) return incoming;
    const merged: Tile = {
      ...incoming,
      optimisticPending: existing.optimisticPending
    };
    delete merged.fort;
    delete merged.observatory;
    delete merged.siegeOutpost;
    delete merged.economicStructure;
    return merged;
  }
  return incoming;
};

const handleTileSelection = (wx: number, wy: number, clientX: number, clientY: number): void => {
  if (holdActivated) {
    holdActivated = false;
    return;
  }
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  hideHoldBuildMenu();
  hideTileActionMenu();

  const clicked = state.tiles.get(key(wx, wy));
  const vis = tileVisibilityStateAt(wx, wy, clicked);
  if (state.crystalTargeting.active) {
    if (vis === "unexplored") {
      renderHud();
      return;
    }
    if (clicked) state.selected = { x: wx, y: wy };
    if (clicked && executeCrystalTargeting(clicked)) {
      renderHud();
      return;
    }
    if (clicked && vis === "visible") {
      pushFeed(`${crystalTargetingTitle(state.crystalTargeting.ability)} can only target highlighted tiles.`, "combat", "warn");
    }
    renderHud();
    return;
  }
  if (vis === "unexplored") {
    state.selected = undefined;
    renderHud();
    return;
  }
  if (vis === "fogged") {
    state.selected = { x: wx, y: wy };
    state.attackPreview = undefined;
    state.attackPreviewPendingKey = "";
    renderHud();
    return;
  }
  if (!clicked) {
    state.selected = { x: wx, y: wy };
    state.attackPreview = undefined;
    state.attackPreviewPendingKey = "";
    renderHud();
    return;
  }

  const to = clicked;
  state.selected = { x: wx, y: wy };
  const adjacentFromOwned = pickOriginForTarget(to.x, to.y);
  const frontierOrigin = pickOriginForTarget(to.x, to.y, false);
  const navalOrigin = to.terrain === "LAND" ? findNavalInfiltrationOriginForTarget(to) : undefined;
  const unreachableForeignClick =
    to.terrain === "LAND" &&
    !to.fogged &&
    to.ownerId !== state.me &&
    !isTileOwnedByAlly(to) &&
    !adjacentFromOwned &&
    !to.dockId &&
    !navalOrigin;
  if (unreachableForeignClick) {
    pushFeed("Target is not connected to your border.", "combat", "warn");
    requestAttackPreviewForHover();
    renderHud();
    return;
  }
  if (to.terrain === "LAND" && !to.fogged && !to.ownerId && frontierOrigin) {
    if (!canAffordCost(state.gold, FRONTIER_CLAIM_COST)) {
      notifyInsufficientGoldForFrontierAction("claim");
      requestAttackPreviewForHover();
      renderHud();
      return;
    }
    if (enqueueTarget(to.x, to.y, "normal")) {
      processActionQueue();
      pushFeed(`Queued frontier capture (${to.x}, ${to.y}).`, "combat", "info");
    }
    requestAttackPreviewForHover();
    renderHud();
    return;
  }
  openSingleTileActionMenu(to, clientX, clientY);
  requestAttackPreviewForHover();
  renderHud();
};

const isTownSupportNeighbor = (tx: number, ty: number, sx: number, sy: number): boolean => {
  const dx = Math.min(Math.abs(tx - sx), WORLD_WIDTH - Math.abs(tx - sx));
  const dy = Math.min(Math.abs(ty - sy), WORLD_HEIGHT - Math.abs(ty - sy));
  if (dx === 0 && dy === 0) return false;
  return dx <= 1 && dy <= 1;
};

const isTownSupportHighlightableTile = (tile: Tile | undefined): boolean => {
  if (!tile) return false;
  if (tile.terrain !== "LAND") return false;
  if (tile.dockId) return false;
  return true;
};

const supportedOwnedTownsForTile = (tile: Tile): Tile[] => {
  const out: Tile[] = [];
  for (const candidate of state.tiles.values()) {
    if (!candidate.town || candidate.ownerId !== state.me || candidate.ownershipState !== "SETTLED") continue;
    if (!isTownSupportNeighbor(tile.x, tile.y, candidate.x, candidate.y)) continue;
    out.push(candidate);
  }
  return out.sort((a, b) => a.x - b.x || a.y - b.y);
};

const supportedOwnedDocksForTile = (tile: Tile): Tile[] => {
  const out: Tile[] = [];
  for (const candidate of state.tiles.values()) {
    if (!candidate.dockId || candidate.ownerId !== state.me || candidate.ownershipState !== "SETTLED") continue;
    if (!isTownSupportNeighbor(tile.x, tile.y, candidate.x, candidate.y)) continue;
    out.push(candidate);
  }
  return out.sort((a, b) => a.x - b.x || a.y - b.y);
};

const growthDeltaPctLabel = (population: number, deltaPerMinute: number): string => {
  if (population <= 0) return "0.00%/m";
  const pct = (deltaPerMinute / population) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%/m`;
};

const townNextPopulationMilestone = (
  town: NonNullable<Tile["town"]>
): { label: string; targetPopulation: number } | undefined => {
  if (town.populationTier === "TOWN") return { label: "City", targetPopulation: 100_000 };
  if (town.populationTier === "CITY") return { label: "Great City", targetPopulation: 1_000_000 };
  if (town.populationTier === "GREAT_CITY") return { label: "Metropolis", targetPopulation: 5_000_000 };
  return undefined;
};

const formatRoughMinutes = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) return "now";
  if (minutes < 60) return `${Math.ceil(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.ceil(hours)}h`;
  const days = hours / 24;
  if (days < 14) return `${Math.ceil(days)}d`;
  const weeks = days / 7;
  return `${Math.ceil(weeks)}w`;
};

const townNextGrowthEtaLabel = (town: NonNullable<Tile["town"]>): string => {
  const milestone = townNextPopulationMilestone(town);
  if (!milestone) return "Max tier reached";
  const growth = town.populationGrowthPerMinute ?? 0;
  if (growth <= 0) return `${milestone.label} growth paused`;
  const remainingPopulation = Math.max(0, milestone.targetPopulation - town.population);
  if (remainingPopulation <= 0) return `${milestone.label} ready`;
  return `${milestone.label} in ~${formatRoughMinutes(remainingPopulation / growth)}`;
};
const hoverTile = (): Tile | undefined => {
  if (!state.hover) return undefined;
  return state.tiles.get(key(state.hover.x, state.hover.y));
};

const isAdjacent = (ax: number, ay: number, bx: number, by: number): boolean => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);
};

const isAdjacentCardinal = (ax: number, ay: number, bx: number, by: number): boolean => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
};

const dockDestinationsFor = (dx: number, dy: number): Array<{ x: number; y: number }> => {
  const out: Array<{ x: number; y: number }> = [];
  const seen = new Set<string>();
  for (const pair of state.dockPairs) {
    if (pair.ax === dx && pair.ay === dy) {
      const k = key(pair.bx, pair.by);
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ x: pair.bx, y: pair.by });
      }
    }
    if (pair.bx === dx && pair.by === dy) {
      const k = key(pair.ax, pair.ay);
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ x: pair.ax, y: pair.ay });
      }
    }
  }
  return out;
};

const pickDockOriginForTarget = (
  tx: number,
  ty: number,
  allowAdjacentToDock = true,
  allowOptimisticExpandOrigin = true
): Tile | undefined => {
  for (const t of state.tiles.values()) {
    if (
      t.ownerId !== state.me ||
      t.terrain !== "LAND" ||
      t.fogged ||
      !t.dockId ||
      (!allowOptimisticExpandOrigin && t.optimisticPending === "expand")
    ) continue;
    const linked = dockDestinationsFor(t.x, t.y);
    for (const d of linked) {
      if ((d.x === tx && d.y === ty) || (allowAdjacentToDock && isAdjacent(d.x, d.y, tx, ty))) return t;
    }
  }
  return undefined;
};

const pickOriginForTarget = (
  tx: number,
  ty: number,
  allowAdjacentToDock = true,
  allowOptimisticExpandOrigin = true
): Tile | undefined => {
  const candidates = [
    state.tiles.get(key(wrapX(tx), wrapY(ty - 1))),
    state.tiles.get(key(wrapX(tx + 1), wrapY(ty))),
    state.tiles.get(key(wrapX(tx), wrapY(ty + 1))),
    state.tiles.get(key(wrapX(tx - 1), wrapY(ty))),
    state.tiles.get(key(wrapX(tx - 1), wrapY(ty - 1))),
    state.tiles.get(key(wrapX(tx + 1), wrapY(ty - 1))),
    state.tiles.get(key(wrapX(tx + 1), wrapY(ty + 1))),
    state.tiles.get(key(wrapX(tx - 1), wrapY(ty + 1)))
  ].filter((t): t is Tile => Boolean(t));
  const adjacent = candidates.find((t) => t.ownerId === state.me && (allowOptimisticExpandOrigin || t.optimisticPending !== "expand"));
  if (adjacent) return adjacent;
  return pickDockOriginForTarget(tx, ty, allowAdjacentToDock, allowOptimisticExpandOrigin);
};

const startingExpansionArrowTargets = (): Array<{ x: number; y: number; dx: number; dy: number }> => {
  if (!state.homeTile) return [];
  if (state.actionInFlight || state.capture || state.actionQueue.length > 0 || state.settleProgressByTile.size > 0) return [];
  const homeKey = key(state.homeTile.x, state.homeTile.y);
  const home = state.tiles.get(homeKey);
  if (!home || home.fogged || home.ownerId !== state.me || home.ownershipState !== "SETTLED") return [];
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me) continue;
    if (key(tile.x, tile.y) === homeKey) continue;
    if (tile.ownershipState === "FRONTIER" || tile.ownershipState === "SETTLED") return [];
  }

  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: -1, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: 1, dy: 1 },
    { dx: -1, dy: 1 }
  ];
  const out: Array<{ x: number; y: number; dx: number; dy: number }> = [];
  for (const dir of dirs) {
    const x = wrapX(state.homeTile.x + dir.dx);
    const y = wrapY(state.homeTile.y + dir.dy);
    const tile = state.tiles.get(key(x, y));
    if (!tile || tile.fogged || tile.terrain !== "LAND" || tile.ownerId) continue;
    if (!pickOriginForTarget(x, y, false)) continue;
    out.push({ x, y, dx: dir.dx, dy: dir.dy });
  }
  return out;
};

const renderCaptureProgress = (): void => {
  if (state.captureAlert && state.captureAlert.until > Date.now()) {
    if (state.captureAlert.title === "Collect Visible Cooldown") {
      const remaining = state.collectVisibleCooldownUntil - Date.now();
      if (remaining > 0) state.captureAlert.detail = `Retry in ${formatCooldownShort(remaining)}.`;
      else state.captureAlert = undefined;
    }
  }
  if (state.captureAlert && state.captureAlert.until > Date.now()) {
    captureCardEl.dataset.state = state.captureAlert.tone;
    captureCardEl.style.display = "grid";
    captureWrapEl.style.display = "block";
    captureCancelBtn.style.display = "none";
    captureBarEl.style.width = "100%";
    captureTitleEl.textContent = state.captureAlert.title;
    captureTimeEl.textContent = "";
    captureTargetEl.textContent = state.captureAlert.detail;
    return;
  }
  delete captureCardEl.dataset.state;
  state.captureAlert = undefined;

  if (state.capture) {
    const captureTargetKey = key(state.capture.target.x, state.capture.target.y);
    captureCardEl.dataset.state = "progress";
    const total = Math.max(1, state.capture.resolvesAt - state.capture.startAt);
    const elapsed = Date.now() - state.capture.startAt;
    const pct = Math.max(0, Math.min(1, elapsed / total));
    const remaining = Math.max(0, Math.ceil((state.capture.resolvesAt - Date.now()) / 100) / 10);
    const awaitingResult = Date.now() > state.capture.resolvesAt;
    if (awaitingResult && state.pendingCombatReveal && state.pendingCombatReveal.targetKey === captureTargetKey && !state.pendingCombatReveal.revealed) {
      showCaptureAlert(state.pendingCombatReveal.title, state.pendingCombatReveal.detail, state.pendingCombatReveal.tone);
      pushFeed(state.pendingCombatReveal.detail, "combat", state.pendingCombatReveal.tone === "success" ? "success" : "warn");
      state.pendingCombatReveal.revealed = true;
      return;
    }
    captureCardEl.style.display = "grid";
    captureWrapEl.style.display = "block";
    captureCancelBtn.style.display = "inline-flex";
    captureBarEl.style.width = awaitingResult ? "100%" : `${Math.floor(pct * 100)}%`;
    captureTitleEl.textContent = awaitingResult
      ? "Resolving battle..."
      : isForestTile(state.capture.target.x, state.capture.target.y)
        ? "Capturing Forest..."
        : "Capturing Territory...";
    captureTimeEl.textContent = awaitingResult ? "" : `${remaining.toFixed(1)}s`;
    captureTargetEl.textContent = awaitingResult
      ? `Waiting for result at (${state.capture.target.x}, ${state.capture.target.y})`
      : `Target: (${state.capture.target.x}, ${state.capture.target.y})`;
  } else {
    captureCardEl.style.display = "none";
    captureWrapEl.style.display = "none";
    captureCancelBtn.style.display = "none";
    captureBarEl.style.width = "0%";
    captureTitleEl.textContent = "";
    captureTimeEl.textContent = "";
    captureTargetEl.textContent = "";
  }
};

const drawStartingExpansionArrow = (px: number, py: number, size: number, dx: number, dy: number): void => {
  const phase = (Date.now() % 1200) / 1200;
  const wave = Math.sin(phase * Math.PI * 2);
  const slide = size * 0.12 * wave;
  const centerX = px + size / 2 + dx * slide;
  const centerY = py + size / 2 + dy * slide;
  const shaft = Math.max(6, size * 0.22);
  const head = Math.max(4, size * 0.16);

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
  ctx.strokeStyle = "rgba(255, 213, 110, 0.96)";
  ctx.fillStyle = "rgba(255, 241, 201, 0.98)";
  ctx.lineWidth = Math.max(2, size * 0.06);
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(255, 209, 102, 0.45)";
  ctx.shadowBlur = Math.max(4, size * 0.12);

  ctx.beginPath();
  ctx.moveTo(0, shaft * 0.6);
  ctx.lineTo(0, -shaft * 0.25);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -shaft * 0.62);
  ctx.lineTo(-head * 0.7, -shaft * 0.08);
  ctx.lineTo(head * 0.7, -shaft * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const triangularWave = (t: number): number => 1 - Math.abs(((t % 1) * 2) - 1);

const settlePixelSeed = (wx: number, wy: number, i: number, salt: number): number =>
  ((((wx + salt) * 92821) ^ ((wy + salt * 3) * 68917) ^ ((i + salt * 5) * 1259)) >>> 0) / 0xffffffff;

const settlePixelWaypoint = (wx: number, wy: number, i: number, step: number, axis: "x" | "y"): number =>
  settlePixelSeed(wx, wy, i, axis === "x" ? 41 + step * 13 : 83 + step * 17);

const settlePixelWanderPoint = (
  nowMs: number,
  wx: number,
  wy: number,
  i: number
): { x: number; y: number } => {
  const moveDurationMs = 1700;
  const pauseDurationMs = 1000;
  const cycleDurationMs = moveDurationMs + pauseDurationMs;
  const offsetMs = settlePixelSeed(wx, wy, i, 11) * cycleDurationMs;
  const localTime = nowMs + offsetMs;
  const segment = Math.floor(localTime / cycleDurationMs);
  const segmentTime = localTime - segment * cycleDurationMs;
  const fromX = settlePixelWaypoint(wx, wy, i, segment, "x");
  const fromY = settlePixelWaypoint(wx, wy, i, segment, "y");
  const toX = settlePixelWaypoint(wx, wy, i, segment + 1, "x");
  const toY = settlePixelWaypoint(wx, wy, i, segment + 1, "y");
  const travel = segmentTime >= moveDurationMs ? 1 : segmentTime / moveDurationMs;
  const x = fromX + (toX - fromX) * travel;
  const y = fromY + (toY - fromY) * travel;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y))
  };
};
const ownershipPatternTone = (ownerId: string): string => {
  const style = visualStyleForOwner(ownerId);
  if (!style) return "rgba(255,255,255,0.14)";
  if (style.secondaryTint === "IRON") return "rgba(214, 225, 239, 0.16)";
  if (style.secondaryTint === "SUPPLY") return "rgba(238, 198, 126, 0.16)";
  if (style.secondaryTint === "FOOD") return "rgba(186, 238, 144, 0.16)";
  if (style.secondaryTint === "CRYSTAL") return "rgba(159, 220, 255, 0.16)";
  return "rgba(255,255,255,0.14)";
};
const drawOwnershipSignature = (ownerId: string, px: number, py: number, size: number): void => {
  const style = visualStyleForOwner(ownerId);
  if (!style || size < 12) return;
  ctx.save();
  ctx.strokeStyle = ownershipPatternTone(ownerId);
  ctx.fillStyle = ownershipPatternTone(ownerId);
  ctx.lineWidth = 1;
  if (style.borderStyle === "HEAVY") {
    ctx.fillRect(px + 2, py + 2, Math.max(2, Math.floor(size * 0.18)), size - 4);
    ctx.fillRect(px + size - Math.max(2, Math.floor(size * 0.18)) - 2, py + 2, Math.max(2, Math.floor(size * 0.18)), size - 4);
  } else if (style.borderStyle === "DASHED") {
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(px + 3, py + size - 4);
    ctx.lineTo(px + size - 4, py + 3);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (style.borderStyle === "SOFT") {
    const r = Math.max(1.5, size * 0.1);
    ctx.beginPath();
    ctx.arc(px + size * 0.32, py + size * 0.32, r, 0, Math.PI * 2);
    ctx.arc(px + size * 0.68, py + size * 0.68, r, 0, Math.PI * 2);
    ctx.fill();
  } else if (style.borderStyle === "GLOW") {
    ctx.beginPath();
    ctx.moveTo(px + size / 2, py + 3);
    ctx.lineTo(px + size - 3, py + size / 2);
    ctx.lineTo(px + size / 2, py + size - 3);
    ctx.lineTo(px + 3, py + size / 2);
    ctx.closePath();
    ctx.stroke();
  } else {
    ctx.strokeRect(px + size * 0.28, py + size * 0.28, size * 0.44, size * 0.44);
  }
  ctx.restore();
};
const defensibilityPctFromTE = (t: number | undefined, e: number | undefined): number => {
  if (typeof t !== "number" || Number.isNaN(t) || typeof e !== "number" || Number.isNaN(e)) return state.defensibilityPct;
  return Math.max(0, Math.min(100, exposureRatio(t, e) * 100));
};

const techTier = (id: string, byId: Map<string, TechInfo>, memo: Map<string, number>): number => {
  const cached = memo.get(id);
  if (typeof cached === "number") return cached;
  const t = byId.get(id);
  if (!t) return 1;
  const parents = t.prereqIds && t.prereqIds.length > 0 ? t.prereqIds : t.requires ? [t.requires] : [];
  if (parents.length === 0) {
    memo.set(id, 1);
    return 1;
  }
  const parentTier = Math.max(...parents.map((p) => techTier(p, byId, memo)));
  const tier = parentTier + 1;
  memo.set(id, tier);
  return tier;
};

const techPrereqIds = (tech: Pick<TechInfo, "prereqIds" | "requires">): string[] =>
  tech.prereqIds && tech.prereqIds.length > 0 ? tech.prereqIds : tech.requires ? [tech.requires] : [];

const orderedTechIdsByTier = (catalog: TechInfo[]): string[] => {
  const byId = new Map(catalog.map((tech) => [tech.id, tech]));
  const tierMemo = new Map<string, number>();
  const tiers = new Map<number, string[]>();
  const childrenById = new Map<string, string[]>();

  for (const tech of catalog) {
    const tier = techTier(tech.id, byId, tierMemo);
    const ids = tiers.get(tier) ?? [];
    ids.push(tech.id);
    tiers.set(tier, ids);
    for (const prereqId of techPrereqIds(tech)) {
      const children = childrenById.get(prereqId) ?? [];
      children.push(tech.id);
      childrenById.set(prereqId, children);
    }
  }

  const tierNumbers = [...tiers.keys()].sort((a, b) => a - b);
  for (const tier of tierNumbers) {
    const ids = tiers.get(tier);
    if (!ids) continue;
    ids.sort((a, b) => {
      const techA = byId.get(a);
      const techB = byId.get(b);
      return (techA?.tier ?? 999) - (techB?.tier ?? 999) || (techA?.name ?? a).localeCompare(techB?.name ?? b);
    });
  }

  const positionMap = (): Map<string, number> => {
    const map = new Map<string, number>();
    for (const tier of tierNumbers) {
      const ids = tiers.get(tier) ?? [];
      ids.forEach((id, index) => map.set(id, index));
    }
    return map;
  };

  const meanPosition = (ids: string[], positions: Map<string, number>): number | null => {
    const values = ids.map((id) => positions.get(id)).filter((value): value is number => typeof value === "number");
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const sortTier = (tier: number, anchorsFor: (id: string) => string[]): void => {
    const ids = tiers.get(tier);
    if (!ids || ids.length < 2) return;
    const positions = positionMap();
    ids.sort((a, b) => {
      const anchorA = meanPosition(anchorsFor(a), positions);
      const anchorB = meanPosition(anchorsFor(b), positions);
      if (anchorA !== null && anchorB !== null && anchorA !== anchorB) return anchorA - anchorB;
      if (anchorA !== null && anchorB === null) return -1;
      if (anchorA === null && anchorB !== null) return 1;
      const childA = meanPosition(childrenById.get(a) ?? [], positions);
      const childB = meanPosition(childrenById.get(b) ?? [], positions);
      if (childA !== null && childB !== null && childA !== childB) return childA - childB;
      if (childA !== null && childB === null) return -1;
      if (childA === null && childB !== null) return 1;
      const techA = byId.get(a);
      const techB = byId.get(b);
      return (techA?.tier ?? 999) - (techB?.tier ?? 999) || (techA?.name ?? a).localeCompare(techB?.name ?? b);
    });
  };

  for (let sweep = 0; sweep < 4; sweep += 1) {
    for (const tier of tierNumbers.slice(1)) sortTier(tier, (id) => techPrereqIds(byId.get(id) ?? {}));
    for (const tier of [...tierNumbers].reverse().slice(1)) sortTier(tier, (id) => childrenById.get(id) ?? []);
  }

  return tierNumbers.flatMap((tier) => tiers.get(tier) ?? []);
};

const titleCaseFromId = (value: string): string =>
  value
    .split("-")
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");

const techNameList = (ids: string[]): string =>
  ids
    .map((id) => state.techCatalog.find((t) => t.id === id)?.name ?? titleCaseFromId(id))
    .join(", ");

const unlockedByTech = (techId: string): TechInfo[] =>
  state.techCatalog
    .filter((candidate) => {
      const prereqs =
        candidate.prereqIds && candidate.prereqIds.length > 0 ? candidate.prereqIds : candidate.requires ? [candidate.requires] : [];
      return prereqs.includes(techId);
    })
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));

const effectiveOwnedTechIds = (): string[] => {
  if (!state.pendingTechUnlockId || state.techIds.includes(state.pendingTechUnlockId)) return state.techIds;
  return [...state.techIds, state.pendingTechUnlockId];
};

const effectiveTechChoices = (): string[] =>
  state.pendingTechUnlockId ? state.techChoices.filter((id) => id !== state.pendingTechUnlockId) : state.techChoices;

const isPendingTechUnlock = (techId: string): boolean => state.pendingTechUnlockId === techId;

const currentResearchRemainingMs = (): number | undefined => {
  if (!state.currentResearch) return undefined;
  return Math.max(0, state.currentResearch.completesAt - Date.now());
};

const currentResearchStatusText = (): string => {
  const remainingMs = currentResearchRemainingMs();
  if (remainingMs === undefined) return "Research in progress.";
  return `Research in progress. ${formatCountdownClock(remainingMs)} remaining.`;
};

const formatTechCost = (t: TechInfo): string => {
  const checklist = t.requirements.checklist ?? [];
  const costBits = checklist.filter((c) => /gold|food|iron|crystal|supply|shard/i.test(c.label)).map((c) => c.label);
  if (costBits.length > 0) return costBits.join(" · ");
  const fallback = checklist.map((c) => c.label);
  return fallback.length > 0 ? fallback.join(" · ") : "Cost not listed";
};

const TECH_TREE_NODE_W = 224;
const TECH_TREE_NODE_MIN_H = 102;
const TECH_TREE_COL_GAP = 96;
const TECH_TREE_MIN_ROW_GAP = 10;
const TECH_TREE_IDEAL_ROW_GAP = 18;
const TECH_TREE_TIER_SPREAD = 248;
const TECH_TREE_ZIP_RATIO = 0.54;
const TECH_TREE_PADDING_X = 36;
const TECH_TREE_PADDING_Y = 28;

type TechTreeNodeLayout = {
  tech: TechInfo;
  tier: number;
  row: number;
  x: number;
  y: number;
  height: number;
};

const techTierSlotWidth = (): number => TECH_TREE_NODE_W + TECH_TREE_TIER_SPREAD * 2;

const techTierNodeOffset = (index: number, count: number): number => {
  if (count <= 1) return TECH_TREE_TIER_SPREAD * 0.5;
  const lane = index % 2;
  return Math.round(lane === 0 ? 0 : TECH_TREE_TIER_SPREAD);
};

const estimateTechNodeHeight = (tech: TechInfo): number => {
  const titleLines = Math.max(1, Math.ceil(tech.name.length / 14));
  const summaryText = formatTechBenefitSummary(tech);
  const summaryLines = Math.max(1, Math.ceil(summaryText.length / 30));
  const prereqText = techPrereqIds(tech).length > 0 ? `Requires ${techNameList(techPrereqIds(tech))}` : "Entry technology";
  const costText = tech.requirements.canResearch ? formatTechCost(tech) : prereqText;
  const costLines = Math.max(1, Math.ceil(costText.length / 30));
  const estimate = 28 + titleLines * 24 + 18 + summaryLines * 20 + costLines * 20 + 26;
  return Math.max(TECH_TREE_NODE_MIN_H, estimate);
};

const average = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

const renderCompactTechChoiceGrid = (): string => {
  const byId = new Map(state.techCatalog.map((t) => [t.id, t]));
  const tierMemo = new Map<string, number>();
  const techLayoutOrder = new Map(orderedTechIdsByTier(state.techCatalog).map((id, index) => [id, index]));
  const ownedTechIds = effectiveOwnedTechIds();
  const choices = effectiveTechChoices()
    .map((id) => byId.get(id))
    .filter((t): t is TechInfo => Boolean(t))
    .sort(
      (a, b) =>
        techTier(a.id, byId, tierMemo) - techTier(b.id, byId, tierMemo) ||
        (techLayoutOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (techLayoutOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name)
    );
  if (choices.length === 0) return `<article class="card"><p>No available technologies right now.</p></article>`;
  const grouped = new Map<number, TechInfo[]>();
  for (const t of choices) {
    const tier = techTier(t.id, byId, tierMemo);
    const arr = grouped.get(tier) ?? [];
    arr.push(t);
    grouped.set(tier, arr);
  }
  const tiers = [...grouped.keys()].sort((a, b) => a - b);
  return tiers
    .map((tier) => {
      const cards = (grouped.get(tier) ?? [])
        .sort(
          (a, b) =>
            (techLayoutOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (techLayoutOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
            a.name.localeCompare(b.name)
        )
        .map((t) => {
          const selected = state.techUiSelectedId === t.id ? " selected" : "";
          const owned = ownedTechIds.includes(t.id) ? " owned" : "";
          const blocked = t.requirements.canResearch || isPendingTechUnlock(t.id) ? "" : " blocked";
          const researchingThis = state.currentResearch?.techId === t.id;
          const costLabel = researchingThis ? `Researching • ${formatCooldownShort(Math.max(0, state.currentResearch!.completesAt - Date.now()))}` : isPendingTechUnlock(t.id) ? "Unlocking..." : formatTechCost(t);
          return `<button class="tech-card${selected}${owned}${blocked}" data-tech-card="${t.id}">
            <div class="tech-card-top">
              <strong>${t.name}</strong>
              <span class="tech-root">Tier ${techTier(t.id, byId, tierMemo)}</span>
            </div>
            <p>${formatTechBenefitSummary(t)}</p>
            <p class="tech-card-cost">${costLabel}</p>
          </button>`;
        })
        .join("");
      return `<div class="tech-tier-block"><h4>Tier ${tier}</h4><div class="tech-card-grid">${cards}</div></div>`;
    })
    .join("");
};

const renderExpandedTechChoiceTree = (): string => {
  const byId = new Map(state.techCatalog.map((t) => [t.id, t]));
  const tierMemo = new Map<string, number>();
  const ownedTechIds = effectiveOwnedTechIds();
  const ownedSet = new Set(ownedTechIds);
  const choicesSet = new Set(effectiveTechChoices());
  if (state.techCatalog.length === 0) return `<article class="card"><p>No technologies are available this season.</p></article>`;

  const childrenByTech = new Map<string, string[]>();
  for (const tech of state.techCatalog) {
    for (const prereqId of techPrereqIds(tech)) {
      const children = childrenByTech.get(prereqId) ?? [];
      children.push(tech.id);
      childrenByTech.set(prereqId, children);
    }
  }
  for (const [key, children] of childrenByTech) {
    childrenByTech.set(
      key,
      children.sort((a, b) => {
        const aTech = byId.get(a);
        const bTech = byId.get(b);
        return (aTech?.name ?? a).localeCompare(bTech?.name ?? b);
      })
    );
  }

  const groupedByRoot = new Map<string, TechInfo[]>();
  for (const tech of state.techCatalog) {
    const rootKey = tech.rootId || tech.id;
    const group = groupedByRoot.get(rootKey) ?? [];
    group.push(tech);
    groupedByRoot.set(rootKey, group);
  }

  const currentRootId = state.techRootId || state.techCatalog.find((tech) => ownedSet.has(tech.id))?.rootId || "";
  const rootKeys = [...groupedByRoot.keys()].sort((a, b) => {
    const aCurrent = a === currentRootId ? 1 : 0;
    const bCurrent = b === currentRootId ? 1 : 0;
    if (aCurrent !== bCurrent) return bCurrent - aCurrent;
    const aOwned = (groupedByRoot.get(a) ?? []).some((tech) => ownedSet.has(tech.id)) ? 1 : 0;
    const bOwned = (groupedByRoot.get(b) ?? []).some((tech) => ownedSet.has(tech.id)) ? 1 : 0;
    if (aOwned !== bOwned) return bOwned - aOwned;
    return (byId.get(a)?.name ?? titleCaseFromId(a)).localeCompare(byId.get(b)?.name ?? titleCaseFromId(b));
  });

  let leafRow = 0;
  const rowByTech = new Map<string, number>();
  const assigning = new Set<string>();
  const assignRow = (techId: string): number => {
    const cached = rowByTech.get(techId);
    if (typeof cached === "number") return cached;
    if (assigning.has(techId)) {
      const fallback = leafRow;
      leafRow += 1;
      rowByTech.set(techId, fallback);
      return fallback;
    }
    assigning.add(techId);
    const children = (childrenByTech.get(techId) ?? []).filter((childId) => byId.get(childId)?.rootId === (byId.get(techId)?.rootId || techId));
    let row: number;
    if (children.length === 0) {
      row = leafRow;
      leafRow += 1;
    } else {
      const childRows = children.map(assignRow);
      row = childRows.reduce((sum, value) => sum + value, 0) / childRows.length;
    }
    assigning.delete(techId);
    rowByTech.set(techId, row);
    return row;
  };

  for (const rootKey of rootKeys) {
    const rootTechs = (groupedByRoot.get(rootKey) ?? []).slice();
    const groupIds = new Set(rootTechs.map((tech) => tech.id));
    const entryTechs = rootTechs
      .filter((tech) => techPrereqIds(tech).filter((id) => groupIds.has(id)).length === 0)
      .sort((a, b) => techTier(a.id, byId, tierMemo) - techTier(b.id, byId, tierMemo) || a.name.localeCompare(b.name));
    for (const tech of entryTechs) assignRow(tech.id);
    for (const tech of rootTechs.sort((a, b) => techTier(a.id, byId, tierMemo) - techTier(b.id, byId, tierMemo) || a.name.localeCompare(b.name))) {
      if (!rowByTech.has(tech.id)) assignRow(tech.id);
    }
    leafRow += 1;
  }

  const viewportHeight = viewportSize().height;
  const stageHeight = Math.max(420, viewportHeight - (isMobile() ? 220 : 190));
  const usableHeight = Math.max(220, stageHeight - TECH_TREE_PADDING_Y * 2);
  const techsByTier = new Map<number, TechInfo[]>();
  for (const tech of state.techCatalog) {
    const tier = techTier(tech.id, byId, tierMemo);
    const group = techsByTier.get(tier) ?? [];
    group.push(tech);
    techsByTier.set(tier, group);
  }

  const orderedTiers = [...techsByTier.keys()].sort((a, b) => a - b);
  const orderedIdsByTier = new Map<number, string[]>();
  for (const tier of orderedTiers) {
    const ids = (techsByTier.get(tier) ?? [])
      .slice()
      .sort((a, b) => {
        const aOrder = rowByTech.get(a.id) ?? 0;
        const bOrder = rowByTech.get(b.id) ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      })
      .map((tech) => tech.id);
    orderedIdsByTier.set(tier, ids);
  }

  const sortTierByLinkedNeighbors = (tier: number, direction: "parents" | "children"): void => {
    const ids = orderedIdsByTier.get(tier);
    if (!ids || ids.length <= 1) return;
    const neighborTierIds = orderedIdsByTier.get(direction === "parents" ? tier - 1 : tier + 1);
    const neighborIndex = new Map((neighborTierIds ?? []).map((id, index) => [id, index]));
    const fallbackIndex = new Map(ids.map((id, index) => [id, index]));
    ids.sort((aId, bId) => {
      const aTech = byId.get(aId);
      const bTech = byId.get(bId);
      if (!aTech || !bTech) return 0;
      const aNeighbors =
        direction === "parents"
          ? techPrereqIds(aTech).filter((id) => neighborIndex.has(id))
          : (childrenByTech.get(aId) ?? []).filter((id) => neighborIndex.has(id));
      const bNeighbors =
        direction === "parents"
          ? techPrereqIds(bTech).filter((id) => neighborIndex.has(id))
          : (childrenByTech.get(bId) ?? []).filter((id) => neighborIndex.has(id));
      const aScore = aNeighbors.length > 0 ? average(aNeighbors.map((id) => neighborIndex.get(id) ?? 0)) : fallbackIndex.get(aId) ?? 0;
      const bScore = bNeighbors.length > 0 ? average(bNeighbors.map((id) => neighborIndex.get(id) ?? 0)) : fallbackIndex.get(bId) ?? 0;
      if (aScore !== bScore) return aScore - bScore;
      const aBase = rowByTech.get(aId) ?? 0;
      const bBase = rowByTech.get(bId) ?? 0;
      if (aBase !== bBase) return aBase - bBase;
      return aTech.name.localeCompare(bTech.name);
    });
  };

  for (let pass = 0; pass < 3; pass += 1) {
    for (const tier of orderedTiers) {
      if (tier > orderedTiers[0]!) sortTierByLinkedNeighbors(tier, "parents");
    }
    for (let index = orderedTiers.length - 1; index >= 0; index -= 1) {
      const tier = orderedTiers[index];
      if (tier === undefined || tier >= orderedTiers[orderedTiers.length - 1]!) continue;
      sortTierByLinkedNeighbors(tier, "children");
    }
  }

  const layouts: TechTreeNodeLayout[] = [];
  for (const tier of orderedTiers) {
    const tierTechs = (orderedIdsByTier.get(tier) ?? []).map((id) => byId.get(id)).filter((tech): tech is TechInfo => Boolean(tech));
    const count = tierTechs.length;
    const tierHeights = tierTechs.map((tech) => estimateTechNodeHeight(tech));
    const zipperSteps = tierHeights.slice(0, -1).map((height) => Math.max(TECH_TREE_MIN_ROW_GAP, height * TECH_TREE_ZIP_RATIO));
    const stackHeight =
      count === 0
        ? 0
        : tierHeights[0]! + zipperSteps.reduce((sum, step) => sum + step, 0) + Math.max(0, (tierHeights[count - 1]! - tierHeights[0]!) * 0.15);
    const startY = TECH_TREE_PADDING_Y + Math.max(0, (usableHeight - stackHeight) / 2);
    const tierBaseX = TECH_TREE_PADDING_X + (tier - 1) * (techTierSlotWidth() + TECH_TREE_COL_GAP);
    let currentY = startY;
    tierTechs.forEach((tech, index) => {
      const height = tierHeights[index] ?? TECH_TREE_NODE_MIN_H;
      layouts.push({
        tech,
        tier,
        row: index,
        x: tierBaseX + techTierNodeOffset(index, count),
        y: currentY,
        height
      });
      currentY += index < zipperSteps.length ? zipperSteps[index]! : 0;
    });
  }
  layouts.sort((a, b) => a.x - b.x || a.y - b.y);

  const maxTier = Math.max(...layouts.map((layout) => layout.tier));
  const stageWidth = TECH_TREE_PADDING_X * 2 + maxTier * techTierSlotWidth() + Math.max(0, maxTier - 1) * TECH_TREE_COL_GAP;
  const contentHeight = stageHeight;
  const layoutById = new Map(layouts.map((layout) => [layout.tech.id, layout]));

  const tierHeaders = Array.from({ length: maxTier }, (_, index) => {
    const left = TECH_TREE_PADDING_X + index * (techTierSlotWidth() + TECH_TREE_COL_GAP);
    return `<div class="tech-tree-stage-tier" style="left:${left}px;width:${techTierSlotWidth()}px;">Tier ${index + 1}</div>`;
  }).join("");

  const lines = layouts
    .flatMap((layout) =>
      techPrereqIds(layout.tech)
        .map((prereqId) => {
          const source = layoutById.get(prereqId);
          if (!source) return "";
          const startX = source.x + TECH_TREE_NODE_W;
          const startY = source.y + source.height / 2;
          const endX = layout.x;
          const endY = layout.y + layout.height / 2;
          const controlOffset = Math.max(36, (endX - startX) * 0.45);
          const selectedClass = state.techUiSelectedId === prereqId ? " is-selected-outgoing" : state.techUiSelectedId === layout.tech.id ? " is-selected-incoming" : "";
          return `<path class="tech-tree-link${selectedClass}" d="M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}" />`;
        })
        .filter(Boolean)
    )
    .join("");

  const nodes = layouts
    .map((layout) => {
      const { tech } = layout;
      const selected = state.techUiSelectedId === tech.id ? " selected" : "";
      const owned = ownedSet.has(tech.id) ? " owned" : "";
      const pending = isPendingTechUnlock(tech.id) ? " pending" : "";
      const researchingThis = state.currentResearch?.techId === tech.id;
      const available = tech.requirements.canResearch && !isPendingTechUnlock(tech.id) ? " available" : "";
      const choice = choicesSet.has(tech.id) ? " choice" : "";
      const blocked = owned || available || pending ? "" : " blocked";
      const prereqs = techPrereqIds(tech);
      const stateLabel = researchingThis ? "Researching" : pending ? "Unlocking" : owned ? "Unlocked" : tech.requirements.canResearch ? "Available" : "Locked";
      const costLabel =
        researchingThis
          ? `Researching • ${formatCooldownShort(Math.max(0, state.currentResearch!.completesAt - Date.now()))}`
          : pending
          ? "Waiting for server confirmation..."
          : tech.requirements.canResearch
            ? formatTechCost(tech)
            : prereqs.length > 0
              ? `Requires ${techNameList(prereqs)}`
              : "Entry technology";
      const rootName = byId.get(tech.rootId || tech.id)?.name ?? titleCaseFromId(tech.rootId || tech.id);
      return `<button
        class="tech-card tech-tree-card tech-tree-graph-node${selected}${owned}${pending}${available}${choice}${blocked}"
        data-tech-card="${tech.id}"
        style="left:${layout.x}px;top:${layout.y}px;width:${TECH_TREE_NODE_W}px;min-height:${layout.height}px;"
      >
        <div class="tech-card-top">
          <strong>${tech.name}</strong>
          <span class="tech-tree-card-badge">${stateLabel}</span>
        </div>
        <p class="tech-tree-card-branch">${rootName}</p>
        <p class="tech-tree-card-meta">${formatTechBenefitSummary(tech)}</p>
        <p class="tech-card-cost">${costLabel}</p>
      </button>`;
    })
    .join("");

  return `<article class="card tech-tree-shell expanded">
    <div class="tech-tree-shell-head">
      <div>
        <div class="domain-summary-kicker">Research</div>
        <strong>Technology tree</strong>
        <p>Drag horizontally from Tier 1 through Tier ${maxTier} to see how every unlock connects.</p>
      </div>
      <div class="tech-tree-overview-metrics">
        <span><strong>${ownedTechIds.length}</strong> unlocked</span>
        <span><strong>${state.techCatalog.filter((tech) => tech.requirements.canResearch).length}</strong> ready</span>
        <span><strong>${state.techCatalog.length}</strong> total</span>
      </div>
    </div>
    <div class="tech-tree-graph-scroll" data-tech-tree-scroll>
      <div class="tech-tree-graph-stage" style="width:${stageWidth}px;height:${contentHeight}px;min-height:${stageHeight}px;">
        ${tierHeaders}
        <svg class="tech-tree-graph-lines" viewBox="0 0 ${stageWidth} ${contentHeight}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
        ${nodes}
      </div>
    </div>
  </article>`;
};

const renderTechChoiceGrid = (): string => (state.techTreeExpanded ? renderExpandedTechChoiceTree() : renderCompactTechChoiceGrid());

const relatedStructureTypesForTech = (tech: TechInfo): StructureInfoKey[] => {
  const out = new Set<StructureInfoKey>();
  const effects = tech.effects ?? {};
  for (const [key] of Object.entries(effects)) {
    if (key === "unlockForts" || key.startsWith("fort")) out.add("FORT");
    if (key === "unlockObservatory" || key.startsWith("observatory")) out.add("OBSERVATORY");
    if (key === "unlockFarmstead") out.add("FARMSTEAD");
    if (key === "unlockCamp") out.add("CAMP");
    if (key === "unlockMine") out.add("MINE");
    if (key === "unlockMarket" || key.startsWith("market")) out.add("MARKET");
    if (key === "unlockGranary" || key.startsWith("granary")) out.add("GRANARY");
    if (key === "unlockBank") out.add("BANK");
    if (key === "unlockCaravanary") out.add("CARAVANARY");
    if (key === "unlockQuartermaster") out.add("QUARTERMASTER");
    if (key === "unlockIronworks") out.add("IRONWORKS");
    if (key === "unlockCrystalSynthesizer") out.add("CRYSTAL_SYNTHESIZER");
    if (key === "unlockFuelPlant") out.add("FUEL_PLANT");
    if (key === "unlockFoundry") out.add("FOUNDRY");
    if (key === "unlockCustomsHouse") out.add("CUSTOMS_HOUSE");
    if (key === "unlockGovernorsOffice") out.add("GOVERNORS_OFFICE");
    if (key === "unlockGarrisonHall") out.add("GARRISON_HALL");
    if (key === "unlockAirport") out.add("AIRPORT");
    if (key === "unlockRadarSystem") out.add("RADAR_SYSTEM");
    if (key === "unlockSiegeOutposts" || key.startsWith("outpost")) out.add("SIEGE_OUTPOST");
  }
  return [...out];
};

const renderTechDetailCard = (): string => {
  const selectedId = state.techUiSelectedId || techPickEl.value || mobileTechPickEl.value || state.techCatalog[0]?.id;
  const byId = new Map(state.techCatalog.map((tech) => [tech.id, tech]));
  const tierMemo = new Map<string, number>();
  const t = state.techCatalog.find((x) => x.id === selectedId);
  if (!t) return `<article class="card"><p>Select a technology card to inspect details.</p></article>`;
  const checklist = t.requirements.checklist ?? [];
  const checks = checklist
    .map((c) => `<li class="${c.met ? "ok" : "bad"}">${c.met ? "✓" : "✗"} ${c.label}</li>`)
    .join("");
  const prereqs = techPrereqIds(t);
  const unlocks = unlockedByTech(t.id);
  const prereqText = prereqs.length > 0 ? techNameList(prereqs) : "Entry tech";
  const pendingUnlock = isPendingTechUnlock(t.id);
  const researchingThis = state.currentResearch?.techId === t.id;
  const researchRemaining =
    researchingThis && typeof state.currentResearch?.completesAt === "number"
      ? Math.max(0, state.currentResearch.completesAt - Date.now())
      : 0;
  const canUnlock = t.requirements.canResearch && !state.pendingTechUnlockId && !state.currentResearch;
  const effectSummary = formatTechBenefitSummary(t);
  const relatedStructures = relatedStructureTypesForTech(t);
  return `<article class="card tech-detail-card">
    <div class="tech-detail-head">
      <div>
        <strong>${t.name}</strong>
        <p class="tech-detail-effect">${effectSummary}</p>
        <p class="muted">${prereqs.length > 0 ? `Requires ${prereqText}` : "Entry tech (no prerequisites)"}</p>
        ${researchingThis ? `<p class="muted">Researching now. Completes in ${formatCooldownShort(researchRemaining)}.</p>` : pendingUnlock ? `<p class="muted">Unlocking now. Waiting for server confirmation...</p>` : ""}
        ${researchingThis ? `<p class="muted">Researching now. Completes in ${formatCooldownShort(researchRemaining)}.</p>` : pendingUnlock ? `<p class="muted">Unlocking now. Waiting for server confirmation...</p>` : ""}
      </div>
      <button class="panel-btn tech-unlock-btn" data-tech-unlock="${t.id}" ${(canUnlock || pendingUnlock || researchingThis) ? "" : "disabled"}>${researchingThis ? "Researching" : pendingUnlock ? "Unlocking..." : canUnlock ? "Unlock" : state.currentResearch ? "Busy" : "Locked"}</button>
    </div>
    <p class="tech-detail-flavor">${t.description}</p>
    ${relatedStructures.length > 0 ? `<p class="muted"><strong>Structures:</strong> ${relatedStructures.map((type) => structureInfoButtonHtml(type)).join(", ")}</p>` : ""}
    ${unlocks.length > 0 ? `<p class="muted"><strong>Unlocks next:</strong> ${unlocks.map((next) => `${next.name} (T${techTier(next.id, byId, tierMemo)})`).join(", ")}</p>` : ""}
    <p><strong>Requirements:</strong></p>
    <ul class="tech-req-list">${checks || "<li>None</li>"}</ul>
  </article>`;
};

const formatDomainCost = (d: DomainInfo): string => {
  const checklist = d.requirements.checklist ?? [];
  const costBits = checklist.filter((c) => /gold|food|iron|crystal|supply|shard/i.test(c.label)).map((c) => c.label);
  if (costBits.length > 0) return costBits.join(" · ");
  return "Cost not listed";
};

const ownedDomainByTier = (): Map<number, DomainInfo> => {
  const catalogById = new Map(state.domainCatalog.map((d) => [d.id, d]));
  const out = new Map<number, DomainInfo>();
  for (const id of state.domainIds) {
    const domain = catalogById.get(id);
    if (domain) out.set(domain.tier, domain);
  }
  return out;
};

const currentDomainChoiceTier = (): number | undefined => {
  const byId = new Map(state.domainCatalog.map((d) => [d.id, d]));
  const first = state.domainChoices.map((id) => byId.get(id)).find((d): d is DomainInfo => Boolean(d));
  return first?.tier;
};

const domainTierStatus = (
  tier: number,
  ownedByTier: Map<number, DomainInfo>,
  currentTier?: number
): {
  tone: "chosen" | "current" | "locked";
  badge: string;
  detail: string;
} => {
  const owned = ownedByTier.get(tier);
  if (owned) {
    return {
      tone: "chosen",
      badge: "Chosen",
      detail: `Tier ${tier} is already committed to ${owned.name}. You cannot choose another domain at this tier.`
    };
  }
  if (currentTier === tier) {
    return {
      tone: "current",
      badge: "Choose 1",
      detail: `Pick exactly one domain for Tier ${tier}. Once chosen, the other domains in this tier are closed.`
    };
  }
  return {
    tone: "locked",
    badge: "Locked",
    detail: tier < (currentTier ?? 0) ? `This tier is no longer available because your choice is already set.` : `Unlock Tier ${Math.max(1, tier - 1)} first to reach this tier.`
  };
};

const domainCardBlockedReason = (
  domain: DomainInfo,
  ownedByTier: Map<number, DomainInfo>,
  currentTier?: number
): string | undefined => {
  const owned = ownedByTier.get(domain.tier);
  if (owned && owned.id !== domain.id) return `Tier ${domain.tier} already committed to ${owned.name}`;
  if (currentTier !== undefined && domain.tier > currentTier) return `Locked until Tier ${domain.tier - 1} is chosen`;
  if (currentTier !== undefined && domain.tier < currentTier && !owned) return "Tier no longer available";
  const unmet = (domain.requirements.checklist ?? []).find((check) => !check.met);
  return unmet?.label;
};

const renderDomainChoiceGrid = (): string => {
  if (state.domainCatalog.length === 0) return `<article class="card"><p>No domains available right now.</p></article>`;
  const grouped = new Map<number, DomainInfo[]>();
  for (const d of state.domainCatalog) {
    const arr = grouped.get(d.tier) ?? [];
    arr.push(d);
    grouped.set(d.tier, arr);
  }
  const ownedByTier = ownedDomainByTier();
  const currentTier = currentDomainChoiceTier();
  const tiers = [...grouped.keys()].sort((a, b) => a - b);
  const summary =
    currentTier !== undefined
      ? `<article class="card domain-summary-card">
          <div class="domain-summary-kicker">Domains</div>
          <strong>Choose one domain for Tier ${currentTier}</strong>
          <p>Each tier allows exactly one domain. Choosing one locks the others in that tier and advances you to the next tier later.</p>
        </article>`
      : `<article class="card domain-summary-card">
          <div class="domain-summary-kicker">Domains</div>
          <strong>All current domain tiers are committed</strong>
          <p>You can only choose one domain per tier. Review your picks below and unlock the next tier when it becomes available.</p>
        </article>`;
  const sections = tiers
    .map((tier) => {
      const status = domainTierStatus(tier, ownedByTier, currentTier);
      const cards = (grouped.get(tier) ?? [])
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((d) => {
          const selected = state.domainUiSelectedId === d.id ? " selected" : "";
          const owned = state.domainIds.includes(d.id) ? " owned" : "";
          const blockedReason = domainCardBlockedReason(d, ownedByTier, currentTier);
          const blocked = blockedReason && !owned ? " blocked" : "";
          const cardBadge = owned ? "Chosen" : currentTier === tier ? "Candidate" : "Unavailable";
          return `<button class="tech-card domain-card domain-card-${status.tone}${selected}${owned}${blocked}" data-domain-card="${d.id}">
            <div class="tech-card-top">
              <strong>${d.name}</strong>
              <span class="domain-card-badge">${cardBadge}</span>
            </div>
            <p>${formatDomainBenefitSummary(d)}</p>
            <p class="tech-card-cost">${owned ? "Tier locked in" : blockedReason ? blockedReason : formatDomainCost(d)}</p>
          </button>`;
        })
        .join("");
      return `<section class="tech-tier-block domain-tier-block domain-tier-block-${status.tone}">
        <div class="domain-tier-head">
          <div>
            <h4>Tier ${tier}</h4>
            <p>${status.detail}</p>
          </div>
          <span class="domain-tier-badge domain-tier-badge-${status.tone}">${status.badge}</span>
        </div>
        <div class="tech-card-grid">${cards}</div>
      </section>`;
    })
    .join("");
  return `${summary}${sections}`;
};

const renderDomainDetailCard = (): string => {
  const d = state.domainCatalog.find((x) => x.id === state.domainUiSelectedId);
  if (!d) return `<article class="card"><p>Select a domain card to inspect details.</p></article>`;
  const checklist = d.requirements.checklist ?? [];
  const checks = checklist
    .map((c) => `<li class="${c.met ? "ok" : "bad"}">${c.met ? "✓" : "✗"} ${c.label}</li>`)
    .join("");
  const ownedByTier = ownedDomainByTier();
  const currentTier = currentDomainChoiceTier();
  const chosenInTier = ownedByTier.get(d.tier);
  const canUnlock = d.requirements.canResearch;
  const requiresTechName = techNameList([d.requiresTechId]);
  const tierRuleText =
    chosenInTier && chosenInTier.id !== d.id
      ? `Tier ${d.tier} is already filled by ${chosenInTier.name}.`
      : currentTier === d.tier
        ? `This is one of the current Tier ${d.tier} choices. You may choose exactly one.`
        : chosenInTier?.id === d.id
          ? `You already chose this for Tier ${d.tier}.`
          : `This domain will only become choosable when Tier ${d.tier} opens.`;
  return `<article class="card tech-detail-card">
    <div class="tech-detail-head">
      <div>
        <strong>${d.name}</strong>
        <p class="muted">Tier ${d.tier} · Requires ${requiresTechName}</p>
        <p class="domain-detail-tier-rule">${tierRuleText}</p>
      </div>
      <button class="panel-btn domain-unlock-btn" data-domain-unlock="${d.id}" ${canUnlock ? "" : "disabled"}>${state.domainIds.includes(d.id) ? "Chosen" : canUnlock ? `Choose Tier ${d.tier}` : "Locked"}</button>
    </div>
    <p>${d.description}</p>
    <p><strong>Benefits:</strong> ${formatDomainBenefitSummary(d)}</p>
    <p><strong>Cost:</strong> ${formatDomainCost(d)}</p>
    <p><strong>Requirements:</strong></p>
    <ul class="tech-req-list">${checks || "<li>None</li>"}</ul>
  </article>`;
};

const renderTechChoiceDetails = (): string => {
  const selectedId = state.techUiSelectedId || techPickEl.value || mobileTechPickEl.value;
  const t = state.techCatalog.find((x) => x.id === selectedId);
  if (!t) return `<p class="muted">No tech selected.</p>`;
  const pendingUnlock = isPendingTechUnlock(t.id);
  const mods = Object.entries(t.mods ?? {})
    .map(([k, v]) => `${k} x${Number(v).toFixed(3)}`)
    .join(" | ");
  const projected = {
    attack: state.mods.attack * (t.mods.attack ?? 1),
    defense: state.mods.defense * (t.mods.defense ?? 1),
    income: state.mods.income * (t.mods.income ?? 1),
    vision: state.mods.vision * (t.mods.vision ?? 1)
  };
  const checklist = t.requirements.checklist ?? [];
  const checklistHtml =
    checklist.length > 0
      ? `<ul>${checklist
          .map((c) => `<li style="color:${c.met ? "#84f2b8" : "#ff9f9f"}">${c.met ? "✓" : "✗"} ${c.label}</li>`)
          .join("")}</ul>`
      : "<p class=\"muted\">No requirements listed.</p>";
  const prereqs = techPrereqIds(t);
  return `<article class="card">
    <strong>${t.name}</strong>
    ${pendingUnlock ? `<p class="muted">${currentResearchStatusText()}</p>` : ""}
    <p>${t.description}</p>
    <p><strong>Prerequisites:</strong> ${prereqs.length > 0 ? prereqs.join(", ") : "None"}</p>
    <p><strong>Requirements:</strong></p>
    ${checklistHtml}
    <p><strong>Modifiers:</strong> ${mods || "None"}</p>
    <p><strong>Current:</strong> atk x${state.mods.attack.toFixed(3)} | def x${state.mods.defense.toFixed(3)} | inc x${state.mods.income.toFixed(3)} | vis x${state.mods.vision.toFixed(3)}</p>
    <p><strong>Projected:</strong> atk x${projected.attack.toFixed(3)} | def x${projected.defense.toFixed(3)} | inc x${projected.income.toFixed(3)} | vis x${projected.vision.toFixed(3)}</p>
    ${t.grantsPowerup ? `<p><strong>Powerup:</strong> ${t.grantsPowerup.id} (+${t.grantsPowerup.charges})</p>` : ""}
  </article>`;
};

const affordableTechChoicesCount = (): number => {
  const catalogById = new Map(state.techCatalog.map((t) => [t.id, t]));
  let n = 0;
  for (const id of effectiveTechChoices()) {
    const t = catalogById.get(id);
    if (t && t.requirements.canResearch) n += 1;
  }
  return n;
};

const setAuthStatus = (message: string, tone: "normal" | "error" = "normal"): void => {
  state.authError = tone === "error" ? message : "";
  authStatusEl.textContent = message;
  authStatusEl.dataset.tone = tone;
};

const syncAuthPanelState = (): void => {
  authPanelEl.dataset.mode = state.profileSetupRequired ? "setup" : authEmailLinkSentTo ? "sent" : "login";
  authEmailSentAddressEl.textContent = authEmailLinkSentTo;
  const activeColor = authProfileColorEl.value.toLowerCase();
  authColorPresetButtons.forEach((btn) => {
    btn.dataset.selected = btn.dataset.color?.toLowerCase() === activeColor ? "true" : "false";
  });
};

const syncAuthOverlay = (): void => {
  authOverlayEl.style.display = state.authSessionReady && !state.profileSetupRequired ? "none" : "grid";
  authOverlayEl.dataset.busy = state.authBusy ? "true" : "false";
  authBusyModalEl.setAttribute("aria-hidden", state.authBusy ? "false" : "true");
  authLoginBtn.disabled = state.authBusy || !state.authConfigured;
  authRegisterBtn.disabled = state.authBusy || !state.authConfigured;
  authEmailLinkBtn.disabled = state.authBusy || !state.authConfigured;
  authGoogleBtn.disabled = state.authBusy || !state.authConfigured;
  authEmailEl.disabled = state.authBusy || !state.authConfigured;
  authPasswordEl.disabled = state.authBusy || !state.authConfigured;
  authDisplayNameEl.disabled = state.authBusy || !state.authConfigured;
  authEmailResetBtn.disabled = state.authBusy;
  authProfileNameEl.disabled = state.authBusy || !state.authConfigured;
  authProfileColorEl.disabled = state.authBusy || !state.authConfigured;
  authProfileSaveBtn.disabled = state.authBusy || !state.authConfigured;
  authBusyTitleEl.textContent = state.profileSetupRequired ? "Preparing your banner..." : "Connecting your empire...";
  authBusyCopyEl.textContent = state.authError
    ? state.authError
    : authStatusEl.textContent?.trim() || "Please wait while we finish sign-in and sync your starting state.";
  syncAuthPanelState();
  if (!state.authConfigured) {
    setAuthStatus("Firebase auth is not configured. Set the VITE_FIREBASE_* env vars.", "error");
  } else if (state.profileSetupRequired && !state.authBusy && !state.authError) {
    setAuthStatus("One last step before the campaign begins.");
  } else if (!state.authReady && !state.authBusy && !state.authError) {
    setAuthStatus("");
  }
};

const authLabelForUser = (user: User): string => user.displayName?.trim() || user.email?.trim() || "Authenticated user";

const seedProfileSetupFields = (name?: string, color?: string): void => {
  const cleanedName = (name ?? "").trim();
  if (cleanedName) authProfileNameEl.value = cleanedName.slice(0, 24);
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) authProfileColorEl.value = color;
  syncAuthPanelState();
};

const authenticateSocket = async (forceRefresh = false): Promise<void> => {
  if (!firebaseAuth?.currentUser || ws.readyState !== ws.OPEN) return;
  authToken = await firebaseAuth.currentUser.getIdToken(forceRefresh);
  authUid = firebaseAuth.currentUser.uid;
  ws.send(JSON.stringify({ type: "AUTH", token: authToken }));
};

const completeEmailLinkSignIn = async (emailRaw: string): Promise<void> => {
  if (!firebaseAuth) return;
  const email = emailRaw.trim();
  if (!email) {
    setAuthStatus("Enter the email address that received the sign-in link.", "error");
    syncAuthOverlay();
    return;
  }
  state.authBusy = true;
  setAuthStatus("Completing email link sign-in...");
  syncAuthOverlay();
  try {
    await signInWithEmailLink(firebaseAuth, email, window.location.href);
    authEmailLinkPending = false;
    authEmailLinkSentTo = "";
    window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
    const cleanUrl = new URL(window.location.href);
    cleanUrl.search = "";
    cleanUrl.hash = "";
    window.history.replaceState({}, document.title, cleanUrl.toString());
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "Email link sign-in failed.", "error");
  } finally {
    state.authBusy = false;
    syncAuthOverlay();
  }
};

const renderHud = (): void => {
  if (
    !state.guide.completed &&
    !state.guide.autoOpened &&
    state.connection === "initialized" &&
    state.firstChunkAt > 0 &&
    authOverlayEl.style.display !== "grid"
  ) {
    state.guide.open = true;
    state.guide.autoOpened = true;
    storageSet(GUIDE_AUTO_OPEN_STORAGE_KEY, "1");
  }
  const collectVisibleCooldownRemaining = Math.max(0, state.collectVisibleCooldownUntil - Date.now());
  const collectVisibleReady = collectVisibleCooldownRemaining <= 0;
  const collectSummary = visibleCollectSummary();
  const development = developmentSlotSummary();
  const mobile = isMobile();
  const connClass = state.connection === "disconnected" ? "warning" : "normal";
  const pointsClass =
    Date.now() < state.goldAnimUntil ? (state.goldAnimDir > 0 ? " delta-up" : state.goldAnimDir < 0 ? " delta-down" : "") : "";
  const defClass =
    Date.now() < state.defensibilityAnimUntil
      ? state.defensibilityAnimDir > 0
        ? " delta-up"
        : state.defensibilityAnimDir < 0
          ? " delta-down"
          : ""
      : "";
  const netGoldPerMinute = state.incomePerMinute - state.upkeepPerMinute.gold;
  const goldRateText = `${netGoldPerMinute > 0 ? "+" : ""}${netGoldPerMinute.toFixed(1)}/m`;
  const mobileGoldRateText = `${netGoldPerMinute > 0 ? "+" : ""}${netGoldPerMinute.toFixed(0)}`;
  const goldRateClass = rateToneClass(netGoldPerMinute);
  const manpowerRateText = `${state.manpowerRegenPerMinute > 0 ? "+" : ""}${state.manpowerRegenPerMinute.toFixed(0)}/m`;
  const mobileManpowerRateText = `${state.manpowerRegenPerMinute > 0 ? "+" : ""}${state.manpowerRegenPerMinute.toFixed(0)}`;
  const manpowerRateClass = rateToneClass(state.manpowerRegenPerMinute);
  statsChipsEl.innerHTML = `
    ${mobile ? "" : `<div class="stat-chip stat-chip-player ${connClass}"><span>Player</span><strong>${state.meName || "Player"}</strong></div>`}
    <button class="stat-chip stat-chip-gold${pointsClass}" type="button" data-economy-open="GOLD"><span>Gold</span><strong>${formatGoldAmount(state.gold)} <em class="stat-chip-rate ${goldRateClass}">${mobile ? mobileGoldRateText : goldRateText}</em></strong></button>
    <div class="stat-chip stat-chip-manpower" title="Manpower gates attacks. Settled towns raise your cap and regeneration; recently captured towns contribute less until they stabilize."><span>${mobile ? "MP" : "Manpower"}</span><strong>${mobile ? formatManpowerAmount(state.manpower) : `${formatManpowerAmount(state.manpower)} / ${formatManpowerAmount(state.manpowerCap)}`} <em class="stat-chip-rate ${manpowerRateClass}">${mobile ? mobileManpowerRateText : manpowerRateText}</em></strong></div>
    <button class="stat-chip stat-chip-def${defClass}" type="button" data-defensibility-open="true" title="Compact shapes with fewer exposed borders defend better. Tap for a breakdown."><span>${mobile ? "Def" : "Defensibility"}</span><strong>${Math.round(state.defensibilityPct)}%</strong></button>
    <div class="stat-chip stat-chip-dev${development.available === 0 ? " is-full" : ""}" title="Development slots limit how many settles and constructions can run at once.">
      <span>${mobile ? "Dev" : "Development"}</span>
      <strong>${development.busy}/${development.limit}</strong>
    </div>
    ${state.showWeakDefensibility ? `<button class="stat-chip stat-chip-weak-def" type="button" data-toggle-weak-def="true"><span>Def</span><strong>Hide Weak</strong></button>` : ""}
    ${strategicRibbonHtml(
      state.strategicResources,
      state.strategicProductionPerMinute,
      state.upkeepPerMinute,
      state.strategicAnim,
      rateToneClass
    )}
  `;
  collectVisibleDesktopBtn.disabled = !collectVisibleReady;
  collectVisibleMobileBtn.disabled = !collectVisibleReady;
  const collectReady = collectVisibleReady && collectSummary.tileCount > 0;
  const collectMeta = !collectVisibleReady ? `Cooldown ${formatCooldownShort(collectVisibleCooldownRemaining)}` : collectReady ? "Ready to collect" : "Tap to gather";
  collectVisibleDesktopMetaEl.textContent = collectMeta;
  collectVisibleMobileMetaEl.textContent = collectMeta;
  collectVisibleDesktopBtn.classList.toggle("is-attention", collectReady);
  collectVisibleMobileBtn.classList.toggle("is-attention", collectReady);
  const economyButtons = statsChipsEl.querySelectorAll<HTMLButtonElement>("[data-economy-open]");
  economyButtons.forEach((btn) => {
    btn.onclick = () => {
      const focus = btn.dataset.economyOpen as EconomyFocusKey | undefined;
      openEconomyPanel(focus ?? "ALL");
    };
  });
  const defensibilityButtons = statsChipsEl.querySelectorAll<HTMLButtonElement>("[data-defensibility-open]");
  defensibilityButtons.forEach((btn) => {
    btn.onclick = () => {
      setActivePanel("defensibility");
    };
  });
  const techReady = state.availableTechPicks > 0 && affordableTechChoicesCount() > 0;
  const attackAlertUnread = state.unreadAttackAlerts > 0;
  panelActionButtons.forEach((btn) => {
    if (btn.dataset.panel === "tech") {
      btn.innerHTML = techReady
        ? '<span class="tab-icon">⚡</span><span class="tech-ready-dot" aria-label="upgrade available"></span>'
        : '<span class="tab-icon">⚡</span>';
      return;
    }
    if (btn.dataset.panel === "feed") {
      btn.innerHTML = attackAlertUnread
        ? '<span class="tab-icon">🔔</span><span class="attack-alert-dot" aria-label="under attack">🔥</span>'
        : '<span class="tab-icon">🔔</span>';
    }
  });
  const coreMobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='core']");
  if (coreMobileBtn) coreMobileBtn.innerHTML = mobileNavLabelHtml("core");
  const missionsMobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='missions']");
  if (missionsMobileBtn) missionsMobileBtn.innerHTML = mobileNavLabelHtml("missions");
  const techMobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='tech']");
  if (techMobileBtn) techMobileBtn.innerHTML = mobileNavLabelHtml("tech", { techReady });
  const socialMobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='social']");
  if (socialMobileBtn) socialMobileBtn.innerHTML = mobileNavLabelHtml("social");
  const intelMobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='intel']");
  if (intelMobileBtn) intelMobileBtn.innerHTML = mobileNavLabelHtml("intel", { attackAlertUnread });

  if (state.crystalTargeting.active) {
    const ability = state.crystalTargeting.ability;
    const selectedKey = state.selected ? key(state.selected.x, state.selected.y) : "";
    const selectedOriginKey = selectedKey ? state.crystalTargeting.originByTarget.get(selectedKey) : undefined;
    const selectedOrigin = selectedOriginKey ? parseKey(selectedOriginKey) : undefined;
    const validCount = state.crystalTargeting.validTargets.size;
    const detail =
      ability === "deep_strike"
        ? "Pick an enemy tile exactly 2 tiles deep. Mountain barriers block the strike."
        : ability === "naval_infiltration"
          ? "Pick an enemy land tile across up to 4 sea tiles. First landing strike is weaker."
          : "Pick an enemy town or resource tile to cut output by 50% for 45 minutes.";
    const status = selectedOrigin
      ? `Origin ${selectedOrigin.x}, ${selectedOrigin.y} → Target ${state.selected?.x}, ${state.selected?.y}`
      : `Valid targets in view: ${validCount}`;
    targetingOverlayEl.innerHTML = `
      <div class="targeting-card tone-${crystalTargetingTone(ability)}">
        <div class="targeting-kicker">Crystal Action Armed</div>
        <div class="targeting-title">${crystalTargetingTitle(ability)}</div>
        <div class="targeting-detail">${detail}</div>
        <div class="targeting-status">${status}</div>
        <button id="targeting-cancel" class="targeting-cancel-btn" type="button">Cancel</button>
      </div>
    `;
    targetingOverlayEl.style.display = "block";
    const cancelBtn = targetingOverlayEl.querySelector<HTMLButtonElement>("#targeting-cancel");
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        clearCrystalTargeting();
        renderHud();
      };
    }
  } else {
    targetingOverlayEl.style.display = "none";
    targetingOverlayEl.innerHTML = "";
  }

  const selected = selectedTile();
  if (!selected) {
    const captureGuidance = firstCaptureGuidanceTarget();
    selectedEl.innerHTML = `<div class="hover-line"><strong>No tile selected</strong></div><div class="hover-subline">${
      captureGuidance
        ? `${captureGuidance.label}. It is marked in green on the map.`
        : "Click a tile for actions. Yellow pulse dot on your settled tile means collectable yield."
    }</div>`;
  } else {
    const selectedVisibility = tileVisibilityStateAt(selected.x, selected.y, selected);
    if (selectedVisibility === "unexplored") {
      selectedEl.innerHTML = `<div class="hover-line"><strong>${selected.x}, ${selected.y}</strong> Unexplored</div>`;
    } else if (selectedVisibility === "fogged") {
      selectedEl.innerHTML = `<div class="hover-line"><strong>${selected.x}, ${selected.y}</strong> Fogged</div><div class="hover-subline">Last seen only.</div>`;
    } else {
      selectedEl.innerHTML = inspectionHtmlForTile(selected);
    }
  }
  if (state.tileActionMenu.visible && state.tileActionMenu.mode === "single" && state.tileActionMenu.currentTileKey) {
    const menuTile = state.tiles.get(state.tileActionMenu.currentTileKey);
    if (menuTile) renderTileActionMenu(tileMenuViewForTile(menuTile), state.tileActionMenu.x, state.tileActionMenu.y);
  }
  hoverEl.innerHTML = "";
  hoverEl.style.display = "none";

  mobileCoreHelpEl.innerHTML = `
    <div class="mobile-context-block">
      <div class="mobile-context-label">Tile</div>
      <div class="mobile-context-value">${selectedEl.innerHTML || selectedEl.textContent || "No tile selected."}</div>
    </div>
  `;

  renderCaptureProgress();
  miniMapLabelEl.textContent = `Minimap (${state.camX}, ${state.camY})`;
  const loadingActive = state.connection !== "initialized" || state.firstChunkAt === 0;
  if (loadingActive) {
    mapLoadingOverlayEl.style.display = "grid";
    if (state.connection === "disconnected") {
      mapLoadingTitleEl.textContent = "Disconnected from server";
      mapLoadingMetaEl.textContent = "Retrying connection...";
    } else if (state.connection === "connecting") {
      mapLoadingTitleEl.textContent = "Connecting to server...";
      mapLoadingMetaEl.textContent = "Retrying connection...";
    } else if (state.connection === "connected" || (state.connection === "initialized" && state.firstChunkAt === 0)) {
      const startAt = state.mapLoadStartedAt || Date.now();
      const elapsed = ((Date.now() - startAt) / 1000).toFixed(1);
      mapLoadingTitleEl.textContent = state.authSessionReady ? "Loading nearby land..." : "Syncing empire...";
      mapLoadingMetaEl.textContent = state.authSessionReady ? `Elapsed ${elapsed}s · chunks ${state.chunkFullCount}` : `Connected to ${wsUrl}`;
    } else {
      mapLoadingTitleEl.textContent = "Loading world...";
      mapLoadingMetaEl.textContent = "Finalizing map render...";
    }
  } else {
    mapLoadingOverlayEl.style.display = "none";
  }

  const visibleTechChoices = effectiveTechChoices();
  const choicesSig = `${state.availableTechPicks}|${visibleTechChoices.join("|")}|${state.techCatalog.length}|${state.pendingTechUnlockId}`;
  const focused = document.activeElement === techPickEl || document.activeElement === mobileTechPickEl;
  const catalogById = new Map(state.techCatalog.map((t) => [t.id, t]));
  if (choicesSig !== state.techChoicesSig && !focused) {
    const previous = state.techUiSelectedId?.trim() || techPickEl.value || mobileTechPickEl.value;
    techPickEl.innerHTML = "";
    mobileTechPickEl.innerHTML = "";
    for (const choice of visibleTechChoices) {
      const opt = document.createElement("option");
      opt.value = choice;
      const info = catalogById.get(choice);
      opt.textContent = info ? `${info.name}${info.requirements.canResearch ? "" : " (blocked)"}` : choice;
      techPickEl.append(opt);
      mobileTechPickEl.append(opt.cloneNode(true));
    }
    if (visibleTechChoices.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent =
        state.pendingTechUnlockId
          ? "Unlock pending..."
          : state.techIds.length > 0
            ? "No further techs in your current branch this season"
            : "No available tech choices";
      techPickEl.append(opt);
      mobileTechPickEl.append(opt.cloneNode(true));
    }
    const fallback = state.pendingTechUnlockId || visibleTechChoices[0] || state.techCatalog[0]?.id || "";
    const nextSelected = previous && catalogById.has(previous) ? previous : fallback;
    const nextPickerValue = visibleTechChoices.includes(nextSelected) ? nextSelected : state.pendingTechUnlockId || visibleTechChoices[0] || "";
    techPickEl.value = nextPickerValue;
    mobileTechPickEl.value = nextPickerValue;
    state.techUiSelectedId = nextSelected;
    state.techChoicesSig = choicesSig;
  } else if (!focused) {
    const selected = state.techUiSelectedId || techPickEl.value || mobileTechPickEl.value;
    if (selected && catalogById.has(selected)) state.techUiSelectedId = selected;
  }
  techPointsEl.textContent = "Tech unlocks use gold + strategic resources";
  mobileTechPointsEl.textContent = "Tech unlocks use gold + strategic resources";
  techCurrentModsEl.innerHTML = techCurrentModsHtml(state.mods, state.expandedModKey, state.modBreakdown);
  mobileTechCurrentModsEl.innerHTML = techCurrentModsHtml(state.mods, state.expandedModKey, state.modBreakdown);
  techChoicesGridEl.innerHTML = renderTechChoiceGrid();
  mobileTechChoicesGridEl.innerHTML = renderTechChoiceGrid();
  techDetailCardEl.innerHTML = renderTechDetailCard();
  mobileTechDetailCardEl.innerHTML = renderTechDetailCard();
  techOwnedEl.innerHTML = techOwnedHtml(state.techCatalog, effectiveOwnedTechIds(), isPendingTechUnlock);
  mobileTechOwnedEl.innerHTML = techOwnedHtml(state.techCatalog, effectiveOwnedTechIds(), isPendingTechUnlock);
  techDomainsEl.innerHTML = `${renderDomainChoiceGrid()}${renderDomainDetailCard()}${domainOwnedHtml(state.domainCatalog, state.domainIds)}`;
  mobileTechDomainsEl.innerHTML = `${renderDomainChoiceGrid()}${renderDomainDetailCard()}${domainOwnedHtml(state.domainCatalog, state.domainIds)}`;
  techChoiceDetailsEl.innerHTML = renderTechChoiceDetails();
  mobileTechChoiceDetailsEl.innerHTML = renderTechChoiceDetails();
  const techResearchSectionEl = document.querySelector<HTMLDivElement>("#tech-research-section");
  const techDomainsSectionEl = document.querySelector<HTMLDivElement>("#tech-domains-section");
  const mobileTechResearchSectionEl = document.querySelector<HTMLDivElement>("#mobile-tech-research-section");
  const mobileTechDomainsSectionEl = document.querySelector<HTMLDivElement>("#mobile-tech-domains-section");
  if (techResearchSectionEl) techResearchSectionEl.style.display = state.techSection === "research" ? "grid" : "none";
  if (techDomainsSectionEl) techDomainsSectionEl.style.display = state.techSection === "domains" ? "grid" : "none";
  if (mobileTechResearchSectionEl) mobileTechResearchSectionEl.style.display = state.techSection === "research" ? "grid" : "none";
  if (mobileTechDomainsSectionEl) mobileTechDomainsSectionEl.style.display = state.techSection === "domains" ? "grid" : "none";
  panelTechEl.classList.toggle("tech-tree-expanded", state.techTreeExpanded);
  mobilePanelTechEl.classList.toggle("tech-tree-expanded", state.techTreeExpanded);
  const techSectionButtons = hud.querySelectorAll<HTMLButtonElement>("[data-tech-section]");
  techSectionButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.techSection === state.techSection);
    btn.onclick = () => {
      const section = btn.dataset.techSection;
      if (section !== "research" && section !== "domains") return;
      state.techSection = section;
      renderHud();
    };
  });
  const weakDefButtons = hud.querySelectorAll<HTMLButtonElement>("[data-toggle-weak-def]");
  weakDefButtons.forEach((btn) => {
    btn.onclick = () => {
      state.showWeakDefensibility = !state.showWeakDefensibility;
      renderHud();
    };
  });
  techTreeExpandToggleEl.textContent = state.techTreeExpanded ? "Collapse Tree" : "Expand Tree";
  mobileTechTreeExpandToggleEl.textContent = state.techTreeExpanded ? "Collapse Tree" : "Expand Tree";
  techTreeExpandToggleEl.classList.toggle("active", state.techTreeExpanded);
  mobileTechTreeExpandToggleEl.classList.toggle("active", state.techTreeExpanded);
  techTreeExpandToggleEl.onclick = () => {
    state.techTreeExpanded = !state.techTreeExpanded;
    renderHud();
  };
  mobileTechTreeExpandToggleEl.onclick = () => {
    state.techTreeExpanded = !state.techTreeExpanded;
    renderHud();
  };
  bindTechTreeDragScroll();
  const structureInfoButtons = hud.querySelectorAll<HTMLButtonElement>("[data-structure-info]");
  structureInfoButtons.forEach((btn) => {
    btn.onclick = () => {
      const type = btn.dataset.structureInfo as StructureInfoKey | undefined;
      if (!type) return;
      const info = structureInfoForKey(type);
      showCaptureAlert(info.title, info.detail, "warn");
    };
  });
  const selectedTech = state.techCatalog.find((t) => t.id === state.techUiSelectedId);
  const canPick = Boolean(selectedTech && selectedTech.requirements.canResearch && !state.pendingTechUnlockId);
  techChooseBtn.disabled = !canPick;
  mobileTechChooseBtn.disabled = !canPick;

  const techCardButtons = hud.querySelectorAll<HTMLButtonElement>("[data-tech-card]");
  techCardButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.techCard;
      if (!id) return;
      state.techUiSelectedId = id;
      if (visibleTechChoices.includes(id)) {
        techPickEl.value = id;
        mobileTechPickEl.value = id;
      }
      renderHud();
    };
  });
  const techUnlockButtons = hud.querySelectorAll<HTMLButtonElement>("[data-tech-unlock]");
  techUnlockButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.techUnlock;
      if (!id) return;
      chooseTech(id);
    };
  });
  const domainCardButtons = hud.querySelectorAll<HTMLButtonElement>("[data-domain-card]");
  domainCardButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.domainCard;
      if (!id) return;
      state.domainUiSelectedId = id;
      renderHud();
    };
  });
  const domainUnlockButtons = hud.querySelectorAll<HTMLButtonElement>("[data-domain-unlock]");
  domainUnlockButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.domainUnlock;
      if (!id) return;
      sendGameMessage({ type: "CHOOSE_DOMAIN", domainId: id }, "Finish sign-in before choosing a domain.");
    };
  });
  alliesListEl.innerHTML = `<h4>Current Allies</h4>${alliesHtml(state.allies, playerNameForOwner)}`;
  mobileAlliesListEl.innerHTML = `<h4>Current Allies</h4>${alliesHtml(state.allies, playerNameForOwner)}`;
  allianceRequestsEl.innerHTML = `<h4>Incoming Requests</h4>${allianceRequestsHtml(state.incomingAllianceRequests, playerNameForOwner)}`;
  mobileAllianceRequestsEl.innerHTML = `<h4>Incoming Requests</h4>${allianceRequestsHtml(state.incomingAllianceRequests, playerNameForOwner)}`;

  missionsEl.innerHTML = missionCardsHtml(state.missions);
  mobilePanelMissionsEl.innerHTML = missionCardsHtml(state.missions);
  panelDefensibilityEl.innerHTML = defensibilityPanelHtml();
  mobilePanelDefensibilityEl.innerHTML = defensibilityPanelHtml();
  panelEconomyEl.innerHTML = economyPanelHtml();
  mobilePanelEconomyEl.innerHTML = economyPanelHtml();
  leaderboardEl.innerHTML = leaderboardHtml(state.leaderboard, state.seasonVictory, state.seasonWinner);
  mobileLeaderboardEl.innerHTML = leaderboardHtml(state.leaderboard, state.seasonVictory, state.seasonWinner);
  feedEl.innerHTML = feedHtml(state.feed);
  mobileFeedEl.innerHTML = feedHtml(state.feed);

  const currentNationColor = state.playerColors.get(state.me) ?? authProfileColorEl.value;
  panelSettingsPreviewEl.innerHTML = `
    <div class="card">
      <p>Nation color is locked after onboarding.</p>
      <div class="color-preview">
        <div class="swatch" style="background:${currentNationColor}"></div>
        <span>${currentNationColor}</span>
      </div>
    </div>
    <div class="card auth-settings-card">
      <p>Signed in as ${state.authUserLabel || "Guest"}.</p>
      <button id="auth-logout" class="panel-btn" ${state.authReady ? "" : "disabled"}>Log Out</button>
    </div>
  `;

  const acceptButtons = hud.querySelectorAll<HTMLButtonElement>(".accept-request");
  acceptButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.requestId;
      if (!id) return;
      sendGameMessage({ type: "ALLIANCE_ACCEPT", requestId: id }, "Finish sign-in before responding to alliance requests.");
    };
  });
  const breakButtons = hud.querySelectorAll<HTMLButtonElement>(".break-ally");
  breakButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.allyId;
      if (!id) return;
      sendGameMessage({ type: "ALLIANCE_BREAK", targetPlayerId: id }, "Finish sign-in before changing alliances.");
    };
  });

  const authLogoutBtn = document.querySelector<HTMLButtonElement>("#auth-logout");
  if (authLogoutBtn) {
    authLogoutBtn.onclick = async () => {
      if (!firebaseAuth) return;
      await signOut(firebaseAuth);
      window.location.reload();
    };
  }
  const economyFocusButtons = hud.querySelectorAll<HTMLButtonElement>("[data-economy-focus]");
  economyFocusButtons.forEach((btn) => {
    btn.onclick = () => {
      const focus = btn.dataset.economyFocus as EconomyFocusKey | undefined;
      if (!focus) return;
      state.economyFocus = focus;
      renderHud();
    };
  });
  const canShowGuide = state.guide.open && state.authSessionReady && !state.profileSetupRequired;
  guideOverlayEl.style.display = canShowGuide ? "grid" : "none";
  if (canShowGuide) {
    const step = guideSteps[Math.min(state.guide.stepIndex, guideSteps.length - 1)]!;
    guideOverlayEl.innerHTML = `
      <div class="guide-backdrop" id="guide-backdrop"></div>
      <div class="guide-modal card" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <button id="guide-close" class="guide-close-btn" type="button" aria-label="Close guide">×</button>
        <div class="guide-modal-scroll">
          <div class="guide-kicker">Step ${state.guide.stepIndex + 1} of ${guideSteps.length}</div>
          <h2 id="guide-title" class="guide-title">${step.title}</h2>
          <p class="guide-body">${step.body}</p>
          <div class="guide-progress">
            ${guideSteps.map((_, index) => `<span class="guide-progress-segment${index <= state.guide.stepIndex ? " is-active" : ""}"></span>`).join("")}
          </div>
          <div class="guide-actions">
            <button id="guide-skip" class="guide-link-btn" type="button">Skip Tutorial</button>
            <div class="guide-actions-right">
              ${state.guide.stepIndex > 0 ? '<button id="guide-back" class="panel-btn guide-secondary-btn" type="button">Back</button>' : ""}
              <button id="guide-next" class="panel-btn guide-primary-btn" type="button">${state.guide.stepIndex === guideSteps.length - 1 ? "Get Started" : "Next"}</button>
            </div>
          </div>
        </div>
      </div>
    `;
    const closeGuide = (markComplete: boolean): void => {
      state.guide.open = false;
      if (markComplete) {
        state.guide.completed = true;
        storageSet(GUIDE_STORAGE_KEY, "1");
      }
      renderHud();
    };
    const guideCloseBtn = guideOverlayEl.querySelector<HTMLButtonElement>("#guide-close");
    const guideBackdropBtn = guideOverlayEl.querySelector<HTMLDivElement>("#guide-backdrop");
    const guideSkipBtn = guideOverlayEl.querySelector<HTMLButtonElement>("#guide-skip");
    const guideBackBtn = guideOverlayEl.querySelector<HTMLButtonElement>("#guide-back");
    const guideNextBtn = guideOverlayEl.querySelector<HTMLButtonElement>("#guide-next");
    if (guideCloseBtn) guideCloseBtn.onclick = () => closeGuide(true);
    if (guideBackdropBtn) guideBackdropBtn.onclick = () => closeGuide(true);
    if (guideSkipBtn) guideSkipBtn.onclick = () => closeGuide(true);
    if (guideBackBtn) {
      guideBackBtn.onclick = () => {
        state.guide.stepIndex = Math.max(0, state.guide.stepIndex - 1);
        renderHud();
      };
    }
    if (guideNextBtn) {
      guideNextBtn.onclick = () => {
        if (state.guide.stepIndex >= guideSteps.length - 1) {
          closeGuide(true);
          return;
        }
        state.guide.stepIndex += 1;
        renderHud();
      };
    }
  } else if (guideOverlayEl.innerHTML) {
    guideOverlayEl.innerHTML = "";
  }

  syncAuthOverlay();
  renderMobilePanels();
};

const resize = (): void => {
  const { width, height } = viewportSize();
  canvas.width = width;
  canvas.height = height;
};
window.addEventListener("resize", resize);
window.visualViewport?.addEventListener("resize", resize);
resize();

const defaultWsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3001/ws`;
const wsUrl = (import.meta.env.VITE_WS_URL as string | undefined) ?? defaultWsUrl;
const ws = new WebSocket(wsUrl);
let reconnectReloadTimer: number | undefined;
let authReconnectTimer: number | undefined;
const requireAuthedSession = (message = "Finish sign-in before interacting with the map."): boolean => {
  if (ws.readyState !== ws.OPEN) {
    setAuthStatus(`Game server unavailable at ${wsUrl}.`, "error");
    syncAuthOverlay();
    return false;
  }
  if (state.authSessionReady) return true;
  setAuthStatus(message, "error");
  syncAuthOverlay();
  return false;
};
const sendGameMessage = (payload: unknown, message?: string): boolean => {
  if (!requireAuthedSession(message)) return false;
  ws.send(JSON.stringify(payload));
  return true;
};
const clearReconnectReloadTimer = (): void => {
  if (reconnectReloadTimer !== undefined) {
    window.clearTimeout(reconnectReloadTimer);
    reconnectReloadTimer = undefined;
  }
};
const clearAuthReconnectTimer = (): void => {
  if (authReconnectTimer !== undefined) {
    window.clearTimeout(authReconnectTimer);
    authReconnectTimer = undefined;
  }
};
const scheduleAuthReconnect = (message: string, forceRefresh = false): void => {
  clearAuthReconnectTimer();
  state.authBusy = true;
  state.authRetrying = true;
  setAuthStatus(message);
  syncAuthOverlay();
  renderHud();
  authReconnectTimer = window.setTimeout(() => {
    authReconnectTimer = undefined;
    if (!firebaseAuth?.currentUser || ws.readyState !== ws.OPEN || state.authSessionReady) return;
    void authenticateSocket(forceRefresh).catch((error) => {
      state.authBusy = false;
      state.authRetrying = false;
      setAuthStatus(error instanceof Error ? error.message : "Could not reconnect to the game server.", "error");
      syncAuthOverlay();
      renderHud();
    });
  }, 2000);
};
const scheduleReconnectReload = (): void => {
  if (!state.hasEverInitialized) return;
  if (reconnectReloadTimer !== undefined) return;
  reconnectReloadTimer = window.setTimeout(() => {
    reconnectReloadTimer = undefined;
    if (state.connection === "initialized" || state.connection === "connected") return;
    window.location.reload();
  }, 4000);
};

const sendAllianceRequest = (target: string): void => {
  const t = target.trim();
  if (!t) return;
  sendGameMessage({ type: "ALLIANCE_REQUEST", targetPlayerName: t }, "Finish sign-in before sending alliance requests.");
};
const breakAlliance = (target: string): void => {
  const t = target.trim();
  if (!t) return;
  sendGameMessage({ type: "ALLIANCE_BREAK", targetPlayerId: t }, "Finish sign-in before breaking alliances.");
};
const currentTechPickId = (): string => {
  const byState = state.techUiSelectedId?.trim();
  if (byState) return byState;
  const byDesktop = techPickEl.value?.trim();
  if (byDesktop) return byDesktop;
  const byMobile = mobileTechPickEl.value?.trim();
  if (byMobile) return byMobile;
  return "";
};
const chooseTech = (techIdRaw?: string): void => {
  const techId = (techIdRaw ?? "").trim() || currentTechPickId();
  if (!techId) {
    console.error("[tech] choose blocked: empty tech id", {
      stateTechUiSelectedId: state.techUiSelectedId,
      desktopValue: techPickEl.value,
      mobileValue: mobileTechPickEl.value,
      choices: state.techChoices
    });
    pushFeed("No tech selected.", "tech", "warn");
    return;
  }
  if (ws.readyState !== ws.OPEN) {
    console.error("[tech] choose blocked: websocket not open", { techId, readyState: ws.readyState });
    pushFeed("Cannot choose tech while disconnected.", "tech", "error");
    return;
  }
  if (!state.authSessionReady) {
    setAuthStatus("Finish sign-in before choosing a technology.", "error");
    syncAuthOverlay();
    return;
  }
  if (state.pendingTechUnlockId) {
    pushFeed("Already unlocking a technology. Waiting for server confirmation...", "tech", "warn");
    return;
  }
  const tech = state.techCatalog.find((item) => item.id === techId);
  if (!tech) {
    pushFeed("That technology is no longer available.", "tech", "warn");
    return;
  }
  state.techUiSelectedId = techId;
  state.pendingTechUnlockId = techId;
  const startedAt = Date.now();
  state.currentResearch = {
    techId,
    startedAt,
    completesAt: startedAt + ((tech.researchTimeSeconds ?? 1) * 1000)
  };
  console.info("[tech] sending CHOOSE_TECH", { techId });
  ws.send(JSON.stringify({ type: "CHOOSE_TECH", techId }));
  pushFeed(`Research started: ${tech.name}.`, "tech", "info");
  renderHud();
};

const explainActionFailure = (code: string, message: string): string => {
  if (code === "INSUFFICIENT_GOLD") return `Action blocked: ${message}.`;
  if (code === "SETTLE_INVALID") return `Cannot settle: ${message}.`;
  if (code === "FORT_BUILD_INVALID") return `Cannot build fort: ${message}.`;
  if (code === "OBSERVATORY_BUILD_INVALID") return `Cannot build observatory: ${message}.`;
  if (code === "SIEGE_OUTPOST_BUILD_INVALID") return `Cannot build siege outpost: ${message}.`;
  if (code === "ECONOMIC_STRUCTURE_BUILD_INVALID") return `Cannot build structure: ${message}.`;
  if (code === "REVEAL_EMPIRE_INVALID") return `Cannot reveal empire: ${message}.`;
  if (code === "SABOTAGE_INVALID") return `Cannot sabotage tile: ${message}.`;
  if (code === "DEEP_STRIKE_INVALID") return `Cannot deep strike: ${message}.`;
  if (code === "NAVAL_INFILTRATION_INVALID") return `Cannot launch naval infiltration: ${message}.`;
  if (code === "CREATE_MOUNTAIN_INVALID") return `Cannot create mountain: ${message}.`;
  if (code === "REMOVE_MOUNTAIN_INVALID") return `Cannot remove mountain: ${message}.`;
  if (code === "NOT_ADJACENT") return "Action blocked: target must border your territory or a linked dock.";
  if (code === "NOT_OWNER") return "Action blocked: you need to launch from one of your own tiles.";
  if (code === "LOCKED") return "Action blocked: the tile is already in combat.";
  if (code === "BARRIER") return "Action blocked: only land tiles can be claimed or attacked.";
  if (code === "SHIELDED") return "Action blocked: that empire is still under spawn protection.";
  if (code === "ALLY_TARGET") return "Action blocked: you cannot attack an allied empire.";
  if (code === "BREAKTHROUGH_TARGET_INVALID") return `Cannot launch breach attack: ${message}.`;
  if (code === "EXPAND_TARGET_OWNED") return "Frontier claim failed: that tile is already owned.";
  if (message.includes("development slots are busy")) return `Cannot start development: ${message}. You can run up to ${DEVELOPMENT_PROCESS_LIMIT} at once.`;
  return `Error ${code}: ${message}`;
};

const enqueueTarget = (x: number, y: number, mode: "normal" | "breakthrough" = "normal"): boolean => {
  const k = key(x, y);
  if (state.queuedTargetKeys.has(k)) {
    const stillQueued = state.actionQueue.some((entry) => key(entry.x, entry.y) === k);
    const currentlyExecuting = state.actionInFlight && state.actionTargetKey === k;
    if (!stillQueued && !currentlyExecuting) state.queuedTargetKeys.delete(k);
  }
  if (state.queuedTargetKeys.has(k)) return false;
  state.actionQueue.push({ x, y, mode, retries: 0 });
  state.queuedTargetKeys.add(k);
  return true;
};

const worldTileRawFromPointer = (offsetX: number, offsetY: number): { gx: number; gy: number } => {
  const size = state.zoom;
  const halfW = Math.floor(canvas.width / size / 2);
  const halfH = Math.floor(canvas.height / size / 2);
  return {
    gx: Math.floor(offsetX / size) - halfW + state.camX,
    gy: Math.floor(offsetY / size) - halfH + state.camY
  };
};

const computeDragPreview = (): void => {
  const start = state.boxSelectStart;
  const cur = state.boxSelectCurrent;
  state.dragPreviewKeys.clear();
  if (!start || !cur) return;
  const minX = Math.min(start.gx, cur.gx);
  const maxX = Math.max(start.gx, cur.gx);
  const minY = Math.min(start.gy, cur.gy);
  const maxY = Math.max(start.gy, cur.gy);
  const area = (maxX - minX + 1) * (maxY - minY + 1);
  if (area > 2500) return;
  for (let gy = minY; gy <= maxY; gy += 1) {
    for (let gx = minX; gx <= maxX; gx += 1) {
      const wx = wrapX(gx);
      const wy = wrapY(gy);
      const t = state.tiles.get(key(wx, wy));
      if (!t || t.fogged || t.terrain !== "LAND") continue;
      if (t.ownerId === state.me) {
        if (!hasCollectableYield(t)) continue;
      }
      state.dragPreviewKeys.add(key(wx, wy));
    }
  }
};

const buildFrontierQueue = (
  candidates: string[],
  enqueue: (x: number, y: number) => boolean
): { queued: number; skipped: number; queuedKeys: string[] } => {
  if (candidates.length === 0) return { queued: 0, skipped: 0, queuedKeys: [] };
  const owned = new Set<string>();
  for (const t of state.tiles.values()) {
    if (t.ownerId === state.me) owned.add(key(t.x, t.y));
  }
  const planned = new Set<string>();
  const remaining = new Set<string>(candidates);
  let queued = 0;

  while (remaining.size > 0) {
    const frontier: string[] = [];
    for (const k of remaining) {
      const { x, y } = parseKey(k);
      const neighbors = [
        key(wrapX(x), wrapY(y - 1)),
        key(wrapX(x + 1), wrapY(y)),
        key(wrapX(x), wrapY(y + 1)),
        key(wrapX(x - 1), wrapY(y)),
        key(wrapX(x - 1), wrapY(y - 1)),
        key(wrapX(x + 1), wrapY(y - 1)),
        key(wrapX(x + 1), wrapY(y + 1)),
        key(wrapX(x - 1), wrapY(y + 1))
      ];
      if (neighbors.some((n) => owned.has(n) || planned.has(n))) frontier.push(k);
    }
    if (frontier.length === 0) break;
    frontier.sort();
    for (const k of frontier) {
      const { x, y } = parseKey(k);
      remaining.delete(k);
      if (enqueue(x, y)) {
        planned.add(k);
        queued += 1;
      }
    }
  }

  return { queued, skipped: remaining.size, queuedKeys: [...planned] };
};
const queueDragSelection = (): { queued: number; skipped: number } =>
  buildFrontierQueue([...state.dragPreviewKeys], (x, y) => enqueueTarget(x, y));

const applyPendingSettlementsFromServer = (
  entries: Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined
): void => {
  if (!entries) return;
  const now = Date.now();
  const previousProgress = new Map(state.settleProgressByTile);
  let ignoredStaleEntry = false;
  for (const tileKey of state.settleProgressByTile.keys()) clearOptimisticTileState(tileKey);
  state.settleProgressByTile.clear();
  let latestKey = "";
  let latestResolvesAt = -Infinity;
  for (const entry of entries) {
    if (entry.resolvesAt <= now - SETTLEMENT_CONFIRM_STALE_MS) {
      ignoredStaleEntry = true;
      continue;
    }
    const tileKey = key(entry.x, entry.y);
    const awaitingServerConfirm = entry.resolvesAt <= now;
    const nextProgress: TileTimedProgress = {
      startAt: entry.startedAt,
      resolvesAt: entry.resolvesAt,
      target: { x: entry.x, y: entry.y },
      awaitingServerConfirm
    };
    const confirmRefreshRequestedAt = previousProgress.get(tileKey)?.confirmRefreshRequestedAt;
    if (typeof confirmRefreshRequestedAt === "number") nextProgress.confirmRefreshRequestedAt = confirmRefreshRequestedAt;
    state.settleProgressByTile.set(tileKey, nextProgress);
    syncOptimisticSettlementTile(entry.x, entry.y, awaitingServerConfirm);
    if (entry.resolvesAt > latestResolvesAt) {
      latestResolvesAt = entry.resolvesAt;
      latestKey = tileKey;
    }
  }
  state.latestSettleTargetKey = latestKey;
  if (ignoredStaleEntry) requestViewRefresh(2, true);
};

const queueSpecificTargets = (
  targetKeys: string[],
  mode: "normal" | "breakthrough"
): { queued: number; skipped: number; queuedKeys: string[] } => {
  const neutralTargets: string[] = [];
  const attackTargets: string[] = [];
  for (const targetKey of targetKeys) {
    const tile = state.tiles.get(targetKey);
    if (!tile || tile.terrain !== "LAND" || tile.fogged) continue;
    if (!tile.ownerId) neutralTargets.push(targetKey);
    else if (tile.ownerId !== state.me && !isTileOwnedByAlly(tile)) attackTargets.push(targetKey);
  }

  const neutralResult = buildFrontierQueue(neutralTargets, (x, y) => enqueueTarget(x, y, mode));
  const queuedKeys = [...neutralResult.queuedKeys];
  let queued = neutralResult.queued;
  let skipped = neutralResult.skipped;

  for (const targetKey of attackTargets) {
    const tile = state.tiles.get(targetKey);
    if (!tile) {
      skipped += 1;
      continue;
    }
    const { x, y } = parseKey(targetKey);
    if (!pickOriginForTarget(x, y) && !tile.dockId) {
      skipped += 1;
      continue;
    }
    if (!enqueueTarget(x, y, mode)) {
      skipped += 1;
      continue;
    }
    queued += 1;
    queuedKeys.push(targetKey);
  }

  return { queued, skipped, queuedKeys };
};

const attackQueueFailureReason = (tile: Tile, mode: "normal" | "breakthrough"): string => {
  if (mode === "breakthrough" && !hasBreakthroughCapability()) return "Requires Breach Doctrine.";
  if (mode === "breakthrough" && (state.strategicResources.IRON ?? 0) < 1) return "Need 1 IRON.";
  if (state.gold < (mode === "breakthrough" ? 2 : FRONTIER_CLAIM_COST)) return `Need ${mode === "breakthrough" ? 2 : FRONTIER_CLAIM_COST} gold.`;
  if (!pickOriginForTarget(tile.x, tile.y)) {
    return tile.dockId ? "No owned linked dock can reach this target." : "Target must border your territory or a linked dock.";
  }
  return "Action could not be queued.";
};

const dropQueuedTargetKeyIfAbsent = (targetKey: string): void => {
  if (!targetKey) return;
  const stillQueued = state.actionQueue.some((entry) => key(entry.x, entry.y) === targetKey);
  if (!stillQueued) state.queuedTargetKeys.delete(targetKey);
};

const reconcileActionQueue = (): void => {
  const nextQueue: typeof state.actionQueue = [];
  const nextQueuedKeys = new Set<string>();
  for (const entry of state.actionQueue) {
    const targetKey = key(entry.x, entry.y);
    const tile = state.tiles.get(targetKey);
    if (!tile) continue;
    if (tile.ownerId === state.me) {
      clearOptimisticTileState(targetKey);
      continue;
    }
    const hasConfirmedOrigin = tile.ownerId
      ? Boolean(pickOriginForTarget(tile.x, tile.y))
      : Boolean(pickOriginForTarget(tile.x, tile.y, false, false));
    const hasOptimisticOrigin = tile.ownerId
      ? hasConfirmedOrigin
      : Boolean(pickOriginForTarget(tile.x, tile.y, false, true));
    if (!hasConfirmedOrigin && !hasOptimisticOrigin) {
      clearOptimisticTileState(targetKey, true);
      state.autoSettleTargets.delete(targetKey);
      continue;
    }
    nextQueue.push(entry);
    nextQueuedKeys.add(targetKey);
  }
  state.actionQueue = nextQueue;
  if (state.actionInFlight && state.actionTargetKey) nextQueuedKeys.add(state.actionTargetKey);
  state.queuedTargetKeys = nextQueuedKeys;
};

const requestSettlement = (x: number, y: number): boolean => {
  const tile = state.tiles.get(key(x, y));
  if (!tile || tile.ownerId !== state.me || tile.ownershipState !== "FRONTIER") {
    pushFeed("Cannot settle: tile is not one of your frontier tiles.", "combat", "warn");
    renderHud();
    return false;
  }
  const slots = developmentSlotSummary();
  if (slots.available <= 0) {
    pushFeed(developmentSlotReason(slots), "combat", "warn");
    renderHud();
    return false;
  }
  if (!canAffordCost(state.gold, SETTLE_COST)) {
    pushFeed(`Need ${SETTLE_COST} gold to settle this tile.`, "combat", "warn");
    renderHud();
    return false;
  }
  if (!sendGameMessage({ type: "SETTLE", x, y })) return false;
  const startAt = Date.now();
  const progress = { startAt, resolvesAt: startAt + settleDurationMsForTile(x, y), target: { x, y }, awaitingServerConfirm: false };
  const tileKey = key(x, y);
  state.gold = Math.max(0, state.gold - SETTLE_COST);
  state.settleProgressByTile.set(tileKey, progress);
  state.latestSettleTargetKey = tileKey;
  syncOptimisticSettlementTile(x, y, false);
  state.selected = { x, y };
  state.attackPreview = undefined;
  state.attackPreviewPendingKey = "";
  renderHud();
  return true;
};

const ensureDevelopmentSlotBeforeAction = (): boolean => {
  const summary = developmentSlotSummary();
  if (summary.available > 0) return true;
  pushFeed(developmentSlotReason(summary), "combat", "warn");
  renderHud();
  return false;
};

const sendDevelopmentBuild = (payload: unknown, optimistic: () => void): boolean => {
  if (!ensureDevelopmentSlotBeforeAction()) return false;
  if (!sendGameMessage(payload)) return false;
  optimistic();
  renderHud();
  return true;
};

const processActionQueue = (): boolean => {
  if (state.actionInFlight || ws.readyState !== ws.OPEN || !state.authSessionReady) return false;
  while (state.actionQueue.length > 0) {
    const next = state.actionQueue[0];
    if (!next) return false;

    const targetKey = key(next.x, next.y);
    const to = state.tiles.get(targetKey);
    if (!to) {
      state.actionQueue.shift();
      state.queuedTargetKeys.delete(targetKey);
      continue;
    }
    if (to.ownerId === state.me) {
      state.actionQueue.shift();
      state.queuedTargetKeys.delete(targetKey);
      continue;
    }

    const allowOptimisticOrigin = Boolean(to.ownerId);
    let from = to.ownerId ? pickOriginForTarget(to.x, to.y) : pickOriginForTarget(to.x, to.y, false, false);
    const optimisticFrom = to.ownerId ? from : pickOriginForTarget(to.x, to.y, false, true);
    const selectedFrom = state.selected ? state.tiles.get(key(state.selected.x, state.selected.y)) : undefined;
    if (
      !from &&
      selectedFrom &&
      selectedFrom.ownerId === state.me &&
      isAdjacent(selectedFrom.x, selectedFrom.y, to.x, to.y) &&
      (allowOptimisticOrigin || selectedFrom.optimisticPending !== "expand")
    ) {
      from = selectedFrom;
    }
    if (!from && !allowOptimisticOrigin && optimisticFrom) return false;
    if (!from && to.ownerId && to.dockId) {
      from = to;
    }
    if (!from) {
      state.actionQueue.shift();
      state.queuedTargetKeys.delete(targetKey);
      continue;
    }
    state.actionQueue.shift();

    state.actionCurrent = {
      x: to.x,
      y: to.y,
      retries: next.retries ?? 0
    };
    if (next.mode) state.actionCurrent.mode = next.mode;
    state.actionInFlight = true;
    state.combatStartAck = false;
    state.actionStartedAt = Date.now();
    state.actionTargetKey = targetKey;
    state.captureAlert = undefined;
    const optimisticMs = !to.ownerId ? frontierClaimDurationMsForTile(to.x, to.y) : 3_000;
    state.capture = { startAt: Date.now(), resolvesAt: Date.now() + optimisticMs, target: { x: to.x, y: to.y } };
    if (!to.ownerId) {
      applyOptimisticTileState(to.x, to.y, (tile) => {
        tile.ownerId = state.me;
        tile.ownershipState = "FRONTIER";
        tile.fogged = false;
        tile.optimisticPending = "expand";
      });
    }
    state.attackPreview = undefined;
    state.attackPreviewPendingKey = "";
    if (!to.ownerId) {
      if (!canAffordCost(state.gold, FRONTIER_CLAIM_COST)) {
        notifyInsufficientGoldForFrontierAction("claim");
        state.capture = undefined;
        state.actionInFlight = false;
        state.actionCurrent = undefined;
        state.actionTargetKey = "";
        state.combatStartAck = false;
        state.queuedTargetKeys.delete(targetKey);
        renderHud();
        continue;
      }
      ws.send(JSON.stringify({ type: "EXPAND", fromX: from.x, fromY: from.y, toX: to.x, toY: to.y }));
      pushFeed(`Queued expand (${to.x}, ${to.y}) from (${from.x}, ${from.y})`, "combat", "info");
    } else {
      if (next.mode !== "breakthrough" && !canAffordCost(state.gold, FRONTIER_CLAIM_COST)) {
        notifyInsufficientGoldForFrontierAction("attack");
        state.capture = undefined;
        state.actionInFlight = false;
        state.actionCurrent = undefined;
        state.actionTargetKey = "";
        state.combatStartAck = false;
        state.queuedTargetKeys.delete(targetKey);
        renderHud();
        continue;
      }
      if (next.mode === "breakthrough") {
        ws.send(JSON.stringify({ type: "BREAKTHROUGH_ATTACK", fromX: from.x, fromY: from.y, toX: to.x, toY: to.y }));
        pushFeed(`Queued breakthrough (${to.x}, ${to.y}) from (${from.x}, ${from.y})`, "combat", "warn");
      } else {
        ws.send(JSON.stringify({ type: "ATTACK", fromX: from.x, fromY: from.y, toX: to.x, toY: to.y }));
        pushFeed(`Queued attack (${to.x}, ${to.y}) from (${from.x}, ${from.y})`, "combat", "info");
      }
    }
    state.selected = { x: to.x, y: to.y };
    renderHud();
    return true;
  }
  return false;
};
const requestAttackPreviewForHover = (): void => {
  if (ws.readyState !== ws.OPEN) return;
  if (!state.authSessionReady) return;
  if (state.actionInFlight || state.capture) return;
  if (!state.selected || !state.hover) return;
  const from = state.tiles.get(key(state.selected.x, state.selected.y));
  const to = state.tiles.get(key(state.hover.x, state.hover.y));
  if (!from || !to) return;
  if (from.ownerId !== state.me) return;
  if (!to.ownerId || to.ownerId === state.me || to.fogged) {
    state.attackPreview = undefined;
    state.attackPreviewPendingKey = "";
    return;
  }
  const fromKey = key(from.x, from.y);
  const toKey = key(to.x, to.y);
  const previewKey = `${fromKey}->${toKey}`;
  if (state.attackPreviewPendingKey === previewKey) return;
  if (state.attackPreview && state.attackPreview.fromKey === fromKey && state.attackPreview.toKey === toKey) return;
  const nowMs = Date.now();
  if (nowMs - state.lastAttackPreviewAt < 120) return;
  state.lastAttackPreviewAt = nowMs;
  state.attackPreviewPendingKey = previewKey;
  ws.send(JSON.stringify({ type: "ATTACK_PREVIEW", fromX: from.x, fromY: from.y, toX: to.x, toY: to.y }));
};

const requestAttackPreviewForTarget = (to: Tile): void => {
  if (ws.readyState !== ws.OPEN) return;
  if (!state.authSessionReady) return;
  if (state.actionInFlight || state.capture) return;
  if (!to.ownerId || to.ownerId === state.me || to.fogged) return;
  const from = pickOriginForTarget(to.x, to.y);
  if (!from && !to.dockId) return;
  if (from && from.ownerId !== state.me) return;
  const fromKey = key(from?.x ?? to.x, from?.y ?? to.y);
  const toKey = key(to.x, to.y);
  const previewKey = `${fromKey}->${toKey}`;
  if (state.attackPreviewPendingKey === previewKey) return;
  if (state.attackPreview && state.attackPreview.toKey === toKey && (state.attackPreview.fromKey === fromKey || (!from && to.dockId))) return;
  const nowMs = Date.now();
  if (nowMs - state.lastAttackPreviewAt < 120) return;
  state.lastAttackPreviewAt = nowMs;
  state.attackPreviewPendingKey = previewKey;
  ws.send(JSON.stringify({ type: "ATTACK_PREVIEW", fromX: from?.x ?? to.x, fromY: from?.y ?? to.y, toX: to.x, toY: to.y }));
};

const attackPreviewDetailForTarget = (to: Tile, mode: "normal" | "breakthrough" = "normal"): string | undefined => {
  const from = pickOriginForTarget(to.x, to.y);
  const toKey = key(to.x, to.y);
  if (!state.attackPreview || state.attackPreview.toKey !== toKey) return undefined;
  if (from) {
    const fromKey = key(from.x, from.y);
    if (state.attackPreview.fromKey !== fromKey) return undefined;
  } else if (!to.dockId) {
    return undefined;
  }
  if (!state.attackPreview.valid) return state.attackPreview.reason ? `Attack ${state.attackPreview.reason}` : undefined;
  if (mode === "breakthrough" && typeof state.attackPreview.breakthroughWinChance === "number") {
    return `${Math.round(state.attackPreview.breakthroughWinChance * 100)}% breach win chance`;
  }
  if (typeof state.attackPreview.winChance === "number") return `${Math.round(state.attackPreview.winChance * 100)}% win chance`;
  return undefined;
};
const buildFortOnSelected = (): void => {
  const sel = state.selected;
  if (!sel) {
    pushFeed("Select an owned border/dock tile first.", "error", "warn");
    renderHud();
    return;
  }
  sendGameMessage({ type: "BUILD_FORT", x: sel.x, y: sel.y });
};
const settleSelected = (): void => {
  const sel = state.selected;
  if (!sel) {
    pushFeed("Select a frontier tile first.", "error", "warn");
    renderHud();
    return;
  }
  const tile = state.tiles.get(key(sel.x, sel.y));
  if (!tile || tile.ownerId !== state.me || tile.ownershipState !== "FRONTIER") {
    pushFeed("Selected tile is not one of your frontier tiles.", "error", "warn");
    renderHud();
    return;
  }
  if (!requestSettlement(sel.x, sel.y)) return;
  pushFeed(`Settlement started at (${sel.x}, ${sel.y}).`, "combat", "info");
};
const buildSiegeOutpostOnSelected = (): void => {
  const sel = state.selected;
  if (!sel) {
    pushFeed("Select an owned border tile first.", "error", "warn");
    renderHud();
    return;
  }
  sendGameMessage({ type: "BUILD_SIEGE_OUTPOST", x: sel.x, y: sel.y });
};
const uncaptureSelected = (): void => {
  const sel = state.selected;
  if (!sel) {
    pushFeed("Select one of your tiles to uncapture.", "error", "warn");
    renderHud();
    return;
  }
  const t = state.tiles.get(key(sel.x, sel.y));
  if (!t || t.ownerId !== state.me) {
    pushFeed("Selected tile is not owned by you.", "error", "warn");
    renderHud();
    return;
  }
  sendGameMessage({ type: "UNCAPTURE_TILE", x: sel.x, y: sel.y });
};
const cancelOngoingCapture = (): void => {
  state.actionQueue.length = 0;
  state.queuedTargetKeys.clear();
  state.dragPreviewKeys.clear();
  sendGameMessage({ type: "CANCEL_CAPTURE" });
};
const collectVisibleYield = (): void => {
  const remaining = state.collectVisibleCooldownUntil - Date.now();
  if (remaining > 0) {
    showCollectVisibleCooldownAlert();
    pushFeed(`Collect visible cooling down for ${formatCooldownShort(remaining)}.`, "info", "warn");
    renderHud();
    return;
  }
  state.collectVisibleCooldownUntil = Date.now() + COLLECT_VISIBLE_COOLDOWN_MS;
  applyOptimisticVisibleCollect();
  renderHud();
  sendGameMessage({ type: "COLLECT_VISIBLE" });
};
const collectSelectedYield = (): void => {
  const sel = state.selected;
  if (!sel) return;
  const tile = state.tiles.get(key(sel.x, sel.y));
  if (!tile || tile.ownerId !== state.me || tile.ownershipState !== "SETTLED") return;
  applyOptimisticTileCollect(tile);
  renderHud();
  sendGameMessage({ type: "COLLECT_TILE", x: sel.x, y: sel.y });
};

const hideHoldBuildMenu = (): void => {
  holdBuildMenuEl.style.display = "none";
  holdBuildMenuEl.innerHTML = "";
};

const hideTileActionMenu = (): void => {
  state.tileActionMenu.visible = false;
  state.tileActionMenu.bulkKeys = [];
  state.tileActionMenu.currentTileKey = "";
  state.tileActionMenu.activeTab = "overview";
  tileActionMenuEl.style.display = "none";
  tileActionMenuEl.innerHTML = "";
};

type TileActionDef = {
  id:
    | "settle_land"
    | "launch_attack"
    | "launch_breach_attack"
    | "reveal_empire"
    | "collect_yield"
    | "build_fortification"
    | "build_observatory"
    | "build_farmstead"
    | "build_camp"
    | "build_mine"
    | "build_market"
    | "build_granary"
    | "build_bank"
    | "build_airport"
    | "build_caravanary"
    | "build_quartermaster"
    | "build_ironworks"
    | "build_crystal_synthesizer"
    | "build_fuel_plant"
    | "build_foundry"
    | "build_garrison_hall"
    | "build_customs_house"
    | "build_governors_office"
    | "build_radar_system"
    | "abandon_territory"
    | "build_siege_camp"
    | "deep_strike"
    | "naval_infiltration"
    | "sabotage_tile"
    | "create_mountain"
    | "remove_mountain";
  label: string;
  cost?: string;
  detail?: string | undefined;
  disabled?: boolean;
  disabledReason?: string;
  targetKey?: string;
  originKey?: string;
};

type DevelopmentSlotSummary = {
  busy: number;
  limit: number;
  available: number;
};

type EconomyFocusKey = "ALL" | "GOLD" | "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD";
const tileActionIsCrystal = (id: TileActionDef["id"]): boolean =>
  id === "reveal_empire" ||
  id === "deep_strike" ||
  id === "naval_infiltration" ||
  id === "sabotage_tile" ||
  id === "create_mountain" ||
  id === "remove_mountain";

const tileActionIsBuilding = (id: TileActionDef["id"]): boolean => id.startsWith("build_");

const hideTechLockedTileAction = (action: TileActionDef): boolean => {
  if (!action.disabled || !action.disabledReason) return false;
  return /^Requires\b/i.test(action.disabledReason) || /^Need reveal capability\b/i.test(action.disabledReason);
};

const splitTileActionsIntoTabs = (
  actions: TileActionDef[]
): Pick<TileMenuView, "actions" | "buildings" | "crystal"> => {
  const filtered = actions.filter((action) => !hideTechLockedTileAction(action));
  return {
    actions: filtered.filter((action) => !tileActionIsBuilding(action.id) && !tileActionIsCrystal(action.id)),
    buildings: filtered.filter((action) => tileActionIsBuilding(action.id)),
    crystal: filtered.filter((action) => tileActionIsCrystal(action.id))
  };
};
const isTileOwnedByAlly = (tile: Tile): boolean => Boolean(tile.ownerId && state.allies.includes(tile.ownerId));

const chebyshevDistanceClient = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return Math.max(dx, dy);
};

const hostileObservatoryProtectingTile = (tile: Tile): Tile | undefined => {
  for (const candidate of state.tiles.values()) {
    if (!candidate.observatory || candidate.observatory.status !== "active") continue;
    if (!candidate.ownerId || candidate.ownerId === state.me || state.allies.includes(candidate.ownerId)) continue;
    if (candidate.fogged) continue;
    if (chebyshevDistanceClient(candidate.x, candidate.y, tile.x, tile.y) <= OBSERVATORY_PROTECTION_RADIUS) return candidate;
  }
  return undefined;
};

const developmentSlotLimit = (): number => DEVELOPMENT_PROCESS_LIMIT;

const developmentSlotSummary = (): DevelopmentSlotSummary => {
  let busy = state.settleProgressByTile.size;
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me) continue;
    if (
      tile.fort?.status === "under_construction" ||
      tile.observatory?.status === "under_construction" ||
      tile.siegeOutpost?.status === "under_construction" ||
      tile.economicStructure?.status === "under_construction"
    ) {
      busy += 1;
    }
  }
  const limit = developmentSlotLimit();
  return {
    busy,
    limit,
    available: Math.max(0, limit - busy)
  };
};

const developmentSlotReason = (summary = developmentSlotSummary()): string => {
  return `No available development slots (${summary.busy}/${summary.limit} busy)`;
};

const abilityCooldownRemainingMs = (
  abilityId: "deep_strike" | "naval_infiltration" | "sabotage" | "reveal_empire" | "create_mountain" | "remove_mountain"
): number =>
  Math.max(0, (state.abilityCooldowns[abilityId] ?? 0) - Date.now());

const formatCooldownShort = (ms: number): string => {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const formatCountdownClock = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const SETTLEMENT_CONFIRM_REFRESH_MS = 4_000;
const SETTLEMENT_CONFIRM_REFRESH_COOLDOWN_MS = 4_000;
const SETTLEMENT_CONFIRM_STALE_MS = 15_000;

const clearSettlementProgressByKey = (tileKey: string): void => {
  if (!tileKey) return;
  state.settleProgressByTile.delete(tileKey);
  clearOptimisticTileState(tileKey);
  if (state.latestSettleTargetKey === tileKey) state.latestSettleTargetKey = "";
};

const clearSettlementProgressForTile = (x: number, y: number): void => {
  clearSettlementProgressByKey(key(x, y));
};

const syncOptimisticSettlementTile = (x: number, y: number, awaitingServerConfirm: boolean): void => {
  applyOptimisticTileState(x, y, (tile) => {
    tile.ownerId = state.me;
    tile.ownershipState = awaitingServerConfirm ? "SETTLED" : tile.ownershipState === "SETTLED" ? "SETTLED" : "FRONTIER";
    tile.fogged = false;
    tile.optimisticPending = "settle";
  });
};

const settlementProgressForTile = (x: number, y: number): TileTimedProgress | undefined => {
  const tileKey = key(x, y);
  const progress = state.settleProgressByTile.get(tileKey);
  if (!progress) return undefined;
  const now = Date.now();
  if (progress.resolvesAt <= now && !progress.awaitingServerConfirm) {
    progress.awaitingServerConfirm = true;
    state.settleProgressByTile.set(tileKey, progress);
    syncOptimisticSettlementTile(x, y, true);
  }
  if (
    progress.awaitingServerConfirm &&
    now - progress.resolvesAt >= SETTLEMENT_CONFIRM_REFRESH_MS &&
    (!progress.confirmRefreshRequestedAt || now - progress.confirmRefreshRequestedAt >= SETTLEMENT_CONFIRM_REFRESH_COOLDOWN_MS)
  ) {
    progress.confirmRefreshRequestedAt = now;
    state.settleProgressByTile.set(tileKey, progress);
    requestViewRefresh(2, true);
  }
  return progress;
};

const cleanupExpiredSettlementProgress = (): boolean => {
  const now = Date.now();
  let changed = false;
  let requestedRefresh = false;
  for (const [tileKey, existing] of [...state.settleProgressByTile.entries()]) {
    const progress = { ...existing };
    if (progress.resolvesAt <= now && !progress.awaitingServerConfirm) {
      progress.awaitingServerConfirm = true;
      state.settleProgressByTile.set(tileKey, progress);
      syncOptimisticSettlementTile(progress.target.x, progress.target.y, true);
      changed = true;
    }
    if (
      progress.awaitingServerConfirm &&
      now - progress.resolvesAt >= SETTLEMENT_CONFIRM_REFRESH_MS &&
      (!progress.confirmRefreshRequestedAt || now - progress.confirmRefreshRequestedAt >= SETTLEMENT_CONFIRM_REFRESH_COOLDOWN_MS)
    ) {
      progress.confirmRefreshRequestedAt = now;
      state.settleProgressByTile.set(tileKey, progress);
      requestedRefresh = true;
    }
    if (progress.awaitingServerConfirm && now - progress.resolvesAt >= SETTLEMENT_CONFIRM_STALE_MS) {
      clearSettlementProgressByKey(tileKey);
      changed = true;
      requestedRefresh = true;
    }
  }
  if (requestedRefresh) requestViewRefresh(2, true);
  return changed;
};

const activeSettlementProgressEntries = (): TileTimedProgress[] => {
  cleanupExpiredSettlementProgress();
  return [...state.settleProgressByTile.values()].sort((a, b) => a.resolvesAt - b.resolvesAt);
};

const primarySettlementProgress = (): TileTimedProgress | undefined => {
  const selected = state.selected ? settlementProgressForTile(state.selected.x, state.selected.y) : undefined;
  if (selected) return selected;
  const latest = state.latestSettleTargetKey ? state.settleProgressByTile.get(state.latestSettleTargetKey) : undefined;
  if (latest) return latest;
  return activeSettlementProgressEntries()[0];
};

const constructionCountdownLineForTile = (tile: Tile): string => {
  if (tile.fort?.status === "under_construction" && typeof tile.fort.completesAt === "number") {
    return `Fortifying... ${formatCountdownClock(tile.fort.completesAt - Date.now())}`;
  }
  if (tile.observatory?.status === "under_construction" && typeof tile.observatory.completesAt === "number") {
    return `Building Observatory... ${formatCountdownClock(tile.observatory.completesAt - Date.now())}`;
  }
  if (tile.siegeOutpost?.status === "under_construction" && typeof tile.siegeOutpost.completesAt === "number") {
    return `Building Siege Camp... ${formatCountdownClock(tile.siegeOutpost.completesAt - Date.now())}`;
  }
  if (tile.economicStructure?.status === "under_construction" && typeof tile.economicStructure.completesAt === "number") {
    return `Building ${economicStructureName(tile.economicStructure.type)}... ${formatCountdownClock(tile.economicStructure.completesAt - Date.now())}`;
  }
  return "";
};

const constructionRemainingMsForTile = (tile: Tile): number | undefined => {
  const completesAt =
    tile.fort?.status === "under_construction"
      ? tile.fort.completesAt
      : tile.observatory?.status === "under_construction"
        ? tile.observatory.completesAt
        : tile.siegeOutpost?.status === "under_construction"
          ? tile.siegeOutpost.completesAt
          : tile.economicStructure?.status === "under_construction"
            ? tile.economicStructure.completesAt
            : undefined;
  return typeof completesAt === "number" ? Math.max(0, completesAt - Date.now()) : undefined;
};

const buildDetailTextForAction = (actionId: TileActionDef["id"], tile: Tile, supportedTown?: Tile): string | undefined => {
  if (actionId === "settle_land") {
    const seconds = Math.round(settleDurationMsForTile(tile.x, tile.y) / 1000);
    return `Makes this tile defended and activates production. ${SETTLE_COST} gold • ${seconds}s${isForestTile(tile.x, tile.y) ? " (Forest)" : ""}`;
  }
  if (actionId === "build_fortification") return "Fortify this tile. +25% defense here. Active forts also stop failed attacks from losing the origin tile.";
  if (actionId === "build_observatory") return `Extends local vision by ${OBSERVATORY_VISION_BONUS} and blocks hostile crystal actions nearby.`;
  if (actionId === "build_siege_camp") return "Adds an offensive staging point on this border tile. Attacks from here hit 25% harder.";
  if (actionId === "build_farmstead") return "Improves food output on this tile by 50%.";
  if (actionId === "build_camp") return "Improves supply output on this tile by 50%.";
  if (actionId === "build_mine") return `Improves ${tile.resource === "IRON" ? "iron" : "crystal"} output on this tile by 50%.`;
  if (actionId === "build_market") {
    const townLabel = supportedTown ? `town at (${supportedTown.x}, ${supportedTown.y})` : "supported town";
    return `Build on this support tile for the ${townLabel}. Grants +50% fed gold output and +50% gold storage cap.`;
  }
  if (actionId === "build_granary") {
    const townLabel = supportedTown ? `town at (${supportedTown.x}, ${supportedTown.y})` : "supported town";
    return `Build on this support tile for the ${townLabel}. Grants +20% population growth and +20% gold storage cap.`;
  }
  if (actionId === "build_bank") {
    const townLabel = supportedTown ? `town at (${supportedTown.x}, ${supportedTown.y})` : "supported town";
    return `Build on this support tile for the ${townLabel}. Grants +50% city income and +1 flat income.`;
  }
  if (actionId === "build_airport") return "Build an airport on empty settled land. Bombard enemy tiles within 30 tiles for oil.";
  if (actionId === "build_caravanary") {
    const townLabel = supportedTown ? `town at (${supportedTown.x}, ${supportedTown.y})` : "supported town";
    return `Build on this support tile for the ${townLabel}. Boosts its connected-town income bonus by 25%.`;
  }
  if (actionId === "build_quartermaster") return "Convert heavy gold upkeep into steady supply output on this support tile.";
  if (actionId === "build_ironworks") return "Convert heavy gold upkeep into steady iron output on this support tile.";
  if (actionId === "build_crystal_synthesizer") return "Convert heavy gold upkeep into steady crystal output on this support tile.";
  if (actionId === "build_fuel_plant") return "Convert heavy gold upkeep into steady oil output on this support tile.";
  if (actionId === "build_foundry") return "Industrial hub. Doubles active mine output within 10 tiles.";
  if (actionId === "build_garrison_hall") return "Defensive command center. Boosts settled-tile defense by 20% within 10 tiles.";
  if (actionId === "build_customs_house") return "Build next to a dock. Increases income from that dock by 50%.";
  if (actionId === "build_governors_office") return "Administrative center. Reduces local food upkeep and settled-tile upkeep within 10 tiles.";
  if (actionId === "build_radar_system") return "Air defense grid. Blocks enemy airport bombardment within 30 tiles and reveals the attack origin.";
  return undefined;
};

const tileProductionRequirementLabel = (tile: Tile): string | undefined => {
  if (tile.town) return "gold";
  const strategicKey = strategicResourceKeyForTile(tile);
  if (strategicKey) return prettyToken(strategicKey).toLowerCase();
  const gpm = tile.yieldRate?.goldPerMinute ?? 0;
  if (gpm > 0.01) return "gold";
  return undefined;
};

const constructionProgressForTile = (tile: Tile): TileMenuProgressView | undefined => {
  const nowMs = Date.now();
  if (tile.fort?.status === "under_construction" && typeof tile.fort.completesAt === "number") {
    const remaining = Math.max(0, tile.fort.completesAt - nowMs);
    return {
      title: "Fortification under construction",
      detail: "This tile will gain fortified defense when construction completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, FORT_BUILD_MS))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction"
    };
  }
  if (tile.observatory?.status === "under_construction" && typeof tile.observatory.completesAt === "number") {
    const remaining = Math.max(0, tile.observatory.completesAt - nowMs);
    return {
      title: "Observatory under construction",
      detail: "This tile will extend vision and observatory protection when construction completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, OBSERVATORY_BUILD_MS))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction"
    };
  }
  if (tile.siegeOutpost?.status === "under_construction" && typeof tile.siegeOutpost.completesAt === "number") {
    const remaining = Math.max(0, tile.siegeOutpost.completesAt - nowMs);
    return {
      title: "Siege camp under construction",
      detail: "This tile will gain an offensive staging structure when construction completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, SIEGE_OUTPOST_BUILD_MS))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction"
    };
  }
  if (tile.economicStructure?.status === "under_construction" && typeof tile.economicStructure.completesAt === "number") {
    const remaining = Math.max(0, tile.economicStructure.completesAt - nowMs);
    return {
      title: `${economicStructureName(tile.economicStructure.type)} under construction`,
      detail: "This tile is still being developed and is not fully online yet.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, ECONOMIC_STRUCTURE_BUILD_MS))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction"
    };
  }
  return undefined;
};

const menuOverviewForTile = (tile: Tile): TileOverviewLine[] => {
  const lines: TileOverviewLine[] = [];
  const pushLine = (html: string): void => {
    lines.push({ html });
  };
  const pushEffectLine = (name: string, mod: string, tone: "positive" | "negative" | "neutral"): void => {
    lines.push({
      kind: "effect",
      html: `<span class="tile-overview-effect-name">${name}</span><span class="tile-overview-effect-mod is-${tone}">${mod}</span>`
    });
  };
  if (!tile.ownerId) pushLine("Unclaimed land");
  else if (tile.ownerId !== state.me) pushLine(isTileOwnedByAlly(tile) ? "Allied land" : `${playerNameForOwner(tile.ownerId) ?? "Enemy"} land`);
  if (tile.terrain === "SEA") {
    pushLine(tile.dockId ? "Dock route endpoint." : "Sea tiles only support naval interactions.");
    return lines;
  }
  if (tile.terrain === "MOUNTAIN") {
    pushLine("Mountains block normal land expansion and attacks.");
    return lines;
  }
  const productionLabel = tileProductionRequirementLabel(tile);
  if (!tile.ownerId) {
    pushLine("Claim this tile first to turn it into frontier land.");
    if (productionLabel) pushLine(`After you settle it, this tile can produce ${productionLabel}.`);
    return lines;
  }
  if (tile.ownershipState === "FRONTIER") {
    pushLine("Frontier land is visible control, but it has no real defense yet.");
    if (productionLabel) pushLine(`Needs settlement to produce ${productionLabel}.`);
    else pushLine("Needs settlement to gain defense and full ownership strength.");
  } else if (tile.ownershipState === "SETTLED") {
    pushLine("Settled land is defended and fully part of your empire.");
    if (tile.town) pushLine("Towns produce gold when fed.");
  }
  const supportedTowns = tile.ownerId === state.me && tile.ownershipState === "SETTLED" ? supportedOwnedTownsForTile(tile) : [];
  if (tile.town) {
    pushLine(tile.town.isFed ? `Town is fed and producing ${displayTownGoldPerMinute(tile).toFixed(2)} gold/m.` : "Town is unfed. Needs settled fish or grain nearby.");
    const growthPct =
      tile.town.population > 0 && typeof tile.town.populationGrowthPerMinute === "number"
        ? (tile.town.populationGrowthPerMinute / tile.town.population) * 100
        : 0;
    const growthLabel = `${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(2)}%/m`;
    pushLine(`Support ${tile.town.supportCurrent}/${tile.town.supportMax}`);
    pushLine(`Population ${Math.round(tile.town.population).toLocaleString()} • ${prettyToken(tile.town.populationTier)}`);
    pushLine(`Growth ${growthLabel}`);
    pushLine(`Next size: ${townNextGrowthEtaLabel(tile.town)}.`);
    for (const modifier of tile.town.growthModifiers ?? []) {
      const tone = modifier.deltaPerMinute > 0 ? "positive" : modifier.deltaPerMinute < 0 ? "negative" : "neutral";
      pushEffectLine(modifier.label, growthDeltaPctLabel(tile.town.population, modifier.deltaPerMinute), tone);
    }
    if (tile.town.hasMarket) pushEffectLine("Market", tile.town.marketActive ? "+50% fed gold and +50% cap" : "Built", tile.town.marketActive ? "positive" : "neutral");
    if (tile.town.hasGranary) pushEffectLine("Granary", tile.town.granaryActive ? "+50% gold storage cap" : "Built", tile.town.granaryActive ? "positive" : "neutral");
  } else if (tile.resource) {
    const resourceLabelText = prettyToken(strategicResourceKeyForTile(tile) ?? resourceLabel(tile.resource));
    if (tile.ownershipState === "SETTLED") pushLine(`Resource node can produce ${resourceLabelText.toLowerCase()} once developed and collected.`);
  }
  if (supportedTowns.length === 1) {
    const town = supportedTowns[0];
    if (town) {
      pushLine(`Support tile for nearby town at (${town.x}, ${town.y}).`);
      if (town.town?.hasMarket) pushLine("Nearby town already has a Market.");
      if (town.town?.hasGranary) pushLine("Nearby town already has a Granary.");
      if (!tile.economicStructure) {
        pushLine("Town buildings like markets and granaries must be built on support tiles.");
      }
    }
  } else if (supportedTowns.length > 1) {
    pushLine("This support tile touches multiple towns.");
  }
  if (tile.economicStructure) {
    pushEffectLine(economicStructureName(tile.economicStructure.type), economicStructureBenefitText(tile.economicStructure.type), "positive");
  }
  const storedYield = storedYieldSummary(tile);
  if (storedYield) pushLine(`Stored yield: ${storedYield}`);
  const construction = constructionCountdownLineForTile(tile);
  if (construction) pushLine(construction);
  const historyLines = tileHistoryLines(tile);
  for (const historyLine of historyLines) pushLine(historyLine);
  return lines;
};

const tileMenuViewForTile = (tile: Tile): TileMenuView => {
  const actions = menuActionsForSingleTile(tile);
  const actionTabs = splitTileActionsIntoTabs(actions);
  const settlement = settlementProgressForTile(tile.x, tile.y);
  const construction = constructionProgressForTile(tile);
  const progress =
    settlement
      ? {
          title: "Settlement in progress",
          detail: settlement.awaitingServerConfirm
            ? "Settlement timer finished locally. Waiting for server confirmation."
            : "Settling unlocks defense and activates town and resource production.",
          remainingLabel: settlement.awaitingServerConfirm ? "Syncing..." : formatCountdownClock(Math.max(0, settlement.resolvesAt - Date.now())),
          progress: settlement.awaitingServerConfirm
            ? 1
            : Math.max(0, Math.min(1, (Date.now() - settlement.startAt) / Math.max(1, settlement.resolvesAt - settlement.startAt))),
          note: settlement.awaitingServerConfirm
            ? "Keeping the tile settled client-side until the server responds."
            : "This tile is actively settling."
        }
      : construction;
  const tabs: TileMenuTab[] = [];
  if (progress) tabs.push("progress");
  if (actionTabs.actions.length > 0) tabs.push("actions");
  if (actionTabs.buildings.length > 0) tabs.push("buildings");
  if (actionTabs.crystal.length > 0) tabs.push("crystal");
  tabs.push("overview");
  const ownerLabel =
    tile.terrain === "SEA"
      ? actions.length > 0
        ? "Crossing route"
        : "Open sea"
      : !tile.ownerId
        ? "Unclaimed"
        : tile.ownerId === state.me
          ? tile.ownershipState === "FRONTIER"
            ? "Your frontier"
            : "Your settled land"
          : isTileOwnedByAlly(tile)
            ? "Allied"
            : "Enemy";
  return {
    title: `${terrainLabel(tile.x, tile.y, tile.terrain)} (${tile.x}, ${tile.y})`,
    subtitle: ownerLabel,
    tabs,
    ...(tile.ownershipState === "FRONTIER" ? { overviewKicker: "Frontier" } : tile.ownershipState === "SETTLED" ? { overviewKicker: "Settled" } : {}),
    overviewLines: menuOverviewForTile(tile),
    actions: actionTabs.actions,
    buildings: actionTabs.buildings,
    crystal: actionTabs.crystal,
    ...(progress ? { progress } : {}),
  };
};

const hasRevealCapability = (): boolean => {
  return state.techIds.includes("cryptography") || state.activeRevealTargets.length > 0;
};

const hasDeepStrikeCapability = (): boolean => state.techIds.includes("deep-operations");
const hasBreakthroughCapability = (): boolean => state.techIds.includes("breach-doctrine");

const hasNavalInfiltrationCapability = (): boolean => state.techIds.includes("navigation");

const hasSabotageCapability = (): boolean => state.techIds.includes("cryptography");

const hasTerrainShapingCapability = (): boolean => state.techIds.includes("terrain-engineering");

const hasOwnedLandWithinClientRange = (x: number, y: number, range: number): boolean => {
  for (const tile of state.tiles.values()) {
    if (tile.fogged || tile.ownerId !== state.me || tile.terrain !== "LAND") continue;
    if (chebyshevDistanceClient(tile.x, tile.y, x, y) <= range) return true;
  }
  return false;
};

const crystalTargetingTitle = (ability: CrystalTargetingAbility): string => {
  if (ability === "deep_strike") return "Deep Strike";
  if (ability === "naval_infiltration") return "Naval Infiltration";
  return "Sabotage";
};

const crystalTargetingTone = (ability: CrystalTargetingAbility): "amber" | "cyan" | "red" => {
  if (ability === "deep_strike") return "amber";
  if (ability === "naval_infiltration") return "cyan";
  return "red";
};

const clearCrystalTargeting = (): void => {
  state.crystalTargeting.active = false;
  state.crystalTargeting.validTargets.clear();
  state.crystalTargeting.originByTarget.clear();
};

const lineStepsBetween = (ax: number, ay: number, bx: number, by: number): Array<{ x: number; y: number }> => {
  const dx = bx - ax;
  const dy = by - ay;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps <= 1) return [];
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 1; i < steps; i += 1) {
    out.push({ x: wrapX(Math.round(ax + (dx * i) / steps)), y: wrapY(Math.round(ay + (dy * i) / steps)) });
  }
  return out;
};

const findDeepStrikeOriginForTarget = (target: Tile): Tile | undefined => {
  let best: Tile | undefined;
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me || tile.terrain !== "LAND") continue;
    const dx = Math.min(Math.abs(tile.x - target.x), WORLD_WIDTH - Math.abs(tile.x - target.x));
    const dy = Math.min(Math.abs(tile.y - target.y), WORLD_HEIGHT - Math.abs(tile.y - target.y));
    if (Math.max(dx, dy) < 2 || Math.max(dx, dy) > 2) continue;
    const blocked = lineStepsBetween(tile.x, tile.y, target.x, target.y).some((step) => terrainAt(step.x, step.y) === "MOUNTAIN");
    if (blocked) continue;
    best = tile;
    break;
  }
  return best;
};

const findNavalInfiltrationOriginForTarget = (target: Tile): Tile | undefined => {
  let best: Tile | undefined;
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me || tile.terrain !== "LAND") continue;
    const dx = Math.min(Math.abs(tile.x - target.x), WORLD_WIDTH - Math.abs(tile.x - target.x));
    const dy = Math.min(Math.abs(tile.y - target.y), WORLD_HEIGHT - Math.abs(tile.y - target.y));
    const distance = Math.max(dx, dy);
    if (distance < 2 || distance > 5) continue;
    const steps = lineStepsBetween(tile.x, tile.y, target.x, target.y);
    if (steps.length === 0) continue;
    const seaOnly = steps.every((step) => terrainAt(step.x, step.y) === "SEA");
    if (!seaOnly) continue;
    best = tile;
    break;
  }
  return best;
};

const navalInfiltrationActionsForSeaTile = (tile: Tile): TileActionDef[] => {
  if (tile.terrain !== "SEA" || tile.fogged) return [];
  const out: TileActionDef[] = [];
  const cooldown = abilityCooldownRemainingMs("naval_infiltration");
  for (const candidate of state.tiles.values()) {
    if (candidate.fogged || candidate.terrain !== "LAND") continue;
    if (!candidate.ownerId || candidate.ownerId === state.me || isTileOwnedByAlly(candidate)) continue;
    const origin = findNavalInfiltrationOriginForTarget(candidate);
    if (!origin) continue;
    const steps = lineStepsBetween(origin.x, origin.y, candidate.x, candidate.y);
    if (!steps.some((step) => step.x === tile.x && step.y === tile.y)) continue;
    const targetName = candidate.town
      ? `${prettyToken(candidate.town.type)} Town`
      : candidate.resource
        ? prettyToken(resourceLabel(candidate.resource))
        : `${terrainLabel(candidate.x, candidate.y, candidate.terrain)} Tile`;
    const observatoryProtection = hostileObservatoryProtectingTile(candidate);
    out.push({
      id: "naval_infiltration",
      label: `Naval Infiltration · ${targetName}`,
      targetKey: key(candidate.x, candidate.y),
      originKey: key(origin.x, origin.y),
      ...tileActionAvailability(
        hasNavalInfiltrationCapability() && !observatoryProtection && cooldown <= 0 && (state.strategicResources.CRYSTAL ?? 0) >= 30,
        !hasNavalInfiltrationCapability()
          ? "Requires Navigation"
          : observatoryProtection
            ? "Blocked by observatory field"
          : cooldown > 0
            ? `Cooldown ${formatCooldownShort(cooldown)}`
            : "Need 30 CRYSTAL",
        `Land at ${candidate.x}, ${candidate.y} • 30 CRYSTAL`
      )
    });
  }
  return out.slice(0, 6);
};

const computeCrystalTargets = (
  ability: CrystalTargetingAbility
): { validTargets: Set<string>; originByTarget: Map<string, string> } => {
  const validTargets = new Set<string>();
  const originByTarget = new Map<string, string>();
  for (const tile of state.tiles.values()) {
    if (tile.fogged || tile.terrain !== "LAND") continue;
    if (!tile.ownerId || tile.ownerId === state.me || isTileOwnedByAlly(tile)) continue;
    if (hostileObservatoryProtectingTile(tile)) continue;
    if (ability === "deep_strike") {
      const origin = findDeepStrikeOriginForTarget(tile);
      if (!origin) continue;
      validTargets.add(key(tile.x, tile.y));
      originByTarget.set(key(tile.x, tile.y), key(origin.x, origin.y));
      continue;
    }
    if (ability === "naval_infiltration") {
      const origin = findNavalInfiltrationOriginForTarget(tile);
      if (!origin) continue;
      validTargets.add(key(tile.x, tile.y));
      originByTarget.set(key(tile.x, tile.y), key(origin.x, origin.y));
      continue;
    }
    if ((tile.resource || tile.town) && !tile.sabotage) validTargets.add(key(tile.x, tile.y));
  }
  return { validTargets, originByTarget };
};

const beginCrystalTargeting = (ability: CrystalTargetingAbility): void => {
  if (ability === "deep_strike") {
    const cooldown = abilityCooldownRemainingMs("deep_strike");
    if (!hasDeepStrikeCapability()) {
      pushFeed("Deep Strike requires Deep Operations.", "combat", "warn");
      return;
    }
    if ((state.strategicResources.CRYSTAL ?? 0) < 25) {
      pushFeed("Deep Strike needs 25 CRYSTAL.", "combat", "warn");
      return;
    }
    if (cooldown > 0) {
      pushFeed(`Deep Strike cooling down for ${formatCooldownShort(cooldown)}.`, "combat", "warn");
      return;
    }
  }
  if (ability === "naval_infiltration") {
    const cooldown = abilityCooldownRemainingMs("naval_infiltration");
    if (!hasNavalInfiltrationCapability()) {
      pushFeed("Naval Infiltration requires Navigation.", "combat", "warn");
      return;
    }
    if ((state.strategicResources.CRYSTAL ?? 0) < 30) {
      pushFeed("Naval Infiltration needs 30 CRYSTAL.", "combat", "warn");
      return;
    }
    if (cooldown > 0) {
      pushFeed(`Naval Infiltration cooling down for ${formatCooldownShort(cooldown)}.`, "combat", "warn");
      return;
    }
  }
  if (ability === "sabotage") {
    const cooldown = abilityCooldownRemainingMs("sabotage");
    if (!hasSabotageCapability()) {
      pushFeed("Sabotage requires Cryptography.", "combat", "warn");
      return;
    }
    if ((state.strategicResources.CRYSTAL ?? 0) < 20) {
      pushFeed("Sabotage needs 20 CRYSTAL.", "combat", "warn");
      return;
    }
    if (cooldown > 0) {
      pushFeed(`Sabotage cooling down for ${formatCooldownShort(cooldown)}.`, "combat", "warn");
      return;
    }
  }

  const { validTargets, originByTarget } = computeCrystalTargets(ability);
  if (validTargets.size === 0) {
    const title = crystalTargetingTitle(ability);
    pushFeed(`${title} has no valid targets in view.`, "combat", "warn");
    return;
  }
  state.crystalTargeting.active = true;
  state.crystalTargeting.ability = ability;
  state.crystalTargeting.validTargets = validTargets;
  state.crystalTargeting.originByTarget = originByTarget;
  hideTileActionMenu();
  hideHoldBuildMenu();
  const current = selectedTile();
  if (!current || !validTargets.has(key(current.x, current.y))) {
    const first = [...validTargets][0];
    if (first) state.selected = parseKey(first);
  }
  pushFeed(`${crystalTargetingTitle(ability)} armed. Tap a highlighted target tile.`, "combat", "info");
  renderHud();
};

const executeCrystalTargeting = (tile: Tile): boolean => {
  const targetKey = key(tile.x, tile.y);
  if (!state.crystalTargeting.active || !state.crystalTargeting.validTargets.has(targetKey)) return false;
  if (hostileObservatoryProtectingTile(tile)) {
    pushFeed("Blocked by observatory field.", "combat", "warn");
    return false;
  }
  if (!requireAuthedSession()) return false;
  const ability = state.crystalTargeting.ability;
  if (ability === "deep_strike") {
    const originKey = state.crystalTargeting.originByTarget.get(targetKey);
    if (!originKey) return false;
    const origin = parseKey(originKey);
    ws.send(JSON.stringify({ type: "DEEP_STRIKE_ATTACK", fromX: origin.x, fromY: origin.y, toX: tile.x, toY: tile.y }));
  } else if (ability === "naval_infiltration") {
    const originKey = state.crystalTargeting.originByTarget.get(targetKey);
    if (!originKey) return false;
    const origin = parseKey(originKey);
    ws.send(JSON.stringify({ type: "NAVAL_INFILTRATION_ATTACK", fromX: origin.x, fromY: origin.y, toX: tile.x, toY: tile.y }));
  } else {
    ws.send(JSON.stringify({ type: "SABOTAGE_TILE", x: tile.x, y: tile.y }));
  }
  clearCrystalTargeting();
  hideTileActionMenu();
  return true;
};

const tileActionAvailability = (
  enabled: boolean,
  reason: string,
  cost?: string
): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> => {
  if (enabled) return cost ? { disabled: false, cost } : { disabled: false };
  return { disabled: true, disabledReason: reason, cost: reason };
};

const tileActionAvailabilityWithDevelopmentSlot = (
  enabledWithoutSlot: boolean,
  baseReason: string,
  cost?: string,
  summary = developmentSlotSummary()
): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> => {
  if (summary.available <= 0) return tileActionAvailability(false, developmentSlotReason(summary), cost);
  return tileActionAvailability(enabledWithoutSlot, baseReason, cost);
};

const isOwnedBorderTile = (x: number, y: number): boolean => {
  const neighbors = [
    state.tiles.get(key(wrapX(x), wrapY(y - 1))),
    state.tiles.get(key(wrapX(x + 1), wrapY(y))),
    state.tiles.get(key(wrapX(x), wrapY(y + 1))),
    state.tiles.get(key(wrapX(x - 1), wrapY(y)))
  ];
  return neighbors.some((tile) => !tile || tile.ownerId !== state.me);
};

const menuActionsForSingleTile = (tile: Tile): TileActionDef[] => {
  if (tile.fogged) return [];
  if (tile.terrain === "SEA") return navalInfiltrationActionsForSeaTile(tile);
  if (tile.terrain === "MOUNTAIN") {
    const removeCooldown = abilityCooldownRemainingMs("remove_mountain");
    const observatoryProtection = hostileObservatoryProtectingTile(tile);
    return [
      {
        id: "remove_mountain",
        label: "Remove Mountain",
        ...tileActionAvailability(
          hasTerrainShapingCapability() &&
            !observatoryProtection &&
            hasOwnedLandWithinClientRange(tile.x, tile.y, 2) &&
            removeCooldown <= 0 &&
            state.gold >= 8000 &&
            (state.strategicResources.CRYSTAL ?? 0) >= 400,
          !hasTerrainShapingCapability()
            ? "Requires Terrain Engineering"
            : observatoryProtection
              ? "Blocked by observatory field"
              : !hasOwnedLandWithinClientRange(tile.x, tile.y, 2)
                ? "Must be within 2 tiles of your land"
                : removeCooldown > 0
                  ? `Cooldown ${formatCooldownShort(removeCooldown)}`
                  : state.gold < 8000
                    ? "Need 8000 gold"
                    : "Need 400 CRYSTAL",
          "8000 gold + 400 CRYSTAL"
        )
      }
    ];
  }
  if (tile.terrain !== "LAND") return [];
  const createMountainAction = (): TileActionDef => {
    const createCooldown = abilityCooldownRemainingMs("create_mountain");
    const observatoryProtection = hostileObservatoryProtectingTile(tile);
    const hasRange = hasOwnedLandWithinClientRange(tile.x, tile.y, 2);
    const blockedBySite = Boolean(tile.town || tile.dockId || tile.fort || tile.siegeOutpost || tile.observatory || tile.economicStructure);
    return {
      id: "create_mountain",
      label: "Create Mountain",
      ...tileActionAvailability(
        hasTerrainShapingCapability() &&
          !observatoryProtection &&
          hasRange &&
          !blockedBySite &&
          createCooldown <= 0 &&
          state.gold >= 8000 &&
          (state.strategicResources.CRYSTAL ?? 0) >= 400,
        !hasTerrainShapingCapability()
          ? "Requires Terrain Engineering"
          : observatoryProtection
            ? "Blocked by observatory field"
            : !hasRange
              ? "Must be within 2 tiles of your land"
              : blockedBySite
                ? "Town, dock, or structure blocks terrain shaping"
                : createCooldown > 0
                  ? `Cooldown ${formatCooldownShort(createCooldown)}`
                  : state.gold < 8000
                    ? "Need 8000 gold"
                    : "Need 400 CRYSTAL",
        "8000 gold + 400 CRYSTAL"
      )
    };
  };
  if (!tile.ownerId) {
    const reachable = Boolean(pickOriginForTarget(tile.x, tile.y, false));
    const hasGold = state.gold >= FRONTIER_CLAIM_COST;
    const frontierCostLabel = frontierClaimCostLabelForTile(tile.x, tile.y);
    const out: TileActionDef[] = [
      {
        id: "settle_land",
        label: "Settle Land",
        ...tileActionAvailability(
          reachable && hasGold,
          !reachable ? "Must touch your territory" : `Need ${FRONTIER_CLAIM_COST} gold`,
          frontierCostLabel
        )
      }
    ];
    out.push({
      id: "build_foundry",
      label: "Build Foundry",
      detail: buildDetailTextForAction("build_foundry", tile),
      ...tileActionAvailabilityWithDevelopmentSlot(
        reachable && state.techIds.includes("industrial-extraction") && state.gold >= 4500 && !tile.resource && !tile.town && !tile.dockId,
        !reachable
          ? "Must touch your territory"
          : !state.techIds.includes("industrial-extraction")
            ? "Requires Industrial Extraction"
            : tile.resource || tile.town || tile.dockId
              ? "Needs empty land"
              : "Need 4500 gold",
        `4500 gold • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m • doubles mines within 10 tiles`,
        developmentSlotSummary()
      )
    });
    out.push(createMountainAction());
    return out;
  }
  if (tile.ownerId === state.me) {
    const slots = developmentSlotSummary();
    const out: TileActionDef[] = [];
    const y = (tile as Tile & { yield?: { gold?: number; strategic?: Record<string, number> } }).yield;
    const hasYield =
      Boolean(y && ((y.gold ?? 0) > 0.01 || Object.values(y.strategic ?? {}).some((v) => Number(v) > 0.01)));
    const hasBlockingStructure = Boolean(tile.fort || tile.siegeOutpost || tile.observatory || tile.economicStructure);
    const supportedTowns = tile.ownershipState === "SETTLED" ? supportedOwnedTownsForTile(tile) : [];
    const supportedTown = supportedTowns.length === 1 ? supportedTowns[0] : undefined;
    const supportedDocks = tile.ownershipState === "SETTLED" ? supportedOwnedDocksForTile(tile) : [];
    const supportedDock = supportedDocks.length === 1 ? supportedDocks[0] : undefined;
    if (tile.ownershipState === "SETTLED" && hasYield) out.push({ id: "collect_yield", label: "Collect Yield" });
    if (tile.ownershipState === "FRONTIER")
      out.push({
        id: "settle_land",
        label: "Settle Land",
        detail: buildDetailTextForAction("settle_land", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          canAffordCost(state.gold, SETTLE_COST),
          `Need ${SETTLE_COST} gold`,
          `${SETTLE_COST} gold • ${Math.round(settleDurationMsForTile(tile.x, tile.y) / 1000)}s${isForestTile(tile.x, tile.y) ? " (Forest)" : ""}`,
          slots
        )
      });
    if (tile.ownershipState === "SETTLED" && !tile.fort) {
      const isBorderOrDock = Boolean(tile.dockId || isOwnedBorderTile(tile.x, tile.y));
      const hasTech = state.techIds.includes("masonry");
      const fortGoldCost = structureGoldCost("FORT");
      const hasGold = state.gold >= fortGoldCost;
      const hasIron = (state.strategicResources.IRON ?? 0) >= 45;
      out.push({
        id: "build_fortification",
        label: "Build Fortification",
        detail: buildDetailTextForAction("build_fortification", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          hasTech && hasGold && hasIron && isBorderOrDock && !tile.siegeOutpost && !tile.observatory && !tile.economicStructure,
          !hasTech ? "Requires Masonry" : !isBorderOrDock ? "Needs border or dock tile" : tile.siegeOutpost || tile.observatory || tile.economicStructure ? "Tile already has structure" : !hasGold ? `Need ${fortGoldCost} gold` : !hasIron ? "Need 45 IRON" : "Unavailable",
          `${structureCostText("FORT")} • ${Math.round(FORT_BUILD_MS / 60000)}m`,
          slots
        )
      });
    }
    if (tile.ownershipState === "SETTLED" && !tile.observatory) {
      const hasTech = state.techIds.includes("cartography");
      const observatoryGoldCost = structureGoldCost("OBSERVATORY");
      const hasGold = state.gold >= observatoryGoldCost;
      const hasCrystal = (state.strategicResources.CRYSTAL ?? 0) >= 45;
      out.push({
        id: "build_observatory",
        label: "Build Observatory",
        detail: buildDetailTextForAction("build_observatory", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          hasTech && hasGold && hasCrystal && !tile.resource && !tile.town && !tile.dockId && !tile.fort && !tile.siegeOutpost && !tile.economicStructure,
          !hasTech
            ? "Requires Cartography"
            : tile.resource || tile.town || tile.dockId
              ? "Needs empty settled land"
              : tile.fort || tile.siegeOutpost || tile.economicStructure
                ? "Tile already has structure"
                : !hasGold
                  ? `Need ${observatoryGoldCost} gold`
                  : !hasCrystal
                    ? "Need 45 CRYSTAL"
                    : "Unavailable",
          `${structureCostText("OBSERVATORY")} • ${Math.round(OBSERVATORY_BUILD_MS / 60000)}m`,
          slots
        )
      });
    }
    if (tile.ownershipState === "SETTLED" && !tile.economicStructure) {
      const airportGoldCost = structureGoldCost("AIRPORT");
      out.push({
        id: "build_airport",
        label: "Build Airport",
        detail: buildDetailTextForAction("build_airport", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.techIds.includes("aeronautics") &&
            state.gold >= airportGoldCost &&
            (state.strategicResources.CRYSTAL ?? 0) >= 80 &&
            !tile.resource &&
            !tile.town &&
            !tile.dockId &&
            !tile.fort &&
            !tile.siegeOutpost &&
            !tile.observatory,
          !state.techIds.includes("aeronautics")
            ? "Requires Aeronautics"
            : tile.resource || tile.town || tile.dockId
              ? "Needs empty settled land"
              : tile.fort || tile.siegeOutpost || tile.observatory
                ? "Tile already has structure"
                : state.gold < airportGoldCost
                  ? `Need ${airportGoldCost} gold`
                  : "Need 80 CRYSTAL",
          `${structureCostText("AIRPORT")} • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m`,
          slots
        )
      });
      out.push({
        id: "build_radar_system",
        label: "Build Radar System",
        detail: buildDetailTextForAction("build_radar_system", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.techIds.includes("radar") &&
            state.gold >= 4000 &&
            (state.strategicResources.CRYSTAL ?? 0) >= 120 &&
            !tile.resource &&
            !tile.town &&
            !tile.dockId &&
            !tile.fort &&
            !tile.siegeOutpost &&
            !tile.observatory,
          !state.techIds.includes("radar")
            ? "Requires Radar"
            : tile.resource || tile.town || tile.dockId
              ? "Needs empty settled land"
              : tile.fort || tile.siegeOutpost || tile.observatory
                ? "Tile already has structure"
                : state.gold < 4000
                  ? "Need 4000 gold"
                  : "Need 120 CRYSTAL",
          `${structureCostText("RADAR_SYSTEM")} • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m • blocks bombardment within 30 tiles`,
          slots
        )
      });
      out.push({
        id: "build_governors_office",
        label: "Build Governor's Office",
        detail: buildDetailTextForAction("build_governors_office", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.techIds.includes("civil-service") &&
            state.gold >= 2600 &&
            !tile.resource &&
            !tile.town &&
            !tile.dockId &&
            !tile.fort &&
            !tile.siegeOutpost &&
            !tile.observatory,
          !state.techIds.includes("civil-service")
            ? "Requires Civil Service"
            : tile.resource || tile.town || tile.dockId
              ? "Needs empty settled land"
              : tile.fort || tile.siegeOutpost || tile.observatory
                ? "Tile already has structure"
                : "Need 2600 gold",
          `${structureCostText("GOVERNORS_OFFICE")} • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m • reduces local upkeep`,
          slots
        )
      });
      out.push({
        id: "build_foundry",
        label: "Build Foundry",
        detail: buildDetailTextForAction("build_foundry", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.techIds.includes("industrial-extraction") &&
            state.gold >= 4500 &&
            !tile.resource &&
            !tile.town &&
            !tile.dockId &&
            !tile.fort &&
            !tile.siegeOutpost &&
            !tile.observatory,
          !state.techIds.includes("industrial-extraction")
            ? "Requires Industrial Extraction"
            : tile.resource || tile.town || tile.dockId
              ? "Needs empty settled land"
              : tile.fort || tile.siegeOutpost || tile.observatory
                ? "Tile already has structure"
                : "Need 4500 gold",
          `${structureCostText("FOUNDRY")} • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m • doubles mines within 10 tiles`,
          slots
        )
      });
      out.push({
        id: "build_garrison_hall",
        label: "Build Garrison Hall",
        detail: buildDetailTextForAction("build_garrison_hall", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.techIds.includes("standing-army") &&
            state.gold >= 2200 &&
            (state.strategicResources.CRYSTAL ?? 0) >= 80 &&
            !tile.resource &&
            !tile.town &&
            !tile.dockId &&
            !tile.fort &&
            !tile.siegeOutpost &&
            !tile.observatory,
          !state.techIds.includes("standing-army")
            ? "Requires Standing Army"
            : tile.resource || tile.town || tile.dockId
              ? "Needs empty settled land"
              : tile.fort || tile.siegeOutpost || tile.observatory
                ? "Tile already has structure"
                : state.gold < 2200
                  ? "Need 2200 gold"
                  : "Need 80 CRYSTAL",
          `${structureCostText("GARRISON_HALL")} • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m • +20% defense within 10 tiles • 25 gold / 10m`,
          slots
        )
      });
    }
    if (tile.ownershipState === "SETTLED" && !tile.siegeOutpost) {
      const hasTech = state.techIds.includes("leatherworking");
      const siegeGoldCost = structureGoldCost("SIEGE_OUTPOST");
      const hasGold = state.gold >= siegeGoldCost;
      const hasSupply = (state.strategicResources.SUPPLY ?? 0) >= 45;
      const onBorder = isOwnedBorderTile(tile.x, tile.y);
      out.push({
        id: "build_siege_camp",
        label: "Build Siege Camp",
        detail: buildDetailTextForAction("build_siege_camp", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          hasTech && hasGold && hasSupply && onBorder && !tile.fort && !tile.observatory && !tile.economicStructure,
          !hasTech ? "Requires Leatherworking" : !onBorder ? "Needs border tile" : tile.fort || tile.observatory || tile.economicStructure ? "Tile already has structure" : !hasGold ? `Need ${siegeGoldCost} gold` : !hasSupply ? "Need 45 SUPPLY" : "Unavailable",
          `${structureCostText("SIEGE_OUTPOST")} • ${Math.round(SIEGE_OUTPOST_BUILD_MS / 60000)}m`,
          slots
        )
      });
    }
    if (tile.ownershipState === "SETTLED") {
      if (tile.resource === "FARM" || tile.resource === "FISH") {
        out.push({
          id: "build_farmstead",
          label: "Build Farmstead",
          detail: buildDetailTextForAction("build_farmstead", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && state.techIds.includes("agriculture") && state.gold >= 700 && (state.strategicResources.FOOD ?? 0) >= 20,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("agriculture") ? "Requires Agriculture" : state.gold < 700 ? "Need 700 gold" : "Need 20 FOOD",
            `700 gold + 20 FOOD • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m`,
            slots
          )
        });
      }
      if (tile.resource === "WOOD" || tile.resource === "FUR") {
        out.push({
          id: "build_camp",
          label: "Build Camp",
          detail: buildDetailTextForAction("build_camp", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && state.techIds.includes("leatherworking") && state.gold >= 800 && (state.strategicResources.SUPPLY ?? 0) >= 30,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("leatherworking") ? "Requires Leatherworking" : state.gold < 800 ? "Need 800 gold" : "Need 30 SUPPLY",
            `800 gold + 30 SUPPLY • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m`,
            slots
          )
        });
      }
      if (tile.resource === "IRON" || tile.resource === "GEMS") {
        const matchingNeed = tile.resource === "IRON" ? "IRON" : "CRYSTAL";
        out.push({
          id: "build_mine",
          label: "Build Mine",
          detail: buildDetailTextForAction("build_mine", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && state.techIds.includes("mining") && state.gold >= 800 && (state.strategicResources[matchingNeed] ?? 0) >= 30,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("mining") ? "Requires Mining" : state.gold < 800 ? "Need 800 gold" : `Need 30 ${matchingNeed}`,
            `800 gold + 30 ${matchingNeed} • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m`,
            slots
          )
        });
      }
      if (supportedTown) {
        out.push({
          id: "build_market",
          label: "Build Market",
          detail: buildDetailTextForAction("build_market", tile, supportedTown),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && !supportedTown.town?.hasMarket && state.techIds.includes("trade") && state.gold >= 1200 && (state.strategicResources.CRYSTAL ?? 0) >= 40,
            hasBlockingStructure
              ? "Tile already has structure"
              : supportedTown.town?.hasMarket
                ? "Nearby town already has Market"
                : !state.techIds.includes("trade")
                  ? "Requires Trade"
                  : state.gold < 1200
                    ? "Need 1200 gold"
                    : "Need 40 CRYSTAL",
            `1200 gold + 40 CRYSTAL • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m`,
            slots
          )
        });
        out.push({
          id: "build_granary",
          label: "Build Granary",
          detail: buildDetailTextForAction("build_granary", tile, supportedTown),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && !supportedTown.town?.hasGranary && state.techIds.includes("pottery") && state.gold >= 700 && (state.strategicResources.FOOD ?? 0) >= 40,
            hasBlockingStructure
              ? "Tile already has structure"
              : supportedTown.town?.hasGranary
                ? "Nearby town already has Granary"
                : !state.techIds.includes("pottery")
                  ? "Requires Pottery"
                  : state.gold < 700
                    ? "Need 700 gold"
                    : "Need 40 FOOD",
            `700 gold + 40 FOOD • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m`,
            slots
          )
        });
        out.push({
          id: "build_bank",
          label: "Build Bank",
          detail: buildDetailTextForAction("build_bank", tile, supportedTown),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && !supportedTown.town?.hasBank && state.techIds.includes("coinage") && state.gold >= 1600 && (state.strategicResources.CRYSTAL ?? 0) >= 60,
            hasBlockingStructure
              ? "Tile already has structure"
              : supportedTown.town?.hasBank
                ? "Nearby town already has Bank"
                : !state.techIds.includes("coinage")
                  ? "Requires Coinage"
                  : state.gold < 1600
                    ? "Need 1600 gold"
                    : "Need 60 CRYSTAL",
            `1600 gold + 60 CRYSTAL • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m`,
            slots
          )
        });
        out.push({
          id: "build_caravanary",
          label: "Build Caravanary",
          detail: buildDetailTextForAction("build_caravanary", tile, supportedTown),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && state.techIds.includes("ledger-keeping") && state.gold >= 1800 && (state.strategicResources.CRYSTAL ?? 0) >= 60,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("ledger-keeping") ? "Requires Ledger Keeping" : state.gold < 1800 ? "Need 1800 gold" : "Need 60 CRYSTAL",
            `1800 gold + 60 CRYSTAL • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m • +25% connected-town bonus • 15 gold / 10m`,
            slots
          )
        });
        out.push({
          id: "build_quartermaster",
          label: "Build Quartermaster",
          detail: buildDetailTextForAction("build_quartermaster", tile, supportedTown),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && state.techIds.includes("workshops") && state.gold >= 2200,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("workshops") ? "Requires Workshops" : "Need 2200 gold",
            `2200 gold • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m • 18 SUPPLY/day • 120 gold / 10m`,
            slots
          )
        });
        out.push({
          id: "build_ironworks",
          label: "Build Ironworks",
          detail: buildDetailTextForAction("build_ironworks", tile, supportedTown),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && state.techIds.includes("workshops") && state.gold >= 2400,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("workshops") ? "Requires Workshops" : "Need 2400 gold",
            `2400 gold • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m • 18 IRON/day • 120 gold / 10m`,
            slots
          )
        });
        out.push({
          id: "build_crystal_synthesizer",
          label: "Build Crystal Synthesizer",
          detail: buildDetailTextForAction("build_crystal_synthesizer", tile, supportedTown),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && state.techIds.includes("workshops") && state.gold >= 2800,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("workshops") ? "Requires Workshops" : "Need 2800 gold",
            `2800 gold • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m • 12 CRYSTAL/day • 160 gold / 10m`,
            slots
          )
        });
        out.push({
          id: "build_fuel_plant",
          label: "Build Fuel Plant",
          detail: buildDetailTextForAction("build_fuel_plant", tile, supportedTown),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && state.techIds.includes("plastics") && state.gold >= 3200,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("plastics") ? "Requires Plastics" : "Need 3200 gold",
            `3200 gold • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m • 10 OIL/day • 180 gold / 10m`,
            slots
          )
        });
      } else if (supportedTowns.length > 1) {
        out.push({
          id: "build_market",
          label: "Build Market",
          disabled: true,
          disabledReason: "Support tile touches multiple towns"
        });
        out.push({
          id: "build_granary",
          label: "Build Granary",
          disabled: true,
          disabledReason: "Support tile touches multiple towns"
        });
        out.push({ id: "build_bank", label: "Build Bank", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_caravanary", label: "Build Caravanary", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_quartermaster", label: "Build Quartermaster", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_ironworks", label: "Build Ironworks", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_crystal_synthesizer", label: "Build Crystal Synthesizer", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_fuel_plant", label: "Build Fuel Plant", disabled: true, disabledReason: "Support tile touches multiple towns" });
      }
      if (supportedDock) {
        out.push({
          id: "build_customs_house",
          label: "Build Customs House",
          detail: buildDetailTextForAction("build_customs_house", tile, supportedDock),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && state.techIds.includes("global-trade-networks") && state.gold >= 1800 && (state.strategicResources.CRYSTAL ?? 0) >= 60,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("global-trade-networks") ? "Requires Global Trade Networks" : state.gold < 1800 ? "Need 1800 gold" : "Need 60 CRYSTAL",
            `1800 gold + 60 CRYSTAL • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m • +50% dock income • 15 gold / 10m`,
            slots
          )
        });
      } else if (supportedDocks.length > 1) {
        out.push({ id: "build_customs_house", label: "Build Customs House", disabled: true, disabledReason: "Tile touches multiple docks" });
      }
    }
    out.push(createMountainAction());
    out.push({ id: "abandon_territory", label: "Abandon Territory" });
    return out;
  }
  if (isTileOwnedByAlly(tile)) return [];
  if (tile.ownerId === "barbarian") {
    const previewDetail = attackPreviewDetailForTarget(tile);
    const breachPreviewDetail = attackPreviewDetailForTarget(tile, "breakthrough");
    const reachable = Boolean(pickOriginForTarget(tile.x, tile.y, false)) || Boolean(tile.dockId);
    return [
      {
        id: "launch_attack",
        label: "Launch Attack",
        ...(previewDetail ? { detail: previewDetail } : {}),
        ...tileActionAvailability(
          reachable && state.gold >= FRONTIER_CLAIM_COST,
          !reachable ? "No bordering origin tile or linked dock" : `Need ${FRONTIER_CLAIM_COST} gold`,
          `${FRONTIER_CLAIM_COST} gold`
        )
      },
      {
        id: "launch_breach_attack",
        label: "Launch Breach Attack",
        ...(breachPreviewDetail ? { detail: breachPreviewDetail } : {}),
        ...tileActionAvailability(
          (Boolean(pickOriginForTarget(tile.x, tile.y)) || Boolean(tile.dockId)) && hasBreakthroughCapability() && state.gold >= 2 && (state.strategicResources.IRON ?? 0) >= 1,
          !(Boolean(pickOriginForTarget(tile.x, tile.y)) || Boolean(tile.dockId))
            ? "No bordering origin tile or linked dock"
            : !hasBreakthroughCapability()
              ? "Requires Breach Doctrine"
              : state.gold < 2
                ? "Need 2 gold"
                : "Need 1 IRON",
          "2 gold + 1 IRON"
        )
      },
      createMountainAction()
    ];
  }
  const reachable = Boolean(pickOriginForTarget(tile.x, tile.y, false)) || Boolean(tile.dockId);
  const out: TileActionDef[] = [
    {
      id: "launch_attack",
      label: "Launch Attack",
      ...(attackPreviewDetailForTarget(tile) ? { detail: attackPreviewDetailForTarget(tile) } : {}),
      ...tileActionAvailability(
        reachable && state.gold >= FRONTIER_CLAIM_COST,
        !reachable ? "No bordering origin tile or linked dock" : `Need ${FRONTIER_CLAIM_COST} gold`,
        `${FRONTIER_CLAIM_COST} gold`
      )
    },
    {
      id: "launch_breach_attack",
      label: "Launch Breach Attack",
      ...(attackPreviewDetailForTarget(tile, "breakthrough") ? { detail: attackPreviewDetailForTarget(tile, "breakthrough") } : {}),
      ...tileActionAvailability(
        reachable && hasBreakthroughCapability() && state.gold >= 2 && (state.strategicResources.IRON ?? 0) >= 1,
        !reachable ? "No bordering origin tile or linked dock" : !hasBreakthroughCapability() ? "Requires Breach Doctrine" : state.gold < 2 ? "Need 2 gold" : "Need 1 IRON",
        "2 gold + 1 IRON"
      )
    }
  ];
  const deepStrikeCooldown = abilityCooldownRemainingMs("deep_strike");
  const deepStrikeOrigin = findDeepStrikeOriginForTarget(tile);
  const observatoryProtection = hostileObservatoryProtectingTile(tile);
  out.push({
    id: "deep_strike",
    label: "Deep Strike",
    ...tileActionAvailability(
      hasDeepStrikeCapability() && !observatoryProtection && Boolean(deepStrikeOrigin) && deepStrikeCooldown <= 0 && (state.strategicResources.CRYSTAL ?? 0) >= 25,
      !hasDeepStrikeCapability()
        ? "Requires Deep Operations"
        : observatoryProtection
          ? "Blocked by observatory field"
        : !deepStrikeOrigin
          ? "Need valid 2-tile origin"
          : deepStrikeCooldown > 0
            ? `Cooldown ${formatCooldownShort(deepStrikeCooldown)}`
            : "Need 25 CRYSTAL",
      "25 CRYSTAL • -10% ATK"
    )
  });
  const navalCooldown = abilityCooldownRemainingMs("naval_infiltration");
  const navalOrigin = findNavalInfiltrationOriginForTarget(tile);
  out.push({
    id: "naval_infiltration",
    label: "Naval Infiltration",
    ...tileActionAvailability(
      hasNavalInfiltrationCapability() && !observatoryProtection && Boolean(navalOrigin) && navalCooldown <= 0 && (state.strategicResources.CRYSTAL ?? 0) >= 30,
      !hasNavalInfiltrationCapability()
        ? "Requires Navigation"
        : observatoryProtection
          ? "Blocked by observatory field"
        : !navalOrigin
          ? "Need water crossing origin"
          : navalCooldown > 0
            ? `Cooldown ${formatCooldownShort(navalCooldown)}`
            : "Need 30 CRYSTAL",
      "30 CRYSTAL • -15% ATK"
    )
  });
  if (tile.ownerId && tile.ownerId !== state.me && tile.ownerId !== "barbarian") {
    const revealCost = 20;
    const revealActive = state.activeRevealTargets.includes(tile.ownerId);
    const hasCapability = hasRevealCapability();
    const hasCapacity = state.revealCapacity > 0 && state.activeRevealTargets.length < 1;
    const hasCrystal = (state.strategicResources.CRYSTAL ?? 0) >= revealCost;
    out.push({
      id: "reveal_empire",
      label: revealActive ? "Cancel Reveal Empire" : "Reveal Empire",
      ...tileActionAvailability(
        revealActive || (hasCapability && hasCapacity && hasCrystal),
        revealActive ? "Stop revealing this empire" : !hasCapability ? "Requires Cryptography" : !hasCapacity ? "Reveal capacity full" : "Need crystal",
        revealActive ? "Cancel current reveal" : "20 CRYSTAL • 0.15 / 10m"
      )
    });
    const sabotageCooldown = abilityCooldownRemainingMs("sabotage");
    out.push({
      id: "sabotage_tile",
      label: "Sabotage",
      ...tileActionAvailability(
        hasSabotageCapability() &&
          !observatoryProtection &&
          sabotageCooldown <= 0 &&
          (state.strategicResources.CRYSTAL ?? 0) >= 20 &&
          Boolean(tile.resource || tile.town) &&
          !tile.sabotage,
        !hasSabotageCapability()
          ? "Requires Cryptography"
          : observatoryProtection
            ? "Blocked by observatory field"
          : tile.sabotage
            ? "Already sabotaged"
            : !(tile.resource || tile.town)
              ? "Town or resource only"
              : sabotageCooldown > 0
                ? `Cooldown ${formatCooldownShort(sabotageCooldown)}`
                : "Need 20 CRYSTAL",
        "20 CRYSTAL • -50% for 45m"
      )
    });
  }
  out.push(createMountainAction());
  return out;
};

const renderTileActionMenu = (view: TileMenuView, clientX: number, clientY: number): void => {
  const activeTab = view.tabs.includes(state.tileActionMenu.activeTab) ? state.tileActionMenu.activeTab : (view.tabs[0] ?? "overview");
  state.tileActionMenu.activeTab = activeTab;
  tileActionMenuEl.innerHTML = tileActionMenuHtml(view, activeTab, isMobile());
  const { width: vw, height: vh } = viewportSize();
  const menuW = Math.min(348, vw - 16);
  tileActionMenuEl.style.width = `${menuW}px`;
  tileActionMenuEl.style.display = "block";
  const renderedHeight = Math.min(tileActionMenuEl.offsetHeight || 360, vh - 90);
  const left = Math.max(8, Math.min(vw - menuW - 8, clientX + 10));
  const top = Math.max(78, Math.min(vh - renderedHeight - 8, clientY + 8));
  tileActionMenuEl.style.left = `${left}px`;
  tileActionMenuEl.style.top = `${top}px`;
  state.tileActionMenu.visible = true;
  state.tileActionMenu.x = clientX;
  state.tileActionMenu.y = clientY;
  const closeBtn = tileActionMenuEl.querySelector<HTMLButtonElement>("#tile-action-close");
  if (closeBtn) closeBtn.onclick = () => hideTileActionMenu();
  const tabButtons = tileActionMenuEl.querySelectorAll<HTMLButtonElement>("button[data-tile-tab]");
  tabButtons.forEach((btn) => {
    btn.onclick = () => {
      const nextTab = btn.dataset.tileTab as TileMenuTab | undefined;
      if (!nextTab) return;
      state.tileActionMenu.activeTab = nextTab;
      if (state.tileActionMenu.mode === "single" && state.tileActionMenu.currentTileKey) {
        const tile = state.tiles.get(state.tileActionMenu.currentTileKey);
        if (tile) renderTileActionMenu(tileMenuViewForTile(tile), state.tileActionMenu.x, state.tileActionMenu.y);
      }
    };
  });
  const actionButtons = tileActionMenuEl.querySelectorAll<HTMLButtonElement>("button[data-action]");
  actionButtons.forEach((btn) => {
    btn.onclick = () => {
      const actionId = btn.dataset.action as TileActionDef["id"] | undefined;
      if (!actionId) return;
      handleTileAction(actionId, btn.dataset.targetKey, btn.dataset.originKey);
    };
  });
  const progressButtons = tileActionMenuEl.querySelectorAll<HTMLButtonElement>("button[data-progress-action]");
  progressButtons.forEach((btn) => {
    btn.onclick = () => {
      if (btn.dataset.progressAction !== "cancel_structure_build") return;
      const tile = state.tileActionMenu.currentTileKey ? state.tiles.get(state.tileActionMenu.currentTileKey) : undefined;
      if (!tile) return;
      if (sendGameMessage({ type: "CANCEL_STRUCTURE_BUILD", x: tile.x, y: tile.y })) {
        applyOptimisticStructureCancel(tile.x, tile.y);
        renderHud();
      }
      hideTileActionMenu();
    };
  });
};

const openSingleTileActionMenu = (tile: Tile, clientX: number, clientY: number): void => {
  if (tile.ownerId && tile.ownerId !== state.me && !isTileOwnedByAlly(tile)) requestAttackPreviewForTarget(tile);
  state.tileActionMenu.mode = "single";
  state.tileActionMenu.bulkKeys = [];
  state.tileActionMenu.currentTileKey = key(tile.x, tile.y);
  const view = tileMenuViewForTile(tile);
  state.tileActionMenu.activeTab = view.tabs[0] ?? "overview";
  renderTileActionMenu(view, clientX, clientY);
};

const openBulkTileActionMenu = (targetKeys: string[], clientX: number, clientY: number): void => {
  if (targetKeys.length === 0) return;
  let neutralCount = 0;
  let enemyCount = 0;
  let ownedYieldCount = 0;
  for (const k of targetKeys) {
    const t = state.tiles.get(k);
    if (!t || t.terrain !== "LAND" || t.fogged) continue;
    if (!t.ownerId) neutralCount += 1;
    else if (t.ownerId !== state.me && !isTileOwnedByAlly(t)) enemyCount += 1;
    else if (t.ownerId === state.me) {
      if (t.ownershipState !== "SETTLED") continue;
      const y = (t as Tile & { yield?: { gold?: number; strategic?: Record<string, number> } }).yield;
      const hasYield =
        Boolean(y && ((y.gold ?? 0) > 0.01 || Object.values(y.strategic ?? {}).some((v) => Number(v) > 0.01)));
      if (hasYield) ownedYieldCount += 1;
    }
  }
  const actions: TileActionDef[] = [];
  if (neutralCount > 0) {
    actions.push({ id: "settle_land", label: `Settle Land (${neutralCount})`, cost: `${SETTLE_COST} gold each` });
  }
  if (enemyCount > 0) {
    actions.push({ id: "launch_attack", label: `Launch Attack (${enemyCount})` });
    actions.push({
      id: "launch_breach_attack",
      label: `Launch Breach Attack (${enemyCount})`,
      cost: hasBreakthroughCapability() ? "2 gold + 1 IRON each" : "Requires Breach Doctrine"
    });
  }
  if (ownedYieldCount > 0) {
    actions.push({ id: "collect_yield", label: `Collect Yield (${ownedYieldCount})` });
  }
  state.tileActionMenu.mode = "bulk";
  state.tileActionMenu.bulkKeys = targetKeys;
  state.tileActionMenu.currentTileKey = "";
  state.tileActionMenu.activeTab = "actions";
  renderTileActionMenu(
    {
      title: "Tile Selection",
      subtitle: `${targetKeys.length} selected`,
      tabs: ["actions"],
      overviewLines: [],
      actions,
      buildings: [],
      crystal: []
    },
    clientX,
    clientY
  );
};

const handleTileAction = (actionId: TileActionDef["id"], targetKeyOverride?: string, originKeyOverride?: string): void => {
  const singleTargetKey = state.tileActionMenu.mode === "single" ? state.tileActionMenu.currentTileKey : "";
  const selected = singleTargetKey
    ? state.tiles.get(singleTargetKey)
    : state.selected
      ? state.tiles.get(key(state.selected.x, state.selected.y))
      : undefined;
  const bulkKeys = state.tileActionMenu.mode === "bulk" ? state.tileActionMenu.bulkKeys : [];
  const fromBulk = bulkKeys.length > 0;
  const targets = fromBulk ? bulkKeys : selected ? [key(selected.x, selected.y)] : [];
  if (targets.length === 0) {
    hideTileActionMenu();
    return;
  }

  if (actionId === "settle_land") {
    if (fromBulk) {
      const neutralTargets = targets.filter((k) => {
        const t = state.tiles.get(k);
        return t && t.terrain === "LAND" && !t.ownerId;
      });
      const out = queueSpecificTargets(neutralTargets, "normal");
      if (out.queued > 0) processActionQueue();
      pushFeed(
        out.queued > 0
          ? `Queued ${out.queued} frontier captures${out.skipped > 0 ? ` (${out.skipped} unreachable)` : ""}.`
          : "No frontier claims queued. Targets must touch your territory and you need enough gold.",
        "combat",
        out.queued > 0 ? "info" : "warn"
      );
    } else if (selected) {
      const k = key(selected.x, selected.y);
      if (!selected.ownerId) {
        const out = queueSpecificTargets([k], "normal");
        if (out.queued > 0) {
          processActionQueue();
          pushFeed(`Queued frontier capture at (${selected.x}, ${selected.y}).`, "combat", "info");
        } else {
          pushFeed("Cannot claim this tile yet. It must touch your territory and you need enough gold.", "combat", "warn");
        }
      } else if (selected.ownerId === state.me && selected.ownershipState === "FRONTIER") {
        if (requestSettlement(selected.x, selected.y)) pushFeed(`Settlement started at (${selected.x}, ${selected.y}).`, "combat", "info");
      }
      state.autoSettleTargets.delete(k);
    }
    hideTileActionMenu();
    return;
  }
  if (actionId === "launch_attack" || actionId === "launch_breach_attack") {
    const enemyTargets = targets.filter((k) => {
      const t = state.tiles.get(k);
      return t && t.terrain === "LAND" && t.ownerId && t.ownerId !== state.me && !isTileOwnedByAlly(t);
    });
    const mode = actionId === "launch_breach_attack" ? "breakthrough" : "normal";
    const out = queueSpecificTargets(enemyTargets, mode);
    if (out.queued > 0) processActionQueue();
    if (out.queued > 0) {
      pushFeed(`Queued ${out.queued} attacks${out.skipped > 0 ? ` (${out.skipped} unreachable)` : ""}.`, "combat", "warn");
    } else {
      const singleTile = !fromBulk && selected ? selected : undefined;
      const failureMessage = singleTile
        ? attackQueueFailureReason(singleTile, mode)
        : `Cannot launch ${mode === "breakthrough" ? "breakthrough " : ""}attack for one or more selected tiles.`;
      showCaptureAlert(`${mode === "breakthrough" ? "Breach attack" : "Attack"} failed`, failureMessage, "warn");
      pushFeed(failureMessage, "combat", "error");
    }
    hideTileActionMenu();
    return;
  }
  if (actionId === "collect_yield" && fromBulk) {
    let n = 0;
    for (const k of targets) {
      const t = state.tiles.get(k);
      if (!t || t.ownerId !== state.me) continue;
      sendGameMessage({ type: "COLLECT_TILE", x: t.x, y: t.y });
      n += 1;
    }
    pushFeed(`Collecting from ${n} selected tiles.`, "info", "info");
    hideTileActionMenu();
    return;
  }
  if (!selected) {
    hideTileActionMenu();
    return;
  }
  if (actionId === "collect_yield") collectSelectedYield();
  if (actionId === "build_fortification") sendDevelopmentBuild({ type: "BUILD_FORT", x: selected.x, y: selected.y }, () => applyOptimisticStructureBuild(selected.x, selected.y, "FORT"));
  if (actionId === "build_observatory") sendDevelopmentBuild({ type: "BUILD_OBSERVATORY", x: selected.x, y: selected.y }, () => applyOptimisticStructureBuild(selected.x, selected.y, "OBSERVATORY"));
  if (
    actionId === "build_farmstead"
  ) sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "FARMSTEAD" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "FARMSTEAD"));
  if (actionId === "build_camp") sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "CAMP" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "CAMP"));
  if (actionId === "build_mine") sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "MINE" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "MINE"));
  if (actionId === "build_market") sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "MARKET" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "MARKET"));
  if (actionId === "build_granary") sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "GRANARY" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "GRANARY"));
  if (actionId === "build_bank") sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "BANK" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "BANK"));
  if (actionId === "build_airport") sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "AIRPORT" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "AIRPORT"));
  if (actionId === "build_caravanary") sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "CARAVANARY" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "CARAVANARY"));
  if (actionId === "build_quartermaster") sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "QUARTERMASTER" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "QUARTERMASTER"));
  if (actionId === "build_ironworks") sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "IRONWORKS" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "IRONWORKS"));
  if (actionId === "build_crystal_synthesizer") sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "CRYSTAL_SYNTHESIZER" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "CRYSTAL_SYNTHESIZER"));
  if (actionId === "build_fuel_plant") sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "FUEL_PLANT" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "FUEL_PLANT"));
  if (actionId === "build_foundry") sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "FOUNDRY" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "FOUNDRY"));
  if (actionId === "build_garrison_hall") sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "GARRISON_HALL" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "GARRISON_HALL"));
  if (actionId === "build_customs_house") sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "CUSTOMS_HOUSE" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "CUSTOMS_HOUSE"));
  if (actionId === "build_governors_office") sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "GOVERNORS_OFFICE" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "GOVERNORS_OFFICE"));
  if (actionId === "build_radar_system") sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "RADAR_SYSTEM" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "RADAR_SYSTEM"));
  if (actionId === "build_siege_camp") sendDevelopmentBuild({ type: "BUILD_SIEGE_OUTPOST", x: selected.x, y: selected.y }, () => applyOptimisticStructureBuild(selected.x, selected.y, "SIEGE_OUTPOST"));
  if (actionId === "create_mountain") sendGameMessage({ type: "CREATE_MOUNTAIN", x: selected.x, y: selected.y });
  if (actionId === "remove_mountain") sendGameMessage({ type: "REMOVE_MOUNTAIN", x: selected.x, y: selected.y });
  if (actionId === "abandon_territory") sendGameMessage({ type: "UNCAPTURE_TILE", x: selected.x, y: selected.y });
  if (actionId === "reveal_empire" && selected.ownerId && selected.ownerId !== state.me && selected.ownerId !== "barbarian") {
    sendGameMessage({ type: "REVEAL_EMPIRE", targetPlayerId: selected.ownerId });
  }
  if (actionId === "deep_strike") {
    if (hostileObservatoryProtectingTile(selected)) {
      pushFeed("Blocked by observatory field.", "combat", "warn");
      hideTileActionMenu();
      return;
    }
    const origin = findDeepStrikeOriginForTarget(selected);
    if (origin) {
      sendGameMessage({ type: "DEEP_STRIKE_ATTACK", fromX: origin.x, fromY: origin.y, toX: selected.x, toY: selected.y });
    }
  }
  if (actionId === "naval_infiltration") {
    const targetTile = targetKeyOverride ? state.tiles.get(targetKeyOverride) : selected;
    if (targetTile && hostileObservatoryProtectingTile(targetTile)) {
      pushFeed("Blocked by observatory field.", "combat", "warn");
      hideTileActionMenu();
      return;
    }
    const origin = originKeyOverride
      ? (() => {
          const parsed = parseKey(originKeyOverride);
          return state.tiles.get(originKeyOverride) ?? state.tiles.get(key(parsed.x, parsed.y));
        })()
      : targetTile
        ? findNavalInfiltrationOriginForTarget(targetTile)
        : undefined;
    if (targetTile && origin) {
      sendGameMessage({ type: "NAVAL_INFILTRATION_ATTACK", fromX: origin.x, fromY: origin.y, toX: targetTile.x, toY: targetTile.y });
    }
  }
  if (actionId === "sabotage_tile") {
    if (hostileObservatoryProtectingTile(selected)) {
      pushFeed("Blocked by observatory field.", "combat", "warn");
      hideTileActionMenu();
      return;
    }
    sendGameMessage({ type: "SABOTAGE_TILE", x: selected.x, y: selected.y });
  }
  hideTileActionMenu();
};

const showHoldBuildMenu = (x: number, y: number, clientX: number, clientY: number): void => {
  const tile = state.tiles.get(key(x, y));
  if (!tile || tile.ownerId !== state.me || tile.terrain !== "LAND") {
    hideHoldBuildMenu();
    return;
  }
  state.selected = { x, y };
  const development = developmentSlotSummary();
  const hasDevelopmentSlot = development.available > 0;
  const hasBlockingStructure = Boolean(tile.fort || tile.siegeOutpost || tile.observatory || tile.economicStructure);
  const fortGoldCost = structureGoldCost("FORT");
  const siegeGoldCost = structureGoldCost("SIEGE_OUTPOST");
  const observatoryGoldCost = structureGoldCost("OBSERVATORY");
  const canAffordFort = state.gold >= fortGoldCost;
  const canAffordSiege = state.gold >= siegeGoldCost;
  const canAffordObservatory =
    hasDevelopmentSlot &&
    tile.ownershipState === "SETTLED" &&
    !tile.fort &&
    !tile.siegeOutpost &&
    !tile.observatory &&
    !tile.economicStructure &&
    state.techIds.includes("cartography") &&
    state.gold >= observatoryGoldCost &&
    (state.strategicResources.CRYSTAL ?? 0) >= 45;
  const canBuildFarmstead =
    hasDevelopmentSlot &&
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    (tile.resource === "FARM" || tile.resource === "FISH") &&
    state.techIds.includes("agriculture") &&
    state.gold >= 700 &&
    (state.strategicResources.FOOD ?? 0) >= 20;
  const canBuildCamp =
    hasDevelopmentSlot &&
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    (tile.resource === "WOOD" || tile.resource === "FUR") &&
    state.techIds.includes("leatherworking") &&
    state.gold >= 800 &&
    (state.strategicResources.SUPPLY ?? 0) >= 30;
  const canBuildMine =
    hasDevelopmentSlot &&
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    (tile.resource === "IRON" || tile.resource === "GEMS") &&
    state.techIds.includes("mining") &&
    state.gold >= 800 &&
    (state.strategicResources[tile.resource === "IRON" ? "IRON" : "CRYSTAL"] ?? 0) >= 30;
  const canBuildMarket =
    hasDevelopmentSlot &&
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    Boolean(tile.town) &&
    state.techIds.includes("trade") &&
    state.gold >= 1200 &&
    (state.strategicResources.CRYSTAL ?? 0) >= 40;
  const canBuildGranary =
    hasDevelopmentSlot &&
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    Boolean(tile.town) &&
    state.techIds.includes("pottery") &&
    state.gold >= 700 &&
    (state.strategicResources.FOOD ?? 0) >= 40;
  holdBuildMenuEl.innerHTML = `
    <div class="hold-menu-card">
      <div class="hold-menu-title">Build on (${x}, ${y})</div>
      <button class="hold-menu-btn" data-build="settle" ${tile.ownershipState === "FRONTIER" && hasDevelopmentSlot && canAffordCost(state.gold, SETTLE_COST) ? "" : "disabled"}>
        <span>Settle Tile</span>
        <small>${SETTLE_COST} gold • ${(settleDurationMsForTile(x, y) / 1000).toFixed(0)}s${isForestTile(x, y) ? " (Forest)" : ""} • converts frontier to settled</small>
      </button>
      <button class="hold-menu-btn" data-build="fort" ${hasDevelopmentSlot && canAffordFort ? "" : "disabled"}>
        <span>Fort</span>
        <small>${structureCostText("FORT")} • ${(FORT_BUILD_MS / 1000).toFixed(0)}s • def x${FORT_DEFENSE_MULT.toFixed(2)} • 1 gold / min</small>
      </button>
      <button class="hold-menu-btn" data-build="observatory" ${canAffordObservatory ? "" : "disabled"}>
        <span>Observatory</span>
        <small>${structureCostText("OBSERVATORY")} • +5 local vision • 0.025 crystal / min</small>
      </button>
      <button class="hold-menu-btn" data-build="farmstead" ${canBuildFarmstead ? "" : "disabled"}>
        <span>Farmstead</span>
        <small>700 gold + 20 FOOD • +50% food output • 1 gold / 10m</small>
      </button>
      <button class="hold-menu-btn" data-build="camp" ${canBuildCamp ? "" : "disabled"}>
        <span>Camp</span>
        <small>800 gold + 30 SUPPLY • +50% supply output • 1.2 gold / 10m</small>
      </button>
      <button class="hold-menu-btn" data-build="mine" ${canBuildMine ? "" : "disabled"}>
        <span>Mine</span>
        <small>800 gold + 30 matching resource • +50% iron or crystal • 1.2 gold / 10m</small>
      </button>
      <button class="hold-menu-btn" data-build="market" ${canBuildMarket ? "" : "disabled"}>
        <span>Market</span>
        <small>1200 gold + 40 CRYSTAL • +50% fed town gold • +50% town cap • 0.05 crystal / min</small>
      </button>
      <button class="hold-menu-btn" data-build="granary" ${canBuildGranary ? "" : "disabled"}>
        <span>Granary</span>
        <small>700 gold + 40 FOOD • +50% town gold cap • 1 gold / 10m</small>
      </button>
      <button class="hold-menu-btn" data-build="siege" ${hasDevelopmentSlot && canAffordSiege ? "" : "disabled"}>
        <span>Siege Outpost</span>
        <small>${structureCostText("SIEGE_OUTPOST")} • ${(SIEGE_OUTPOST_BUILD_MS / 1000).toFixed(0)}s • atk x${SIEGE_OUTPOST_ATTACK_MULT.toFixed(2)} • 1 gold / min</small>
      </button>
    </div>
  `;
  const { width: vw, height: vh } = viewportSize();
  const menuW = Math.min(290, vw - 16);
  const menuH = 168;
  const left = Math.max(8, Math.min(vw - menuW - 8, clientX + 8));
  const top = Math.max(84, Math.min(vh - menuH - 8, clientY + 8));
  holdBuildMenuEl.style.width = `${menuW}px`;
  holdBuildMenuEl.style.left = `${left}px`;
  holdBuildMenuEl.style.top = `${top}px`;
  holdBuildMenuEl.style.display = "block";

  const settleBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='settle']");
  const fortBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='fort']");
  const observatoryBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='observatory']");
  const farmsteadBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='farmstead']");
  const campBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='camp']");
  const mineBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='mine']");
  const marketBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='market']");
  const granaryBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='granary']");
  const siegeBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='siege']");
  if (settleBtn) {
    settleBtn.onclick = () => {
      requestSettlement(x, y);
      hideHoldBuildMenu();
    };
  }
  if (fortBtn) {
    fortBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_FORT", x, y }, () => applyOptimisticStructureBuild(x, y, "FORT"));
      hideHoldBuildMenu();
    };
  }
  if (siegeBtn) {
    siegeBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_SIEGE_OUTPOST", x, y }, () => applyOptimisticStructureBuild(x, y, "SIEGE_OUTPOST"));
      hideHoldBuildMenu();
    };
  }
  if (observatoryBtn) {
    observatoryBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_OBSERVATORY", x, y }, () => applyOptimisticStructureBuild(x, y, "OBSERVATORY"));
      hideHoldBuildMenu();
    };
  }
  if (farmsteadBtn) {
    farmsteadBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "FARMSTEAD" }, () => applyOptimisticStructureBuild(x, y, "FARMSTEAD"));
      hideHoldBuildMenu();
    };
  }
  if (campBtn) {
    campBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "CAMP" }, () => applyOptimisticStructureBuild(x, y, "CAMP"));
      hideHoldBuildMenu();
    };
  }
  if (mineBtn) {
    mineBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "MINE" }, () => applyOptimisticStructureBuild(x, y, "MINE"));
      hideHoldBuildMenu();
    };
  }
  if (marketBtn) {
    marketBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "MARKET" }, () => applyOptimisticStructureBuild(x, y, "MARKET"));
      hideHoldBuildMenu();
    };
  }
  if (granaryBtn) {
    granaryBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "GRANARY" }, () => applyOptimisticStructureBuild(x, y, "GRANARY"));
      hideHoldBuildMenu();
    };
  }
  renderHud();
};

allianceSendBtn.onclick = () => {
  sendAllianceRequest(allianceTargetEl.value);
};
mobileAllianceSendBtn.onclick = () => {
  sendAllianceRequest(mobileAllianceTargetEl.value);
};
allianceBreakBtn.onclick = () => {
  breakAlliance(allianceBreakIdEl.value);
};
mobileAllianceBreakBtn.onclick = () => {
  breakAlliance(mobileAllianceBreakIdEl.value);
};
techChooseBtn.onclick = () => {
  chooseTech();
};
mobileTechChooseBtn.onclick = () => {
  chooseTech();
};
techPickEl.onchange = () => {
  state.techUiSelectedId = techPickEl.value;
  mobileTechPickEl.value = techPickEl.value;
  renderHud();
};
mobileTechPickEl.onchange = () => {
  state.techUiSelectedId = mobileTechPickEl.value;
  techPickEl.value = mobileTechPickEl.value;
  renderHud();
};
centerMeBtn.onclick = () => {
  centerOnOwnedTile();
  requestViewRefresh(2, true);
};
centerMeDesktopBtn.onclick = () => {
  centerOnOwnedTile();
  requestViewRefresh(2, true);
};
collectVisibleDesktopBtn.onclick = () => {
  collectVisibleYield();
};

collectVisibleMobileBtn.onclick = () => {
  collectVisibleYield();
};
captureCancelBtn.onclick = () => cancelOngoingCapture();
panelCloseBtn.onclick = () => {
  state.activePanel = null;
  renderHud();
};

panelActionButtons.forEach((btn) => {
  btn.onclick = () => {
    const p = btn.dataset.panel as typeof state.activePanel;
    if (!p) return;
    setActivePanel(p);
  };
});

authColorPresetButtons.forEach((btn) => {
  btn.onclick = () => {
    const color = btn.dataset.color;
    if (!color) return;
    authProfileColorEl.value = color;
    syncAuthPanelState();
  };
});

authProfileColorEl.oninput = () => {
  syncAuthPanelState();
};

authEmailEl.onkeydown = (event) => {
  if (event.key === "Enter" && !state.profileSetupRequired) {
    event.preventDefault();
    authEmailLinkBtn.click();
  }
};

authProfileNameEl.onkeydown = (event) => {
  if (event.key === "Enter" && state.profileSetupRequired) {
    event.preventDefault();
    authProfileSaveBtn.click();
  }
};

const mobileNavButtons = hud.querySelectorAll<HTMLButtonElement>("#mobile-nav button[data-mobile-panel]");
mobileNavButtons.forEach((btn) => {
  btn.onclick = () => {
    const p = btn.dataset.mobilePanel as typeof state.mobilePanel | undefined;
    if (!p) return;
    state.mobilePanel = p;
    if (p === "intel") state.unreadAttackAlerts = 0;
    renderHud();
  };
});

ws.addEventListener("open", () => {
  state.connection = "connected";
  if (!state.mapLoadStartedAt) state.mapLoadStartedAt = Date.now();
  clearReconnectReloadTimer();
  clearAuthReconnectTimer();
  if (state.authReady && !state.authSessionReady) {
    state.authBusy = true;
    setAuthStatus(`Connected to the game server. Syncing ${state.authUserLabel || "empire"}...`);
  }
  renderHud();
  void authenticateSocket();
});
ws.addEventListener("close", () => {
  const currentActionKey = state.actionCurrent ? key(state.actionCurrent.x, state.actionCurrent.y) : "";
  state.connection = "disconnected";
  state.actionInFlight = false;
  state.combatStartAck = false;
  state.actionStartedAt = 0;
  state.actionTargetKey = "";
  state.actionCurrent = undefined;
  if (currentActionKey) clearOptimisticTileState(currentActionKey, true);
  pushFeed("Connection lost. Retrying...", "error", "warn");
  if (state.authReady && !state.authSessionReady) {
    state.authBusy = true;
    setAuthStatus(`Signed into Firebase. Reconnecting to the game server at ${wsUrl}...`);
  }
  clearAuthReconnectTimer();
  scheduleReconnectReload();
  renderHud();
});
ws.addEventListener("error", () => {
  const currentActionKey = state.actionCurrent ? key(state.actionCurrent.x, state.actionCurrent.y) : "";
  state.connection = "disconnected";
  state.actionInFlight = false;
  state.combatStartAck = false;
  state.actionStartedAt = 0;
  state.actionTargetKey = "";
  state.actionCurrent = undefined;
  if (currentActionKey) clearOptimisticTileState(currentActionKey, true);
  pushFeed("Server unreachable. Retrying...", "error", "warn");
  if (state.authReady && !state.authSessionReady) {
    state.authBusy = true;
    setAuthStatus(`Signed into Firebase. Waiting for the game server at ${wsUrl}...`);
  }
  clearAuthReconnectTimer();
  scheduleReconnectReload();
  renderHud();
});

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
  if (msg.type === "INIT") {
    state.connection = "initialized";
    state.authSessionReady = true;
    state.hasEverInitialized = true;
    state.authBusy = false;
    state.authRetrying = false;
    clearAuthReconnectTimer();
    state.mapLoadStartedAt = Date.now();
    state.firstChunkAt = 0;
    state.chunkFullCount = 0;
    state.hasOwnedTileInCache = false;
    const p = msg.player as Record<string, unknown>;
    state.me = p.id as string;
    state.meName = p.name as string;
    state.playerNames.set(state.me, state.meName);
    state.profileSetupRequired = Boolean(p.profileNeedsSetup);
    setAuthStatus(`Signed in as ${state.authUserLabel || (p.name as string)}.`);
    state.gold = (p.gold as number | undefined) ?? (p.points as number);
    state.level = p.level as number;
    state.mods = (p.mods as typeof state.mods) ?? state.mods;
    state.modBreakdown = (p.modBreakdown as typeof state.modBreakdown | undefined) ?? state.modBreakdown;
    state.incomePerMinute = (p.incomePerMinute as number) ?? state.incomePerMinute;
    state.strategicResources =
      (p.strategicResources as typeof state.strategicResources | undefined) ?? state.strategicResources;
    state.strategicProductionPerMinute =
      (p.strategicProductionPerMinute as typeof state.strategicProductionPerMinute | undefined) ?? state.strategicProductionPerMinute;
    state.stamina = p.stamina as number;
    state.territoryT = (p.T as number) ?? state.territoryT;
    state.exposureE = (p.E as number) ?? state.exposureE;
    state.settledT = (p.Ts as number) ?? state.settledT;
    state.settledE = (p.Es as number) ?? state.settledE;
    const initDefensibility = defensibilityPctFromTE(
      (p.Ts as number | undefined) ?? (p.T as number | undefined),
      (p.Es as number | undefined) ?? (p.E as number | undefined)
    );
    state.defensibilityPct = initDefensibility;
    state.defensibilityAnimDir = 0;
    state.defensibilityAnimUntil = 0;
    state.availableTechPicks = (p.availableTechPicks as number) ?? 0;
    state.techRootId = p.techRootId as string | undefined;
    state.techIds = (p.techIds as string[]) ?? [];
    state.currentResearch = (p.currentResearch as typeof state.currentResearch | undefined) ?? undefined;
    state.currentResearch = p.currentResearch as typeof state.currentResearch;
    state.pendingTechUnlockId = state.currentResearch?.techId ?? "";
    state.domainIds = (p.domainIds as string[]) ?? [];
    state.revealCapacity = (p.revealCapacity as number) ?? state.revealCapacity;
    state.activeRevealTargets = (p.activeRevealTargets as string[]) ?? state.activeRevealTargets;
    state.abilityCooldowns =
      (p.abilityCooldowns as typeof state.abilityCooldowns | undefined) ?? state.abilityCooldowns;
    applyPendingSettlementsFromServer(
      (p.pendingSettlements as Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined) ?? []
    );
    state.allies = (p.allies as string[]) ?? [];
    const myTileColor = p.tileColor as string | undefined;
    if (myTileColor) {
      state.playerColors.set(state.me, myTileColor);
      authProfileColorEl.value = myTileColor;
    }
    const myVisualStyle = p.visualStyle as EmpireVisualStyle | undefined;
    if (myVisualStyle) state.playerVisualStyles.set(state.me, myVisualStyle);
    seedProfileSetupFields((p.name as string) || state.authUserLabel, myTileColor ?? authProfileColorEl.value);
    for (const s of ((msg.playerStyles as Array<{ id: string; name?: string; tileColor?: string; visualStyle?: EmpireVisualStyle }>) ?? [])) {
      if (s.name) state.playerNames.set(s.id, s.name);
      if (s.tileColor) state.playerColors.set(s.id, s.tileColor);
      if (s.visualStyle) state.playerVisualStyles.set(s.id, s.visualStyle);
    }
    const homeTile = p.homeTile as { x: number; y: number } | undefined;
    if (homeTile) {
      state.homeTile = homeTile;
      state.camX = homeTile.x;
      state.camY = homeTile.y;
      state.selected = homeTile;
    }
    state.techChoices = (msg.techChoices as string[]) ?? [];
    state.techCatalog = (msg.techCatalog as TechInfo[]) ?? [];
    state.domainChoices = (msg.domainChoices as string[]) ?? [];
    state.domainCatalog = (msg.domainCatalog as DomainInfo[]) ?? [];
    if (!state.domainUiSelectedId && state.domainChoices.length > 0) state.domainUiSelectedId = state.domainChoices[0]!;
    state.missions = (msg.missions as MissionState[]) ?? [];
    state.leaderboard =
      (msg.leaderboard as {
        overall: LeaderboardOverallEntry[];
        byTiles: LeaderboardMetricEntry[];
        byIncome: LeaderboardMetricEntry[];
        byTechs: LeaderboardMetricEntry[];
      }) ?? state.leaderboard;
    state.seasonVictory = (msg.seasonVictory as SeasonVictoryObjectiveView[] | undefined) ?? state.seasonVictory;
    state.seasonWinner = (msg.seasonWinner as SeasonWinnerView | undefined) ?? state.seasonWinner;
    if (state.profileSetupRequired) {
      setAuthStatus("Choose a display name and nation color to begin.");
    }
    state.incomingAllianceRequests = (msg.allianceRequests as AllianceRequest[]) ?? [];
    const cfg = (msg.config as { season?: { seasonId: string; worldSeed?: number }; fogDisabled?: boolean } | undefined) ?? {};
    const season = cfg.season;
    if (typeof season?.worldSeed === "number") {
      setWorldSeed(season.worldSeed);
      clearRenderCaches();
      buildMiniMapBase();
    }
    state.fogDisabled = Boolean(cfg.fogDisabled);
    const mapMeta = (msg.mapMeta as { dockCount?: number; dockPairCount?: number; clusterCount?: number; townCount?: number; dockPairs?: DockPair[] } | undefined) ?? {};
    state.discoveredTiles.clear();
    state.discoveredDockTiles.clear();
    state.dockPairs = mapMeta.dockPairs ?? [];
    state.dockRouteCache.clear();
    pushFeed(`Spawned. ${season?.seasonId ? `Season ${season.seasonId}.` : ""} Your tile is centered.`, "info", "success");
    if (cfg.fogDisabled) pushFeed("Fog of war is disabled for this server session.", "info", "warn");
    if (typeof mapMeta.dockCount === "number") {
      pushFeed(
        `Map features: ${mapMeta.dockCount} docks (${mapMeta.dockPairCount ?? Math.floor(mapMeta.dockCount / 2)} pairs), ${mapMeta.clusterCount ?? 0} clusters.`,
        "info",
        "info"
      );
      if (typeof mapMeta.townCount === "number") {
        pushFeed(`Towns on world: ${mapMeta.townCount}.`, "info", "info");
      }
    }
    requestViewRefresh();
    syncAuthOverlay();
    renderHud();
  }
  const applyChunkTiles = (tiles: Tile[]): void => {
    state.chunkFullCount += 1;
    if (state.firstChunkAt === 0) state.firstChunkAt = Date.now();
    let sawVisibleTile = false;
    let sawOwnedTile = false;
    for (const t of tiles) {
      const mergedTile = mergeServerTileWithOptimisticState(t);
      state.tiles.set(key(mergedTile.x, mergedTile.y), mergedTile);
      if (!mergedTile.optimisticPending) clearOptimisticTileState(key(mergedTile.x, mergedTile.y));
      markDockDiscovered(mergedTile);
      if (!mergedTile.fogged) state.discoveredTiles.add(key(mergedTile.x, mergedTile.y));
      if (!mergedTile.fogged) sawVisibleTile = true;
      if (mergedTile.ownerId === state.me) sawOwnedTile = true;
    }
    if (sawOwnedTile) {
      state.hasOwnedTileInCache = true;
    } else if (!state.hasOwnedTileInCache) {
      centerOnOwnedTile();
    }
    renderHud();
  };
  if (msg.type === "CHUNK_FULL") {
    applyChunkTiles(msg.tilesMaskedByFog as Tile[]);
  }
  if (msg.type === "CHUNK_BATCH") {
    const chunks = (msg.chunks as Array<{ cx: number; cy: number; tilesMaskedByFog: Tile[] }>) ?? [];
    for (const chunk of chunks) applyChunkTiles(chunk.tilesMaskedByFog);
  }
  if (msg.type === "PLAYER_UPDATE") {
    const prevGold = state.gold;
    const prevDefensibility = state.defensibilityPct;
    const prevStrategic = { ...state.strategicResources };
    state.gold = (msg.gold as number | undefined) ?? (msg.points as number);
    if (typeof msg.name === "string") {
      state.meName = msg.name;
      authProfileNameEl.value = msg.name;
    }
    state.level = msg.level as number;
    state.mods = (msg.mods as typeof state.mods) ?? state.mods;
    state.modBreakdown = (msg.modBreakdown as typeof state.modBreakdown | undefined) ?? state.modBreakdown;
    state.incomePerMinute = (msg.incomePerMinute as number) ?? state.incomePerMinute;
    state.strategicResources =
      (msg.strategicResources as typeof state.strategicResources | undefined) ?? state.strategicResources;
    state.strategicProductionPerMinute =
      (msg.strategicProductionPerMinute as typeof state.strategicProductionPerMinute | undefined) ?? state.strategicProductionPerMinute;
    state.upkeepPerMinute =
      (msg.upkeepPerMinute as typeof state.upkeepPerMinute | undefined) ?? state.upkeepPerMinute;
    state.upkeepLastTick =
      (msg.upkeepLastTick as typeof state.upkeepLastTick | undefined) ?? state.upkeepLastTick;
    applyPendingSettlementsFromServer(
      (msg.pendingSettlements as Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined) ?? []
    );
    clearPendingCollectVisibleDelta();
    if (state.upkeepLastTick.foodCoverage < 0.999 && !state.foodCoverageWarned) {
      pushFeed(
        `Town support underfed: FOOD upkeep coverage ${(state.upkeepLastTick.foodCoverage * 100).toFixed(0)}%. Unfed towns stop producing gold.`,
        "info",
        "warn"
      );
      state.foodCoverageWarned = true;
    } else if (state.upkeepLastTick.foodCoverage >= 0.999 && state.foodCoverageWarned) {
      pushFeed("FOOD upkeep recovered. Town income back to normal.", "info", "success");
      state.foodCoverageWarned = false;
    }
    if (state.gold > prevGold) {
      state.goldAnimUntil = Date.now() + 350;
      state.goldAnimDir = 1;
    } else if (state.gold < prevGold) {
      state.goldAnimUntil = Date.now() + 350;
      state.goldAnimDir = -1;
    } else {
      state.goldAnimDir = 0;
    }
    for (const k of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"] as const) {
      const prev = prevStrategic[k] ?? 0;
      const next = state.strategicResources[k] ?? 0;
      if (next > prev) {
        state.strategicAnim[k].until = Date.now() + 350;
        state.strategicAnim[k].dir = 1;
      } else if (next < prev) {
        state.strategicAnim[k].until = Date.now() + 350;
        state.strategicAnim[k].dir = -1;
      } else if (Date.now() >= state.strategicAnim[k].until) {
        state.strategicAnim[k].dir = 0;
      }
    }
    state.stamina = msg.stamina as number;
    if (typeof (msg.T as number | undefined) === "number") state.territoryT = msg.T as number;
    if (typeof (msg.E as number | undefined) === "number") state.exposureE = msg.E as number;
    if (typeof (msg.Ts as number | undefined) === "number") state.settledT = msg.Ts as number;
    if (typeof (msg.Es as number | undefined) === "number") state.settledE = msg.Es as number;
    state.defensibilityPct = defensibilityPctFromTE(state.settledT, state.settledE);
    if (state.defensibilityPct > prevDefensibility + 0.05) {
      state.defensibilityAnimUntil = Date.now() + 550;
      state.defensibilityAnimDir = 1;
    } else if (state.defensibilityPct < prevDefensibility - 0.05) {
      state.defensibilityAnimUntil = Date.now() + 550;
      state.defensibilityAnimDir = -1;
    } else if (Date.now() >= state.defensibilityAnimUntil) {
      state.defensibilityAnimDir = 0;
    }
    state.availableTechPicks = (msg.availableTechPicks as number) ?? state.availableTechPicks;
    state.techChoices = (msg.techChoices as string[]) ?? state.techChoices;
    state.techCatalog = (msg.techCatalog as TechInfo[]) ?? state.techCatalog;
    state.currentResearch = (msg.currentResearch as typeof state.currentResearch | undefined) ?? state.currentResearch;
    if (typeof msg.profileNeedsSetup === "boolean") state.profileSetupRequired = msg.profileNeedsSetup;
    state.domainIds = (msg.domainIds as string[]) ?? state.domainIds;
    state.domainChoices = (msg.domainChoices as string[]) ?? state.domainChoices;
    state.domainCatalog = (msg.domainCatalog as DomainInfo[]) ?? state.domainCatalog;
    state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
    state.activeRevealTargets = (msg.activeRevealTargets as string[]) ?? state.activeRevealTargets;
    state.abilityCooldowns =
      (msg.abilityCooldowns as typeof state.abilityCooldowns | undefined) ?? state.abilityCooldowns;
    state.missions = (msg.missions as MissionState[]) ?? state.missions;
    state.leaderboard =
      (msg.leaderboard as {
        overall: LeaderboardOverallEntry[];
        byTiles: LeaderboardMetricEntry[];
        byIncome: LeaderboardMetricEntry[];
        byTechs: LeaderboardMetricEntry[];
      }) ?? state.leaderboard;
    state.seasonVictory = (msg.seasonVictory as SeasonVictoryObjectiveView[] | undefined) ?? state.seasonVictory;
    state.seasonWinner = (msg.seasonWinner as SeasonWinnerView | undefined) ?? state.seasonWinner;
    const myTileColor = msg.tileColor as string | undefined;
    if (myTileColor) {
      state.playerColors.set(state.me, myTileColor);
      authProfileColorEl.value = myTileColor;
    }
    const myVisualStyle = msg.visualStyle as EmpireVisualStyle | undefined;
    if (myVisualStyle) state.playerVisualStyles.set(state.me, myVisualStyle);
    syncAuthOverlay();
    renderHud();
  }
  if (msg.type === "GLOBAL_STATUS_UPDATE") {
    state.leaderboard =
      (msg.leaderboard as {
        overall: LeaderboardOverallEntry[];
        byTiles: LeaderboardMetricEntry[];
        byIncome: LeaderboardMetricEntry[];
        byTechs: LeaderboardMetricEntry[];
      }) ?? state.leaderboard;
    state.seasonVictory = (msg.seasonVictory as SeasonVictoryObjectiveView[] | undefined) ?? state.seasonVictory;
    state.seasonWinner = (msg.seasonWinner as SeasonWinnerView | undefined) ?? state.seasonWinner;
    renderHud();
  }
  if (msg.type === "COMBAT_RESULT") {
    const target = msg.target as { x: number; y: number } | undefined;
    const targetBefore = (() => (target ? state.tiles.get(key(target.x, target.y)) : undefined))();
    const originBefore = (() => {
      const origin = msg.origin as { x: number; y: number } | undefined;
      return origin ? state.tiles.get(key(origin.x, origin.y)) : undefined;
    })();
    const changes = msg.changes as Array<{ x: number; y: number; ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN"; breachShockUntil?: number }>;
    const resolvedCaptureTargetKey = state.capture ? key(state.capture.target.x, state.capture.target.y) : "";
    for (const c of changes) {
      const tileKey = key(c.x, c.y);
      state.incomingAttacksByTile.delete(tileKey);
      const existing = state.tiles.get(tileKey);
      const incoming: Tile = {
        ...(existing ?? { x: c.x, y: c.y, terrain: terrainAt(c.x, c.y), fogged: false }),
        x: c.x,
        y: c.y,
        fogged: false
      };
      if (c.ownerId) incoming.ownerId = c.ownerId;
      else delete incoming.ownerId;
      if (c.ownershipState) incoming.ownershipState = c.ownershipState;
      else if (!c.ownerId) delete incoming.ownershipState;
      if (typeof c.breachShockUntil === "number") incoming.breachShockUntil = c.breachShockUntil;
      else if ("breachShockUntil" in c && !c.breachShockUntil) delete incoming.breachShockUntil;
      const merged = mergeServerTileWithOptimisticState(incoming);
      if (!merged.optimisticPending) clearOptimisticTileState(tileKey);
      state.tiles.set(tileKey, merged);
    }
    const resultAlert = combatResolutionAlert(msg as Record<string, unknown>, {
      targetTileBefore: targetBefore,
      originTileBefore: originBefore
    });
    const resultTargetKey = target ? key(target.x, target.y) : "";
    const predictedAlreadyShown = Boolean(
      state.pendingCombatReveal &&
        state.pendingCombatReveal.targetKey === resultTargetKey &&
        state.pendingCombatReveal.revealed &&
        state.pendingCombatReveal.title === resultAlert.title &&
        state.pendingCombatReveal.detail === resultAlert.detail
    );
    if (!predictedAlreadyShown) {
      pushFeed(resultAlert.detail, "combat", resultAlert.tone === "success" ? "success" : "warn");
      showCaptureAlert(resultAlert.title, resultAlert.detail, resultAlert.tone);
    }
    if (state.pendingCombatReveal && state.pendingCombatReveal.targetKey === resultTargetKey) state.pendingCombatReveal = undefined;
    const resolvedCurrentKey = state.actionCurrent ? key(state.actionCurrent.x, state.actionCurrent.y) : "";
    const targetKey = resolvedCaptureTargetKey || state.actionTargetKey;
    let handedOffToSettle = false;
    if (targetKey && state.autoSettleTargets.has(targetKey)) {
      const settledTile = state.tiles.get(targetKey);
      if (settledTile && settledTile.ownerId === state.me && settledTile.ownershipState === "FRONTIER") {
        if (requestSettlement(settledTile.x, settledTile.y)) {
          handedOffToSettle = true;
          pushFeed(`Auto-settle started at (${settledTile.x}, ${settledTile.y}).`, "combat", "info");
        }
      }
      state.autoSettleTargets.delete(targetKey);
    }
    state.capture = undefined;
    if (!handedOffToSettle) {
      state.actionInFlight = false;
      state.combatStartAck = false;
      state.actionStartedAt = 0;
      if (targetKey) dropQueuedTargetKeyIfAbsent(targetKey);
      if (resolvedCurrentKey) dropQueuedTargetKeyIfAbsent(resolvedCurrentKey);
      const startedNext = processActionQueue();
      if (!startedNext) {
        state.actionTargetKey = "";
        state.actionCurrent = undefined;
      }
    }
    for (const change of changes) {
      if (change.ownerId === state.me && change.ownershipState === "SETTLED") {
        clearSettlementProgressForTile(change.x, change.y);
      }
    }
    state.attackPreview = undefined;
    state.attackPreviewPendingKey = "";
    renderHud();
  }
  if (msg.type === "COMBAT_START") {
    const target = msg.target as { x: number; y: number };
    const resolvesAt = msg.resolvesAt as number;
    state.combatStartAck = true;
    const existingCapture =
      state.capture && state.capture.target.x === target.x && state.capture.target.y === target.y ? state.capture : undefined;
    const startAt = existingCapture?.startAt ?? Date.now();
    state.capture = { startAt, resolvesAt, target };
    const predictedResult = msg.predictedResult as Record<string, unknown> | undefined;
    if (predictedResult) {
      const predictedAlert = combatResolutionAlert(predictedResult, {
        targetTileBefore: state.tiles.get(key(target.x, target.y)),
        originTileBefore: (() => {
          const origin = predictedResult.origin as { x: number; y: number } | undefined;
          return origin ? state.tiles.get(key(origin.x, origin.y)) : undefined;
        })()
      });
      state.pendingCombatReveal = {
        targetKey: key(target.x, target.y),
        title: predictedAlert.title,
        detail: predictedAlert.detail,
        tone: predictedAlert.tone,
        revealed: false
      };
    } else if (state.pendingCombatReveal?.targetKey === key(target.x, target.y)) {
      state.pendingCombatReveal = undefined;
    }
    state.actionInFlight = true;
    if (!state.actionStartedAt) state.actionStartedAt = startAt;
    state.actionTargetKey = key(target.x, target.y);
    renderHud();
  }
  if (msg.type === "ATTACK_ALERT") {
    const attackerName = (msg.attackerName as string | undefined) || (msg.attackerId as string | undefined) || "Unknown attacker";
    const x = Number(msg.x ?? -1);
    const y = Number(msg.y ?? -1);
    const resolvesAt = Number(msg.resolvesAt ?? Date.now() + 3000);
    const fromX = typeof msg.fromX === "number" ? Number(msg.fromX) : undefined;
    const fromY = typeof msg.fromY === "number" ? Number(msg.fromY) : undefined;
    if (x >= 0 && y >= 0) {
      state.incomingAttacksByTile.set(key(x, y), { attackerName, resolvesAt });
    }
    state.unreadAttackAlerts += 1;
    pushFeed(
      `Under attack: ${attackerName} is striking (${x}, ${y})${fromX !== undefined && fromY !== undefined ? ` from (${fromX}, ${fromY})` : ""}.`,
      "combat",
      "error"
    );
    renderHud();
  }
  if (msg.type === "COMBAT_CANCELLED") {
    const cancelledCurrentKey = state.actionCurrent ? key(state.actionCurrent.x, state.actionCurrent.y) : "";
    state.capture = undefined;
    if (state.pendingCombatReveal?.targetKey === cancelledCurrentKey) state.pendingCombatReveal = undefined;
    state.actionInFlight = false;
    state.combatStartAck = false;
    state.actionStartedAt = 0;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    if (cancelledCurrentKey) state.queuedTargetKeys.delete(cancelledCurrentKey);
    if (cancelledCurrentKey) clearOptimisticTileState(cancelledCurrentKey, true);
    state.autoSettleTargets.clear();
    pushFeed(`Capture cancelled (${(msg.count as number | undefined) ?? 1})`, "combat", "warn");
    renderHud();
  }
  if (msg.type === "FOG_UPDATE") {
    state.fogDisabled = Boolean(msg.fogDisabled);
    pushFeed(`Fog of war ${state.fogDisabled ? "disabled" : "enabled"}.`, "info", "info");
    requestViewRefresh(2, true);
    renderHud();
  }
  if (msg.type === "TILE_DELTA") {
    const updates = (msg.updates as Array<Tile>) ?? [];
    let resolvedQueuedFrontierCapture = false;
    for (const update of updates) {
      const updateKey = key(update.x, update.y);
      state.incomingAttacksByTile.delete(updateKey);
      state.pendingCollectVisibleKeys.delete(key(update.x, update.y));
      const existing = state.tiles.get(key(update.x, update.y));
      const merged: Tile = existing ?? { x: update.x, y: update.y, terrain: update.terrain ?? "LAND" };
      if (update.terrain) merged.terrain = update.terrain;
      if (update.fogged !== undefined) merged.fogged = update.fogged;
      if (update.resource !== undefined) merged.resource = update.resource;
      if (update.ownerId) merged.ownerId = update.ownerId;
      else delete merged.ownerId;
      if ("ownershipState" in update) {
        if (update.ownershipState) merged.ownershipState = update.ownershipState;
        else delete merged.ownershipState;
      }
      if ("capital" in update) {
        if (update.capital) merged.capital = update.capital;
        else delete merged.capital;
      }
      if ("breachShockUntil" in update) {
        if (typeof update.breachShockUntil === "number") merged.breachShockUntil = update.breachShockUntil;
        else delete merged.breachShockUntil;
      }
      if ("ownerId" in update && !update.ownerId) delete merged.ownershipState;
      if (update.clusterId !== undefined) merged.clusterId = update.clusterId;
      if (update.clusterType !== undefined) merged.clusterType = update.clusterType;
      if (update.regionType !== undefined) merged.regionType = update.regionType;
      if (update.dockId !== undefined) merged.dockId = update.dockId;
      if (update.town !== undefined) merged.town = update.town;
      if ("town" in update && !update.town) delete merged.town;
      if (update.fort !== undefined) merged.fort = update.fort;
      if (!update.fort) delete merged.fort;
      if ("observatory" in update) {
        if (update.observatory) merged.observatory = update.observatory;
        else delete merged.observatory;
      }
      if ("economicStructure" in update) {
        if (update.economicStructure) merged.economicStructure = update.economicStructure;
        else delete merged.economicStructure;
      }
      if (update.siegeOutpost !== undefined) merged.siegeOutpost = update.siegeOutpost;
      if (!update.siegeOutpost) delete merged.siegeOutpost;
      if ("sabotage" in update) {
        if (update.sabotage) merged.sabotage = update.sabotage;
        else delete merged.sabotage;
      }
      if ("yield" in update) {
        if (update.yield) merged.yield = update.yield;
        else delete merged.yield;
      }
      if ("yieldRate" in update) {
        if (update.yieldRate) merged.yieldRate = update.yieldRate;
        else delete merged.yieldRate;
      }
      if ("yieldCap" in update) {
        if (update.yieldCap) merged.yieldCap = update.yieldCap;
        else delete merged.yieldCap;
      }
      if ("history" in update) {
        if (update.history) merged.history = update.history;
        else delete merged.history;
      }
      const resolved = mergeServerTileWithOptimisticState(merged);
      state.tiles.set(updateKey, resolved);
      if (!resolved.optimisticPending) clearOptimisticTileState(updateKey);
      markDockDiscovered(resolved);
      if (!resolved.fogged) state.discoveredTiles.add(updateKey);
      if (
        settlementProgressForTile(update.x, update.y) &&
        (resolved.ownerId !== state.me || (resolved.ownershipState !== "FRONTIER" && resolved.ownershipState !== "SETTLED"))
      ) {
        clearSettlementProgressForTile(update.x, update.y);
      } else if (resolved.ownerId === state.me && resolved.ownershipState === "SETTLED") {
        clearSettlementProgressForTile(update.x, update.y);
      }
      if (
        !resolvedQueuedFrontierCapture &&
        updateKey === state.actionTargetKey &&
        state.actionInFlight &&
        resolved.ownerId === state.me &&
        resolved.ownershipState === "FRONTIER"
      ) {
        resolvedQueuedFrontierCapture = true;
      }
    }
    if (resolvedQueuedFrontierCapture) {
      const resolvedCurrentKey = state.actionCurrent ? key(state.actionCurrent.x, state.actionCurrent.y) : "";
      state.capture = undefined;
      if (state.pendingCombatReveal?.targetKey === state.actionTargetKey) state.pendingCombatReveal = undefined;
      state.actionInFlight = false;
      state.combatStartAck = false;
      state.actionStartedAt = 0;
      if (state.actionTargetKey) dropQueuedTargetKeyIfAbsent(state.actionTargetKey);
      if (state.actionTargetKey) clearOptimisticTileState(state.actionTargetKey);
      if (resolvedCurrentKey) dropQueuedTargetKeyIfAbsent(resolvedCurrentKey);
      if (resolvedCurrentKey) clearOptimisticTileState(resolvedCurrentKey);
      state.actionTargetKey = "";
      state.actionCurrent = undefined;
      processActionQueue();
      renderHud();
    }
  }
  if (msg.type === "TECH_UPDATE") {
    console.info("[tech] TECH_UPDATE received", {
      status: msg.status,
      techRootId: msg.techRootId,
      ownedTechs: (msg.techIds as string[])?.length ?? 0,
      nextChoices: (msg.nextChoices as string[])?.length ?? 0
    });
    const status = msg.status as "started" | "completed" | undefined;
    state.techRootId = msg.techRootId as string | undefined;
    state.currentResearch = (msg.currentResearch as typeof state.currentResearch | undefined) ?? undefined;
    state.pendingTechUnlockId = state.currentResearch?.techId ?? "";
    state.techIds = (msg.techIds as string[]) ?? [];
    state.techChoices = (msg.nextChoices as string[]) ?? [];
    state.availableTechPicks = (msg.availableTechPicks as number) ?? state.availableTechPicks;
    state.mods = (msg.mods as typeof state.mods) ?? state.mods;
    state.modBreakdown = (msg.modBreakdown as typeof state.modBreakdown | undefined) ?? state.modBreakdown;
    state.incomePerMinute = (msg.incomePerMinute as number) ?? state.incomePerMinute;
    state.missions = (msg.missions as MissionState[]) ?? state.missions;
    state.techCatalog = (msg.techCatalog as TechInfo[]) ?? state.techCatalog;
    state.domainIds = (msg.domainIds as string[]) ?? state.domainIds;
    state.domainChoices = (msg.domainChoices as string[]) ?? state.domainChoices;
    state.domainCatalog = (msg.domainCatalog as DomainInfo[]) ?? state.domainCatalog;
    state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
    state.activeRevealTargets = (msg.activeRevealTargets as string[]) ?? state.activeRevealTargets;
    if (status === "started" && state.currentResearch) {
      const startedTech = state.techCatalog.find((tech) => tech.id === state.currentResearch?.techId);
      pushFeed(
        `Research started: ${startedTech?.name ?? state.currentResearch.techId} (${formatCountdownClock(Math.max(0, state.currentResearch.completesAt - Date.now()))}).`,
        "tech",
        "info"
      );
    } else if (status === "completed") {
      const completedTech = state.techCatalog.find((tech) => tech.id === state.techIds[state.techIds.length - 1]);
      pushFeed(`Research completed: ${completedTech?.name ?? state.techIds[state.techIds.length - 1] ?? "unknown"}.`, "tech", "success");
    }
    renderHud();
  }
  if (msg.type === "DOMAIN_UPDATE") {
    state.domainIds = (msg.domainIds as string[]) ?? state.domainIds;
    state.domainChoices = (msg.domainChoices as string[]) ?? state.domainChoices;
    state.domainCatalog = (msg.domainCatalog as DomainInfo[]) ?? state.domainCatalog;
    state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
    state.activeRevealTargets = (msg.activeRevealTargets as string[]) ?? state.activeRevealTargets;
    state.mods = (msg.mods as typeof state.mods) ?? state.mods;
    state.modBreakdown = (msg.modBreakdown as typeof state.modBreakdown | undefined) ?? state.modBreakdown;
    state.incomePerMinute = (msg.incomePerMinute as number) ?? state.incomePerMinute;
    state.missions = (msg.missions as MissionState[]) ?? state.missions;
    pushFeed(`Domain chosen: ${state.domainIds[state.domainIds.length - 1] ?? "unknown"}`, "tech", "success");
    renderHud();
  }
  if (msg.type === "REVEAL_EMPIRE_UPDATE") {
    state.activeRevealTargets = (msg.activeTargets as string[]) ?? state.activeRevealTargets;
    state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
    renderHud();
  }
  if (msg.type === "ALLIANCE_REQUEST_INCOMING") {
    const request = (msg.request as AllianceRequest) ?? undefined;
    if (request) {
      const fromName = msg.fromName as string | undefined;
      if (fromName) request.fromName = fromName;
      state.incomingAllianceRequests.push(request);
    }
    pushFeed(`Incoming alliance request${request?.fromName ? ` from ${request.fromName}` : ""}`, "alliance", "info");
    renderHud();
  }
  if (msg.type === "ALLIANCE_REQUESTED") {
    const request = msg.request as AllianceRequest | undefined;
    const targetName =
      (msg.targetName as string | undefined) ??
      request?.toName ??
      (request ? playerNameForOwner(request.toPlayerId) : undefined);
    pushFeed(`Alliance request sent${targetName ? ` to ${targetName}` : ""}`, "alliance", "success");
    renderHud();
  }
  if (msg.type === "ALLIANCE_UPDATE") {
    state.allies = (msg.allies as string[]) ?? [];
    pushFeed(`Alliances updated (${state.allies.length})`, "alliance", "info");
    renderHud();
  }
  if (msg.type === "SEASON_VICTORY_UPDATE") {
    state.seasonVictory = (msg.objectives as SeasonVictoryObjectiveView[]) ?? state.seasonVictory;
    state.seasonWinner = (msg.seasonWinner as SeasonWinnerView | undefined) ?? state.seasonWinner;
    const announcement = msg.announcement as string | undefined;
    if (announcement) pushFeed(announcement, "info", "warn");
    renderHud();
  }
  if (msg.type === "SEASON_WINNER_CROWNED") {
    state.seasonWinner = (msg.winner as SeasonWinnerView | undefined) ?? state.seasonWinner;
    state.seasonVictory = (msg.objectives as SeasonVictoryObjectiveView[] | undefined) ?? state.seasonVictory;
    state.leaderboard = (msg.leaderboard as typeof state.leaderboard | undefined) ?? state.leaderboard;
    if (state.seasonWinner) {
      pushFeed(`${state.seasonWinner.playerName} was crowned season winner via ${state.seasonWinner.objectiveName}.`, "info", "warn");
      state.activePanel = "leaderboard";
    }
    renderHud();
  }
  if (msg.type === "ERROR") {
    if ((msg.code as string | undefined)?.startsWith("COLLECT")) {
      state.pendingCollectVisibleKeys.clear();
      revertOptimisticVisibleCollectDelta();
      const collectTileKey = typeof msg.x === "number" && typeof msg.y === "number" ? key(Number(msg.x), Number(msg.y)) : "";
      if (collectTileKey) revertOptimisticTileCollectDelta(collectTileKey);
    }
    const failedTargetKey = state.actionTargetKey;
    console.error("[server-error]", {
      code: msg.code,
      message: msg.message,
      actionInFlight: state.actionInFlight,
      actionTargetKey: failedTargetKey,
      queuedActions: state.actionQueue.length,
      selected: state.selected,
      hover: state.hover
    });
    const errorCode = String(msg.code ?? "");
    const errorMessage = String(msg.message ?? "unknown failure");
    if (errorCode.startsWith("TECH_") && state.pendingTechUnlockId) {
      state.pendingTechUnlockId = "";
      state.currentResearch = undefined;
    }
    const errorTileKey =
      typeof msg.x === "number" && typeof msg.y === "number" ? key(Number(msg.x), Number(msg.y)) : state.latestSettleTargetKey;
    if (errorCode === "AUTH_FAIL" || errorCode === "NO_AUTH" || errorCode === "AUTH_UNAVAILABLE" || errorCode === "SERVER_STARTING") {
      state.authSessionReady = false;
      if ((errorCode === "AUTH_UNAVAILABLE" || errorCode === "SERVER_STARTING") && firebaseAuth?.currentUser) {
        scheduleAuthReconnect(
          errorCode === "SERVER_STARTING"
            ? "Game server is still starting. Retrying sign-in..."
            : "Google account connected. Waiting for the game server to finish authorizing..."
        );
        return;
      }
      if (errorCode === "AUTH_FAIL" && firebaseAuth?.currentUser && !state.authRetrying) {
        state.authBusy = true;
        state.authRetrying = true;
        setAuthStatus("Refreshing Firebase session...");
        syncAuthOverlay();
        void authenticateSocket(true)
          .catch(() => {
            state.authBusy = false;
            state.authRetrying = false;
            setAuthStatus(errorMessage, "error");
            syncAuthOverlay();
          });
        renderHud();
        return;
      }
      state.authBusy = false;
      state.authRetrying = false;
      setAuthStatus(errorMessage, "error");
      syncAuthOverlay();
    }
    const isStructureActionError =
      errorCode === "FORT_BUILD_INVALID" ||
      errorCode === "OBSERVATORY_BUILD_INVALID" ||
      errorCode === "SIEGE_OUTPOST_BUILD_INVALID" ||
      errorCode === "ECONOMIC_STRUCTURE_BUILD_INVALID" ||
      errorCode === "STRUCTURE_CANCEL_INVALID";
    if (errorCode === "INSUFFICIENT_GOLD" && failedTargetKey) {
      notifyInsufficientGoldForFrontierAction(errorMessage === "insufficient gold for frontier claim" ? "claim" : "attack");
    } else if (errorCode === "SETTLE_INVALID") {
      clearOptimisticTileState(errorTileKey, true);
      clearSettlementProgressByKey(errorTileKey);
      showCaptureAlert("Action failed", errorMessage, "warn");
    } else if (isStructureActionError && errorTileKey) {
      clearOptimisticTileState(errorTileKey, true);
      showCaptureAlert("Construction failed", errorMessage, "warn");
    } else if (errorCode === "TOWN_UNFED") {
      showCaptureAlert("Town unfed", errorMessage, "warn");
    }
    if (errorCode === "COLLECT_EMPTY") {
      pushFeed(`Nothing to collect on this tile yet: ${errorMessage}.`, "info", "warn");
    } else if (errorCode === "COLLECT_COOLDOWN") {
      if (state.collectVisibleCooldownUntil <= Date.now()) state.collectVisibleCooldownUntil = Date.now() + COLLECT_VISIBLE_COOLDOWN_MS;
      showCollectVisibleCooldownAlert();
      pushFeed(`Collect visible cooling down for ${formatCooldownShort(state.collectVisibleCooldownUntil - Date.now())}.`, "info", "warn");
    } else if (errorCode === "TOWN_UNFED") {
      pushFeed(errorMessage, "info", "warn");
    } else {
      pushFeed(explainActionFailure(errorCode, errorMessage), "error", "error");
    }
    // LOCKED while we already have an in-flight action is expected occasionally due rapid queue overlap.
    if (errorCode === "LOCKED" && state.actionInFlight) {
      renderHud();
      return;
    }
    const frontierActionError =
      errorCode === "ACTION_INVALID" ||
      errorCode === "NOT_ADJACENT" ||
      errorCode === "NOT_OWNER" ||
      errorCode === "EXPAND_TARGET_OWNED";
    const failedCurrentKey = state.actionCurrent ? key(state.actionCurrent.x, state.actionCurrent.y) : "";
    state.capture = undefined;
    if (state.pendingCombatReveal?.targetKey === failedCurrentKey) state.pendingCombatReveal = undefined;
    state.actionInFlight = false;
    state.combatStartAck = false;
    state.actionStartedAt = 0;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    if (failedCurrentKey) dropQueuedTargetKeyIfAbsent(failedCurrentKey);
    if (failedCurrentKey) clearOptimisticTileState(failedCurrentKey, true);
    if (failedTargetKey) clearOptimisticTileState(failedTargetKey, true);
    if (failedTargetKey) state.autoSettleTargets.delete(failedTargetKey);
    state.attackPreviewPendingKey = "";
    if (frontierActionError) requestViewRefresh(2, true);
    reconcileActionQueue();
    processActionQueue();
    renderHud();
  }
  if (msg.type === "ATTACK_PREVIEW_RESULT") {
    const from = msg.from as { x: number; y: number };
    const to = msg.to as { x: number; y: number };
    const preview: {
      fromKey: string;
      toKey: string;
      valid: boolean;
      reason?: string;
      winChance?: number;
      breakthroughWinChance?: number;
      atkEff?: number;
      defEff?: number;
      defenseEffPct?: number;
    } = {
      fromKey: key(from.x, from.y),
      toKey: key(to.x, to.y),
      valid: Boolean(msg.valid)
    };
    const reason = msg.reason as string | undefined;
    const winChance = msg.winChance as number | undefined;
    const breakthroughWinChance = msg.breakthroughWinChance as number | undefined;
    const atkEff = msg.atkEff as number | undefined;
    const defEff = msg.defEff as number | undefined;
    const defMult = msg.defMult as number | undefined;
    if (reason) preview.reason = reason;
    if (typeof winChance === "number") preview.winChance = winChance;
    if (typeof breakthroughWinChance === "number") preview.breakthroughWinChance = breakthroughWinChance;
    if (typeof atkEff === "number") preview.atkEff = atkEff;
    if (typeof defEff === "number") preview.defEff = defEff;
    if (typeof defMult === "number") preview.defenseEffPct = Math.max(0, Math.min(100, defMult * 100));
    state.attackPreview = preview;
    state.attackPreviewPendingKey = "";
    if (state.tileActionMenu.visible && state.tileActionMenu.mode === "single" && state.tileActionMenu.currentTileKey) {
      const selectedTile = state.tiles.get(state.tileActionMenu.currentTileKey);
      if (selectedTile && selectedTile.ownerId && selectedTile.ownerId !== state.me && !isTileOwnedByAlly(selectedTile)) {
        openSingleTileActionMenu(selectedTile, state.tileActionMenu.x, state.tileActionMenu.y);
      }
    }
    renderHud();
  }
  if (msg.type === "PLAYER_STYLE") {
    const pid = msg.playerId as string;
    const color = msg.tileColor as string | undefined;
    const visualStyle = msg.visualStyle as EmpireVisualStyle | undefined;
    if (pid && color) {
      state.playerColors.set(pid, color);
      if (pid === state.me) authProfileColorEl.value = color;
    }
    if (pid && visualStyle) state.playerVisualStyles.set(pid, visualStyle);
  }
  if (msg.type === "COLLECT_RESULT") {
    state.pendingCollectVisibleKeys.clear();
    if ((msg.mode as string | undefined) === "visible") clearPendingCollectVisibleDelta();
    if ((msg.mode as string | undefined) === "tile" && typeof msg.x === "number" && typeof msg.y === "number") {
      clearPendingCollectTileDelta(key(Number(msg.x), Number(msg.y)));
    }
    const gold = Number(msg.gold ?? 0);
    const strategic = (msg.strategic as Record<string, number> | undefined) ?? {};
    const strategicParts = Object.entries(strategic)
      .filter(([, v]) => Number(v) > 0)
      .map(([k, v]) => `${Number(v).toFixed(1)} ${k}`);
    const bits: string[] = [];
    if (gold > 0) bits.push(`${gold.toFixed(1)} gold`);
    bits.push(...strategicParts);
    pushFeed(bits.length > 0 ? `Collected ${bits.join(", ")}.` : "No collectable yield.", "info", bits.length > 0 ? "success" : "warn");
    renderHud();
  }
  if (msg.type === "SEASON_ROLLOVER") {
    state.seasonWinner = undefined;
    state.seasonVictory = [];
    const season = msg.season as { worldSeed?: number } | undefined;
    if (typeof season?.worldSeed === "number") {
      setWorldSeed(season.worldSeed);
      clearRenderCaches();
      buildMiniMapBase();
    }
    state.tiles.clear();
    state.mapLoadStartedAt = Date.now();
    state.firstChunkAt = 0;
    state.chunkFullCount = 0;
    state.hasOwnedTileInCache = false;
    state.dockRouteCache.clear();
    pushFeed("Season rolled over. World and progression reset.", "info", "warn");
    requestViewRefresh();
    renderHud();
  }
  if (msg.type === "WORLD_REGENERATED") {
    const season = msg.season as { worldSeed?: number } | undefined;
    if (typeof season?.worldSeed === "number") {
      setWorldSeed(season.worldSeed);
      clearRenderCaches();
      buildMiniMapBase();
    }
    state.tiles.clear();
    state.mapLoadStartedAt = Date.now();
    state.firstChunkAt = 0;
    state.chunkFullCount = 0;
    state.hasOwnedTileInCache = false;
    state.dockRouteCache.clear();
    pushFeed("World regenerated by admin. Fresh map loaded.", "info", "warn");
    requestViewRefresh();
    renderHud();
  }
});

state.authConfigured = Boolean(firebaseAuth);
syncAuthOverlay();

if (firebaseAuth) {
  void setPersistence(firebaseAuth, browserLocalPersistence);
  onAuthStateChanged(firebaseAuth, async (user) => {
    if (!user) {
      state.authReady = false;
      state.authSessionReady = false;
      state.authUserLabel = "";
      state.profileSetupRequired = false;
      authToken = "";
      authUid = "";
      state.authBusy = false;
      state.authRetrying = false;
      authProfileNameEl.value = "";
      authProfileColorEl.value = "#38b000";
      syncAuthOverlay();
      return;
    }
    authEmailLinkSentTo = "";
    state.authReady = true;
    state.authSessionReady = false;
    state.authBusy = true;
    state.authRetrying = false;
    state.authUserLabel = authLabelForUser(user);
    seedProfileSetupFields(user.displayName ?? user.email?.split("@")[0] ?? "", authProfileColorEl.value);
    setAuthStatus("Authorizing empire...");
    syncAuthOverlay();
    try {
      authToken = await user.getIdToken(true);
      authUid = user.uid;
      setAuthStatus(`Connected to the game server. Syncing ${state.authUserLabel}...`);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "AUTH", token: authToken }));
      } else {
        state.authBusy = true;
        setAuthStatus(`Google account connected. Waiting for the game server at ${wsUrl}...`);
      }
    } catch (error) {
      state.authSessionReady = false;
      state.authBusy = false;
      setAuthStatus(error instanceof Error ? error.message : "Could not authorize this session.", "error");
    } finally {
      syncAuthOverlay();
      renderHud();
    }
  });
}

const authEmailAndPassword = async (mode: "login" | "register"): Promise<void> => {
  if (!firebaseAuth) return;
  const email = authEmailEl.value.trim();
  const password = authPasswordEl.value;
  const displayName = authDisplayNameEl.value.trim();
  if (!email || !password) {
    setAuthStatus("Email and password are required.", "error");
    syncAuthOverlay();
    return;
  }
  if (mode === "register" && !displayName) {
    setAuthStatus("Display name is required for new accounts.", "error");
    syncAuthOverlay();
    return;
  }
  state.authBusy = true;
  setAuthStatus(mode === "login" ? "Signing in..." : "Creating account...");
  syncAuthOverlay();
  let authSucceeded = false;
  try {
    if (mode === "login") {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    } else {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      if (displayName) await updateProfile(cred.user, { displayName });
    }
    authSucceeded = true;
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "Authentication failed.", "error");
  } finally {
    if (!authSucceeded) state.authBusy = false;
    syncAuthOverlay();
  }
};

authLoginBtn.onclick = () => {
  void authEmailAndPassword("login");
};

authRegisterBtn.onclick = () => {
  void authEmailAndPassword("register");
};

authGoogleBtn.onclick = async () => {
  if (!firebaseAuth || !googleProvider) return;
  authEmailLinkSentTo = "";
  state.authBusy = true;
  setAuthStatus("Opening Google sign-in...");
  syncAuthOverlay();
  let authSucceeded = false;
  try {
    await signInWithPopup(firebaseAuth, googleProvider);
    authSucceeded = true;
    setAuthStatus("Google sign-in complete. Authorizing empire...");
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "Google sign-in failed.", "error");
  } finally {
    if (!authSucceeded) state.authBusy = false;
    syncAuthOverlay();
  }
};

authEmailLinkBtn.onclick = async () => {
  if (!firebaseAuth) return;
  const email = authEmailEl.value.trim();
  if (authEmailLinkPending && isSignInWithEmailLink(firebaseAuth, window.location.href)) {
    await completeEmailLinkSignIn(email);
    return;
  }
  if (!email) {
    setAuthStatus("Enter your email first.", "error");
    syncAuthOverlay();
    return;
  }
  state.authBusy = true;
  setAuthStatus("Sending sign-in link...");
  syncAuthOverlay();
  try {
    await sendSignInLinkToEmail(firebaseAuth, email, {
      url: window.location.href,
      handleCodeInApp: true
    });
    window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, email);
    authEmailLinkSentTo = email;
    setAuthStatus("");
  } catch (error) {
    authEmailLinkSentTo = "";
    setAuthStatus(error instanceof Error ? error.message : "Could not send email link.", "error");
  } finally {
    state.authBusy = false;
    syncAuthOverlay();
  }
};

authEmailResetBtn.onclick = () => {
  authEmailLinkSentTo = "";
  setAuthStatus("");
  authEmailEl.focus();
  syncAuthOverlay();
};

authProfileSaveBtn.onclick = async () => {
  if (!requireAuthedSession("Connection lost. Reconnect before finishing setup.")) {
    syncAuthOverlay();
    return;
  }
  const displayName = authProfileNameEl.value.trim();
  if (displayName.length < 2) {
    setAuthStatus("Display name must be at least 2 characters.", "error");
    syncAuthOverlay();
    return;
  }
  state.authBusy = true;
  setAuthStatus("Raising your banner...");
  syncAuthOverlay();
  try {
    ws.send(JSON.stringify({ type: "SET_PROFILE", displayName, color: authProfileColorEl.value }));
    if (firebaseAuth?.currentUser && firebaseAuth.currentUser.displayName !== displayName) {
      await updateProfile(firebaseAuth.currentUser, { displayName });
    }
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "Could not save your empire profile.", "error");
  } finally {
    state.authBusy = false;
    syncAuthOverlay();
  }
};

if (firebaseAuth && isSignInWithEmailLink(firebaseAuth, window.location.href)) {
  const storedEmail = window.localStorage.getItem(EMAIL_LINK_STORAGE_KEY) ?? authEmailEl.value.trim();
  if (storedEmail) {
    void completeEmailLinkSignIn(storedEmail);
  } else {
    authEmailLinkPending = true;
    authEmailLinkSentTo = "";
    setAuthStatus("Enter the email address that received the sign-in link, then press Continue with Email.");
    syncAuthOverlay();
  }
}

let lastDrawAt = 0;
const draw = (): void => {
  const nowMs = performance.now();
  const minFrameGap = isMobile() ? 40 : 24;
  if (nowMs - lastDrawAt < minFrameGap) {
    requestAnimationFrame(draw);
    return;
  }
  lastDrawAt = nowMs;

  ctx.fillStyle = "#0b1320";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const size = state.zoom;
  const halfW = Math.floor(canvas.width / size / 2);
  const halfH = Math.floor(canvas.height / size / 2);
  const dockEndpointKeys = new Set<string>();
  for (const pair of state.dockPairs) {
    dockEndpointKeys.add(key(pair.ax, pair.ay));
    dockEndpointKeys.add(key(pair.bx, pair.by));
  }
  const crystalTargetingActive = state.crystalTargeting.active;
  const crystalTone = crystalTargetingActive ? crystalTargetingTone(state.crystalTargeting.ability) : "amber";
  const queueIndex = new Map<string, number>();
  const startingArrowTargets = new Map(
    startingExpansionArrowTargets().map((target) => [key(target.x, target.y), target] as const)
  );
  let queueOffset = 0;
  if (state.actionInFlight && state.actionTargetKey) {
    queueIndex.set(state.actionTargetKey, 1);
    queueOffset = 1;
  }
  for (let i = 0; i < state.actionQueue.length; i += 1) {
    const q = state.actionQueue[i];
    if (!q) continue;
    queueIndex.set(key(q.x, q.y), i + 1 + queueOffset);
  }
  const firstCaptureTarget = firstCaptureGuidanceTarget();

  for (let y = -halfH; y <= halfH; y += 1) {
    for (let x = -halfW; x <= halfW; x += 1) {
      const wx = wrapX(state.camX + x);
      const wy = wrapY(state.camY + y);
      const wk = key(wx, wy);
      const t = state.tiles.get(key(wx, wy));
      const settlementProgress = t ? settlementProgressForTile(wx, wy) : undefined;
      const vis = tileVisibilityStateAt(wx, wy, t);
      const px = (x + halfW) * size;
      const py = (y + halfH) * size;
      let ownerAlpha = 1;

      if (vis === "unexplored") {
        ctx.fillStyle = "#06090f";
        ctx.fillRect(px, py, size - 1, size - 1);
      } else if (!t) {
        if (state.firstChunkAt === 0 || state.fogDisabled) {
          const tt = terrainAt(wx, wy);
          drawTerrainTile(wx, wy, tt, px, py, size);
        } else {
          ctx.fillStyle = "#06090f";
          ctx.fillRect(px, py, size - 1, size - 1);
        }
      } else if (vis === "fogged") {
        drawTerrainTile(wx, wy, t.terrain, px, py, size);
        ctx.fillStyle = "rgba(2, 5, 10, 0.72)";
        ctx.fillRect(px, py, size - 1, size - 1);
      } else if (t.terrain === "SEA" || t.terrain === "MOUNTAIN") {
        drawTerrainTile(wx, wy, t.terrain, px, py, size);
      } else {
        drawTerrainTile(wx, wy, "LAND", px, py, size);
      }

      if (t && vis === "visible" && t.terrain === "LAND") drawForestOverlay(wx, wy, px, py, size);

      // Render ownership on top of land terrain so frontier tiles stay subtle and biome remains visible.
      if (t && vis === "visible" && t.terrain === "LAND" && t.ownerId) {
        ctx.fillStyle = effectiveOverlayColor(t.ownerId);
        ownerAlpha = t.ownershipState === "FRONTIER" ? 0.2 : 0.92;
        if (typeof t.breachShockUntil === "number" && t.breachShockUntil > Date.now()) {
          ownerAlpha = Math.min(ownerAlpha, 0.62);
        }
        ctx.globalAlpha = ownerAlpha;
        if (t.ownershipState === "SETTLED") {
          ctx.fillRect(px, py, size, size);
        } else {
          ctx.fillRect(px, py, size - 1, size - 1);
        }
        ctx.globalAlpha = 1;
      }

      const isDockEndpoint = dockEndpointKeys.has(wk);
      const dockVisible = (!t && state.fogDisabled) || vis === "visible";
      if (dockVisible && isDockEndpoint) {
        const dockOverlay = dockOverlayVariants[overlayVariantIndexAt(wx, wy, dockOverlayVariants.length)];
        if (dockOverlay?.complete && dockOverlay.naturalWidth) drawCenteredOverlay(dockOverlay, px, py, size, 1.14);
        else {
          ctx.fillStyle = "rgba(12, 22, 38, 0.42)";
          ctx.fillRect(px + 1, py + 1, size - 3, size - 3);
          ctx.strokeStyle = "rgba(115, 225, 255, 0.98)";
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
          ctx.strokeStyle = "rgba(214, 247, 255, 0.95)";
          ctx.beginPath();
          ctx.moveTo(px + size / 2, py + 3);
          ctx.lineTo(px + size / 2, py + size - 3);
          ctx.moveTo(px + 3, py + size / 2);
          ctx.lineTo(px + size - 3, py + size / 2);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      }

      if (t && vis === "visible" && t.resource && t.terrain === "LAND") {
        const overlay = builtResourceOverlayForTile(t) ?? resourceOverlayForTile(t);
        if (overlay?.complete && overlay.naturalWidth) {
          const alpha = builtResourceOverlayForTile(t) ? economicStructureOverlayAlpha(t) : 1;
          drawCenteredOverlayWithAlpha(overlay, px, py, size, resourceOverlayScaleForTile(t), alpha);
          drawResourceCornerMarker(t, px, py, size);
        } else {
          const rc = resourceColor(t.resource);
          if (!rc) continue;
          const marker = Math.max(3, Math.floor(size * 0.22));
          const mx = px + Math.floor((size - marker) / 2);
          const my = py + Math.floor((size - marker) / 2);
          ctx.fillStyle = "rgba(12, 16, 28, 0.7)";
          ctx.fillRect(mx - 1, my - 1, marker + 2, marker + 2);
          ctx.fillStyle = rc;
          ctx.fillRect(mx, my, marker, marker);
          drawResourceCornerMarker(t, px, py, size);
        }
      }

      if (t && vis === "visible" && t.town && t.terrain === "LAND") {
        drawTownOverlay(t, px, py, size);
      }

      if (t && vis === "visible" && t.ownerId === state.me && t.ownershipState === "SETTLED" && hasCollectableYield(t)) {
        const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(nowMs / 230));
        const marker = Math.max(4, Math.floor(size * 0.22));
        const mx = px + 3;
        const my = py + 3;
        ctx.fillStyle = `rgba(15, 18, 28, ${0.68 + pulse * 0.18})`;
        ctx.fillRect(mx - 1, my - 1, marker + 2, marker + 2);
        ctx.fillStyle = `rgba(255, 220, 90, ${0.75 + pulse * 0.25})`;
        ctx.fillRect(mx, my, marker, marker);
      }

      if (t && vis === "visible" && t.fort) {
        ctx.fillStyle = structureAccentColor(t.ownerId ?? "", t.fort.status === "active" ? "rgba(239,71,111,0.8)" : "rgba(255,209,102,0.75)");
        const dot = Math.max(3, Math.floor(size * 0.25));
        ctx.fillRect(px + size - dot - 2, py + 2, dot, dot);
      }
      if (t && vis === "visible" && t.siegeOutpost) {
        ctx.fillStyle = structureAccentColor(t.ownerId ?? "", t.siegeOutpost.status === "active" ? "rgba(255, 123, 0, 0.85)" : "rgba(255, 196, 122, 0.78)");
        const dot = Math.max(3, Math.floor(size * 0.25));
        ctx.fillRect(px + size - dot - 2, py + size - dot - 2, dot, dot);
      }
      if (t && vis === "visible" && t.observatory) {
        const overlay = structureOverlayImages.OBSERVATORY;
        if (overlay.complete && overlay.naturalWidth) drawCenteredOverlay(overlay, px, py, size, 1.02);
        else {
          ctx.strokeStyle = structureAccentColor(t.ownerId ?? "", t.observatory.status === "active" ? "rgba(122, 214, 255, 0.92)" : "rgba(122, 214, 255, 0.42)");
          ctx.beginPath();
          ctx.arc(px + size / 2, py + size / 2, Math.max(3, size * 0.22), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      if (t && vis === "visible" && t.economicStructure) {
        const markerSize = Math.max(3, Math.floor(size * 0.2));
        const active = t.economicStructure.status === "active";
        const hasBuiltResourceOverlay = Boolean(builtResourceOverlayForTile(t));
        if ((t.economicStructure.type === "MARKET" || t.economicStructure.type === "GRANARY")) {
          const overlay = t.economicStructure.type === "MARKET" ? structureOverlayImages.MARKET : structureOverlayImages.GRANARY;
          if (overlay.complete && overlay.naturalWidth) {
            drawCenteredOverlay(overlay, px, py, size, 1.02);
          }
        } else if (t.economicStructure.type === "FARMSTEAD" && !hasBuiltResourceOverlay) {
          ctx.fillStyle = structureAccentColor(t.ownerId ?? "", active ? "rgba(192, 229, 117, 0.95)" : "rgba(148, 176, 104, 0.72)");
          ctx.fillRect(px + 2, py + size - markerSize - 2, markerSize + 1, markerSize);
        } else if (t.economicStructure.type === "CAMP" && !hasBuiltResourceOverlay) {
          ctx.fillStyle = structureAccentColor(t.ownerId ?? "", active ? "rgba(222, 174, 108, 0.95)" : "rgba(171, 134, 86, 0.74)");
          ctx.beginPath();
          ctx.moveTo(px + size / 2, py + 3);
          ctx.lineTo(px + size - 4, py + markerSize + 4);
          ctx.lineTo(px + 4, py + markerSize + 4);
          ctx.closePath();
          ctx.fill();
        } else if (t.economicStructure.type === "MINE" && !hasBuiltResourceOverlay) {
          ctx.fillStyle = structureAccentColor(t.ownerId ?? "", active ? "rgba(188, 197, 214, 0.96)" : "rgba(120, 130, 148, 0.74)");
          ctx.fillRect(px + 2, py + 2, markerSize + 1, markerSize + 1);
        } else {
          ctx.strokeStyle = structureAccentColor(t.ownerId ?? "", active ? "rgba(255, 212, 111, 0.96)" : "rgba(191, 162, 102, 0.72)");
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 2, py + 2, markerSize + 2, markerSize + 2);
          ctx.lineWidth = 1;
        }
      }
      if (t && vis === "visible" && t.terrain === "LAND") {
        const remainingConstructionMs = constructionRemainingMsForTile(t);
        if (remainingConstructionMs !== undefined && size >= 18) {
          const timerLabel = formatCountdownClock(remainingConstructionMs);
          ctx.fillStyle = "rgba(6, 10, 18, 0.82)";
          ctx.fillRect(px + 2, py + size - 12, Math.min(size - 4, 30), 10);
          ctx.fillStyle = "rgba(236, 243, 255, 0.92)";
          ctx.font = "9px monospace";
          ctx.textBaseline = "top";
          ctx.fillText(timerLabel, px + 4, py + size - 11);
        }
      }
      if (t && vis === "visible" && t.sabotage && t.sabotage.endsAt > Date.now()) {
        ctx.strokeStyle = "rgba(255, 83, 83, 0.92)";
        ctx.beginPath();
        ctx.moveTo(px + 3, py + 3);
        ctx.lineTo(px + size - 3, py + size - 3);
        ctx.moveTo(px + size - 3, py + 3);
        ctx.lineTo(px + 3, py + size - 3);
        ctx.stroke();
      }

      if (crystalTargetingActive && t && vis === "visible" && state.crystalTargeting.validTargets.has(wk)) {
        const fill =
          crystalTone === "amber"
            ? "rgba(255, 187, 72, 0.12)"
            : crystalTone === "cyan"
              ? "rgba(113, 223, 255, 0.13)"
              : "rgba(255, 100, 100, 0.12)";
        const stroke =
          crystalTone === "amber"
            ? "rgba(255, 201, 102, 0.88)"
            : crystalTone === "cyan"
              ? "rgba(116, 227, 255, 0.9)"
              : "rgba(255, 110, 110, 0.88)";
        ctx.fillStyle = fill;
        ctx.fillRect(px + 1, py + 1, size - 3, size - 3);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
        ctx.lineWidth = 1;
      }

      if (t && vis === "visible" && t.terrain === "LAND" && !t.ownerId) {
        ctx.strokeStyle = "rgba(20, 26, 36, 0.58)";
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      }

      const startingArrow = startingArrowTargets.get(wk);
      if (startingArrow && !settlementProgress && queueIndex.get(wk) === undefined) {
        drawStartingExpansionArrow(px, py, size, startingArrow.dx, startingArrow.dy);
      }

      if (t && vis === "visible" && t.ownerId === "barbarian") {
        drawBarbarianSkullOverlay(px, py, size);
      }

      if (t && vis === "visible" && shouldDrawOwnershipBorder(t)) {
        const ownerId = t.ownerId!;
        ctx.strokeStyle =
          ownerId === "barbarian"
            ? "rgba(214, 222, 232, 0.45)"
            : ownerId === state.me
              ? borderColorForOwner(ownerId, t.ownershipState)
              : isTileOwnedByAlly(t)
                ? "rgba(255, 205, 92, 0.82)"
                : borderColorForOwner(ownerId, t.ownershipState);
        ctx.lineWidth = borderLineWidthForOwner(ownerId, t.ownershipState);
        if (visualStyleForOwner(ownerId)?.borderStyle === "DASHED") ctx.setLineDash([4, 3]);
        else if (visualStyleForOwner(ownerId)?.borderStyle === "SOFT") ctx.setLineDash([10, 6]);
        else ctx.setLineDash([]);
        drawExposedTileBorder(t, px, py, size);
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
      }
      if (state.showWeakDefensibility && t && vis === "visible" && t.ownerId === state.me && t.terrain === "LAND" && t.ownershipState === "SETTLED" && !t.fogged) {
        const exposedSides = exposedSidesForTile(t);
        if (exposedSides.length >= 2) {
          const critical = exposedSides.length >= 3;
          ctx.strokeStyle = critical ? "rgba(255, 84, 84, 0.92)" : "rgba(255, 173, 92, 0.88)";
          ctx.lineWidth = critical ? 3 : 2;
          ctx.beginPath();
          if (exposedSides.includes("north")) {
            ctx.moveTo(px + 1, py + 2);
            ctx.lineTo(px + size - 1, py + 2);
          }
          if (exposedSides.includes("east")) {
            ctx.moveTo(px + size - 2, py + 1);
            ctx.lineTo(px + size - 2, py + size - 1);
          }
          if (exposedSides.includes("south")) {
            ctx.moveTo(px + 1, py + size - 2);
            ctx.lineTo(px + size - 1, py + size - 2);
          }
          if (exposedSides.includes("west")) {
            ctx.moveTo(px + 2, py + 1);
            ctx.lineTo(px + 2, py + size - 1);
          }
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      }

      if (t && vis === "visible" && typeof t.breachShockUntil === "number" && t.breachShockUntil > Date.now() && t.ownerId) {
        ctx.strokeStyle = "rgba(255,255,255,0.52)";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
        ctx.lineWidth = 1;
      }

      if (state.selected && state.selected.x === wx && state.selected.y === wy) {
        if (t?.ownerId === state.me && t.ownershipState === "SETTLED") {
          ctx.fillStyle = "rgba(255, 209, 102, 0.18)";
          ctx.fillRect(px, py, size, size);
        } else {
          ctx.strokeStyle = "#ffd166";
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 1, py + 1, size - 3, size - 3);
          ctx.lineWidth = 1;
        }
      } else if (state.selected) {
        const selected = state.tiles.get(key(state.selected.x, state.selected.y));
      if (selected?.town && isTownSupportNeighbor(wx, wy, state.selected.x, state.selected.y) && isTownSupportHighlightableTile(t)) {
        if (t?.terrain !== "LAND") {
          ctx.strokeStyle = "rgba(92, 103, 127, 0.7)";
        } else if (!t?.ownerId) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
          } else if (t.ownerId !== state.me) {
            ctx.strokeStyle = "rgba(255, 98, 98, 0.65)";
          } else if (t.ownershipState === "SETTLED") {
            ctx.strokeStyle = "rgba(155, 242, 116, 0.88)";
          } else {
            ctx.strokeStyle = "rgba(255, 205, 92, 0.82)";
          }
          if (t?.ownerId === state.me && t.ownershipState === "SETTLED") {
            ctx.fillStyle = "rgba(155, 242, 116, 0.12)";
            ctx.fillRect(px, py, size, size);
          } else {
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
            ctx.lineWidth = 1;
          }
        }
      }
      if (firstCaptureTarget && firstCaptureTarget.tile.x === wx && firstCaptureTarget.tile.y === wy && vis === "visible") {
        const pulse = 0.58 + 0.42 * (0.5 + 0.5 * Math.sin(Date.now() / 260));
        ctx.fillStyle = `rgba(81, 224, 113, ${0.06 + pulse * 0.08})`;
        ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
        ctx.strokeStyle = `rgba(140, 255, 167, ${0.66 + pulse * 0.2})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
        ctx.lineWidth = 1;
      }
      if (state.hover && state.hover.x === wx && state.hover.y === wy) {
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
      }
      const incomingAttack = state.incomingAttacksByTile.get(wk);
      if (incomingAttack) {
        if (incomingAttack.resolvesAt <= Date.now()) {
          state.incomingAttacksByTile.delete(wk);
        } else {
          drawIncomingAttackOverlay(wx, wy, px, py, size, incomingAttack.resolvesAt);
        }
      }
      if (settlementProgress) {
        const totalMs = Math.max(1, settlementProgress.resolvesAt - settlementProgress.startAt);
        const now = Date.now();
        const progress = Math.max(0, Math.min(1, (now - settlementProgress.startAt) / totalMs));
        const fillWidth = Math.max(2, Math.floor((size - 2) * progress));
        const ownerFill = t?.ownerId ? effectiveOverlayColor(t.ownerId) : "#ffd166";
        const pulse = 0.34 + 0.28 * (0.5 + 0.5 * Math.sin(now / 160));
        const darkPixelAlpha = (0.86 + pulse * 0.12).toFixed(3);
        ctx.fillStyle = `rgba(9, 14, 24, 0.28)`;
        ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
        ctx.fillStyle = ownerFill;
        ctx.globalAlpha = 0.16 + progress * 0.36;
        ctx.fillRect(px + 1, py + 1, fillWidth, size - 2);
        ctx.globalAlpha = 1;
        const pixelCount = isMobile() ? Math.max(10, Math.min(22, Math.floor(size * 0.78))) : Math.max(12, Math.min(28, Math.floor(size * 0.94)));
        const activePixels = Math.max(6, Math.round(4 + progress * pixelCount));
        const swarmInset = Math.max(1, Math.floor(size * 0.04));
        const swarmWidth = Math.max(3, size - swarmInset * 2);
        const pixelSize = size <= 10 ? 1 : 2;
        ctx.fillStyle = `rgba(6, 8, 12, ${darkPixelAlpha})`;
        for (let i = 0; i < activePixels; i += 1) {
          const point = settlePixelWanderPoint(now, wx, wy, i);
          const dotX = Math.floor(px + swarmInset + point.x * (swarmWidth - pixelSize));
          const dotY = Math.floor(py + swarmInset + point.y * (swarmWidth - pixelSize));
          ctx.fillRect(dotX, dotY, pixelSize, pixelSize);
        }
        ctx.strokeStyle = `rgba(255, 241, 185, ${0.68 + pulse * 0.16})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1.5, py + 1.5, size - 4, size - 4);
        ctx.lineWidth = 1;
      }

      if (state.dragPreviewKeys.has(wk)) {
        ctx.strokeStyle = "rgba(129, 230, 217, 0.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
        ctx.lineWidth = 1;
      }

      const queuedN = queueIndex.get(wk);
      if (queuedN !== undefined) {
        ctx.strokeStyle = "rgba(168, 139, 250, 0.95)";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, size - 3, size - 3);
        if (size >= 16) {
          ctx.fillStyle = "rgba(20, 16, 35, 0.85)";
          ctx.fillRect(px + 3, py + 3, Math.min(size - 6, 14), 12);
          ctx.fillStyle = "#c4b5fd";
          ctx.font = "10px monospace";
          ctx.textBaseline = "top";
          ctx.fillText(String(queuedN), px + 5, py + 4);
        }
        ctx.lineWidth = 1;
      }
    }
  }

  const selectedWorld = selectedTile();
  if (selectedWorld && selectedWorld.observatory) {
    const selectedVisibility = tileVisibilityStateAt(selectedWorld.x, selectedWorld.y, selectedWorld);
    if (selectedVisibility === "visible") {
      const center = worldToScreen(selectedWorld.x, selectedWorld.y, size, halfW, halfH);
      const ringRadius = OBSERVATORY_VISION_BONUS + 0.5;
      const squareSize = ringRadius * 2 * size;
      ctx.save();
      ctx.strokeStyle =
        selectedWorld.observatory.status === "active" ? "rgba(122, 214, 255, 0.55)" : "rgba(122, 214, 255, 0.28)";
      ctx.fillStyle =
        selectedWorld.observatory.status === "active" ? "rgba(122, 214, 255, 0.05)" : "rgba(122, 214, 255, 0.025)";
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(center.sx - squareSize / 2, center.sy - squareSize / 2, squareSize, squareSize);
      ctx.fillRect(center.sx - squareSize / 2, center.sy - squareSize / 2, squareSize, squareSize);
      ctx.restore();
      if (selectedWorld.ownerId === state.me && selectedWorld.observatory.status === "active") {
        const protectionRadius = OBSERVATORY_PROTECTION_RADIUS + 0.5;
        const protectionSquareSize = protectionRadius * 2 * size;
        ctx.save();
        ctx.strokeStyle = "rgba(106, 180, 255, 0.35)";
        ctx.fillStyle = "rgba(106, 180, 255, 0.02)";
        ctx.setLineDash([14, 10]);
        ctx.lineWidth = 2;
        ctx.strokeRect(
          center.sx - protectionSquareSize / 2,
          center.sy - protectionSquareSize / 2,
          protectionSquareSize,
          protectionSquareSize
        );
        ctx.fillRect(
          center.sx - protectionSquareSize / 2,
          center.sy - protectionSquareSize / 2,
          protectionSquareSize,
          protectionSquareSize
        );
        ctx.restore();
      }
    }
  }

  if (crystalTargetingActive) {
    const hoveredKey = state.hover ? key(state.hover.x, state.hover.y) : "";
    const selectedKey = state.selected ? key(state.selected.x, state.selected.y) : "";
    const targetKey = state.crystalTargeting.validTargets.has(hoveredKey)
      ? hoveredKey
      : state.crystalTargeting.validTargets.has(selectedKey)
        ? selectedKey
        : "";
    if (targetKey) {
      const target = parseKey(targetKey);
      const targetScreen = worldToScreen(target.x, target.y, size, halfW, halfH);
      const originKey = state.crystalTargeting.originByTarget.get(targetKey);
      if (originKey) {
        const origin = parseKey(originKey);
        const originScreen = worldToScreen(origin.x, origin.y, size, halfW, halfH);
        ctx.save();
        ctx.strokeStyle =
          crystalTone === "amber"
            ? "rgba(255, 205, 98, 0.92)"
            : crystalTone === "cyan"
              ? "rgba(116, 227, 255, 0.92)"
              : "rgba(255, 110, 110, 0.92)";
        ctx.lineWidth = 2;
        ctx.setLineDash(crystalTone === "cyan" ? [10, 6] : [7, 5]);
        ctx.beginPath();
        ctx.moveTo(originScreen.sx, originScreen.sy);
        ctx.lineTo(targetScreen.sx, targetScreen.sy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeRect(originScreen.sx - size / 2 + 2, originScreen.sy - size / 2 + 2, size - 4, size - 4);
        ctx.restore();
      }
      ctx.save();
      ctx.strokeStyle =
        crystalTone === "amber"
          ? "rgba(255, 219, 132, 1)"
          : crystalTone === "cyan"
            ? "rgba(153, 240, 255, 1)"
            : "rgba(255, 144, 144, 1)";
      ctx.lineWidth = 3;
      ctx.strokeRect(targetScreen.sx - size / 2 + 1, targetScreen.sy - size / 2 + 1, size - 2, size - 2);
      ctx.restore();
    }
  }

  const routeDash = [9, 8];
  ctx.setLineDash(routeDash);
  ctx.lineDashOffset = -((nowMs / 140) % 17);
  for (const pair of state.dockPairs) {
    if (!isDockRouteVisibleForPlayer(pair)) continue;
    const aIsDockLand = terrainAt(pair.ax, pair.ay) === "LAND";
    const bIsDockLand = terrainAt(pair.bx, pair.by) === "LAND";
    const selectedRoute = Boolean(
      state.selected &&
        ((pair.ax === state.selected.x && pair.ay === state.selected.y) || (pair.bx === state.selected.x && pair.by === state.selected.y))
    );
    if (!aIsDockLand || !bIsDockLand) continue;

    const route = computeDockSeaRoute(pair.ax, pair.ay, pair.bx, pair.by);
    if (route.length < 2) {
      // Fallback so every dock pair still communicates connectivity if sea routing fails.
      const a = worldToScreen(pair.ax, pair.ay, size, halfW, halfH);
      const b = {
        sx: a.sx + toroidDelta(pair.ax, pair.bx, WORLD_WIDTH) * size,
        sy: a.sy + toroidDelta(pair.ay, pair.by, WORLD_HEIGHT) * size
      };
      ctx.strokeStyle = selectedRoute ? "rgba(255, 246, 176, 0.9)" : "rgba(255, 233, 149, 0.45)";
      ctx.lineWidth = selectedRoute ? 2 : 1.2;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
      continue;
    }
    ctx.strokeStyle = selectedRoute ? "rgba(255, 246, 176, 0.9)" : "rgba(255, 233, 149, 0.45)";
    ctx.lineWidth = selectedRoute ? 2 : 1.2;
    let prev = route[0]!;
    let prevScreen = worldToScreen(prev.x, prev.y, size, halfW, halfH);
    for (let i = 1; i < route.length; i += 1) {
      const b = route[i]!;
      const stepX = toroidDelta(prev.x, b.x, WORLD_WIDTH) * size;
      const stepY = toroidDelta(prev.y, b.y, WORLD_HEIGHT) * size;
      const sb = { sx: prevScreen.sx + stepX, sy: prevScreen.sy + stepY };
      if (
        (prevScreen.sx < -size && sb.sx < -size) ||
        (prevScreen.sy < -size && sb.sy < -size) ||
        (prevScreen.sx > canvas.width + size && sb.sx > canvas.width + size) ||
        (prevScreen.sy > canvas.height + size && sb.sy > canvas.height + size)
      ) {
        prev = b;
        prevScreen = sb;
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(prevScreen.sx, prevScreen.sy);
      ctx.lineTo(sb.sx, sb.sy);
      ctx.stroke();
      prev = b;
      prevScreen = sb;
    }
  }
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  drawMiniMap();
  maybeRefreshForCamera(false);

  requestAnimationFrame(draw);
};

initTerrainTextures();
draw();
renderHud();
setInterval(renderCaptureProgress, 100);
setInterval(() => {
  if (state.collectVisibleCooldownUntil > Date.now()) renderHud();
  const expiredSettlementProgress = cleanupExpiredSettlementProgress();
  if (expiredSettlementProgress || state.settleProgressByTile.size > 0) {
    renderHud();
  }
  if (!state.actionInFlight) return;
  const started = state.actionStartedAt;
  if (!started) return;
  // Stage 1: waiting for server COMBAT_START ack.
  if (!state.combatStartAck && Date.now() - started > 4_500) {
    const current = state.actionCurrent;
    const currentKey = current ? key(current.x, current.y) : "";
    state.capture = undefined;
    if (state.pendingCombatReveal?.targetKey === currentKey) state.pendingCombatReveal = undefined;
    state.actionInFlight = false;
    state.combatStartAck = false;
    state.actionStartedAt = 0;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    if (currentKey) clearOptimisticTileState(currentKey, true);
      if (current && (current.retries ?? 0) < 3) {
        const retryAction: { x: number; y: number; mode?: "normal" | "breakthrough"; retries: number } = {
          x: current.x,
          y: current.y,
          retries: (current.retries ?? 0) + 1
      };
      if (current.mode) retryAction.mode = current.mode;
      state.actionQueue.unshift(retryAction);
      state.queuedTargetKeys.add(key(current.x, current.y));
      pushFeed(`No combat start from server; retrying action (${retryAction.retries}/3).`, "combat", "warn");
    } else {
      pushFeed("No combat start from server; skipping queued action.", "combat", "warn");
      if (currentKey) dropQueuedTargetKeyIfAbsent(currentKey);
    }
    processActionQueue();
    renderHud();
    return;
  }
  if (!state.capture) return;
  // Stage 2: combat started but result got dropped.
  if (Date.now() > state.capture.resolvesAt + 5_000) {
    const timedOutCurrentKey = state.actionCurrent ? key(state.actionCurrent.x, state.actionCurrent.y) : "";
    const keepOptimisticExpand = shouldPreserveOptimisticExpand(timedOutCurrentKey);
    state.capture = undefined;
    if (state.pendingCombatReveal?.targetKey === timedOutCurrentKey) state.pendingCombatReveal = undefined;
    state.actionInFlight = false;
    state.combatStartAck = false;
    state.actionStartedAt = 0;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    if (timedOutCurrentKey) dropQueuedTargetKeyIfAbsent(timedOutCurrentKey);
    if (timedOutCurrentKey && !keepOptimisticExpand) clearOptimisticTileState(timedOutCurrentKey, true);
    pushFeed(
      keepOptimisticExpand
        ? "Frontier result delayed; keeping optimistic tile while continuing queue."
        : "Combat result delayed locally; continuing queue.",
      "combat",
      "warn"
    );
    if (keepOptimisticExpand) requestViewRefresh(2, true);
    reconcileActionQueue();
    processActionQueue();
    renderHud();
  }
}, 300);

canvas.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  state.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom + (ev.deltaY > 0 ? -1 : 1)));
});

window.addEventListener("keydown", (ev) => {
  const target = ev.target as HTMLElement | null;
  const tagName = target?.tagName;
  const editing =
    target?.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT";
  if (editing) return;

  if (ev.key === "Escape") {
    cancelOngoingCapture();
    hideHoldBuildMenu();
    hideTileActionMenu();
    clearCrystalTargeting();
    return;
  }

  if (ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
    ev.preventDefault();
    const step = ev.shiftKey ? 8 : 3;
    if (ev.key === "ArrowUp") state.camY = wrapY(state.camY - step);
    if (ev.key === "ArrowDown") state.camY = wrapY(state.camY + step);
    if (ev.key === "ArrowLeft") state.camX = wrapX(state.camX - step);
    if (ev.key === "ArrowRight") state.camX = wrapX(state.camX + step);
    maybeRefreshForCamera(true);
  }
});
window.addEventListener("mousedown", (ev) => {
  const target = ev.target as Node | null;
  if (!target) return;
  if (holdBuildMenuEl.contains(target) || tileActionMenuEl.contains(target)) return;
  hideHoldBuildMenu();
  hideTileActionMenu();
});
window.addEventListener("resize", () => renderMobilePanels());

setInterval(() => {
  if (state.connection !== "initialized") return;
  if (state.actionInFlight || state.capture || state.actionQueue.length > 0) return;
  // Keep subscription alive, but do not spam full resubscribe.
  if (Date.now() - state.lastSubAt > 20_000) requestViewRefresh(2, true);
}, isMobile() ? 8_000 : 5_000);

setInterval(() => {
  const loadingActive = state.connection !== "initialized" || state.firstChunkAt === 0;
  if (!loadingActive) return;
  // Keep loading timer text fresh and recover from dropped initial subscriptions.
  renderHud();
  if (state.connection === "initialized" && Date.now() - state.lastSubAt > 1200) {
    requestViewRefresh(3, true);
  }
}, 300);

const worldTileFromPointer = (offsetX: number, offsetY: number): { wx: number; wy: number } => {
  const raw = worldTileRawFromPointer(offsetX, offsetY);
  return { wx: wrapX(raw.gx), wy: wrapY(raw.gy) };
};

const setCameraFromMinimapPointer = (clientX: number, clientY: number): void => {
  const rect = miniMapEl.getBoundingClientRect();
  const px = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const py = Math.max(0, Math.min(rect.height, clientY - rect.top));
  const nx = rect.width <= 0 ? 0 : px / rect.width;
  const ny = rect.height <= 0 ? 0 : py / rect.height;
  state.camX = wrapX(Math.floor(nx * WORLD_WIDTH));
  state.camY = wrapY(Math.floor(ny * WORLD_HEIGHT));
  requestViewRefresh(2, true);
  window.setTimeout(() => requestViewRefresh(2, true), 120);
};

let minimapDragging = false;
miniMapEl.addEventListener("mousedown", (ev) => {
  minimapDragging = true;
  setCameraFromMinimapPointer(ev.clientX, ev.clientY);
});
window.addEventListener("mousemove", (ev) => {
  if (!minimapDragging) return;
  setCameraFromMinimapPointer(ev.clientX, ev.clientY);
});
window.addEventListener("mouseup", () => {
  minimapDragging = false;
});
miniMapEl.addEventListener(
  "touchstart",
  (ev) => {
    const t = ev.touches[0];
    if (!t) return;
    setCameraFromMinimapPointer(t.clientX, t.clientY);
  },
  { passive: true }
);

canvas.addEventListener("click", (ev) => {
  const { wx, wy } = worldTileFromPointer(ev.offsetX, ev.offsetY);
  handleTileSelection(wx, wy, ev.clientX, ev.clientY);
});

let dragActive = false;
let dragLastKey = "";
let suppressNextClick = false;
let boxSelectionEngaged = false;
let boxSelectionMode = false;
let mousePanStart: { x: number; y: number; camX: number; camY: number } | undefined;
let mousePanMoved = false;
let holdOpenTimer: number | undefined;
let holdActivated = false;
let touchHoldStart: { x: number; y: number } | undefined;
let touchTapCandidate: { x: number; y: number } | undefined;
const HOLD_OPEN_MS = 420;
const HOLD_MOVE_CANCEL_PX = 10;
const TOUCH_TAP_MAX_MOVE_PX = 12;
const MOUSE_PAN_THRESHOLD_PX = 4;
const clearHoldOpenTimer = (): void => {
  if (holdOpenTimer !== undefined) window.clearTimeout(holdOpenTimer);
  holdOpenTimer = undefined;
};
const scheduleHoldBuildMenu = (_clientX: number, _clientY: number, _offsetX: number, _offsetY: number): void => {
  clearHoldOpenTimer();
  holdActivated = false;
};

canvas.addEventListener("mousedown", (ev) => {
  if (ev.button !== 0) return;
  dragActive = true;
  mousePanMoved = false;
  boxSelectionMode = ev.shiftKey;
  boxSelectionEngaged = false;
  hideHoldBuildMenu();
  mousePanStart = { x: ev.clientX, y: ev.clientY, camX: state.camX, camY: state.camY };
  const raw = worldTileRawFromPointer(ev.offsetX, ev.offsetY);
  if (boxSelectionMode) {
    state.boxSelectStart = raw;
    state.boxSelectCurrent = raw;
    dragLastKey = key(wrapX(raw.gx), wrapY(raw.gy));
    computeDragPreview();
  } else {
    state.boxSelectStart = undefined;
    state.boxSelectCurrent = undefined;
    state.dragPreviewKeys.clear();
    dragLastKey = "";
  }
  if (!boxSelectionMode) {
    scheduleHoldBuildMenu(ev.clientX, ev.clientY, ev.offsetX, ev.offsetY);
  } else {
    clearHoldOpenTimer();
  }
});
canvas.addEventListener("mousemove", (ev) => {
  if (!dragActive) return;
  if (!boxSelectionMode && mousePanStart) {
    const dx = ev.clientX - mousePanStart.x;
    const dy = ev.clientY - mousePanStart.y;
    if (Math.abs(dx) > MOUSE_PAN_THRESHOLD_PX || Math.abs(dy) > MOUSE_PAN_THRESHOLD_PX) {
      clearHoldOpenTimer();
      mousePanMoved = true;
      suppressNextClick = true;
    }
    if (mousePanMoved) {
      state.camX = wrapX(Math.round(mousePanStart.camX - dx / state.zoom));
      state.camY = wrapY(Math.round(mousePanStart.camY - dy / state.zoom));
      maybeRefreshForCamera(false);
    }
    return;
  }
  const raw = worldTileRawFromPointer(ev.offsetX, ev.offsetY);
  const k = key(wrapX(raw.gx), wrapY(raw.gy));
  if (k === dragLastKey) return;
  clearHoldOpenTimer();
  dragLastKey = k;
  boxSelectionEngaged = true;
  state.boxSelectCurrent = raw;
  computeDragPreview();
});
window.addEventListener("mouseup", (ev) => {
  clearHoldOpenTimer();
  if (dragActive && boxSelectionMode && boxSelectionEngaged) {
    const dragKeys = [...state.dragPreviewKeys];
    if (dragKeys.length > 0) {
      const neutralKeys = dragKeys.filter((k) => {
        const t = state.tiles.get(k);
        return t && t.terrain === "LAND" && !t.fogged && !t.ownerId;
      });
      const enemyKeys = dragKeys.filter((k) => {
        const t = state.tiles.get(k);
        return t && t.terrain === "LAND" && !t.fogged && t.ownerId && t.ownerId !== state.me && !isTileOwnedByAlly(t);
      });
      const ownedYieldKeys = dragKeys.filter((k) => {
        const t = state.tiles.get(k);
        if (!t || t.ownerId !== state.me) return false;
        const y = (t as Tile & { yield?: { gold?: number; strategic?: Record<string, number> } }).yield;
        return Boolean(y && ((y.gold ?? 0) > 0.01 || Object.values(y.strategic ?? {}).some((v) => Number(v) > 0.01)));
      });

      if (neutralKeys.length > 0 && enemyKeys.length === 0 && ownedYieldKeys.length === 0) {
        const out = queueSpecificTargets(neutralKeys, "normal");
        if (out.queued > 0) processActionQueue();
        pushFeed(`Queued ${out.queued} frontier captures${out.skipped > 0 ? ` (${out.skipped} unreachable)` : ""}.`, "combat", "info");
      } else {
        openBulkTileActionMenu(dragKeys, ev.clientX, ev.clientY);
      }
    }
    suppressNextClick = true;
  }
  dragActive = false;
  boxSelectionMode = false;
  boxSelectionEngaged = false;
  mousePanStart = undefined;
  mousePanMoved = false;
  dragLastKey = "";
  state.boxSelectStart = undefined;
  state.boxSelectCurrent = undefined;
  state.dragPreviewKeys.clear();
});
window.addEventListener("contextmenu", (ev) => {
  const target = ev.target as Node | null;
  if (target && (canvas.contains(target) || tileActionMenuEl.contains(target))) {
    ev.preventDefault();
    hideTileActionMenu();
    hideHoldBuildMenu();
  }
});

let touchPanStart: { x: number; y: number; camX: number; camY: number } | undefined;
let pinchStart: { distance: number; zoom: number } | undefined;

canvas.addEventListener(
  "touchstart",
  (ev) => {
    if (ev.touches.length === 1) {
      const t = ev.touches[0];
      if (!t) return;
      hideHoldBuildMenu();
      touchPanStart = { x: t.clientX, y: t.clientY, camX: state.camX, camY: state.camY };
      touchHoldStart = { x: t.clientX, y: t.clientY };
      touchTapCandidate = { x: t.clientX, y: t.clientY };
      const rect = canvas.getBoundingClientRect();
      scheduleHoldBuildMenu(t.clientX, t.clientY, t.clientX - rect.left, t.clientY - rect.top);
      pinchStart = undefined;
    } else if (ev.touches.length === 2) {
      const a = ev.touches[0];
      const b = ev.touches[1];
      if (!a || !b) return;
      clearHoldOpenTimer();
      touchHoldStart = undefined;
      touchTapCandidate = undefined;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchStart = { distance: d, zoom: state.zoom };
      touchPanStart = undefined;
    }
  },
  { passive: true }
);

canvas.addEventListener(
  "touchmove",
  (ev) => {
    if (ev.touches.length === 1 && touchPanStart) {
      const t = ev.touches[0];
      if (!t) return;
      if (touchHoldStart) {
        const moved = Math.hypot(t.clientX - touchHoldStart.x, t.clientY - touchHoldStart.y);
        if (moved > HOLD_MOVE_CANCEL_PX) clearHoldOpenTimer();
        if (moved > TOUCH_TAP_MAX_MOVE_PX) touchTapCandidate = undefined;
      }
      const dx = t.clientX - touchPanStart.x;
      const dy = t.clientY - touchPanStart.y;
      state.camX = wrapX(Math.round(touchPanStart.camX - dx / state.zoom));
      state.camY = wrapY(Math.round(touchPanStart.camY - dy / state.zoom));
      maybeRefreshForCamera(false);
      return;
    }
    if (ev.touches.length === 2 && pinchStart) {
      touchTapCandidate = undefined;
      const a = ev.touches[0];
      const b = ev.touches[1];
      if (!a || !b) return;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const factor = d / Math.max(1, pinchStart.distance);
      state.zoom = Math.max(12, Math.min(MAX_ZOOM, Math.round(pinchStart.zoom * factor)));
    }
  },
  { passive: true }
);

canvas.addEventListener(
  "touchend",
  () => {
    if (touchTapCandidate && !holdActivated && !pinchStart) {
      const rect = canvas.getBoundingClientRect();
      const offsetX = touchTapCandidate.x - rect.left;
      const offsetY = touchTapCandidate.y - rect.top;
      const { wx, wy } = worldTileFromPointer(offsetX, offsetY);
      suppressNextClick = true;
      handleTileSelection(wx, wy, touchTapCandidate.x, touchTapCandidate.y);
    }
    clearHoldOpenTimer();
    touchHoldStart = undefined;
    touchTapCandidate = undefined;
    touchPanStart = undefined;
    pinchStart = undefined;
  },
  { passive: true }
);

canvas.addEventListener("mousemove", (ev) => {
  const size = state.zoom;
  const halfW = Math.floor(canvas.width / size / 2);
  const halfH = Math.floor(canvas.height / size / 2);
  const gx = Math.floor(ev.offsetX / size) - halfW + state.camX;
  const gy = Math.floor(ev.offsetY / size) - halfH + state.camY;
  state.hover = { x: wrapX(gx), y: wrapY(gy) };
  requestAttackPreviewForHover();
});
