import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, EdgesGeometry, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Scene, WebGLRenderer } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH, landBiomeAt } from "@border-empires/shared";
import type { ClientState } from "./client-state.js";
import type { Tile, TileVisibilityState } from "./client-types.js";
import { isForestTile } from "./client-constants.js";
import { applyPerspectiveCamera, createPerspectiveCamera } from "./client-map-3d-perspective-camera.js";
import { createAtmosphere } from "./client-map-3d-atmosphere.js";
import { createPointerPick, toroidDelta } from "./client-map-3d-pointer-pick.js";
import { createHeightfield, type HeightfieldTerrainKind } from "./client-map-3d-heightfield.js";
import { createMountainMassifs } from "./client-map-3d-mountain-massif.js";
import { createWaterSurface } from "./client-map-3d-water-surface.js";
import { createVillageEffects } from "./client-map-3d-village-fx.js";
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
const MAX_FOREST_INSTANCES = MAX_VISIBLE_TILES * 5;
const UPDATE_THROTTLE_MS = 70;
const TILE_CENTER_OFFSET = 0.5;
const OWNERSHIP_RISE_ABOVE_HEIGHTFIELD = 0.012;
const MARKER_RISE_ABOVE_HEIGHTFIELD = 0.028;

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
  const mountainMassifs = createMountainMassifs(scene, MAX_VISIBLE_TILES);
  const waterSurface = createWaterSurface(scene);
  const villageEffects = createVillageEffects(scene);

  const forestCanopyMaterial = new MeshStandardMaterial({ color: "#6a8574", roughness: 0.88, metalness: 0, flatShading: true });
  const forestTrunkMaterial = new MeshStandardMaterial({ color: "#a56b58", roughness: 0.8, metalness: 0, flatShading: true });
  const ownershipSettledMaterial = new MeshBasicMaterial({
    color: "#ffffff",
    transparent: false,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide
  });
  const ownershipFrontierMaterial = new MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide
  });

  const forestGeometry = new ConeGeometry(0.22, 0.92, 5, 1, false);
  const forestTrunkGeometry = new CylinderGeometry(0.075, 0.085, 0.7, 6);
  const ownershipGeometry = new PlaneGeometry(1, 1);

  const forestMesh = new InstancedMesh(forestGeometry, forestCanopyMaterial, MAX_FOREST_INSTANCES);
  const forestTrunkMesh = new InstancedMesh(forestTrunkGeometry, forestTrunkMaterial, MAX_FOREST_INSTANCES);
  const ownershipSettledMesh = new InstancedMesh(ownershipGeometry, ownershipSettledMaterial, MAX_VISIBLE_TILES);
  const ownershipFrontierMesh = new InstancedMesh(ownershipGeometry, ownershipFrontierMaterial, MAX_VISIBLE_TILES);
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
  for (const mesh of [
    forestMesh,
    forestTrunkMesh,
    ownershipSettledMesh,
    ownershipFrontierMesh
  ]) {
    mesh.frustumCulled = false;
  }
  selectedMarker.frustumCulled = false;
  hoverMarker.frustumCulled = false;
  for (const { marker } of townSupportMarkers) marker.frustumCulled = false;
  for (const { marker } of queuedActionMarkers) marker.frustumCulled = false;
  for (const { marker } of queuedSettlementMarkers) marker.frustumCulled = false;
  for (const { marker } of queuedBuildMarkers) marker.frustumCulled = false;

  forestMesh.count = 0;
  forestTrunkMesh.count = 0;
  ownershipSettledMesh.count = 0;
  ownershipFrontierMesh.count = 0;
  scene.add(
    forestMesh,
    forestTrunkMesh,
    ownershipSettledMesh,
    ownershipFrontierMesh,
    selectedMarker,
    hoverMarker,
    ...townSupportMarkers.map(({ marker }) => marker),
    ...queuedActionMarkers.map(({ marker }) => marker),
    ...queuedSettlementMarkers.map(({ marker }) => marker),
    ...queuedBuildMarkers.map(({ marker }) => marker)
  );

  const tempMatrix = new Matrix4();
  const forestCanopyScaleMatrix = new Matrix4();
  const forestTrunkScaleMatrix = new Matrix4();
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
    if (terrainForWorldTile(wx, wy) !== "LAND") return false;
    const biome = landBiomeAt(wx, wy);
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
    let forestCount = 0;
    let forestTrunkCount = 0;
    let ownershipSettledCount = 0;
    let ownershipFrontierCount = 0;
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
          const trunkOzBias = 0.04;
          const forestTreeLayout = [
            { ox: -0.26, oz: -0.24, canopyScale: 0.84, trunkScale: 0.9, trunkY: 0.56, canopyY: 1.1 },
            { ox: 0.24, oz: -0.23, canopyScale: 0.82, trunkScale: 0.88, trunkY: 0.56, canopyY: 1.08 },
            { ox: 0.02, oz: 0.0, canopyScale: 1, trunkScale: 1, trunkY: 0.6, canopyY: 1.16 },
            { ox: -0.24, oz: 0.25, canopyScale: 0.8, trunkScale: 0.86, trunkY: 0.55, canopyY: 1.07 },
            { ox: 0.25, oz: 0.24, canopyScale: 0.81, trunkScale: 0.87, trunkY: 0.55, canopyY: 1.08 }
          ] as const;
          for (const tree of forestTreeLayout) {
            forestTrunkScaleMatrix.makeScale(tree.trunkScale, tree.trunkScale, tree.trunkScale);
            tempMatrix.copy(forestTrunkScaleMatrix);
            tempMatrix.setPosition(x + tree.ox, surfaceY + tree.trunkY, z + tree.oz + trunkOzBias);
            forestTrunkMesh.setMatrixAt(forestTrunkCount, tempMatrix);
            forestTrunkCount += 1;

            forestCanopyScaleMatrix.makeScale(tree.canopyScale, tree.canopyScale, tree.canopyScale);
            tempMatrix.copy(forestCanopyScaleMatrix);
            tempMatrix.setPosition(x + tree.ox, surfaceY + tree.canopyY, z + tree.oz);
            forestMesh.setMatrixAt(forestCount, tempMatrix);
            forestCount += 1;
          }
        }
        if (isOwnedLand && ownerId) {
          tempMatrix.makeRotationX(-Math.PI / 2);
          tempMatrix.setPosition(x, surfaceY + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD, z);
          const normalizedColor = normalizeColorForThree(deps.effectiveOverlayColor(ownerId));
          const ownerColor = new Color(normalizedColor);
          if (tile?.town) {
            const tileSeed = wx * 17 + wy * 31;
            villageEffects.addOwnedVillage(x, z, surfaceY, tileSeed);
            if (tile.capital) {
              villageEffects.addCapitalBanner(x, z, surfaceY, normalizedColor, tileSeed);
            }
          }
          if (ownershipState === "FRONTIER") {
            ownershipFrontierMesh.setMatrixAt(ownershipFrontierCount, tempMatrix);
            ownershipFrontierMesh.setColorAt(ownershipFrontierCount, ownerColor);
            ownershipFrontierCount += 1;
          } else {
            ownershipSettledMesh.setMatrixAt(ownershipSettledCount, tempMatrix);
            ownershipSettledMesh.setColorAt(ownershipSettledCount, ownerColor);
            ownershipSettledCount += 1;
          }
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
    forestMesh.count = forestCount;
    forestTrunkMesh.count = forestTrunkCount;
    ownershipSettledMesh.count = ownershipSettledCount;
    ownershipFrontierMesh.count = ownershipFrontierCount;
    forestMesh.instanceMatrix.needsUpdate = true;
    forestTrunkMesh.instanceMatrix.needsUpdate = true;
    ownershipSettledMesh.instanceMatrix.needsUpdate = true;
    ownershipFrontierMesh.instanceMatrix.needsUpdate = true;
    if (ownershipSettledMesh.instanceColor) ownershipSettledMesh.instanceColor.needsUpdate = true;
    if (ownershipFrontierMesh.instanceColor) ownershipFrontierMesh.instanceColor.needsUpdate = true;
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
    forestGeometry.dispose();
    forestTrunkGeometry.dispose();
    ownershipGeometry.dispose();
    forestCanopyMaterial.dispose();
    forestTrunkMaterial.dispose();
    ownershipSettledMaterial.dispose();
    ownershipFrontierMaterial.dispose();
    markerEdgesGeometry.dispose();
    for (const { material } of townSupportMarkers) material.dispose();
    for (const { material } of queuedActionMarkers) material.dispose();
    for (const { material } of queuedSettlementMarkers) material.dispose();
    for (const { material } of queuedBuildMarkers) material.dispose();
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
