import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
  WebGLRenderer
} from "three";
import { WORLD_HEIGHT, WORLD_WIDTH, landBiomeAt, MUSTER_ATTACK_COST } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileVisibilityState } from "../client-types.js";
import { isForestTile } from "../client-constants.js";
import { OBSERVATORY_RANGE_MAX } from "@border-empires/shared";
import { ownObservatoryRange } from "../client-observatory-rules/client-observatory-rules.js";
import { applyPerspectiveCamera, createPerspectiveCamera } from "../client-map-3d-perspective-camera/client-map-3d-perspective-camera.js";
import { createAtmosphere } from "../client-map-3d-atmosphere.js";
import { createPointerPick, toroidDelta } from "../client-map-3d-pointer-pick.js";
import {
  createObservatoryRangeBorderGeometry,
  createObservatoryRangeFillGeometry,
  observatoryRangeBorderSegmentCount,
  observatoryRangeFillVertexCount,
  writeObservatoryRangeBorderGeometry,
  writeObservatoryRangeFillGeometry
} from "../client-map-3d-observatory-range/client-map-3d-observatory-range.js";
import { createHeightfield, type HeightfieldTerrainKind } from "../client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createMountainMassifs } from "../client-map-3d-mountain-massif.js";
import { createWaterSurface, WATER_SURFACE_Y } from "../client-map-3d-water-surface.js";
import { createVillageEffects } from "../client-map-3d-village-fx.js";
import { createFloatingTextLayer } from "../client-map-3d-floating-text/client-map-3d-floating-text.js";
import { createTownSupportCoinLayer, type TownSupportCoinEntry } from "../client-map-3d-town-support-coins.js";
import { createForest } from "../client-map-3d-forest.js";
import { createOwnershipOverlay, FRONTIER_OPACITY } from "../client-map-3d-ownership-overlay.js";
import { createTownOverlay, type TownTier } from "../client-map-3d-town-overlay.js";
import { createUnfedBadgeOverlay } from "../client-map-3d-unfed-badge-overlay/client-map-3d-unfed-badge-overlay.js";
import { createObservatoryCooldownBadgeOverlay } from "../client-map-3d-observatory-cooldown-badge-overlay/client-map-3d-observatory-cooldown-badge-overlay.js";
import { createMusterOverlay } from "../client-map-3d-muster-overlay.js";
import { createMusterCombatFx } from "../client-map-3d-muster-combat-fx.js";
import { syncCaptureOverlays } from "../client-map-3d-capture-overlays.js";
import { createSupplyLineOverlay } from "../client-map-3d-supply-line-overlay.js";
import { createAetherBridgePylonOverlay } from "../client-map-3d-aether-bridge-pylon-overlay.js";
import { createAetherPurgeFxLayer } from "../client-map-3d-aether-purge-fx/client-map-3d-aether-purge-fx.js";
import { createSurveySweepFxLayer } from "../client-map-3d-survey-sweep-fx/client-map-3d-survey-sweep-fx.js";
import { createSurveySweepPingOverlay } from "../client-map-3d-survey-sweep-ping-overlay.js";
import { createSiphonFxLayer } from "../client-map-3d-siphon-fx/client-map-3d-siphon-fx.js";
import { createRetortRecastFxLayer } from "../client-map-3d-retort-recast-fx/client-map-3d-retort-recast-fx.js";
import { createRevealEmpireFxLayer } from "../client-map-3d-reveal-empire-fx/client-map-3d-reveal-empire-fx.js";
import { createRevealEmpireStatsFxLayer } from "../client-map-3d-reveal-empire-stats-fx/client-map-3d-reveal-empire-stats-fx.js";
import { shouldShowTownSmoke, shouldShowTownUnfedWarning } from "../client-town-growth/client-town-growth.js";
import { createDockOverlay } from "../client-map-3d-dock-overlay.js";
import { createBarbarianOverlay } from "../client-map-3d-barbarian-overlay.js";
import { createShardOverlay } from "../client-map-3d-shard-overlay.js";
import { createFortOverlay } from "../client-map-3d-fort-overlay.js";
import { createResourceOverlay, type ResourceKind } from "../client-map-3d-resource-overlay.js";
import { createAttackOverlay } from "../client-map-3d-attack-overlay.js";
import { createSettleOverlay } from "../client-map-3d-settle-overlay/client-map-3d-settle-overlay.js";
import {
  createStructureOverlay,
  STRUCTURE_KINDS_HANDLED_BY_3D,
  type StructureKind
} from "../client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import { resourceFor3DPopulation } from "../client-map-3d-population/client-map-3d-population.js";
import { createRoadOverlay } from "../client-map-3d-road-overlay/client-map-3d-road-overlay.js";
import { createDefensibilityOverlay } from "../client-map-3d-defensibility-overlay.js";
import { exposedSidesForTile, isOwnedSettledLandTile, weakDefensibilitySeverity } from "../client-defensibility-tile.js";
import { buildRoadNetwork } from "../client-road-network/client-road-network.js";
import { revealWholeMapInTrue3DMode } from "../client-renderer-mode.js";
import {
  fortificationOpeningForTile,
  fortificationOverlayKindForTile,
  type FortificationOpening,
  type FortificationOverlayKind
} from "../client-fortification-overlays/client-fortification-overlays.js";
import { normalizeColorForThree } from "../client-three-color/client-three-color.js";

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
};

const MAX_VISIBLE_TILES = 14000;
const MAX_BRIDGE_PYLONS = 16;
const TILE_CENTER_OFFSET = 0.5;
const OWNERSHIP_RISE_ABOVE_HEIGHTFIELD = 0.022;
const MARKER_RISE_ABOVE_HEIGHTFIELD = 0.012;
const OVERLAY_RISE_ABOVE_HEIGHTFIELD = 0.012;

