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
  LIGHT_OUTPOST_ATTACK_MULT,
  LIGHT_OUTPOST_BUILD_MS,
  OBSERVATORY_BUILD_MS,
  SETTLE_COST,
  SETTLE_MS,
  SIEGE_OUTPOST_ATTACK_MULT,
  SIEGE_OUTPOST_BUILD_MS,
  WOODEN_FORT_BUILD_MS,
  WOODEN_FORT_DEFENSE_MULT,
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
import { exposedSidesForTile, renderDefensibilityPanelHtml } from "./client-defensibility-html.js";
import { renderEconomyPanelHtml, type EconomyFocusKey } from "./client-economy-html.js";
import { shouldHideCaptureOverlayAfterTimer, shouldPreserveOptimisticExpand } from "./client-frontier-overlay.js";
import { busyDevelopmentProcessCount, hasQueuedSettlementForTile, queuedSettlementOrderForTile } from "./client-development-queue.js";
import { tileMenuOverviewIntroLines, tileMenuSubtitleText } from "./client-tile-menu-copy.js";
import { tileActionMenuHtml } from "./client-tile-menu-html.js";
import { neutralTileClickOutcome } from "./client-tile-interaction.js";
import { renderManpowerPanelHtml, renderSocialInspectCardHtml } from "./client-side-panel-html.js";
import {
  activeTrucesHtml,
  allianceRequestsHtml,
  alliesHtml,
  feedHtml,
  leaderboardHtml,
  missionCardsHtml,
  strategicRibbonHtml,
  truceRequestsHtml
} from "./client-panel-html.js";
import { createInitialState, storageSet } from "./client-state.js";
import {
  currentDomainChoiceTier,
  domainOwnedHtml,
  formatTechBenefitSummary,
  ownedDomainByTier,
  renderDomainChoiceGridHtml,
  renderDomainDetailCardHtml,
  renderDomainProgressCardHtml,
  renderTechChoiceDetailsHtml,
  renderTechDetailCardHtml,
  techCurrentModsHtml,
  techOwnedHtml
} from "./client-tech-html.js";
import { renderCompactTechChoiceGridHtml, renderExpandedTechChoiceTreeHtml } from "./client-tech-tree-html.js";
import type {
  ActiveAetherBridgeView,
  ActiveTruceView,
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
  StrategicReplayEvent,
  TechInfo,
  Tile,
  TileMenuProgressView,
  TileMenuTab,
  TileMenuView,
  TileOverviewLine,
  TileTimedProgress,
  TruceRequest
} from "./client-types.js";

const formatManpowerAmount = (value: number): string => Math.round(value).toString();
const aetherBridgeAnchorImage = new Image();

const {
  allianceBreakBtn,
  allianceBreakIdEl,
  alliancePlayerInspectEl,
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
  captureCloseBtn,
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
  mobileAlliancePlayerInspectEl,
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
  mobilePanelManpowerEl,
  mobilePanelIntelEl,
  mobilePanelDomainsEl,
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
  mobileTechOwnedEl,
  mobileTechPickEl,
  mobileTechPointsEl,
  mobileTechTreeExpandToggleEl,
  panelActionButtons,
  panelAllianceEl,
  panelCloseBtn,
  panelDomainsEl,
  panelDomainsContentEl,
  panelDefensibilityEl,
  panelEconomyEl,
  panelManpowerEl,
  panelFeedEl,
  panelLeaderboardEl,
  panelMissionsEl,
  panelTechEl,
  panelTitleEl,
  selectedEl,
  sidePanelBodyEl,
  sidePanelEl,
  statsChipsEl,
  structureInfoOverlayEl,
  techDetailOverlayEl,
  targetingOverlayEl,
  techChoiceDetailsEl,
  techChoicesGridEl,
  techChooseBtn,
  techCurrentModsEl,
  techDetailCardEl,
  techOwnedEl,
  techPickEl,
  techPointsEl,
  techTreeExpandToggleEl,
  tileActionMenuEl
} = initClientDom();

