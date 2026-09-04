import { MIN_ZOOM, isForestTile } from "./client-constants.js"; import { startTileMenuDecayTicker } from "./client-tile-menu-decay-ticker/client-tile-menu-decay-ticker.js";
import { updateMusicForGameState } from "./client-audio/client-audio.js";
import { computeWarMusicSignals } from "./client-war-music-signal/client-war-music-signal.js";
import { drawableIncomingAttack } from "./client-siege-tracking/client-siege-tracking.js";
import type { FortificationOpening, FortificationOverlayKind } from "./client-fortification-overlays/client-fortification-overlays.js";
import { exposedSidesForTile, isOwnedSettledLandTile, weakDefensibilitySeverity } from "./client-defensibility-tile.js";
import { isTrue3DRendererActive, revealWholeMapInTrue3DMode } from "./client-renderer-mode.js"; import { drawLoopMinFrameGapMs } from "./client-runtime-loop-frame-gap.js";
import { drawSelectedDockSeaRoute2D } from "./client-dock-route-draw.js";
import { isStructureHandledBy3D } from "./client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import { getCurrentFps, hasSustainedLowFps, recordFrame as recordFpsFrame } from "./client-fps-monitor/client-fps-monitor.js";
import { recordDrawFrame, recordFramePhaseSample } from "./client-performance-metrics/client-performance-metrics.js";
import { RENDERER_PROMPT_FPS_THRESHOLD, RENDERER_PROMPT_LOW_FPS_MS, shouldShowRendererPrompt } from "./client-renderer-prompt/client-renderer-prompt.js";
import { resourceFor3DPopulation } from "./client-map-3d-population/client-map-3d-population.js";
import { effectiveFogDisabled } from "./client-map-reveal/client-map-reveal.js";
import {
  fortificationOpeningForTile,
  fortificationOverlayAlphaForTile,
  fortificationOverlayKindForTile
} from "./client-fortification-overlays/client-fortification-overlays.js";
import { renderBuildingPlacementPreview2D } from "./client-placement-preview-2d/client-placement-preview-2d.js";
import { renderSelectedStructureReachHighlight } from "./client-reach-overlay-structure-highlight/client-reach-overlay-structure-highlight.js";
import { renderSelectedStructurePreview2D } from "./client-selected-structure-preview-2d/client-selected-structure-preview-2d.js";
import type { initClientDom } from "./client-dom.js";
import { buildRoadNetwork, type RoadDirections } from "./client-road-network/client-road-network.js";
import { drawQueuedCornerBadge, queuedCornerBadgeLayout } from "./client-queue-badges/client-queue-badges.js";
import { drawTileOwnershipAndBreachBorder } from "./client-tile-borders/client-tile-borders.js";
import { resolveMyReach } from "./client-reach-authoritative/client-reach-authoritative.js";
import {
  drawDormantFrontierTreatment,
  drawReachBoundaryLine,
  isDormantFrontierTile
} from "./client-reach-overlay/client-reach-overlay.js";
import { drawPersistentAlertLocators, persistentAlertsForState, type PersistentAlert } from "./client-persistent-alerts/client-persistent-alerts.js"; import { drawOnboardingChecklistHighlights } from "./client-onboarding-checklist/client-onboarding-checklist-highlight.js";
import { pruneShardRainPings, visibleShardSiteForTile } from "./client-shard-rain-pings/client-shard-rain-pings.js";
import { drawWatchtower2D } from "./client-map-2d-watchtower-overlay.js";
import { drawNaturalWonderOverlay2D, naturalWonderOverlayForTile } from "./client-map-2d-natural-wonder-overlay.js";
import { fireDueMusterTransits } from "./client-muster-transit/client-muster-transit.js";
import { drawMusterSupplyLines2D } from "./client-muster-supply-lines-2d.js";
import { createStalledConstructionRefresher } from "./client-construction-stall-refresh/client-construction-stall-refresh.js";
import { isSeasonLobbyFullscreenActive } from "./client-season-lobby-fullscreen.js";
import type { ClientState } from "./client-state/client-state.js";
import type { DockPair, FeedSeverity, FeedType, Tile, TileMenuView, TileVisibilityState, TileTimedProgress } from "./client-types.js";
import { createVisibleTileDetailRequester } from "./client-visible-tile-detail/client-visible-tile-detail.js";
import { sweepExpiredFrontierRecovery } from "./client-frontier-recovery/client-frontier-recovery.js";
import { WORLD_HEIGHT, WORLD_WIDTH, buildAetherWallSegments, landBiomeAt, terrainAt } from "@border-empires/shared";
import { devQueueBadgeIndex } from "./client-dev-queue-badge-index/client-dev-queue-badge-index.js";
import { attackSyncLog, debugTileLog, debugTileTimeline, recordClientDebugEvent, tileMatchesDebugKey, verboseTileDebugEnabled } from "./client-debug/client-debug.js";
import { clampedTileHalfExtents, resolveTileBudget } from "./client-map-3d-tile-budget/client-map-3d-tile-budget.js";

// Persistent-alert tile scan is O(all tiles ever discovered this session,
// up to WORLD_WIDTH*WORLD_HEIGHT) and measured at ~5.78ms avg / 20.5ms p99
// on mobile when run every frame. Town-unfed / muster-active status only
// changes on human timescales, so recomputing on a ~220ms cadence is
// visually lossless while cutting scan frequency by ~80-90%.
const PERSISTENT_ALERTS_RECOMPUTE_INTERVAL_MS = 220;

type ClientDom = ReturnType<typeof initClientDom>;

type VisibleRenderTile = {
  wx: number;
  wy: number;
  wk: string;
  px: number;
  py: number;
  vis: TileVisibilityState;
  t: Tile | undefined;
  settlementProgress: TileTimedProgress | undefined;
};

type StartClientRuntimeLoopDeps = {
  canvas: ClientDom["canvas"];
  ctx: ClientDom["ctx"];
  initTerrainTextures: () => void;
  isMobile: () => boolean;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  parseKey: (key: string) => { x: number; y: number };
  selectedTile: () => Tile | undefined;
  aetherWallDirectionTargetTiles: (
    tile: Tile
  ) => Array<{ x: number; y: number; direction: ClientState["aetherWallTargeting"]["direction"]; dx: number; dy: number }>;
  settlementProgressForTile: (x: number, y: number) => TileTimedProgress | undefined;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
  crystalTargetingTone: (ability: ClientState["crystalTargeting"]["ability"]) => "amber" | "cyan" | "red";
  startingExpansionArrowTargets: () => Array<{ x: number; y: number; dx: number; dy: number }>;
  drawTerrainTile: (wx: number, wy: number, terrain: Tile["terrain"], px: number, py: number, size: number) => void;
  drawForestOverlay: (wx: number, wy: number, px: number, py: number, size: number) => void; drawHillsOverlay: (wx: number, wy: number, px: number, py: number, size: number) => void;
  effectiveOverlayColor: (ownerId: string) => string;
  overlayVariantIndexAt: (x: number, y: number, mod: number) => number;
  dockOverlayVariants: Array<HTMLImageElement | undefined>;
  drawDockMarker: (px: number, py: number, size: number) => void;
  drawCenteredOverlay: (overlay: HTMLImageElement | undefined, px: number, py: number, size: number, scale?: number) => void;
  builtResourceOverlayForTile: (tile: Tile) => HTMLImageElement | undefined;
  resourceOverlayForTile: (tile: Tile) => HTMLImageElement | undefined;
  economicStructureOverlayAlpha: (tile: Tile) => number;
  drawCenteredOverlayWithAlpha: (
    overlay: HTMLImageElement | undefined,
    px: number,
    py: number,
    size: number,
    scale: number,
    alpha: number
  ) => void;
  resourceOverlayScaleForTile: (tile: Tile) => number;
  drawResourceCornerMarker: (tile: Tile, px: number, py: number, size: number) => void;
  drawRoadOverlay: (directions: RoadDirections, px: number, py: number, size: number) => void;
  fortificationOverlayImageFor: (
    kind: FortificationOverlayKind,
    opening: FortificationOpening
  ) => HTMLImageElement | undefined;
  resourceColor: (resource: Tile["resource"]) => string | undefined;
  shardOverlayForTile: (tile: Tile) => HTMLImageElement | undefined;
  drawShardFallback: (tile: Tile, px: number, py: number, size: number) => void;
  drawTownOverlay: (tile: Tile, px: number, py: number, size: number) => void;
  hasCollectableYield: (tile: Tile | undefined) => boolean;
  structureAccentColor: (ownerId: string, fallback: string) => string;
  structureOverlayImages: Record<string, HTMLImageElement>;
  constructionRemainingMsForTile: (tile: Tile) => number | undefined;
  formatCountdownClock: (ms: number) => string;
  drawStartingExpansionArrow: (px: number, py: number, size: number, dx: number, dy: number) => void;
  drawBarbarianSkullOverlay: (px: number, py: number, size: number) => void;
  shouldDrawOwnershipBorder: (tile: Tile) => boolean;
  borderColorForOwner: (ownerId: string, stateName?: Tile["ownershipState"]) => string;
  isTileOwnedByAlly: (tile: Tile) => boolean;
  borderLineWidthForOwner: (ownerId: string, stateName?: Tile["ownershipState"]) => number;
  isTownSupportNeighbor: (tx: number, ty: number, sx: number, sy: number) => boolean;
  isTownSupportHighlightableTile: (tile: Tile | undefined) => boolean;
  drawIncomingAttackOverlay: (wx: number, wy: number, px: number, py: number, size: number, resolvesAt: number) => void;
  settlePixelWanderPoint: (nowMs: number, wx: number, wy: number, i: number) => { x: number; y: number };
  worldToScreen: (wx: number, wy: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };
  isDockRouteVisibleForPlayer: (pair: DockPair) => boolean;
  resolveDockSeaRoute: (pair: DockPair) => Array<{ x: number; y: number }>;
  toroidDelta: (from: number, to: number, dim: number) => number;
  drawAetherBridgeLane: (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    nowMs: number,
    options?: { compact?: boolean; anchors?: boolean }
  ) => void;
  drawAetherWallSegment: (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    options?: { preview?: boolean; nowMs?: number }
  ) => void;
  drawMiniMap: () => void;
  maybeRefreshForCamera: (force?: boolean) => void;
  requestTileDetailIfNeeded: (tile: Tile | undefined, options?: { force?: boolean }) => void;
  renderHud: () => void; tileMenuViewForTile: (tile: Tile) => TileMenuView; renderTileActionMenu: (view: TileMenuView, clientX: number, clientY: number) => void;
  renderCaptureProgress: () => void;
  renderShardAlert: () => void; renderVictoryHoldAlert: () => void;
  cleanupExpiredSettlementProgress: () => boolean;
  processDevelopmentQueue: () => boolean;
  processAutoSettleTargets: () => void;
  processAutoBuildTargets: () => void;
  clearOptimisticTileState: (tileKey: string, revert?: boolean) => void;
  dropQueuedTargetKeyIfAbsent: (targetKey: string) => void;
  pushFeed: (msg: string, type?: FeedType, severity?: FeedSeverity) => void;
  showCaptureAlert: (title: string, detail: string, tone?: "success" | "error" | "warn", manpowerLoss?: number) => void;
  processActionQueue: () => boolean;
  shouldPreserveOptimisticExpandByKey: (tileKey: string) => boolean;
  requestViewRefresh: (radius?: number, force?: boolean) => void;
  reconcileActionQueue: () => void;
  processPendingMusterAttacks: () => void; sendDeferredAttack: (fromX: number, fromY: number, toX: number, toY: number, commandId: string, clientSeq: number) => void;
  isPlacementValidForTile: (tile: Tile | undefined) => boolean;
};