export const createClientThreeTerrainRenderer = (deps: ClientThreeTerrainRendererDeps) => {
  const glCanvas = document.createElement("canvas");
  glCanvas.id = "game-3d";
  deps.canvas.dataset.renderer = "3d";
  const parent = deps.canvas.parentElement;
  if (!parent) throw new Error("missing game canvas parent for 3d renderer");
  parent.insertBefore(glCanvas, deps.canvas);

  const renderer = new WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);

  const scene = new Scene();
  const atmosphere = createAtmosphere(scene);
  const camera = createPerspectiveCamera(deps.canvas);
  const heightfield = createHeightfield();
  scene.add(heightfield.mesh);
  scene.add(heightfield.gridlines);
  heightfield.setGridlinesVisible(true);
  const mountainMassifs = createMountainMassifs(scene, MAX_VISIBLE_TILES);
  const waterSurface = createWaterSurface(scene, MAX_VISIBLE_TILES);
  const villageEffects = createVillageEffects(scene);
  const floatingText = createFloatingTextLayer(scene);
  const townSupportCoins = createTownSupportCoinLayer(scene);
  // Per-tile last-seen captureShockUntil. Used to detect newly-shocked towns
  // (capture event) so the floating "-pop" indicator fires once per capture.
  const lastSeenCaptureShockByTile = new Map<string, number>();
  const forest = createForest(scene, MAX_VISIBLE_TILES);
  const ownershipOverlay = createOwnershipOverlay(scene, MAX_VISIBLE_TILES);
  const townOverlay = createTownOverlay(scene, MAX_VISIBLE_TILES);
  const roadOverlay = createRoadOverlay(scene);
  const unfedBadgeOverlay = createUnfedBadgeOverlay(scene, MAX_VISIBLE_TILES);
  const observatoryCooldownBadgeOverlay = createObservatoryCooldownBadgeOverlay(scene, MAX_VISIBLE_TILES);
  const musterOverlay = createMusterOverlay(scene);
  const musterCombatFx = createMusterCombatFx(scene);
  const supplyLineOverlay = createSupplyLineOverlay(scene);
  const aetherBridgePylonOverlay = createAetherBridgePylonOverlay(scene, MAX_BRIDGE_PYLONS);
  const aetherLanceFx = createAetherPurgeFxLayer(scene);
  const surveySweepFx = createSurveySweepFxLayer(scene);
  const surveySweepPingOverlay = createSurveySweepPingOverlay(scene);
  const siphonFx = createSiphonFxLayer(scene);
  const retortRecastFx = createRetortRecastFxLayer(scene);
  const revealEmpireFx = createRevealEmpireFxLayer(scene);
  const revealEmpireStatsFx = createRevealEmpireStatsFxLayer(scene);
  const dockOverlay = createDockOverlay(scene, MAX_VISIBLE_TILES);
  const barbarianOverlay = createBarbarianOverlay(scene, MAX_VISIBLE_TILES);
  const shardOverlay = createShardOverlay(scene, MAX_VISIBLE_TILES);
  const fortOverlay = createFortOverlay(scene, MAX_VISIBLE_TILES);
  const resourceOverlay = createResourceOverlay(scene, MAX_VISIBLE_TILES);
  const attackOverlay = createAttackOverlay(scene, MAX_VISIBLE_TILES);
  const settleOverlay = createSettleOverlay(scene, MAX_VISIBLE_TILES);
  const structureOverlay = createStructureOverlay(scene, MAX_VISIBLE_TILES);
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
    wy: number
  ): TownTier | undefined => {
    if (!townDemoEnabled) return undefined;
    if (wy !== deps.state.camY) return undefined;
    const dx = wx - deps.state.camX;
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
    "LIGHT_OUTPOST",
    "SIEGE_OUTPOST"
  ];
  const FORT_DEMO_SPACING = 2;
  // Row 1 at camY+2: 4 kinds spaced 2 tiles apart (no wall sharing).
  // Row 2 at camY+5: a pair of FORTs touching at (camX, camY+5) and
  //                  (camX+1, camY+5) so the wall-sharing rule kicks in
  //                  — the left fort opens E, the right opens W.
  const fortDemoSpec = (
    wx: number,
    wy: number
  ): { kind: FortificationOverlayKind; opening: FortificationOpening } | undefined => {
    if (!fortDemoEnabled) return undefined;
    if (wy === deps.state.camY + 2) {
      const dx = wx - deps.state.camX;
      if (dx < 0) return undefined;
      if (dx % FORT_DEMO_SPACING !== 0) return undefined;
      const idx = dx / FORT_DEMO_SPACING;
      if (idx >= FORT_DEMO_KINDS.length) return undefined;
      const kind = FORT_DEMO_KINDS[idx];
      if (!kind) return undefined;
      return { kind, opening: "CLOSED" };
    }
    if (wy === deps.state.camY + 5) {
      const dx = wx - deps.state.camX;
      if (dx === 0) return { kind: "FORT", opening: "EAST" };
      if (dx === 1) return { kind: "FORT", opening: "WEST" };
    }
    return undefined;
  };

  // Visual-only demo: ?structuredemo=1 fakes a row of structures two
  // tiles north of the camera so you can eyeball each mesh side-by-side
  // without building them in-game. The MINE appears twice — once with
  // an IRON load and once with a GEMS load — so the resource-aware
  // mine variant is visible. Spaced one tile apart.
  const structureDemoEnabled =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("structuredemo") === "1";
  type StructureDemoEntry = { kind: StructureKind; resource?: "IRON" | "GEMS" };
  const STRUCTURE_DEMO_ENTRIES: ReadonlyArray<StructureDemoEntry> = [
    { kind: "FARMSTEAD" },
    { kind: "WATERWORKS" },
    { kind: "CAMP" },
    { kind: "MINE", resource: "IRON" },
    { kind: "MINE", resource: "GEMS" },
    { kind: "IRONWORKS" },
    { kind: "MARKET" },
    { kind: "OBSERVATORY" },
    { kind: "GRANARY" },
    { kind: "SEED_GRANARY" }
  ];
  const structureDemoEntryFor = (wx: number, wy: number): StructureDemoEntry | undefined => {
    if (!structureDemoEnabled) return undefined;
    if (wy !== deps.state.camY - 2) return undefined;
    const dx = wx - deps.state.camX;
    if (dx < 0 || dx >= STRUCTURE_DEMO_ENTRIES.length) return undefined;
    return STRUCTURE_DEMO_ENTRIES[dx];
  };

  // A bending tile-outline marker: 4 line segments connecting the four
  // tile corners with each corner's actual rendered Y, so the outline
  // bows along with the heightfield surface instead of floating as a
  // flat square. Each marker mesh owns its own BufferGeometry so we can
  // animate its 4 corners independently per frame.
  const createBendingMarkerGeometry = (): BufferGeometry => {
    const geom = new BufferGeometry();
    // 4 line segments × 2 endpoints × 3 floats = 24 floats.
    const positions = new Float32Array(24);
    geom.setAttribute("position", new BufferAttribute(positions, 3));
    return geom;
  };
  const writeBendingMarkerCorners = (
    geom: BufferGeometry,
    cx: number,
    cy: number,
    cz: number,
    cornerY00: number,
    cornerY10: number,
    cornerY01: number,
    cornerY11: number,
    rise: number
  ): void => {
    const positionAttr = geom.getAttribute("position") as BufferAttribute;
    const positions = positionAttr.array as Float32Array;
    const x0 = cx - 0.48;
    const x1 = cx + 0.48;
    const z0 = cz - 0.48;
    const z1 = cz + 0.48;
    const y00 = cy + cornerY00 + rise;
    const y10 = cy + cornerY10 + rise;
    const y01 = cy + cornerY01 + rise;
    const y11 = cy + cornerY11 + rise;
    // NW → NE
    positions[0] = x0; positions[1] = y00; positions[2] = z0;
    positions[3] = x1; positions[4] = y10; positions[5] = z0;
    // NE → SE
    positions[6] = x1; positions[7] = y10; positions[8] = z0;
    positions[9] = x1; positions[10] = y11; positions[11] = z1;
    // SE → SW
    positions[12] = x1; positions[13] = y11; positions[14] = z1;
    positions[15] = x0; positions[16] = y01; positions[17] = z1;
    // SW → NW
    positions[18] = x0; positions[19] = y01; positions[20] = z0;
    positions[21] = x0; positions[22] = y00; positions[23] = z0;
    positionAttr.needsUpdate = true;
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
  // The waypoint flag is a full steampunk tower: octagonal glow base,
  // wide brass pedestal with two side cannons, a banner-bearing trunk,
  // a winged gear medallion, a brass dome, and a spire — anchored to
  // the destination tile and tinted by the player's empire color.
  const BRASS_HI = "#d2a76a";
  const BRASS_LO = "#8b6f47";
  const COPPER = "#a85d36";
  const waypointFlagGroup = new Group();
  // Octagonal hex glow ring at the base (the bright empire-colored
  // outline that frames the tile in the reference image).
  const waypointBaseHexMaterial = new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, depthTest: false, depthWrite: false });
  const waypointBaseHex = new Mesh(new TorusGeometry(0.55, 0.04, 4, 8), waypointBaseHexMaterial);
  waypointBaseHex.rotation.x = Math.PI / 2;
  waypointBaseHex.rotation.z = Math.PI / 8;
  waypointBaseHex.position.y = 0.01;
  // Wide octagonal brass pedestal sitting just inside the hex glow.
  const waypointPedestalMaterial = new MeshBasicMaterial({ color: BRASS_LO, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false });
  const waypointPedestal = new Mesh(new CylinderGeometry(0.42, 0.46, 0.16, 8), waypointPedestalMaterial);
  waypointPedestal.position.y = 0.1;
  // Inset glow ring on the pedestal's upper face — empire color, picks
  // up the "energy core" feel from the reference image.
  const waypointPedestalGlowMaterial = new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, depthTest: false, depthWrite: false });
  const waypointPedestalGlow = new Mesh(new TorusGeometry(0.28, 0.03, 4, 16), waypointPedestalGlowMaterial);
  waypointPedestalGlow.rotation.x = Math.PI / 2;
  waypointPedestalGlow.position.y = 0.19;
  // Side cannons (two stubby copper barrels sticking out from the
  // pedestal collar — the iconic "this is a war engine" silhouette).
  const waypointCannonMaterial = new MeshBasicMaterial({ color: COPPER, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false });
  const waypointCannonLeft = new Mesh(new CylinderGeometry(0.04, 0.05, 0.32, 10), waypointCannonMaterial);
  waypointCannonLeft.rotation.z = Math.PI / 2;
  waypointCannonLeft.position.set(-0.4, 0.24, 0);
  const waypointCannonRight = new Mesh(new CylinderGeometry(0.04, 0.05, 0.32, 10), waypointCannonMaterial);
  waypointCannonRight.rotation.z = Math.PI / 2;
  waypointCannonRight.position.set(0.4, 0.24, 0);
  // Main tower trunk — wider than a flagpole, brass-segmented feel
  // achieved by stacking a band ring midway up.
  const waypointTowerMaterial = new MeshBasicMaterial({ color: BRASS_HI, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false });
  const waypointTowerTrunk = new Mesh(new CylinderGeometry(0.075, 0.1, 1.1, 12), waypointTowerMaterial);
  waypointTowerTrunk.position.y = 0.75;
  const waypointTowerBandMaterial = new MeshBasicMaterial({ color: COPPER, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const waypointTowerBandLow = new Mesh(new CylinderGeometry(0.105, 0.105, 0.04, 12), waypointTowerBandMaterial);
  waypointTowerBandLow.position.y = 0.4;
  const waypointTowerBandHi = new Mesh(new CylinderGeometry(0.085, 0.085, 0.04, 12), waypointTowerBandMaterial);
  waypointTowerBandHi.position.y = 1.05;
  // Horizontal crossarm the banner hangs from, with knob caps at each end.
  const waypointBannerArm = new Mesh(new CylinderGeometry(0.025, 0.025, 0.5, 8), waypointTowerMaterial);
  waypointBannerArm.rotation.z = Math.PI / 2;
  waypointBannerArm.position.y = 0.7;
  const waypointBannerArmCapL = new Mesh(new SphereGeometry(0.04, 8, 6), waypointTowerMaterial);
  waypointBannerArmCapL.position.set(-0.25, 0.7, 0);
  const waypointBannerArmCapR = new Mesh(new SphereGeometry(0.04, 8, 6), waypointTowerMaterial);
  waypointBannerArmCapR.position.set(0.25, 0.7, 0);
  // The banner itself: vertical empire-color plane hanging down from
  // the crossarm with a darker copper trim plane behind it for depth.
  const waypointBannerBackingMaterial = new MeshBasicMaterial({ color: COPPER, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, side: DoubleSide });
  const waypointBannerBacking = new Mesh(new PlaneGeometry(0.42, 0.7), waypointBannerBackingMaterial);
  waypointBannerBacking.position.set(0, 0.36, -0.005);
  const waypointBannerMaterial = new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.97, depthTest: false, depthWrite: false, side: DoubleSide });
  const waypointBanner = new Mesh(new PlaneGeometry(0.36, 0.62), waypointBannerMaterial);
  waypointBanner.position.set(0, 0.38, 0);
  // Emblem disc centered on the banner — a darker plate inside a
  // thin brass ring, evoking the gear-with-wings crest.
  const waypointBannerEmblemPlateMaterial = new MeshBasicMaterial({ color: BRASS_LO, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const waypointBannerEmblemPlate = new Mesh(new CylinderGeometry(0.1, 0.1, 0.005, 16), waypointBannerEmblemPlateMaterial);
  waypointBannerEmblemPlate.rotation.x = Math.PI / 2;
  waypointBannerEmblemPlate.position.set(0, 0.4, 0.01);
  const waypointBannerEmblemRingMaterial = new MeshBasicMaterial({ color: BRASS_HI, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false });
  const waypointBannerEmblemRing = new Mesh(new TorusGeometry(0.1, 0.012, 6, 16), waypointBannerEmblemRingMaterial);
  waypointBannerEmblemRing.position.set(0, 0.4, 0.015);
  // Winged gear medallion crowning the tower.
  const waypointMedallionFrameMaterial = new MeshBasicMaterial({ color: BRASS_HI, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false });
  const waypointMedallionFrame = new Mesh(new TorusGeometry(0.22, 0.025, 8, 24), waypointMedallionFrameMaterial);
  waypointMedallionFrame.position.y = 1.35;
  const waypointMedallionFaceMaterial = new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
  const waypointMedallionFace = new Mesh(new CylinderGeometry(0.2, 0.2, 0.025, 18), waypointMedallionFaceMaterial);
  waypointMedallionFace.rotation.x = Math.PI / 2;
  waypointMedallionFace.position.y = 1.35;
  // Wings flanking the medallion — elongated cones laid flat. The
  // pointy end faces outward so they read as swept-back wings.
  const waypointWingMaterial = new MeshBasicMaterial({ color: BRASS_HI, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const waypointWingLeft = new Mesh(new ConeGeometry(0.06, 0.3, 5), waypointWingMaterial);
  waypointWingLeft.rotation.z = Math.PI / 2;
  waypointWingLeft.position.set(-0.36, 1.35, 0);
  const waypointWingRight = new Mesh(new ConeGeometry(0.06, 0.3, 5), waypointWingMaterial);
  waypointWingRight.rotation.z = -Math.PI / 2;
  waypointWingRight.position.set(0.36, 1.35, 0);
  // Domed brass cap above the medallion.
  const waypointDomeMaterial = new MeshBasicMaterial({ color: BRASS_HI, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false });
  const waypointDome = new Mesh(new SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), waypointDomeMaterial);
  waypointDome.position.y = 1.5;
  // Slim spire crowning the dome.
  const waypointSpireMaterial = new MeshBasicMaterial({ color: BRASS_HI, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false });
  const waypointSpire = new Mesh(new ConeGeometry(0.025, 0.22, 8), waypointSpireMaterial);
  waypointSpire.position.y = 1.72;
  // Two purple smoke wisps drifting up from the pedestal collar near
  // the cannons. Vertical planes with low opacity, swayed by the bob
  // animation so they feel alive.
  const waypointSmokeMaterial = new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.18, depthTest: false, depthWrite: false, side: DoubleSide });
  const waypointSmokeLeft = new Mesh(new PlaneGeometry(0.12, 0.5), waypointSmokeMaterial);
  waypointSmokeLeft.position.set(-0.28, 0.5, 0);
  const waypointSmokeRight = new Mesh(new PlaneGeometry(0.12, 0.5), waypointSmokeMaterial);
  waypointSmokeRight.position.set(0.28, 0.5, 0);
  waypointFlagGroup.add(
    waypointBaseHex,
    waypointPedestal,
    waypointPedestalGlow,
    waypointCannonLeft,
    waypointCannonRight,
    waypointSmokeLeft,
    waypointSmokeRight,
    waypointTowerTrunk,
    waypointTowerBandLow,
    waypointTowerBandHi,
    waypointBannerArm,
    waypointBannerArmCapL,
    waypointBannerArmCapR,
    waypointBannerBacking,
    waypointBanner,
    waypointBannerEmblemPlate,
    waypointBannerEmblemRing,
    waypointMedallionFrame,
    waypointMedallionFace,
    waypointWingLeft,
    waypointWingRight,
    waypointDome,
    waypointSpire
  );
  waypointFlagGroup.visible = false;
  // Frontier-claim fill: a single empire-color plate that ramps in
  // opacity over the claim duration, used when state.capture.silent is
  // set (waypoint-driven neutral EXPAND). Replaces the big "Capturing
  // Territory..." overlay for that flow — the player sees the target
  // tile filling in with their color instead.
  const frontierClaimPlateGeometry = new PlaneGeometry(0.94, 0.94);
  frontierClaimPlateGeometry.rotateX(-Math.PI * 0.5);
  const frontierClaimPlateMaterial = new MeshBasicMaterial({
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
  const observatoryRangeMaxSegments = observatoryRangeBorderSegmentCount(OBSERVATORY_RANGE_MAX);
  const observatoryRangeMaxFillVertices = observatoryRangeFillVertexCount(OBSERVATORY_RANGE_MAX);
  const SWEEP_RANGE_RADIUS = 5;
  const MUSTER_REACH_RADIUS = 5; // 4 hops to origin + 1 hop to target
  const sweepRangeMaxSegments = observatoryRangeBorderSegmentCount(SWEEP_RANGE_RADIUS);
  const sweepRangeMaxFillVertices = observatoryRangeFillVertexCount(SWEEP_RANGE_RADIUS);
  const observatoryRangeMaterial = new LineBasicMaterial({
    color: "#6ab4ff",
    transparent: true,
    opacity: 0.35,
    depthTest: false,
    depthWrite: false
  });
  const observatoryRangeFillMaterial = new MeshBasicMaterial({
    color: "#6ab4ff",
    transparent: true,
    opacity: 0.02,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide
  });
  const observatoryRangeMarker = new LineSegments(
    createObservatoryRangeBorderGeometry(observatoryRangeMaxSegments),
    observatoryRangeMaterial
  );
  const observatoryRangeFill = new Mesh(
    createObservatoryRangeFillGeometry(observatoryRangeMaxFillVertices),
    observatoryRangeFillMaterial
  );
  const sweepRangeMaterial = new LineBasicMaterial({
    color: "#ff8c42",
    transparent: true,
    opacity: 0.7,
    depthTest: false,
    depthWrite: false
  });
  const sweepRangeFillMaterial = new MeshBasicMaterial({
    color: "#ff8c42",
    transparent: true,
    opacity: 0.04,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide
  });
  const sweepRangeMarker = new LineSegments(
    createObservatoryRangeBorderGeometry(sweepRangeMaxSegments),
    sweepRangeMaterial
  );
  const sweepRangeFill = new Mesh(
    createObservatoryRangeFillGeometry(sweepRangeMaxFillVertices),
    sweepRangeFillMaterial
  );
  const musterReachMaterial = new LineBasicMaterial({
    color: "#e05252",
    transparent: true,
    opacity: 0.55,
    depthTest: false,
    depthWrite: false
  });
  const musterReachFillMaterial = new MeshBasicMaterial({
    color: "#e05252",
    transparent: true,
    opacity: 0.03,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide
  });
  const musterReachMarker = new LineSegments(
    createObservatoryRangeBorderGeometry(sweepRangeMaxSegments),
    musterReachMaterial
  );
  const musterReachFill = new Mesh(
    createObservatoryRangeFillGeometry(sweepRangeMaxFillVertices),
    musterReachFillMaterial
  );
  selectedMarker.visible = false;
  hoverMarker.visible = false;
  observatoryRangeMarker.visible = false;
  observatoryRangeFill.visible = false;
  sweepRangeMarker.visible = false;
  sweepRangeFill.visible = false;
  musterReachMarker.visible = false;
  musterReachFill.visible = false;
  selectedMarker.renderOrder = 30;
  hoverMarker.renderOrder = 31;
  observatoryRangeMarker.renderOrder = 26;
  observatoryRangeFill.renderOrder = 24;
  sweepRangeMarker.renderOrder = 23;
  sweepRangeFill.renderOrder = 22;
  musterReachMarker.renderOrder = 21;
  musterReachFill.renderOrder = 20;
  for (const { marker } of townSupportMarkers) marker.renderOrder = 28;
  for (const { marker } of queuedActionMarkers) marker.renderOrder = 29;
  for (const { marker } of queuedSettlementMarkers) marker.renderOrder = 29;
  for (const { marker } of queuedBuildMarkers) marker.renderOrder = 29;
  for (const { marker } of waypointPathMarkers) marker.renderOrder = 29;
  waypointBaseHex.renderOrder = 30;
  waypointPedestal.renderOrder = 31;
  waypointPedestalGlow.renderOrder = 31;
  waypointCannonLeft.renderOrder = 31;
  waypointCannonRight.renderOrder = 31;
  waypointSmokeLeft.renderOrder = 30;
  waypointSmokeRight.renderOrder = 30;
  waypointTowerTrunk.renderOrder = 32;
  waypointTowerBandLow.renderOrder = 32;
  waypointTowerBandHi.renderOrder = 32;
  waypointBannerArm.renderOrder = 32;
  waypointBannerArmCapL.renderOrder = 32;
  waypointBannerArmCapR.renderOrder = 32;
  waypointBannerBacking.renderOrder = 32;
  waypointBanner.renderOrder = 33;
  waypointBannerEmblemPlate.renderOrder = 34;
  waypointBannerEmblemRing.renderOrder = 35;
  waypointMedallionFrame.renderOrder = 34;
  waypointMedallionFace.renderOrder = 33;
  waypointWingLeft.renderOrder = 33;
  waypointWingRight.renderOrder = 33;
  waypointDome.renderOrder = 34;
  waypointSpire.renderOrder = 35;
  frontierClaimPlate.renderOrder = 7;
  selectedMarker.frustumCulled = false;
  hoverMarker.frustumCulled = false;
  observatoryRangeMarker.frustumCulled = false;
  observatoryRangeFill.frustumCulled = false;
  sweepRangeMarker.frustumCulled = false;
  sweepRangeFill.frustumCulled = false;
  musterReachMarker.frustumCulled = false;
  musterReachFill.frustumCulled = false;
  for (const { marker } of townSupportMarkers) marker.frustumCulled = false;
  for (const { marker } of queuedActionMarkers) marker.frustumCulled = false;
  for (const { marker } of queuedSettlementMarkers) marker.frustumCulled = false;
  for (const { marker } of queuedBuildMarkers) marker.frustumCulled = false;
  for (const { marker } of waypointPathMarkers) marker.frustumCulled = false;
  waypointFlagGroup.frustumCulled = false;
  for (const child of waypointFlagGroup.children) child.frustumCulled = false;

  scene.add(
    selectedMarker,
    hoverMarker,
    musterReachFill,
    musterReachMarker,
    sweepRangeFill,
    sweepRangeMarker,
    observatoryRangeFill,
    observatoryRangeMarker,
    ...townSupportMarkers.map(({ marker }) => marker),
    ...queuedActionMarkers.map(({ marker }) => marker),
    ...queuedSettlementMarkers.map(({ marker }) => marker),
    ...queuedBuildMarkers.map(({ marker }) => marker),
    ...waypointPathMarkers.map(({ marker }) => marker),
    waypointFlagGroup,
    frontierClaimPlate
  );

  const lastUpdate = { camX: Number.NaN, camY: Number.NaN, zoom: Number.NaN, width: 0, height: 0, at: 0, tilesRevision: -1 };
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
  const heightfieldKindAt = (wx: number, wy: number): HeightfieldTerrainKind => {
    const terrain = terrainForWorldTile(wx, wy);
    if (terrain === "SEA" || terrain === "COASTAL_SEA") {
      if (terrain === "COASTAL_SEA") return "COASTAL_SEA";
      return "SEA";
    }
    if (terrain === "MOUNTAIN") return "MOUNTAIN";
    if (isSandTile(wx, wy)) return "SAND";
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
    const dx = toroidDelta(deps.state.camX, tile.x, WORLD_WIDTH);
    const dy = toroidDelta(deps.state.camY, tile.y, WORLD_HEIGHT);
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
        const sx = toroidDelta(deps.state.camX, wx, WORLD_WIDTH);
        const sy = toroidDelta(deps.state.camY, wy, WORLD_HEIGHT);
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
        const sx = toroidDelta(deps.state.camX, wx, WORLD_WIDTH);
        const sy = toroidDelta(deps.state.camY, wy, WORLD_HEIGHT);
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
  const parseTileKey = (tileKey: string): { x: number; y: number } | undefined => {
    const [xRaw, yRaw] = tileKey.split(",");
    const x = Number(xRaw);
    const y = Number(yRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    return { x, y };
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
      const dx = toroidDelta(deps.state.camX, tile.x, WORLD_WIDTH);
      const dy = toroidDelta(deps.state.camY, tile.y, WORLD_HEIGHT);
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
  // Lighten a hex color by mixing toward white. Used for the waypoint
  // flag so its empire-color outline pops against owned territory
  // rendered in the same hue at lower brightness.
  const lightenHex = (hex: string, amount: number): string => {
    const trimmed = hex.trim().replace(/^#/, "");
    let r: number;
    let g: number;
    let b: number;
    if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
      r = parseInt(trimmed[0]! + trimmed[0]!, 16);
      g = parseInt(trimmed[1]! + trimmed[1]!, 16);
      b = parseInt(trimmed[2]! + trimmed[2]!, 16);
    } else if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
      const value = parseInt(trimmed, 16);
      r = (value >> 16) & 0xff;
      g = (value >> 8) & 0xff;
      b = value & 0xff;
    } else {
      return hex;
    }
    const k = Math.max(0, Math.min(1, amount));
    const mix = (channel: number): number => Math.round(channel + (255 - channel) * k);
    return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  };
  const syncWaypointMarkers = (): void => {
    hideLineMarkerPool(waypointPathMarkers);
    waypointFlagGroup.visible = false;
    const waypoint = deps.state.waypoint;
    if (!waypoint) return;
    const blocked = !waypoint.plan.reachable;
    const HALT_COLOR = "#f59e0b";
    const empireColor = deps.state.playerColors.get(deps.state.me) ?? "#d5ecff";
    // Empire color drives the banner, the hex glow ring, the pedestal
    // energy ring, the smoke wisps, and the path-tile outlines. The
    // brass/copper mechanical bits stay metallic so the empire color
    // reads as the "energy" of the assembly rather than a paint job.
    const bannerColor = blocked ? HALT_COLOR : empireColor;
    const glowColor = blocked ? HALT_COLOR : lightenHex(empireColor, 0.45);
    const pathColor = blocked ? HALT_COLOR : empireColor;
    waypointBannerMaterial.color.set(bannerColor);
    waypointBaseHexMaterial.color.set(glowColor);
    waypointBaseHexMaterial.opacity = blocked ? 0.85 : 0.7;
    waypointPedestalGlowMaterial.color.set(glowColor);
    waypointPedestalGlowMaterial.opacity = blocked ? 0.95 : 0.8;
    waypointMedallionFaceMaterial.color.set(glowColor);
    waypointSmokeMaterial.color.set(glowColor);
    for (const { material } of waypointPathMarkers) {
      material.color.set(pathColor);
      material.opacity = 0.5;
    }
    const pathTiles: Array<{ x: number; y: number }> = [];
    for (const step of waypoint.plan.steps) {
      if (step.target.x === waypoint.target.x && step.target.y === waypoint.target.y) continue;
      pathTiles.push(step.target);
    }
    placeLineMarkers(waypointPathMarkers, pathTiles, MARKER_RISE_ABOVE_HEIGHTFIELD);
    // Anchor the flag group at the destination tile's world-space
    // center, lifted to sit on the bowed heightfield surface.
    const dx = toroidDelta(deps.state.camX, waypoint.target.x, WORLD_WIDTH);
    const dy = toroidDelta(deps.state.camY, waypoint.target.y, WORLD_HEIGHT);
    const wxNext = deps.wrapX(waypoint.target.x + 1);
    const wyNext = deps.wrapY(waypoint.target.y + 1);
    const cornerYAvg =
      (heightfield.cornerYAt(waypoint.target.x, waypoint.target.y) +
        heightfield.cornerYAt(wxNext, waypoint.target.y) +
        heightfield.cornerYAt(waypoint.target.x, wyNext) +
        heightfield.cornerYAt(wxNext, wyNext)) /
      4;
    waypointFlagGroup.position.set(dx + TILE_CENTER_OFFSET, cornerYAvg + MARKER_RISE_ABOVE_HEIGHTFIELD, dy + TILE_CENTER_OFFSET);
    // Animation: subtle structural bob, slow medallion + ring rotation
    // (one CW, one CCW so the mechanism reads as alive), banner ripple,
    // and a vertical drift on the smoke wisps with sinusoidal opacity.
    const t = performance.now() / 1000;
    waypointFlagGroup.position.y += Math.sin(t * 1.4) * 0.03;
    waypointBaseHex.rotation.z = Math.PI / 8 + t * 0.15;
    waypointPedestalGlow.rotation.z = -t * 0.25;
    waypointMedallionFrame.rotation.z = t * 0.35;
    waypointMedallionFace.rotation.z = -t * 0.5;
    waypointBanner.rotation.y = Math.sin(t * 2.0) * 0.12;
    waypointBannerBacking.rotation.y = waypointBanner.rotation.y;
    waypointBannerEmblemPlate.rotation.y = waypointBanner.rotation.y;
    waypointBannerEmblemRing.rotation.y = waypointBanner.rotation.y;
    const smokeBaseY = 0.5;
    const smokeWave = (Math.sin(t * 1.1) + 1) * 0.5;
    waypointSmokeLeft.position.y = smokeBaseY + smokeWave * 0.18;
    waypointSmokeRight.position.y = smokeBaseY + smokeWave * 0.18 + 0.06;
    waypointSmokeMaterial.opacity = blocked ? 0.1 : 0.12 + smokeWave * 0.1;
    waypointFlagGroup.visible = true;
  };
  const syncFrontierClaimPlate = (): void => {
    const capture = deps.state.capture;
    if (!capture || !capture.silent || capture.fromMusterAdvance) {
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
    const dxw = toroidDelta(deps.state.camX, capture.target.x, WORLD_WIDTH);
    const dyw = toroidDelta(deps.state.camY, capture.target.y, WORLD_HEIGHT);
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
  const syncAetherLanceFxQueue = (): void => {
    while (deps.state.aetherLanceFxQueue.length > 0) {
      const cast = deps.state.aetherLanceFxQueue.shift()!;
      const sceneX = toroidDelta(deps.state.camX, cast.x, WORLD_WIDTH) + TILE_CENTER_OFFSET;
      const sceneZ = toroidDelta(deps.state.camY, cast.y, WORLD_HEIGHT) + TILE_CENTER_OFFSET;
      aetherLanceFx.spawn(
        sceneX,
        sceneZ,
        aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD
      );
    }
  };
  const syncSurveySweepFxQueue = (): void => {
    while (deps.state.surveySweepFxQueue.length > 0) {
      const cast = deps.state.surveySweepFxQueue.shift()!;
      const sceneX = toroidDelta(deps.state.camX, cast.x, WORLD_WIDTH) + TILE_CENTER_OFFSET;
      const sceneZ = toroidDelta(deps.state.camY, cast.y, WORLD_HEIGHT) + TILE_CENTER_OFFSET;
      surveySweepFx.spawn(
        sceneX,
        sceneZ,
        aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD
      );
    }
  };
  const syncSurveySweepPings = (): void => {
    const wallNowMs = Date.now();
    surveySweepPingOverlay.beginFrame();
    deps.state.surveySweepPings = deps.state.surveySweepPings.filter((ping) => ping.expiresAt > wallNowMs);
    for (const ping of deps.state.surveySweepPings) {
      const sceneX = toroidDelta(deps.state.camX, ping.x, WORLD_WIDTH) + TILE_CENTER_OFFSET;
      const sceneZ = toroidDelta(deps.state.camY, ping.y, WORLD_HEIGHT) + TILE_CENTER_OFFSET;
      surveySweepPingOverlay.addPing(
        ping.kind,
        sceneX,
        sceneZ,
        aetherBridgeTileSurfaceY(ping.x, ping.y) + MARKER_RISE_ABOVE_HEIGHTFIELD,
        wallNowMs,
        ping.createdAt,
        ping.expiresAt
      );
    }
    surveySweepPingOverlay.commit();
  };
  const syncSiphonFxQueue = (): void => {
    while (deps.state.siphonFxQueue.length > 0) {
      const cast = deps.state.siphonFxQueue.shift()!;
      const sceneX = toroidDelta(deps.state.camX, cast.x, WORLD_WIDTH) + TILE_CENTER_OFFSET;
      const sceneZ = toroidDelta(deps.state.camY, cast.y, WORLD_HEIGHT) + TILE_CENTER_OFFSET;
      siphonFx.spawn(
        sceneX,
        sceneZ,
        aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD
      );
    }
  };
  const syncRetortRecastFxQueue = (): void => {
    while (deps.state.retortRecastFxQueue.length > 0) {
      const cast = deps.state.retortRecastFxQueue.shift()!;
      const sceneX = toroidDelta(deps.state.camX, cast.x, WORLD_WIDTH) + TILE_CENTER_OFFSET;
      const sceneZ = toroidDelta(deps.state.camY, cast.y, WORLD_HEIGHT) + TILE_CENTER_OFFSET;
      retortRecastFx.spawn(
        sceneX,
        sceneZ,
        aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD,
        cast.targetResource
      );
    }
  };
  const syncRevealEmpireFxQueue = (): void => {
    while (deps.state.revealEmpireFxQueue.length > 0) {
      const cast = deps.state.revealEmpireFxQueue.shift()!;
      const sceneX = toroidDelta(deps.state.camX, cast.x, WORLD_WIDTH) + TILE_CENTER_OFFSET;
      const sceneZ = toroidDelta(deps.state.camY, cast.y, WORLD_HEIGHT) + TILE_CENTER_OFFSET;
      revealEmpireFx.spawn(
        sceneX,
        sceneZ,
        aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD
      );
    }
  };
  const syncRevealEmpireStatsFxQueue = (): void => {
    while (deps.state.revealEmpireStatsFxQueue.length > 0) {
      const cast = deps.state.revealEmpireStatsFxQueue.shift()!;
      const sceneX = toroidDelta(deps.state.camX, cast.x, WORLD_WIDTH) + TILE_CENTER_OFFSET;
      const sceneZ = toroidDelta(deps.state.camY, cast.y, WORLD_HEIGHT) + TILE_CENTER_OFFSET;
      revealEmpireStatsFx.spawn(
        sceneX,
        sceneZ,
        aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD
      );
    }
  };
  const syncAetherBridgePylons = (nowMs: number): void => {
    aetherBridgePylonOverlay.beginFrame();
    const now = Date.now();
    for (const bridge of deps.state.activeAetherBridges) {
      if (bridge.endsAt <= now) continue;
      const fromX = toroidDelta(deps.state.camX, bridge.from.x, WORLD_WIDTH) + TILE_CENTER_OFFSET;
      const fromZ = toroidDelta(deps.state.camY, bridge.from.y, WORLD_HEIGHT) + TILE_CENTER_OFFSET;
      const toX = toroidDelta(deps.state.camX, bridge.to.x, WORLD_WIDTH) + TILE_CENTER_OFFSET;
      const toZ = toroidDelta(deps.state.camY, bridge.to.y, WORLD_HEIGHT) + TILE_CENTER_OFFSET;
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
  const writeObservatoryRangeGeometry = (
    lineMarker: LineSegments,
    fillMesh: Mesh,
    selectedTile: Tile,
    radius: number
  ): void => {
    const rangeGeometryInputs = {
      selectedX: selectedTile.x,
      selectedY: selectedTile.y,
      camX: deps.state.camX,
      camY: deps.state.camY,
      radius,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      wrapX: deps.wrapX,
      wrapY: deps.wrapY,
      cornerYAt: (cornerX: number, cornerZ: number) => heightfield.cornerYAt(cornerX, cornerZ),
      riseAboveSurface: MARKER_RISE_ABOVE_HEIGHTFIELD
    };
    writeObservatoryRangeBorderGeometry(lineMarker.geometry as BufferGeometry, rangeGeometryInputs);
    writeObservatoryRangeFillGeometry(fillMesh.geometry as BufferGeometry, rangeGeometryInputs);
    lineMarker.visible = true;
    fillMesh.visible = true;
  };
  const syncObservatoryRangeMarkers = (): void => {
    observatoryRangeMarker.visible = false;
    observatoryRangeFill.visible = false;
    const selectedCoord = deps.state.selected;
    if (!selectedCoord) return;
    const selectedTile = deps.state.tiles.get(deps.keyFor(selectedCoord.x, selectedCoord.y));
    if (!selectedTile?.observatory) return;
    if (deps.tileVisibilityStateAt(selectedTile.x, selectedTile.y, selectedTile) !== "visible") return;
    if (selectedTile.ownerId !== deps.state.me) return;
    if (selectedTile.observatory.status !== "active") return;
    const effectiveRange = ownObservatoryRange(deps.state);
    observatoryRangeMaterial.opacity = 0.35;
    observatoryRangeFillMaterial.opacity = 0.02;
    writeObservatoryRangeGeometry(observatoryRangeMarker, observatoryRangeFill, selectedTile, effectiveRange);
  };

  const syncSweepRangeMarker = (): void => {
    sweepRangeMarker.visible = false;
    sweepRangeFill.visible = false;
    const selectedCoord = deps.state.selected;
    if (!selectedCoord) return;
    const selectedTile = deps.state.tiles.get(deps.keyFor(selectedCoord.x, selectedCoord.y));
    if (!selectedTile?.siegeOutpost) return;
    if (selectedTile.siegeOutpost.status !== "active") return;
    if (selectedTile.ownerId !== deps.state.me) return;
    if (deps.tileVisibilityStateAt(selectedTile.x, selectedTile.y, selectedTile) !== "visible") return;
    writeObservatoryRangeGeometry(sweepRangeMarker, sweepRangeFill, selectedTile, SWEEP_RANGE_RADIUS);
  };

  const syncMusterReachMarker = (): void => {
    musterReachMarker.visible = false;
    musterReachFill.visible = false;
    const selectedCoord = deps.state.selected;
    if (!selectedCoord) return;
    const selectedTile = deps.state.tiles.get(deps.keyFor(selectedCoord.x, selectedCoord.y));
    if (!selectedTile?.muster) return;
    if (selectedTile.muster.ownerId !== deps.state.me) return;
    if (deps.tileVisibilityStateAt(selectedTile.x, selectedTile.y, selectedTile) !== "visible") return;
    writeObservatoryRangeGeometry(musterReachMarker, musterReachFill, selectedTile, MUSTER_REACH_RADIUS);
  };

  const applyCamera = (): void => {
    applyPerspectiveCamera(camera, {
      zoom: deps.state.zoom,
      canvasWidth: deps.canvas.width,
      canvasHeight: deps.canvas.height
    });
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
  const tmpWhite = new Color("#ffffff");
  const SETTLE_FALLBACK_COLOR = new Color("#ffd166");

  const rebuildVisibleTerrain = (): void => {
    const size = Math.max(1, deps.state.zoom);
    const halfW = Math.max(1, Math.floor(deps.canvas.width / size / 2));
    const halfH = Math.max(1, Math.floor(deps.canvas.height / size / 2));

    heightfield.mesh.position.set(0, 0, 0);
    const isExploredForHeightfield = (wx: number, wy: number): boolean => {
      if (revealWholeMapInTrue3DMode) return true;
      const tile = deps.state.tiles.get(deps.keyFor(wx, wy));
      return deps.tileVisibilityStateAt(wx, wy, tile) === "visible";
    };
    heightfield.rebuild({
      camX: deps.state.camX,
      camY: deps.state.camY,
      halfW,
      halfH,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      tileKindAt: heightfieldKindAt,
      isExploredAt: isExploredForHeightfield,
      isForestAt: isForestTile
    });

    mountainMassifs.clear();
    villageEffects.clear();
    floatingText.clear();
    lastSeenCaptureShockByTile.clear();
    forest.clear();
    ownershipOverlay.clear();
    townOverlay.clear();
    roadOverlay.clear();
    const roadNetwork = buildRoadNetwork({
      tiles: deps.state.tiles,
      keyFor: deps.keyFor,
      wrapX: deps.wrapX,
      wrapY: deps.wrapY
    });
    unfedBadgeOverlay.clear();
    observatoryCooldownBadgeOverlay.clear();
    musterOverlay.clear();
    supplyLineOverlay.clear();
    dockOverlay.clear();
    waterSurface.clear();
    barbarianOverlay.clear();
    shardOverlay.clear();
    fortOverlay.clear();
    resourceOverlay.clear();
    attackOverlay.clear();
    settleOverlay.clear();
    structureOverlay.clear();
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

    for (let dy = -halfH - 1; dy <= halfH + 1; dy += 1) {
      for (let dx = -halfW - 1; dx <= halfW + 1; dx += 1) {
        const wx = deps.wrapX(deps.state.camX + dx);
        const wy = deps.wrapY(deps.state.camY + dy);
        const tile = deps.state.tiles.get(deps.keyFor(wx, wy));
        const visibility = deps.tileVisibilityStateAt(wx, wy, tile);
        // Skip tiles outside the player's vision unless ?reveal=1 is set.
        // The reveal flag is the developer-facing whole-map mode used by
        // the 2D path's `syntheticOverlayTileAt`.
        if (visibility !== "visible" && !revealWholeMapInTrue3DMode) continue;
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
        // ground at every interior point of the tile.
        const wxNext = deps.wrapX(wx + 1);
        const wyNext = deps.wrapY(wy + 1);
        const surfaceY = Math.max(
          heightfield.elevationAt(wx, wy),
          heightfield.cornerYAt(wx, wy),
          heightfield.cornerYAt(wxNext, wy),
          heightfield.cornerYAt(wx, wyNext),
          heightfield.cornerYAt(wxNext, wyNext)
        ) + OVERLAY_RISE_ABOVE_HEIGHTFIELD;
        if (terrain === "LAND") {
          const roadDirs = roadNetwork.get(deps.keyFor(wx, wy));
          if (roadDirs) {
            roadOverlay.addInstance(
              wx, wy,
              x, z,
              (cwx: number, cwy: number) => heightfield.cornerYAt(deps.wrapX(cwx), deps.wrapY(cwy)),
              roadDirs
            );
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
          waterSurface.addTile(x, z, shallow);
          if (terrain === "COASTAL_SEA") {
            // coastal water rendered by heightfield; intentional no-op
          }
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
        }
        if (terrain === "MOUNTAIN") {
          mountainMassifs.addInstance(x, z, surfaceY);
          continue;
        }
        if (forestTile) {
          forest.addInstance(x, z, surfaceY);
        }
        const realTier = tile?.town?.populationTier;
        const demoTier = isTownDemoTile(wx, wy);
        const renderedTier: TownTier | undefined = realTier ?? demoTier;
        if (renderedTier && terrain === "LAND") {
          townOverlay.addInstance(x, z, surfaceY, renderedTier);
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
          const tileKey = deps.keyFor(wx, wy);
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
          // Mirror the "Town is unfed" line in the tile-menu: badge only
          // paints when clicking the town would also show the unfed warning.
          // Gates out neutral, foreign, unsettled, and SETTLEMENT-tier towns
          // — see shouldShowTownUnfedWarning in client-town-growth.ts.
          if (tile && shouldShowTownUnfedWarning(tile)) {
            unfedBadgeOverlay.addInstance(x, z, surfaceY);
          }
        }
        if (tile && ownerId === "barbarian-1" && terrain === "LAND") {
          barbarianOverlay.addInstance(x, z, surfaceY);
        }
        if (tile?.shardSite && terrain === "LAND" && visibility === "visible") {
          shardOverlay.addInstance(x, z, surfaceY, wx, wy);
        }
        // Resolve the underlying resource once per tile — used by the
        // resource overlay (for the icon) AND by the structure overlay
        // (so a MINE on a GEMS tile loads its cart with blue crystals
        // instead of grey iron ore, keeping the resource readable).
        let tileResource: ResourceKind | undefined;
        if (terrain === "LAND") {
          // Use the same resource source as the 2D path (`resourceFor3DPopulation`).
          // When ?reveal=1, this synthesises a resource on land tiles that
          // don't yet have a real `state.tiles` entry — mirroring the
          // `syntheticOverlayTileAt` path in client-runtime-loop.ts.
          const biome = landBiomeAt(wx, wy);
          const resolvedResource = resourceFor3DPopulation(wx, wy, terrain, tile, revealWholeMapInTrue3DMode, biome, forestTile);
          if (resolvedResource) {
            const validResources: ReadonlyArray<ResourceKind> = ["FARM", "WOOD", "IRON", "GEMS", "FISH", "FUR"];
            if ((validResources as ReadonlyArray<string>).includes(resolvedResource)) {
              tileResource = resolvedResource as ResourceKind;
              resourceOverlay.addInstance(x, z, surfaceY, tileResource, wx, wy);
            }
          }
        }
        const incomingAttack = deps.state.incomingAttacksByTile.get(deps.keyFor(wx, wy));
        if (incomingAttack && incomingAttack.resolvesAt > Date.now() && terrain === "LAND") {
          attackOverlay.addInstance(x, z, surfaceY, incomingAttack.resolvesAt);
        }
        if (tile?.economicStructure && terrain === "LAND") {
          const structureType = tile.economicStructure.type as string;
          if (STRUCTURE_KINDS_HANDLED_BY_3D.has(structureType as StructureKind)) {
            const mineResourceHint =
              structureType === "MINE" && (tileResource === "IRON" || tileResource === "GEMS")
                ? tileResource
                : undefined;
            structureOverlay.addInstance(x, z, surfaceY, structureType as StructureKind, mineResourceHint);
          }
        }
        // Observatory lives on its own tile field, not `economicStructure`.
        // Render its mesh for any tile carrying an observatory record so
        // under-construction and active states both show up — visual
        // status differentiation can come later.
        if (tile?.observatory && terrain === "LAND") {
          structureOverlay.addInstance(x, z, surfaceY, "OBSERVATORY");
          // Float a "recharging" badge over our own active observatory
          // while its crystal-casting cooldown is still running, so the
          // map shows at a glance why a cast just did nothing. Exact
          // remaining time is in the tile-menu overview.
          if (
            ownerId === deps.state.me &&
            tile.observatory.status === "active" &&
            (tile.observatory.cooldownUntil ?? 0) > Date.now()
          ) {
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
        const demoStructureEntry = structureDemoEntryFor(wx, wy);
        if (demoStructureEntry && terrain === "LAND") {
          structureOverlay.addInstance(x, z, surfaceY, demoStructureEntry.kind, demoStructureEntry.resource);
        }
        const settleProgress = deps.settlementProgressForTile(wx, wy);
        if (settleProgress && terrain === "LAND") {
          const settleColor = ownerId
            ? tmpSettleOwnerColor.set(normalizeColorForThree(deps.effectiveOverlayColor(ownerId)))
            : SETTLE_FALLBACK_COLOR;
          settleOverlay.addInstance(x, z, surfaceY, settleColor, settleProgress.startAt, settleProgress.resolvesAt, wx, wy);
        }
        if (tile) {
          const fortKind = fortificationOverlayKindForTile(tile);
          if (fortKind) {
            const opening = fortificationOpeningForTile(tile, {
              tiles: deps.state.tiles,
              keyFor: deps.keyFor,
              wrapX: deps.wrapX,
              wrapY: deps.wrapY
            });
            fortOverlay.addInstance(x, z, surfaceY, fortKind, opening);
          }
        }
        const demoFort = fortDemoSpec(wx, wy);
        if (demoFort && terrain === "LAND") {
          fortOverlay.addInstance(x, z, surfaceY, demoFort.kind, demoFort.opening);
        }
        if (isOwnedLand && ownerId) {
          const normalizedColor = normalizeColorForThree(deps.effectiveOverlayColor(ownerId));
          // ownershipOverlay.addTile copies the colour, so we can reuse a
          // hoisted Color across tiles.
          const ownerColor = tmpOwnerColor.set(normalizedColor);
          if (ownershipState === "FRONTIER" && typeof tile.frontierDecayAt === "number") {
            const remainingMs = tile.frontierDecayAt - Date.now();
            if (remainingMs > 0 && remainingMs <= 60_000) {
              const blink = 0.5 + 0.5 * Math.sin((Date.now() / 2_000) * Math.PI * 2);
              ownerColor.lerp(tmpWhite, blink * 0.35);
            }
          }
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
          const corner00Y = heightfield.cornerYAt(wx, wy) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
          const corner10Y = heightfield.cornerYAt(wxOwn, wy) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
          const corner01Y = heightfield.cornerYAt(wx, wyOwn) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
          const corner11Y = heightfield.cornerYAt(wxOwn, wyOwn) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
          const x0 = x - 0.5;
          const x1 = x + 0.5;
          const z0 = z - 0.5;
          const z1 = z + 0.5;
          ownershipOverlay.addTile(
            x0, corner00Y, z0,
            x1, corner10Y, z0,
            x0, corner01Y, z1,
            x1, corner11Y, z1,
            ownerColor,
            ownershipState === "FRONTIER"
          );
          if (selectedCoord && wx === selectedCoord.x && wy === selectedCoord.y && selectedOwnershipDebug) {
            selectedOwnershipDebug = {
              ...selectedOwnershipDebug,
              renderedOwnershipLayer: true,
              renderedOwnershipColor: `#${ownerColor.getHexString()}`
            };
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
      }
    }

    if (selectedOwnershipDebug) emitOwnershipDebug(selectedOwnershipDebug);

    mountainMassifs.commit();
    villageEffects.commit();
    forest.commit();
    ownershipOverlay.commit();
    townOverlay.commit();
    roadOverlay.commit();
    unfedBadgeOverlay.commit();
    observatoryCooldownBadgeOverlay.commit();
    musterOverlay.commit();
    syncCaptureOverlays(
      deps.state,
      deps.keyFor,
      deps.effectiveOverlayColor,
      heightfield,
      supplyLineOverlay,
      musterCombatFx
    );
    supplyLineOverlay.commit();
    dockOverlay.commit();
    waterSurface.commit();
    barbarianOverlay.commit();
    shardOverlay.commit();
    fortOverlay.commit();
    resourceOverlay.commit();
    attackOverlay.commit();
    settleOverlay.commit();
    structureOverlay.commit();
    defensibilityOverlay.commit();
  };

  const maybeRebuild = (nowMs: number): void => {
    const width = deps.canvas.width;
    const height = deps.canvas.height;
    const zoomChanged = deps.state.zoom !== lastUpdate.zoom;
    const changed =
      deps.state.camX !== lastUpdate.camX ||
      deps.state.camY !== lastUpdate.camY ||
      zoomChanged ||
      width !== lastUpdate.width ||
      height !== lastUpdate.height ||
      deps.state.tilesRevision !== lastUpdate.tilesRevision;
    if (!changed) return;
    if (width !== lastUpdate.width || height !== lastUpdate.height) resize();
    else if (zoomChanged) applyCamera();
    rebuildVisibleTerrain();
    lastUpdate.camX = deps.state.camX;
    lastUpdate.camY = deps.state.camY;
    lastUpdate.zoom = deps.state.zoom;
    lastUpdate.width = width;
    lastUpdate.height = height;
    lastUpdate.at = nowMs;
    lastUpdate.tilesRevision = deps.state.tilesRevision;
  };

  const renderLoop = (): void => {
    const nowMs = performance.now();
    maybeRebuild(nowMs);
    syncHighlightMarker(selectedMarker, deps.state.selected, MARKER_RISE_ABOVE_HEIGHTFIELD);
    syncHighlightMarker(hoverMarker, deps.state.hover, MARKER_RISE_ABOVE_HEIGHTFIELD);
    syncTownSupportMarkers();
    syncTownSupportCoins();
    syncQueueMarkers();
    syncWaypointMarkers();
    syncFrontierClaimPlate();
    syncObservatoryRangeMarkers();
    syncSweepRangeMarker();
    syncMusterReachMarker();
    syncAetherBridgePylons(nowMs);
    syncAetherLanceFxQueue();
    syncSurveySweepFxQueue();
    syncSurveySweepPings();
    syncSiphonFxQueue();
    syncRetortRecastFxQueue();
    syncRevealEmpireFxQueue();
    syncRevealEmpireStatsFxQueue();
    villageEffects.update(nowMs);
    shardOverlay.update(nowMs);
    aetherLanceFx.update(nowMs);
    surveySweepFx.update(nowMs);
    siphonFx.update(nowMs);
    retortRecastFx.update(nowMs);
    revealEmpireFx.update(nowMs);
    revealEmpireStatsFx.update(nowMs);
    floatingText.update(nowMs);
    attackOverlay.tick(nowMs);
    settleOverlay.tick(nowMs);
    waterSurface.tick(nowMs);
    unfedBadgeOverlay.tick(nowMs);
    observatoryCooldownBadgeOverlay.tick(nowMs);
    musterOverlay.tick(nowMs);
    musterCombatFx.tick(nowMs, deps.state.capture);
    supplyLineOverlay.tick(nowMs);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(renderLoop);
  };

  const { worldTileRawFromPointer, worldToScreen } = createPointerPick({
    camera,
    canvas: deps.canvas,
    state: deps.state,
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT
  });

  const stop = (): void => {
    if (rafId !== undefined) cancelAnimationFrame(rafId);
    renderer.dispose();
    ownershipOverlay.dispose();
    selectedMarker.geometry.dispose();
    hoverMarker.geometry.dispose();
    observatoryRangeMarker.geometry.dispose();
    observatoryRangeFill.geometry.dispose();
    sweepRangeMarker.geometry.dispose();
    sweepRangeFill.geometry.dispose();
    musterReachMarker.geometry.dispose();
    musterReachFill.geometry.dispose();
    (selectedMarker.material as LineBasicMaterial).dispose();
    (hoverMarker.material as LineBasicMaterial).dispose();
    observatoryRangeMaterial.dispose();
    observatoryRangeFillMaterial.dispose();
    sweepRangeMaterial.dispose();
    sweepRangeFillMaterial.dispose();
    musterReachMaterial.dispose();
    musterReachFillMaterial.dispose();
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
    waypointBaseHex.geometry.dispose();
    waypointPedestal.geometry.dispose();
    waypointPedestalGlow.geometry.dispose();
    waypointCannonLeft.geometry.dispose();
    waypointCannonRight.geometry.dispose();
    waypointSmokeLeft.geometry.dispose();
    waypointSmokeRight.geometry.dispose();
    waypointTowerTrunk.geometry.dispose();
    waypointTowerBandLow.geometry.dispose();
    waypointTowerBandHi.geometry.dispose();
    waypointBannerArm.geometry.dispose();
    waypointBannerArmCapL.geometry.dispose();
    waypointBannerArmCapR.geometry.dispose();
    waypointBannerBacking.geometry.dispose();
    waypointBanner.geometry.dispose();
    waypointBannerEmblemPlate.geometry.dispose();
    waypointBannerEmblemRing.geometry.dispose();
    waypointMedallionFrame.geometry.dispose();
    waypointMedallionFace.geometry.dispose();
    waypointWingLeft.geometry.dispose();
    waypointWingRight.geometry.dispose();
    waypointDome.geometry.dispose();
    waypointSpire.geometry.dispose();
    waypointBaseHexMaterial.dispose();
    waypointPedestalMaterial.dispose();
    waypointPedestalGlowMaterial.dispose();
    waypointCannonMaterial.dispose();
    waypointSmokeMaterial.dispose();
    waypointTowerMaterial.dispose();
    waypointTowerBandMaterial.dispose();
    waypointBannerBackingMaterial.dispose();
    waypointBannerMaterial.dispose();
    waypointBannerEmblemPlateMaterial.dispose();
    waypointBannerEmblemRingMaterial.dispose();
    waypointMedallionFrameMaterial.dispose();
    waypointMedallionFaceMaterial.dispose();
    waypointWingMaterial.dispose();
    waypointDomeMaterial.dispose();
    waypointSpireMaterial.dispose();
    frontierClaimPlateGeometry.dispose();
    frontierClaimPlateMaterial.dispose();
    townOverlay.dispose();
    roadOverlay.dispose();
    unfedBadgeOverlay.dispose();
    observatoryCooldownBadgeOverlay.dispose();
    musterOverlay.dispose();
    musterCombatFx.dispose();
    supplyLineOverlay.dispose();
    aetherBridgePylonOverlay.dispose();
    aetherLanceFx.dispose();
    surveySweepFx.dispose();
    surveySweepPingOverlay.dispose();
    siphonFx.dispose();
    retortRecastFx.dispose();
    revealEmpireFx.dispose();
    revealEmpireStatsFx.dispose();
    dockOverlay.dispose();
    barbarianOverlay.dispose();
    shardOverlay.dispose();
    fortOverlay.dispose();
    resourceOverlay.dispose();
    attackOverlay.dispose();
    settleOverlay.dispose();
    structureOverlay.dispose();
    defensibilityOverlay.dispose();
    forest.dispose();
    villageEffects.dispose();
    floatingText.dispose();
    townSupportCoins.dispose();
    waterSurface.dispose();
    mountainMassifs.dispose();
    heightfield.dispose();
    atmosphere.dispose();
    glCanvas.remove();
    delete deps.canvas.dataset.renderer;
  };

  resize();
  rafId = requestAnimationFrame(renderLoop);

  return {
    resize,
    stop,
    worldTileRawFromPointer,
    worldToScreen
  };
};