const state = createInitialState();
const miniMapReplayEl = document.createElement("div");
miniMapReplayEl.id = "mini-map-replay";
miniMapWrapEl.appendChild(miniMapReplayEl);

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
let miniMapLastReplayIndex = Number.NaN;
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
  miniMapLastReplayIndex = Number.NaN;
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
const shieldUntilForOwner = (ownerId: string): number => state.playerShieldUntil.get(ownerId) ?? 0;
const ownerSpawnShieldActive = (ownerId: string): boolean => shieldUntilForOwner(ownerId) > Date.now();
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
const hexWithAlpha = (hex: string, alpha: number): string => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
const drawAetherBridgeLane = (
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  nowMs: number,
  options?: { compact?: boolean }
): void => {
  const compact = options?.compact ?? false;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.01) return;
  const nx = dx / distance;
  const ny = dy / distance;
  const pulseOffset = ((nowMs / 1100) % 1 + 1) % 1;
  const laneAngle = Math.atan2(dy, dx);

  const drawAnchorGlyph = (x: number, y: number, angle: number): void => {
    if (compact || !aetherBridgeAnchorImage.complete || !aetherBridgeAnchorImage.naturalWidth) {
      const ringColor = compact ? "rgba(192, 245, 255, 0.72)" : "rgba(192, 245, 255, 0.82)";
      const anchorFill = compact ? "rgba(20, 82, 102, 0.78)" : "rgba(18, 74, 96, 0.72)";
      const ringRadius = compact ? 2.4 : 8;
      const coreRadius = compact ? 1.25 : 3.8;
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = compact ? 1 : 2;
      ctx.beginPath();
      ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = anchorFill;
      ctx.beginPath();
      ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const glyphSize = compact ? 8 : 28;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = compact ? 0.9 : 0.98;
    ctx.drawImage(aetherBridgeAnchorImage, -glyphSize * 0.5, -glyphSize * 0.5, glyphSize, glyphSize);
    ctx.restore();
  };

  ctx.save();
  ctx.lineCap = "round";

  ctx.strokeStyle = compact ? "rgba(81, 210, 255, 0.22)" : "rgba(81, 210, 255, 0.18)";
  ctx.lineWidth = compact ? 4 : 10;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.strokeStyle = compact ? "rgba(164, 240, 255, 0.55)" : "rgba(164, 240, 255, 0.48)";
  ctx.lineWidth = compact ? 1.6 : 3.5;
  ctx.setLineDash(compact ? [4, 3] : [12, 8]);
  ctx.lineDashOffset = -((nowMs / (compact ? 160 : 120)) % (compact ? 7 : 20));
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  drawAnchorGlyph(fromX, fromY, laneAngle);
  drawAnchorGlyph(toX, toY, laneAngle + Math.PI);

  const pulseCount = compact ? 2 : 3;
  for (let i = 0; i < pulseCount; i += 1) {
    const t = (pulseOffset + i / pulseCount) % 1;
    const px = fromX + dx * t;
    const py = fromY + dy * t;
    ctx.fillStyle = compact ? "rgba(234, 252, 255, 0.9)" : "rgba(234, 252, 255, 0.96)";
    ctx.beginPath();
    ctx.arc(px, py, compact ? 1.5 : 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = compact ? "rgba(112, 219, 255, 0.38)" : "rgba(112, 219, 255, 0.22)";
    ctx.beginPath();
    ctx.arc(px, py, compact ? 2.6 : 6.8, 0, Math.PI * 2);
    ctx.fill();
  }

  const arcCount = compact ? 1 : 2;
  for (let i = 0; i < arcCount; i += 1) {
    const t = (pulseOffset * 0.85 + i / arcCount) % 1;
    const px = fromX + dx * t;
    const py = fromY + dy * t;
    const normalScale = compact ? 2.2 : 6;
    const arcLength = compact ? 6 : 18;
    const ax = px - nx * arcLength * 0.5;
    const ay = py - ny * arcLength * 0.5;
    const bx = px + nx * arcLength * 0.5;
    const by = py + ny * arcLength * 0.5;
    ctx.strokeStyle = compact ? "rgba(156, 232, 255, 0.3)" : "rgba(156, 232, 255, 0.36)";
    ctx.lineWidth = compact ? 0.9 : 1.6;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(px + -ny * normalScale, py + nx * normalScale, bx, by);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(px + ny * normalScale, py + -nx * normalScale, bx, by);
    ctx.stroke();
  }

  ctx.restore();
};
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
                          : history.lastStructureType === "FUR_SYNTHESIZER"
                            ? "Former Fur Synthesizer site"
                            : history.lastStructureType === "ADVANCED_FUR_SYNTHESIZER"
                              ? "Former Advanced Fur Synthesizer site"
                              : history.lastStructureType === "IRONWORKS"
                                ? "Former Ironworks site"
                                : history.lastStructureType === "ADVANCED_IRONWORKS"
                                  ? "Former Advanced Ironworks site"
                                  : history.lastStructureType === "CRYSTAL_SYNTHESIZER"
                                    ? "Former Crystal Synthesizer site"
                                    : history.lastStructureType === "ADVANCED_CRYSTAL_SYNTHESIZER"
                                      ? "Former Advanced Crystal Synthesizer site"
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
  if (type === "WOODEN_FORT") return "Wooden Fort";
  if (type === "LIGHT_OUTPOST") return "Light Outpost";
  if (type === "CARAVANARY") return "Caravanary";
  if (type === "FUR_SYNTHESIZER") return "Fur Synthesizer";
  if (type === "ADVANCED_FUR_SYNTHESIZER") return "Advanced Fur Synthesizer";
  if (type === "IRONWORKS") return "Ironworks";
  if (type === "ADVANCED_IRONWORKS") return "Advanced Ironworks";
  if (type === "CRYSTAL_SYNTHESIZER") return "Crystal Synthesizer";
  if (type === "ADVANCED_CRYSTAL_SYNTHESIZER") return "Advanced Crystal Synthesizer";
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
  if (type === "WOODEN_FORT") return "Provides a lighter fortified defense on this owned border tile.";
  if (type === "LIGHT_OUTPOST") return "Provides a lighter attack bonus from this owned border tile.";
  if (type === "CARAVANARY") return "Boosts the nearby town's connected-town income bonus by 25%.";
  if (type === "FUR_SYNTHESIZER") return "Converts gold into steady supply output.";
  if (type === "ADVANCED_FUR_SYNTHESIZER") return "Converts gold into 20% stronger steady supply output.";
  if (type === "IRONWORKS") return "Converts gold into steady iron output.";
  if (type === "ADVANCED_IRONWORKS") return "Converts gold into 20% stronger steady iron output.";
  if (type === "CRYSTAL_SYNTHESIZER") return "Converts gold into steady crystal output.";
  if (type === "ADVANCED_CRYSTAL_SYNTHESIZER") return "Converts gold into 20% stronger steady crystal output.";
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

const economicStructureBuildMs = (type: Tile["economicStructure"] extends infer T ? T extends { type: infer U } ? U : never : never): number => {
  if (type === "WOODEN_FORT") return WOODEN_FORT_BUILD_MS;
  if (type === "LIGHT_OUTPOST") return LIGHT_OUTPOST_BUILD_MS;
  return ECONOMIC_STRUCTURE_BUILD_MS;
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
  | "WOODEN_FORT"
  | "LIGHT_OUTPOST"
  | "FUR_SYNTHESIZER"
  | "ADVANCED_FUR_SYNTHESIZER"
  | "IRONWORKS"
  | "ADVANCED_IRONWORKS"
  | "CRYSTAL_SYNTHESIZER"
  | "ADVANCED_CRYSTAL_SYNTHESIZER"
  | "FUEL_PLANT"
  | "FOUNDRY"
  | "CUSTOMS_HOUSE"
  | "GOVERNORS_OFFICE"
  | "GARRISON_HALL"
  | "AIRPORT"
  | "RADAR_SYSTEM"
  | "SIEGE_OUTPOST";

type StructureInfoView = {
  title: string;
  detail: string;
  glyph: string;
  placement: string;
  image?: string;
  costBits: string[];
  buildTimeLabel: string;
};

const structureInfoForKey = (
  type: StructureInfoKey
): StructureInfoView => {
  const structure = (base: Omit<StructureInfoView, "image">, image?: string): StructureInfoView =>
    image ? { ...base, image } : base;
  const buildTimeLabelFor = (key: StructureInfoKey): string => {
    if (key === "FORT") return formatCooldownShort(FORT_BUILD_MS);
    if (key === "WOODEN_FORT") return formatCooldownShort(WOODEN_FORT_BUILD_MS);
    if (key === "OBSERVATORY") return formatCooldownShort(OBSERVATORY_BUILD_MS);
    if (key === "LIGHT_OUTPOST") return formatCooldownShort(LIGHT_OUTPOST_BUILD_MS);
    if (key === "SIEGE_OUTPOST") return formatCooldownShort(SIEGE_OUTPOST_BUILD_MS);
    return formatCooldownShort(ECONOMIC_STRUCTURE_BUILD_MS);
  };
  const imageFor = (key: StructureInfoKey): string | undefined => {
    if (key === "MARKET") return "/overlays/market-overlay.svg";
    if (key === "GRANARY") return "/overlays/granary-overlay.svg";
    if (key === "OBSERVATORY") return "/overlays/observatory-overlay.svg";
    if (key === "BANK") return "/overlays/bank-overlay.svg";
    if (key === "CARAVANARY") return "/overlays/caravanary-overlay.svg";
    if (key === "FUR_SYNTHESIZER") return "/overlays/fur-synthesizer-overlay.svg";
    if (key === "ADVANCED_FUR_SYNTHESIZER") return "/overlays/advanced-fur-synthesizer-overlay.svg";
    if (key === "IRONWORKS") return "/overlays/ironworks-overlay.svg";
    if (key === "ADVANCED_IRONWORKS") return "/overlays/advanced-ironworks-overlay.svg";
    if (key === "CRYSTAL_SYNTHESIZER") return "/overlays/crystal-synthesizer-overlay.svg";
    if (key === "ADVANCED_CRYSTAL_SYNTHESIZER") return "/overlays/advanced-crystal-synthesizer-overlay.svg";
    if (key === "FUEL_PLANT") return "/overlays/fuel-plant-overlay.svg";
    if (key === "FOUNDRY") return "/overlays/foundry-overlay.svg";
    if (key === "CUSTOMS_HOUSE") return "/overlays/customs-house-overlay.svg";
    if (key === "GOVERNORS_OFFICE") return "/overlays/governors-office-overlay.svg";
    if (key === "GARRISON_HALL") return "/overlays/garrison-hall-overlay.svg";
    if (key === "AIRPORT") return "/overlays/airport-overlay.svg";
    if (key === "RADAR_SYSTEM") return "/overlays/radar-system-overlay.svg";
    return undefined;
  };
  const costBitsFor = (key: StructureInfoKey): string[] => {
    const def = structureCostDefinition(key);
    const bits = [`${def.baseGoldCost.toLocaleString()} gold`];
    if (def.resourceCost) bits.push(`${def.resourceCost.amount} ${prettyToken(def.resourceCost.resource).toLowerCase()}`);
    else if (def.resourceOptions?.length) bits.push(`30 iron or crystal`);
    return bits;
  };
  if (type === "FORT")
    return structure({
      title: "Fort",
      detail: "Forts add fortified defense on border or dock tiles. An active fort also stops that origin tile from being counter-taken when your attack fails.",
      glyph: "🛡",
      placement: "Build on a settled border tile or dock you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  if (type === "OBSERVATORY")
    return structure({
      title: "Observatory",
      detail: "Observatories add local vision, protect against hostile crystal actions, and let you cast crystal abilities inside their radius.",
      glyph: "◉",
      placement: "Build on empty settled land only. Not on towns, docks, or resource tiles.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  if (type === "WOODEN_FORT")
    return structure({
      title: "Wooden Fort",
      detail: "Wooden forts provide a lighter defensive anchor on border and dock tiles without consuming iron upkeep.",
      glyph: "🪵",
      placement: "Build on an owned border tile or dock with no town, resource, or other structure.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  if (type === "FARMSTEAD")
    return structure({
      title: "Farmstead",
      detail: "Farmsteads increase food yield on farm and fish tiles by 50%.",
      glyph: "🌾",
      placement: "Build on a settled farm or fish resource tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  if (type === "CAMP")
    return structure({
      title: "Camp",
      detail: "Camps increase supply yield on wood and fur tiles by 50%.",
      glyph: "🦊",
      placement: "Build on a settled wood or fur resource tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  if (type === "MINE")
    return structure({
      title: "Mine",
      detail: "Mines increase iron or crystal yield on mineral tiles by 50%.",
      glyph: "⛏",
      placement: "Build on a settled iron or crystal resource tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  if (type === "MARKET")
    return structure({
      title: "Market",
      detail: "Markets are built on a town support tile. They increase that fed town's gold output by 50% and its gold storage cap by 50%.",
      glyph: "◌",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  if (type === "GRANARY")
    return structure({
      title: "Granary",
      detail: "Granaries are built on a town support tile. They increase that town's population growth by 20% and raise its gold storage cap by 20%.",
      glyph: "🍞",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  if (type === "BANK")
    return structure({
      title: "Bank",
      detail: "Banks are built on a town support tile. They increase city income by 50% and add +1 flat income.",
      glyph: "🏦",
      placement: "Build on an open settled support tile for a city or larger town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  if (type === "CARAVANARY")
    return structure({
      title: "Caravanary",
      detail: "Caravanaries are built on a town support tile. They increase that town's connected-town income bonus by 25%.",
      glyph: "🐪",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  if (type === "FUR_SYNTHESIZER")
    return structure({
      title: "Fur Synthesizer",
      detail: "Fur Synthesizers convert gold upkeep into steady supply output on a support tile.",
      glyph: "📦",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  if (type === "ADVANCED_FUR_SYNTHESIZER")
    return structure({
      title: "Advanced Fur Synthesizer",
      detail: "Advanced Fur Synthesizers upgrade an existing Fur Synthesizer into a 20% stronger supply converter.",
      glyph: "🧵",
      placement: "Upgrade an existing Fur Synthesizer on its current support tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  if (type === "LIGHT_OUTPOST")
    return structure({
      title: "Light Outpost",
      detail: "Light outposts are cheap offensive staging points that come online quickly but hit less hard than siege outposts.",
      glyph: "⚑",
      placement: "Build on an owned border tile with no town, resource, dock, or other structure.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  if (type === "IRONWORKS")
    return structure({
      title: "Ironworks",
      detail: "Ironworks convert gold upkeep into steady iron output on a support tile.",
      glyph: "⚙",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  if (type === "ADVANCED_IRONWORKS")
    return structure({
      title: "Advanced Ironworks",
      detail: "Advanced Ironworks upgrade an existing Ironworks into a 20% stronger iron converter.",
      glyph: "⚙",
      placement: "Upgrade an existing Ironworks on its current support tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  if (type === "CRYSTAL_SYNTHESIZER")
    return structure({
      title: "Crystal Synthesizer",
      detail: "Crystal Synthesizers convert gold upkeep into steady crystal output on a support tile.",
      glyph: "💎",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  if (type === "ADVANCED_CRYSTAL_SYNTHESIZER")
    return structure({
      title: "Advanced Crystal Synthesizer",
      detail: "Advanced Crystal Synthesizers upgrade an existing Crystal Synthesizer into a 20% stronger crystal converter.",
      glyph: "💠",
      placement: "Upgrade an existing Crystal Synthesizer on its current support tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  if (type === "FUEL_PLANT")
    return structure({
      title: "Fuel Plant",
      detail: "Fuel plants convert gold upkeep into steady oil output on a support tile.",
      glyph: "🛢",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  if (type === "FOUNDRY")
    return structure({
      title: "Foundry",
      detail: "Foundries double active mine output within 10 tiles.",
      glyph: "🏭",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  if (type === "CUSTOMS_HOUSE")
    return structure({
      title: "Customs House",
      detail: "Customs houses are built beside a dock and increase that dock's income by 50%.",
      glyph: "⚓",
      placement: "Build on a settled dock support tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  if (type === "GOVERNORS_OFFICE")
    return structure({
      title: "Governor's Office",
      detail: "Governor's offices reduce local town food upkeep and settled-tile upkeep within 10 tiles.",
      glyph: "🏛",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  if (type === "GARRISON_HALL")
    return structure({
      title: "Garrison Hall",
      detail: "Garrison halls increase settled-tile defense by 20% within 10 tiles.",
      glyph: "🪖",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  if (type === "AIRPORT")
    return structure({
      title: "Airport",
      detail: "Airports launch oil-fueled bombardments against enemy territory within 30 tiles.",
      glyph: "✈",
      placement: "Build on an open settled support tile for a large town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  if (type === "RADAR_SYSTEM")
    return structure({
      title: "Radar System",
      detail: "Radar systems block enemy airport bombardment within 30 tiles and reveal the origin.",
      glyph: "📡",
      placement: "Build on an open settled support tile for a large town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  return structure({
    title: "Siege Outpost",
    detail: "Siege outposts are offensive staging structures for border tiles. They improve attacks launched from their tile.",
    glyph: "⚔",
    placement: "Build on a settled border tile you own.",
    costBits: costBitsFor(type),
    buildTimeLabel: buildTimeLabelFor(type)
  });
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

const tileProductionHtml = (tile: Tile): string => {
  const prodStrategic = Object.entries(tile.yieldRate?.strategicPerDay ?? {})
    .filter(([, v]) => Number(v) > 0)
    .map(([r, v]) => `${resourceIconForKey(r)} ${Number(v).toFixed(1)}/day`);
  const gpm = tile.yieldRate?.goldPerMinute ?? 0;
  const parts: string[] = [];
  if (tile.town) {
    parts.push(`${resourceIconForKey("GOLD")} ${gpm.toFixed(2)}/m`);
  } else if (gpm > 0) {
    parts.push(`${resourceIconForKey("GOLD")} ${gpm.toFixed(2)}/m`);
  }
  parts.push(...prodStrategic);
  return parts.join(" · ");
};

const tileUpkeepHtml = (tile: Tile): string => {
  if (tile.town && typeof tile.town.foodUpkeepPerMinute === "number") {
    return `${resourceIconForKey("FOOD")} ${tile.town.foodUpkeepPerMinute.toFixed(2)}/m`;
  }
  return "";
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
  if (tile.town) {
    const growthLabel = populationPerMinuteLabel(tile.town.populationGrowthPerMinute ?? 0);
    townBits.push(`${prettyToken(tile.town.type)} town`);
    townBits.push(`Support ${tile.town.supportCurrent}/${tile.town.supportMax}`);
    townBits.push(
      `Population ${Math.round(tile.town.population).toLocaleString()} (${growthLabel}) (${prettyToken(tile.town.populationTier)})`
    );
    townBits.push(`Connected towns ${tile.town.connectedTownCount} (+${Math.round(tile.town.connectedTownBonus * 100)}%)`);
    if (!tile.town.isFed) townBits.push("Unfed");
    if (tile.town.goldIncomePausedReason === "MANPOWER_NOT_FULL") {
      const current = Math.round(tile.town.manpowerCurrent ?? 0).toLocaleString();
      const cap = Math.round(tile.town.manpowerCap ?? 0).toLocaleString();
      townBits.push(`Gold paused until manpower is full (${current}/${cap})`);
    }
  }
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
  const extraLine = townBits.length > 0 ? townBits.join(" · ") : "";
  return `
    <div class="hover-line">${topLine}</div>
    <div class="hover-subline">${metaLine}</div>
    ${extraLine ? `<div class="hover-subline">${extraLine}</div>` : ""}
    <div class="hover-subline">Open the tile menu for full overview and actions.</div>
  `;
};

const passiveTileGuidanceHtml = (): string => {
  const captureGuidance = firstCaptureGuidanceTarget();
  const guidance = captureGuidance
    ? `${captureGuidance.label}. It is marked in green on the map.`
    : "Tap a tile to open its actions and overview.";
  return `
    <div class="hover-line"><strong>Tile details live in the action menu</strong></div>
    <div class="hover-subline">${guidance}</div>
  `;
};

const growthModifierPercentLabel = (label: "Recently captured" | "Nearby war" | "Long time peace"): string => {
  if (label === "Long time peace") return "+100% pop growth";
  return "-100% pop growth";
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
    SETTLEMENT: new Image(),
    TOWN: new Image(),
    CITY: new Image(),
    GREAT_CITY: new Image(),
    METROPOLIS: new Image()
  };
  set.SETTLEMENT.src = sources.SETTLEMENT;
  set.TOWN.src = sources.TOWN;
  set.CITY.src = sources.CITY;
  set.GREAT_CITY.src = sources.GREAT_CITY;
  set.METROPOLIS.src = sources.METROPOLIS;
  return set;
};

const overlayAssetVersion = "20260402b";
const overlaySrc = (filename: string): string => `/overlays/${filename}?v=${overlayAssetVersion}`;
const loadOverlayImage = (filename: string): HTMLImageElement => {
  const image = new Image();
  image.decoding = "async";
  image.src = overlaySrc(filename);
  return image;
};
aetherBridgeAnchorImage.decoding = "async";
aetherBridgeAnchorImage.src = overlaySrc("aether-pylon-overlay.svg");
const createOverlayVariantSet = (filenames: readonly string[]): HTMLImageElement[] => filenames.map(loadOverlayImage);
const overlayVariantIndexAt = (x: number, y: number, count: number): number => {
  const hash = (((x + 1) * 374761393) ^ ((y + 1) * 668265263)) >>> 0;
  return hash % count;
};

const defaultTownOverlayByTier = createTownOverlaySet({
  SETTLEMENT: overlaySrc("settlement-overlay-sand.svg"),
  TOWN: overlaySrc("town-overlay-sand.svg"),
  CITY: overlaySrc("city-overlay-sand.svg"),
  GREAT_CITY: overlaySrc("great-city-overlay-sand.svg"),
  METROPOLIS: overlaySrc("metropolis-overlay-sand.svg")
});

const grassTownOverlayByTier = createTownOverlaySet({
  SETTLEMENT: overlaySrc("settlement-overlay-grass.svg"),
  TOWN: overlaySrc("town-overlay-grass.svg"),
  CITY: overlaySrc("city-overlay-grass.svg"),
  GREAT_CITY: overlaySrc("great-city-overlay-grass.svg"),
  METROPOLIS: overlaySrc("metropolis-overlay-grass.svg")
});
const dockOverlayVariants = createOverlayVariantSet(["dock-overlay-1.svg", "dock-overlay-2.svg", "dock-overlay-3.svg"]);
const structureOverlayImages = {
  OBSERVATORY: loadOverlayImage("observatory-overlay.svg"),
  MARKET: loadOverlayImage("market-overlay.svg"),
  GRANARY: loadOverlayImage("granary-overlay.svg"),
  FUR_SYNTHESIZER: loadOverlayImage("fur-synthesizer-overlay.svg"),
  ADVANCED_FUR_SYNTHESIZER: loadOverlayImage("advanced-fur-synthesizer-overlay.svg"),
  ADVANCED_IRONWORKS: loadOverlayImage("advanced-ironworks-overlay.svg"),
  ADVANCED_CRYSTAL_SYNTHESIZER: loadOverlayImage("advanced-crystal-synthesizer-overlay.svg")
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
const shardOverlayVariants = {
  CACHE: createOverlayVariantSet(["shardfall-overlay-1.svg", "shardfall-overlay-2.svg"]),
  FALL: createOverlayVariantSet(["shardfall-overlay-1.svg", "shardfall-overlay-2.svg"])
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
      : "rgba(162, 241, 132, 0.88)";
  const biome = landBiomeAt(tile.x, tile.y);
  const overlaySet = biome === "GRASS" ? grassTownOverlayByTier : defaultTownOverlayByTier;
  const overlay = overlaySet[tile.town.populationTier];
  if (!overlay.complete || !overlay.naturalWidth) {
    const marker = Math.max(4, Math.floor(size * 0.34));
    const mx = px + Math.floor((size - marker) / 2);
    const my = py + Math.floor((size - marker) / 2);
    ctx.fillStyle = "rgba(10, 14, 24, 0.82)";
    ctx.fillRect(mx - 1, my - 1, marker + 2, marker + 2);
    if (tile.town.type === "MARKET") ctx.fillStyle = "rgba(255, 212, 102, 0.95)";
    else ctx.fillStyle = "rgba(162, 241, 132, 0.95)";
    ctx.fillRect(mx, my, marker, marker);
    return;
  }

  const scaleByTier =
    tile.town.populationTier === "SETTLEMENT"
      ? 0.94
      : tile.town.populationTier === "TOWN"
      ? 1.46
      : tile.town.populationTier === "CITY"
        ? 1.58
        : tile.town.populationTier === "GREAT_CITY"
          ? 1.72
          : 1.86;
  const drawSize = size * scaleByTier;
  const offsetX = (drawSize - size) / 2;
  const offsetY =
    tile.town.populationTier === "SETTLEMENT"
      ? drawSize * 0.06
      : tile.town.populationTier === "TOWN"
      ? drawSize * 0.28
      : tile.town.populationTier === "CITY"
        ? drawSize * 0.32
        : tile.town.populationTier === "GREAT_CITY"
          ? drawSize * 0.35
          : drawSize * 0.39;

  ctx.drawImage(overlay, px - offsetX, py - offsetY, drawSize, drawSize);

  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, size * 0.08);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(px + size * 0.22, py + size * 0.88);
  ctx.lineTo(px + size * 0.78, py + size * 0.88);
  ctx.stroke();
  ctx.lineWidth = 1;

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
const shardOverlayForTile = (tile: Tile): HTMLImageElement | undefined => {
  if (!tile.shardSite) return undefined;
  const variants = shardOverlayVariants[tile.shardSite.kind];
  return variants[overlayVariantIndexAt(tile.x, tile.y, variants.length)];
};
const drawShardFallback = (tile: Tile, px: number, py: number, size: number): void => {
  const cx = px + size / 2;
  const cy = py + size / 2;
  ctx.fillStyle = "rgba(41, 26, 10, 0.28)";
  ctx.beginPath();
  ctx.ellipse(cx, py + size * 0.76, size * 0.28, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(22, 35, 49, 0.94)";
  ctx.beginPath();
  ctx.moveTo(cx, py + size * 0.24);
  ctx.lineTo(px + size * 0.7, py + size * 0.42);
  ctx.lineTo(px + size * 0.63, py + size * 0.67);
  ctx.lineTo(px + size * 0.37, py + size * 0.67);
  ctx.lineTo(px + size * 0.3, py + size * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(50, 210, 233, 0.98)";
  ctx.beginPath();
  ctx.moveTo(cx, py + size * 0.31);
  ctx.lineTo(px + size * 0.62, py + size * 0.45);
  ctx.lineTo(px + size * 0.57, py + size * 0.64);
  ctx.lineTo(px + size * 0.43, py + size * 0.64);
  ctx.lineTo(px + size * 0.38, py + size * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 223, 132, 0.58)";
  ctx.lineWidth = Math.max(1.2, size * 0.045);
  ctx.beginPath();
  ctx.ellipse(cx, py + size * 0.68, size * 0.2, size * 0.06, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
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
const openEconomyPanel = (focus: EconomyFocusKey = "ALL"): void => {
  state.economyFocus = focus;
  setActivePanel("economy");
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

const territoryLabelForOwner = (ownerId: string | undefined): string => {
  if (!ownerId) return "neutral territory";
  if (ownerId === "barbarian") return "barbarian territory";
  return playerNameOrFallback(ownerId);
};

const conqueredTileLabel = (tile: Tile | undefined, target: { x: number; y: number } | undefined): string => {
  if (tile?.town) return "Town";
  if (tile?.resource) return prettyToken(resourceLabel(tile.resource));
  if (target) return prettyToken(terrainLabel(target.x, target.y, tile?.terrain ?? terrainAt(target.x, target.y)));
  return "Territory";
};

const settledTileLabel = (target: { x: number; y: number } | undefined): string => {
  if (!target) return "Land";
  const tile = state.tiles.get(key(target.x, target.y));
  if (tile?.town) return "Town";
  if (tile?.dockId) return "Dock";
  if (tile?.resource) return prettyToken(resourceLabel(tile.resource));
  return prettyToken(terrainLabel(target.x, target.y, tile?.terrain ?? terrainAt(target.x, target.y)));
};

const combatResolutionAlert = (
  msg: Record<string, unknown>,
  context?: { targetTileBefore: Tile | undefined; originTileBefore: Tile | undefined }
): { title: string; detail: string; tone: "success" | "warn"; manpowerLoss?: number } => {
  const attackType = typeof msg.attackType === "string" ? msg.attackType : "";
  const origin = msg.origin as { x: number; y: number } | undefined;
  const target = msg.target as { x: number; y: number } | undefined;
  const attackerWon = Boolean(msg.attackerWon);
  const defenderOwnerId = typeof msg.defenderOwnerId === "string" ? msg.defenderOwnerId : context?.targetTileBefore?.ownerId;
  const changes = (msg.changes as Array<{ x: number; y: number; ownerId?: string; ownershipState?: string }> | undefined) ?? [];
  const manpowerDelta = typeof msg.manpowerDelta === "number" ? msg.manpowerDelta : 0;
  const manpowerLoss = manpowerDelta < -0.01 ? Math.round(Math.abs(manpowerDelta)) : undefined;
  if (attackType === "SETTLE") {
    const settledChange = changes.find((change) => change.ownershipState === "SETTLED");
    const settledTarget = settledChange ? { x: settledChange.x, y: settledChange.y } : target;
    return {
      title: "Settlement Complete",
      detail: `${settledTileLabel(settledTarget)} was settled.`,
      tone: "success"
    };
  }
  const targetOwnerName = playerNameOrFallback(defenderOwnerId);
  const targetTerritoryLabel = territoryLabelForOwner(defenderOwnerId);
  const targetLabel = conqueredTileLabel(context?.targetTileBefore, target);
  if (attackType === "EXPAND" && !defenderOwnerId) {
    return {
      title: "Territory Claimed",
      detail: `${targetLabel} was claimed.`,
      tone: "success"
    };
  }
  if (attackerWon) {
    return {
      title: "Victory",
      detail: `${targetLabel} was conquered from ${targetOwnerName}.`,
      tone: "success",
      ...(typeof manpowerLoss === "number" ? { manpowerLoss } : {})
    };
  }
  const originLost = Boolean(origin && changes.some((change) => change.x === origin.x && change.y === origin.y));
  return {
    title: "Attack Beaten Back",
    detail:
      originLost && origin
        ? `Attack on ${targetTerritoryLabel} was beaten back and we lost (${origin.x}, ${origin.y}).`
        : `Attack on ${targetTerritoryLabel} was beaten back.`,
    tone: "warn",
    ...(typeof manpowerLoss === "number" ? { manpowerLoss } : {})
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

const resetStrategicReplayState = (): void => {
  state.replayIndex = Math.max(0, state.strategicReplayEvents.length - 1);
  state.replayAppliedIndex = 0;
  state.replayOwnershipByTile.clear();
  if (state.strategicReplayEvents.length > 0) rebuildStrategicReplayState(state.replayIndex);
};

function rebuildStrategicReplayState(targetIndex: number): void {
  const clamped = Math.max(0, Math.min(targetIndex, Math.max(0, state.strategicReplayEvents.length - 1)));
  state.replayOwnershipByTile.clear();
  for (let index = 0; index <= clamped; index += 1) {
    const event = state.strategicReplayEvents[index];
    if (!event || event.type !== "OWNERSHIP" || event.x === undefined || event.y === undefined) continue;
    const replayKey = key(event.x, event.y);
    if (event.ownerId) {
      const replayTile: { ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN" } = { ownerId: event.ownerId };
      if (event.ownershipState) replayTile.ownershipState = event.ownershipState;
      state.replayOwnershipByTile.set(replayKey, replayTile);
    } else {
      state.replayOwnershipByTile.delete(replayKey);
    }
  }
  state.replayAppliedIndex = clamped;
  state.replayIndex = clamped;
}

const replayBookmarkEvents = (): StrategicReplayEvent[] => state.strategicReplayEvents.filter((event) => event.isBookmark);

const replayCurrentEvent = (): StrategicReplayEvent | undefined => state.strategicReplayEvents[state.replayIndex];

const advanceStrategicReplay = (nowMs: number): void => {
  if (!state.replayActive || !state.replayPlaying || state.strategicReplayEvents.length < 2) {
    state.replayLastTickAt = nowMs;
    return;
  }
  if (!state.replayLastTickAt) state.replayLastTickAt = nowMs;
  const deltaSeconds = Math.max(0, (nowMs - state.replayLastTickAt) / 1000);
  state.replayLastTickAt = nowMs;
  const nextIndex = Math.min(state.strategicReplayEvents.length - 1, state.replayIndex + Math.max(1, Math.round(deltaSeconds * state.replaySpeed)));
  if (nextIndex === state.replayIndex) return;
  if (nextIndex >= state.strategicReplayEvents.length - 1) state.replayPlaying = false;
  rebuildStrategicReplayState(nextIndex);
};

const visibleTerritoryLabels = (): Array<{ ownerId: string; name: string; x: number; y: number; depth: number; tileCount: number }> => {
  const visited = new Set<string>();
  const labels: Array<{ ownerId: string; name: string; x: number; y: number; depth: number; tileCount: number }> = [];
  for (const tile of state.tiles.values()) {
    const tileKey = key(tile.x, tile.y);
    if (visited.has(tileKey) || tile.fogged || tile.ownerId == null || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") continue;
    const ownerId = tile.ownerId;
    const queue = [tile];
    const cluster: Tile[] = [];
    const clusterKeys = new Set<string>();
    visited.add(tileKey);
    while (queue.length > 0) {
      const current = queue.shift()!;
      cluster.push(current);
      clusterKeys.add(key(current.x, current.y));
      for (const [nx, ny] of [
        [current.x, current.y - 1],
        [current.x + 1, current.y],
        [current.x, current.y + 1],
        [current.x - 1, current.y]
      ] as Array<[number, number]>) {
        const neighborKey = key(wrapX(nx), wrapY(ny));
        if (visited.has(neighborKey)) continue;
        const neighbor = state.tiles.get(neighborKey);
        if (!neighbor || neighbor.fogged || neighbor.ownerId !== ownerId || neighbor.ownershipState !== "SETTLED" || neighbor.terrain !== "LAND") continue;
        visited.add(neighborKey);
        queue.push(neighbor);
      }
    }
    if (cluster.length < 18) continue;
    const edgeDistances = new Map<string, number>();
    const depthQueue: Array<{ tile: Tile; depth: number }> = [];
    for (const entry of cluster) {
      const isEdge = ([
        [entry.x, entry.y - 1],
        [entry.x + 1, entry.y],
        [entry.x, entry.y + 1],
        [entry.x - 1, entry.y]
      ] as Array<[number, number]>).some(([nx, ny]) => !clusterKeys.has(key(wrapX(nx), wrapY(ny))));
      if (!isEdge) continue;
      const entryKey = key(entry.x, entry.y);
      edgeDistances.set(entryKey, 0);
      depthQueue.push({ tile: entry, depth: 0 });
    }
    while (depthQueue.length > 0) {
      const current = depthQueue.shift()!;
      for (const [nx, ny] of [
        [current.tile.x, current.tile.y - 1],
        [current.tile.x + 1, current.tile.y],
        [current.tile.x, current.tile.y + 1],
        [current.tile.x - 1, current.tile.y]
      ] as Array<[number, number]>) {
        const neighborKey = key(wrapX(nx), wrapY(ny));
        if (!clusterKeys.has(neighborKey) || edgeDistances.has(neighborKey)) continue;
        edgeDistances.set(neighborKey, current.depth + 1);
        const neighbor = state.tiles.get(neighborKey);
        if (neighbor) depthQueue.push({ tile: neighbor, depth: current.depth + 1 });
      }
    }
    let best = cluster[0]!;
    let bestDepth = edgeDistances.get(key(best.x, best.y)) ?? 0;
    let bestDist = Number.POSITIVE_INFINITY;
    const avgX = cluster.reduce((sum, entry) => sum + entry.x, 0) / cluster.length;
    const avgY = cluster.reduce((sum, entry) => sum + entry.y, 0) / cluster.length;
    for (const entry of cluster) {
      const depth = edgeDistances.get(key(entry.x, entry.y)) ?? 0;
      const dist = Math.hypot(entry.x - avgX, entry.y - avgY);
      if (depth > bestDepth || (depth === bestDepth && dist < bestDist)) {
        best = entry;
        bestDepth = depth;
        bestDist = dist;
      }
    }
    labels.push({
      ownerId,
      name: playerNameForOwner(ownerId) ?? ownerId.slice(0, 8),
      x: best.x,
      y: best.y,
      depth: bestDepth,
      tileCount: cluster.length
    });
  }
  return labels;
};

const fitTerritoryLabelFont = (ctx: CanvasRenderingContext2D, name: string, basePx: number, maxWidth: number): number => {
  let fontPx = basePx;
  while (fontPx >= 10) {
    ctx.font = `${fontPx}px Georgia, serif`;
    if (ctx.measureText(name).width <= maxWidth) return fontPx;
    fontPx -= 1;
  }
  return 0;
};

const drawCurvedTerritoryLabel = (
  ctx: CanvasRenderingContext2D,
  name: string,
  centerX: number,
  centerY: number,
  fontPx: number,
  fillStyle: string,
  strokeStyle: string
): void => {
  const chars = Array.from(name);
  if (chars.length === 0) return;
  ctx.font = `${fontPx}px Georgia, serif`;
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const span = Math.max(totalWidth, fontPx * 2.2);
  const curveHeight = Math.min(fontPx * 0.42, span * 0.08);
  let cursor = -totalWidth / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]!;
    const width = widths[i]!;
    const charCenter = cursor + width / 2;
    const normalized = span > 0 ? charCenter / (span / 2) : 0;
    const yOffset = -(1 - normalized * normalized) * curveHeight;
    const tangent = (-2 * normalized * curveHeight) / Math.max(1, span / 2);
    ctx.save();
    ctx.translate(centerX + charCenter, centerY + yOffset);
    ctx.rotate(Math.atan(tangent) * 0.65);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = Math.max(3, fontPx * 0.18);
    ctx.strokeText(ch, 0, 0);
    ctx.fillStyle = fillStyle;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    cursor += width;
  }
};

const drawMiniMap = (): void => {
  const nowMs = performance.now();
  advanceStrategicReplay(nowMs);
  const miniMapChanged =
    state.camX !== miniMapLastDrawCamX ||
    state.camY !== miniMapLastDrawCamY ||
    state.zoom !== miniMapLastDrawZoom ||
    (state.replayActive && state.replayIndex !== miniMapLastReplayIndex);
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
  if (state.replayActive) {
    for (const [tileKey, replayTile] of state.replayOwnershipByTile) {
      if (!replayTile.ownerId) continue;
      const { x, y } = parseKey(tileKey);
      const px = Math.floor((x / WORLD_WIDTH) * w);
      const py = Math.floor((y / WORLD_HEIGHT) * h);
      miniMapCtx.fillStyle = hexWithAlpha(effectiveOverlayColor(replayTile.ownerId), replayTile.ownershipState === "SETTLED" ? 0.9 : 0.6);
      miniMapCtx.fillRect(px, py, 1, 1);
    }
  }
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
  if (state.replayActive) {
    const replayEvent = replayCurrentEvent();
    if (replayEvent && replayEvent.x !== undefined && replayEvent.y !== undefined) {
      const ex = Math.floor((replayEvent.x / WORLD_WIDTH) * w);
      const ey = Math.floor((replayEvent.y / WORLD_HEIGHT) * h);
      miniMapCtx.strokeStyle = "rgba(255, 244, 171, 0.98)";
      miniMapCtx.lineWidth = 1.6;
      miniMapCtx.strokeRect(ex - 2, ey - 2, 5, 5);
    }
    if (replayEvent?.from && replayEvent?.to) {
      drawAetherBridgeLane(
        miniMapCtx,
        (replayEvent.from.x / WORLD_WIDTH) * w,
        (replayEvent.from.y / WORLD_HEIGHT) * h,
        (replayEvent.to.x / WORLD_WIDTH) * w,
        (replayEvent.to.y / WORLD_HEIGHT) * h,
        nowMs,
        { compact: true }
      );
    }
  }
  miniMapCtx.save();
  miniMapCtx.textAlign = "center";
  miniMapCtx.textBaseline = "middle";
  miniMapCtx.font = "8px monospace";
  for (const t of state.tiles.values()) {
    if (!t.shardSite) continue;
    if (!state.fogDisabled && t.fogged) continue;
    const tx = Math.floor((t.x / WORLD_WIDTH) * w);
    const ty = Math.floor((t.y / WORLD_HEIGHT) * h);
    miniMapCtx.fillStyle = t.shardSite.kind === "FALL" ? "rgba(255, 244, 176, 0.98)" : "rgba(147, 235, 255, 0.96)";
    miniMapCtx.fillText(resourceIconForKey("SHARD"), tx, ty);
  }
  miniMapCtx.restore();
  miniMapLastDrawCamX = state.camX;
  miniMapLastDrawCamY = state.camY;
  miniMapLastDrawZoom = state.zoom;
  miniMapLastReplayIndex = state.replayActive ? state.replayIndex : Number.NaN;
  miniMapLastDrawAt = nowMs;
};

const pushFeed = (msg: string, type: FeedType = "info", severity: FeedSeverity = "info"): void => {
  state.feed.unshift({ text: msg, type, severity, at: Date.now() });
  state.feed = state.feed.slice(0, 18);
};

const maybeAnnounceShardSite = (previous: Tile | undefined, next: Tile): void => {
  if (next.fogged || !next.shardSite) return;
  if (previous?.shardSite?.kind === next.shardSite.kind && previous.shardSite.amount === next.shardSite.amount) return;
  if (next.shardSite.kind === "FALL") {
    pushFeed(`Shard rain sighted at (${next.x}, ${next.y}).`, "info", "warn");
  }
};

const showCaptureAlert = (
  title: string,
  detail: string,
  tone: "success" | "error" | "warn" = "error",
  manpowerLoss?: number
): void => {
  state.captureAlert = {
    title,
    detail,
    until: Date.now() + 12_000,
    tone,
    ...(typeof manpowerLoss === "number" ? { manpowerLoss } : {})
  };
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
  const stillWaitingForInitialChunks = state.firstChunkAt === 0;
  const forcedRetryCooldownMs = stillWaitingForInitialChunks ? 1200 : 30_000;
  const normalRefreshCooldownMs = 700;
  if (sameSub) {
    if (!force && elapsed < normalRefreshCooldownMs) return;
    if (force && elapsed < forcedRetryCooldownMs) return;
  }
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
  if (panel === "domains") return "Sharding";
  if (panel === "alliance") return "Alliances";
  if (panel === "economy") return "Economy";
  if (panel === "manpower") return "Manpower";
  if (panel === "defensibility") return "Defensibility";
  if (panel === "leaderboard") return "Leaderboard";
  if (panel === "feed") return "Activity Feed";
  return "Player Identity";
};

const panelToMobile = (panel: NonNullable<typeof state.activePanel>): typeof state.mobilePanel => {
  if (panel === "missions") return "missions";
  if (panel === "tech") return "tech";
  if (panel === "domains") return "domains";
  if (panel === "alliance") return "social";
  if (panel === "defensibility") return "defensibility";
  if (panel === "economy") return "economy";
  if (panel === "manpower") return "manpower";
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
  if (panel === "domains") return '<span class="tab-icon">✦</span>';
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
  sidePanelEl.classList.toggle("domain-panel-active", state.activePanel === "domains" && state.domainDetailOpen && !isMobile());
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
    [mobilePanelDomainsEl, "domains"],
    [mobilePanelSocialEl, "social"],
    [mobilePanelDefensibilityEl, "defensibility"],
    [mobilePanelEconomyEl, "economy"],
    [mobilePanelManpowerEl, "manpower"],
    [mobilePanelIntelEl, "intel"]
  ];
  for (const [el, panel] of mobileSections) {
    el.style.display = panel === state.mobilePanel ? "grid" : "none";
  }

  if (state.mobilePanel === "missions") mobileSheetHeadEl.textContent = "Missions";
  else if (state.mobilePanel === "tech") mobileSheetHeadEl.textContent = "Technology Tree";
  else if (state.mobilePanel === "domains") mobileSheetHeadEl.textContent = "Sharding";
  else if (state.mobilePanel === "social") mobileSheetHeadEl.textContent = "Alliances";
  else if (state.mobilePanel === "defensibility") mobileSheetHeadEl.textContent = "Defensibility";
  else if (state.mobilePanel === "economy") mobileSheetHeadEl.textContent = "Economy";
  else if (state.mobilePanel === "manpower") mobileSheetHeadEl.textContent = "Manpower";
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
          : economicStructureBuildMs(kind));
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

const shouldPreserveOptimisticExpandByKey = (tileKey: string): boolean =>
  shouldPreserveOptimisticExpand(tileKey ? state.tiles.get(tileKey) : undefined, state.me);

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

const mergeIncomingTileDetail = (existing: Tile | undefined, incoming: Tile): Tile => {
  if (!existing || existing.detailLevel !== "full" || incoming.detailLevel === "full") return incoming;
  const merged: Tile = {
    ...existing,
    ...incoming,
    detailLevel: "full"
  };
  if (!("town" in incoming) && existing.town) merged.town = existing.town;
  if (!("yield" in incoming) && existing.yield) merged.yield = existing.yield;
  if (!("yieldRate" in incoming) && existing.yieldRate) merged.yieldRate = existing.yieldRate;
  if (!("yieldCap" in incoming) && existing.yieldCap) merged.yieldCap = existing.yieldCap;
  if (!("history" in incoming) && existing.history) merged.history = existing.history;
  return merged;
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
  const clickOutcome = neutralTileClickOutcome({
    isLand: to.terrain === "LAND",
    isFogged: Boolean(to.fogged),
    isOwnedByEnemy: Boolean(to.ownerId && to.ownerId !== state.me),
    isOwnedByAlly: isTileOwnedByAlly(to),
    hasAdjacentOwnedOrigin: Boolean(adjacentFromOwned),
    hasFrontierOrigin: Boolean(frontierOrigin),
    hasDock: Boolean(to.dockId),
    isNeutral: !to.ownerId
  });
  if (clickOutcome === "warn-unreachable-enemy") {
    pushFeed("Target is not connected to your border.", "combat", "warn");
    requestAttackPreviewForHover();
    renderHud();
    return;
  }
  if (clickOutcome === "queue-adjacent-neutral") {
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
  if (to.terrain === "LAND" && !to.fogged) {
    openSingleTileActionMenu(to, clientX, clientY);
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
    if (candidate.town.populationTier === "SETTLEMENT") continue;
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

const populationPerMinuteLabel = (deltaPerMinute: number): string => {
  const abs = Math.abs(deltaPerMinute);
  const sign = deltaPerMinute > 0 ? "+" : deltaPerMinute < 0 ? "-" : "";
  if (abs >= 100) return `${sign}${Math.round(abs).toLocaleString()}/m`;
  if (abs >= 10) return `${sign}${abs.toFixed(1)}/m`;
  return `${sign}${abs.toFixed(2)}/m`;
};

const townNextPopulationMilestone = (
  town: NonNullable<Tile["town"]>
): { label: string; targetPopulation: number } | undefined => {
  if (town.populationTier === "SETTLEMENT") return { label: "Town", targetPopulation: 10_000 };
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
    captureCloseBtn.style.display = "inline-flex";
    captureBarEl.style.width = "100%";
    captureTitleEl.textContent = state.captureAlert.title;
    captureTimeEl.textContent = state.captureAlert.manpowerLoss ? `-${state.captureAlert.manpowerLoss} MP` : "";
    captureTimeEl.classList.toggle("capture-loss", Boolean(state.captureAlert.manpowerLoss));
    captureTargetEl.textContent = state.captureAlert.detail;
    return;
  }
  delete captureCardEl.dataset.state;
  state.captureAlert = undefined;

  if (state.capture) {
    const captureTargetKey = key(state.capture.target.x, state.capture.target.y);
    captureCardEl.dataset.state = "progress";
    captureTimeEl.classList.remove("capture-loss");
    const total = Math.max(1, state.capture.resolvesAt - state.capture.startAt);
    const elapsed = Date.now() - state.capture.startAt;
    const pct = Math.max(0, Math.min(1, elapsed / total));
    const remaining = Math.max(0, Math.ceil((state.capture.resolvesAt - Date.now()) / 100) / 10);
    const awaitingResult = Date.now() > state.capture.resolvesAt;
    const awaitingNeutralExpand = shouldHideCaptureOverlayAfterTimer(state.tiles.get(captureTargetKey), state.me, awaitingResult);
    if (awaitingResult && state.pendingCombatReveal && state.pendingCombatReveal.targetKey === captureTargetKey && !state.pendingCombatReveal.revealed) {
      showCaptureAlert(
        state.pendingCombatReveal.title,
        state.pendingCombatReveal.detail,
        state.pendingCombatReveal.tone,
        state.pendingCombatReveal.manpowerLoss
      );
      pushFeed(state.pendingCombatReveal.detail, "combat", state.pendingCombatReveal.tone === "success" ? "success" : "warn");
      state.pendingCombatReveal.revealed = true;
      return;
    }
    if (awaitingNeutralExpand) {
      captureCardEl.style.display = "none";
      captureWrapEl.style.display = "none";
      captureCancelBtn.style.display = "none";
      captureCloseBtn.style.display = "none";
      captureBarEl.style.width = "0%";
      captureTitleEl.textContent = "";
      captureTimeEl.textContent = "";
      captureTargetEl.textContent = "";
      return;
    }
    captureCardEl.style.display = "grid";
    captureWrapEl.style.display = "block";
    captureCancelBtn.style.display = "inline-flex";
    captureCloseBtn.style.display = "none";
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
    captureCloseBtn.style.display = "none";
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

const formatTechCost = (t: TechInfo): string => {
  const checklist = t.requirements.checklist ?? [];
  const costBits = checklist.filter((c) => /gold|food|iron|crystal|supply|shard/i.test(c.label)).map((c) => c.label);
  if (costBits.length > 0) return costBits.join(" · ");
  const fallback = checklist.map((c) => c.label);
  return fallback.length > 0 ? fallback.join(" · ") : "Cost not listed";
};

const renderTechChoiceGrid = (): string =>
  state.techTreeExpanded
    ? renderExpandedTechChoiceTreeHtml({
        techCatalog: state.techCatalog,
        techUiSelectedId: state.techUiSelectedId,
        techRootId: state.techRootId,
        currentResearch: state.currentResearch,
        effectiveOwnedTechIds: effectiveOwnedTechIds(),
        effectiveTechChoices: effectiveTechChoices(),
        orderedTechIdsByTier,
        techTier,
        techPrereqIds,
        techNameList,
        formatTechCost,
        isPendingTechUnlock,
        formatCooldownShort,
        titleCaseFromId,
        viewportHeight: viewportSize().height,
        isMobile: isMobile()
      })
    : renderCompactTechChoiceGridHtml({
        techCatalog: state.techCatalog,
        techUiSelectedId: state.techUiSelectedId,
        techRootId: state.techRootId,
        currentResearch: state.currentResearch,
        effectiveOwnedTechIds: effectiveOwnedTechIds(),
        effectiveTechChoices: effectiveTechChoices(),
        orderedTechIdsByTier,
        techTier,
        techPrereqIds,
        techNameList,
        formatTechCost,
        isPendingTechUnlock,
        formatCooldownShort,
        titleCaseFromId,
        viewportHeight: viewportSize().height,
        isMobile: isMobile()
      });

const selectedTechInfo = (): TechInfo | undefined => {
  const selectedId = state.techUiSelectedId || techPickEl.value || mobileTechPickEl.value || state.techCatalog[0]?.id;
  return state.techCatalog.find((x) => x.id === selectedId);
};

const renderTechDetailPrompt = (): string =>
  `<article class="card tech-detail-placeholder">
    <strong>Inspect Technology</strong>
    <p>Tap any tech card to open its full description, related structures, prerequisites, and unlock action.</p>
  </article>`;

const relatedStructureTypesForTech = (tech: TechInfo): StructureInfoKey[] => {
  const out = new Set<StructureInfoKey>();
  const effects = tech.effects ?? {};
  for (const [key] of Object.entries(effects)) {
    if (key === "unlockForts" || key.startsWith("fort")) out.add("FORT");
    if (key === "unlockWoodenFort") out.add("WOODEN_FORT");
    if (key === "unlockObservatory" || key.startsWith("observatory")) out.add("OBSERVATORY");
    if (key === "unlockFarmstead") out.add("FARMSTEAD");
    if (key === "unlockCamp") out.add("CAMP");
    if (key === "unlockMine") out.add("MINE");
    if (key === "unlockMarket" || key.startsWith("market")) out.add("MARKET");
    if (key === "unlockGranary" || key.startsWith("granary")) out.add("GRANARY");
    if (key === "unlockBank") out.add("BANK");
    if (key === "unlockCaravanary") out.add("CARAVANARY");
    if (key === "unlockFurSynthesizer") out.add("FUR_SYNTHESIZER");
    if (key === "unlockIronworks") out.add("IRONWORKS");
    if (key === "unlockCrystalSynthesizer") out.add("CRYSTAL_SYNTHESIZER");
    if (key === "unlockAdvancedSynthesizers") {
      out.add("ADVANCED_FUR_SYNTHESIZER");
      out.add("ADVANCED_IRONWORKS");
      out.add("ADVANCED_CRYSTAL_SYNTHESIZER");
    }
    if (key === "unlockFuelPlant") out.add("FUEL_PLANT");
    if (key === "unlockFoundry") out.add("FOUNDRY");
    if (key === "unlockCustomsHouse") out.add("CUSTOMS_HOUSE");
    if (key === "unlockGovernorsOffice") out.add("GOVERNORS_OFFICE");
    if (key === "unlockGarrisonHall") out.add("GARRISON_HALL");
    if (key === "unlockAirport") out.add("AIRPORT");
    if (key === "unlockRadarSystem") out.add("RADAR_SYSTEM");
    if (key === "unlockLightOutpost") out.add("LIGHT_OUTPOST");
    if (key === "unlockSiegeOutposts" || key.startsWith("outpost")) out.add("SIEGE_OUTPOST");
  }
  return [...out];
};

const renderTechDetailCard = (): string => {
  const byId = new Map(state.techCatalog.map((tech) => [tech.id, tech]));
  const tierMemo = new Map<string, number>();
  const tech = selectedTechInfo();
  if (!tech || !state.techDetailOpen) {
    return renderTechDetailPrompt();
  }
  const prereqs = techPrereqIds(tech);
  const unlocks = unlockedByTech(tech.id);
  const prereqText = prereqs.length > 0 ? techNameList(prereqs) : "Entry tech";
  const pendingUnlock = isPendingTechUnlock(tech.id);
  const canUnlock = tech.requirements.canResearch && !state.pendingTechUnlockId;
  const statusText = pendingUnlock
      ? "Unlocking now. Waiting for server confirmation..."
      : undefined;
  const buttonLabel = pendingUnlock
      ? "Unlocking..."
      : canUnlock
        ? "Unlock"
        : "Locked";
  const relatedStructures = relatedStructureTypesForTech(tech);
  const relatedStructuresHtml =
    relatedStructures.length > 0
      ? `<p class="muted"><strong>Structures:</strong> ${relatedStructures.map((type) => structureInfoButtonHtml(type)).join(", ")}</p>`
      : "";
  const cardHtml = renderTechDetailCardHtml({
    tech,
    statusText,
    buttonLabel,
    buttonDisabled: !(canUnlock || pendingUnlock),
    prereqs,
    prereqText,
    unlocks: unlocks.map((next) => ({ name: next.name, tier: techTier(next.id, byId, tierMemo) })),
    relatedStructuresHtml
  });
  return `<article class="card tech-detail-card tech-detail-card-shell">
    <div class="tech-detail-inline-head">
      <div class="tech-detail-kicker">Technology</div>
      <button class="tech-detail-close tech-detail-close-inline" type="button" aria-label="Close tech details" data-tech-detail-close="button">×</button>
    </div>
    <div class="tech-detail-inline-scroll">
      ${cardHtml}
    </div>
  </article>`;
};

const renderStructureInfoOverlay = (): string => {
  const type = state.structureInfoKey as StructureInfoKey | "";
  if (!type) return "";
  const info = structureInfoForKey(type);
  const costHtml = info.costBits.map((bit) => `<div class="structure-info-meta-card"><span>Cost</span><strong>${bit}</strong></div>`).join("");
  const artHtml = info.image
    ? `<div class="structure-info-art has-image"><img class="structure-info-image" src="${info.image}" alt="${info.title}" /></div>`
    : `<div class="structure-info-art"><div class="structure-info-glyph" aria-hidden="true">${info.glyph}</div></div>`;
  return `<div class="structure-info-backdrop" data-structure-info-close="backdrop"></div>
    <div class="structure-info-modal" role="dialog" aria-modal="true" aria-labelledby="structure-info-title">
      <button class="structure-info-close" type="button" aria-label="Close structure details" data-structure-info-close="button">×</button>
      <div class="structure-info-scroll">
        <div class="structure-info-hero">
          ${artHtml}
          <div class="structure-info-head">
            <div class="structure-info-kicker">Structure</div>
            <h3 id="structure-info-title">${info.title}</h3>
            <p>${info.detail}</p>
          </div>
        </div>
        <div class="structure-info-meta">
          ${costHtml}
          <div class="structure-info-meta-card"><span>Build time</span><strong>${info.buildTimeLabel}</strong></div>
          <div class="structure-info-meta-card"><span>Placement</span><strong>${info.placement}</strong></div>
        </div>
      </div>
    </div>`;
};

const renderTechDetailModal = (): string => {
  const tech = selectedTechInfo();
  if (!tech) return "";
  const byId = new Map(state.techCatalog.map((item) => [item.id, item]));
  const tierMemo = new Map<string, number>();
  const prereqs = techPrereqIds(tech);
  const unlocks = unlockedByTech(tech.id);
  const pendingUnlock = isPendingTechUnlock(tech.id);
  const canUnlock = tech.requirements.canResearch && !state.pendingTechUnlockId;
  const statusText = pendingUnlock
      ? "Unlocking now. Waiting for server confirmation..."
      : tech.requirements.canResearch
        ? "Ready to unlock."
        : prereqs.length > 0
          ? `Requires ${techNameList(prereqs)}`
          : "Entry tech";
  const buttonLabel = pendingUnlock
      ? "Unlocking..."
      : canUnlock
        ? "Unlock"
        : "Locked";
  const relatedStructures = relatedStructureTypesForTech(tech);
  const requirements = tech.requirements.checklist ?? [];
  const requirementsHtml =
    requirements.length > 0
      ? `<ul class="tech-req-list">${requirements
          .map((item) => `<li class="${item.met ? "ok" : "bad"}">${item.met ? "✓" : "✗"} ${item.label}</li>`)
          .join("")}</ul>`
      : `<ul class="tech-req-list"><li>None</li></ul>`;
  return `<div class="tech-detail-backdrop" data-tech-detail-close="backdrop"></div>
    <div class="tech-detail-modal">
      <button class="tech-detail-close" type="button" aria-label="Close tech details" data-tech-detail-close="button">×</button>
      <div class="tech-detail-scroll">
        <div class="tech-detail-modal-head">
          <div>
            <div class="tech-detail-kicker">Technology</div>
            <h3>${tech.name}</h3>
            <p class="tech-detail-effect">${formatTechBenefitSummary(tech)}</p>
            <p class="muted">${statusText}</p>
          </div>
        </div>
        <p class="tech-detail-flavor">${tech.description}</p>
        ${
          relatedStructures.length > 0
            ? `<section class="structure-info-section">
                <span class="structure-info-section-label">Structures</span>
                <strong>${relatedStructures.map((type) => structureInfoButtonHtml(type)).join(", ")}</strong>
              </section>`
            : ""
        }
        ${
          unlocks.length > 0
            ? `<section class="structure-info-section">
                <span class="structure-info-section-label">Unlocks next</span>
                <strong>${unlocks.map((next) => `${next.name} (T${techTier(next.id, byId, tierMemo)})`).join(", ")}</strong>
              </section>`
            : ""
        }
        <section class="structure-info-section">
          <span class="structure-info-section-label">Requirements</span>
          ${requirementsHtml}
        </section>
      </div>
      <div class="tech-detail-actions">
        <button class="panel-btn tech-unlock-btn tech-unlock-btn-modal" data-tech-unlock="${tech.id}" ${canUnlock || pendingUnlock ? "" : "disabled"}>${buttonLabel}</button>
      </div>
    </div>`;
};

const techDetailsUseOverlay = (): boolean => isMobile();

const renderDomainChoiceGrid = (): string =>
  renderDomainChoiceGridHtml({
    domainCatalog: state.domainCatalog,
    domainIds: state.domainIds,
    domainUiSelectedId: state.domainUiSelectedId,
    ownedByTier: ownedDomainByTier(state.domainCatalog, state.domainIds),
    currentTier: currentDomainChoiceTier(state.domainCatalog, state.domainChoices),
    requiresTechNames: Object.fromEntries(state.domainCatalog.map((domain) => [domain.id, techNameList([domain.requiresTechId])]))
  });

const visibleShardCacheCount = (): number =>
  [...state.tiles.values()].filter((tile) => !tile.fogged && tile.shardSite?.kind === "CACHE").length;

const activeShardfallCount = (): number =>
  [...state.tiles.values()].filter((tile) => !tile.fogged && tile.shardSite?.kind === "FALL").length;

const renderDomainProgressCard = (): string =>
  renderDomainProgressCardHtml({
    visibleShardCacheCount: visibleShardCacheCount(),
    activeShardfallCount: activeShardfallCount(),
    shardStock: state.strategicResources.SHARD ?? 0,
    currentTier: currentDomainChoiceTier(state.domainCatalog, state.domainChoices),
    chosenDomainCount: state.domainIds.length
  });

const renderTechDetailOverlay = (): string => {
  if (!state.techDetailOpen) return "";
  return renderTechDetailModal();
};

const renderDomainDetailCard = (): string => {
  const domain = state.domainCatalog.find((x) => x.id === state.domainUiSelectedId);
  const chosenByTier = ownedDomainByTier(state.domainCatalog, state.domainIds);
  const currentTier = currentDomainChoiceTier(state.domainCatalog, state.domainChoices);
  return renderDomainDetailCardHtml({
    domain,
    domainIds: state.domainIds,
    chosenInTier: domain ? chosenByTier.get(domain.tier) : undefined,
    currentTier,
    requiresTechName: domain ? techNameList([domain.requiresTechId]) : ""
  });
};

const renderTechChoiceDetails = (): string => {
  return "";
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

const replayToolbarHtml = (): string => {
  return `<div class="mini-map-toolbar">
    <span>Minimap (${state.camX}, ${state.camY})</span>
  </div>`;
};

const replayPanelHtml = (): string => "";

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
  const showManpowerRate = state.manpower + 0.001 < state.manpowerCap;
  const manpowerRateClass = rateToneClass(state.manpowerRegenPerMinute);
  statsChipsEl.innerHTML = `
    ${mobile ? "" : `<div class="stat-chip stat-chip-player ${connClass}"><span>Player</span><strong>${state.meName || "Player"}</strong></div>`}
    <button class="stat-chip stat-chip-gold${pointsClass}" type="button" data-economy-open="GOLD"><span>Gold</span><strong>${formatGoldAmount(state.gold)} <em class="stat-chip-rate ${goldRateClass}">${mobile ? mobileGoldRateText : goldRateText}</em></strong></button>
    <button class="stat-chip stat-chip-manpower" type="button" data-panel="manpower" title="Manpower gates attacks. Tap for cap and regen breakdown."><span>${mobile ? "MP" : "Manpower"}</span><strong>${formatManpowerAmount(state.manpower)}/${formatManpowerAmount(state.manpowerCap)} ${showManpowerRate ? `<em class="stat-chip-rate ${manpowerRateClass}">${manpowerRateText}</em>` : ""}</strong></button>
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
  const statPanelButtons = statsChipsEl.querySelectorAll<HTMLButtonElement>("[data-panel]");
  statPanelButtons.forEach((btn) => {
    btn.onclick = () => {
      const panel = btn.dataset.panel as typeof state.activePanel;
      if (!panel) return;
      setActivePanel(panel);
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
      ability === "aether_bridge"
        ? "Pick a coastal land tile. The server links the nearest settled coast and opens a temporary sea lane."
        : "Pick an enemy town or resource tile to siphon 50% of its output for 30 minutes.";
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
  if (selected) requestTileDetailIfNeeded(selected);
  selectedEl.innerHTML = passiveTileGuidanceHtml();
  if (state.tileActionMenu.visible && state.tileActionMenu.mode === "single" && state.tileActionMenu.currentTileKey) {
    const menuTile = state.tiles.get(state.tileActionMenu.currentTileKey);
    if (menuTile) renderTileActionMenu(tileMenuViewForTile(menuTile), state.tileActionMenu.x, state.tileActionMenu.y);
  }
  hoverEl.innerHTML = "";
  hoverEl.style.display = "none";

  mobileCoreHelpEl.innerHTML = `
    <div class="mobile-context-block">
      <div class="mobile-context-label">Tile</div>
      <div class="mobile-context-value">${passiveTileGuidanceHtml()}</div>
    </div>
  `;

  renderCaptureProgress();
  state.replayActive = false;
  state.replayPlaying = false;
  miniMapLabelEl.innerHTML = replayToolbarHtml();
  miniMapReplayEl.innerHTML = replayPanelHtml();
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
  techDetailCardEl.innerHTML = techDetailsUseOverlay() ? renderTechDetailPrompt() : renderTechDetailCard();
  mobileTechDetailCardEl.innerHTML = renderTechDetailPrompt();
  structureInfoOverlayEl.innerHTML = renderStructureInfoOverlay();
  structureInfoOverlayEl.style.display = state.structureInfoKey ? "grid" : "none";
  techDetailOverlayEl.innerHTML = techDetailsUseOverlay() ? renderTechDetailOverlay() : "";
  techDetailOverlayEl.style.display = techDetailsUseOverlay() && state.techDetailOpen ? "grid" : "none";
  techOwnedEl.innerHTML = techOwnedHtml(state.techCatalog, effectiveOwnedTechIds(), isPendingTechUnlock);
  mobileTechOwnedEl.innerHTML = techOwnedHtml(state.techCatalog, effectiveOwnedTechIds(), isPendingTechUnlock);
  techChoiceDetailsEl.innerHTML = renderTechChoiceDetails();
  mobileTechChoiceDetailsEl.innerHTML = renderTechChoiceDetails();
  const techResearchSectionEl = document.querySelector<HTMLDivElement>("#tech-research-section");
  const mobileTechResearchSectionEl = document.querySelector<HTMLDivElement>("#mobile-tech-research-section");
  if (techResearchSectionEl) techResearchSectionEl.style.display = "grid";
  if (mobileTechResearchSectionEl) mobileTechResearchSectionEl.style.display = "grid";
  panelTechEl.classList.toggle("tech-tree-expanded", state.techTreeExpanded);
  panelTechEl.classList.toggle("tech-detail-open", state.techDetailOpen && !techDetailsUseOverlay());
  mobilePanelTechEl.classList.toggle("tech-tree-expanded", state.techTreeExpanded);
  panelDomainsEl.classList.toggle("domain-detail-open", state.domainDetailOpen && !isMobile());
  hud.classList.toggle("desktop-side-panel-open", !isMobile() && state.activePanel !== null);
  const weakDefButtons = hud.querySelectorAll<HTMLButtonElement>("[data-toggle-weak-def]");
  weakDefButtons.forEach((btn) => {
    btn.onclick = () => {
      state.showWeakDefensibility = !state.showWeakDefensibility;
      const weakTileCount = [...state.tiles.values()].filter((tile) => {
        if (tile.ownerId !== state.me || tile.terrain !== "LAND" || tile.ownershipState !== "SETTLED" || tile.fogged) return false;
        return (
          exposedSidesForTile(tile, {
            tiles: state.tiles,
            me: state.me,
            keyFor: key,
            wrapX,
            wrapY,
            terrainAt
          }).length >= 2
        );
      }).length;
      pushFeed(
        state.showWeakDefensibility
          ? `Weak defensibility overlay enabled (${weakTileCount} tiles highlighted).`
          : "Weak defensibility overlay hidden.",
        "info",
        "info"
      );
      requestViewRefresh();
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
      state.structureInfoKey = type;
      renderHud();
    };
  });
  const structureInfoCloseButtons = hud.querySelectorAll<HTMLElement>("[data-structure-info-close]");
  structureInfoCloseButtons.forEach((btn) => {
    btn.onclick = () => {
      state.structureInfoKey = "";
      renderHud();
    };
  });
  const techDetailCloseButtons = hud.querySelectorAll<HTMLElement>("[data-tech-detail-close]");
  techDetailCloseButtons.forEach((btn) => {
    btn.onclick = () => {
      state.techDetailOpen = false;
      renderHud();
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
      state.techDetailOpen = true;
      state.domainDetailOpen = false;
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
      state.domainDetailOpen = true;
      state.techDetailOpen = false;
      renderHud();
    };
  });
  const domainDetailCloseButtons = hud.querySelectorAll<HTMLElement>("[data-domain-detail-close]");
  domainDetailCloseButtons.forEach((btn) => {
    btn.onclick = () => {
      state.domainDetailOpen = false;
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
  alliesListEl.innerHTML = `<h4>Current Allies</h4>${alliesHtml(state.allies, playerNameForOwner)}<h4>Active Truces</h4>${activeTrucesHtml(state.activeTruces, playerNameForOwner)}`;
  mobileAlliesListEl.innerHTML = `<h4>Current Allies</h4>${alliesHtml(state.allies, playerNameForOwner)}<h4>Active Truces</h4>${activeTrucesHtml(state.activeTruces, playerNameForOwner)}`;
  allianceRequestsEl.innerHTML = `<h4>Incoming Alliance Requests</h4>${allianceRequestsHtml(state.incomingAllianceRequests, playerNameForOwner)}<h4>Incoming Truces</h4>${truceRequestsHtml(state.incomingTruceRequests, playerNameForOwner)}`;
  mobileAllianceRequestsEl.innerHTML = `<h4>Incoming Alliance Requests</h4>${allianceRequestsHtml(state.incomingAllianceRequests, playerNameForOwner)}<h4>Incoming Truces</h4>${truceRequestsHtml(state.incomingTruceRequests, playerNameForOwner)}`;
  const socialInspectCardHtml = renderSocialInspectCardHtml({
    socialInspectPlayerId: state.socialInspectPlayerId,
    leaderboardOverall: state.leaderboard.overall,
    allies: state.allies,
    playerNameForOwner
  });
  alliancePlayerInspectEl.innerHTML = socialInspectCardHtml;
  mobileAlliancePlayerInspectEl.innerHTML = socialInspectCardHtml;

  missionsEl.innerHTML = missionCardsHtml(state.missions);
  mobilePanelMissionsEl.innerHTML = missionCardsHtml(state.missions);
  const defensibilityPanelHtml = renderDefensibilityPanelHtml({
    tiles: state.tiles,
    me: state.me,
    defensibilityPct: state.defensibilityPct,
    showWeakDefensibility: state.showWeakDefensibility,
    keyFor: key,
    wrapX,
    wrapY,
    terrainAt
  });
  panelDefensibilityEl.innerHTML = defensibilityPanelHtml;
  mobilePanelDefensibilityEl.innerHTML = defensibilityPanelHtml;
  const economyPanelHtml = renderEconomyPanelHtml({
    focus: state.economyFocus,
    gold: state.gold,
    me: state.me,
    incomePerMinute: state.incomePerMinute,
    strategicResources: state.strategicResources,
    strategicProductionPerMinute: state.strategicProductionPerMinute,
    upkeepPerMinute: state.upkeepPerMinute,
    upkeepLastTick: state.upkeepLastTick,
    activeRevealTargetsCount: state.activeRevealTargets.length,
    tiles: state.tiles.values(),
    isMobile: window.matchMedia("(max-width: 900px)").matches,
    prettyToken,
    resourceIconForKey,
    rateToneClass,
    resourceLabel,
    economicStructureName
  });
  panelEconomyEl.innerHTML = economyPanelHtml;
  mobilePanelEconomyEl.innerHTML = economyPanelHtml;
  const manpowerPanelHtml = renderManpowerPanelHtml({
    manpower: state.manpower,
    manpowerCap: state.manpowerCap,
    manpowerRegenPerMinute: state.manpowerRegenPerMinute,
    manpowerBreakdown: state.manpowerBreakdown,
    formatManpowerAmount,
    rateToneClass
  });
  panelManpowerEl.innerHTML = manpowerPanelHtml;
  mobilePanelManpowerEl.innerHTML = manpowerPanelHtml;
  leaderboardEl.innerHTML = leaderboardHtml(state.leaderboard, state.seasonVictory, state.seasonWinner);
  mobileLeaderboardEl.innerHTML = leaderboardHtml(state.leaderboard, state.seasonVictory, state.seasonWinner);
  feedEl.innerHTML = feedHtml(state.feed);
  mobileFeedEl.innerHTML = feedHtml(state.feed);

  panelDomainsContentEl.innerHTML = `
    <div id="domains-overview-content">
      ${renderDomainProgressCard()}
      ${renderDomainChoiceGrid()}
      ${domainOwnedHtml(state.domainCatalog, state.domainIds)}
      <div class="card auth-settings-card">
        <p>Signed in as ${state.authUserLabel || "Guest"}.</p>
        <button id="auth-logout" class="panel-btn" ${state.authReady ? "" : "disabled"}>Log Out</button>
      </div>
    </div>
    <div id="domains-detail-content">
      ${renderDomainDetailCard()}
    </div>
  `;
  mobilePanelDomainsEl.innerHTML = panelDomainsContentEl.innerHTML;

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
  const acceptTruceButtons = hud.querySelectorAll<HTMLButtonElement>(".accept-truce");
  acceptTruceButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.truceRequestId;
      if (!id) return;
      sendGameMessage({ type: "TRUCE_ACCEPT", requestId: id }, "Finish sign-in before responding to truces.");
    };
  });
  const breakTruceButtons = hud.querySelectorAll<HTMLButtonElement>(".break-truce");
  breakTruceButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.trucePlayerId;
      if (!id) return;
      sendGameMessage({ type: "TRUCE_BREAK", targetPlayerId: id }, "Finish sign-in before changing truces.");
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
const requestTileDetailIfNeeded = (tile: Tile | undefined): void => {
  if (!tile || tile.fogged || tile.detailLevel === "full") return;
  if (ws.readyState !== ws.OPEN || !state.authSessionReady) return;
  const tileKey = key(tile.x, tile.y);
  const lastRequestedAt = state.tileDetailRequestedAt.get(tileKey) ?? 0;
  if (Date.now() - lastRequestedAt < 1500) return;
  ws.send(JSON.stringify({ type: "REQUEST_TILE_DETAIL", x: tile.x, y: tile.y }));
  state.tileDetailRequestedAt.set(tileKey, Date.now());
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
const sendTruceRequest = (targetPlayerName: string, durationHours: 12 | 24): void => {
  const t = targetPlayerName.trim();
  if (!t) return;
  sendGameMessage({ type: "TRUCE_REQUEST", targetPlayerName: t, durationHours }, "Finish sign-in before sending truce offers.");
};
const breakAlliance = (target: string): void => {
  const t = target.trim();
  if (!t) return;
  sendGameMessage({ type: "ALLIANCE_BREAK", targetPlayerId: t }, "Finish sign-in before breaking alliances.");
};
const breakTruce = (targetPlayerId: string): void => {
  const t = targetPlayerId.trim();
  if (!t) return;
  sendGameMessage({ type: "TRUCE_BREAK", targetPlayerId: t }, "Finish sign-in before breaking truces.");
};
const activeTruceWithPlayer = (playerId?: string | null): ActiveTruceView | undefined =>
  playerId ? state.activeTruces.find((truce) => truce.otherPlayerId === playerId && truce.endsAt > Date.now()) : undefined;
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
  console.info("[tech] sending CHOOSE_TECH", { techId });
  ws.send(JSON.stringify({ type: "CHOOSE_TECH", techId }));
  pushFeed(`Unlocking: ${tech.name}.`, "tech", "info");
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
  if (code === "SIPHON_INVALID") return `Cannot siphon tile: ${message}.`;
  if (code === "PURGE_SIPHON_INVALID") return `Cannot purge siphon: ${message}.`;
  if (code === "AETHER_BRIDGE_INVALID") return `Cannot cast Aether Bridge: ${message}.`;
  if (code === "CREATE_MOUNTAIN_INVALID") return `Cannot create mountain: ${message}.`;
  if (code === "REMOVE_MOUNTAIN_INVALID") return `Cannot remove mountain: ${message}.`;
  if (code === "NOT_ADJACENT") return "Action blocked: target must border your territory or a linked dock.";
  if (code === "NOT_OWNER") return "Action blocked: you need to launch from one of your own tiles.";
  if (code === "LOCKED") return "Action blocked: the tile is already in combat.";
  if (code === "BARRIER") return "Action blocked: only land tiles can be claimed or attacked.";
  if (code === "SHIELDED") return "Action blocked: that empire is still under spawn protection.";
  if (code === "ALLY_TARGET") return "Action blocked: you cannot attack an allied or truced empire.";
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
  if (tile.ownerId && tile.ownerId !== state.me && ownerSpawnShieldActive(tile.ownerId)) {
    return "That empire is still under spawn protection.";
  }
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

const requestSettlement = (
  x: number,
  y: number,
  opts?: { allowQueueWhenBusy?: boolean; fromQueue?: boolean; suppressWarnings?: boolean }
): boolean => {
  const tile = state.tiles.get(key(x, y));
  if (!tile || tile.ownerId !== state.me || tile.ownershipState !== "FRONTIER") {
    if (!opts?.suppressWarnings) pushFeed("Cannot settle: tile is not one of your frontier tiles.", "combat", "warn");
    renderHud();
    return false;
  }
  if (!canAffordCost(state.gold, SETTLE_COST)) {
    if (!opts?.suppressWarnings) pushFeed(`Need ${SETTLE_COST} gold to settle this tile.`, "combat", "warn");
    renderHud();
    return false;
  }
  const slots = developmentSlotSummary();
  if (slots.available <= 0) {
    if (opts?.allowQueueWhenBusy !== false && !opts?.fromQueue) {
      return queueDevelopmentAction({ kind: "SETTLE", x, y, tileKey: key(x, y), label: `Settlement at (${x}, ${y})` });
    }
    if (!opts?.suppressWarnings) pushFeed(developmentSlotReason(slots), "combat", "warn");
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

const sendDevelopmentBuild = (
  payload: QueuedDevelopmentAction extends infer T
    ? T extends { kind: "BUILD"; payload: infer P }
      ? P
      : never
    : never,
  optimistic: () => void,
  opts: {
    x: number;
    y: number;
    label: string;
    optimisticKind: OptimisticStructureKind;
    allowQueueWhenBusy?: boolean;
    fromQueue?: boolean;
    suppressWarnings?: boolean;
  }
): boolean => {
  const summary = developmentSlotSummary();
  if (summary.available <= 0) {
    if (opts.allowQueueWhenBusy !== false && !opts.fromQueue) {
      return queueDevelopmentAction({
        kind: "BUILD",
        x: opts.x,
        y: opts.y,
        tileKey: key(opts.x, opts.y),
        label: opts.label,
        payload,
        optimisticKind: opts.optimisticKind
      });
    }
    if (!opts.suppressWarnings) {
      pushFeed(developmentSlotReason(summary), "combat", "warn");
      renderHud();
    }
    return false;
  }
  if (!sendGameMessage(payload)) return false;
  optimistic();
  renderHud();
  return true;
};

const processDevelopmentQueue = (): boolean => {
  if (state.developmentQueue.length === 0 || ws.readyState !== ws.OPEN || !state.authSessionReady) return false;
  let started = false;
  while (state.developmentQueue.length > 0 && developmentSlotSummary().available > 0) {
    const next = state.developmentQueue[0];
    if (!next) return started;
    const ok =
      next.kind === "SETTLE"
        ? requestSettlement(next.x, next.y, { allowQueueWhenBusy: false, fromQueue: true, suppressWarnings: true })
        : sendDevelopmentBuild(next.payload, () => applyOptimisticStructureBuild(next.x, next.y, next.optimisticKind), {
            x: next.x,
            y: next.y,
            label: next.label,
            optimisticKind: next.optimisticKind,
            allowQueueWhenBusy: false,
            fromQueue: true,
            suppressWarnings: true
          });
    state.developmentQueue.shift();
    if (ok) {
      pushFeed(`${next.label} started.`, "combat", "info");
      started = true;
    } else {
      pushFeed(`${next.label} could not start and was removed from queue.`, "combat", "warn");
    }
  }
  if (started || state.developmentQueue.length === 0) renderHud();
  return started;
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

const collectSelectedShard = (): void => {
  const sel = state.selected;
  if (!sel) return;
  const tile = state.tiles.get(key(sel.x, sel.y));
  if (!tile?.shardSite || tile.fogged) return;
  state.tiles.set(key(sel.x, sel.y), { ...tile, shardSite: null });
  renderHud();
  sendGameMessage({ type: "COLLECT_SHARD", x: sel.x, y: sel.y });
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
    | "collect_shard"
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
    | "build_fur_synthesizer"
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
    | "offer_truce_12h"
    | "offer_truce_24h"
    | "break_truce"
    | "aether_bridge"
    | "siphon_tile"
    | "purge_siphon"
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

const tileActionIsCrystal = (id: TileActionDef["id"]): boolean =>
  id === "reveal_empire" ||
  id === "aether_bridge" ||
  id === "siphon_tile" ||
  id === "purge_siphon" ||
  id === "create_mountain" ||
  id === "remove_mountain";

const tileActionIsBuilding = (id: TileActionDef["id"]): boolean => id.startsWith("build_");

const requiredTechForTileAction = (actionId: TileActionDef["id"]): string | undefined => {
  switch (actionId) {
    case "build_foundry":
      return "industrial-extraction";
    case "build_fortification":
      return "masonry";
    case "build_observatory":
      return "cartography";
    case "build_airport":
      return "aeronautics";
    case "build_radar_system":
      return "radar";
    case "build_governors_office":
      return "civil-service";
    case "build_garrison_hall":
      return "standing-army";
    case "build_siege_camp":
    case "build_camp":
      return "leatherworking";
    case "build_farmstead":
      return "agriculture";
    case "build_mine":
      return "mining";
    case "build_market":
      return "trade";
    case "build_granary":
      return "pottery";
    case "build_bank":
      return "coinage";
    case "build_caravanary":
      return "ledger-keeping";
    case "build_fur_synthesizer":
    case "build_ironworks":
    case "build_crystal_synthesizer":
      return "workshops";
    case "build_fuel_plant":
      return "plastics";
    case "build_customs_house":
      return "global-trade-networks";
    case "reveal_empire":
      return "cryptography";
    case "siphon_tile":
      return "cryptography";
    case "aether_bridge":
      return "navigation";
    case "create_mountain":
    case "remove_mountain":
      return "terrain-engineering";
    default:
      return undefined;
  }
};

const hideTechLockedTileAction = (action: TileActionDef): boolean => {
  const requiredTech = requiredTechForTileAction(action.id);
  if (requiredTech && !state.techIds.includes(requiredTech)) return true;
  if (!action.disabled || !action.disabledReason) return false;
  return /^Requires\b/i.test(action.disabledReason) || /^Need reveal capability\b/i.test(action.disabledReason);
};

const splitTileActionsIntoTabs = (
  actions: TileActionDef[]
): Pick<TileMenuView, "actions" | "buildings" | "crystal"> => {
  const filtered = actions.filter((action) => !hideTechLockedTileAction(action));
  const visibleIfShown = (action: TileActionDef): boolean => !action.disabled;
  const actionRows = filtered.filter((action) => !tileActionIsBuilding(action.id) && !tileActionIsCrystal(action.id));
  const buildingRows = filtered.filter((action) => tileActionIsBuilding(action.id));
  const crystalRows = filtered.filter((action) => tileActionIsCrystal(action.id));
  return {
    actions: actionRows.some(visibleIfShown) ? actionRows : [],
    buildings: buildingRows.some(visibleIfShown) ? buildingRows : [],
    crystal: crystalRows.some(visibleIfShown) ? crystalRows : []
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
  const busy = busyDevelopmentProcessCount(state.tiles.values(), state.me, state.settleProgressByTile.size);
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

const shouldResetFrontierActionStateForError = (errorCode: string): boolean => {
  if (!errorCode) return true;
  switch (errorCode) {
    case "SETTLE_INVALID":
    case "FORT_BUILD_INVALID":
    case "OBSERVATORY_BUILD_INVALID":
    case "SIEGE_OUTPOST_BUILD_INVALID":
    case "ECONOMIC_STRUCTURE_BUILD_INVALID":
    case "STRUCTURE_CANCEL_INVALID":
    case "TOWN_UNFED":
      return false;
    default:
      return true;
  }
};

const abilityCooldownRemainingMs = (
  abilityId: "aether_bridge" | "siphon" | "reveal_empire" | "create_mountain" | "remove_mountain"
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

type QueuedDevelopmentAction = (typeof state.developmentQueue)[number];

const queuedDevelopmentActionExists = (tileKey: string, kind?: QueuedDevelopmentAction["kind"]): boolean =>
  state.developmentQueue.some((entry) => entry.tileKey === tileKey && (!kind || entry.kind === kind));

const queueDevelopmentAction = (entry: QueuedDevelopmentAction): boolean => {
  if (queuedDevelopmentActionExists(entry.tileKey, entry.kind)) {
    pushFeed(`${entry.label} is already queued.`, "combat", "warn");
    renderHud();
    return false;
  }
  state.developmentQueue.push(entry);
  pushFeed(`${entry.label} queued. It will start when a development slot frees up.`, "combat", "info");
  renderHud();
  return true;
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

const queuedDevelopmentEntryForTile = (tileKey: string): QueuedDevelopmentAction | undefined =>
  state.developmentQueue.find((entry) => entry.tileKey === tileKey);

const queuedSettlementIndexForTile = (tileKey: string): number => queuedSettlementOrderForTile(state.developmentQueue, tileKey);

const cancelQueuedSettlement = (tileKey: string): boolean => {
  const nextQueue = state.developmentQueue.filter((entry) => !(entry.kind === "SETTLE" && entry.tileKey === tileKey));
  if (nextQueue.length === state.developmentQueue.length) return false;
  state.developmentQueue = nextQueue;
  pushFeed(`Queued settlement at ${tileKey} cancelled.`, "combat", "info");
  renderHud();
  return true;
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

const buildDetailTextForAction = (actionId: string, tile: Tile, supportedTown?: Tile): string | undefined => {
  if (actionId === "settle_land") {
    return "Makes this tile defended and activates production.";
  }
  if (actionId === "build_fortification") return "Fortify this tile. +25% defense here. Active forts also stop failed attacks from losing the origin tile.";
  if (actionId === "build_wooden_fort") return "Build a lighter fortification on this border or dock tile. Weaker than a full fort, but gold-only.";
  if (actionId === "build_observatory") return `Extends local vision by ${OBSERVATORY_VISION_BONUS} and blocks hostile crystal actions nearby.`;
  if (actionId === "build_siege_camp") return "Adds an offensive staging point on this border tile. Attacks from here hit 25% harder.";
  if (actionId === "build_light_outpost") return "Build a light outpost on this border tile. It comes online fast, costs only gold, and grants a smaller attack bonus.";
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
  if (actionId === "build_fur_synthesizer") return "Convert heavy gold upkeep into steady supply output on this support tile with a Fur Synthesizer.";
  if (actionId === "upgrade_fur_synthesizer") return "Upgrade this Fur Synthesizer into an Advanced Fur Synthesizer with 20% higher output.";
  if (actionId === "build_ironworks") return "Convert heavy gold upkeep into steady iron output on this support tile.";
  if (actionId === "upgrade_ironworks") return "Upgrade this Ironworks into an Advanced Ironworks with 20% higher output.";
  if (actionId === "build_crystal_synthesizer") return "Convert heavy gold upkeep into steady crystal output on this support tile.";
  if (actionId === "upgrade_crystal_synthesizer") return "Upgrade this Crystal Synthesizer into an Advanced Crystal Synthesizer with 20% higher output.";
  if (actionId === "overload_fur_synthesizer") return "Spend 1000 gold for an instant supply burst, then shut this Fur Synthesizer down for 1 hour.";
  if (actionId === "overload_ironworks") return "Spend 1000 gold for an instant iron burst, then shut this ironworks down for 1 hour.";
  if (actionId === "overload_crystal_synthesizer") return "Spend 1000 gold for an instant crystal burst, then shut this synthesizer down for 1 hour.";
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
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, economicStructureBuildMs(tile.economicStructure.type)))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction"
    };
  }
  return undefined;
};

const queuedSettlementProgressForTile = (tile: Tile): TileMenuProgressView | undefined => {
  const entry = queuedDevelopmentEntryForTile(key(tile.x, tile.y));
  if (!entry || entry.kind !== "SETTLE") return undefined;
  const queueIndex = queuedSettlementIndexForTile(entry.tileKey);
  return {
    title: "Settlement queued",
    detail: "This frontier tile is queued to settle as soon as a development slot becomes free.",
    remainingLabel: queueIndex >= 0 ? `Queue #${queueIndex + 1}` : "Queued",
    progress: 0,
    note: "Queued settlements reserve their place in line and can be cancelled before they start.",
    cancelLabel: "Cancel queued settlement",
    cancelActionId: "cancel_queued_settlement"
  };
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
  const ownerKind =
    !tile.ownerId
      ? "unclaimed"
      : tile.ownerId === state.me
        ? tile.ownershipState === "FRONTIER"
          ? "mine-frontier"
          : "mine-settled"
        : isTileOwnedByAlly(tile)
          ? "ally"
          : "enemy";
  const productionLabel = tileProductionRequirementLabel(tile);
  const resourceLabelText = tile.resource ? prettyToken(strategicResourceKeyForTile(tile) ?? resourceLabel(tile.resource)) : undefined;
  tileMenuOverviewIntroLines({
    terrain: tile.terrain,
    ownerKind,
    productionLabel,
    resourceLabel: resourceLabelText,
    isDockEndpoint: Boolean(tile.dockId)
  }).forEach(pushLine);
  if (tile.resource && !tile.ownerId && resourceLabelText) {
    pushLine(`This ${resourceLabelText.toLowerCase()} node starts producing only after you claim and settle the tile.`);
  }
  if (tile.terrain === "SEA" || tile.terrain === "MOUNTAIN" || !tile.ownerId) return lines;
  if (tile.ownershipState === "SETTLED" && tile.town) {
    pushLine(tile.town.populationTier === "SETTLEMENT" ? "Settlements provide starter gold and manpower until they grow into towns." : "Towns produce gold when fed.");
  }
  if (tile.shardSite) {
    pushLine(
      tile.shardSite.kind === "FALL"
        ? `Shard rain deposit: ${tile.shardSite.amount} shard${tile.shardSite.amount === 1 ? "" : "s"} can be collected here for a short time.`
        : `Shard cache: ${tile.shardSite.amount} shard${tile.shardSite.amount === 1 ? "" : "s"} can be recovered here.`
    );
  }
  const supportedTowns = tile.ownerId === state.me && tile.ownershipState === "SETTLED" ? supportedOwnedTownsForTile(tile) : [];
  if (tile.town) {
    if (tile.town.populationTier === "SETTLEMENT") {
      pushLine(`Settlement is producing ${displayTownGoldPerMinute(tile).toFixed(2)} gold/m.`);
    } else if (!tile.town.isFed) {
      pushLine("Town is unfed. Needs settled fish or grain nearby.");
    } else if (tile.town.goldIncomePausedReason === "MANPOWER_NOT_FULL") {
      const current = Math.round(tile.town.manpowerCurrent ?? 0).toLocaleString();
      const cap = Math.round(tile.town.manpowerCap ?? 0).toLocaleString();
      pushLine(`Town is fed but gold is paused until manpower is full (${current}/${cap}).`);
    } else {
      pushLine(`Town is fed and producing ${displayTownGoldPerMinute(tile).toFixed(2)} gold/m.`);
    }
    if (tile.town.populationTier !== "SETTLEMENT") pushLine(`Support ${tile.town.supportCurrent}/${tile.town.supportMax}`);
    pushLine(`Population ${Math.round(tile.town.population).toLocaleString()} • ${prettyToken(tile.town.populationTier)}`);
    pushLine(`Growth ${populationPerMinuteLabel(tile.town.populationGrowthPerMinute ?? 0)}`);
    pushLine(`Next size: ${townNextGrowthEtaLabel(tile.town)}.`);
    for (const modifier of tile.town.growthModifiers ?? []) {
      const tone = modifier.deltaPerMinute > 0 ? "positive" : modifier.deltaPerMinute < 0 ? "negative" : "neutral";
      pushEffectLine(modifier.label, growthModifierPercentLabel(modifier.label), tone);
    }
    if (tile.town.hasMarket) pushEffectLine("Market", tile.town.marketActive ? "+50% fed gold and +50% cap" : "Built", tile.town.marketActive ? "positive" : "neutral");
    if (tile.town.hasGranary) pushEffectLine("Granary", tile.town.granaryActive ? "+50% gold storage cap" : "Built", tile.town.granaryActive ? "positive" : "neutral");
  } else if (tile.resource) {
    if (tile.ownershipState === "SETTLED") pushLine(`Resource node can produce ${(resourceLabelText ?? "resources").toLowerCase()} once developed and collected.`);
  }
  const productionHtml = tileProductionHtml(tile);
  if (productionHtml) pushLine(`Production: ${productionHtml}`);
  const upkeepHtml = tileUpkeepHtml(tile);
  if (upkeepHtml) pushLine(`Upkeep: ${upkeepHtml}`);
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
  const queuedSettlement = queuedSettlementProgressForTile(tile);
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
      : queuedSettlement ?? construction;
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
  const titleLabel =
    tile.town
      ? prettyToken(tile.town.populationTier === "SETTLEMENT" ? "SETTLEMENT" : tile.town.type)
      : tile.dockId
        ? "Dock"
        : tile.resource
          ? prettyToken(resourceLabel(tile.resource))
          : terrainLabel(tile.x, tile.y, tile.terrain);
  return {
    title: `${titleLabel} (${tile.x}, ${tile.y})`,
    subtitle: tileMenuSubtitleText(ownerLabel, tile.regionType ? prettyToken(tile.regionType) : undefined),
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

const hasBreakthroughCapability = (): boolean => state.techIds.includes("breach-doctrine");
const hasAetherBridgeCapability = (): boolean => state.techIds.includes("navigation");
const hasSiphonCapability = (): boolean => state.techIds.includes("cryptography");

const hasTerrainShapingCapability = (): boolean => state.techIds.includes("terrain-engineering");

const hasOwnedLandWithinClientRange = (x: number, y: number, range: number): boolean => {
  for (const tile of state.tiles.values()) {
    if (tile.fogged || tile.ownerId !== state.me || tile.terrain !== "LAND") continue;
    if (chebyshevDistanceClient(tile.x, tile.y, x, y) <= range) return true;
  }
  return false;
};

const crystalTargetingTitle = (ability: CrystalTargetingAbility): string => {
  if (ability === "aether_bridge") return "Aether Bridge";
  return "Siphon";
};

const crystalTargetingTone = (ability: CrystalTargetingAbility): "amber" | "cyan" | "red" => {
  return ability === "aether_bridge" ? "cyan" : "red";
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

const computeCrystalTargets = (
  ability: CrystalTargetingAbility
): { validTargets: Set<string>; originByTarget: Map<string, string> } => {
  const validTargets = new Set<string>();
  const originByTarget = new Map<string, string>();
  for (const tile of state.tiles.values()) {
    if (tile.fogged || tile.terrain !== "LAND") continue;
    if (ability === "aether_bridge") {
      const isCoastalLand =
        terrainAt(tile.x, tile.y) === "LAND" &&
        [
          terrainAt(tile.x, tile.y - 1),
          terrainAt(tile.x + 1, tile.y),
          terrainAt(tile.x, tile.y + 1),
          terrainAt(tile.x - 1, tile.y)
        ].includes("SEA");
      if (!isCoastalLand) continue;
      validTargets.add(key(tile.x, tile.y));
      continue;
    }
    if (!tile.ownerId || tile.ownerId === state.me || isTileOwnedByAlly(tile)) continue;
    if (hostileObservatoryProtectingTile(tile)) continue;
    if ((tile.resource || tile.town) && !tile.sabotage) validTargets.add(key(tile.x, tile.y));
  }
  return { validTargets, originByTarget };
};

const beginCrystalTargeting = (ability: CrystalTargetingAbility): void => {
  if (ability === "aether_bridge") {
    const cooldown = abilityCooldownRemainingMs("aether_bridge");
    if (!hasAetherBridgeCapability()) {
      pushFeed("Aether Bridge requires Navigation.", "combat", "warn");
      return;
    }
    if ((state.strategicResources.CRYSTAL ?? 0) < 30) {
      pushFeed("Aether Bridge needs 30 CRYSTAL.", "combat", "warn");
      return;
    }
    if (cooldown > 0) {
      pushFeed(`Aether Bridge cooling down for ${formatCooldownShort(cooldown)}.`, "combat", "warn");
      return;
    }
  }
  if (ability === "siphon") {
    const cooldown = abilityCooldownRemainingMs("siphon");
    if (!hasSiphonCapability()) {
      pushFeed("Siphon requires Cryptography.", "combat", "warn");
      return;
    }
    if ((state.strategicResources.CRYSTAL ?? 0) < 20) {
      pushFeed("Siphon needs 20 CRYSTAL.", "combat", "warn");
      return;
    }
    if (cooldown > 0) {
      pushFeed(`Siphon cooling down for ${formatCooldownShort(cooldown)}.`, "combat", "warn");
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
  if (state.crystalTargeting.ability !== "aether_bridge" && hostileObservatoryProtectingTile(tile)) {
    pushFeed("Blocked by observatory field.", "combat", "warn");
    return false;
  }
  if (!requireAuthedSession()) return false;
  const ability = state.crystalTargeting.ability;
  if (ability === "aether_bridge") {
    ws.send(JSON.stringify({ type: "CAST_AETHER_BRIDGE", x: tile.x, y: tile.y }));
  } else {
    ws.send(JSON.stringify({ type: "SIPHON_TILE", x: tile.x, y: tile.y }));
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
  if (summary.available <= 0 && enabledWithoutSlot) {
    return tileActionAvailability(true, developmentSlotReason(summary), cost ? `${cost} • queues` : "Queues when slot frees up");
  }
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
  if (tile.terrain === "SEA") return [];
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
  const queuedSettlement = hasQueuedSettlementForTile(state.developmentQueue, key(tile.x, tile.y));
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
  if (tile.shardSite) {
    return [
      {
        id: "collect_shard",
        label: tile.shardSite.kind === "FALL" ? "Collect Shardfall" : "Collect Shards",
        detail:
          tile.shardSite.kind === "FALL"
            ? `${tile.shardSite.amount} shard${tile.shardSite.amount === 1 ? "" : "s"} from active shard rain`
            : `${tile.shardSite.amount} shard${tile.shardSite.amount === 1 ? "" : "s"} recovered from this cache`
      },
      createMountainAction()
    ];
  }
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
    const isSettlementTile = tile.town?.populationTier === "SETTLEMENT";
    const y = (tile as Tile & { yield?: { gold?: number; strategic?: Record<string, number> } }).yield;
    const hasYield =
      Boolean(y && ((y.gold ?? 0) > 0.01 || Object.values(y.strategic ?? {}).some((v) => Number(v) > 0.01)));
    const hasBlockingStructure = Boolean(tile.fort || tile.siegeOutpost || tile.observatory || tile.economicStructure);
    const supportedTowns = tile.ownershipState === "SETTLED" ? supportedOwnedTownsForTile(tile) : [];
    const supportedTown = supportedTowns.length === 1 ? supportedTowns[0] : undefined;
    const supportedDocks = tile.ownershipState === "SETTLED" ? supportedOwnedDocksForTile(tile) : [];
    const supportedDock = supportedDocks.length === 1 ? supportedDocks[0] : undefined;
    if (tile.ownershipState === "SETTLED" && hasYield) out.push({ id: "collect_yield", label: "Collect Yield" });
    if (tile.sabotage) {
      out.push({
        id: "purge_siphon",
        label: "Purge Siphon",
        ...tileActionAvailability((state.strategicResources.CRYSTAL ?? 0) >= 10, "Need 10 CRYSTAL", "10 CRYSTAL")
      });
    }
    if (tile.economicStructure?.type === "FUR_SYNTHESIZER" || tile.economicStructure?.type === "ADVANCED_FUR_SYNTHESIZER") {
      out.push({
        id: "overload_fur_synthesizer" as TileActionDef["id"],
        label: "Overload Fur Synth",
        detail: buildDetailTextForAction("overload_fur_synthesizer", tile),
        ...tileActionAvailability(
          state.techIds.includes("overload-protocols") && state.gold >= 1000 && tile.economicStructure.status !== "under_construction",
          !state.techIds.includes("overload-protocols") ? "Requires Overload Protocols" : tile.economicStructure.status === "under_construction" ? "Fur Synthesizer still building" : "Need 1000 gold",
          "1000 gold • instant 25 SUPPLY • 1h shutdown"
        )
      });
    }
    if (tile.economicStructure?.type === "IRONWORKS" || tile.economicStructure?.type === "ADVANCED_IRONWORKS") {
      out.push({
        id: "overload_ironworks" as TileActionDef["id"],
        label: "Overload Ironworks",
        detail: buildDetailTextForAction("overload_ironworks", tile),
        ...tileActionAvailability(
          state.techIds.includes("overload-protocols") && state.gold >= 1000 && tile.economicStructure.status !== "under_construction",
          !state.techIds.includes("overload-protocols") ? "Requires Overload Protocols" : tile.economicStructure.status === "under_construction" ? "Ironworks still building" : "Need 1000 gold",
          "1000 gold • instant 25 IRON • 1h shutdown"
        )
      });
    }
    if (tile.economicStructure?.type === "CRYSTAL_SYNTHESIZER" || tile.economicStructure?.type === "ADVANCED_CRYSTAL_SYNTHESIZER") {
      out.push({
        id: "overload_crystal_synthesizer" as TileActionDef["id"],
        label: "Overload Synthesizer",
        detail: buildDetailTextForAction("overload_crystal_synthesizer", tile),
        ...tileActionAvailability(
          state.techIds.includes("overload-protocols") && state.gold >= 1000 && tile.economicStructure.status !== "under_construction",
          !state.techIds.includes("overload-protocols") ? "Requires Overload Protocols" : tile.economicStructure.status === "under_construction" ? "Synthesizer still building" : "Need 1000 gold",
          "1000 gold • instant 16 CRYSTAL • 1h shutdown"
        )
      });
    }
    if (tile.economicStructure?.type === "FUR_SYNTHESIZER") {
      out.push({
        id: "upgrade_fur_synthesizer" as TileActionDef["id"],
        label: "Upgrade Fur Synth",
        detail: buildDetailTextForAction("upgrade_fur_synthesizer", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.techIds.includes("advanced-synthetication") && state.gold >= structureGoldCost("ADVANCED_FUR_SYNTHESIZER") && (state.strategicResources.SUPPLY ?? 0) >= 40,
          !state.techIds.includes("advanced-synthetication") ? "Requires Advanced Synthetication" : state.gold < structureGoldCost("ADVANCED_FUR_SYNTHESIZER") ? `Need ${structureGoldCost("ADVANCED_FUR_SYNTHESIZER")} gold` : "Need 40 SUPPLY",
          `${structureCostText("ADVANCED_FUR_SYNTHESIZER")} • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m • 21.6 SUPPLY/day`,
          slots
        )
      });
    }
    if (tile.economicStructure?.type === "IRONWORKS") {
      out.push({
        id: "upgrade_ironworks" as TileActionDef["id"],
        label: "Upgrade Ironworks",
        detail: buildDetailTextForAction("upgrade_ironworks", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.techIds.includes("advanced-synthetication") && state.gold >= structureGoldCost("ADVANCED_IRONWORKS") && (state.strategicResources.IRON ?? 0) >= 40,
          !state.techIds.includes("advanced-synthetication") ? "Requires Advanced Synthetication" : state.gold < structureGoldCost("ADVANCED_IRONWORKS") ? `Need ${structureGoldCost("ADVANCED_IRONWORKS")} gold` : "Need 40 IRON",
          `${structureCostText("ADVANCED_IRONWORKS")} • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m • 21.6 IRON/day`,
          slots
        )
      });
    }
    if (tile.economicStructure?.type === "CRYSTAL_SYNTHESIZER") {
      out.push({
        id: "upgrade_crystal_synthesizer" as TileActionDef["id"],
        label: "Upgrade Crystal Synth",
        detail: buildDetailTextForAction("upgrade_crystal_synthesizer", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.techIds.includes("advanced-synthetication") && state.gold >= structureGoldCost("ADVANCED_CRYSTAL_SYNTHESIZER") && (state.strategicResources.CRYSTAL ?? 0) >= 40,
          !state.techIds.includes("advanced-synthetication") ? "Requires Advanced Synthetication" : state.gold < structureGoldCost("ADVANCED_CRYSTAL_SYNTHESIZER") ? `Need ${structureGoldCost("ADVANCED_CRYSTAL_SYNTHESIZER")} gold` : "Need 40 CRYSTAL",
          `${structureCostText("ADVANCED_CRYSTAL_SYNTHESIZER")} • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m • 14.4 CRYSTAL/day`,
          slots
        )
      });
    }
    if (tile.ownershipState === "FRONTIER" && !queuedSettlement)
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
    if (!tile.fort && !tile.siegeOutpost && !tile.observatory && !tile.economicStructure && !isSettlementTile) {
      const isBorderOrDock = Boolean(tile.dockId || isOwnedBorderTile(tile.x, tile.y));
      out.push({
        id: "build_wooden_fort" as TileActionDef["id"],
        label: "Build Wooden Fort",
        detail: buildDetailTextForAction("build_wooden_fort", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.techIds.includes("alchemy") &&
            isBorderOrDock &&
            !tile.resource &&
            !tile.town &&
            state.gold >= structureGoldCost("WOODEN_FORT"),
          !state.techIds.includes("alchemy")
            ? "Requires Alchemy"
            : !isBorderOrDock
              ? "Needs border or dock tile"
              : tile.resource || tile.town
                ? "Needs empty owned land"
                : `Need ${structureGoldCost("WOODEN_FORT")} gold`,
          `${structureCostText("WOODEN_FORT")} • ${Math.round(WOODEN_FORT_BUILD_MS / 60000)}m • def x${WOODEN_FORT_DEFENSE_MULT.toFixed(2)}`,
          slots
        )
      });
    }
    if (tile.ownershipState === "SETTLED" && !tile.fort && !isSettlementTile) {
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
    if (tile.ownershipState !== "SETTLED" && !tile.fort && !tile.siegeOutpost && !tile.observatory && !tile.economicStructure && !isSettlementTile) {
      out.push({
        id: "build_light_outpost" as TileActionDef["id"],
        label: "Build Light Outpost",
        detail: buildDetailTextForAction("build_light_outpost", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.techIds.includes("alchemy") &&
            isOwnedBorderTile(tile.x, tile.y) &&
            !tile.resource &&
            !tile.town &&
            !tile.dockId &&
            state.gold >= structureGoldCost("LIGHT_OUTPOST"),
          !state.techIds.includes("alchemy")
            ? "Requires Alchemy"
            : !isOwnedBorderTile(tile.x, tile.y)
              ? "Needs border tile"
              : tile.resource || tile.town || tile.dockId
                ? "Needs empty owned land"
                : `Need ${structureGoldCost("LIGHT_OUTPOST")} gold`,
          `${structureCostText("LIGHT_OUTPOST")} • ${Math.round(LIGHT_OUTPOST_BUILD_MS / 60000)}m • atk x${LIGHT_OUTPOST_ATTACK_MULT.toFixed(2)}`,
          slots
        )
      });
    }
    if (tile.ownershipState === "SETTLED" && !tile.siegeOutpost && !isSettlementTile) {
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
          id: "build_fur_synthesizer",
          label: "Build Fur Synthesizer",
          detail: buildDetailTextForAction("build_fur_synthesizer", tile, supportedTown),
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
            !hasBlockingStructure && state.techIds.includes("alchemy") && state.gold >= 2400,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("alchemy") ? "Requires Alchemy" : "Need 2400 gold",
            `2400 gold • ${Math.round(ECONOMIC_STRUCTURE_BUILD_MS / 60000)}m • 18 IRON/day • 120 gold / 10m`,
            slots
          )
        });
        out.push({
          id: "build_crystal_synthesizer",
          label: "Build Crystal Synthesizer",
          detail: buildDetailTextForAction("build_crystal_synthesizer", tile, supportedTown),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && state.techIds.includes("crystal-lattices") && state.gold >= 2800,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("crystal-lattices") ? "Requires Crystal Lattices" : "Need 2800 gold",
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
        out.push({ id: "build_fur_synthesizer", label: "Build Fur Synthesizer", disabled: true, disabledReason: "Support tile touches multiple towns" });
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
    if (tile.town?.populationTier !== "SETTLEMENT") out.push({ id: "abandon_territory", label: "Abandon Territory" });
    return out;
  }
  if (isTileOwnedByAlly(tile)) return [];
  if (tile.ownerId === "barbarian") {
    const previewDetail = attackPreviewDetailForTarget(tile);
    const breachPreviewDetail = attackPreviewDetailForTarget(tile, "breakthrough");
    const reachable = Boolean(pickOriginForTarget(tile.x, tile.y, false)) || Boolean(tile.dockId);
    const actions: TileActionDef[] = [
      {
        id: "launch_attack",
        label: "Launch Attack",
        ...(previewDetail ? { detail: previewDetail } : {}),
        ...tileActionAvailability(
          reachable && state.gold >= FRONTIER_CLAIM_COST,
          !reachable ? "No bordering origin tile or linked dock" : `Need ${FRONTIER_CLAIM_COST} gold`,
          `${FRONTIER_CLAIM_COST} gold`
        )
      }
    ];
    if (hasBreakthroughCapability()) {
      actions.push({
        id: "launch_breach_attack",
        label: "Launch Breach Attack",
        ...(breachPreviewDetail ? { detail: breachPreviewDetail } : {}),
        ...tileActionAvailability(
          (Boolean(pickOriginForTarget(tile.x, tile.y)) || Boolean(tile.dockId)) && state.gold >= 2 && (state.strategicResources.IRON ?? 0) >= 1,
          !(Boolean(pickOriginForTarget(tile.x, tile.y)) || Boolean(tile.dockId))
            ? "No bordering origin tile or linked dock"
            : state.gold < 2
              ? "Need 2 gold"
              : "Need 1 IRON",
          "2 gold + 1 IRON"
        )
      });
    }
    actions.push(createMountainAction());
    return actions;
  }
  const reachable = Boolean(pickOriginForTarget(tile.x, tile.y, false)) || Boolean(tile.dockId);
  const targetShielded = Boolean(tile.ownerId && tile.ownerId !== state.me && ownerSpawnShieldActive(tile.ownerId));
  const targetShieldedReason = "Empire is under spawn protection";
  const out: TileActionDef[] = [
    {
      id: "launch_attack",
      label: "Launch Attack",
      ...(attackPreviewDetailForTarget(tile) ? { detail: attackPreviewDetailForTarget(tile) } : {}),
      ...tileActionAvailability(
        !targetShielded && reachable && state.gold >= FRONTIER_CLAIM_COST,
        targetShielded ? targetShieldedReason : !reachable ? "No bordering origin tile or linked dock" : `Need ${FRONTIER_CLAIM_COST} gold`,
        `${FRONTIER_CLAIM_COST} gold`
      )
    },
  ];
  if (hasBreakthroughCapability()) {
    out.push({
      id: "launch_breach_attack",
      label: "Launch Breach Attack",
      ...(attackPreviewDetailForTarget(tile, "breakthrough") ? { detail: attackPreviewDetailForTarget(tile, "breakthrough") } : {}),
      ...tileActionAvailability(
        !targetShielded && reachable && state.gold >= 2 && (state.strategicResources.IRON ?? 0) >= 1,
        targetShielded
          ? targetShieldedReason
          : !reachable
            ? "No bordering origin tile or linked dock"
            : state.gold < 2
              ? "Need 2 gold"
              : "Need 1 IRON",
        "2 gold + 1 IRON"
      )
    });
  }
  const observatoryProtection = hostileObservatoryProtectingTile(tile);
  out.push({
    id: "aether_bridge",
    label: "Aether Bridge",
    ...tileActionAvailability(
      hasAetherBridgeCapability() &&
        tile.terrain === "LAND" &&
        [
          terrainAt(tile.x, tile.y - 1),
          terrainAt(tile.x + 1, tile.y),
          terrainAt(tile.x, tile.y + 1),
          terrainAt(tile.x - 1, tile.y)
        ].includes("SEA") &&
        (!tile.ownerId || !observatoryProtection) &&
        abilityCooldownRemainingMs("aether_bridge") <= 0 &&
        (state.strategicResources.CRYSTAL ?? 0) >= 30,
      !hasAetherBridgeCapability()
        ? "Requires Navigation"
        : tile.terrain !== "LAND" || ![
              terrainAt(tile.x, tile.y - 1),
              terrainAt(tile.x + 1, tile.y),
              terrainAt(tile.x, tile.y + 1),
              terrainAt(tile.x - 1, tile.y)
            ].includes("SEA")
          ? "Target must be coastal land"
          : tile.ownerId && observatoryProtection
            ? "Landing blocked by enemy observatory"
            : abilityCooldownRemainingMs("aether_bridge") > 0
              ? `Cooldown ${formatCooldownShort(abilityCooldownRemainingMs("aether_bridge"))}`
              : "Need 30 CRYSTAL",
      "30 CRYSTAL • crosses up to 4 sea tiles"
    )
  });
  if (tile.ownerId && tile.ownerId !== state.me && tile.ownerId !== "barbarian") {
    const activeTruce = activeTruceWithPlayer(tile.ownerId);
    if (activeTruce) {
      out.push({
        id: "break_truce",
        label: "Break Truce",
        ...tileActionAvailability(true, "", "Break current truce")
      });
    } else {
      out.push({
        id: "offer_truce_12h",
        label: "Offer Truce 12h",
        ...tileActionAvailability(state.activeTruces.length < 1, "You already have an active truce", "12h")
      });
      out.push({
        id: "offer_truce_24h",
        label: "Offer Truce 24h",
        ...tileActionAvailability(state.activeTruces.length < 1, "You already have an active truce", "24h")
      });
    }
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
    const sabotageCooldown = abilityCooldownRemainingMs("siphon");
    out.push({
      id: "siphon_tile",
      label: "Siphon",
      ...tileActionAvailability(
        hasSiphonCapability() &&
          !observatoryProtection &&
          sabotageCooldown <= 0 &&
          (state.strategicResources.CRYSTAL ?? 0) >= 20 &&
          Boolean(tile.resource || tile.town) &&
          !tile.sabotage,
        !hasSiphonCapability()
          ? "Requires Cryptography"
          : observatoryProtection
            ? "Blocked by observatory field"
          : tile.sabotage
            ? "Already siphoned"
            : !(tile.resource || tile.town)
              ? "Town or resource only"
              : sabotageCooldown > 0
                ? `Cooldown ${formatCooldownShort(sabotageCooldown)}`
                : "Need 20 CRYSTAL",
        "20 CRYSTAL • steals 50% for 30m"
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
      const tile = state.tileActionMenu.currentTileKey ? state.tiles.get(state.tileActionMenu.currentTileKey) : undefined;
      if (!tile) return;
      if (btn.dataset.progressAction === "cancel_queued_settlement") {
        cancelQueuedSettlement(key(tile.x, tile.y));
        hideTileActionMenu();
        return;
      }
      if (btn.dataset.progressAction !== "cancel_structure_build") return;
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
    if (hasBreakthroughCapability()) {
      actions.push({
        id: "launch_breach_attack",
        label: `Launch Breach Attack (${enemyCount})`,
        cost: "2 gold + 1 IRON each"
      });
    }
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

const handleTileAction = (actionId: string, targetKeyOverride?: string, originKeyOverride?: string): void => {
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
  if (actionId === "collect_shard") collectSelectedShard();
  if (actionId === "build_fortification")
    sendDevelopmentBuild({ type: "BUILD_FORT", x: selected.x, y: selected.y }, () => applyOptimisticStructureBuild(selected.x, selected.y, "FORT"), {
      x: selected.x,
      y: selected.y,
      label: `Fortification at (${selected.x}, ${selected.y})`,
      optimisticKind: "FORT"
    });
  if (actionId === "build_wooden_fort")
    sendDevelopmentBuild(
      { type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "WOODEN_FORT" },
      () => applyOptimisticStructureBuild(selected.x, selected.y, "WOODEN_FORT"),
      { x: selected.x, y: selected.y, label: `Wooden Fort at (${selected.x}, ${selected.y})`, optimisticKind: "WOODEN_FORT" }
    );
  if (actionId === "build_observatory")
    sendDevelopmentBuild({ type: "BUILD_OBSERVATORY", x: selected.x, y: selected.y }, () => applyOptimisticStructureBuild(selected.x, selected.y, "OBSERVATORY"), {
      x: selected.x,
      y: selected.y,
      label: `Observatory at (${selected.x}, ${selected.y})`,
      optimisticKind: "OBSERVATORY"
    });
  if (
    actionId === "build_farmstead"
  )
    sendDevelopmentBuild(
      { type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "FARMSTEAD" },
      () => applyOptimisticStructureBuild(selected.x, selected.y, "FARMSTEAD"),
      { x: selected.x, y: selected.y, label: `Farmstead at (${selected.x}, ${selected.y})`, optimisticKind: "FARMSTEAD" }
    );
  if (actionId === "build_camp")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "CAMP" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "CAMP"), {
      x: selected.x,
      y: selected.y,
      label: `Camp at (${selected.x}, ${selected.y})`,
      optimisticKind: "CAMP"
    });
  if (actionId === "build_mine")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "MINE" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "MINE"), {
      x: selected.x,
      y: selected.y,
      label: `Mine at (${selected.x}, ${selected.y})`,
      optimisticKind: "MINE"
    });
  if (actionId === "build_market")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "MARKET" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "MARKET"), {
      x: selected.x,
      y: selected.y,
      label: `Market at (${selected.x}, ${selected.y})`,
      optimisticKind: "MARKET"
    });
  if (actionId === "build_granary")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "GRANARY" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "GRANARY"), {
      x: selected.x,
      y: selected.y,
      label: `Granary at (${selected.x}, ${selected.y})`,
      optimisticKind: "GRANARY"
    });
  if (actionId === "build_bank")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "BANK" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "BANK"), {
      x: selected.x,
      y: selected.y,
      label: `Bank at (${selected.x}, ${selected.y})`,
      optimisticKind: "BANK"
    });
  if (actionId === "build_airport")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "AIRPORT" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "AIRPORT"), {
      x: selected.x,
      y: selected.y,
      label: `Airport at (${selected.x}, ${selected.y})`,
      optimisticKind: "AIRPORT"
    });
  if (actionId === "build_caravanary")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "CARAVANARY" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "CARAVANARY"), {
      x: selected.x,
      y: selected.y,
      label: `Caravanary at (${selected.x}, ${selected.y})`,
      optimisticKind: "CARAVANARY"
    });
  if (actionId === "build_fur_synthesizer")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "FUR_SYNTHESIZER" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "FUR_SYNTHESIZER"), {
      x: selected.x,
      y: selected.y,
      label: `Fur Synthesizer at (${selected.x}, ${selected.y})`,
      optimisticKind: "FUR_SYNTHESIZER"
    });
  if (actionId === "upgrade_fur_synthesizer")
    sendDevelopmentBuild(
      { type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "ADVANCED_FUR_SYNTHESIZER" },
      () => applyOptimisticStructureBuild(selected.x, selected.y, "ADVANCED_FUR_SYNTHESIZER"),
      { x: selected.x, y: selected.y, label: `Advanced Fur Synthesizer at (${selected.x}, ${selected.y})`, optimisticKind: "ADVANCED_FUR_SYNTHESIZER" }
    );
  if (actionId === "build_ironworks")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "IRONWORKS" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "IRONWORKS"), {
      x: selected.x,
      y: selected.y,
      label: `Ironworks at (${selected.x}, ${selected.y})`,
      optimisticKind: "IRONWORKS"
    });
  if (actionId === "upgrade_ironworks")
    sendDevelopmentBuild(
      { type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "ADVANCED_IRONWORKS" },
      () => applyOptimisticStructureBuild(selected.x, selected.y, "ADVANCED_IRONWORKS"),
      { x: selected.x, y: selected.y, label: `Advanced Ironworks at (${selected.x}, ${selected.y})`, optimisticKind: "ADVANCED_IRONWORKS" }
    );
  if (actionId === "build_crystal_synthesizer")
    sendDevelopmentBuild(
      { type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "CRYSTAL_SYNTHESIZER" },
      () => applyOptimisticStructureBuild(selected.x, selected.y, "CRYSTAL_SYNTHESIZER"),
      { x: selected.x, y: selected.y, label: `Crystal Synthesizer at (${selected.x}, ${selected.y})`, optimisticKind: "CRYSTAL_SYNTHESIZER" }
    );
  if (actionId === "upgrade_crystal_synthesizer")
    sendDevelopmentBuild(
      { type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "ADVANCED_CRYSTAL_SYNTHESIZER" },
      () => applyOptimisticStructureBuild(selected.x, selected.y, "ADVANCED_CRYSTAL_SYNTHESIZER"),
      { x: selected.x, y: selected.y, label: `Advanced Crystal Synthesizer at (${selected.x}, ${selected.y})`, optimisticKind: "ADVANCED_CRYSTAL_SYNTHESIZER" }
    );
  if (actionId === "build_fuel_plant")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "FUEL_PLANT" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "FUEL_PLANT"), {
      x: selected.x,
      y: selected.y,
      label: `Fuel Plant at (${selected.x}, ${selected.y})`,
      optimisticKind: "FUEL_PLANT"
    });
  if (actionId === "build_foundry")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "FOUNDRY" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "FOUNDRY"), {
      x: selected.x,
      y: selected.y,
      label: `Foundry at (${selected.x}, ${selected.y})`,
      optimisticKind: "FOUNDRY"
    });
  if (actionId === "build_garrison_hall")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "GARRISON_HALL" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "GARRISON_HALL"), {
      x: selected.x,
      y: selected.y,
      label: `Garrison Hall at (${selected.x}, ${selected.y})`,
      optimisticKind: "GARRISON_HALL"
    });
  if (actionId === "build_customs_house")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "CUSTOMS_HOUSE" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "CUSTOMS_HOUSE"), {
      x: selected.x,
      y: selected.y,
      label: `Customs House at (${selected.x}, ${selected.y})`,
      optimisticKind: "CUSTOMS_HOUSE"
    });
  if (actionId === "build_governors_office")
    sendDevelopmentBuild(
      { type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "GOVERNORS_OFFICE" },
      () => applyOptimisticStructureBuild(selected.x, selected.y, "GOVERNORS_OFFICE"),
      { x: selected.x, y: selected.y, label: `Governor's Office at (${selected.x}, ${selected.y})`, optimisticKind: "GOVERNORS_OFFICE" }
    );
  if (actionId === "build_radar_system")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "RADAR_SYSTEM" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "RADAR_SYSTEM"), {
      x: selected.x,
      y: selected.y,
      label: `Radar System at (${selected.x}, ${selected.y})`,
      optimisticKind: "RADAR_SYSTEM"
    });
  if (actionId === "build_siege_camp")
    sendDevelopmentBuild({ type: "BUILD_SIEGE_OUTPOST", x: selected.x, y: selected.y }, () => applyOptimisticStructureBuild(selected.x, selected.y, "SIEGE_OUTPOST"), {
      x: selected.x,
      y: selected.y,
      label: `Siege Camp at (${selected.x}, ${selected.y})`,
      optimisticKind: "SIEGE_OUTPOST"
    });
  if (actionId === "build_light_outpost")
    sendDevelopmentBuild(
      { type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "LIGHT_OUTPOST" },
      () => applyOptimisticStructureBuild(selected.x, selected.y, "LIGHT_OUTPOST"),
      { x: selected.x, y: selected.y, label: `Light Outpost at (${selected.x}, ${selected.y})`, optimisticKind: "LIGHT_OUTPOST" }
    );
  if (actionId === "overload_fur_synthesizer") sendGameMessage({ type: "OVERLOAD_SYNTHESIZER", x: selected.x, y: selected.y });
  if (actionId === "overload_ironworks") sendGameMessage({ type: "OVERLOAD_SYNTHESIZER", x: selected.x, y: selected.y });
  if (actionId === "overload_crystal_synthesizer") sendGameMessage({ type: "OVERLOAD_SYNTHESIZER", x: selected.x, y: selected.y });
  if (actionId === "create_mountain") sendGameMessage({ type: "CREATE_MOUNTAIN", x: selected.x, y: selected.y });
  if (actionId === "remove_mountain") sendGameMessage({ type: "REMOVE_MOUNTAIN", x: selected.x, y: selected.y });
  if (actionId === "abandon_territory") sendGameMessage({ type: "UNCAPTURE_TILE", x: selected.x, y: selected.y });
  if (actionId === "offer_truce_12h" && selected.ownerId && selected.ownerId !== state.me && selected.ownerId !== "barbarian") {
    const targetName = playerNameForOwner(selected.ownerId);
    if (targetName) sendTruceRequest(targetName, 12);
  }
  if (actionId === "offer_truce_24h" && selected.ownerId && selected.ownerId !== state.me && selected.ownerId !== "barbarian") {
    const targetName = playerNameForOwner(selected.ownerId);
    if (targetName) sendTruceRequest(targetName, 24);
  }
  if (actionId === "break_truce" && selected.ownerId && selected.ownerId !== state.me && selected.ownerId !== "barbarian") {
    breakTruce(selected.ownerId);
  }
  if (actionId === "reveal_empire" && selected.ownerId && selected.ownerId !== state.me && selected.ownerId !== "barbarian") {
    sendGameMessage({ type: "REVEAL_EMPIRE", targetPlayerId: selected.ownerId });
  }
  if (actionId === "aether_bridge") beginCrystalTargeting("aether_bridge");
  if (actionId === "siphon_tile") beginCrystalTargeting("siphon");
  if (actionId === "purge_siphon") sendGameMessage({ type: "PURGE_SIPHON", x: selected.x, y: selected.y });
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
  const queueableWhenBusy = !hasDevelopmentSlot;
  const hasBlockingStructure = Boolean(tile.fort || tile.siegeOutpost || tile.observatory || tile.economicStructure);
  const fortGoldCost = structureGoldCost("FORT");
  const siegeGoldCost = structureGoldCost("SIEGE_OUTPOST");
  const observatoryGoldCost = structureGoldCost("OBSERVATORY");
  const canAffordFort = state.gold >= fortGoldCost;
  const canAffordSiege = state.gold >= siegeGoldCost;
  const canAffordObservatory =
    tile.ownershipState === "SETTLED" &&
    !tile.fort &&
    !tile.siegeOutpost &&
    !tile.observatory &&
    !tile.economicStructure &&
    state.techIds.includes("cartography") &&
    state.gold >= observatoryGoldCost &&
    (state.strategicResources.CRYSTAL ?? 0) >= 45;
  const canBuildFarmstead =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    (tile.resource === "FARM" || tile.resource === "FISH") &&
    state.techIds.includes("agriculture") &&
    state.gold >= 700 &&
    (state.strategicResources.FOOD ?? 0) >= 20;
  const canBuildCamp =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    (tile.resource === "WOOD" || tile.resource === "FUR") &&
    state.techIds.includes("leatherworking") &&
    state.gold >= 800 &&
    (state.strategicResources.SUPPLY ?? 0) >= 30;
  const canBuildMine =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    (tile.resource === "IRON" || tile.resource === "GEMS") &&
    state.techIds.includes("mining") &&
    state.gold >= 800 &&
    (state.strategicResources[tile.resource === "IRON" ? "IRON" : "CRYSTAL"] ?? 0) >= 30;
  const canBuildMarket =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    Boolean(tile.town) &&
    tile.town?.populationTier !== "SETTLEMENT" &&
    state.techIds.includes("trade") &&
    state.gold >= 1200 &&
    (state.strategicResources.CRYSTAL ?? 0) >= 40;
  const canBuildGranary =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    Boolean(tile.town) &&
    tile.town?.populationTier !== "SETTLEMENT" &&
    state.techIds.includes("pottery") &&
    state.gold >= 700 &&
    (state.strategicResources.FOOD ?? 0) >= 40;
  const settlementQueued = hasQueuedSettlementForTile(state.developmentQueue, key(x, y));
  holdBuildMenuEl.innerHTML = `
    <div class="hold-menu-card">
      <div class="hold-menu-title">Build on (${x}, ${y})</div>
      <button class="hold-menu-btn" data-build="settle" ${tile.ownershipState === "FRONTIER" && canAffordCost(state.gold, SETTLE_COST) && !settlementQueued ? "" : "disabled"}>
        <span>Settle Tile</span>
        <small>${SETTLE_COST} gold • ${(settleDurationMsForTile(x, y) / 1000).toFixed(0)}s${isForestTile(x, y) ? " (Forest)" : ""} • converts frontier to settled${settlementQueued ? " • already queued" : queueableWhenBusy && tile.ownershipState === "FRONTIER" ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="fort" ${canAffordFort ? "" : "disabled"}>
        <span>Fort</span>
        <small>${structureCostText("FORT")} • ${(FORT_BUILD_MS / 1000).toFixed(0)}s • def x${FORT_DEFENSE_MULT.toFixed(2)} • 1 gold / min${queueableWhenBusy ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="observatory" ${canAffordObservatory ? "" : "disabled"}>
        <span>Observatory</span>
        <small>${structureCostText("OBSERVATORY")} • +5 local vision • 0.025 crystal / min${queueableWhenBusy && canAffordObservatory ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="farmstead" ${canBuildFarmstead ? "" : "disabled"}>
        <span>Farmstead</span>
        <small>700 gold + 20 FOOD • +50% food output • 1 gold / 10m${queueableWhenBusy && canBuildFarmstead ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="camp" ${canBuildCamp ? "" : "disabled"}>
        <span>Camp</span>
        <small>800 gold + 30 SUPPLY • +50% supply output • 1.2 gold / 10m${queueableWhenBusy && canBuildCamp ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="mine" ${canBuildMine ? "" : "disabled"}>
        <span>Mine</span>
        <small>800 gold + 30 matching resource • +50% iron or crystal • 1.2 gold / 10m${queueableWhenBusy && canBuildMine ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="market" ${canBuildMarket ? "" : "disabled"}>
        <span>Market</span>
        <small>1200 gold + 40 CRYSTAL • +50% fed town gold • +50% town cap • 0.05 crystal / min${queueableWhenBusy && canBuildMarket ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="granary" ${canBuildGranary ? "" : "disabled"}>
        <span>Granary</span>
        <small>700 gold + 40 FOOD • +50% town gold cap • 1 gold / 10m${queueableWhenBusy && canBuildGranary ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="siege" ${canAffordSiege ? "" : "disabled"}>
        <span>Siege Outpost</span>
        <small>${structureCostText("SIEGE_OUTPOST")} • ${(SIEGE_OUTPOST_BUILD_MS / 1000).toFixed(0)}s • atk x${SIEGE_OUTPOST_ATTACK_MULT.toFixed(2)} • 1 gold / min${queueableWhenBusy ? " • queues" : ""}</small>
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
      sendDevelopmentBuild({ type: "BUILD_FORT", x, y }, () => applyOptimisticStructureBuild(x, y, "FORT"), {
        x,
        y,
        label: `Fort at (${x}, ${y})`,
        optimisticKind: "FORT"
      });
      hideHoldBuildMenu();
    };
  }
  if (siegeBtn) {
    siegeBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_SIEGE_OUTPOST", x, y }, () => applyOptimisticStructureBuild(x, y, "SIEGE_OUTPOST"), {
        x,
        y,
        label: `Siege outpost at (${x}, ${y})`,
        optimisticKind: "SIEGE_OUTPOST"
      });
      hideHoldBuildMenu();
    };
  }
  if (observatoryBtn) {
    observatoryBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_OBSERVATORY", x, y }, () => applyOptimisticStructureBuild(x, y, "OBSERVATORY"), {
        x,
        y,
        label: `Observatory at (${x}, ${y})`,
        optimisticKind: "OBSERVATORY"
      });
      hideHoldBuildMenu();
    };
  }
  if (farmsteadBtn) {
    farmsteadBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "FARMSTEAD" }, () => applyOptimisticStructureBuild(x, y, "FARMSTEAD"), {
        x,
        y,
        label: `Farmstead at (${x}, ${y})`,
        optimisticKind: "FARMSTEAD"
      });
      hideHoldBuildMenu();
    };
  }
  if (campBtn) {
    campBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "CAMP" }, () => applyOptimisticStructureBuild(x, y, "CAMP"), {
        x,
        y,
        label: `Camp at (${x}, ${y})`,
        optimisticKind: "CAMP"
      });
      hideHoldBuildMenu();
    };
  }
  if (mineBtn) {
    mineBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "MINE" }, () => applyOptimisticStructureBuild(x, y, "MINE"), {
        x,
        y,
        label: `Mine at (${x}, ${y})`,
        optimisticKind: "MINE"
      });
      hideHoldBuildMenu();
    };
  }
  if (marketBtn) {
    marketBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "MARKET" }, () => applyOptimisticStructureBuild(x, y, "MARKET"), {
        x,
        y,
        label: `Market at (${x}, ${y})`,
        optimisticKind: "MARKET"
      });
      hideHoldBuildMenu();
    };
  }
  if (granaryBtn) {
    granaryBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "GRANARY" }, () => applyOptimisticStructureBuild(x, y, "GRANARY"), {
        x,
        y,
        label: `Granary at (${x}, ${y})`,
        optimisticKind: "GRANARY"
      });
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
captureCloseBtn.onclick = () => {
  state.captureAlert = undefined;
  captureTimeEl.classList.remove("capture-loss");
  renderCaptureProgress();
};
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
    state.manpower = (p.manpower as number | undefined) ?? state.manpower;
    state.manpowerCap = (p.manpowerCap as number | undefined) ?? state.manpowerCap;
    state.manpowerRegenPerMinute = (p.manpowerRegenPerMinute as number | undefined) ?? state.manpowerRegenPerMinute;
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
    state.pendingTechUnlockId = "";
    state.domainIds = (p.domainIds as string[]) ?? [];
    state.revealCapacity = (p.revealCapacity as number) ?? state.revealCapacity;
    state.activeRevealTargets = (p.activeRevealTargets as string[]) ?? state.activeRevealTargets;
    state.abilityCooldowns =
      (p.abilityCooldowns as typeof state.abilityCooldowns | undefined) ?? state.abilityCooldowns;
    state.manpowerBreakdown =
      (p.manpowerBreakdown as typeof state.manpowerBreakdown | undefined) ?? state.manpowerBreakdown;
    applyPendingSettlementsFromServer(
      (p.pendingSettlements as Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined) ?? []
    );
    state.allies = (p.allies as string[]) ?? [];
    state.outgoingAllianceRequests = (msg.outgoingAllianceRequests as AllianceRequest[] | undefined) ?? [];
    const myTileColor = p.tileColor as string | undefined;
    if (myTileColor) {
      state.playerColors.set(state.me, myTileColor);
      authProfileColorEl.value = myTileColor;
    }
    const myVisualStyle = p.visualStyle as EmpireVisualStyle | undefined;
    if (myVisualStyle) state.playerVisualStyles.set(state.me, myVisualStyle);
    seedProfileSetupFields((p.name as string) || state.authUserLabel, myTileColor ?? authProfileColorEl.value);
    for (const s of ((msg.playerStyles as Array<{ id: string; name?: string; tileColor?: string; visualStyle?: EmpireVisualStyle; shieldUntil?: number }>) ?? [])) {
      if (s.name) state.playerNames.set(s.id, s.name);
      if (s.tileColor) state.playerColors.set(s.id, s.tileColor);
      if (s.visualStyle) state.playerVisualStyles.set(s.id, s.visualStyle);
      if (typeof s.shieldUntil === "number") state.playerShieldUntil.set(s.id, s.shieldUntil);
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
        selfOverall: LeaderboardOverallEntry | undefined;
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
    state.activeTruces = (msg.activeTruces as ActiveTruceView[]) ?? [];
    state.incomingTruceRequests = (msg.truceRequests as TruceRequest[]) ?? [];
    state.activeAetherBridges = (msg.activeAetherBridges as ActiveAetherBridgeView[]) ?? [];
    state.strategicReplayEvents = (p.strategicReplayEvents as StrategicReplayEvent[] | undefined) ?? [];
    resetStrategicReplayState();
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
      const existing = state.tiles.get(key(t.x, t.y));
      const mergedTile = mergeServerTileWithOptimisticState(mergeIncomingTileDetail(existing, t));
      state.tiles.set(key(mergedTile.x, mergedTile.y), mergedTile);
      maybeAnnounceShardSite(existing, mergedTile);
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
    state.manpower = (msg.manpower as number | undefined) ?? state.manpower;
    state.manpowerCap = (msg.manpowerCap as number | undefined) ?? state.manpowerCap;
    state.manpowerRegenPerMinute = (msg.manpowerRegenPerMinute as number | undefined) ?? state.manpowerRegenPerMinute;
    state.upkeepPerMinute =
      (msg.upkeepPerMinute as typeof state.upkeepPerMinute | undefined) ?? state.upkeepPerMinute;
    state.upkeepLastTick =
      (msg.upkeepLastTick as typeof state.upkeepLastTick | undefined) ?? state.upkeepLastTick;
    state.manpowerBreakdown =
      (msg.manpowerBreakdown as typeof state.manpowerBreakdown | undefined) ?? state.manpowerBreakdown;
    applyPendingSettlementsFromServer(
      (msg.pendingSettlements as Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined) ?? []
    );
    state.incomingAllianceRequests =
      (msg.incomingAllianceRequests as AllianceRequest[] | undefined) ?? state.incomingAllianceRequests;
    state.outgoingAllianceRequests =
      (msg.outgoingAllianceRequests as AllianceRequest[] | undefined) ?? state.outgoingAllianceRequests;
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
    state.currentResearch = (msg.currentResearch as typeof state.currentResearch | undefined) ?? undefined;
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
        selfOverall: LeaderboardOverallEntry | undefined;
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
        selfOverall: LeaderboardOverallEntry | undefined;
        byTiles: LeaderboardMetricEntry[];
        byIncome: LeaderboardMetricEntry[];
        byTechs: LeaderboardMetricEntry[];
      }) ?? state.leaderboard;
    state.seasonVictory = (msg.seasonVictory as SeasonVictoryObjectiveView[] | undefined) ?? state.seasonVictory;
    state.seasonWinner = (msg.seasonWinner as SeasonWinnerView | undefined) ?? state.seasonWinner;
    renderHud();
  }
  if (msg.type === "COMBAT_RESULT") {
    const resultReceivedAt = Date.now();
    const timing = msg.timing as { acceptedAt?: number; resolvesAt?: number; resultSentAt?: number } | undefined;
    if (
      msg.attackType === "EXPAND" &&
      typeof timing?.acceptedAt === "number" &&
      typeof timing?.resolvesAt === "number" &&
      typeof timing?.resultSentAt === "number"
    ) {
      console.info("[neutral-expand-timing]", {
        target: msg.target,
        acceptedAt: timing.acceptedAt,
        resolvesAt: timing.resolvesAt,
        resultSentAt: timing.resultSentAt,
        resultReceivedAt,
        timerDelayMs: timing.resultSentAt - timing.resolvesAt,
        deliveryDelayMs: resultReceivedAt - timing.resultSentAt,
        totalElapsedMs: resultReceivedAt - timing.acceptedAt
      });
    }
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
      showCaptureAlert(resultAlert.title, resultAlert.detail, resultAlert.tone, resultAlert.manpowerLoss);
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
        ...(typeof predictedAlert.manpowerLoss === "number" ? { manpowerLoss: predictedAlert.manpowerLoss } : {}),
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
      if ("detailLevel" in update) merged.detailLevel = update.detailLevel;
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
      if ("shardSite" in update) {
        if (update.shardSite) merged.shardSite = update.shardSite;
        else delete merged.shardSite;
      }
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
      const resolved = mergeServerTileWithOptimisticState(mergeIncomingTileDetail(existing, merged));
      state.tiles.set(updateKey, resolved);
      maybeAnnounceShardSite(existing, resolved);
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
    state.pendingTechUnlockId = "";
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
    if (status === "completed") {
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
    if (request && !state.incomingAllianceRequests.some((existing) => existing.id === request.id)) {
      const fromName = msg.fromName as string | undefined;
      if (fromName) request.fromName = fromName;
      state.incomingAllianceRequests.push(request);
    }
    pushFeed(`Incoming alliance request${request?.fromName ? ` from ${request.fromName}` : ""}`, "alliance", "info");
    renderHud();
  }
  if (msg.type === "ALLIANCE_REQUESTED") {
    const request = msg.request as AllianceRequest | undefined;
    if (request && !state.outgoingAllianceRequests.some((existing) => existing.id === request.id)) {
      state.outgoingAllianceRequests.push(request);
    }
    const targetName =
      (msg.targetName as string | undefined) ??
      request?.toName ??
      (request ? playerNameForOwner(request.toPlayerId) : undefined);
    pushFeed(`Alliance request sent${targetName ? ` to ${targetName}` : ""}`, "alliance", "success");
    renderHud();
  }
  if (msg.type === "ALLIANCE_UPDATE") {
    state.allies = (msg.allies as string[]) ?? [];
    state.incomingAllianceRequests = (msg.incomingAllianceRequests as AllianceRequest[] | undefined) ?? state.incomingAllianceRequests;
    state.outgoingAllianceRequests = (msg.outgoingAllianceRequests as AllianceRequest[] | undefined) ?? state.outgoingAllianceRequests;
    pushFeed(`Alliances updated (${state.allies.length})`, "alliance", "info");
    renderHud();
  }
  if (msg.type === "TRUCE_REQUEST_INCOMING") {
    const request = (msg.request as TruceRequest | undefined) ?? undefined;
    if (request) {
      const fromName = msg.fromName as string | undefined;
      if (fromName) request.fromName = fromName;
      state.incomingTruceRequests = [...state.incomingTruceRequests.filter((entry) => entry.id !== request.id), request];
    }
    pushFeed(`Incoming truce offer${request?.fromName ? ` from ${request.fromName}` : ""}.`, "alliance", "info");
    renderHud();
  }
  if (msg.type === "TRUCE_REQUESTED") {
    const request = msg.request as TruceRequest | undefined;
    const targetName = (msg.targetName as string | undefined) ?? request?.toName ?? (request ? playerNameForOwner(request.toPlayerId) : undefined);
    pushFeed(`Truce offered${targetName ? ` to ${targetName}` : ""}.`, "alliance", "success");
    renderHud();
  }
  if (msg.type === "TRUCE_UPDATE") {
    state.activeTruces = (msg.activeTruces as ActiveTruceView[]) ?? state.activeTruces;
    state.incomingTruceRequests = (msg.incomingTruceRequests as TruceRequest[]) ?? state.incomingTruceRequests;
    const announcement = msg.announcement as string | undefined;
    if (announcement) pushFeed(announcement, "alliance", "warn");
    renderHud();
  }
  if (msg.type === "AETHER_BRIDGE_UPDATE") {
    state.activeAetherBridges = (msg.bridges as ActiveAetherBridgeView[]) ?? state.activeAetherBridges;
    renderHud();
  }
  if (msg.type === "STRATEGIC_REPLAY_EVENT") {
    const event = (msg.event as StrategicReplayEvent | undefined) ?? undefined;
    if (event) {
      state.strategicReplayEvents.push(event);
      if (!state.replayActive) resetStrategicReplayState();
      else if (!state.replayPlaying && state.replayIndex >= Math.max(0, state.strategicReplayEvents.length - 2)) {
        resetStrategicReplayState();
      }
    }
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
    const shouldResetFrontierAction = shouldResetFrontierActionStateForError(errorCode);
    if (shouldResetFrontierAction) {
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
    } else if (failedTargetKey) {
      clearOptimisticTileState(failedTargetKey, true);
    }
    state.attackPreviewPendingKey = "";
    if (frontierActionError || !shouldResetFrontierAction) requestViewRefresh(2, true);
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
    const shieldUntil = msg.shieldUntil as number | undefined;
    if (pid && color) {
      state.playerColors.set(pid, color);
      if (pid === state.me) authProfileColorEl.value = color;
    }
    if (pid && visualStyle) state.playerVisualStyles.set(pid, visualStyle);
    if (pid && typeof shieldUntil === "number") state.playerShieldUntil.set(pid, shieldUntil);
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
  if (msg.type === "SHARD_RAIN_EVENT") {
    const siteCount = (msg.siteCount as number | undefined) ?? 0;
    const expiresAt = (msg.expiresAt as number | undefined) ?? 0;
    const remaining = expiresAt > Date.now() ? formatCountdownClock(expiresAt - Date.now()) : "30:00";
    state.shardRainFxUntil = Date.now() + 8_000;
    pushFeed(
      `Shard rain has begun. ${siteCount} impact site${siteCount === 1 ? "" : "s"} will remain for about ${remaining}.`,
      "info",
      "warn"
    );
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
  const settleQueueIndex = new Map<string, number>();
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
  for (let i = 0; i < state.developmentQueue.length; i += 1) {
    const entry = state.developmentQueue[i];
    if (!entry || entry.kind !== "SETTLE") continue;
    settleQueueIndex.set(entry.tileKey, i + 1);
  }
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

      if (t && vis === "visible" && t.terrain === "LAND" && t.shardSite) {
        const overlay = shardOverlayForTile(t);
        const pulsePhase = 0.5 + 0.5 * Math.sin(nowMs / 280 + t.x * 0.21 + t.y * 0.17);
        const pulse = 0.82 + 0.18 * pulsePhase;
        const glowRadius = size * (0.28 + pulsePhase * (t.shardSite.kind === "FALL" ? 0.3 : 0.24));
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle =
          t.shardSite.kind === "FALL"
            ? `rgba(255, 220, 112, ${0.16 + pulsePhase * 0.18})`
            : `rgba(96, 244, 255, ${0.14 + pulsePhase * 0.16})`;
        ctx.beginPath();
        ctx.arc(px + size / 2, py + size / 2, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = Math.max(2, size * 0.08);
        ctx.strokeStyle =
          t.shardSite.kind === "FALL"
            ? `rgba(255, 245, 180, ${0.38 + pulsePhase * 0.34})`
            : `rgba(184, 255, 255, ${0.34 + pulsePhase * 0.3})`;
        ctx.beginPath();
        ctx.arc(px + size / 2, py + size / 2, size * (0.18 + pulsePhase * 0.18), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        if (overlay?.complete && overlay.naturalWidth) {
          drawCenteredOverlayWithAlpha(
            overlay,
            px,
            py,
            size,
            (t.shardSite.kind === "FALL" ? 1.1 : 1.02) * (0.98 + pulse * 0.06),
            0.86 + pulse * 0.18
          );
        } else {
          const prevAlpha = ctx.globalAlpha;
          ctx.globalAlpha = prevAlpha * (0.88 + pulse * 0.16);
          drawShardFallback(t, px, py, size * (0.99 + pulse * 0.03));
          ctx.globalAlpha = prevAlpha;
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
        } else if (t.economicStructure.type === "FUR_SYNTHESIZER") {
          const overlay = structureOverlayImages.FUR_SYNTHESIZER;
          if (overlay.complete && overlay.naturalWidth) {
            drawCenteredOverlay(overlay, px, py, size, 1.02);
          }
        } else if (
          t.economicStructure.type === "ADVANCED_FUR_SYNTHESIZER" ||
          t.economicStructure.type === "ADVANCED_IRONWORKS" ||
          t.economicStructure.type === "ADVANCED_CRYSTAL_SYNTHESIZER"
        ) {
          const overlay =
            t.economicStructure.type === "ADVANCED_FUR_SYNTHESIZER"
              ? structureOverlayImages.ADVANCED_FUR_SYNTHESIZER
              : t.economicStructure.type === "ADVANCED_IRONWORKS"
                ? structureOverlayImages.ADVANCED_IRONWORKS
                : structureOverlayImages.ADVANCED_CRYSTAL_SYNTHESIZER;
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
        ctx.lineDashOffset = 0;
        ctx.setLineDash([]);
        drawExposedTileBorder(t, px, py, size);
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        ctx.lineWidth = 1;
      }
      if (state.showWeakDefensibility && t && vis === "visible" && t.ownerId === state.me && t.terrain === "LAND" && t.ownershipState === "SETTLED" && !t.fogged) {
        const exposedSides = exposedSidesForTile(t, {
          tiles: state.tiles,
          me: state.me,
          keyFor: key,
          wrapX,
          wrapY,
          terrainAt
        });
        if (exposedSides.length >= 2) {
          const critical = exposedSides.length >= 3;
          ctx.fillStyle = critical ? "rgba(255, 84, 84, 0.18)" : "rgba(255, 173, 92, 0.12)";
          ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
          ctx.strokeStyle = critical ? "rgba(255, 84, 84, 0.92)" : "rgba(255, 173, 92, 0.88)";
          ctx.lineWidth = critical ? 4 : 3;
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
          if (size >= 12) {
            ctx.fillStyle = critical ? "rgba(255, 84, 84, 0.96)" : "rgba(255, 196, 92, 0.96)";
            ctx.beginPath();
            ctx.arc(px + size * 0.5, py + size * 0.5, critical ? 2.3 : 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
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
      const queuedSettlementN = settleQueueIndex.get(wk);
      if (queuedSettlementN !== undefined && !settlementProgress) {
        ctx.strokeStyle = "rgba(251, 191, 36, 0.95)";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
        if (size >= 14) {
          const badgeWidth = Math.min(size - 6, queuedSettlementN >= 10 ? 18 : 14);
          ctx.fillStyle = "rgba(49, 31, 4, 0.92)";
          ctx.fillRect(px + size - badgeWidth - 3, py + 3, badgeWidth, 12);
          ctx.fillStyle = "#fbbf24";
          ctx.font = "10px monospace";
          ctx.textBaseline = "top";
          ctx.textAlign = "left";
          ctx.fillText(String(queuedSettlementN), px + size - badgeWidth - 1, py + 4);
        }
        ctx.lineWidth = 1;
      }
    }
  }

  for (const territoryLabel of visibleTerritoryLabels()) {
    const screen = worldToScreen(territoryLabel.x, territoryLabel.y, size, halfW, halfH);
    if (screen.sx < -120 || screen.sy < -60 || screen.sx > canvas.width + 120 || screen.sy > canvas.height + 60) continue;
    ctx.save();
    const insetTiles = 1.15;
    const safeWidth = Math.max(
      0,
      (((territoryLabel.depth * 2) + 1) * size) - insetTiles * size * 2
    );
    const baseFont = Math.max(15, Math.min(34, size * 1.08 + Math.sqrt(territoryLabel.tileCount) * 0.28));
    const fontPx = fitTerritoryLabelFont(ctx, territoryLabel.name, baseFont, safeWidth);
    if (fontPx >= 10) {
      drawCurvedTerritoryLabel(
        ctx,
        territoryLabel.name,
        screen.sx,
        screen.sy,
        fontPx,
        hexWithAlpha(effectiveOverlayColor(territoryLabel.ownerId), 0.22),
        "rgba(8, 12, 18, 0.45)"
      );
    }
    ctx.restore();
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
  for (const pair of state.dockPairs) {
    if (!isDockRouteVisibleForPlayer(pair)) continue;
    const aIsDockLand = terrainAt(pair.ax, pair.ay) === "LAND";
    const bIsDockLand = terrainAt(pair.bx, pair.by) === "LAND";
    const selectedRoute = Boolean(
      state.selected &&
        ((pair.ax === state.selected.x && pair.ay === state.selected.y) || (pair.bx === state.selected.x && pair.by === state.selected.y))
    );
    if (!selectedRoute) continue;
    if (!aIsDockLand || !bIsDockLand) continue;

    const route = computeDockSeaRoute(pair.ax, pair.ay, pair.bx, pair.by);
    ctx.setLineDash(routeDash);
    ctx.lineDashOffset = -((nowMs / 140) % 17);
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
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
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
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  const visibleAetherBridges = state.activeAetherBridges.filter((bridge) => bridge.endsAt > nowMs);
  for (const bridge of visibleAetherBridges) {
    const from = worldToScreen(bridge.from.x, bridge.from.y, size, halfW, halfH);
    const dx = toroidDelta(bridge.from.x, bridge.to.x, WORLD_WIDTH) * size;
    const dy = toroidDelta(bridge.from.y, bridge.to.y, WORLD_HEIGHT) * size;
    const to = { sx: from.sx + dx, sy: from.sy + dy };
    drawAetherBridgeLane(ctx, from.sx, from.sy, to.sx, to.sy, nowMs);
  }

  if (state.shardRainFxUntil > nowMs) {
    const fxProgress = Math.max(0, (state.shardRainFxUntil - nowMs) / 8_000);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 18; i += 1) {
      const x = ((i * 97 + nowMs * 0.08) % canvas.width);
      const y = ((i * 59 + nowMs * 0.21) % canvas.height);
      const len = 24 + (i % 5) * 10;
      const alpha = (0.08 + (i % 3) * 0.03) * fxProgress;
      ctx.strokeStyle = `rgba(102, 224, 255, ${alpha})`;
      ctx.lineWidth = 1 + (i % 2);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 8, y + len);
      ctx.stroke();
    }
    ctx.restore();
  }

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
  const startedQueuedDevelopment = state.developmentQueue.length > 0 ? processDevelopmentQueue() : false;
  if (expiredSettlementProgress || state.settleProgressByTile.size > 0 || startedQueuedDevelopment) {
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
    const keepOptimisticExpand = shouldPreserveOptimisticExpandByKey(timedOutCurrentKey);
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
  // Do not force identical full resubscriptions while the view is already healthy.
  if (state.firstChunkAt === 0 && Date.now() - state.lastSubAt > 20_000) requestViewRefresh(2, true);
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
  window.setTimeout(() => maybeRefreshForCamera(), 120);
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
