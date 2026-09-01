import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene
} from "three";
import { WORLD_HEIGHT, WORLD_WIDTH, landBiomeAt, MUSTER_ATTACK_COST, type ResourceType, type SlotResource } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { DockPair, Tile, TileVisibilityState } from "../client-types.js";
import { isForestTile, isHillsTile, MIN_ZOOM } from "../client-constants.js";
import { resolveTileBudget } from "../client-map-3d-tile-budget/client-map-3d-tile-budget.js"; import { markRendererFirstRenderStarted, markRendererFirstRenderCompleted } from "../client-renderer-crash-breadcrumb/client-renderer-crash-breadcrumb.js";
import { padTerrainWindow, requiredTerrainWindow, terrainWindowCovers, type TerrainWindow } from "../client-map-3d-terrain-window/client-map-3d-terrain-window.js";
import { createPlacementRangeOverlay } from "../client-map-3d-placement-overlay/client-map-3d-placement-overlay.js";
import { createSelectionRangeOverlays } from "../client-map-3d-selection-range-overlays/client-map-3d-selection-range-overlays.js";

import { applyPerspectiveCamera, createPerspectiveCamera } from "../client-map-3d-perspective-camera/client-map-3d-perspective-camera.js";
import { createAtmosphere } from "../client-map-3d-atmosphere.js";
import { createPointerPick, toroidDelta } from "../client-map-3d-pointer-pick.js";
import { createHeightfield, type HeightfieldTerrainKind } from "../client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createMountainMassifs } from "../client-map-3d-mountain-massif.js";
import { createHillTerrain } from "../client-map-3d-hills.js";
import { createWaterSurface, WATER_SURFACE_Y } from "../client-map-3d-water-surface.js";
import { createRiverOverlay } from "../client-map-3d-rivers/client-map-3d-rivers.js";
import { createVillageEffects } from "../client-map-3d-village-fx.js";
import { createFloatingTextLayer } from "../client-map-3d-floating-text/client-map-3d-floating-text.js";
import { createTownSupportCoinLayer, type TownSupportCoinEntry } from "../client-map-3d-town-support-coins.js";
import { createForest } from "../client-map-3d-forest.js";
import { createOwnershipOverlay, FRONTIER_OPACITY } from "../client-map-3d-ownership-overlay.js";
import { createFrontierDecayPulseTracker } from "../client-map-3d-frontier-decay-pulse.js";
import {
  createBendingMarkerGeometry,
  writeBendingMarkerCorners
} from "../client-map-3d-bending-marker-geometry/client-map-3d-bending-marker-geometry.js";
import { debugTileLog, debugTileLoggingEnabled } from "../client-debug/client-debug.js";
import { createTownOverlay, type TownTier } from "../client-map-3d-town-overlay.js";
import { createResourceBadgeOverlay, type ResourceBadgeOverlay } from "../client-map-3d-unfed-badge-overlay/client-map-3d-unfed-badge-overlay.js";
import { createObservatoryCooldownBadgeOverlay } from "../client-map-3d-observatory-cooldown-badge-overlay/client-map-3d-observatory-cooldown-badge-overlay.js";
import { createUpgradeReadyBadgeOverlay } from "../client-map-3d-upgrade-ready-badge-overlay/client-map-3d-upgrade-ready-badge-overlay.js";
import { createMusterOverlay } from "../client-map-3d-muster-overlay.js";
import { createBattleOverlayFx } from "../client-map-3d-battle-overlay-fx.js";
import { syncCaptureOverlays, syncBattleOverlayFx } from "../client-map-3d-capture-overlays.js";
import { createSupplyLineOverlay } from "../client-map-3d-supply-line-overlay.js";
import { createAetherBridgePylonOverlay } from "../client-map-3d-aether-bridge-pylon-overlay.js";
import { createAetherPurgeFxLayer } from "../client-map-3d-aether-purge-fx/client-map-3d-aether-purge-fx.js";
import { createSurveySweepFxLayer } from "../client-map-3d-survey-sweep-fx/client-map-3d-survey-sweep-fx.js";
import { createSurveySweepPingOverlay } from "../client-map-3d-survey-sweep-ping-overlay.js"; import { filterAndLogSurveySweepPings } from "../survey-sweep-debug-log/survey-sweep-debug-log.js"; import { createOnboardingChecklistHighlightOverlay } from "../client-map-3d-onboarding-checklist-highlight.js";
import { createSiphonFxLayer } from "../client-map-3d-siphon-fx/client-map-3d-siphon-fx.js";
import { createRetortRecastFxLayer } from "../client-map-3d-retort-recast-fx/client-map-3d-retort-recast-fx.js";
import { createRevealEmpireFxLayer } from "../client-map-3d-reveal-empire-fx/client-map-3d-reveal-empire-fx.js";
import { createMonumentPulseFxLayer } from "../client-map-3d-monument-pulse-fx/client-map-3d-monument-pulse-fx.js";
import { createUnsettleFxLayer } from "../client-map-3d-unsettle-fx/client-map-3d-unsettle-fx.js"; import { createCameraShakeFx } from "../client-map-3d-camera-shake-fx/client-map-3d-camera-shake-fx.js";
import { createAegisLockFxLayer } from "../client-map-3d-aegis-lock-fx/client-map-3d-aegis-lock-fx.js";
import { createRevealEmpireStatsFxLayer } from "../client-map-3d-reveal-empire-stats-fx/client-map-3d-reveal-empire-stats-fx.js";
import { createBombardFxLayer } from "../client-map-3d-bombard-fx/client-map-3d-bombard-fx.js";
import { createFxCastOverlaySyncs } from "./client-map-3d-fx-cast-overlays.js";
import { shouldShowTownSmoke, shouldShowTownUnfedWarning, shouldShowTownUpgradeReadyBadge } from "../client-town-growth/client-town-growth.js";
import { createDockOverlay } from "../client-map-3d-dock-overlay.js"; import { createDockRouteOverlay } from "../client-map-3d-dock-route-overlay.js"; import { syncDockRouteOverlay } from "../client-map-3d-dock-route-sync.js";
import { createBarbarianOverlay } from "../client-map-3d-barbarian-overlay.js";
import { createShardOverlay } from "../client-map-3d-shard-overlay.js"; import { createWatchtowerOverlay } from "../client-map-3d-watchtower-overlay.js";
import { createFortOverlay } from "../client-map-3d-fort-overlay.js";
import { createRelayBeaconOverlay } from "../client-map-3d-relay-beacon-overlay.js"; import { createTradeNexusOverlay } from "../client-map-3d-trade-nexus-overlay.js";
import { createResourceOverlay, type ResourceKind } from "../client-map-3d-resource-overlay.js"; import { createBarleyFieldOverlay, BARLEY_DETAIL_MIN_ZOOM } from "../client-map-3d-barley-field.js"; import { createTitaniumDepositOverlay } from "../client-map-3d-titanium-deposit.js"; import { createUmbriteDepositOverlay } from "../client-map-3d-umbrite-deposit.js"; import { createUmbriteExtractionRigOverlay } from "../client-map-3d-umbrite-extraction-rig.js"; import { createUmbriteWeaponsFactoryOverlay } from "../client-map-3d-umbrite-weapons-factory.js";
import { createAttackOverlay } from "../client-map-3d-attack-overlay.js";
import { createSettleOverlay } from "../client-map-3d-settle-overlay/client-map-3d-settle-overlay.js";
import { createStructureOverlay, STRUCTURE_KINDS_HANDLED_BY_3D, type StructureKind } from "../client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import { createAetherTowerOverlay } from "../client-map-3d-aether-tower-overlay.js";
import {
  createContactShadowOverlay,
  DEFAULT_CONTACT_SHADOW_RADIUS_TILES,
  LARGE_CONTACT_SHADOW_RADIUS_TILES,
  SMALL_CONTACT_SHADOW_RADIUS_TILES
} from "../client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import { resourceFor3DPopulation } from "../client-map-3d-population/client-map-3d-population.js";
import { createRoadElevationAt } from "../client-map-3d-road-overlay/client-map-3d-road-elevation.js";
import { createRoadOverlay } from "../client-map-3d-road-overlay/client-map-3d-road-overlay.js";
import { createReachOverlay3D } from "../client-map-3d-aether-survey-line/client-map-3d-aether-survey-line.js";
import { resolveMyReach } from "../client-reach-authoritative/client-reach-authoritative.js";
import { filterReachToLand, isDormantFrontierTile, samplePerimeterPylons, traceReachBoundaryEdgeLoops } from "../client-reach-overlay/client-reach-overlay.js";
import { ARRIVE_STAGGER_MS, createTransitionTracker, diffTransitions } from "../client-reach-overlay/client-reach-overlay-transitions.js";
import { computeOtherOwnersReachPylons, type OwnedPylonPoint, type OwnedPylonSegment } from "../client-reach-overlay-3d-multi/client-reach-overlay-3d-multi.js";
import { createBorderDustFxLayer } from "../client-map-3d-border-dust-fx/client-map-3d-border-dust-fx.js";
import { borderContactSeamsToDustSeams, computeBorderContactRenderState, resolveBorderContactVisual, pointKey, splitSegmentByContact, EMPTY_BORDER_CONTACT_STATE, BORDER_CONTACT_BEAM_COLOR, BORDER_CONTACT_OPACITY_MULT, type BorderContactRenderState } from "../client-map-3d-border-contact-render/client-map-3d-border-contact-render.js";
import { createDefensibilityOverlay } from "../client-map-3d-defensibility-overlay.js";
import { exposedSidesForTile, isOwnedSettledLandTile, weakDefensibilitySeverity } from "../client-defensibility-tile.js";
import { buildRoadNetwork } from "../client-road-network/client-road-network.js";
import { revealWholeMapInTrue3DMode, isTrue3DRendererActive } from "../client-renderer-mode.js";
import { effectiveFogDisabled } from "../client-map-reveal/client-map-reveal.js";
import { isReachOverlayCornerVisible } from "../client-reach-overlay-corner-visibility/client-reach-overlay-corner-visibility.js";
import { buildCurrentPylonMap, buildCurrentSegmentMap, cullAndAllocatePylons, cullAndAllocateSegments } from "../client-reach-overlay-window-cull/client-reach-overlay-window-cull.js";
import { MAX_PYLONS_HARD_CAP, MAX_SEGMENTS_HARD_CAP } from "../client-map-3d-aether-survey-line/client-map-3d-aether-survey-line.js";
import { recordTerrainRebuildSample } from "../client-performance-metrics/client-performance-metrics.js";
import { fortificationOpeningForTile, fortificationOverlayKindForTile, type FortificationOpening, type FortificationOverlayKind } from "../client-fortification-overlays/client-fortification-overlays.js";
import { normalizeColorForThree } from "../client-three-color/client-three-color.js";
import { createThreeRenderTarget } from "../client-map-3d-render-target/client-map-3d-render-target.js";
import { createCrystalTargetingOverlay } from "../client-map-3d-crystal-targeting-overlay/client-map-3d-crystal-targeting-overlay.js"; import { createNaturalWonderOverlays } from "../client-map-3d-natural-wonders/client-map-3d-natural-wonder-overlays.js";
import { lightenHex, parseTileKey } from "../client-map-3d-utils/client-map-3d-utils.js";
import { createWaypointFlag } from "../client-map-3d-waypoint-flag/client-map-3d-waypoint-flag.js";
import { WAYPOINT_QUEUE_CLIENT_CAP } from "../client-waypoint-planner/client-waypoint-persistence.js"; import { createShardRainBadgeOverlay, populateShardRainBadgeInstances } from "../client-map-3d-shard-rain-badge-overlay/client-map-3d-shard-rain-badge-overlay.js";

type TileTimedProgress = {
  readonly startAt: number;
  readonly resolvesAt: number;
};

type ClientThreeTerrainRendererDeps = {
  state: ClientState;
  canvas: HTMLCanvasElement;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  effectiveOverlayColor: (ownerId: string) => string;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
  settlementProgressForTile: (x: number, y: number) => TileTimedProgress | undefined;
  isPlacementValidForTile: (tile: Tile | undefined) => boolean; resolveDockSeaRoute: (pair: DockPair) => Array<{ x: number; y: number }>; isDockRouteVisibleForPlayer: (pair: DockPair) => boolean;
  // Fires when the GPU drops the WebGL context; the host tears this instance down and falls back to 2D (client-map-3d-render-target.ts).
  onContextLost?: (reason: string) => void;
};

// Device-sized rather than fixed at the desktop worst case; see client-map-3d-tile-budget.ts.
const MAX_VISIBLE_TILES = resolveTileBudget(MIN_ZOOM);
const MAX_BRIDGE_PYLONS = 16;
const TILE_CENTER_OFFSET = 0.5;
const OWNERSHIP_RISE_ABOVE_HEIGHTFIELD = 0.022;
const MARKER_RISE_ABOVE_HEIGHTFIELD = 0.012;
const OVERLAY_RISE_ABOVE_HEIGHTFIELD = 0.012;