export const startClientRuntimeLoop = (state: ClientState, deps: StartClientRuntimeLoopDeps): void => {
  let lastDrawAt = 0;
  let lastFpsPaintAt = 0;
  let lowFpsRendererHudPinged = false;
  let roadNetwork = new Map<string, RoadDirections>();
  const lastRenderedTileStateByKey = new Map<string, string>();
  let roadNetworkBuiltAt = 0;
  let persistentAlertsCache: PersistentAlert[] = [];
  let persistentAlertsComputedAt = 0;
  const maybeRefreshStalledConstruction = createStalledConstructionRefresher({
    requestTileDetailIfNeeded: deps.requestTileDetailIfNeeded
  });
  const drawConstructionCountdownOverlay = (t: Tile, wk: string, px: number, py: number, size: number): void => {
    const remainingConstructionMs = deps.constructionRemainingMsForTile(t);
    if (remainingConstructionMs === undefined) return;
    maybeRefreshStalledConstruction(t, wk, remainingConstructionMs);
    if (size < 18) return;
    const timerLabel = deps.formatCountdownClock(remainingConstructionMs);
    deps.ctx.fillStyle = "rgba(6, 10, 18, 0.82)";
    deps.ctx.fillRect(px + 2, py + size - 12, Math.min(size - 4, 30), 10);
    deps.ctx.fillStyle = "rgba(236, 243, 255, 0.92)";
    deps.ctx.font = "9px monospace";
    deps.ctx.textBaseline = "top";
    deps.ctx.fillText(timerLabel, px + 4, py + size - 11);
  };
  const requestVisibleTileDetails = createVisibleTileDetailRequester({
    state,
    keyFor: deps.keyFor,
    requestTileDetailIfNeeded: deps.requestTileDetailIfNeeded,
    isMobile: deps.isMobile
  });

  const draw = (): void => {
    if (isSeasonLobbyFullscreenActive(state)) { requestAnimationFrame(draw); return; }
    const nowMs = performance.now();
    recordFpsFrame(nowMs);
    const minFrameGap = drawLoopMinFrameGapMs(isTrue3DRendererActive(), deps.isMobile());
    if (nowMs - lastDrawAt < minFrameGap) {
      requestAnimationFrame(draw);
      return;
    }
    const frameStartAt = nowMs;
    const previousDrawAt = lastDrawAt;
    lastDrawAt = nowMs;
    if (nowMs - lastFpsPaintAt > 500) {
      lastFpsPaintAt = nowMs;
      const fps = getCurrentFps();
      const readouts = document.querySelectorAll<HTMLElement>("[data-fps-readout]");
      if (readouts.length > 0) {
        const label = fps === undefined ? "—" : Math.round(fps).toString();
        readouts.forEach((el) => {
          if (el.textContent !== label) el.textContent = label;
        });
      }
      const zoomReadouts = document.querySelectorAll<HTMLElement>("[data-zoom-readout]");
      if (zoomReadouts.length > 0) {
        const zoomLabel = Math.round(state.zoom).toString();
        zoomReadouts.forEach((el) => {
          if (el.textContent !== zoomLabel) el.textContent = zoomLabel;
        });
      }
      if (
        !lowFpsRendererHudPinged &&
        shouldShowRendererPrompt({
          dismissed: state.rendererPrompt.dismissed,
          true3DActive: isTrue3DRendererActive(),
          sustainedLowFps: hasSustainedLowFps(RENDERER_PROMPT_FPS_THRESHOLD, RENDERER_PROMPT_LOW_FPS_MS, nowMs),
          connectionInitialized: state.connection === "initialized",
          authSessionReady: state.authSessionReady,
          profileSetupRequired: state.profileSetupRequired,
          changelogOpen: state.changelog.open,
          guideOpen: state.guide.open
        })
      ) {
        lowFpsRendererHudPinged = true;
        deps.renderHud();
      }
    }

    if (isTrue3DRendererActive()) deps.ctx.clearRect(0, 0, deps.canvas.width, deps.canvas.height);
    else {
      deps.ctx.fillStyle = "#0b1320";
      deps.ctx.fillRect(0, 0, deps.canvas.width, deps.canvas.height);
    }

    const size = state.zoom;
    const { halfW, halfH } = clampedTileHalfExtents(Math.floor(deps.canvas.width / size / 2), Math.floor(deps.canvas.height / size / 2), resolveTileBudget(MIN_ZOOM));
    const dockEndpointKeys = new Set<string>();
    for (const pair of state.dockPairs) {
      dockEndpointKeys.add(deps.keyFor(pair.ax, pair.ay));
      dockEndpointKeys.add(deps.keyFor(pair.bx, pair.by));
    }
    // Reach overlay: recompute only when tiles or server reach actually
    // changed. String key (not tilesRevision + serverReachRevision * 1e6) to
    // avoid collisions once tilesRevision outgrows the multiplier.
    const reachCacheKey = `${state.tilesRevision}:${state.serverReachRevision}`;
    if (!isTrue3DRendererActive() && state.myReachRevisionAtCompute !== reachCacheKey) {
      state.myReach = resolveMyReach(state);
      state.myReachRevisionAtCompute = reachCacheKey;
    }
    const myReach = state.myReach;
    const crystalTargetingActive = state.crystalTargeting.active;
    const crystalTone = crystalTargetingActive ? deps.crystalTargetingTone(state.crystalTargeting.ability) : "amber";
    const debugWindow = typeof window !== "undefined" ? (window as Window & { __be3dCanvasOverlayDebug?: unknown }) : undefined;
    const debugSelected = state.selected;
    const canvasOverlayDebug: Array<Record<string, unknown>> = [];
    const queueIndex = new Map<string, number>();
    const { settleQueueIndex, queuedBuildIndex, settleQueueEntryState, queuedBuildEntryState } = devQueueBadgeIndex(state.developmentQueue);
    const startingArrowTargets = new Map(
      deps.startingExpansionArrowTargets().map((target) => [deps.keyFor(target.x, target.y), target] as const)
    );
    for (let i = 0; i < state.actionQueue.length; i += 1) {
      const q = state.actionQueue[i];
      if (!q) continue;
      queueIndex.set(deps.keyFor(q.x, q.y), i + 1);
    }
    if (size >= 14 && (roadNetworkBuiltAt === 0 || nowMs - roadNetworkBuiltAt > 450)) {
      roadNetwork = buildRoadNetwork({
        tiles: state.tiles,
        keyFor: deps.keyFor,
        wrapX: deps.wrapX,
        wrapY: deps.wrapY
      });
      roadNetworkBuiltAt = nowMs;
    }
    const overlayTiles: VisibleRenderTile[] = [];
    const syntheticOverlayTileAt = (wx: number, wy: number, tile: Tile | undefined): Tile | undefined => {
      if (tile) return undefined;
      if (!isTrue3DRendererActive() || !revealWholeMapInTrue3DMode) return undefined;
      const terrain = terrainAt(wx, wy);
      if (terrain !== "LAND") return undefined;
      const biome = landBiomeAt(wx, wy);
      const forestTile = isForestTile(wx, wy);
      const resource = resourceFor3DPopulation(wx, wy, terrain, undefined, true, biome, forestTile);
      if (!resource) return undefined;
      return {
        x: wx,
        y: wy,
        terrain,
        resource
      };
    };
    const drawAetherWallEdge = (
      baseX: number,
      baseY: number,
      direction: "N" | "E" | "S" | "W",
      options?: { preview?: boolean; nowMs?: number }
    ): void => {
      const center = deps.worldToScreen(baseX, baseY, size, halfW, halfH);
      const halfSize = size * 0.5;
      let fromX = center.sx - halfSize;
      let fromY = center.sy - halfSize;
      let toX = center.sx + halfSize;
      let toY = center.sy - halfSize;
      if (direction === "E") {
        fromX = center.sx + halfSize;
        fromY = center.sy - halfSize;
        toX = center.sx + halfSize;
        toY = center.sy + halfSize;
      } else if (direction === "S") {
        fromX = center.sx - halfSize;
        fromY = center.sy + halfSize;
        toX = center.sx + halfSize;
        toY = center.sy + halfSize;
      } else if (direction === "W") {
        fromX = center.sx - halfSize;
        fromY = center.sy - halfSize;
        toX = center.sx - halfSize;
        toY = center.sy + halfSize;
      }
      deps.drawAetherWallSegment(deps.ctx, fromX, fromY, toX, toY, options);
    };
    const renderOverlayTile = ({ wx, wy, wk, px, py, vis, t, settlementProgress }: VisibleRenderTile): void => {
      const isDockEndpoint = dockEndpointKeys.has(wk);
      const dockVisible = (!t && effectiveFogDisabled(state)) || vis === "visible";
      // Corner anchor badge for every visible dock tile — drawn even in 3D mode so the icon-only summary remains visible when zoomed out (parallels drawResourceCornerMarker for resource tiles).
      if (dockVisible && isDockEndpoint) {
        deps.drawDockMarker(px, py, size);
      }
      // The 3D dock overlay supersedes the SVG dock icon (and its fallback placeholder) when the true-3D renderer is mounted.
      if (dockVisible && isDockEndpoint && !isTrue3DRendererActive()) {
        const dockOverlay = deps.dockOverlayVariants[deps.overlayVariantIndexAt(wx, wy, deps.dockOverlayVariants.length)];
        if (dockOverlay?.complete && dockOverlay.naturalWidth) deps.drawCenteredOverlay(dockOverlay, px, py, size, 1.14);
        else {
          deps.ctx.fillStyle = "rgba(12, 22, 38, 0.42)";
          deps.ctx.fillRect(px + 1, py + 1, size - 3, size - 3);
          deps.ctx.strokeStyle = "rgba(115, 225, 255, 0.98)";
          deps.ctx.lineWidth = 2;
          deps.ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
          deps.ctx.strokeStyle = "rgba(214, 247, 255, 0.95)";
          deps.ctx.beginPath();
          deps.ctx.moveTo(px + size / 2, py + 3);
          deps.ctx.lineTo(px + size / 2, py + size - 3);
          deps.ctx.moveTo(px + 3, py + size / 2);
          deps.ctx.lineTo(px + size - 3, py + size / 2);
          deps.ctx.stroke();
          deps.ctx.lineWidth = 1;
        }
      }

      const overlayTile = t ?? syntheticOverlayTileAt(wx, wy, t);
      const overlayVisible = vis === "visible" || Boolean(overlayTile && isTrue3DRendererActive() && revealWholeMapInTrue3DMode);

      if (overlayTile && overlayVisible && overlayTile.resource && overlayTile.terrain === "LAND") {
        const builtOverlay = deps.builtResourceOverlayForTile(overlayTile);
        const overlay = builtOverlay ?? deps.resourceOverlayForTile(overlayTile);
        if (overlay?.complete && overlay.naturalWidth) {
          if (!isTrue3DRendererActive()) {
            const alpha = builtOverlay ? deps.economicStructureOverlayAlpha(overlayTile) : 1;
            deps.drawCenteredOverlayWithAlpha(overlay, px, py, size, deps.resourceOverlayScaleForTile(overlayTile), alpha);
          }
          deps.drawResourceCornerMarker(overlayTile, px, py, size);
        } else {
          if (!isTrue3DRendererActive()) {
            const rc = deps.resourceColor(overlayTile.resource);
            if (!rc) return;
            const marker = Math.max(3, Math.floor(size * 0.22));
            const mx = px + Math.floor((size - marker) / 2);
            const my = py + Math.floor((size - marker) / 2);
            deps.ctx.fillStyle = "rgba(12, 16, 28, 0.7)";
            deps.ctx.fillRect(mx - 1, my - 1, marker + 2, marker + 2);
            deps.ctx.fillStyle = rc;
            deps.ctx.fillRect(mx, my, marker, marker);
          }
          deps.drawResourceCornerMarker(overlayTile, px, py, size);
        }
      }

      const visibleShardSite = visibleShardSiteForTile(t, state.shardRainPingsByTile, Date.now());
      if (t && vis === "visible" && t.terrain === "LAND" && visibleShardSite && !isTrue3DRendererActive()) {
        const tileWithVisibleShard = visibleShardSite === t.shardSite ? t : { ...t, shardSite: visibleShardSite };
        const overlay = deps.shardOverlayForTile(tileWithVisibleShard);
        const pulsePhase = 0.5 + 0.5 * Math.sin(nowMs / 280 + t.x * 0.21 + t.y * 0.17);
        const pulse = 0.82 + 0.18 * pulsePhase;
        const glowRadius = size * (0.28 + pulsePhase * (visibleShardSite.kind === "FALL" ? 0.3 : 0.24));
        deps.ctx.save();
        deps.ctx.globalCompositeOperation = "screen";
        deps.ctx.fillStyle =
          visibleShardSite.kind === "FALL"
            ? `rgba(255, 220, 112, ${0.16 + pulsePhase * 0.18})`
            : `rgba(96, 244, 255, ${0.14 + pulsePhase * 0.16})`;
        deps.ctx.beginPath();
        deps.ctx.arc(px + size / 2, py + size / 2, glowRadius, 0, Math.PI * 2);
        deps.ctx.fill();
        deps.ctx.lineWidth = Math.max(2, size * 0.08);
        deps.ctx.strokeStyle =
          visibleShardSite.kind === "FALL"
            ? `rgba(255, 245, 180, ${0.38 + pulsePhase * 0.34})`
            : `rgba(184, 255, 255, ${0.34 + pulsePhase * 0.3})`;
        deps.ctx.beginPath();
        deps.ctx.arc(px + size / 2, py + size / 2, size * (0.18 + pulsePhase * 0.18), 0, Math.PI * 2);
        deps.ctx.stroke();
        deps.ctx.restore();
        if (overlay?.complete && overlay.naturalWidth) {
          deps.drawCenteredOverlayWithAlpha(
            overlay,
            px,
            py,
            size,
            (visibleShardSite.kind === "FALL" ? 1.1 : 1.02) * (0.98 + pulse * 0.06),
            0.86 + pulse * 0.18
          );
        } else {
          const prevAlpha = deps.ctx.globalAlpha;
          deps.ctx.globalAlpha = prevAlpha * (0.88 + pulse * 0.16);
          deps.drawShardFallback(tileWithVisibleShard, px, py, size * (0.99 + pulse * 0.03));
          deps.ctx.globalAlpha = prevAlpha;
        }
      }

      if (overlayTile && overlayVisible && overlayTile.town && overlayTile.terrain === "LAND") deps.drawTownOverlay(overlayTile, px, py, size);

      if (t && vis === "visible" && t.terrain === "LAND" && t.watchtower && !isTrue3DRendererActive()) drawWatchtower2D(deps.ctx, t, px, py, size, nowMs);

      if (t && vis === "visible" && t.naturalWonder && !isTrue3DRendererActive()) drawNaturalWonderOverlay2D(deps.ctx, naturalWonderOverlayForTile(t), t.ownerId ?? "", px, py, size, deps.structureAccentColor);
      if (t && vis === "visible" && t.ownerId === state.me && t.ownershipState === "SETTLED" && deps.hasCollectableYield(t)) {
        const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(nowMs / 230));
        const marker = Math.max(4, Math.floor(size * 0.22));
        const mx = px + 3;
        const my = py + 3;
        deps.ctx.fillStyle = `rgba(15, 18, 28, ${0.68 + pulse * 0.18})`;
        deps.ctx.fillRect(mx - 1, my - 1, marker + 2, marker + 2);
        deps.ctx.fillStyle = `rgba(255, 220, 90, ${0.75 + pulse * 0.25})`;
        deps.ctx.fillRect(mx, my, marker, marker);
      }

      if (!isTrue3DRendererActive() && t && vis === "visible" && t.terrain === "LAND") {
        const fortificationKind = fortificationOverlayKindForTile(t);
        if (fortificationKind) {
          const opening = fortificationOpeningForTile(t, {
            tiles: state.tiles,
            keyFor: deps.keyFor,
            wrapX: deps.wrapX,
            wrapY: deps.wrapY
          });
          const overlay = deps.fortificationOverlayImageFor(fortificationKind, opening);
          if (overlay?.complete && overlay.naturalWidth) {
            deps.drawCenteredOverlayWithAlpha(overlay, px, py, size, 1, fortificationOverlayAlphaForTile(t));
          }
        }
      }
      if (t && vis === "visible" && t.observatory && !isTrue3DRendererActive()) {
        // 2D-only: 3D renderer paints the observatory mesh via structureOverlay.
        const overlay = deps.structureOverlayImages.OBSERVATORY;
        if (overlay && overlay.complete && overlay.naturalWidth) deps.drawCenteredOverlay(overlay, px, py, size, 1.02);
        else {
          deps.ctx.strokeStyle = deps.structureAccentColor(
            t.ownerId ?? "",
            t.observatory.status === "active" ? "rgba(122, 214, 255, 0.92)" : "rgba(122, 214, 255, 0.42)"
          );
          deps.ctx.beginPath();
          deps.ctx.arc(px + size / 2, py + size / 2, Math.max(3, size * 0.22), 0, Math.PI * 2);
          deps.ctx.stroke();
        }
      }
      if (t && (vis === "visible" || vis === "fogged") /* fog-tolerant like the ownership tint below / the 3D renderer's ungated check */ && t.economicStructure) {
        if (verboseTileDebugEnabled() && tileMatchesDebugKey(wx, wy, 1, { fallbackTile: state.selected })) {
          debugTileLog(
            "render",
            {
              x: wx,
              y: wy,
              vis,
              detailLevel: t.detailLevel,
              economicStructure: t.economicStructure.type,
              overlayLoaded: Boolean(deps.structureOverlayImages[t.economicStructure.type]?.complete),
              hasBuiltResourceOverlay: Boolean(deps.builtResourceOverlayForTile(t)),
              zoom: size
            },
            { throttleKey: `${wx},${wy}`, minIntervalMs: 2000 }
          );
        }
        const markerSize = Math.max(3, Math.floor(size * 0.2));
        const active = t.economicStructure.status === "active";
        const hasBuiltResourceOverlay = Boolean(deps.builtResourceOverlayForTile(t));
        const fortificationKind = fortificationOverlayKindForTile(t);
        const overlay = deps.structureOverlayImages[t.economicStructure.type];
        // Structures handled by the 3D structure overlay — skip the 2D
        // image / fallback so the canvas stays clean over them.
        // isStructureHandledBy3D() is the authoritative check, covering
        // both the generic instanced-mesh set and structures (like the
        // Umbrite rig/factory and CARAVANARY) rendered via a dedicated
        // branch in client-map-3d.ts.
        const handled3DStructure =
          isTrue3DRendererActive() &&
          isStructureHandledBy3D(t.economicStructure.type);
        if (fortificationKind || handled3DStructure) {
          // 3D-rendered (forts + 3D-overlay structures); no 2D fallback.
        } else if (overlay && overlay.complete && overlay.naturalWidth) {
          deps.drawCenteredOverlay(overlay, px, py, size, 1.02);
        } else if (t.economicStructure.type === "FARMSTEAD" && !hasBuiltResourceOverlay) {
          deps.ctx.fillStyle = deps.structureAccentColor(
            t.ownerId ?? "",
            active ? "rgba(192, 229, 117, 0.95)" : "rgba(148, 176, 104, 0.72)"
          );
          deps.ctx.fillRect(px + 2, py + size - markerSize - 2, markerSize + 1, markerSize);
        } else if (t.economicStructure.type === "UMBRITE_RIG" && !hasBuiltResourceOverlay) {
          deps.ctx.fillStyle = deps.structureAccentColor(
            t.ownerId ?? "",
            active ? "rgba(147, 92, 201, 0.95)" : "rgba(114, 71, 156, 0.74)"
          );
          deps.ctx.beginPath();
          deps.ctx.moveTo(px + size / 2, py + 3);
          deps.ctx.lineTo(px + size - 4, py + markerSize + 4);
          deps.ctx.lineTo(px + 4, py + markerSize + 4);
          deps.ctx.closePath();
          deps.ctx.fill();
        } else if (t.economicStructure.type === "MINE" && !hasBuiltResourceOverlay) {
          deps.ctx.fillStyle = deps.structureAccentColor(
            t.ownerId ?? "",
            active ? "rgba(188, 197, 214, 0.96)" : "rgba(120, 130, 148, 0.74)"
          );
          deps.ctx.fillRect(px + 2, py + 2, markerSize + 1, markerSize + 1);
        } else {
          deps.ctx.strokeStyle = deps.structureAccentColor(
            t.ownerId ?? "",
            active ? "rgba(255, 212, 111, 0.96)" : "rgba(191, 162, 102, 0.72)"
          );
          deps.ctx.lineWidth = 2;
          deps.ctx.strokeRect(px + 2, py + 2, markerSize + 2, markerSize + 2);
          deps.ctx.lineWidth = 1;
        }
      } else if (verboseTileDebugEnabled() && t && vis === "visible" && tileMatchesDebugKey(wx, wy, 1, { fallbackTile: state.selected })) {
        debugTileLog(
          "render-missing-structure",
          {
            x: wx,
            y: wy,
            vis,
            detailLevel: t.detailLevel,
            resource: t.resource,
            town: Boolean(t.town),
            economicStructure: undefined,
            zoom: size
          },
          { throttleKey: `${wx},${wy}`, minIntervalMs: 2000 }
        );
      }
      if (verboseTileDebugEnabled() && tileMatchesDebugKey(wx, wy, 1, { fallbackTile: state.selected })) {
        const renderKey = deps.keyFor(wx, wy);
        const renderSignature = JSON.stringify({
          ownerId: t?.ownerId ?? null,
          ownershipState: t?.ownershipState ?? null,
          optimisticPending: t?.optimisticPending ?? null,
          detailLevel: t?.detailLevel ?? null,
          fogged: t?.fogged ?? null,
          vis
        });
        const previousRenderSignature = lastRenderedTileStateByKey.get(renderKey);
        if (previousRenderSignature !== renderSignature) {
          debugTileTimeline("frontier-render-transition", {
            x: wx,
            y: wy,
            after: t,
            state,
            keyFor: deps.keyFor,
            extra: {
              vis,
              previousRenderSignature
            }
          });
          lastRenderedTileStateByKey.set(renderKey, renderSignature);
        }
      }
      if (t && vis === "visible" && t.terrain === "LAND") drawConstructionCountdownOverlay(t, wk, px, py, size);
      if (t && vis === "visible" && t.sabotage && t.sabotage.endsAt > Date.now()) {
        deps.ctx.strokeStyle = "rgba(255, 83, 83, 0.92)";
        deps.ctx.beginPath();
        deps.ctx.moveTo(px + 3, py + 3);
        deps.ctx.lineTo(px + size - 3, py + size - 3);
        deps.ctx.moveTo(px + size - 3, py + 3);
        deps.ctx.lineTo(px + 3, py + size - 3);
        deps.ctx.stroke();
      }

      if (!isTrue3DRendererActive() && crystalTargetingActive && t && vis === "visible" && state.crystalTargeting.validTargets.has(wk)) {
        deps.ctx.fillStyle =
          crystalTone === "amber"
            ? "rgba(255, 187, 72, 0.12)"
            : crystalTone === "cyan"
              ? "rgba(113, 223, 255, 0.13)"
              : "rgba(255, 100, 100, 0.12)";
        deps.ctx.fillRect(px + 1, py + 1, size - 3, size - 3);
        deps.ctx.strokeStyle =
          crystalTone === "amber"
            ? "rgba(255, 201, 102, 0.88)"
            : crystalTone === "cyan"
              ? "rgba(116, 227, 255, 0.9)"
              : "rgba(255, 110, 110, 0.88)";
        deps.ctx.lineWidth = 2;
        deps.ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
        deps.ctx.lineWidth = 1;
      }

      if (!isTrue3DRendererActive() && t && vis === "visible" && t.terrain === "LAND" && !t.ownerId) {
        deps.ctx.strokeStyle = "rgba(20, 26, 36, 0.58)";
        deps.ctx.lineWidth = 1;
        deps.ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      }

      const startingArrow = startingArrowTargets.get(wk);
      if (startingArrow && !settlementProgress && queueIndex.get(wk) === undefined) {
        deps.drawStartingExpansionArrow(px, py, size, startingArrow.dx, startingArrow.dy);
      }

      if (!isTrue3DRendererActive() && t && vis === "visible" && t.ownerId === "barbarian") deps.drawBarbarianSkullOverlay(px, py, size);

      drawTileOwnershipAndBreachBorder(t, vis, px, py, size, {
        ctx: deps.ctx,
        me: state.me,
        is3D: isTrue3DRendererActive(),
        shouldDrawOwnershipBorder: deps.shouldDrawOwnershipBorder,
        borderColorForOwner: deps.borderColorForOwner,
        isTileOwnedByAlly: deps.isTileOwnedByAlly,
        borderLineWidthForOwner: deps.borderLineWidthForOwner,
        tiles: state.tiles,
        keyFor: deps.keyFor,
        wrapX: deps.wrapX,
        wrapY: deps.wrapY
      });

      // Fixed-borders-via-reach overlay. Boundary renders over fogged tiles
      // too (a fixed claim, not fog-dependent) but stays hidden over unexplored.
      if (!isTrue3DRendererActive() && myReach && t && vis !== "unexplored") {
        if (vis === "visible" && t.ownerId === state.me && isDormantFrontierTile(t)) {
          drawDormantFrontierTreatment(deps.ctx, px, py, size);
        }
        if (t.ownerId === state.me) {
          drawReachBoundaryLine(deps.ctx, wx, wy, px, py, size, myReach, {
            tiles: state.tiles,
            keyFor: deps.keyFor,
            wrapX: deps.wrapX,
            wrapY: deps.wrapY
          });
        }
      }
      if (state.showWeakDefensibility && vis === "visible" && isOwnedSettledLandTile(t, state.me)) {
        const exposedSides = exposedSidesForTile(t, {
          tiles: state.tiles,
          me: state.me,
          keyFor: deps.keyFor,
          wrapX: deps.wrapX,
          wrapY: deps.wrapY,
          terrainAt
        });
        const severity = weakDefensibilitySeverity(exposedSides.length);
        if (severity) {
          const critical = severity === "critical";
          deps.ctx.fillStyle = critical ? "rgba(255, 84, 84, 0.18)" : "rgba(255, 173, 92, 0.12)";
          deps.ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
          deps.ctx.strokeStyle = critical ? "rgba(255, 84, 84, 0.92)" : "rgba(255, 173, 92, 0.88)";
          deps.ctx.lineWidth = critical ? 4 : 3;
          deps.ctx.beginPath();
          if (exposedSides.includes("north")) {
            deps.ctx.moveTo(px + 1, py + 2);
            deps.ctx.lineTo(px + size - 1, py + 2);
          }
          if (exposedSides.includes("east")) {
            deps.ctx.moveTo(px + size - 2, py + 1);
            deps.ctx.lineTo(px + size - 2, py + size - 1);
          }
          if (exposedSides.includes("south")) {
            deps.ctx.moveTo(px + 1, py + size - 2);
            deps.ctx.lineTo(px + size - 1, py + size - 2);
          }
          if (exposedSides.includes("west")) {
            deps.ctx.moveTo(px + 2, py + 1);
            deps.ctx.lineTo(px + 2, py + size - 1);
          }
          deps.ctx.stroke();
          if (size >= 12) {
            deps.ctx.fillStyle = critical ? "rgba(255, 84, 84, 0.96)" : "rgba(255, 196, 92, 0.96)";
            deps.ctx.beginPath();
            deps.ctx.arc(px + size * 0.5, py + size * 0.5, critical ? 2.3 : 1.8, 0, Math.PI * 2);
            deps.ctx.fill();
          }
          deps.ctx.lineWidth = 1;
        }
      }

      if (!isTrue3DRendererActive() && state.selected && state.selected.x === wx && state.selected.y === wy) {
        if (t?.ownerId === state.me && t.ownershipState === "SETTLED") {
          deps.ctx.fillStyle = "rgba(255, 209, 102, 0.18)";
          deps.ctx.fillRect(px, py, size, size);
        } else {
          const selectedOutOfReach = Boolean(myReach) && !myReach!.has(deps.keyFor(wx, wy)); // fixed-border reach: dashed orange outside reach
          if (selectedOutOfReach) deps.ctx.setLineDash([4, 3]);
          deps.ctx.strokeStyle = selectedOutOfReach ? "#ff8a3d" : "#ffd166"; deps.ctx.lineWidth = 2; deps.ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1); deps.ctx.lineWidth = 1;
          if (selectedOutOfReach) deps.ctx.setLineDash([]);
        }
      } else if (state.selected) {
        const selected = state.tiles.get(deps.keyFor(state.selected.x, state.selected.y));
        if (
          !isTrue3DRendererActive() &&
          selected?.town &&
          deps.isTownSupportNeighbor(wx, wy, state.selected.x, state.selected.y) &&
          deps.isTownSupportHighlightableTile(t)
        ) {
          if (t?.terrain !== "LAND") deps.ctx.strokeStyle = "rgba(92, 103, 127, 0.7)";
          else if (!t?.ownerId) deps.ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
          else if (t.ownerId !== state.me) deps.ctx.strokeStyle = "rgba(255, 98, 98, 0.65)";
          else if (t.ownershipState === "SETTLED") deps.ctx.strokeStyle = "rgba(155, 242, 116, 0.88)";
          else deps.ctx.strokeStyle = "rgba(255, 205, 92, 0.82)";
          if (t?.ownerId === state.me && t.ownershipState === "SETTLED") {
            deps.ctx.fillStyle = "rgba(155, 242, 116, 0.12)";
            deps.ctx.fillRect(px, py, size, size);
          } else {
            deps.ctx.lineWidth = 2;
            deps.ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
            deps.ctx.lineWidth = 1;
          }
        }
      }
      if (!isTrue3DRendererActive() && state.hover && state.hover.x === wx && state.hover.y === wy) {
        deps.ctx.strokeStyle = "rgba(255,255,255,0.55)";
        deps.ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      }
      const incomingAttack = drawableIncomingAttack(state, wk, Date.now());
      if (incomingAttack && !isTrue3DRendererActive()) deps.drawIncomingAttackOverlay(wx, wy, px, py, size, incomingAttack.resolvesAt);
      if (!isTrue3DRendererActive() && settlementProgress) {
        const totalMs = Math.max(1, settlementProgress.resolvesAt - settlementProgress.startAt);
        const now = Date.now();
        const progress = Math.max(0, Math.min(1, (now - settlementProgress.startAt) / totalMs));
        const fillWidth = Math.max(2, Math.floor((size - 2) * progress));
        const ownerFill = t?.ownerId ? deps.effectiveOverlayColor(t.ownerId) : "#ffd166";
        const pulse = 0.34 + 0.28 * (0.5 + 0.5 * Math.sin(now / 160));
        const darkPixelAlpha = (0.86 + pulse * 0.12).toFixed(3);
        deps.ctx.fillStyle = "rgba(9, 14, 24, 0.28)";
        deps.ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
        deps.ctx.fillStyle = ownerFill;
        deps.ctx.globalAlpha = 0.16 + progress * 0.36;
        deps.ctx.fillRect(px + 1, py + 1, fillWidth, size - 2);
        deps.ctx.globalAlpha = 1;
        const pixelCount = deps.isMobile()
          ? Math.max(10, Math.min(22, Math.floor(size * 0.78)))
          : Math.max(12, Math.min(28, Math.floor(size * 0.94)));
        const activePixels = Math.max(6, Math.round(4 + progress * pixelCount));
        const swarmInset = Math.max(1, Math.floor(size * 0.04));
        const swarmWidth = Math.max(3, size - swarmInset * 2);
        const pixelSize = size <= 10 ? 1 : 2;
        deps.ctx.fillStyle = `rgba(6, 8, 12, ${darkPixelAlpha})`;
        for (let i = 0; i < activePixels; i += 1) {
          const point = deps.settlePixelWanderPoint(now, wx, wy, i);
          const dotX = Math.floor(px + swarmInset + point.x * (swarmWidth - pixelSize));
          const dotY = Math.floor(py + swarmInset + point.y * (swarmWidth - pixelSize));
          deps.ctx.fillRect(dotX, dotY, pixelSize, pixelSize);
        }
        deps.ctx.strokeStyle = `rgba(255, 241, 185, ${0.68 + pulse * 0.16})`;
        deps.ctx.lineWidth = 2;
        deps.ctx.strokeRect(px + 1.5, py + 1.5, size - 4, size - 4);
        deps.ctx.lineWidth = 1;
      }

      if (state.dragPreviewKeys.has(wk)) {
        deps.ctx.strokeStyle = "rgba(129, 230, 217, 0.9)";
        deps.ctx.lineWidth = 2;
        deps.ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
        deps.ctx.lineWidth = 1;
      }

      const queuedFrontierBadge = queuedCornerBadgeLayout({
        kind: "FRONTIER",
        ordinal: queueIndex.get(wk),
        px,
        py,
        size,
        isTrue3D: isTrue3DRendererActive(),
        blocked: false
      });
      drawQueuedCornerBadge(deps.ctx, queuedFrontierBadge);
      const queuedSettlementBadge = queuedCornerBadgeLayout({
        kind: "SETTLEMENT",
        ordinal: settleQueueIndex.get(wk),
        px,
        py,
        size,
        isTrue3D: isTrue3DRendererActive(),
        blocked: Boolean(settlementProgress),
        entryState: settleQueueEntryState.get(wk) ?? "queued"
      });
      drawQueuedCornerBadge(deps.ctx, queuedSettlementBadge);
      const queuedBuildBadge = queuedCornerBadgeLayout({
        kind: "BUILD",
        ordinal: queuedBuildIndex.get(wk),
        px,
        py,
        size,
        isTrue3D: isTrue3DRendererActive(),
        blocked: Boolean(settlementProgress),
        entryState: queuedBuildEntryState.get(wk) ?? "queued"
      });
      drawQueuedCornerBadge(deps.ctx, queuedBuildBadge);
    };
    const tileStartAt = performance.now();
    for (let y = -halfH; y <= halfH; y += 1) {
      for (let x = -halfW; x <= halfW; x += 1) {
        const wx = deps.wrapX(state.camX + x);
        const wy = deps.wrapY(state.camY + y);
        const wk = deps.keyFor(wx, wy);
        const t = state.tiles.get(wk);
        const settlementProgress = t ? deps.settlementProgressForTile(wx, wy) : undefined;
        const vis = deps.tileVisibilityStateAt(wx, wy, t);
        const screenCenter = isTrue3DRendererActive() ? deps.worldToScreen(wx, wy, size, halfW, halfH) : undefined;
        const px = screenCenter ? screenCenter.sx - size / 2 : (x + halfW) * size;
        const py = screenCenter ? screenCenter.sy - size / 2 : (y + halfH) * size;
        let ownerAlpha = 1;

        if (!isTrue3DRendererActive()) {
          if (vis === "unexplored") {
            deps.ctx.fillStyle = "#06090f";
            deps.ctx.fillRect(px, py, size, size);
          } else if (!t) {
            if (state.firstChunkAt === 0 || effectiveFogDisabled(state) || revealWholeMapInTrue3DMode) {
              deps.drawTerrainTile(wx, wy, terrainAt(wx, wy), px, py, size);
            } else {
              deps.ctx.fillStyle = "#06090f";
              deps.ctx.fillRect(px, py, size, size);
            }
          } else if (vis === "fogged") {
            deps.drawTerrainTile(wx, wy, t.terrain, px, py, size);
            deps.ctx.fillStyle = (t.terrain === "SEA" || t.terrain === "COASTAL_SEA") ? "rgba(7, 20, 34, 0.34)" : "rgba(2, 5, 10, 0.72)";
            deps.ctx.fillRect(px, py, size, size);
          } else if (t.terrain === "SEA" || t.terrain === "COASTAL_SEA" || t.terrain === "MOUNTAIN") {
            deps.drawTerrainTile(wx, wy, t.terrain, px, py, size);
          } else {
            deps.drawTerrainTile(wx, wy, "LAND", px, py, size);
          }
        }

        if (!isTrue3DRendererActive() && t && vis === "visible" && t.terrain === "LAND") { deps.drawForestOverlay(wx, wy, px, py, size); deps.drawHillsOverlay(wx, wy, px, py, size); }

        if (!isTrue3DRendererActive() && t && vis === "visible" && t.terrain === "LAND" && t.ownerId) {
          deps.ctx.fillStyle = deps.effectiveOverlayColor(t.ownerId);
          ownerAlpha =
            t.ownershipState === "FRONTIER" ? (isTrue3DRendererActive() ? 0.08 : 0.2)
            : isTrue3DRendererActive() ? 0.24
            : 0.92;
          if (typeof t.breachShockUntil === "number" && t.breachShockUntil > Date.now()) {
            ownerAlpha = Math.min(ownerAlpha, 0.62);
          }
          if (t.ownershipState === "FRONTIER" && typeof t.frontierDecayAt === "number") {
            const remainingMs = t.frontierDecayAt - Date.now();
            if (remainingMs > 0 && remainingMs <= 60_000) {
              const blink = 0.5 + 0.5 * Math.sin((Date.now() / 2_000) * Math.PI * 2);
              ownerAlpha *= 0.55 + blink * 0.6;
            }
          }
          deps.ctx.globalAlpha = ownerAlpha;
          if (t.ownershipState === "SETTLED") deps.ctx.fillRect(px, py, size, size);
          else deps.ctx.fillRect(px, py, size - 1, size - 1);
          deps.ctx.globalAlpha = 1;
        }

        // Fogged tiles show the last-witnessed owner at a fixed dim tint —
        // no blink/breach-shock animation, since that's live state we no
        // longer have. This is the frozen-ownership half of "witness the
        // flip, then it fogs": the delta already updated t.ownerId to the
        // new owner before freezing, so a captured-then-fogged tile reads
        // as the new owner's color, not the player's own.
        if (!isTrue3DRendererActive() && t && vis === "fogged" && t.terrain === "LAND" && t.ownerId) {
          deps.ctx.fillStyle = deps.effectiveOverlayColor(t.ownerId);
          deps.ctx.globalAlpha = t.ownershipState === "SETTLED" ? 0.4 : 0.12;
          if (t.ownershipState === "SETTLED") deps.ctx.fillRect(px, py, size, size);
          else deps.ctx.fillRect(px, py, size - 1, size - 1);
          deps.ctx.globalAlpha = 1;
        }

        overlayTiles.push({ wx, wy, wk, px, py, vis, t, settlementProgress });
        if (
          isTrue3DRendererActive() &&
          debugSelected &&
          Math.abs(wx - debugSelected.x) <= 1 &&
          Math.abs(wy - debugSelected.y) <= 1
        ) {
          const selected = state.tiles.get(deps.keyFor(debugSelected.x, debugSelected.y));
          canvasOverlayDebug.push({
            x: wx,
            y: wy,
            terrain: t?.terrain ?? terrainAt(wx, wy),
            visibility: vis,
            ownerId: t?.ownerId ?? null,
            ownershipState: t?.ownershipState ?? null,
            selectedTile: debugSelected.x === wx && debugSelected.y === wy,
            supportNeighbor: Boolean(
              selected?.town &&
              deps.isTownSupportNeighbor(wx, wy, debugSelected.x, debugSelected.y) &&
              deps.isTownSupportHighlightableTile(t)
            ),
            queue: queueIndex.get(wk) ?? null,
            queueSettlement: settleQueueIndex.get(wk) ?? null,
            queueBuild: queuedBuildIndex.get(wk) ?? null,
            hasSettlementProgress: Boolean(settlementProgress),
            hover: Boolean(state.hover && state.hover.x === wx && state.hover.y === wy),
            dragPreview: state.dragPreviewKeys.has(wk)
          });
        }
        if (roadNetworkBuiltAt >= 0) continue;

        const isDockEndpoint = dockEndpointKeys.has(wk);
        const dockVisible = (!t && effectiveFogDisabled(state)) || vis === "visible";
        if (dockVisible && isDockEndpoint) {
          deps.drawDockMarker(px, py, size);
        }
        // 3D dock overlay supersedes the SVG icon (and its fallback) in true-3D mode.
        if (dockVisible && isDockEndpoint && !isTrue3DRendererActive()) {
          const dockOverlay = deps.dockOverlayVariants[deps.overlayVariantIndexAt(wx, wy, deps.dockOverlayVariants.length)];
          if (dockOverlay?.complete && dockOverlay.naturalWidth) deps.drawCenteredOverlay(dockOverlay, px, py, size, 1.14);
          else {
            deps.ctx.fillStyle = "rgba(12, 22, 38, 0.42)";
            deps.ctx.fillRect(px + 1, py + 1, size - 3, size - 3);
            deps.ctx.strokeStyle = "rgba(115, 225, 255, 0.98)";
            deps.ctx.lineWidth = 2;
            deps.ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
            deps.ctx.strokeStyle = "rgba(214, 247, 255, 0.95)";
            deps.ctx.beginPath();
            deps.ctx.moveTo(px + size / 2, py + 3);
            deps.ctx.lineTo(px + size / 2, py + size - 3);
            deps.ctx.moveTo(px + 3, py + size / 2);
            deps.ctx.lineTo(px + size - 3, py + size / 2);
            deps.ctx.stroke();
            deps.ctx.lineWidth = 1;
          }
        }

        const overlayTile = t ?? syntheticOverlayTileAt(wx, wy, t);
        const overlayVisible = vis === "visible" || Boolean(overlayTile && isTrue3DRendererActive() && revealWholeMapInTrue3DMode);

        if (!isTrue3DRendererActive() && t && vis === "visible" && t.terrain === "LAND" && t.ownerId && t.ownershipState === "SETTLED") {
          const roadDirections = roadNetwork.get(wk);
          if (roadDirections) deps.drawRoadOverlay(roadDirections, px, py, size);
        }

        if (overlayTile && overlayVisible && overlayTile.resource && overlayTile.terrain === "LAND") {
          const builtOverlay = deps.builtResourceOverlayForTile(overlayTile);
          const overlay = builtOverlay ?? deps.resourceOverlayForTile(overlayTile);
          if (overlay?.complete && overlay.naturalWidth) {
            if (!isTrue3DRendererActive()) {
              const alpha = builtOverlay ? deps.economicStructureOverlayAlpha(overlayTile) : 1;
              deps.drawCenteredOverlayWithAlpha(overlay, px, py, size, deps.resourceOverlayScaleForTile(overlayTile), alpha);
            }
            deps.drawResourceCornerMarker(overlayTile, px, py, size);
          } else {
            if (!isTrue3DRendererActive()) {
              const rc = deps.resourceColor(overlayTile.resource);
              if (!rc) continue;
              const marker = Math.max(3, Math.floor(size * 0.22));
              const mx = px + Math.floor((size - marker) / 2);
              const my = py + Math.floor((size - marker) / 2);
              deps.ctx.fillStyle = "rgba(12, 16, 28, 0.7)";
              deps.ctx.fillRect(mx - 1, my - 1, marker + 2, marker + 2);
              deps.ctx.fillStyle = rc;
              deps.ctx.fillRect(mx, my, marker, marker);
            }
            deps.drawResourceCornerMarker(overlayTile, px, py, size);
          }
        }

        const visibleShardSite = visibleShardSiteForTile(t, state.shardRainPingsByTile, Date.now());
        if (t && vis === "visible" && t.terrain === "LAND" && visibleShardSite && !isTrue3DRendererActive()) {
          const tileWithVisibleShard = visibleShardSite === t.shardSite ? t : { ...t, shardSite: visibleShardSite };
          const overlay = deps.shardOverlayForTile(tileWithVisibleShard);
          const pulsePhase = 0.5 + 0.5 * Math.sin(nowMs / 280 + t.x * 0.21 + t.y * 0.17);
          const pulse = 0.82 + 0.18 * pulsePhase;
          const glowRadius = size * (0.28 + pulsePhase * (visibleShardSite.kind === "FALL" ? 0.3 : 0.24));
          deps.ctx.save();
          deps.ctx.globalCompositeOperation = "screen";
          deps.ctx.fillStyle =
            visibleShardSite.kind === "FALL"
              ? `rgba(255, 220, 112, ${0.16 + pulsePhase * 0.18})`
              : `rgba(96, 244, 255, ${0.14 + pulsePhase * 0.16})`;
          deps.ctx.beginPath();
          deps.ctx.arc(px + size / 2, py + size / 2, glowRadius, 0, Math.PI * 2);
          deps.ctx.fill();
          deps.ctx.lineWidth = Math.max(2, size * 0.08);
          deps.ctx.strokeStyle =
            visibleShardSite.kind === "FALL"
              ? `rgba(255, 245, 180, ${0.38 + pulsePhase * 0.34})`
              : `rgba(184, 255, 255, ${0.34 + pulsePhase * 0.3})`;
          deps.ctx.beginPath();
          deps.ctx.arc(px + size / 2, py + size / 2, size * (0.18 + pulsePhase * 0.18), 0, Math.PI * 2);
          deps.ctx.stroke();
          deps.ctx.restore();
          if (overlay?.complete && overlay.naturalWidth) {
            deps.drawCenteredOverlayWithAlpha(
              overlay,
              px,
              py,
              size,
              (visibleShardSite.kind === "FALL" ? 1.1 : 1.02) * (0.98 + pulse * 0.06),
              0.86 + pulse * 0.18
            );
          } else {
            const prevAlpha = deps.ctx.globalAlpha;
            deps.ctx.globalAlpha = prevAlpha * (0.88 + pulse * 0.16);
            deps.drawShardFallback(tileWithVisibleShard, px, py, size * (0.99 + pulse * 0.03));
            deps.ctx.globalAlpha = prevAlpha;
          }
        }

        if (overlayTile && overlayVisible && overlayTile.town && overlayTile.terrain === "LAND") deps.drawTownOverlay(overlayTile, px, py, size);

        if (t && vis === "visible" && t.terrain === "LAND" && t.watchtower && !isTrue3DRendererActive()) drawWatchtower2D(deps.ctx, t, px, py, size, nowMs);

        if (t && vis === "visible" && t.naturalWonder && !isTrue3DRendererActive()) drawNaturalWonderOverlay2D(deps.ctx, naturalWonderOverlayForTile(t), t.ownerId ?? "", px, py, size, deps.structureAccentColor);
        if (t && vis === "visible" && t.ownerId === state.me && t.ownershipState === "SETTLED" && deps.hasCollectableYield(t)) {
          const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(nowMs / 230));
          const marker = Math.max(4, Math.floor(size * 0.22));
          const mx = px + 3;
          const my = py + 3;
          deps.ctx.fillStyle = `rgba(15, 18, 28, ${0.68 + pulse * 0.18})`;
          deps.ctx.fillRect(mx - 1, my - 1, marker + 2, marker + 2);
          deps.ctx.fillStyle = `rgba(255, 220, 90, ${0.75 + pulse * 0.25})`;
          deps.ctx.fillRect(mx, my, marker, marker);
        }

        if (t && vis === "visible" && t.fort) {
          deps.ctx.fillStyle = deps.structureAccentColor(
            t.ownerId ?? "",
            t.fort.status === "active" ? "rgba(239,71,111,0.8)" : "rgba(255,209,102,0.75)"
          );
          const dot = Math.max(3, Math.floor(size * 0.25));
          deps.ctx.fillRect(px + size - dot - 2, py + 2, dot, dot);
        }
        if (t && vis === "visible" && t.siegeOutpost) {
          deps.ctx.fillStyle = deps.structureAccentColor(
            t.ownerId ?? "",
            t.siegeOutpost.status === "active" ? "rgba(255, 123, 0, 0.85)" : "rgba(255, 196, 122, 0.78)"
          );
          const dot = Math.max(3, Math.floor(size * 0.25));
          deps.ctx.fillRect(px + size - dot - 2, py + size - dot - 2, dot, dot);
        }
        if (t && vis === "visible" && t.observatory && !isTrue3DRendererActive()) {
          // 2D-only: 3D renderer paints the observatory mesh via structureOverlay.
          const overlay = deps.structureOverlayImages.OBSERVATORY;
          if (overlay && overlay.complete && overlay.naturalWidth) deps.drawCenteredOverlay(overlay, px, py, size, 1.02);
          else {
            deps.ctx.strokeStyle = deps.structureAccentColor(
              t.ownerId ?? "",
              t.observatory.status === "active" ? "rgba(122, 214, 255, 0.92)" : "rgba(122, 214, 255, 0.42)"
            );
            deps.ctx.beginPath();
            deps.ctx.arc(px + size / 2, py + size / 2, Math.max(3, size * 0.22), 0, Math.PI * 2);
            deps.ctx.stroke();
          }
        }
        if (t && (vis === "visible" || vis === "fogged") /* fog-tolerant, see the first pass above */ && t.economicStructure) {
          const markerSize = Math.max(3, Math.floor(size * 0.2));
          const active = t.economicStructure.status === "active";
          const hasBuiltResourceOverlay = Boolean(deps.builtResourceOverlayForTile(t));
          const overlay = deps.structureOverlayImages[t.economicStructure.type];
          const handled3DStructure2 =
            isTrue3DRendererActive() &&
            isStructureHandledBy3D(t.economicStructure.type);
          if (handled3DStructure2) {
          } else if (overlay && overlay.complete && overlay.naturalWidth) {
            deps.drawCenteredOverlay(overlay, px, py, size, 1.02);
          } else if (t.economicStructure.type === "FARMSTEAD" && !hasBuiltResourceOverlay) {
            deps.ctx.fillStyle = deps.structureAccentColor(
              t.ownerId ?? "",
              active ? "rgba(192, 229, 117, 0.95)" : "rgba(148, 176, 104, 0.72)"
            );
            deps.ctx.fillRect(px + 2, py + size - markerSize - 2, markerSize + 1, markerSize);
          } else if (t.economicStructure.type === "UMBRITE_RIG" && !hasBuiltResourceOverlay) {
            deps.ctx.fillStyle = deps.structureAccentColor(
              t.ownerId ?? "",
              active ? "rgba(147, 92, 201, 0.95)" : "rgba(114, 71, 156, 0.74)"
            );
            deps.ctx.beginPath();
            deps.ctx.moveTo(px + size / 2, py + 3);
            deps.ctx.lineTo(px + size - 4, py + markerSize + 4);
            deps.ctx.lineTo(px + 4, py + markerSize + 4);
            deps.ctx.closePath();
            deps.ctx.fill();
          } else if (t.economicStructure.type === "MINE" && !hasBuiltResourceOverlay) {
            deps.ctx.fillStyle = deps.structureAccentColor(
              t.ownerId ?? "",
              active ? "rgba(188, 197, 214, 0.96)" : "rgba(120, 130, 148, 0.74)"
            );
            deps.ctx.fillRect(px + 2, py + 2, markerSize + 1, markerSize + 1);
          } else {
            deps.ctx.strokeStyle = deps.structureAccentColor(
              t.ownerId ?? "",
              active ? "rgba(255, 212, 111, 0.96)" : "rgba(191, 162, 102, 0.72)"
            );
            deps.ctx.lineWidth = 2;
            deps.ctx.strokeRect(px + 2, py + 2, markerSize + 2, markerSize + 2);
            deps.ctx.lineWidth = 1;
          }
        }
        if (t && vis === "visible" && t.terrain === "LAND") drawConstructionCountdownOverlay(t, wk, px, py, size);
        if (t && vis === "visible" && t.sabotage && t.sabotage.endsAt > Date.now()) {
          deps.ctx.strokeStyle = "rgba(255, 83, 83, 0.92)";
          deps.ctx.beginPath();
          deps.ctx.moveTo(px + 3, py + 3);
          deps.ctx.lineTo(px + size - 3, py + size - 3);
          deps.ctx.moveTo(px + size - 3, py + 3);
          deps.ctx.lineTo(px + 3, py + size - 3);
          deps.ctx.stroke();
        }

        if (!isTrue3DRendererActive() && crystalTargetingActive && t && vis === "visible" && state.crystalTargeting.validTargets.has(wk)) {
          deps.ctx.fillStyle =
            crystalTone === "amber"
              ? "rgba(255, 187, 72, 0.12)"
              : crystalTone === "cyan"
                ? "rgba(113, 223, 255, 0.13)"
                : "rgba(255, 100, 100, 0.12)";
          deps.ctx.fillRect(px + 1, py + 1, size - 3, size - 3);
          deps.ctx.strokeStyle =
            crystalTone === "amber"
              ? "rgba(255, 201, 102, 0.88)"
              : crystalTone === "cyan"
                ? "rgba(116, 227, 255, 0.9)"
                : "rgba(255, 110, 110, 0.88)";
          deps.ctx.lineWidth = 2;
          deps.ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
          deps.ctx.lineWidth = 1;
        }

        if (!isTrue3DRendererActive() && t && vis === "visible" && t.terrain === "LAND" && !t.ownerId) {
          deps.ctx.strokeStyle = "rgba(20, 26, 36, 0.58)";
          deps.ctx.lineWidth = 1;
          deps.ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
        }

        const startingArrow = startingArrowTargets.get(wk);
        if (startingArrow && !settlementProgress && queueIndex.get(wk) === undefined) {
          deps.drawStartingExpansionArrow(px, py, size, startingArrow.dx, startingArrow.dy);
        }

        if (!isTrue3DRendererActive() && t && vis === "visible" && t.ownerId === "barbarian") deps.drawBarbarianSkullOverlay(px, py, size);

        drawTileOwnershipAndBreachBorder(t, vis, px, py, size, {
          ctx: deps.ctx,
          me: state.me,
          is3D: isTrue3DRendererActive(),
          shouldDrawOwnershipBorder: deps.shouldDrawOwnershipBorder,
          borderColorForOwner: deps.borderColorForOwner,
          isTileOwnedByAlly: deps.isTileOwnedByAlly,
          borderLineWidthForOwner: deps.borderLineWidthForOwner,
          tiles: state.tiles,
          keyFor: deps.keyFor,
          wrapX: deps.wrapX,
          wrapY: deps.wrapY
        });

        // Fixed-borders-via-reach overlay -- see the main pass above.
        if (!isTrue3DRendererActive() && myReach && t && vis !== "unexplored") {
          if (vis === "visible" && t.ownerId === state.me && isDormantFrontierTile(t)) {
            drawDormantFrontierTreatment(deps.ctx, px, py, size);
          }
          if (t.ownerId === state.me) {
            drawReachBoundaryLine(deps.ctx, wx, wy, px, py, size, myReach, {
              tiles: state.tiles,
              keyFor: deps.keyFor,
              wrapX: deps.wrapX,
              wrapY: deps.wrapY
            });
          }
        }
        if (state.showWeakDefensibility && vis === "visible" && isOwnedSettledLandTile(t, state.me)) {
          const exposedSides = exposedSidesForTile(t, {
            tiles: state.tiles,
            me: state.me,
            keyFor: deps.keyFor,
            wrapX: deps.wrapX,
            wrapY: deps.wrapY,
            terrainAt
          });
          const severity = weakDefensibilitySeverity(exposedSides.length);
          if (severity) {
            const critical = severity === "critical";
            deps.ctx.fillStyle = critical ? "rgba(255, 84, 84, 0.18)" : "rgba(255, 173, 92, 0.12)";
            deps.ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
            deps.ctx.strokeStyle = critical ? "rgba(255, 84, 84, 0.92)" : "rgba(255, 173, 92, 0.88)";
            deps.ctx.lineWidth = critical ? 4 : 3;
            deps.ctx.beginPath();
            if (exposedSides.includes("north")) {
              deps.ctx.moveTo(px + 1, py + 2);
              deps.ctx.lineTo(px + size - 1, py + 2);
            }
            if (exposedSides.includes("east")) {
              deps.ctx.moveTo(px + size - 2, py + 1);
              deps.ctx.lineTo(px + size - 2, py + size - 1);
            }
            if (exposedSides.includes("south")) {
              deps.ctx.moveTo(px + 1, py + size - 2);
              deps.ctx.lineTo(px + size - 1, py + size - 2);
            }
            if (exposedSides.includes("west")) {
              deps.ctx.moveTo(px + 2, py + 1);
              deps.ctx.lineTo(px + 2, py + size - 1);
            }
            deps.ctx.stroke();
            if (size >= 12) {
              deps.ctx.fillStyle = critical ? "rgba(255, 84, 84, 0.96)" : "rgba(255, 196, 92, 0.96)";
              deps.ctx.beginPath();
              deps.ctx.arc(px + size * 0.5, py + size * 0.5, critical ? 2.3 : 1.8, 0, Math.PI * 2);
              deps.ctx.fill();
            }
            deps.ctx.lineWidth = 1;
          }
        }

        if (!isTrue3DRendererActive() && state.selected && state.selected.x === wx && state.selected.y === wy) {
          if (t?.ownerId === state.me && t.ownershipState === "SETTLED") {
            deps.ctx.fillStyle = "rgba(255, 209, 102, 0.18)";
            deps.ctx.fillRect(px, py, size, size);
          } else {
            deps.ctx.strokeStyle = "#ffd166";
            deps.ctx.lineWidth = 2;
            deps.ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
            deps.ctx.lineWidth = 1;
          }
        } else if (state.selected) {
          const selected = state.tiles.get(deps.keyFor(state.selected.x, state.selected.y));
          if (
            !isTrue3DRendererActive() &&
            selected?.town &&
            deps.isTownSupportNeighbor(wx, wy, state.selected.x, state.selected.y) &&
            deps.isTownSupportHighlightableTile(t)
          ) {
            if (t?.terrain !== "LAND") deps.ctx.strokeStyle = "rgba(92, 103, 127, 0.7)";
            else if (!t?.ownerId) deps.ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
            else if (t.ownerId !== state.me) deps.ctx.strokeStyle = "rgba(255, 98, 98, 0.65)";
            else if (t.ownershipState === "SETTLED") deps.ctx.strokeStyle = "rgba(155, 242, 116, 0.88)";
            else deps.ctx.strokeStyle = "rgba(255, 205, 92, 0.82)";
            if (t?.ownerId === state.me && t.ownershipState === "SETTLED") {
              deps.ctx.fillStyle = "rgba(155, 242, 116, 0.12)";
              deps.ctx.fillRect(px, py, size, size);
            } else {
              deps.ctx.lineWidth = 2;
              deps.ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
              deps.ctx.lineWidth = 1;
            }
          }
        }
        if (!isTrue3DRendererActive() && state.hover && state.hover.x === wx && state.hover.y === wy) {
          deps.ctx.strokeStyle = "rgba(255,255,255,0.55)";
          deps.ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
        }
        const incomingAttack = drawableIncomingAttack(state, wk, Date.now());
        if (incomingAttack && !isTrue3DRendererActive()) deps.drawIncomingAttackOverlay(wx, wy, px, py, size, incomingAttack.resolvesAt);
        if (!isTrue3DRendererActive() && settlementProgress) {
          const totalMs = Math.max(1, settlementProgress.resolvesAt - settlementProgress.startAt);
          const now = Date.now();
          const progress = Math.max(0, Math.min(1, (now - settlementProgress.startAt) / totalMs));
          const fillWidth = Math.max(2, Math.floor((size - 2) * progress));
          const ownerFill = t?.ownerId ? deps.effectiveOverlayColor(t.ownerId) : "#ffd166";
          const pulse = 0.34 + 0.28 * (0.5 + 0.5 * Math.sin(now / 160));
          const darkPixelAlpha = (0.86 + pulse * 0.12).toFixed(3);
          deps.ctx.fillStyle = "rgba(9, 14, 24, 0.28)";
          deps.ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
          deps.ctx.fillStyle = ownerFill;
          deps.ctx.globalAlpha = 0.16 + progress * 0.36;
          deps.ctx.fillRect(px + 1, py + 1, fillWidth, size - 2);
          deps.ctx.globalAlpha = 1;
          const pixelCount = deps.isMobile()
            ? Math.max(10, Math.min(22, Math.floor(size * 0.78)))
            : Math.max(12, Math.min(28, Math.floor(size * 0.94)));
          const activePixels = Math.max(6, Math.round(4 + progress * pixelCount));
          const swarmInset = Math.max(1, Math.floor(size * 0.04));
          const swarmWidth = Math.max(3, size - swarmInset * 2);
          const pixelSize = size <= 10 ? 1 : 2;
          deps.ctx.fillStyle = `rgba(6, 8, 12, ${darkPixelAlpha})`;
          for (let i = 0; i < activePixels; i += 1) {
            const point = deps.settlePixelWanderPoint(now, wx, wy, i);
            const dotX = Math.floor(px + swarmInset + point.x * (swarmWidth - pixelSize));
            const dotY = Math.floor(py + swarmInset + point.y * (swarmWidth - pixelSize));
            deps.ctx.fillRect(dotX, dotY, pixelSize, pixelSize);
          }
          deps.ctx.strokeStyle = `rgba(255, 241, 185, ${0.68 + pulse * 0.16})`;
          deps.ctx.lineWidth = 2;
          deps.ctx.strokeRect(px + 1.5, py + 1.5, size - 4, size - 4);
          deps.ctx.lineWidth = 1;
        }

        if (state.dragPreviewKeys.has(wk)) {
          deps.ctx.strokeStyle = "rgba(129, 230, 217, 0.9)";
          deps.ctx.lineWidth = 2;
          deps.ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
          deps.ctx.lineWidth = 1;
        }

        const queuedFrontierBadge = queuedCornerBadgeLayout({
          kind: "FRONTIER",
          ordinal: queueIndex.get(wk),
          px,
          py,
          size,
          isTrue3D: isTrue3DRendererActive(),
          blocked: false
        });
        drawQueuedCornerBadge(deps.ctx, queuedFrontierBadge);
        const queuedSettlementBadge = queuedCornerBadgeLayout({
          kind: "SETTLEMENT",
          ordinal: settleQueueIndex.get(wk),
          px,
          py,
          size,
          isTrue3D: isTrue3DRendererActive(),
          blocked: Boolean(settlementProgress),
          entryState: settleQueueEntryState.get(wk) ?? "queued"
        });
        drawQueuedCornerBadge(deps.ctx, queuedSettlementBadge);
        const queuedBuildBadge = queuedCornerBadgeLayout({
          kind: "BUILD",
          ordinal: queuedBuildIndex.get(wk),
          px,
          py,
          size,
          isTrue3D: isTrue3DRendererActive(),
          blocked: Boolean(settlementProgress),
          entryState: queuedBuildEntryState.get(wk) ?? "queued"
        });
        drawQueuedCornerBadge(deps.ctx, queuedBuildBadge);
      }
    }
    const tileEndAt = performance.now();
    // Sequential sub-phase timer for the rest of the frame: each phaseMs() call returns elapsed time since the previous call (or tileEndAt for the first), captured immediately — no hand-paired "XEndAt" checkpoints to mismatch.
    let lastPhaseMarkAt = tileEndAt;
    const phaseMs = (): number => {
      const markAt = performance.now();
      const elapsed = markAt - lastPhaseMarkAt;
      lastPhaseMarkAt = markAt;
      return elapsed;
    };

    for (const { wk, px, py, vis, t } of overlayTiles) {
      if (!isTrue3DRendererActive() && t && vis === "visible" && t.terrain === "LAND" && t.ownerId && t.ownershipState === "SETTLED") {
        const roadDirections = roadNetwork.get(wk);
        if (roadDirections) deps.drawRoadOverlay(roadDirections, px, py, size);
      }
    }
    const roadOverlayMs = phaseMs();

    for (const overlayTile of overlayTiles) renderOverlayTile(overlayTile);
    const tileOverlayMs = phaseMs();

    if (debugWindow && isTrue3DRendererActive() && debugSelected) {
      debugWindow.__be3dCanvasOverlayDebug = {
        selected: debugSelected,
        tiles: canvasOverlayDebug
      };
    }

    const selectedWorld = deps.selectedTile();
    if (!isTrue3DRendererActive()) renderSelectedStructurePreview2D(state, selectedWorld, deps, size, halfW, halfH);

    if (!isTrue3DRendererActive()) renderSelectedStructureReachHighlight(state, deps, size, halfW, halfH);
    if (!isTrue3DRendererActive()) renderBuildingPlacementPreview2D(state, deps, size, halfW, halfH);
    // Covers the true-3D debug overlay write above plus the observatory-range,
    // structure-preview, and building-placement-preview overlays — named for
    // the whole span, not just the last of those (selectionPreviewMs would
    // undersell what this phase actually measures).
    const selectionOverlaysMs = phaseMs();

    if (state.aetherWallTargeting.active) {
      const selectedKey = state.selected ? deps.keyFor(state.selected.x, state.selected.y) : "";
      const selectedOrigin = state.selected ? state.tiles.get(selectedKey) : undefined;
      for (const tile of overlayTiles) {
        if (tile.vis !== "visible" || !state.aetherWallTargeting.validOrigins.has(tile.wk)) continue;
        const selectedOriginTile = tile.wk === selectedKey;
        deps.ctx.save();
        deps.ctx.fillStyle = selectedOriginTile ? "rgba(44, 184, 255, 0.2)" : "rgba(44, 184, 255, 0.1)";
        deps.ctx.fillRect(tile.px + 1, tile.py + 1, size - 2, size - 2);
        deps.ctx.strokeStyle = selectedOriginTile ? "rgba(171, 237, 255, 0.98)" : "rgba(88, 214, 255, 0.88)";
        deps.ctx.lineWidth = selectedOriginTile ? 3 : 2;
        deps.ctx.strokeRect(tile.px + 1.5, tile.py + 1.5, size - 3, size - 3);
        deps.ctx.restore();
      }
      if (selectedOrigin) {
        const directionTargets = deps.aetherWallDirectionTargetTiles(selectedOrigin);
        for (const target of directionTargets) {
          const targetScreen = deps.worldToScreen(target.x, target.y, size, halfW, halfH);
          const hovered = state.hover?.x === target.x && state.hover?.y === target.y;
          const active = state.aetherWallTargeting.direction === target.direction;
          deps.ctx.save();
          deps.ctx.fillStyle = active ? "rgba(99, 228, 255, 0.18)" : hovered ? "rgba(99, 228, 255, 0.12)" : "rgba(99, 228, 255, 0.08)";
          deps.ctx.fillRect(targetScreen.sx - size / 2 + 1, targetScreen.sy - size / 2 + 1, size - 2, size - 2);
          deps.ctx.strokeStyle = active ? "rgba(201, 248, 255, 0.96)" : "rgba(102, 223, 255, 0.86)";
          deps.ctx.lineWidth = active ? 3 : 2;
          deps.ctx.strokeRect(targetScreen.sx - size / 2 + 1.5, targetScreen.sy - size / 2 + 1.5, size - 3, size - 3);
          deps.ctx.restore();
          deps.drawStartingExpansionArrow(targetScreen.sx - size / 2, targetScreen.sy - size / 2, size, target.dx, target.dy);
        }
      }
      if (state.selected) {
        const previewSegments = buildAetherWallSegments(
          state.selected.x,
          state.selected.y,
          state.aetherWallTargeting.direction,
          state.aetherWallTargeting.length,
          deps.wrapX,
          deps.wrapY
        );
        for (const segment of previewSegments) {
          drawAetherWallEdge(segment.baseX, segment.baseY, state.aetherWallTargeting.direction, { preview: true, nowMs });
        }
      }
    }

    if (!isTrue3DRendererActive() && crystalTargetingActive) {
      const hoveredKey = state.hover ? deps.keyFor(state.hover.x, state.hover.y) : "";
      const selectedKey = state.selected ? deps.keyFor(state.selected.x, state.selected.y) : "";
      const targetKey = state.crystalTargeting.validTargets.has(hoveredKey)
        ? hoveredKey
        : state.crystalTargeting.validTargets.has(selectedKey)
          ? selectedKey
          : "";
      if (targetKey) {
        const target = deps.parseKey(targetKey);
        const targetScreen = deps.worldToScreen(target.x, target.y, size, halfW, halfH);
        const originKey = state.crystalTargeting.originByTarget.get(targetKey);
        if (originKey) {
          const origin = deps.parseKey(originKey);
          const originScreen = deps.worldToScreen(origin.x, origin.y, size, halfW, halfH);
          deps.ctx.save();
          deps.ctx.strokeStyle =
            crystalTone === "amber"
              ? "rgba(255, 205, 98, 0.92)"
              : crystalTone === "cyan"
                ? "rgba(116, 227, 255, 0.92)"
                : "rgba(255, 110, 110, 0.92)";
          deps.ctx.lineWidth = 2;
          deps.ctx.setLineDash(crystalTone === "cyan" ? [10, 6] : [7, 5]);
          deps.ctx.beginPath();
          deps.ctx.moveTo(originScreen.sx, originScreen.sy);
          deps.ctx.lineTo(targetScreen.sx, targetScreen.sy);
          deps.ctx.stroke();
          deps.ctx.setLineDash([]);
          deps.ctx.strokeRect(originScreen.sx - size / 2 + 2, originScreen.sy - size / 2 + 2, size - 4, size - 4);
          deps.ctx.restore();
        }
        deps.ctx.save();
        deps.ctx.strokeStyle =
          crystalTone === "amber"
            ? "rgba(255, 219, 132, 1)"
            : crystalTone === "cyan"
              ? "rgba(153, 240, 255, 1)"
              : "rgba(255, 144, 144, 1)";
        deps.ctx.lineWidth = 3;
        deps.ctx.strokeRect(targetScreen.sx - size / 2 + 1, targetScreen.sy - size / 2 + 1, size - 2, size - 2);
        deps.ctx.restore();
      }
    }
    const targetingUiMs = phaseMs();

    // See client-dock-route-draw.ts for why this is 2D-only.
    if (!isTrue3DRendererActive()) {
      drawSelectedDockSeaRoute2D({
        ctx: deps.ctx,
        canvas: deps.canvas,
        dockPairs: state.dockPairs,
        selected: state.selected,
        size,
        halfW,
        halfH,
        nowMs,
        isDockRouteVisibleForPlayer: deps.isDockRouteVisibleForPlayer,
        resolveDockSeaRoute: deps.resolveDockSeaRoute,
        worldToScreen: deps.worldToScreen
      });
    }

    // 2D supply lines: flag → attack front, one per active muster flag/
    // auto-fire fight, covering manually-armed transits, ADVANCE-mode
    // fallback, and ADVANCE/MARCH auto-fire's own travel-time delay
    // (including MARCH's neutral-tile EXPAND leg) — see
    // client-muster-supply-lines-2d.ts.
    if (!isTrue3DRendererActive()) {
      drawMusterSupplyLines2D(state, deps.keyFor, deps.worldToScreen, deps.ctx, deps.effectiveOverlayColor, size, halfW, halfH, nowMs);
    }
    const routesMs = phaseMs();

    const visibleAetherWalls = state.activeAetherWalls.filter((wall) => wall.endsAt > nowMs);
    for (const wall of visibleAetherWalls) {
      const segments = buildAetherWallSegments(wall.origin.x, wall.origin.y, wall.direction, wall.length, deps.wrapX, deps.wrapY);
      for (const segment of segments) drawAetherWallEdge(segment.baseX, segment.baseY, wall.direction, { nowMs });
    }

    const visibleAetherBridges = state.activeAetherBridges.filter((bridge) => bridge.endsAt > nowMs);
    for (const bridge of visibleAetherBridges) {
      const from = deps.worldToScreen(bridge.from.x, bridge.from.y, size, halfW, halfH);
      const dx = deps.toroidDelta(bridge.from.x, bridge.to.x, WORLD_WIDTH) * size;
      const dy = deps.toroidDelta(bridge.from.y, bridge.to.y, WORLD_HEIGHT) * size;
      const to = { sx: from.sx + dx, sy: from.sy + dy };
      // In true-3D mode the flat anchor glyphs are replaced by real 3D
      // pylons (see client-map-3d-aether-bridge-pylon-overlay.ts), so draw
      // the lane only; the 2D path keeps its painted anchors.
      deps.drawAetherBridgeLane(deps.ctx, from.sx, from.sy, to.sx, to.sy, nowMs, {
        anchors: !isTrue3DRendererActive()
      });
    }

    pruneShardRainPings(state);
    if (state.shardRainFxUntil > nowMs) {
      const fxProgress = Math.max(0, (state.shardRainFxUntil - nowMs) / 8_000);
      deps.ctx.save();
      deps.ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 18; i += 1) {
        const x = ((i * 97 + nowMs * 0.08) % deps.canvas.width);
        const y = ((i * 59 + nowMs * 0.21) % deps.canvas.height);
        const len = 24 + (i % 5) * 10;
        const alpha = (0.08 + (i % 3) * 0.03) * fxProgress;
        deps.ctx.strokeStyle = `rgba(102, 224, 255, ${alpha})`;
        deps.ctx.lineWidth = 1 + (i % 2);
        deps.ctx.beginPath();
        deps.ctx.moveTo(x, y);
        deps.ctx.lineTo(x - 8, y + len);
        deps.ctx.stroke();
      }
      deps.ctx.restore();
    }
    const fxMs = phaseMs();

    deps.drawMiniMap();
    if (persistentAlertsComputedAt === 0 || nowMs - persistentAlertsComputedAt >= PERSISTENT_ALERTS_RECOMPUTE_INTERVAL_MS) {
      persistentAlertsCache = persistentAlertsForState(state);
      persistentAlertsComputedAt = nowMs;
    }
    drawPersistentAlertLocators(state, {
      ctx: deps.ctx,
      canvas: deps.canvas,
      worldToScreen: deps.worldToScreen,
      toroidDelta: deps.toroidDelta,
      size,
      halfW,
      halfH,
      nowMs,
      precomputedAlerts: persistentAlertsCache
    }); if (!isTrue3DRendererActive()) drawOnboardingChecklistHighlights(state.onboardingHighlightTiles, { ctx: deps.ctx, worldToScreen: deps.worldToScreen, size, halfW, halfH, nowMs });
    const minimapAlertsMs = phaseMs();
    requestVisibleTileDetails(overlayTiles, state.camX, state.camY);
    const tileDetailMs = phaseMs();
    // Split from tileDetailMs: maybeRefreshForCamera can fire a network
    // send on a camera-chunk change, a fundamentally different cost than
    // the local bookkeeping in requestVisibleTileDetails above it.
    deps.maybeRefreshForCamera(false);
    const cameraRefreshMs = phaseMs();
    const frameEndAt = lastPhaseMarkAt;
    recordFramePhaseSample({
      frameSetupMs: tileStartAt - frameStartAt,
      tileRenderMs: tileEndAt - tileStartAt,
      overlayPostMs: frameEndAt - tileEndAt,
      totalFrameMs: frameEndAt - frameStartAt,
      roadOverlayMs,
      tileOverlayMs,
      selectionOverlaysMs,
      targetingUiMs,
      routesMs,
      fxMs,
      minimapAlertsMs,
      tileDetailMs,
      cameraRefreshMs
    });
    recordDrawFrame(previousDrawAt, frameStartAt);
    requestAnimationFrame(draw);
  };

  deps.initTerrainTextures();
  draw();
  deps.renderHud();
  setInterval(deps.renderCaptureProgress, 100);
  setInterval(deps.renderShardAlert, 250); setInterval(deps.renderVictoryHoldAlert, 1_000); startTileMenuDecayTicker(state, deps.tileMenuViewForTile, deps.renderTileActionMenu);
  setInterval(() => {
    const expiredSettlementProgress = deps.cleanupExpiredSettlementProgress();
    const startedQueuedDevelopment = state.developmentQueue.length > 0 ? deps.processDevelopmentQueue() : false;
    if (state.autoSettleTargets.size > 0) deps.processAutoSettleTargets();
    if (state.autoBuildTargets.size > 0) deps.processAutoBuildTargets();
    const recoveredExpiredFrontier = sweepExpiredFrontierRecovery(state, {
      clearOptimisticTileState: deps.clearOptimisticTileState,
      dropQueuedTargetKeyIfAbsent: deps.dropQueuedTargetKeyIfAbsent,
      pushFeed: deps.pushFeed,
      requestViewRefresh: deps.requestViewRefresh
    });
    if (expiredSettlementProgress || state.settleProgressByTile.size > 0 || startedQueuedDevelopment || recoveredExpiredFrontier) {
      deps.renderHud();
    }
    // Fire whichever muster flags' transit windows have expired; each flag arms/marches
    // independently and only claims actionInFlight for the one attack it actually sends.
    fireDueMusterTransits(state, {
      keyFor: deps.keyFor,
      sendDeferredAttack: deps.sendDeferredAttack,
      requestViewRefresh: deps.requestViewRefresh
    });
    if (state.pendingMusterAttacks.length > 0) deps.processPendingMusterAttacks(); // queued muster attacks share this heartbeat
    // A promotion above just pushed a target onto actionQueue with
    // actionInFlight still false (nothing dispatched yet) — without this,
    // the early return right below (written for the accept-timeout handling
    // further down, which only applies once something IS in flight) meant
    // nothing in this heartbeat ever went on to dispatch the freshly
    // promoted entry. It would then sit inert in actionQueue forever unless
    // some unrelated trigger (a different click, an incoming TILE_DELTA,
    // etc.) happened to call processActionQueue afterward.
    if (!state.actionInFlight && state.actionQueue.length > 0) deps.processActionQueue();
    if (!state.actionInFlight) return;
    const started = state.actionStartedAt;
    if (!started) return;
    if (!state.actionAcceptedAck && !state.actionAcceptTimeoutHandledAt && Date.now() - started > 2_000) {
      const current = state.actionCurrent;
      const currentKey = current ? deps.keyFor(current.x, current.y) : "";
      const currentTile = currentKey ? state.tiles.get(currentKey) : undefined;
      const preservedCapture =
        current && state.capture && state.capture.target.x === current.x && state.capture.target.y === current.y ? state.capture : undefined;
      const keepOptimisticExpand = deps.shouldPreserveOptimisticExpandByKey(currentKey);
      const waitForFrontierSync =
        keepOptimisticExpand ||
        Boolean(current && !state.actionAcceptedAck && !state.combatStartAck && !currentTile?.ownerId);
      attackSyncLog("action-accept-timeout", {
        current,
        currentKey,
        elapsedMs: Date.now() - started,
        actionAcceptedAck: state.actionAcceptedAck,
        keepOptimisticExpand,
        waitForFrontierSync,
        queueLength: state.actionQueue.length,
        queuedKeys: Array.from(state.queuedTargetKeys),
        pendingCombatReveal: state.pendingCombatReveal
          ? {
              targetKey: state.pendingCombatReveal.targetKey,
              revealed: state.pendingCombatReveal.revealed
            }
          : undefined
      });
      state.actionAcceptTimeoutHandledAt = Date.now();
      if (waitForFrontierSync) {
        state.capture = undefined;
        if (state.pendingCombatReveal?.targetKey === currentKey) state.pendingCombatReveal = undefined;
        state.actionInFlight = false;
        state.actionAcceptedAck = false;
        state.combatStartAck = false;
        state.actionAcceptTimeoutHandledAt = 0;
        state.actionStartedAt = 0;
        state.actionTargetKey = "";
        state.actionCurrent = undefined;
        state.frontierSyncWaitUntilByTarget.set(currentKey, Date.now() + 12_000);
        state.frontierLateAckUntilByTarget.set(currentKey, Date.now() + 12_000);
        state.actionQueue = state.actionQueue.filter((entry) => deps.keyFor(entry.x, entry.y) !== currentKey);
        state.queuedTargetKeys.delete(currentKey);
        if (currentKey) deps.dropQueuedTargetKeyIfAbsent(currentKey);
        deps.showCaptureAlert(
          "Expansion sync delayed",
          "No server acceptance arrived within 2 seconds. Refreshing nearby tiles while waiting for frontier sync. Use Download debug log below if this keeps happening.",
          "warn"
        );
        deps.pushFeed("No server acceptance arrived within 2s; waiting for frontier sync instead of retrying the same tile.", "combat", "warn");
        deps.requestViewRefresh(1, true);
        attackSyncLog("action-accept-timeout-refresh", {
          strategy: "wait-for-frontier-sync",
          currentKey,
          refreshRadius: 1
        });
      } else if (current) {
        state.capture = preservedCapture;
        if (currentKey) state.frontierLateAckUntilByTarget.set(currentKey, Date.now() + 12_000);
        deps.showCaptureAlert(
          "Attack sync delayed",
          "No server acceptance arrived within 2 seconds. Keeping the current attack active while waiting for the server result.",
          "warn"
        );
        deps.requestViewRefresh(1, true);
        deps.pushFeed("No server acceptance within 2s; holding the current attack and waiting for the authoritative result.", "combat", "warn");
        attackSyncLog("action-accept-timeout-refresh", {
          strategy: "wait-for-authoritative-result",
          currentKey,
          refreshRadius: 1
        });
      } else {
        state.capture = undefined;
        if (state.pendingCombatReveal?.targetKey === currentKey) state.pendingCombatReveal = undefined;
        state.actionInFlight = false;
        state.actionAcceptedAck = false;
        state.combatStartAck = false;
        state.actionAcceptTimeoutHandledAt = 0;
        state.actionStartedAt = 0;
        state.actionTargetKey = "";
        state.actionCurrent = undefined;
        if (currentKey) deps.clearOptimisticTileState(currentKey, true);
        // The tile's optimistic state was just reverted — it will never
        // reach owned/FRONTIER via this action, so any settle+build queued
        // against it (handleBuildAction's capture-target path) would
        // otherwise sit forever, permanently blocking a re-queue with
        // "Build already queued".
        if (currentKey) { state.autoSettleTargets.delete(currentKey); state.autoBuildTargets.delete(currentKey); }
        deps.showCaptureAlert("Attack sync delayed", "No server acceptance arrived within 2 seconds. Refreshing nearby tiles to resync.", "warn");
        deps.requestViewRefresh(1, true);
        deps.pushFeed("No server acceptance within 2s; skipping queued action.", "combat", "warn");
        if (currentKey) deps.dropQueuedTargetKeyIfAbsent(currentKey);
        attackSyncLog("action-accept-timeout-refresh", {
          strategy: "resync-without-retry",
          currentKey,
          refreshRadius: 1
        });
      }
      deps.renderHud();
      return;
    }
    if (!state.capture) return;
    if (Date.now() > state.capture.resolvesAt + 5_000) {
      const timedOutCurrentKey = state.actionCurrent ? deps.keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
      const keepOptimisticExpand = deps.shouldPreserveOptimisticExpandByKey(timedOutCurrentKey);
      attackSyncLog("combat-result-timeout", {
        current: state.actionCurrent,
        currentKey: timedOutCurrentKey,
        elapsedMs: Date.now() - started,
        captureTarget: state.capture.target,
        captureResolvesAt: state.capture.resolvesAt,
        keepOptimisticExpand,
        queueLength: state.actionQueue.length
      });
      state.capture = undefined;
      if (state.pendingCombatReveal?.targetKey === timedOutCurrentKey) state.pendingCombatReveal = undefined;
      state.actionInFlight = false;
      state.actionAcceptedAck = false;
      state.combatStartAck = false;
      state.actionAcceptTimeoutHandledAt = 0;
      state.actionStartedAt = 0;
      state.actionTargetKey = "";
      state.actionCurrent = undefined;
      if (timedOutCurrentKey) deps.dropQueuedTargetKeyIfAbsent(timedOutCurrentKey);
      if (timedOutCurrentKey && !keepOptimisticExpand) deps.clearOptimisticTileState(timedOutCurrentKey, true);
      deps.pushFeed(
        keepOptimisticExpand
          ? "Frontier result delayed; keeping optimistic tile while continuing queue."
          : "Combat result delayed locally; continuing queue.",
        "combat",
        "warn"
      );
      if (keepOptimisticExpand) {
        state.frontierSyncWaitUntilByTarget.set(timedOutCurrentKey, Date.now() + 12_000);
        state.frontierLateAckUntilByTarget.set(timedOutCurrentKey, Date.now() + 12_000);
        state.actionQueue = state.actionQueue.filter((entry) => deps.keyFor(entry.x, entry.y) !== timedOutCurrentKey);
        state.queuedTargetKeys.delete(timedOutCurrentKey);
        deps.requestViewRefresh(1, true);
      } else {
        // As above: optimistic tile state was cleared and won't be
        // reconciled by a later frontier sync, so drop any queued
        // settle+build for this tile rather than leaving it orphaned.
        if (timedOutCurrentKey) { state.autoSettleTargets.delete(timedOutCurrentKey); state.autoBuildTargets.delete(timedOutCurrentKey); }
        deps.showCaptureAlert("Combat result delayed", "Refreshing nearby tiles because the server result did not arrive in time.", "warn");
        deps.requestViewRefresh(1, true);
      }
      deps.reconcileActionQueue();
      deps.processActionQueue();
      deps.renderHud();
    }
  }, 300);

  setInterval(() => {
    updateMusicForGameState(computeWarMusicSignals(state));
  }, 500);

  setInterval(() => {
    if (state.connection !== "initialized") return;
    if (state.actionInFlight || state.capture || state.actionQueue.length > 0) return;
    if (state.firstChunkAt === 0 && Date.now() - state.lastSubAt > 20_000) deps.requestViewRefresh(2, true);
  }, deps.isMobile() ? 8_000 : 5_000);

  // Waypoint heartbeat: re-poke processActionQueue while a waypoint is
  // active and the queue is idle. The message-driven kicks
  // (FRONTIER_RESULT, TILE_DELTA, etc.) sometimes fire BEFORE the
  // ownership-flipping tile_delta arrives, so the late delta would
  // otherwise leave the chain stalled with an idle queue.
  setInterval(() => {
    if (state.connection !== "initialized") return;
    if (state.waypoint.length === 0) return;
    if (state.actionInFlight || state.actionQueue.length > 0) return;
    deps.processActionQueue();
  }, 500);

  setInterval(() => {
    const loadingActive = state.connection !== "initialized" || state.firstChunkAt === 0;
    if (!loadingActive) return;
    deps.renderHud();
    if (state.connection === "initialized" && state.firstChunkAt === 0 && Date.now() - state.lastSubAt > 4_000) {
      const elapsedMs = Date.now() - (state.mapLoadStartedAt || Date.now());
      if (elapsedMs >= 8_000) {
        recordClientDebugEvent("warn", "bootstrap-sync", "map-sync-stalled", {
          elapsedMs,
          lastSubAt: state.lastSubAt,
          lastSubAgeMs: Date.now() - state.lastSubAt,
          chunkFullCount: state.chunkFullCount,
          bridgeDebugMode: state.bridgeDebugMode,
          bridgeDebugBootstrap: state.bridgeDebugBootstrap,
          bridgeDebugInitialTileCount: state.bridgeDebugInitialTileCount,
          bridgeDebugRuntimeFingerprint: state.bridgeDebugRuntimeFingerprint,
          authSessionReady: state.authSessionReady,
          hasOwnedTileInCache: state.hasOwnedTileInCache
        });
      }
      deps.requestViewRefresh(1, true);
    }
  }, 300);

  // Refresh "loading for Xs" timers on tile-detail loader rows once per second
  // without forcing a full menu re-render. Each loader row carries the start
  // ms in data-loading-timer-since; we just rewrite the visible text.
  setInterval(() => {
    if (typeof document === "undefined") return;
    const elements = document.querySelectorAll<HTMLElement>("[data-loading-timer-since]");
    if (elements.length === 0) return;
    const now = Date.now();
    elements.forEach((element) => {
      const since = Number(element.dataset.loadingTimerSince);
      if (!Number.isFinite(since) || since <= 0) return;
      const elapsedSeconds = Math.max(0, Math.round((now - since) / 1000));
      const text =
        elapsedSeconds < 60
          ? `${elapsedSeconds}s`
          : `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`;
      if (element.textContent !== text) element.textContent = text;
    });
  }, 1000);
};
