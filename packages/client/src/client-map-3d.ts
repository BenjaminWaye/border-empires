import { BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineSegments, Scene, WebGLRenderer } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH, landBiomeAt } from "@border-empires/shared";
import type { ClientState } from "./client-state.js";
import type { Tile, TileVisibilityState } from "./client-types.js";
import { isForestTile } from "./client-constants.js";
import { applyPerspectiveCamera, createPerspectiveCamera } from "./client-map-3d-perspective-camera.js";
import { createAtmosphere } from "./client-map-3d-atmosphere.js";
import { createPointerPick, toroidDelta } from "./client-map-3d-pointer-pick.js";
import { createHeightfield, type HeightfieldTerrainKind } from "./client-map-3d-heightfield.js";
import { createMountainMassifs } from "./client-map-3d-mountain-massif.js";
import { createWaterSurface, WATER_SURFACE_Y } from "./client-map-3d-water-surface.js";
import { createVillageEffects } from "./client-map-3d-village-fx.js";
import { createForest } from "./client-map-3d-forest.js";
import { createOwnershipOverlay } from "./client-map-3d-ownership-overlay.js";
import { createTownOverlay, type TownTier } from "./client-map-3d-town-overlay.js";
import { createUnfedBadgeOverlay } from "./client-map-3d-unfed-badge-overlay.js";
import { shouldShowTownUnfedWarning } from "./client-town-growth.js";
import { createDockOverlay } from "./client-map-3d-dock-overlay.js";
import { createBarbarianOverlay } from "./client-map-3d-barbarian-overlay.js";
import { createFortOverlay } from "./client-map-3d-fort-overlay.js";
import { createResourceOverlay, type ResourceKind } from "./client-map-3d-resource-overlay.js";
import { createAttackOverlay } from "./client-map-3d-attack-overlay.js";
import { createSettleOverlay } from "./client-map-3d-settle-overlay.js";
import {
  createStructureOverlay,
  STRUCTURE_KINDS_HANDLED_BY_3D,
  type StructureKind
} from "./client-map-3d-structure-overlay.js";
import { resourceFor3DPopulation } from "./client-map-3d-population.js";
import { revealWholeMapInTrue3DMode } from "./client-renderer-mode.js";
import {
  fortificationOpeningForTile,
  fortificationOverlayKindForTile,
  type FortificationOpening,
  type FortificationOverlayKind
} from "./client-fortification-overlays.js";
import { normalizeColorForThree } from "./client-three-color.js";

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
const UPDATE_THROTTLE_MS = 70;
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
  const forest = createForest(scene, MAX_VISIBLE_TILES);
  const ownershipOverlay = createOwnershipOverlay(scene, MAX_VISIBLE_TILES);
  const townOverlay = createTownOverlay(scene, MAX_VISIBLE_TILES);
  const unfedBadgeOverlay = createUnfedBadgeOverlay(scene, MAX_VISIBLE_TILES);
  const dockOverlay = createDockOverlay(scene, MAX_VISIBLE_TILES);
  const barbarianOverlay = createBarbarianOverlay(scene, MAX_VISIBLE_TILES);
  const fortOverlay = createFortOverlay(scene, MAX_VISIBLE_TILES);
  const resourceOverlay = createResourceOverlay(scene, MAX_VISIBLE_TILES);
  const attackOverlay = createAttackOverlay(scene, MAX_VISIBLE_TILES);
  const settleOverlay = createSettleOverlay(scene, MAX_VISIBLE_TILES);
  const structureOverlay = createStructureOverlay(scene, MAX_VISIBLE_TILES);

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
  selectedMarker.visible = false;
  hoverMarker.visible = false;
  selectedMarker.renderOrder = 30;
  hoverMarker.renderOrder = 31;
  for (const { marker } of townSupportMarkers) marker.renderOrder = 28;
  for (const { marker } of queuedActionMarkers) marker.renderOrder = 29;
  for (const { marker } of queuedSettlementMarkers) marker.renderOrder = 29;
  for (const { marker } of queuedBuildMarkers) marker.renderOrder = 29;
  selectedMarker.frustumCulled = false;
  hoverMarker.frustumCulled = false;
  for (const { marker } of townSupportMarkers) marker.frustumCulled = false;
  for (const { marker } of queuedActionMarkers) marker.frustumCulled = false;
  for (const { marker } of queuedSettlementMarkers) marker.frustumCulled = false;
  for (const { marker } of queuedBuildMarkers) marker.frustumCulled = false;

  scene.add(
    selectedMarker,
    hoverMarker,
    ...townSupportMarkers.map(({ marker }) => marker),
    ...queuedActionMarkers.map(({ marker }) => marker),
    ...queuedSettlementMarkers.map(({ marker }) => marker),
    ...queuedBuildMarkers.map(({ marker }) => marker)
  );

  const lastUpdate = { camX: Number.NaN, camY: Number.NaN, zoom: Number.NaN, width: 0, height: 0, at: 0 };
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
    forest.clear();
    ownershipOverlay.clear();
    townOverlay.clear();
    unfedBadgeOverlay.clear();
    dockOverlay.clear();
    waterSurface.clear();
    barbarianOverlay.clear();
    fortOverlay.clear();
    resourceOverlay.clear();
    attackOverlay.clear();
    settleOverlay.clear();
    structureOverlay.clear();
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
          // Smoke column over the town. Capital banners stay off for now;
          // re-enable by adding villageEffects.addCapitalBanner if wanted.
          const tileSeed = wx * 17 + wy * 31;
          villageEffects.addOwnedVillage(x, z, surfaceY, tileSeed);
          // Mirror the "Town is unfed" line in the tile-menu: badge only
          // paints when clicking the town would also show the unfed warning.
          // Gates out neutral, foreign, unsettled, and SETTLEMENT-tier towns
          // — see shouldShowTownUnfedWarning in client-town-growth.ts.
          if (tile && shouldShowTownUnfedWarning(tile)) {
            unfedBadgeOverlay.addInstance(x, z, surfaceY);
          }
        }
        if (tile && ownerId === "barbarian" && terrain === "LAND") {
          barbarianOverlay.addInstance(x, z, surfaceY);
        }
        if (terrain === "LAND") {
          // Use the same resource source as the 2D path (`resourceFor3DPopulation`).
          // When ?reveal=1, this synthesises a resource on land tiles that
          // don't yet have a real `state.tiles` entry — mirroring the
          // `syntheticOverlayTileAt` path in client-runtime-loop.ts.
          const biome = landBiomeAt(wx, wy);
          const resolvedResource = resourceFor3DPopulation(wx, wy, terrain, tile, revealWholeMapInTrue3DMode, biome, forestTile);
          if (resolvedResource) {
            const validResources: ReadonlyArray<ResourceKind> = ["FARM", "WOOD", "IRON", "GEMS", "FISH", "FUR", "OIL"];
            if ((validResources as ReadonlyArray<string>).includes(resolvedResource)) {
              resourceOverlay.addInstance(x, z, surfaceY, resolvedResource as ResourceKind, wx, wy);
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
            structureOverlay.addInstance(x, z, surfaceY, structureType as StructureKind);
          }
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
      }
    }

    if (selectedOwnershipDebug) emitOwnershipDebug(selectedOwnershipDebug);

    mountainMassifs.commit();
    villageEffects.commit();
    forest.commit();
    ownershipOverlay.commit();
    townOverlay.commit();
    unfedBadgeOverlay.commit();
    dockOverlay.commit();
    waterSurface.commit();
    barbarianOverlay.commit();
    fortOverlay.commit();
    resourceOverlay.commit();
    attackOverlay.commit();
    settleOverlay.commit();
    structureOverlay.commit();
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
      height !== lastUpdate.height;
    if (!changed && nowMs - lastUpdate.at < UPDATE_THROTTLE_MS) return;
    if (width !== lastUpdate.width || height !== lastUpdate.height) resize();
    else if (zoomChanged) applyCamera();
    rebuildVisibleTerrain();
    lastUpdate.camX = deps.state.camX;
    lastUpdate.camY = deps.state.camY;
    lastUpdate.zoom = deps.state.zoom;
    lastUpdate.width = width;
    lastUpdate.height = height;
    lastUpdate.at = nowMs;
  };

  const renderLoop = (): void => {
    const nowMs = performance.now();
    maybeRebuild(nowMs);
    syncHighlightMarker(selectedMarker, deps.state.selected, MARKER_RISE_ABOVE_HEIGHTFIELD);
    syncHighlightMarker(hoverMarker, deps.state.hover, MARKER_RISE_ABOVE_HEIGHTFIELD);
    syncTownSupportMarkers();
    syncQueueMarkers();
    villageEffects.update(nowMs);
    attackOverlay.tick(nowMs);
    settleOverlay.tick(nowMs);
    waterSurface.tick(nowMs);
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
    (selectedMarker.material as LineBasicMaterial).dispose();
    (hoverMarker.material as LineBasicMaterial).dispose();
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
    townOverlay.dispose();
    unfedBadgeOverlay.dispose();
    dockOverlay.dispose();
    barbarianOverlay.dispose();
    fortOverlay.dispose();
    resourceOverlay.dispose();
    attackOverlay.dispose();
    settleOverlay.dispose();
    structureOverlay.dispose();
    forest.dispose();
    villageEffects.dispose();
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
