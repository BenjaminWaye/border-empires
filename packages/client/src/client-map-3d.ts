import { BoxGeometry, Color, EdgesGeometry, LineBasicMaterial, LineSegments, Scene, WebGLRenderer } from "three";
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
import { normalizeColorForThree } from "./client-three-color.js";

type ClientThreeTerrainRendererDeps = {
  state: ClientState;
  canvas: HTMLCanvasElement;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  effectiveOverlayColor: (ownerId: string) => string;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
};

const MAX_VISIBLE_TILES = 14000;
const UPDATE_THROTTLE_MS = 70;
const TILE_CENTER_OFFSET = 0.5;
const OWNERSHIP_RISE_ABOVE_HEIGHTFIELD = 0.022;
const MARKER_RISE_ABOVE_HEIGHTFIELD = 0.038;

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
  const waterSurface = createWaterSurface(scene);
  const villageEffects = createVillageEffects(scene);
  const forest = createForest(scene, MAX_VISIBLE_TILES);
  const ownershipOverlay = createOwnershipOverlay(scene, MAX_VISIBLE_TILES);
  const townOverlay = createTownOverlay(scene, MAX_VISIBLE_TILES);

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

  const markerEdgesGeometry = new EdgesGeometry(new BoxGeometry(1, 0.04, 1));
  const selectedMarker = new LineSegments(
    markerEdgesGeometry,
    new LineBasicMaterial({ color: "#f6f0d5", transparent: true, opacity: 0.88, depthTest: false, depthWrite: false })
  );
  const hoverMarker = new LineSegments(
    markerEdgesGeometry,
    new LineBasicMaterial({ color: "#d5ecff", transparent: true, opacity: 0.8, depthTest: false, depthWrite: false })
  );
  const townSupportMarkers = Array.from({ length: 8 }, () => {
    const material = new LineBasicMaterial({ color: "#f0f4ff", transparent: true, opacity: 0.56, depthTest: false, depthWrite: false });
    const marker = new LineSegments(markerEdgesGeometry, material);
    marker.visible = false;
    return { marker, material };
  });
  const queuedActionMarkers = Array.from({ length: 64 }, () => {
    const material = new LineBasicMaterial({ color: "#a78bfa", transparent: true, opacity: 0.93, depthTest: false, depthWrite: false });
    const marker = new LineSegments(markerEdgesGeometry, material);
    marker.visible = false;
    return { marker, material };
  });
  const queuedSettlementMarkers = Array.from({ length: 64 }, () => {
    const material = new LineBasicMaterial({ color: "#fbbf24", transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
    const marker = new LineSegments(markerEdgesGeometry, material);
    marker.visible = false;
    return { marker, material };
  });
  const queuedBuildMarkers = Array.from({ length: 64 }, () => {
    const material = new LineBasicMaterial({ color: "#7dd3fc", transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
    const marker = new LineSegments(markerEdgesGeometry, material);
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
    const surfaceY = heightfield.elevationAt(deps.wrapX(tile.x), deps.wrapY(tile.y));
    marker.position.set(dx + TILE_CENTER_OFFSET, surfaceY + riseAboveSurface, dy + TILE_CENTER_OFFSET);
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
        const surfaceY = heightfield.elevationAt(wx, wy);
        marker.position.set(sx + TILE_CENTER_OFFSET, surfaceY + MARKER_RISE_ABOVE_HEIGHTFIELD, sy + TILE_CENTER_OFFSET);
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
      const surfaceY = heightfield.elevationAt(deps.wrapX(tile.x), deps.wrapY(tile.y));
      marker.position.set(dx + TILE_CENTER_OFFSET, surfaceY + riseAboveSurface, dy + TILE_CENTER_OFFSET);
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

  const rebuildVisibleTerrain = (): void => {
    const size = Math.max(1, deps.state.zoom);
    const halfW = Math.max(1, Math.floor(deps.canvas.width / size / 2));
    const halfH = Math.max(1, Math.floor(deps.canvas.height / size / 2));

    heightfield.mesh.position.set(0, 0, 0);
    heightfield.rebuild({
      camX: deps.state.camX,
      camY: deps.state.camY,
      halfW,
      halfH,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      tileKindAt: heightfieldKindAt
    });

    mountainMassifs.clear();
    villageEffects.clear();
    forest.clear();
    ownershipOverlay.clear();
    townOverlay.clear();
    const selectedCoord = deps.state.selected;
    let selectedOwnershipDebug: Record<string, unknown> | undefined;

    for (let dy = -halfH - 1; dy <= halfH + 1; dy += 1) {
      for (let dx = -halfW - 1; dx <= halfW + 1; dx += 1) {
        const wx = deps.wrapX(deps.state.camX + dx);
        const wy = deps.wrapY(deps.state.camY + dy);
        const tile = deps.state.tiles.get(deps.keyFor(wx, wy));
        const visibility = deps.tileVisibilityStateAt(wx, wy, tile);
        if (visibility === "unexplored") continue;
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
        const surfaceY = heightfield.elevationAt(wx, wy);
        if (terrain === "SEA" || terrain === "COASTAL_SEA") {
          if (terrain === "COASTAL_SEA") {
            // coastal water rendered by heightfield; intentional no-op
          }
          continue;
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
        }
        if (isOwnedLand && ownerId) {
          const normalizedColor = normalizeColorForThree(deps.effectiveOverlayColor(ownerId));
          const ownerColor = new Color(normalizedColor);
          // Each ownership corner samples the heightfield's averaged
          // elevation so the painted overlay traces the sculpted ground.
          // Tile (wx, wy) spans world-XZ [wx, wx+1] × [wy, wy+1]; its 4
          // grid corners are the integer points (wx, wy), (wx+1, wy),
          // (wx, wy+1), (wx+1, wy+1).
          const wxNext = deps.wrapX(wx + 1);
          const wyNext = deps.wrapY(wy + 1);
          // Each corner reads the heightfield's averaged elevation so the
          // painted overlay traces the sculpted ground. Water draws after
          // the overlay (see WaterSurface.renderOrder) and naturally hides
          // any portion that dips below the water surface.
          const corner00Y = (
            heightfield.elevationAt(deps.wrapX(wx - 1), deps.wrapY(wy - 1)) +
            heightfield.elevationAt(wx, deps.wrapY(wy - 1)) +
            heightfield.elevationAt(deps.wrapX(wx - 1), wy) +
            heightfield.elevationAt(wx, wy)
          ) * 0.25 + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
          const corner10Y = (
            heightfield.elevationAt(wx, deps.wrapY(wy - 1)) +
            heightfield.elevationAt(wxNext, deps.wrapY(wy - 1)) +
            heightfield.elevationAt(wx, wy) +
            heightfield.elevationAt(wxNext, wy)
          ) * 0.25 + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
          const corner01Y = (
            heightfield.elevationAt(deps.wrapX(wx - 1), wy) +
            heightfield.elevationAt(wx, wy) +
            heightfield.elevationAt(deps.wrapX(wx - 1), wyNext) +
            heightfield.elevationAt(wx, wyNext)
          ) * 0.25 + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
          const corner11Y = (
            heightfield.elevationAt(wx, wy) +
            heightfield.elevationAt(wxNext, wy) +
            heightfield.elevationAt(wx, wyNext) +
            heightfield.elevationAt(wxNext, wyNext)
          ) * 0.25 + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
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
    waterSurface.update(nowMs, deps.state.camX, deps.state.camY);
    villageEffects.update(nowMs);
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
    markerEdgesGeometry.dispose();
    for (const { material } of townSupportMarkers) material.dispose();
    for (const { material } of queuedActionMarkers) material.dispose();
    for (const { material } of queuedSettlementMarkers) material.dispose();
    for (const { material } of queuedBuildMarkers) material.dispose();
    townOverlay.dispose();
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