export const createClientThreeTerrainRenderer = (deps: ClientThreeTerrainRendererDeps) => {
  const { glCanvas, renderer, contextGuard } = createThreeRenderTarget(deps.canvas, deps.onContextLost);

  const scene = new Scene();
  const atmosphere = createAtmosphere(scene);
  const camera = createPerspectiveCamera(deps.canvas);
  const heightfield = createHeightfield();
  scene.add(heightfield.mesh);
  scene.add(heightfield.skirtMesh);
  scene.add(heightfield.gridlines);
  heightfield.setGridlinesVisible(true);
  const mountainMassifs = createMountainMassifs(scene, MAX_VISIBLE_TILES);
  const hillTerrain = createHillTerrain(scene, MAX_VISIBLE_TILES, heightfield.material);
  const waterSurface = createWaterSurface(scene, MAX_VISIBLE_TILES);
  const riverOverlay = createRiverOverlay(scene);
  const villageEffects = createVillageEffects(scene);
  const floatingText = createFloatingTextLayer(scene);
  const townSupportCoins = createTownSupportCoinLayer(scene);
  // Per-tile last-seen captureShockUntil. Used to detect newly-shocked towns (capture event) so the floating "-pop" indicator fires once per capture.
  const lastSeenCaptureShockByTile = new Map<string, number>();
  // Per-tile last-seen ownerId, used only to auto-detect and log ownership changes as they render (debug-tile logging) without a manually pinned coordinate.
  const lastRenderedOwnerIdByTile = new Map<string, string | undefined>();
  const forest = createForest(scene, MAX_VISIBLE_TILES);
  const ownershipOverlay = createOwnershipOverlay(scene, MAX_VISIBLE_TILES);
  const frontierDecayPulse = createFrontierDecayPulseTracker();
  // Fogged tiles get a black darkening quad (always full opacity 0.65, regardless of frontier/settled -- reuses both mesh buckets identically)
  // plus a separate, dimmer ownership tint of the last-witnessed owner. Kept as distinct overlay instances from `ownershipOverlay` so the live
  // SETTLED_OPACITY (0.85) constant is never touched by fog rendering.
  const fogDarkenOverlay = createOwnershipOverlay(scene, MAX_VISIBLE_TILES, { settled: 0.65, frontier: 0.65 });
  const fogOwnershipOverlay = createOwnershipOverlay(scene, MAX_VISIBLE_TILES, { settled: 0.4, frontier: 0.12 });
  const townOverlay = createTownOverlay(scene, MAX_VISIBLE_TILES);
  const roadOverlay = createRoadOverlay(scene);
  const reachOverlay3D = createReachOverlay3D(scene, MAX_VISIBLE_TILES);
  // Cache of the client-local reach approximation, recomputed only when tiles actually changed (same revision-gated pattern as the 2D path's
  // state.myReach in client-runtime-loop.ts). Kept as a local rather than on ClientState since the 2D path guards its own state.myReach update
  // with !isTrue3DRendererActive() and only one renderer is ever active.
  let reach3DCache: Set<string> | undefined;
  let reach3DCacheRevision = ""; let dockRouteSyncKey = ""; // dock-route overlay revision key -- resynced on selection/dockPairs/sceneOrigin change (sceneOrigin moves on a terrain rebuild), not every frame (see renderLoop)
  // Sparse pylon placement points + connecting chords, sampled from the traced reach-boundary perimeter (see client-reach-overlay.ts's
  // traceReachBoundaryEdgeLoops/samplePerimeterPylons). Recomputed only when
  // reach3DCache itself is recomputed -- the perimeter walk is more work
  // than a per-tile boundary check, so it must not run every frame.
  let reach3DPylons: { x: number; y: number }[] = [];
  let reach3DSegments: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
  let otherOwnersPylons: OwnedPylonPoint[] = []; let otherOwnersSegments: OwnedPylonSegment[] = []; // every OTHER visible owner's border -- client-reach-overlay-3d-multi.ts
  let borderContactState: BorderContactRenderState = EMPTY_BORDER_CONTACT_STATE; // chords on both my border loop and a rival's -- client-map-3d-border-contact-render.ts
  // Border-transition animation state (client-reach-overlay-transitions.ts),
  // persisted across frames -- a pylon/segment that drops out of
  // reach3DPylons/reach3DSegments keeps rendering here (sinking) until its
  // retirement finishes; a new one rises in. Corner-position keyed for
  // pylons, "fromKey|toKey" for segments. Updated every frame in the
  // unconditional renderReachOverlay3DPylons(), independent of
  // rebuildVisibleTerrain()'s camera-move/reach-change throttle, or the
  // animation would freeze whenever the camera stops moving mid-transition.
  const reach3DPylonTracker = createTransitionTracker<{ x: number; y: number; ownerId: string }>();
  const reach3DSegmentTracker = createTransitionTracker<{ fx: number; fy: number; tx: number; ty: number; ownerId: string }>(); let reach3DPylonsAnimateArrivals = false; // false only on the first diffTransitions() call (initial load)
  // §21.1: one badge overlay per resource icon, so a dormant Fort missing TITANIUM gets ⛏ while an unfed town still gets 🍞.
  const RESOURCE_BADGE_ICON: Record<SlotResource, string> = { FOOD: "🍞", TITANIUM: "⛏", CRYSTAL: "💎", UMBRITE: "🟣" };
  const resourceBadgeOverlays: Record<SlotResource, ResourceBadgeOverlay> = {
    FOOD: createResourceBadgeOverlay(scene, MAX_VISIBLE_TILES, RESOURCE_BADGE_ICON.FOOD), TITANIUM: createResourceBadgeOverlay(scene, MAX_VISIBLE_TILES, RESOURCE_BADGE_ICON.TITANIUM),
    CRYSTAL: createResourceBadgeOverlay(scene, MAX_VISIBLE_TILES, RESOURCE_BADGE_ICON.CRYSTAL), UMBRITE: createResourceBadgeOverlay(scene, MAX_VISIBLE_TILES, RESOURCE_BADGE_ICON.UMBRITE)
  };
  const shardRainBadgeOverlay = createShardRainBadgeOverlay(scene); const allBadgeOverlays = [...Object.values(resourceBadgeOverlays), shardRainBadgeOverlay]; // shares the clear/commit/tick/dispose loops below — see client-map-3d-shard-rain-badge-overlay.ts
  const observatoryCooldownBadgeOverlay = createObservatoryCooldownBadgeOverlay(scene, MAX_VISIBLE_TILES);
  const upgradeReadyBadgeOverlay = createUpgradeReadyBadgeOverlay(scene, MAX_VISIBLE_TILES);
  const musterOverlay = createMusterOverlay(scene);
  const battleOverlayFx = createBattleOverlayFx(scene);
  const supplyLineOverlay = createSupplyLineOverlay(scene);
  const aetherBridgePylonOverlay = createAetherBridgePylonOverlay(scene, MAX_BRIDGE_PYLONS);
  const aetherLanceFx = createAetherPurgeFxLayer(scene);
  const surveySweepFx = createSurveySweepFxLayer(scene);
  const surveySweepPingOverlay = createSurveySweepPingOverlay(scene); const onboardingChecklistHighlightOverlay = createOnboardingChecklistHighlightOverlay(scene);
  const siphonFx = createSiphonFxLayer(scene);
  const retortRecastFx = createRetortRecastFxLayer(scene);
  const revealEmpireFx = createRevealEmpireFxLayer(scene);
  const revealEmpireStatsFx = createRevealEmpireStatsFxLayer(scene);
  const bombardFx = createBombardFxLayer(scene);
  const worldEngineStrikeFx = createMonumentPulseFxLayer(scene, "#ff5533", "world-engine-strike-fx");
  const worldEngineShakeFx = createCameraShakeFx(camera);
  const imperialExchangeLevyFx = createMonumentPulseFxLayer(scene, "#ffd166", "imperial-exchange-levy-fx");
  const astralDockLaunchFx = createRevealEmpireFxLayer(scene);
  const aegisLockFx = createAegisLockFxLayer(scene); const unsettleFx = createUnsettleFxLayer(scene); const borderDustFx = createBorderDustFxLayer(scene);
  const dockOverlay = createDockOverlay(scene, MAX_VISIBLE_TILES); const dockRouteOverlay = createDockRouteOverlay(scene);
  const barbarianOverlay = createBarbarianOverlay(scene, MAX_VISIBLE_TILES);
  const shardOverlay = createShardOverlay(scene, MAX_VISIBLE_TILES); const watchtowerOverlay = createWatchtowerOverlay(scene, MAX_VISIBLE_TILES); const naturalWonderOverlays = createNaturalWonderOverlays(scene, heightfield.cornerYAt);
  const fortOverlay = createFortOverlay(scene, MAX_VISIBLE_TILES);
  const relayBeaconOverlay = createRelayBeaconOverlay(scene, MAX_VISIBLE_TILES); const tradeNexusOverlay = createTradeNexusOverlay(scene, MAX_VISIBLE_TILES);
  const resourceOverlay = createResourceOverlay(scene, MAX_VISIBLE_TILES); const barleyFieldOverlay = createBarleyFieldOverlay(scene, MAX_VISIBLE_TILES); const titaniumDepositOverlay = createTitaniumDepositOverlay(scene, MAX_VISIBLE_TILES); const umbriteDepositOverlay = createUmbriteDepositOverlay(scene, MAX_VISIBLE_TILES); const umbriteExtractionRigOverlay = createUmbriteExtractionRigOverlay(scene, MAX_VISIBLE_TILES); const umbriteWeaponsFactoryOverlay = createUmbriteWeaponsFactoryOverlay(scene, MAX_VISIBLE_TILES);
  const attackOverlay = createAttackOverlay(scene, MAX_VISIBLE_TILES);
  const settleOverlay = createSettleOverlay(scene, MAX_VISIBLE_TILES);
  // Shared across every ground occupant below (structures, towns,
  // watchtowers, resources, deposits) rather than one per overlay module —
  // see the comment in client-map-3d-contact-shadow.ts.
  const contactShadowOverlay = createContactShadowOverlay(scene, MAX_VISIBLE_TILES);
  const structureOverlay = createStructureOverlay(scene, MAX_VISIBLE_TILES, contactShadowOverlay);
  const aetherTowerOverlay = createAetherTowerOverlay(scene, MAX_VISIBLE_TILES);
  const defensibilityOverlay = createDefensibilityOverlay(scene, MAX_VISIBLE_TILES);

  // Visual-only demo: ?towndemo=1 fakes a row of 5 tiers near (camX, camY)
  // so you can compare Settlement → Town → City → Great City → Metropolis
  // side-by-side without playing through them.
  const townDemoEnabled =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("towndemo") === "1";
  const TOWN_DEMO_TIERS: ReadonlyArray<TownTier> = [
    "SETTLEMENT",
    "TOWN",
    "CITY",
    "GREAT_CITY",
    "METROPOLIS"
  ];
  const isTownDemoTile = (
    wx: number,
    wy: number,
    originX: number,
    originY: number
  ): TownTier | undefined => {
    if (!townDemoEnabled) return undefined;
    if (wy !== originY) return undefined;
    const dx = wx - originX;
    if (dx < 0 || dx >= TOWN_DEMO_TIERS.length) return undefined;
    return TOWN_DEMO_TIERS[dx];
  };

  // Visual-only demo: ?fortdemo=1 fakes a row of 4 fort kinds two tiles
  // south of the camera so you can compare them side-by-side. Demo
  // forts are owned by "demo" so the cardinal-opening rule still
  // resolves (FORT next to FORT opens its first cardinal); place each
  // kind 2 tiles apart so they don't merge walls.
  const fortDemoEnabled =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("fortdemo") === "1";
  const FORT_DEMO_KINDS: ReadonlyArray<FortificationOverlayKind> = [
    "FORT",
    "WOODEN_FORT",
    "RELAY_BEACON",
    "SIEGE_OUTPOST"
  ];
  const FORT_DEMO_SPACING = 2;
  // Row 1 at camY+2: 4 kinds spaced 2 tiles apart (no wall sharing).
  // Row 2 at camY+5: a pair of FORTs touching at (camX, camY+5) and
  //                  (camX+1, camY+5) so the wall-sharing rule kicks in
  //                  — the left fort opens E, the right opens W.
  const fortDemoSpec = (
    wx: number,
    wy: number,
    originX: number,
    originY: number
  ): { kind: FortificationOverlayKind; opening: FortificationOpening } | undefined => {
    if (!fortDemoEnabled) return undefined;
    if (wy === originY + 2) {
      const dx = wx - originX;
      if (dx < 0) return undefined;
      if (dx % FORT_DEMO_SPACING !== 0) return undefined;
      const idx = dx / FORT_DEMO_SPACING;
      if (idx >= FORT_DEMO_KINDS.length) return undefined;
      const kind = FORT_DEMO_KINDS[idx];
      if (!kind) return undefined;
      return { kind, opening: "CLOSED" };
    }
    if (wy === originY + 5) {
      const dx = wx - originX;
      if (dx === 0) return { kind: "FORT", opening: "EAST" };
      if (dx === 1) return { kind: "FORT", opening: "WEST" };
    }
    return undefined;
  };

  // Visual-only demo: ?structuredemo=1 fakes a row of structures two
  // tiles north of the camera so you can eyeball each mesh side-by-side
  // without building them in-game. The MINE appears twice — once with
  // an TITANIUM load and once with a GEMS load — so the resource-aware
  // mine variant is visible. The Worldbreaker/Imperial Exchange part
  // meshes are shown too. Spaced one tile apart.
  const structureDemoEnabled =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("structuredemo") === "1";
  type StructureDemoEntry = { kind: StructureKind | "UMBRITE_RIG" | "UMBRITE_WEAPONS_FACTORY"; resource?: "TITANIUM" | "GEMS" };
  const STRUCTURE_DEMO_ENTRIES: ReadonlyArray<StructureDemoEntry> = [
    { kind: "FARMSTEAD" },
    { kind: "WATERWORKS" },
    { kind: "UMBRITE_RIG" },
    { kind: "MINE", resource: "TITANIUM" },
    { kind: "MINE", resource: "GEMS" },
    { kind: "TITANIUM_WORKS" },
    { kind: "MINTWORKS" },
    { kind: "OBSERVATORY" },
    { kind: "GRANARY" },
    { kind: "SEED_GRANARY" },
    { kind: "CENSUS_HALL" },
    { kind: "TITANIUM_WEAPONS_FACTORY" },
    { kind: "UMBRITE_WEAPONS_FACTORY" },
    { kind: "WORLD_ENGINE_PART_1" }, { kind: "WORLD_ENGINE_PART_2" }, { kind: "WORLD_ENGINE_PART_3" },
    { kind: "IMPERIAL_EXCHANGE_PART_1" }, { kind: "IMPERIAL_EXCHANGE_PART_2" }, { kind: "IMPERIAL_EXCHANGE_PART_3" }, { kind: "POPULATION_BUREAU_PART_1" }, { kind: "POPULATION_BUREAU_PART_2" }, { kind: "POPULATION_BUREAU_PART_3" }
  ];
  const structureDemoEntryFor = (wx: number, wy: number, originX: number, originY: number): StructureDemoEntry | undefined => {
    if (!structureDemoEnabled) return undefined;
    if (wy !== originY - 2) return undefined;
    const dx = wx - originX;
    if (dx < 0 || dx >= STRUCTURE_DEMO_ENTRIES.length) return undefined;
    return STRUCTURE_DEMO_ENTRIES[dx];
  };

  // Selection: saturated yellow (matches the 2D #ffd166 selection ring
  // so the two modes feel consistent and selection clearly differs from
  // the cool-blue hover marker).
  const selectedMarker = new LineSegments(
    createBendingMarkerGeometry(),
    new LineBasicMaterial({ color: "#ffd166", transparent: true, opacity: 0.95, depthTest: false, depthWrite: false })
  );
  const hoverMarker = new LineSegments(
    createBendingMarkerGeometry(),
    new LineBasicMaterial({ color: "#d5ecff", transparent: true, opacity: 0.8, depthTest: false, depthWrite: false })
  );
  const townSupportMarkers = Array.from({ length: 8 }, () => {
    const material = new LineBasicMaterial({ color: "#f0f4ff", transparent: true, opacity: 0.56, depthTest: false, depthWrite: false });
    const marker = new LineSegments(createBendingMarkerGeometry(), material);
    marker.visible = false;
    return { marker, material };
  });
  const queuedActionMarkers = Array.from({ length: 64 }, () => {
    const material = new LineBasicMaterial({ color: "#a78bfa", transparent: true, opacity: 0.93, depthTest: false, depthWrite: false });
    const marker = new LineSegments(createBendingMarkerGeometry(), material);
    marker.visible = false;
    return { marker, material };
  });
  const queuedSettlementMarkers = Array.from({ length: 64 }, () => {
    const material = new LineBasicMaterial({ color: "#fbbf24", transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
    const marker = new LineSegments(createBendingMarkerGeometry(), material);
    marker.visible = false;
    return { marker, material };
  });
  const queuedBuildMarkers = Array.from({ length: 64 }, () => {
    const material = new LineBasicMaterial({ color: "#7dd3fc", transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
    const marker = new LineSegments(createBendingMarkerGeometry(), material);
    marker.visible = false;
    return { marker, material };
  });
  // The waypoint flag is a full steampunk tower — anchored to the
  // destination tile and tinted by the player's empire color. Geometry
  // lives in its own factory (client-map-3d-waypoint-flag.ts) so the
  // live renderer and the Storybook design review build the identical
  // model instead of two copies that can drift apart. One instance per
  // queued waypoint (capped at WAYPOINT_QUEUE_CLIENT_CAP) — index 0 is
  // the active waypoint, the rest render dimmed/grayscale and numbered.
  const waypointFlags = Array.from({ length: WAYPOINT_QUEUE_CLIENT_CAP }, () => createWaypointFlag());
  for (const flag of waypointFlags) flag.group.visible = false;
  // Frontier-claim fill: a single empire-color plate that ramps in
  // opacity over the claim duration, shown for every neutral EXPAND claim
  // (see syncFrontierClaimPlate) — the player sees the target tile filling
  // in with their color as it is claimed.
  const frontierClaimPlateGeometry = new PlaneGeometry(0.94, 0.94);
  frontierClaimPlateGeometry.rotateX(-Math.PI * 0.5);
  const frontierClaimPlateMaterial = new MeshBasicMaterial({ toneMapped: false,
    color: "#ffffff",
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false
  });
  const frontierClaimPlate = new Mesh(frontierClaimPlateGeometry, frontierClaimPlateMaterial);
  frontierClaimPlate.visible = false;
  frontierClaimPlate.frustumCulled = false;
  // Path tiles between the player's territory and the waypoint
  // destination. Dimmer empire color so they read as "from you" without
  // overpowering the destination flag.
  const waypointPathMarkers = Array.from({ length: 96 }, () => {
    const material = new LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.5, depthTest: false, depthWrite: false });
    const marker = new LineSegments(createBendingMarkerGeometry(), material);
    marker.visible = false;
    return { marker, material };
  });
  selectedMarker.visible = false;
  hoverMarker.visible = false;
  const crystalTargetingOverlay = createCrystalTargetingOverlay(scene, MAX_VISIBLE_TILES);
  const placementOverlay = createPlacementRangeOverlay(scene);
  const selectionRangeOverlays = createSelectionRangeOverlays(scene);
  selectedMarker.renderOrder = 30;
  hoverMarker.renderOrder = 31;
  for (const { marker } of townSupportMarkers) marker.renderOrder = 28;
  for (const { marker } of queuedActionMarkers) marker.renderOrder = 29;
  for (const { marker } of queuedSettlementMarkers) marker.renderOrder = 29;
  for (const { marker } of queuedBuildMarkers) marker.renderOrder = 29;
  for (const { marker } of waypointPathMarkers) marker.renderOrder = 29;
  frontierClaimPlate.renderOrder = 7;
  selectedMarker.frustumCulled = false;
  hoverMarker.frustumCulled = false;
  for (const { marker } of townSupportMarkers) marker.frustumCulled = false;
  for (const { marker } of queuedActionMarkers) marker.frustumCulled = false;
  for (const { marker } of queuedSettlementMarkers) marker.frustumCulled = false;
  for (const { marker } of queuedBuildMarkers) marker.frustumCulled = false;
  for (const { marker } of waypointPathMarkers) marker.frustumCulled = false;
  for (const flag of waypointFlags) {
    flag.group.frustumCulled = false;
    for (const child of flag.group.children) child.frustumCulled = false;
  }

  scene.add(
    selectedMarker,
    hoverMarker,
    ...townSupportMarkers.map(({ marker }) => marker),
    ...queuedActionMarkers.map(({ marker }) => marker),
    ...queuedSettlementMarkers.map(({ marker }) => marker),
    ...queuedBuildMarkers.map(({ marker }) => marker),
    ...waypointPathMarkers.map(({ marker }) => marker),
    ...waypointFlags.map((flag) => flag.group),
    frontierClaimPlate
  );

  // Camera transform tracking (resize/applyCamera): applied every frame, unthrottled — these
  // are cheap (a few float ops), and the camera needs to feel instantly responsive.
  const lastCameraApplied = { zoom: Number.NaN, width: 0, height: 0 };
  // rebuildVisibleTerrain() tracking: it tears down and repopulates ~25 overlay systems every
  // call, expensive independent of tile count (measured: up to 35ms for just 45 visible tiles —
  // see the terrainRebuild diagnostics this tracking feeds), and every buffer it touches is
  // re-uploaded to the GPU on the next render. `builtWindow` is the padded tile window currently
  // in those buffers; a rebuild fires only when the camera needs tiles outside it (see
  // client-map-3d-terrain-window.ts). Separate from lastCameraApplied so the rebuild throttle
  // never delays the camera transform.
  const lastRebuild = { builtWindow: undefined as TerrainWindow | undefined, at: 0, tilesRevision: -1, crystalTargetingActive: false };
  // Anchor every per-frame overlay's toroidDelta placement to the last COMMITTED
  // rebuild's window (not the live camera): once maybeRebuild stops requiring an
  // exact camX/camY match (padded hysteresis only), the camera can drift inside
  // the pad between rebuilds, and baking overlays off live camX/camY again would
  // reintroduce the "pylons separate from the ground" bug terrainWindowPanned
  // used to exist to prevent. Updated only where a rebuild actually commits, in
  // maybeRebuild below. The camera transform itself uses the live camX/camY
  // delta from this origin (applyCamera) so panning still reads live.
  const sceneOrigin = { camX: deps.state.camX, camY: deps.state.camY };
  let rafId: number | undefined;
  let lastOwnershipDebugSignature = "";
  const ownershipDebugWindow = (): (Window & { __be3dOwnershipDebug?: unknown }) | undefined =>
    typeof window !== "undefined" ? (window as Window & { __be3dOwnershipDebug?: unknown }) : undefined;
  const shouldDebugOwnership = (): boolean =>
    typeof window !== "undefined" && window.location.hostname === "localhost";

  const terrainForWorldTile = (wx: number, wy: number): Tile["terrain"] => {
    const tile = deps.state.tiles.get(deps.keyFor(wx, wy));
    return tile?.terrain ?? deps.terrainAt(wx, wy);
  };
  const emitOwnershipDebug = (payload: Record<string, unknown>): void => {
    if (!shouldDebugOwnership()) return;
    const signature = JSON.stringify(payload);
    if (signature === lastOwnershipDebugSignature) return;
    lastOwnershipDebugSignature = signature;
    const debugTarget = ownershipDebugWindow();
    if (debugTarget) debugTarget.__be3dOwnershipDebug = payload;
    console.info("[3d-ownership-debug]", payload);
  };
  const isSandTile = (wx: number, wy: number): boolean => {
    const tile = deps.state.tiles.get(deps.keyFor(wx, wy));
    const terrain = tile?.terrain ?? terrainForWorldTile(wx, wy);
    if (terrain !== "LAND") return false;
    const biome = tile?.landBiome ?? landBiomeAt(wx, wy);
    return biome === "SAND" || biome === "COASTAL_SAND";
  };
  const isTundraTile = (wx: number, wy: number): boolean => {
    const tile = deps.state.tiles.get(deps.keyFor(wx, wy));
    const terrain = tile?.terrain ?? terrainForWorldTile(wx, wy);
    if (terrain !== "LAND") return false;
    const biome = tile?.landBiome ?? landBiomeAt(wx, wy);
    return biome === "TUNDRA";
  };
  const heightfieldKindAt = (wx: number, wy: number): HeightfieldTerrainKind => {
    const terrain = terrainForWorldTile(wx, wy);
    if (terrain === "SEA" || terrain === "COASTAL_SEA") {
      if (terrain === "COASTAL_SEA") return "COASTAL_SEA";
      return "SEA";
    }
    if (terrain === "MOUNTAIN") return "MOUNTAIN";
    if (isSandTile(wx, wy)) return "SAND";
    if (isTundraTile(wx, wy)) return "TUNDRA";
    return "GRASS";
  };
  const syncHighlightMarker = (
    marker: LineSegments,
    tile: { x: number; y: number } | undefined,
    riseAboveSurface: number
  ): void => {
    if (!tile) {
      marker.visible = false;
      return;
    }
    const dx = toroidDelta(sceneOrigin.camX, tile.x, WORLD_WIDTH);
    const dy = toroidDelta(sceneOrigin.camY, tile.y, WORLD_HEIGHT);
    // Each corner of the marker is anchored to that corner's actual
    // rendered Y so the outline bends with the heightfield instead of
    // floating as a flat plane above bowing terrain.
    const wxNext = deps.wrapX(tile.x + 1);
    const wyNext = deps.wrapY(tile.y + 1);
    const cornerY00 = heightfield.cornerYAt(tile.x, tile.y);
    const cornerY10 = heightfield.cornerYAt(wxNext, tile.y);
    const cornerY01 = heightfield.cornerYAt(tile.x, wyNext);
    const cornerY11 = heightfield.cornerYAt(wxNext, wyNext);
    marker.position.set(0, 0, 0);
    writeBendingMarkerCorners(
      marker.geometry as BufferGeometry,
      dx + TILE_CENTER_OFFSET, 0, dy + TILE_CENTER_OFFSET,
      cornerY00, cornerY10, cornerY01, cornerY11,
      riseAboveSurface
    );
    marker.visible = true;
  };
  const isTownSupportHighlightableAt = (wx: number, wy: number): boolean => {
    const tile = deps.state.tiles.get(deps.keyFor(wx, wy));
    const terrain = tile?.terrain ?? deps.terrainAt(wx, wy);
    if (terrain !== "LAND") return false;
    if (tile?.dockId) return false;
    return true;
  };
  const syncTownSupportMarkers = (): void => {
    for (const { marker } of townSupportMarkers) marker.visible = false;
    const selectedCoord = deps.state.selected;
    if (!selectedCoord) return;
    const selected = deps.state.tiles.get(deps.keyFor(selectedCoord.x, selectedCoord.y));
    if (!selected?.town) return;
    // SETTLEMENT-tier towns do not project a support area: their gold is a flat
    // base income and adjacent settled tiles do nothing for them. Drawing the
    // 8-tile ring was misleading users into thinking it mattered.
    if (selected.town.populationTier === "SETTLEMENT") return;
    let markerIndex = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        if (markerIndex >= townSupportMarkers.length) return;
        const wx = deps.wrapX(selected.x + dx);
        const wy = deps.wrapY(selected.y + dy);
        if (!isTownSupportHighlightableAt(wx, wy)) continue;
        const tile = deps.state.tiles.get(deps.keyFor(wx, wy));
        const { marker, material } = townSupportMarkers[markerIndex]!;
        if (!tile?.ownerId) {
          material.color.set("#f4f7ff");
          material.opacity = 0.45;
        } else if (tile.ownerId !== deps.state.me) {
          material.color.set("#ff6262");
          material.opacity = 0.66;
        } else if (tile.ownershipState === "SETTLED") {
          material.color.set("#9bf274");
          material.opacity = 0.9;
        } else {
          material.color.set("#ffcd5c");
          material.opacity = 0.84;
        }
        const sx = toroidDelta(sceneOrigin.camX, wx, WORLD_WIDTH);
        const sy = toroidDelta(sceneOrigin.camY, wy, WORLD_HEIGHT);
        const wxNext = deps.wrapX(wx + 1);
        const wyNext = deps.wrapY(wy + 1);
        marker.position.set(0, 0, 0);
        writeBendingMarkerCorners(
          marker.geometry as BufferGeometry,
          sx + TILE_CENTER_OFFSET, 0, sy + TILE_CENTER_OFFSET,
          heightfield.cornerYAt(wx, wy),
          heightfield.cornerYAt(wxNext, wy),
          heightfield.cornerYAt(wx, wyNext),
          heightfield.cornerYAt(wxNext, wyNext),
          MARKER_RISE_ABOVE_HEIGHTFIELD
        );
        marker.visible = true;
        markerIndex += 1;
      }
    }
  };
  // Find the player's anchor town for the support-coin overlay: either the
  // selected tile itself (when the player selects one of their own non-
  // settlement towns) or, if the selected tile is a support tile adjacent
  // to such a town, that adjacent town. The second case keeps the coin
  // overlay visible after the player clicks a coin tile to settle it.
  const supportCoinAnchorTown = (selectedTile: Tile | undefined): Tile | undefined => {
    if (!selectedTile) return undefined;
    if (selectedTile.town && selectedTile.town.populationTier !== "SETTLEMENT" && selectedTile.ownerId === deps.state.me) {
      return selectedTile;
    }
    // Walk the 8 neighbors looking for one of the player's non-settlement
    // towns. If multiple match, pick the deterministic lowest (x,y) so the
    // overlay stays stable as the user drags the selection around.
    let best: Tile | undefined;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = deps.wrapX(selectedTile.x + dx);
        const ny = deps.wrapY(selectedTile.y + dy);
        const neighbor = deps.state.tiles.get(deps.keyFor(nx, ny));
        if (!neighbor?.town) continue;
        if (neighbor.town.populationTier === "SETTLEMENT") continue;
        if (neighbor.ownerId !== deps.state.me) continue;
        if (neighbor.ownershipState !== "SETTLED") continue;
        if (!best || neighbor.x < best.x || (neighbor.x === best.x && neighbor.y < best.y)) {
          best = neighbor;
        }
      }
    }
    return best;
  };
  const syncTownSupportCoins = (): void => {
    const selectedCoord = deps.state.selected;
    if (!selectedCoord) { townSupportCoins.clear(); return; }
    const selected = deps.state.tiles.get(deps.keyFor(selectedCoord.x, selectedCoord.y));
    const anchor = supportCoinAnchorTown(selected);
    if (!anchor) { townSupportCoins.clear(); return; }
    const entries: TownSupportCoinEntry[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const wx = deps.wrapX(anchor.x + dx);
        const wy = deps.wrapY(anchor.y + dy);
        if (!isTownSupportHighlightableAt(wx, wy)) continue;
        const tile = deps.state.tiles.get(deps.keyFor(wx, wy));
        // Gold coin = this tile currently contributes to the town's gold
        // (player-owned + SETTLED). Grey coin = it could, if you settled it.
        // Other-player tiles and frontier (unsettled) own tiles get a grey
        // coin too: they don't contribute, but the player can act on them.
        const contributes = tile?.ownerId === deps.state.me && tile.ownershipState === "SETTLED";
        const sx = toroidDelta(sceneOrigin.camX, wx, WORLD_WIDTH);
        const sy = toroidDelta(sceneOrigin.camY, wy, WORLD_HEIGHT);
        const wxNext = deps.wrapX(wx + 1);
        const wyNext = deps.wrapY(wy + 1);
        const surfaceY = Math.max(
          heightfield.cornerYAt(wx, wy),
          heightfield.cornerYAt(wxNext, wy),
          heightfield.cornerYAt(wx, wyNext),
          heightfield.cornerYAt(wxNext, wyNext)
        ) + OVERLAY_RISE_ABOVE_HEIGHTFIELD;
        entries.push({
          worldX: sx + TILE_CENTER_OFFSET,
          worldZ: sy + TILE_CENTER_OFFSET,
          surfaceY,
          kind: contributes ? "gold" : "grey"
        });
      }
    }
    townSupportCoins.sync(entries);
  };
  const hideLineMarkerPool = (pool: Array<{ marker: LineSegments }>): void => {
    for (const { marker } of pool) marker.visible = false;
  };
  const placeLineMarkers = (
    pool: Array<{ marker: LineSegments }>,
    tiles: Array<{ x: number; y: number }>,
    riseAboveSurface: number
  ): void => {
    hideLineMarkerPool(pool);
    let index = 0;
    for (const tile of tiles) {
      if (index >= pool.length) break;
      const { marker } = pool[index]!;
      const dx = toroidDelta(sceneOrigin.camX, tile.x, WORLD_WIDTH);
      const dy = toroidDelta(sceneOrigin.camY, tile.y, WORLD_HEIGHT);
      const wx = deps.wrapX(tile.x);
      const wy = deps.wrapY(tile.y);
      const wxNext = deps.wrapX(tile.x + 1);
      const wyNext = deps.wrapY(tile.y + 1);
      marker.position.set(0, 0, 0);
      writeBendingMarkerCorners(
        marker.geometry as BufferGeometry,
        dx + TILE_CENTER_OFFSET, 0, dy + TILE_CENTER_OFFSET,
        heightfield.cornerYAt(wx, wy),
        heightfield.cornerYAt(wxNext, wy),
        heightfield.cornerYAt(wx, wyNext),
        heightfield.cornerYAt(wxNext, wyNext),
        riseAboveSurface
      );
      marker.visible = true;
      index += 1;
    }
  };
  const syncQueueMarkers = (): void => {
    const actionTiles: Array<{ x: number; y: number }> = [];
    const inFlight = deps.state.actionInFlight ? parseTileKey(deps.state.actionTargetKey) : undefined;
    if (inFlight) actionTiles.push(inFlight);
    for (const action of deps.state.actionQueue) {
      if (!action) continue;
      if (!Number.isFinite(action.x) || !Number.isFinite(action.y)) continue;
      actionTiles.push({ x: action.x, y: action.y });
    }
    placeLineMarkers(queuedActionMarkers, actionTiles, MARKER_RISE_ABOVE_HEIGHTFIELD);
    const settlementTiles: Array<{ x: number; y: number }> = [];
    const buildTiles: Array<{ x: number; y: number }> = [];
    for (const entry of deps.state.developmentQueue) {
      if (!entry) continue;
      if (!Number.isFinite(entry.x) || !Number.isFinite(entry.y)) continue;
      if (entry.kind === "SETTLE") settlementTiles.push({ x: entry.x, y: entry.y });
      if (entry.kind === "BUILD") buildTiles.push({ x: entry.x, y: entry.y });
    }
    placeLineMarkers(queuedSettlementMarkers, settlementTiles, MARKER_RISE_ABOVE_HEIGHTFIELD);
    placeLineMarkers(queuedBuildMarkers, buildTiles, MARKER_RISE_ABOVE_HEIGHTFIELD);
  };
  const WAYPOINT_QUEUE_GRAY = "#8b93a0";
  const waypointFlagSurfaceY = (x: number, y: number): number => {
    const wxNext = deps.wrapX(x + 1);
    const wyNext = deps.wrapY(y + 1);
    return (
      heightfield.cornerYAt(x, y) +
      heightfield.cornerYAt(wxNext, y) +
      heightfield.cornerYAt(x, wyNext) +
      heightfield.cornerYAt(wxNext, wyNext)
    ) / 4;
  };
  const syncWaypointMarkers = (): void => {
    hideLineMarkerPool(waypointPathMarkers);
    for (const flag of waypointFlags) flag.group.visible = false;
    const waypoints = deps.state.waypoint;
    const activeWaypoint = waypoints[0];
    if (!activeWaypoint) return;
    const blocked = !activeWaypoint.plan.reachable;
    const HALT_COLOR = "#f59e0b";
    const empireColor = deps.state.playerColors.get(deps.state.me) ?? "#d5ecff";
    // Empire color drives the active flag's banner, hex glow ring,
    // pedestal energy ring, smoke wisps, and path-tile outlines. The
    // brass/copper mechanical bits stay metallic so the empire color
    // reads as the "energy" of the assembly rather than a paint job.
    // Queued (non-active) waypoints render desaturated gray instead —
    // their own plan/reachability isn't kept live (only the active one
    // gets replanned every tick), so they never show the halted color.
    const pathColor = blocked ? HALT_COLOR : empireColor;
    for (const { material } of waypointPathMarkers) {
      material.color.set(pathColor);
      material.opacity = 0.5;
    }
    const pathTiles: Array<{ x: number; y: number }> = [];
    for (const step of activeWaypoint.plan.steps) {
      if (step.target.x === activeWaypoint.target.x && step.target.y === activeWaypoint.target.y) continue;
      pathTiles.push(step.target);
    }
    placeLineMarkers(waypointPathMarkers, pathTiles, MARKER_RISE_ABOVE_HEIGHTFIELD);
    const capture = deps.state.capture;
    const nowMs = performance.now();
    const visibleCount = Math.min(waypoints.length, waypointFlags.length);
    for (let i = 0; i < visibleCount; i += 1) {
      const wp = waypoints[i];
      const flag = waypointFlags[i];
      if (!wp || !flag) continue;
      // Hide the flag standing on a tile that's actively capturing right
      // now — the frontier-claim sweep plate already shows that tile's
      // progress, so the banner would just be redundant clutter on top.
      if (capture && capture.target.x === wp.target.x && capture.target.y === wp.target.y) continue;
      const active = i === 0;
      const bannerColor = active ? (blocked ? HALT_COLOR : empireColor) : WAYPOINT_QUEUE_GRAY;
      const glowColor = active ? (blocked ? HALT_COLOR : lightenHex(empireColor, 0.45)) : WAYPOINT_QUEUE_GRAY;
      flag.setTint(bannerColor, glowColor);
      flag.setHalted(active && blocked);
      flag.setOpacityScale(active ? 1 : Math.max(0.3, 0.65 - (i - 1) * 0.12));
      flag.setQueueNumber(active ? undefined : i + 1);
      // Anchor the flag group at the destination tile's world-space
      // center, lifted to sit on the bowed heightfield surface.
      const dx = toroidDelta(sceneOrigin.camX, wp.target.x, WORLD_WIDTH);
      const dy = toroidDelta(sceneOrigin.camY, wp.target.y, WORLD_HEIGHT);
      const surfaceY = waypointFlagSurfaceY(wp.target.x, wp.target.y);
      flag.group.position.set(dx + TILE_CENTER_OFFSET, surfaceY + MARKER_RISE_ABOVE_HEIGHTFIELD, dy + TILE_CENTER_OFFSET);
      flag.tick(nowMs);
      flag.group.visible = true;
    }
  };
  const syncFrontierClaimPlate = (): void => {
    const capture = deps.state.capture;
    // Gate on EXPAND, NOT `silent` (which only suppresses the completion popup/feed for queued chains): a direct adjacent tap clears silent and used to get no animation at all.
    if (!capture || capture.actionType !== "EXPAND" || capture.fromMusterAdvance) {
      frontierClaimPlate.visible = false;
      return;
    }
    // Sweep the empire-color plate in from the left edge of the tile
    // to the right over the claim duration, at the same opacity the
    // ownership overlay uses for FRONTIER tiles. Imported so any future
    // change to that constant follows here automatically.
    const TILE_WIDTH = 0.94;
    const HALF_TILE = TILE_WIDTH * 0.5;
    const total = Math.max(1, capture.resolvesAt - capture.startAt);
    const elapsed = Date.now() - capture.startAt;
    const t = Math.max(0, Math.min(1, elapsed / total));
    const empireColor = deps.state.playerColors.get(deps.state.me) ?? "#7dd3fc";
    frontierClaimPlateMaterial.color.set(empireColor);
    frontierClaimPlateMaterial.opacity = FRONTIER_OPACITY;
    const dxw = toroidDelta(sceneOrigin.camX, capture.target.x, WORLD_WIDTH);
    const dyw = toroidDelta(sceneOrigin.camY, capture.target.y, WORLD_HEIGHT);
    const wxNext = deps.wrapX(capture.target.x + 1);
    const wyNext = deps.wrapY(capture.target.y + 1);
    const surfaceY =
      (heightfield.cornerYAt(capture.target.x, capture.target.y) +
        heightfield.cornerYAt(wxNext, capture.target.y) +
        heightfield.cornerYAt(capture.target.x, wyNext) +
        heightfield.cornerYAt(wxNext, wyNext)) /
      4;
    // Anchor the plate's LEFT edge at tile-center − HALF_TILE; scaling
    // X by t grows the plate rightward from there. Mesh position is
    // (left-edge + half-current-width) so the geometry's centered origin
    // sits at the right place for the current scale.
    const tileCenterX = dxw + TILE_CENTER_OFFSET;
    const tileCenterZ = dyw + TILE_CENTER_OFFSET;
    const leftEdgeX = tileCenterX - HALF_TILE;
    frontierClaimPlate.scale.set(Math.max(0.001, t), 1, 1);
    frontierClaimPlate.position.set(
      leftEdgeX + (TILE_WIDTH * t) * 0.5,
      surfaceY + MARKER_RISE_ABOVE_HEIGHTFIELD,
      tileCenterZ
    );
    frontierClaimPlate.visible = true;
  };
  const aetherBridgeTileSurfaceY = (wx: number, wy: number): number => {
    const wxNext = deps.wrapX(wx + 1);
    const wyNext = deps.wrapY(wy + 1);
    return (
      (heightfield.cornerYAt(wx, wy) +
        heightfield.cornerYAt(wxNext, wy) +
        heightfield.cornerYAt(wx, wyNext) +
        heightfield.cornerYAt(wxNext, wyNext)) /
      4
    );
  };
  const {
    syncAetherLanceFxQueue,
    syncSurveySweepFxQueue,
    syncSurveySweepPings,
    syncSiphonFxQueue,
    syncRetortRecastFxQueue,
    syncRevealEmpireFxQueue,
    syncRevealEmpireStatsFxQueue,
    syncBombardFxQueue,
    syncWorldEngineStrikeFxQueue,
    syncWorldEngineStrikeShakeQueue,
    syncImperialExchangeLevyFxQueue,
    syncUnsettleFxQueue,
    syncAstralDockLaunchFxQueue,
    syncAegisLockFxQueue
  } = createFxCastOverlaySyncs({
    state: deps.state,
    sceneOrigin,
    aetherBridgeTileSurfaceY,
    layers: {
      aetherLanceFx,
      surveySweepFx,
      surveySweepPingOverlay,
      siphonFx,
      retortRecastFx,
      revealEmpireFx,
      revealEmpireStatsFx,
      bombardFx,
      worldEngineStrikeFx,
      worldEngineShakeFx,
      imperialExchangeLevyFx,
      astralDockLaunchFx,
      aegisLockFx,
      unsettleFx
    }
  });
  const syncAetherBridgePylons = (nowMs: number): void => {
    aetherBridgePylonOverlay.beginFrame();
    const now = Date.now();
    for (const bridge of deps.state.activeAetherBridges) {
      if (bridge.endsAt <= now) continue;
      const fromX = toroidDelta(sceneOrigin.camX, bridge.from.x, WORLD_WIDTH) + TILE_CENTER_OFFSET;
      const fromZ = toroidDelta(sceneOrigin.camY, bridge.from.y, WORLD_HEIGHT) + TILE_CENTER_OFFSET;
      const toX = toroidDelta(sceneOrigin.camX, bridge.to.x, WORLD_WIDTH) + TILE_CENTER_OFFSET;
      const toZ = toroidDelta(sceneOrigin.camY, bridge.to.y, WORLD_HEIGHT) + TILE_CENTER_OFFSET;
      // Rotate each pylon so its twin spires straddle the lane (the energy
      // gate opens toward the far coast).
      const faceAngle = Math.atan2(toX - fromX, toZ - fromZ);
      aetherBridgePylonOverlay.place(
        fromX,
        aetherBridgeTileSurfaceY(bridge.from.x, bridge.from.y) + MARKER_RISE_ABOVE_HEIGHTFIELD,
        fromZ,
        faceAngle,
        nowMs
      );
      aetherBridgePylonOverlay.place(
        toX,
        aetherBridgeTileSurfaceY(bridge.to.x, bridge.to.y) + MARKER_RISE_ABOVE_HEIGHTFIELD,
        toZ,
        faceAngle + Math.PI,
        nowMs
      );
    }
    aetherBridgePylonOverlay.endFrame();
  };

  // Dirty-check inputs for applyCamera(): worldToScreen/worldTileRawFromPointer
  // (below) call applyCamera() before every use to stay correct regardless of
  // which requestAnimationFrame loop calls them first (see freshWorldToScreen's
  // comment) -- but client-runtime-loop.ts's 2D HUD calls worldToScreen once per
  // visible tile, every frame, and applyPerspectiveCamera does a real
  // camera.lookAt + updateProjectionMatrix + updateMatrixWorld(true). Skipping
  // the recompute when nothing it depends on has changed since the last call
  // turns that from O(visible tiles) back into O(1) per frame.
  const lastCameraInputs = { zoom: Number.NaN, width: -1, height: -1, camX: Number.NaN, camY: Number.NaN, camSubX: Number.NaN, camSubY: Number.NaN, sceneOriginCamX: Number.NaN, sceneOriginCamY: Number.NaN };
  const applyCamera = (): void => {
    const width = deps.canvas.width;
    const height = deps.canvas.height;
    const { zoom, camX, camY, camSubX, camSubY } = deps.state;
    const unchanged =
      lastCameraInputs.zoom === zoom &&
      lastCameraInputs.width === width &&
      lastCameraInputs.height === height &&
      lastCameraInputs.camX === camX &&
      lastCameraInputs.camY === camY &&
      lastCameraInputs.camSubX === camSubX &&
      lastCameraInputs.camSubY === camSubY &&
      lastCameraInputs.sceneOriginCamX === sceneOrigin.camX &&
      lastCameraInputs.sceneOriginCamY === sceneOrigin.camY;
    if (unchanged) return;
    lastCameraInputs.zoom = zoom;
    lastCameraInputs.width = width;
    lastCameraInputs.height = height;
    lastCameraInputs.camX = camX;
    lastCameraInputs.camY = camY;
    lastCameraInputs.camSubX = camSubX;
    lastCameraInputs.camSubY = camSubY;
    lastCameraInputs.sceneOriginCamX = sceneOrigin.camX;
    lastCameraInputs.sceneOriginCamY = sceneOrigin.camY;
    // camSubX/camSubY (client-map-input.ts) are the in-progress drag's sub-tile
    // fraction in [0, 1) -- camX/camY themselves stay whole tiles for every other
    // consumer. Added directly (not toroidal: always small, never needs wrapping)
    // so the camera glides continuously through a tile instead of snapping.
    const offsetX = toroidDelta(sceneOrigin.camX, camX, WORLD_WIDTH) + camSubX, offsetZ = toroidDelta(sceneOrigin.camY, camY, WORLD_HEIGHT) + camSubY;
    applyPerspectiveCamera(camera, { zoom, canvasWidth: width, canvasHeight: height, offsetX, offsetZ }); atmosphere.updateShadowTarget(offsetX, offsetZ); // keeps the sun's shadow frustum centered under the live pan, not just where it was at the last rebuild
  };

  const resize = (): void => {
    const width = Math.max(1, deps.canvas.width);
    const height = Math.max(1, deps.canvas.height);
    glCanvas.width = width;
    glCanvas.height = height;
    renderer.setSize(width, height, false);
    applyCamera();
  };

  // Hoisted Color temps reused per rebuild to avoid per-tile allocation.
  const tmpSettleOwnerColor = new Color();
  const tmpOwnerColor = new Color();
  const tmpBlack = new Color("#000000");
  const SETTLE_FALLBACK_COLOR = new Color("#ffd166");

  const rebuildVisibleTerrain = (window: TerrainWindow): void => {
    const rebuildStartAt = performance.now();
    const { halfW, halfH } = window;

    heightfield.mesh.position.set(0, 0, 0);
    const isExploredForHeightfield = (wx: number, wy: number): boolean => {
      if (revealWholeMapInTrue3DMode) return true;
      const tile = deps.state.tiles.get(deps.keyFor(wx, wy));
      const visibility = deps.tileVisibilityStateAt(wx, wy, tile);
      return visibility === "visible" || visibility === "fogged";
    };
    // Shared window params for the main sculpted grid and the separate hills
    // dome layer (client-map-3d-hills.ts, which draws what the grid excludes)
    // — both must rebuild against the exact same visible window every frame.
    const sharedTerrainWindow = {
      camX: window.camX, camY: window.camY, halfW, halfH,
      worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT,
      tileKindAt: heightfieldKindAt, isExploredAt: isExploredForHeightfield
    };
    const heightfieldStartAt = performance.now();
    heightfield.rebuild({ ...sharedTerrainWindow, isForestAt: isForestTile, isHillsAt: isHillsTile });
    hillTerrain.rebuild({ ...sharedTerrainWindow, isHillsAt: isHillsTile });
    riverOverlay.rebuild({ camX: window.camX, camY: window.camY, halfW, halfH, isExploredAt: isExploredForHeightfield });
    const heightfieldMs = performance.now() - heightfieldStartAt;

    mountainMassifs.clear();
    villageEffects.clear();
    forest.clear();
    ownershipOverlay.clear(); frontierDecayPulse.reset();
    fogDarkenOverlay.clear();
    fogOwnershipOverlay.clear();
    townOverlay.clear();
    roadOverlay.clear();
    // Live pylon/line pool is cleared+rebuilt every frame instead (see the
    // unconditional per-frame section below) so its border-transition
    // animation stays smooth regardless of camera movement -- only the
    // static dead-pylon/dormant/out-of-reach tile overlays reset here.
    reachOverlay3D.clearTileOverlays();
    const roadNetworkStartAt = performance.now();
    const roadNetwork = buildRoadNetwork({
      tiles: deps.state.tiles,
      keyFor: deps.keyFor,
      wrapX: deps.wrapX,
      wrapY: deps.wrapY
    });
    const roadNetworkMs = performance.now() - roadNetworkStartAt;
    // §21.1: per-tile dormant-structure resource, keyed by plain "x,y" (the
    // dormantStructures wire field's keys are "x,y:field"). A tile with more
    // than one dormant field just shows the first resource found.
    const dormantStructureResourceByTileKey = new Map<string, SlotResource>();
    for (const { key, resources } of deps.state.dormantStructures) {
      const tileKey = key.slice(0, key.lastIndexOf(":"));
      if (!dormantStructureResourceByTileKey.has(tileKey) && resources[0]) {
        dormantStructureResourceByTileKey.set(tileKey, resources[0]);
      }
    }
    for (const overlay of allBadgeOverlays) overlay.clear();
    observatoryCooldownBadgeOverlay.clear();
    upgradeReadyBadgeOverlay.clear();
    musterOverlay.clear();
    supplyLineOverlay.clear();
    dockOverlay.clear();
    waterSurface.clear();
    barbarianOverlay.clear();
    shardOverlay.clear(); watchtowerOverlay.clear(); naturalWonderOverlays.clear();
    fortOverlay.clear(); relayBeaconOverlay.clear(); tradeNexusOverlay.clear();
    resourceOverlay.clear(); barleyFieldOverlay.clear(); titaniumDepositOverlay.clear(); umbriteDepositOverlay.clear(); umbriteExtractionRigOverlay.clear(); umbriteWeaponsFactoryOverlay.clear();
    barleyFieldOverlay.setDetailEnabled(deps.state.zoom >= BARLEY_DETAIL_MIN_ZOOM);
    attackOverlay.clear();
    settleOverlay.clear();
    // Cleared before any addInstance/addShadow call below can run this
    // rebuild, and committed/disposed alongside structureOverlay — see the
    // shared-ownership comment where contactShadowOverlay is constructed.
    contactShadowOverlay.clear();
    structureOverlay.clear();
    aetherTowerOverlay.clear();
    defensibilityOverlay.clear();
    // Build the dock-endpoint key set the same way the 2D runtime loop
    // does, since `tile.dockId` is not reliably populated on every
    // dock-endpoint tile snapshot.
    const dockEndpointKeys = new Set<string>();
    for (const pair of deps.state.dockPairs) {
      dockEndpointKeys.add(deps.keyFor(pair.ax, pair.ay));
      dockEndpointKeys.add(deps.keyFor(pair.bx, pair.by));
    }
    const selectedCoord = deps.state.selected;
    let selectedOwnershipDebug: Record<string, unknown> | undefined;

    // Fixed-borders-via-reach 3D overlay data source. Reuses the exact same
    // pure resolveMyReach/isDormantFrontierTile/isReachBoundaryTile
    // helpers the 2D canvas path uses (client-reach-overlay.ts) so both
    // renderers always agree on what's in reach. Only computed while the
    // true-3D renderer is actually active.
    const reach3DActive = isTrue3DRendererActive();
    const reach3DDeps = { tiles: deps.state.tiles, keyFor: deps.keyFor, wrapX: deps.wrapX, wrapY: deps.wrapY };
    if (reach3DActive) {
      const reach3DKey = `${deps.state.tilesRevision}:${deps.state.serverReachRevision}:${deps.state.rivalReachGlobalRevision}`; // string key; rivalReachGlobalRevision covers rival-only border changes
      if (reach3DCacheRevision !== reach3DKey) {
        // Land-only: reach is a purely geometric radius (no terrain
        // awareness), so a coastal anchor's disk legitimately extends over
        // open water -- filtered here so the boundary trace/pylons never
        // draw out into the sea. Gameplay legality (EXPAND requiring LAND
        // terrain) is unaffected; this only trims the visual reach set.
        reach3DCache = filterReachToLand(resolveMyReach(deps.state), deps.state.tiles, deps.keyFor);
        reach3DCacheRevision = reach3DKey;
        const loops = traceReachBoundaryEdgeLoops(reach3DCache, reach3DDeps);
        const { pylons, segments } = samplePerimeterPylons(loops);
        reach3DPylons = pylons.flat();
        reach3DSegments = segments.flat();
        ({ pylons: otherOwnersPylons, segments: otherOwnersSegments } = computeOtherOwnersReachPylons(deps.state.tiles, deps.state.me, reach3DDeps, deps.keyFor, deps.state.rivalReach));
        borderContactState = computeBorderContactRenderState(deps.state.me, reach3DPylons, otherOwnersPylons, reach3DSegments, otherOwnersSegments);
      }
    } else {
      reach3DCache = undefined;
      reach3DCacheRevision = "";
      reach3DPylons = []; reach3DSegments = []; otherOwnersPylons = []; otherOwnersSegments = []; borderContactState = EMPTY_BORDER_CONTACT_STATE;
    }

    const perTileLoopStartAt = performance.now();
    for (let dy = -halfH - 1; dy <= halfH + 1; dy += 1) {
      for (let dx = -halfW - 1; dx <= halfW + 1; dx += 1) {
        const wx = deps.wrapX(window.camX + dx);
        const wy = deps.wrapY(window.camY + dy);
        const tile = deps.state.tiles.get(deps.keyFor(wx, wy));
        const visibility = deps.tileVisibilityStateAt(wx, wy, tile);
        if (debugTileLoggingEnabled()) {
          const tileKey = deps.keyFor(wx, wy);
          const lastOwnerId = lastRenderedOwnerIdByTile.get(tileKey);
          if (lastOwnerId !== tile?.ownerId) {
            debugTileLog("3d-render-ownership-changed", {
              x: wx,
              y: wy,
              visibility,
              revealWholeMapInTrue3DMode,
              fromOwnerId: lastOwnerId ?? null,
              toOwnerId: tile?.ownerId ?? null,
              ownershipState: tile?.ownershipState ?? null,
              fogged: tile?.fogged ?? null,
              skipped: visibility === "unexplored" && !revealWholeMapInTrue3DMode,
              tilesRevision: deps.state.tilesRevision
            });
            lastRenderedOwnerIdByTile.set(tileKey, tile?.ownerId);
          }
        }
        // Skip tiles never explored unless ?reveal=1 is set. Fogged tiles
        // fall through -- the heightfield already drew their frozen terrain
        // (isExploredForHeightfield above), and the fog branch below adds a
        // darkened + last-known-owner tint before its own `continue`, so
        // fogged tiles never reach the live overlay code (roads,
        // structures, units, FX) further down this loop.
        if (visibility === "unexplored" && !revealWholeMapInTrue3DMode) continue;
        const terrain = terrainForWorldTile(wx, wy);
        const x = dx + TILE_CENTER_OFFSET;
        const z = dy + TILE_CENTER_OFFSET;
        const forestTile = isForestTile(wx, wy);
        const ownerId = tile?.ownerId;
        const ownershipState = tile?.ownershipState;
        const isOwnedLand = terrain === "LAND" && Boolean(ownerId) && visibility === "visible";
        if (selectedCoord && wx === selectedCoord.x && wy === selectedCoord.y) {
          const playerColor = ownerId ? deps.state.playerColors.get(ownerId) : undefined;
          const effectiveColor = ownerId ? deps.effectiveOverlayColor(ownerId) : undefined;
          const normalizedColor = effectiveColor ? normalizeColorForThree(effectiveColor) : undefined;
          selectedOwnershipDebug = {
            selected: { x: wx, y: wy },
            terrain,
            visibility,
            ownerId: ownerId ?? null,
            ownershipState: ownershipState ?? null,
            playerColor: playerColor ?? null,
            effectiveColor: effectiveColor ?? null,
            normalizedColor: normalizedColor ?? null,
            isOwnedLand
          };
        }
        // Overlays sit on the *rendered* surface, not the tile's base
        // elevation. The heightfield's drawn corners get pulled up by
        // averaging with raised neighbours (mountains, hills), so a
        // tile's painted surface can be much higher than its base. Max
        // of all 4 corners + small buffer keeps overlays above the
        // ground at every interior point of the tile. elevationAt already
        // bakes HEIGHTFIELD_HILLS_ELEVATION_BONUS into a hill tile's own
        // cached base elevation (see sampleTile in
        // client-map-3d-heightfield.ts) -- adding the bonus again here used
        // to double it, floating every overlay a full bonus-height above
        // the dome's actual peak instead of resting on it.
        const wxNext = deps.wrapX(wx + 1);
        const wyNext = deps.wrapY(wy + 1);
        const surfaceY = Math.max(
          heightfield.elevationAt(wx, wy),
          heightfield.cornerYAt(wx, wy),
          heightfield.cornerYAt(wxNext, wy),
          heightfield.cornerYAt(wx, wyNext),
          heightfield.cornerYAt(wxNext, wyNext)
        ) + OVERLAY_RISE_ABOVE_HEIGHTFIELD;
        if (visibility === "fogged" && !revealWholeMapInTrue3DMode) {
          // Fogged tiles show only a darkened terrain quad plus a dim tint
          // of their last-witnessed owner -- no roads, structures, units,
          // or FX, since we no longer have live data for any of that. This
          // mirrors the 2D canvas renderer's fog rules (client-runtime-loop.ts).
          //
          // SEA/COASTAL_SEA is a special case: sea tiles are never part of
          // the heightfield mesh (client-map-3d-heightfield.ts skips them,
          // leaving a hole for the live water plane to sit over), so unlike
          // LAND there is no "frozen remembered terrain" underneath for the
          // darken overlay below to tint -- it would just paint a black quad
          // over an empty hole, on top of the scene's own black background
          // (FOG_COLOR), reading as a solid black void. Draw the same live
          // water quad visible sea gets instead, so fogged sea reads as
          // remembered ocean rather than a hole. Not dimmed relative to
          // live-visible water (the water-surface module has no "dimmed"
          // vertex-color variant to plumb through) -- undimmed water is a
          // solid improvement over a black hole and isn't worth a bigger
          // change to add that distinction.
          if (terrain === "SEA" || terrain === "COASTAL_SEA") {
            let shallow = false;
            for (let nz = -2; nz <= 2 && !shallow; nz += 1) {
              for (let nx = -2; nx <= 2 && !shallow; nx += 1) {
                if (nx === 0 && nz === 0) continue;
                const nwx = deps.wrapX(wx + nx);
                const nwy = deps.wrapY(wy + nz);
                const nt = terrainForWorldTile(nwx, nwy);
                if (nt === "LAND" || nt === "MOUNTAIN") shallow = true;
              }
            }
            waterSurface.addTile(x, z, shallow, wx, wy);
            continue;
          }
          const fogIsHill = isHillsTile(wx, wy);
          const fogCorner00Y = heightfield.cornerYAt(wx, wy) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
          const fogCorner10Y = heightfield.cornerYAt(wxNext, wy) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
          const fogCorner01Y = heightfield.cornerYAt(wx, wyNext) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
          const fogCorner11Y = heightfield.cornerYAt(wxNext, wyNext) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
          const fx0 = x - 0.5;
          const fx1 = x + 0.5;
          const fz0 = z - 0.5;
          const fz1 = z + 0.5;
          if (fogIsHill) {
            fogDarkenOverlay.addHillTile(fx0, fx1, fz0, fz1, fogCorner00Y, fogCorner10Y, fogCorner01Y, fogCorner11Y, tmpBlack, false);
          } else {
            fogDarkenOverlay.addTile(fx0, fogCorner00Y, fz0, fx1, fogCorner10Y, fz0, fx0, fogCorner01Y, fz1, fx1, fogCorner11Y, fz1, tmpBlack, false);
          }
          if (terrain === "LAND" && ownerId && ownershipState !== "FRONTIER") { // FRONTIER excluded: ephemeral claim, so tinting stale fog data as "still his" is misleading -- stacked on the black darken tint above it just read as a dark disconnected box
            const fogOwnerColor = tmpOwnerColor.set(normalizeColorForThree(deps.effectiveOverlayColor(ownerId)));
            if (fogIsHill) {
              fogOwnershipOverlay.addHillTile(
                fx0, fx1, fz0, fz1,
                fogCorner00Y, fogCorner10Y, fogCorner01Y, fogCorner11Y,
                fogOwnerColor,
                false
              );
            } else {
              fogOwnershipOverlay.addTile(
                fx0, fogCorner00Y, fz0,
                fx1, fogCorner10Y, fz0,
                fx0, fogCorner01Y, fz1,
                fx1, fogCorner11Y, fz1,
                fogOwnerColor,
                false
              );
            }
          }
          continue;
        }
        if (terrain === "LAND") {
          const roadDirs = roadNetwork.get(deps.keyFor(wx, wy));
          if (roadDirs) {
            const elevationAt = createRoadElevationAt(isHillsTile, (x, z) => heightfield.cornerYAt(x, z), deps.wrapX, deps.wrapY);
            roadOverlay.addInstance(wx, wy, x, z, elevationAt, roadDirs);
          }
        }
        // Per-tile water quad on top of the heightfield's sea-floor
        // hole. Shallow vs deep texture is decided by the water surface
        // module — pass shallow=true if any tile within Chebyshev
        // radius 2 is land/mountain.
        if (terrain === "SEA" || terrain === "COASTAL_SEA") {
          let shallow = false;
          for (let nz = -2; nz <= 2 && !shallow; nz += 1) {
            for (let nx = -2; nx <= 2 && !shallow; nx += 1) {
              if (nx === 0 && nz === 0) continue;
              const nwx = deps.wrapX(wx + nx);
              const nwy = deps.wrapY(wy + nz);
              const nt = terrainForWorldTile(nwx, nwy);
              if (nt === "LAND" || nt === "MOUNTAIN") shallow = true;
            }
          }
          waterSurface.addTile(x, z, shallow, wx, wy);
          continue;
        }
        // Dock 3D pier/quay/harbor — anchored to the tile's land Y so
        // the deck sits on the ground inland and overhangs the water.
        const tileKey = deps.keyFor(wx, wy);
        if (tile?.dockId || dockEndpointKeys.has(tileKey)) {
          const cardinalsForDock: Array<{ dx: number; dy: number; rot: number }> = [
            { dx: 0, dy: 1, rot: 0 },
            { dx: 1, dy: 0, rot: -Math.PI / 2 },
            { dx: 0, dy: -1, rot: Math.PI },
            { dx: -1, dy: 0, rot: Math.PI / 2 }
          ];
          let dockRotation = 0;
          for (const c of cardinalsForDock) {
            const nwx = deps.wrapX(wx + c.dx);
            const nwy = deps.wrapY(wy + c.dy);
            const nt = terrainForWorldTile(nwx, nwy);
            if (nt === "SEA" || nt === "COASTAL_SEA") {
              dockRotation = c.rot;
              break;
            }
          }
          const dockSurfaceY = Math.max(heightfield.elevationAt(wx, wy), -0.04) + 0.02;
          dockOverlay.addInstance(x, z, dockSurfaceY, dockRotation, wx, wy);
          contactShadowOverlay.addShadow(x, z, dockSurfaceY, DEFAULT_CONTACT_SHADOW_RADIUS_TILES);
        }
        if (terrain === "MOUNTAIN") {
          mountainMassifs.addInstance(x, z, surfaceY);
          continue;
        }
        if (forestTile) {
          forest.addInstance(x, z, surfaceY, wx, wy);
          contactShadowOverlay.addShadow(x, z, surfaceY, SMALL_CONTACT_SHADOW_RADIUS_TILES);
        }
        const realTier = tile?.town?.populationTier;
        const demoTier = isTownDemoTile(wx, wy, window.camX, window.camY);
        const renderedTier: TownTier | undefined = realTier ?? demoTier;
        if (renderedTier && terrain === "LAND") {
          townOverlay.addInstance(x, z, surfaceY, renderedTier);
          // LARGE, not DEFAULT: a town's own foundation slab runs up to 0.92
          // tiles wide (see the radius comments in
          // client-map-3d-contact-shadow.ts) — DEFAULT's 0.84 diameter was
          // fully hidden underneath it, which is why towns showed no shadow.
          contactShadowOverlay.addShadow(x, z, surfaceY, LARGE_CONTACT_SHADOW_RADIUS_TILES);
          const tileSeed = wx * 17 + wy * 31;
          if (tile && shouldShowTownSmoke(tile)) {
            // Pale owned-village smoke marks active settled town growth. Capital banners stay
            // off for now; re-enable by adding villageEffects.addCapitalBanner if wanted.
            villageEffects.addOwnedVillage(x, z, surfaceY, tileSeed);
          }
          // Capture-shock smoke + floating "-N pop" indicator are independent of the
          // owned-village smoke gate: a recently captured FRONTIER tile is intentionally
          // alarmed even though it doesn't qualify for the pale growth-smoke above.
          const captureShockUntil = tile?.town?.captureShockUntil;
          if (typeof captureShockUntil === "number" && captureShockUntil > Date.now()) {
            villageEffects.addCapturedTownSmoke(x, z, surfaceY, tileSeed);
            const previousShock = lastSeenCaptureShockByTile.get(tileKey) ?? 0;
            if (captureShockUntil > previousShock) {
              const popBefore = tile?.town?.populationBeforeCapture;
              const popAfter = tile?.town?.population;
              if (typeof popBefore === "number" && typeof popAfter === "number" && popBefore > popAfter) {
                const popLoss = Math.max(1, Math.round(popBefore - popAfter));
                floatingText.spawn(x, z, surfaceY, `-${popLoss} pop`);
              }
              lastSeenCaptureShockByTile.set(tileKey, captureShockUntil);
            }
          } else if (lastSeenCaptureShockByTile.has(tileKey)) {
            // Shock expired or town cleared: drop the entry so the map can't grow unbounded.
            lastSeenCaptureShockByTile.delete(tileKey);
          }
          // Mirror the "Town is unfed" line in the tile-menu — see
          // shouldShowTownUnfedWarning in client-town-growth.ts. A dormant
          // non-town structure on this tile takes priority if both apply.
          if (tile && shouldShowTownUnfedWarning(tile, deps.state.me) && !dormantStructureResourceByTileKey.has(tileKey)) {
            resourceBadgeOverlays.FOOD.addInstance(x, z, surfaceY);
          }
          // Mirror of the "Upgrade Town to City"-style action in the tile-menu —
          // see shouldShowTownUpgradeReadyBadge in client-town-growth.ts. Green
          // up-arrow badge over a town whose population has hit the threshold for
          // its next tier. Kept independent of the unfed badge above: a town
          // ready to grow is very rarely also stalled, and if both apply the two
          // badges bob in the same band without conflicting.
          if (tile && shouldShowTownUpgradeReadyBadge(tile, deps.state.me)) {
            upgradeReadyBadgeOverlay.addInstance(x, z, surfaceY);
          }
        }
        // §21.1: floating badge for a dormant non-town structure — independent of the town block above (most structures aren't on a town tile).
        if (tile && terrain === "LAND") {
          const dormantStructureResource = dormantStructureResourceByTileKey.get(tileKey);
          if (dormantStructureResource) resourceBadgeOverlays[dormantStructureResource].addInstance(x, z, surfaceY);
        }
        if (tile && ownerId === "barbarian-1" && terrain === "LAND") {
          barbarianOverlay.addInstance(x, z, surfaceY);
          contactShadowOverlay.addShadow(x, z, surfaceY, DEFAULT_CONTACT_SHADOW_RADIUS_TILES);
        }
        if (tile?.shardSite && terrain === "LAND" && visibility === "visible") {
          shardOverlay.addInstance(x, z, surfaceY, wx, wy);
          contactShadowOverlay.addShadow(x, z, surfaceY, DEFAULT_CONTACT_SHADOW_RADIUS_TILES);
        } if (tile?.watchtower && terrain === "LAND" && visibility === "visible") { watchtowerOverlay.addInstance(x, z, surfaceY, wx, wy, tile.watchtower); contactShadowOverlay.addShadow(x, z, surfaceY, DEFAULT_CONTACT_SHADOW_RADIUS_TILES); } if (tile?.naturalWonder && terrain === "LAND" && visibility === "visible") { naturalWonderOverlays.addInstance(tile.naturalWonder.type, x, z, surfaceY, wx, wy); contactShadowOverlay.addShadow(x, z, surfaceY, LARGE_CONTACT_SHADOW_RADIUS_TILES); }
        // Resolve the underlying resource once per tile — used by the
        // resource overlay (for the icon) AND by the structure overlay
        // (so a MINE on a GEMS tile loads its cart with blue crystals
        // instead of grey iron ore, keeping the resource readable).
        let tileResource: ResourceType | undefined;
        if (terrain === "LAND") {
          // Use the same resource source as the 2D path (`resourceFor3DPopulation`).
          // When ?reveal=1, this synthesises a resource on land tiles that
          // don't yet have a real `state.tiles` entry — mirroring the
          // `syntheticOverlayTileAt` path in client-runtime-loop.ts.
          const biome = landBiomeAt(wx, wy);
          const resolvedResource = resourceFor3DPopulation(wx, wy, terrain, tile, revealWholeMapInTrue3DMode, biome, forestTile);
          if (resolvedResource) {
            const validResources: ReadonlyArray<ResourceType> = ["FARM", "TITANIUM", "GEMS", "FISH", "UMBRITE"];
            if ((validResources as ReadonlyArray<string>).includes(resolvedResource)) {
              tileResource = resolvedResource as ResourceType;
              if (tileResource === "FARM") { barleyFieldOverlay.addInstance(x, z, surfaceY, wx, wy); } else if (tileResource === "TITANIUM") { titaniumDepositOverlay.addInstance(x, z, surfaceY, wx, wy); } else if (tileResource === "UMBRITE") { umbriteDepositOverlay.addInstance(x, z, surfaceY, wx, wy); } else { resourceOverlay.addInstance(x, z, surfaceY, tileResource, wx, wy); }
              contactShadowOverlay.addShadow(x, z, surfaceY, DEFAULT_CONTACT_SHADOW_RADIUS_TILES);
            }
          }
        }
        const incomingAttack = deps.state.incomingAttacksByTile.get(deps.keyFor(wx, wy));
        if (incomingAttack && incomingAttack.resolvesAt > Date.now() && terrain === "LAND") {
          attackOverlay.addInstance(x, z, surfaceY, incomingAttack.resolvesAt);
        }
        if (tile?.economicStructure && terrain === "LAND") {
          const structureType = tile.economicStructure.type as string;
          if (structureType === "UMBRITE_RIG") {
            umbriteExtractionRigOverlay.addInstance(x, z, surfaceY, wx, wy);
            contactShadowOverlay.addShadow(x, z, surfaceY, DEFAULT_CONTACT_SHADOW_RADIUS_TILES);
          } else if (structureType === "UMBRITE_WEAPONS_FACTORY") {
            umbriteWeaponsFactoryOverlay.addInstance(x, z, surfaceY, wx, wy);
            contactShadowOverlay.addShadow(x, z, surfaceY, DEFAULT_CONTACT_SHADOW_RADIUS_TILES);
          } else if (structureType === "CARAVANARY") { tradeNexusOverlay.addInstance(x, z, surfaceY, wx, wy); contactShadowOverlay.addShadow(x, z, surfaceY, DEFAULT_CONTACT_SHADOW_RADIUS_TILES); } else if (STRUCTURE_KINDS_HANDLED_BY_3D.has(structureType as StructureKind)) {
            const mineResourceHint =
              structureType === "MINE" && (tileResource === "TITANIUM" || tileResource === "GEMS")
                ? tileResource
                : undefined;
            structureOverlay.addInstance(x, z, surfaceY, structureType as StructureKind, mineResourceHint);
          }
        }
        // Observatory lives on its own tile field, not `economicStructure`; any tile carrying a record renders (under-construction and active alike).
        if (tile?.observatory && terrain === "LAND") {
          if (tile.naturalWonder?.type !== "WATCHTOWER_ENGINE") { aetherTowerOverlay.addInstance(x, z, surfaceY, wx, wy); contactShadowOverlay.addShadow(x, z, surfaceY, DEFAULT_CONTACT_SHADOW_RADIUS_TILES); } // Watchtower has its own wonder mesh below
          // "Recharging" badge while our own active observatory's crystal-casting cooldown is still running (exact time is in the tile-menu overview).
          const cooldownActive = ownerId === deps.state.me && tile.observatory.status === "active" && (tile.observatory.cooldownUntil ?? 0) > Date.now();
          if (cooldownActive) {
            observatoryCooldownBadgeOverlay.addInstance(x, z, surfaceY);
          }
        }
        // ?structuredemo=1: drop each structure kind on a fake row two
        // tiles north of the camera. Only fires when the URL flag is
        // set, so it's harmless in production. The MINE entry passes a
        // resource hint so the iron/crystal variant is exercised.
        // Muster flag + gathering soldiers: visible to anyone with vision.
        if (tile?.muster && terrain === "LAND") {
          const fillRatio = Math.min(1, tile.muster.amount / MUSTER_ATTACK_COST);
          const ownerColor = deps.effectiveOverlayColor(tile.muster.ownerId);
          const advance = tile.muster.mode === "ADVANCE";
          musterOverlay.addMuster(x, z, surfaceY, fillRatio, ownerColor, advance, wx, wy);
        }
        const demoStructureEntry = structureDemoEntryFor(wx, wy, window.camX, window.camY);
        if (demoStructureEntry && terrain === "LAND") {
          if (demoStructureEntry.kind === "UMBRITE_RIG") {
            umbriteExtractionRigOverlay.addInstance(x, z, surfaceY, wx, wy);
          } else if (demoStructureEntry.kind === "UMBRITE_WEAPONS_FACTORY") {
            umbriteWeaponsFactoryOverlay.addInstance(x, z, surfaceY, wx, wy);
          } else {
            structureOverlay.addInstance(x, z, surfaceY, demoStructureEntry.kind, demoStructureEntry.resource);
          }
        }
        const settleProgress = deps.settlementProgressForTile(wx, wy);
        if (settleProgress && terrain === "LAND") {
          const settleColor = ownerId
            ? tmpSettleOwnerColor.set(normalizeColorForThree(deps.effectiveOverlayColor(ownerId)))
            : SETTLE_FALLBACK_COLOR;
          if (isHillsTile(wx, wy)) {
            const wxOwn = deps.wrapX(wx + 1);
            const wyOwn = deps.wrapY(wy + 1);
            const corner00Y = heightfield.cornerYAt(wx, wy) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
            const corner10Y = heightfield.cornerYAt(wxOwn, wy) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
            const corner01Y = heightfield.cornerYAt(wx, wyOwn) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
            const corner11Y = heightfield.cornerYAt(wxOwn, wyOwn) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
            const x0 = x - 0.5;
            const x1 = x + 0.5;
            const z0 = z - 0.5;
            const z1 = z + 0.5;
            settleOverlay.addHillTile(x0, x1, z0, z1, corner00Y, corner10Y, corner01Y, corner11Y, settleColor, settleProgress.startAt, settleProgress.resolvesAt, wx, wy);
          } else {
            settleOverlay.addInstance(x, z, surfaceY, settleColor, settleProgress.startAt, settleProgress.resolvesAt, wx, wy);
          }
        }
        if (tile) {
          const fortKind = fortificationOverlayKindForTile(tile);
          if (fortKind === "RELAY_BEACON") {
            relayBeaconOverlay.addInstance(x, z, surfaceY, wx, wy);
            contactShadowOverlay.addShadow(x, z, surfaceY, DEFAULT_CONTACT_SHADOW_RADIUS_TILES);
          } else if (fortKind) {
            const opening = fortificationOpeningForTile(tile, {
              tiles: deps.state.tiles,
              keyFor: deps.keyFor,
              wrapX: deps.wrapX,
              wrapY: deps.wrapY
            });
            fortOverlay.addInstance(x, z, surfaceY, fortKind, opening);
            // LARGE: fort walls run WALL_LENGTH = 0.86 tiles
            // (client-map-3d-fort-overlay.ts) — same reasoning as towns.
            contactShadowOverlay.addShadow(x, z, surfaceY, LARGE_CONTACT_SHADOW_RADIUS_TILES);
          }
        }
        const demoFort = fortDemoSpec(wx, wy, window.camX, window.camY);
        if (demoFort && terrain === "LAND") {
          if (demoFort.kind === "RELAY_BEACON") {
            relayBeaconOverlay.addInstance(x, z, surfaceY, wx, wy);
          } else {
            fortOverlay.addInstance(x, z, surfaceY, demoFort.kind, demoFort.opening);
          }
        }
        if (isOwnedLand && ownerId) {
          const normalizedColor = normalizeColorForThree(deps.effectiveOverlayColor(ownerId));
          // ownershipOverlay.addTile copies the colour, so we can reuse a
          // hoisted Color across tiles.
          const ownerColor = tmpOwnerColor.set(normalizedColor);
          // Decay countdown pulse is applied every frame by frontierDecayPulse.render() instead of baked in here, so camera pan/zoom rebuilds can't make it jump -- see client-map-3d-frontier-decay-pulse.ts.
          const isDecayingFrontierTile = ownershipState === "FRONTIER" && typeof tile.frontierDecayAt === "number";
          const wxOwn = deps.wrapX(wx + 1);
          const wyOwn = deps.wrapY(wy + 1);
          // cornerYAt returns the heightfield's *rendered* Y for each
          // corner — the same value written into the position buffer
          // (including coastEdgeY pull-down at mixed corners and the
          // explored-only filter), so the ownership quad traces the
          // visible surface exactly. Previously this block averaged
          // base elevations of the 4 surrounding tiles, which sat
          // below the rendered surface near coast/explored boundaries
          // and let the overlay sink under the heightfield.
          // Hills are a separate dome mesh layered on top of the flat
          // heightfield (see client-map-3d-hills.ts), so cornerYAt alone
          // never reflects their raised surface. Each tile's quad has
          // private, unshared corner vertices, so it's safe to bump the
          // whole quad up to clear the dome peak without creating seams.
          const corner00Y = heightfield.cornerYAt(wx, wy) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
          const corner10Y = heightfield.cornerYAt(wxOwn, wy) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
          const corner01Y = heightfield.cornerYAt(wx, wyOwn) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
          const corner11Y = heightfield.cornerYAt(wxOwn, wyOwn) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
          const x0 = x - 0.5;
          const x1 = x + 0.5;
          const z0 = z - 0.5;
          const z1 = z + 0.5;
          if (isHillsTile(wx, wy)) {
            // Drape the overlay over the dome's own curve instead of
            // bridging it with one flat plane (see addHillTile).
            const hillIndex = ownershipOverlay.addHillTile(
              x0, x1, z0, z1,
              corner00Y, corner10Y, corner01Y, corner11Y,
              ownerColor,
              ownershipState === "FRONTIER"
            );
            if (isDecayingFrontierTile && hillIndex >= 0) frontierDecayPulse.track({ index: hillIndex, isHill: true, frontierDecayAt: tile.frontierDecayAt as number, frontierDecayKind: tile.frontierDecayKind, baseColor: ownerColor.clone() });
          } else {
            const flatIndex = ownershipOverlay.addTile(
              x0, corner00Y, z0,
              x1, corner10Y, z0,
              x0, corner01Y, z1,
              x1, corner11Y, z1,
              ownerColor,
              ownershipState === "FRONTIER"
            );
            if (isDecayingFrontierTile && flatIndex >= 0) frontierDecayPulse.track({ index: flatIndex, isHill: false, frontierDecayAt: tile.frontierDecayAt as number, frontierDecayKind: tile.frontierDecayKind, baseColor: ownerColor.clone() });
          }
          if (selectedCoord && wx === selectedCoord.x && wy === selectedCoord.y && selectedOwnershipDebug) {
            selectedOwnershipDebug = {
              ...selectedOwnershipDebug,
              renderedOwnershipLayer: true,
              renderedOwnershipColor: `#${ownerColor.getHexString()}`
            };
          }
        }
        // Aether Survey Line 3D overlay: dormant-frontier fill is still
        // per-tile (mirrors the 2D path's conditions in
        // client-runtime-loop.ts exactly). The sparse pylons + connecting
        // chords themselves are NOT rendered per-tile here -- they're
        // placed once per reach-cache revision from
        // reach3DPylons/reach3DSegments below the main tile loop, since a
        // pylon only exists every ~10-15 boundary tiles and iterating the
        // full visible-tile grid is the wrong loop shape for that.
        if (reach3DActive && reach3DCache && tile && visibility === "visible") {
          if (tile.ownerId === deps.state.me && isDormantFrontierTile(tile)) {
            reachOverlay3D.addDormantFrontierTile(x, z, surfaceY, 1);
          }
        }
        if (deps.state.showWeakDefensibility && isOwnedSettledLandTile(tile, deps.state.me)) {
          const exposedSides = exposedSidesForTile(tile, {
            tiles: deps.state.tiles,
            me: deps.state.me,
            keyFor: deps.keyFor,
            wrapX: deps.wrapX,
            wrapY: deps.wrapY,
            terrainAt: deps.terrainAt
          });
          const severity = weakDefensibilitySeverity(exposedSides.length);
          if (severity) defensibilityOverlay.addInstance(x, z, surfaceY, severity);
        }
        if (deps.state.crystalTargeting.active && tile && visibility === "visible" && deps.state.crystalTargeting.validTargets.has(tileKey)) {
          crystalTargetingOverlay.addInstance(x, z, surfaceY);
        }
      }
    }
    populateShardRainBadgeInstances(shardRainBadgeOverlay, deps.state.shardRainStatus, { camX: window.camX, camY: window.camY, halfW, halfH, elevationAt: heightfield.elevationAt, tiles: deps.state.tiles }); const perTileLoopMs = performance.now() - perTileLoopStartAt;

    // Aether Survey Line live pylons/segments are placed every frame now
    // (see renderReachOverlay3DPylons, called unconditionally from
    // renderLoop) so their border-transition animation stays smooth
    // regardless of camera movement -- reach3DCache/reach3DPylons/
    // reach3DSegments computed above are the throttled DATA source it
    // reads from, not the placement itself.

    if (selectedOwnershipDebug) emitOwnershipDebug(selectedOwnershipDebug);

    const commitStartAt = performance.now();
    crystalTargetingOverlay.commit();
    mountainMassifs.commit();
    villageEffects.commit();
    forest.commit();
    ownershipOverlay.commit();
    fogDarkenOverlay.commit();
    fogOwnershipOverlay.commit();
    townOverlay.commit();
    roadOverlay.commit();
    reachOverlay3D.commitTileOverlays();
    for (const overlay of allBadgeOverlays) overlay.commit();
    observatoryCooldownBadgeOverlay.commit();
    upgradeReadyBadgeOverlay.commit();
    musterOverlay.commit();
    syncCaptureOverlays(
      deps.state,
      deps.keyFor,
      deps.effectiveOverlayColor,
      heightfield,
      supplyLineOverlay
    );
    supplyLineOverlay.commit();
    dockOverlay.commit();
    waterSurface.commit();
    barbarianOverlay.commit();
    shardOverlay.commit(); watchtowerOverlay.commit(); naturalWonderOverlays.commit();
    fortOverlay.commit(); relayBeaconOverlay.commit(); tradeNexusOverlay.commit();
    resourceOverlay.commit(); barleyFieldOverlay.commit(); titaniumDepositOverlay.commit(); umbriteDepositOverlay.commit(); umbriteExtractionRigOverlay.commit(); umbriteWeaponsFactoryOverlay.commit();
    attackOverlay.commit();
    settleOverlay.commit();
    structureOverlay.commit();
    aetherTowerOverlay.commit();
    contactShadowOverlay.commit();
    defensibilityOverlay.commit();
    const commitMs = performance.now() - commitStartAt;

    recordTerrainRebuildSample({
      totalMs: performance.now() - rebuildStartAt,
      roadNetworkMs,
      heightfieldMs,
      perTileLoopMs,
      commitMs,
      knownTileCount: deps.state.tiles.size,
      // Matches the (dx, dy) loop bounds above: -halfW-1..halfW+1 and -halfH-1..halfH+1 inclusive.
      visibleTileCount: (2 * halfW + 3) * (2 * halfH + 3)
    });
  };

  // A trailing-edge throttle floor for rebuildVisibleTerrain(): terrainWindowCovers's padded
  // hysteresis (client-map-3d-terrain-window.ts) already suppresses most rebuilds during a pan or
  // zoom that doesn't need new tiles outside the pad, but a fast pan/zoom that keeps crossing the
  // pad boundary can still request rebuilds back to back, so continuous dragging needs a backstop.
  // Not a dropped-update risk: rebuildNeeded stays true on every subsequent frame until the floor
  // opens (lastRebuild.at only advances on an actual rebuild), so the next frame after motion
  // settles always rebuilds against current state.
  const REBUILD_MIN_INTERVAL_MS = 48;

  // Places live pylons/segments, animating border-transitions via
  // reach3DPylonTracker/reach3DSegmentTracker. Own throttle (not
  // maybeRebuild's, or a mid-transition camera-idle would freeze it) --
  // unthrottled, this visibility-filter+diffTransitions pass plus a draw
  // call per pylon/segment was a dominant idle-camera CPU/GPU cost; update()
  // still runs every renderLoop frame so placed pylons keep animating.
  const REACH_OVERLAY_MIN_INTERVAL_MS = 48; // == REBUILD_MIN_INTERVAL_MS
  let lastReachOverlayAt = 0;
  const renderReachOverlay3DPylons = (nowMs: number): void => {
    if (lastReachOverlayAt !== 0 && nowMs - lastReachOverlayAt < REACH_OVERLAY_MIN_INTERVAL_MS) return;
    lastReachOverlayAt = nowMs;
    reachOverlay3D.clearPylons();
    if (isTrue3DRendererActive() && reach3DCache) {
      // Pylon/segment points are grid CORNERS (traceReachBoundaryEdgeLoops),
      // not tile centers -- a corner is already exactly on the boundary
      // line between owned and out-of-reach ground, so no edge-offset
      // nudge is needed the way the old tile-based trace required.
      const surfaceYForCorner = (cx: number, cy: number): number =>
        heightfield.cornerYAt(deps.wrapX(cx), deps.wrapY(cy)) + OVERLAY_RISE_ABOVE_HEIGHTFIELD;
      const isCornerVisible = (cx: number, cy: number): boolean =>
        isReachOverlayCornerVisible(cx, cy, {
          wrapX: deps.wrapX,
          wrapY: deps.wrapY,
          keyFor: deps.keyFor,
          getTile: (key) => deps.state.tiles.get(key),
          tileVisibilityStateAt: deps.tileVisibilityStateAt,
          discoveredTiles: deps.state.discoveredTiles,
          fogDisabled: effectiveFogDisabled(deps.state),
          revealWholeMap: revealWholeMapInTrue3DMode
        });

      // Raw lists run through client-reach-overlay-window-cull.ts: culled
      // to the terrain window, then an over-budget view keeps whichever's
      // closest to its center (drops the FARTHEST geometry, not an
      // arbitrary owner/list-order tiebreak).
      const rawAllPylons: OwnedPylonPoint[] = [...reach3DPylons.map((p) => ({ ...p, ownerId: deps.state.me })), ...otherOwnersPylons];
      const rawAllSegments: OwnedPylonSegment[] = [...reach3DSegments.map((s) => ({ ...s, ownerId: deps.state.me })), ...otherOwnersSegments];
      const cullDeps = { toroidDelta, worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT };
      const allPylons = cullAndAllocatePylons(rawAllPylons, lastRebuild.builtWindow, cullDeps, MAX_PYLONS_HARD_CAP);
      const allSegments = cullAndAllocateSegments(rawAllSegments, lastRebuild.builtWindow, cullDeps, MAX_SEGMENTS_HARD_CAP);
      const currentPylons = buildCurrentPylonMap(allPylons, isCornerVisible);
      const currentSegments = buildCurrentSegmentMap(allSegments, isCornerVisible);

      const pylonFrames = diffTransitions(currentPylons, reach3DPylonTracker, nowMs, {
        animateInitial: reach3DPylonsAnimateArrivals,
        arriveStaggerMs: ARRIVE_STAGGER_MS
      });
      const segmentFrames = diffTransitions(currentSegments, reach3DSegmentTracker, nowMs, {
        animateInitial: reach3DPylonsAnimateArrivals,
        arriveStaggerMs: ARRIVE_STAGGER_MS
      }); reach3DPylonsAnimateArrivals = true;

      // NOTE: corners sit at raw integer grid positions (tile (x,y)'s
      // center is at grid position x+TILE_CENTER_OFFSET, but its top-left
      // corner is at grid position x exactly) -- no TILE_CENTER_OFFSET
      // added here.
      for (const pf of pylonFrames.values()) {
        const sx = toroidDelta(sceneOrigin.camX, pf.x, WORLD_WIDTH);
        const sz = toroidDelta(sceneOrigin.camY, pf.y, WORLD_HEIGHT);
        const v = resolveBorderContactVisual(borderContactState.pylonKeys.has(pointKey(pf)), deps.effectiveOverlayColor(pf.ownerId), pf.laserFraction, BORDER_CONTACT_BEAM_COLOR, BORDER_CONTACT_OPACITY_MULT);
        reachOverlay3D.addPylon(sx, sz, surfaceYForCorner(pf.x, pf.y), 1, nowMs, v.color, pf.riseFraction, v.laser);
      }
      // Split at the seam boundary rather than recoloring the whole wall -- see splitSegmentByContact's doc comment.
      for (const sf of segmentFrames.values()) {
        for (const piece of splitSegmentByContact({ x: sf.fx, y: sf.fy }, { x: sf.tx, y: sf.ty }, borderContactState.seams)) {
          const v = resolveBorderContactVisual(piece.atContact, deps.effectiveOverlayColor(sf.ownerId), sf.laserFraction, BORDER_CONTACT_BEAM_COLOR, BORDER_CONTACT_OPACITY_MULT);
          reachOverlay3D.addLineSegment(toroidDelta(sceneOrigin.camX, piece.from.x, WORLD_WIDTH), toroidDelta(sceneOrigin.camY, piece.from.y, WORLD_HEIGHT), surfaceYForCorner(piece.from.x, piece.from.y), toroidDelta(sceneOrigin.camX, piece.to.x, WORLD_WIDTH), toroidDelta(sceneOrigin.camY, piece.to.y, WORLD_HEIGHT), surfaceYForCorner(piece.to.x, piece.to.y), v.color, v.laser, sf.riseFraction, sf.riseFraction);
        }
      }
      borderDustFx.setSeams(borderContactSeamsToDustSeams(borderContactState.seams, { toroidDelta, camX: sceneOrigin.camX, camY: sceneOrigin.camY, worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT, surfaceYForCorner, effectiveOverlayColor: deps.effectiveOverlayColor }));
    } else { borderDustFx.setSeams([]); }
    reachOverlay3D.commitPylons();
  };

  const maybeRebuild = (nowMs: number): void => {
    const width = deps.canvas.width;
    const height = deps.canvas.height;
    const sizeChanged = width !== lastCameraApplied.width || height !== lastCameraApplied.height;
    const zoomChanged = deps.state.zoom !== lastCameraApplied.zoom;
    if (sizeChanged) resize();
    if (sizeChanged || zoomChanged) {
      lastCameraApplied.zoom = deps.state.zoom;
      lastCameraApplied.width = width;
      lastCameraApplied.height = height;
    }

    const ctActiveNow = deps.state.crystalTargeting.active;
    const requiredWindow = requiredTerrainWindow({ zoom: deps.state.zoom, canvasWidth: width, canvasHeight: height, camX: deps.state.camX, camY: deps.state.camY });
    // Padded hysteresis only — no more exact-camX/camY-match requirement. The
    // camera's own offsetX/offsetZ (applyCamera, below) carries the visual pan
    // while the terrain/overlay anchor (sceneOrigin) only jumps when a rebuild
    // actually commits, so the camera can drift inside the pad without forcing
    // one. See client-map-3d-terrain-window.ts's terrainWindowCovers.
    const rebuildNeeded =
      !terrainWindowCovers(lastRebuild.builtWindow, requiredWindow, WORLD_WIDTH, WORLD_HEIGHT) ||
      deps.state.tilesRevision !== lastRebuild.tilesRevision ||
      ctActiveNow !== lastRebuild.crystalTargetingActive;
    if (rebuildNeeded && (lastRebuild.at === 0 || nowMs - lastRebuild.at >= REBUILD_MIN_INTERVAL_MS)) {
      const isFirstRebuild = lastRebuild.at === 0; if (isFirstRebuild) markRendererFirstRenderStarted();
      const builtWindow = padTerrainWindow(requiredWindow, MAX_VISIBLE_TILES);
      rebuildVisibleTerrain(builtWindow); if (isFirstRebuild) markRendererFirstRenderCompleted();
      lastRebuild.builtWindow = builtWindow;
      lastRebuild.at = nowMs;
      lastRebuild.tilesRevision = deps.state.tilesRevision;
      lastRebuild.crystalTargetingActive = ctActiveNow;
      sceneOrigin.camX = builtWindow.camX;
      sceneOrigin.camY = builtWindow.camY; atmosphere.updateShadowFrame(Math.max(builtWindow.halfW, builtWindow.halfH)); // resize the sun's shadow frustum to the new visible-tile radius
    }
    // Applied last, using this frame's FINAL sceneOrigin (post-rebuild if one just
    // committed above): applying it before a same-frame rebuild would frame the
    // camera against the stale pre-rebuild anchor while the terrain just re-baked
    // to the new one, showing old and new terrain geometry misaligned for a frame
    // — most visible at low zoom (near-zero rebuild pad there, so this could fire
    // several frames in a row) where it read as terrain briefly "duplicating".
    // Re-applied every frame, not just on zoom/resize, since the offset itself
    // (live camX/camY vs sceneOrigin) changes on every pan frame even when no
    // rebuild fires.
    applyCamera();
  };

  const renderLoop = (): void => {
    // GL calls on a lost context are no-ops that still cost a frame of scene syncing.
    if (contextGuard.isContextLost()) return;
    const nowMs = performance.now();
    maybeRebuild(nowMs); (selectedMarker.material as LineBasicMaterial).color.set(deps.state.selected && !resolveMyReach(deps.state).has(deps.keyFor(deps.state.selected.x, deps.state.selected.y)) ? "#ff8a3d" : "#ffd166"); // fixed-border reach: warning-orange outside reach
    syncHighlightMarker(selectedMarker, deps.state.selected, MARKER_RISE_ABOVE_HEIGHTFIELD);
    syncHighlightMarker(hoverMarker, deps.state.hover, MARKER_RISE_ABOVE_HEIGHTFIELD);
    syncTownSupportMarkers();
    syncTownSupportCoins();
    syncQueueMarkers();
    syncWaypointMarkers();
    syncFrontierClaimPlate();
    selectionRangeOverlays.sync({ ...deps, cornerYAt: (x: number, y: number) => heightfield.cornerYAt(x, y), sceneOrigin }); const nextDockRouteSyncKey = `${deps.state.selected ? deps.keyFor(deps.state.selected.x, deps.state.selected.y) : ""}:${deps.state.dockPairs.length}:${sceneOrigin.camX}:${sceneOrigin.camY}`; if (nextDockRouteSyncKey !== dockRouteSyncKey) { dockRouteSyncKey = nextDockRouteSyncKey; dockRouteOverlay.clear(); syncDockRouteOverlay(deps.state, sceneOrigin, heightfield, dockRouteOverlay, deps.resolveDockSeaRoute, deps.isDockRouteVisibleForPlayer); dockRouteOverlay.commit(); }
    placementOverlay.sync({ ...deps, cornerYAt: (x: number, y: number) => heightfield.cornerYAt(x, y), sceneOrigin });
    syncAetherBridgePylons(nowMs);
    syncAetherLanceFxQueue();
    syncSurveySweepFxQueue();
    syncSurveySweepPings();
    syncSiphonFxQueue();
    syncRetortRecastFxQueue();
    syncRevealEmpireFxQueue();
    syncRevealEmpireStatsFxQueue();
    syncBombardFxQueue();
    syncWorldEngineStrikeFxQueue();
    syncWorldEngineStrikeShakeQueue(nowMs);
    syncImperialExchangeLevyFxQueue();
    syncAstralDockLaunchFxQueue();
    syncAegisLockFxQueue(); syncUnsettleFxQueue(); onboardingChecklistHighlightOverlay.sync(deps.state.onboardingHighlightTiles.map((t) => ({ sceneX: toroidDelta(sceneOrigin.camX, t.x, WORLD_WIDTH) + TILE_CENTER_OFFSET, sceneZ: toroidDelta(sceneOrigin.camY, t.y, WORLD_HEIGHT) + TILE_CENTER_OFFSET, surfaceY: aetherBridgeTileSurfaceY(t.x, t.y) + MARKER_RISE_ABOVE_HEIGHTFIELD })), nowMs);
    crystalTargetingOverlay.sync({ ct: deps.state.crystalTargeting, hover: deps.state.hover, selected: deps.state.selected, keyFor: deps.keyFor, camX: sceneOrigin.camX, camY: sceneOrigin.camY, cornerYAt: heightfield.cornerYAt.bind(heightfield), tileSurfaceY: aetherBridgeTileSurfaceY, toroidDelta });
    villageEffects.update(nowMs);
    shardOverlay.update(nowMs); watchtowerOverlay.update(nowMs); naturalWonderOverlays.update(nowMs); relayBeaconOverlay.update(nowMs); tradeNexusOverlay.update(nowMs); structureOverlay.update(nowMs); umbriteWeaponsFactoryOverlay.update(nowMs); reachOverlay3D.update(nowMs); aetherTowerOverlay.update(nowMs);
    renderReachOverlay3DPylons(nowMs);
    frontierDecayPulse.render(Date.now(), ownershipOverlay); // epoch ms, matches frontierDecayAt
    aetherLanceFx.update(nowMs);
    surveySweepFx.update(nowMs);
    siphonFx.update(nowMs);
    retortRecastFx.update(nowMs);
    revealEmpireFx.update(nowMs);
    revealEmpireStatsFx.update(nowMs);
    bombardFx.update(nowMs);
    worldEngineStrikeFx.update(nowMs);
    worldEngineShakeFx.update(nowMs);
    imperialExchangeLevyFx.update(nowMs);
    astralDockLaunchFx.update(nowMs);
    aegisLockFx.update(nowMs); unsettleFx.update(nowMs); borderDustFx.update(nowMs);
    floatingText.update(nowMs);
    attackOverlay.tick(Date.now()); // epoch ms: pulses off server resolvesAt, not uptime — see client-map-3d-attack-overlay.ts
    settleOverlay.tick(nowMs);
    waterSurface.tick(nowMs);
    for (const overlay of allBadgeOverlays) overlay.tick(nowMs);
    observatoryCooldownBadgeOverlay.tick(nowMs);
    upgradeReadyBadgeOverlay.tick(nowMs);
    musterOverlay.tick(nowMs);
    syncBattleOverlayFx(deps.state, deps.keyFor, heightfield, deps.effectiveOverlayColor, battleOverlayFx, nowMs, sceneOrigin.camX, sceneOrigin.camY);
    supplyLineOverlay.tick(nowMs); dockRouteOverlay.tick(nowMs);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(renderLoop);
  };

  // state here is sceneOrigin, not deps.state: the camera is positioned relative to
  // sceneOrigin (applyCamera's offsetX/offsetZ), and every overlay places itself off
  // sceneOrigin too (see the toroidDelta(sceneOrigin.camX/camY, ...) calls above) — so
  // a raycast against the live camera has to resolve tile identity the same way, or a
  // fixed screen point would appear to pick a different tile than what's drawn there.
  const { worldTileRawFromPointer, worldToScreen } = createPointerPick({
    camera,
    canvas: deps.canvas,
    state: sceneOrigin,
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT
  });

  const stop = (): void => {
    if (rafId !== undefined) cancelAnimationFrame(rafId);
    contextGuard.dispose();
    renderer.dispose();
    ownershipOverlay.dispose();
    fogDarkenOverlay.dispose();
    fogOwnershipOverlay.dispose();
    selectedMarker.geometry.dispose();
    hoverMarker.geometry.dispose();
    (selectedMarker.material as LineBasicMaterial).dispose();
    (hoverMarker.material as LineBasicMaterial).dispose();
    selectionRangeOverlays.dispose();
    crystalTargetingOverlay.dispose();
    for (const { marker, material } of townSupportMarkers) {
      marker.geometry.dispose();
      material.dispose();
    }
    for (const { marker, material } of queuedActionMarkers) {
      marker.geometry.dispose();
      material.dispose();
    }
    for (const { marker, material } of queuedSettlementMarkers) {
      marker.geometry.dispose();
      material.dispose();
    }
    for (const { marker, material } of queuedBuildMarkers) {
      marker.geometry.dispose();
      material.dispose();
    }
    for (const { marker, material } of waypointPathMarkers) {
      marker.geometry.dispose();
      material.dispose();
    }
    for (const flag of waypointFlags) flag.dispose();
    frontierClaimPlateGeometry.dispose();
    frontierClaimPlateMaterial.dispose();
    townOverlay.dispose();
    roadOverlay.dispose();
    reachOverlay3D.dispose();
    for (const overlay of allBadgeOverlays) overlay.dispose();
    observatoryCooldownBadgeOverlay.dispose();
    upgradeReadyBadgeOverlay.dispose();
    musterOverlay.dispose();
    battleOverlayFx.dispose();
    supplyLineOverlay.dispose();
    aetherBridgePylonOverlay.dispose();
    aetherLanceFx.dispose();
    surveySweepFx.dispose();
    surveySweepPingOverlay.dispose(); onboardingChecklistHighlightOverlay.dispose();
    siphonFx.dispose();
    retortRecastFx.dispose();
    revealEmpireFx.dispose();
    revealEmpireStatsFx.dispose();
    bombardFx.dispose();
    worldEngineStrikeFx.dispose();
    imperialExchangeLevyFx.dispose();
    astralDockLaunchFx.dispose();
    aegisLockFx.dispose(); unsettleFx.dispose(); borderDustFx.dispose();
    dockOverlay.dispose(); dockRouteOverlay.dispose();
    barbarianOverlay.dispose();
    shardOverlay.dispose(); watchtowerOverlay.dispose(); naturalWonderOverlays.dispose();
    fortOverlay.dispose(); relayBeaconOverlay.dispose(); tradeNexusOverlay.dispose();
    resourceOverlay.dispose(); barleyFieldOverlay.dispose(); titaniumDepositOverlay.dispose(); umbriteDepositOverlay.dispose(); umbriteExtractionRigOverlay.dispose(); umbriteWeaponsFactoryOverlay.dispose();
    attackOverlay.dispose();
    settleOverlay.dispose();
    structureOverlay.dispose();
    aetherTowerOverlay.dispose();
    contactShadowOverlay.dispose();
    defensibilityOverlay.dispose();
    forest.dispose();
    villageEffects.dispose();
    floatingText.dispose();
    townSupportCoins.dispose();
    waterSurface.dispose();
    riverOverlay.dispose();
    mountainMassifs.dispose();
    hillTerrain.dispose();
    heightfield.dispose();
    atmosphere.dispose();
    glCanvas.remove();
    delete deps.canvas.dataset.renderer;
  };

  resize();
  rafId = requestAnimationFrame(renderLoop);

  // worldToScreen/worldTileRawFromPointer are also called from client-runtime-loop.ts's
  // OWN requestAnimationFrame loop (the 2D canvas HUD that draws resource/dock/anchor
  // icons on top of the 3D view, wired via client-bootstrap.ts's projectedWorldToScreen).
  // That's a second, independent rAF chain from this module's renderLoop -- browsers run
  // rAF callbacks in registration order within a frame, so the HUD's callback can run
  // BEFORE this module's renderLoop has called applyCamera() for that frame, reading the
  // PREVIOUS frame's camera.position/matrixWorld. Before the camera moved every frame to
  // carry panning (offsetX/offsetZ from sceneOrigin), that staleness was invisible --
  // camera.position was otherwise constant between zoom/resize events. Now it visibly
  // lags the WebGL terrain by a frame during a pan. Refresh the camera synchronously
  // before every external read so correctness doesn't depend on rAF registration order.
  const freshWorldTileRawFromPointer: typeof worldTileRawFromPointer = (offsetX, offsetY) => {
    applyCamera();
    return worldTileRawFromPointer(offsetX, offsetY);
  };
  const freshWorldToScreen: typeof worldToScreen = (wx, wy) => {
    applyCamera();
    return worldToScreen(wx, wy);
  };

  return {
    resize,
    stop,
    worldTileRawFromPointer: freshWorldTileRawFromPointer,
    worldToScreen: freshWorldToScreen,
    // See client-renderer-crash-breadcrumb.ts recordRendererGpuStats: the only
    // real allocation data available for a device we can't reach directly.
    gpuStats: () => ({
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? 0
    })
  };
};
