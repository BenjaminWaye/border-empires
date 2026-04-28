import { AmbientLight, BoxGeometry, Color, ConeGeometry, CylinderGeometry, DirectionalLight, DoubleSide, EdgesGeometry, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, MeshBasicMaterial, MeshStandardMaterial, OrthographicCamera, PlaneGeometry, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { ClientState } from "./client-state.js";
import type { Tile, TileVisibilityState } from "./client-types.js";
import { isForestTile } from "./client-constants.js";
import { createClientThreeChunkTerrainLayer } from "./client-map-3d-chunk-terrain.js";
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
const CAMERA_HEIGHT = 100;
const CAMERA_TILT_DEGREES_FROM_VERTICAL = 14;
const MOUNTAIN_SQUARE_PEAK_ROTATION_RADIANS = Math.PI / 4;
const OWNERSHIP_SURFACE_OFFSET = 0.006;
const MARKER_SURFACE_OFFSET = 0.03;

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
  scene.background = new Color("#071223");
  scene.fog = null;

  const ambient = new AmbientLight("#a7c8e2", 1.12);
  scene.add(ambient);

  const sun = new DirectionalLight("#fff4d6", 1.7);
  sun.position.set(-8, 18, 10);
  scene.add(sun);

  const sky = new DirectionalLight("#87ccff", 0.52);
  sky.position.set(10, 12, -8);
  scene.add(sky);

  const camera = new OrthographicCamera(-10, 10, 8, -8, 0.1, 2500);
  const cameraTarget = new Vector3(0, 0, 0);
  camera.up.set(0, 0, -1);

  const terrainLayer = createClientThreeChunkTerrainLayer({
    scene,
    keyFor: deps.keyFor,
    wrapX: deps.wrapX,
    wrapY: deps.wrapY,
    terrainAt: deps.terrainAt,
    tileAt: (x, y) => deps.state.tiles.get(deps.keyFor(x, y)),
    tileVisibilityStateAt: deps.tileVisibilityStateAt
  });

  const mountainPeakMaterial = new MeshStandardMaterial({ color: "#535760", roughness: 0.9, metalness: 0, flatShading: true });
  const mountainSnowCapMaterial = new MeshStandardMaterial({
    color: "#f3f7ff",
    roughness: 0.62,
    metalness: 0,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
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

  const mountainPeakGeometry = new ConeGeometry(0.715, 1.24, 4, 1, false);
  const mountainSnowCapGeometry = new ConeGeometry(0.19, 0.34, 4, 1, false);
  const forestGeometry = new ConeGeometry(0.22, 0.92, 5, 1, false);
  const forestTrunkGeometry = new CylinderGeometry(0.075, 0.085, 0.7, 6);
  const ownershipGeometry = new PlaneGeometry(1, 1);

  const mountainPeakMesh = new InstancedMesh(mountainPeakGeometry, mountainPeakMaterial, MAX_VISIBLE_TILES);
  const mountainSnowCapMesh = new InstancedMesh(mountainSnowCapGeometry, mountainSnowCapMaterial, MAX_VISIBLE_TILES);
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
    mountainPeakMesh,
    mountainSnowCapMesh,
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

  mountainPeakMesh.count = 0;
  mountainSnowCapMesh.count = 0;
  forestMesh.count = 0;
  forestTrunkMesh.count = 0;
  ownershipSettledMesh.count = 0;
  ownershipFrontierMesh.count = 0;
  scene.add(
    mountainPeakMesh,
    mountainSnowCapMesh,
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
  const peakOffset = new Matrix4();
  const forestCanopyScaleMatrix = new Matrix4();
  const forestTrunkScaleMatrix = new Matrix4();
  const lastUpdate = { camX: Number.NaN, camY: Number.NaN, zoom: Number.NaN, width: 0, height: 0, at: 0 };
  let rafId: number | undefined;
  let lastOwnershipDebugSignature = "";
  const ownershipDebugWindow = (): (Window & { __be3dOwnershipDebug?: unknown }) | undefined =>
    typeof window !== "undefined" ? (window as Window & { __be3dOwnershipDebug?: unknown }) : undefined;
  const shouldDebugOwnership = (): boolean =>
    typeof window !== "undefined" && window.location.hostname === "localhost";
  const raycaster = new Raycaster();
  const markerHeightFor = (wx: number, wy: number): number => terrainLayer.surfaceHeightAt(wx, wy) + MARKER_SURFACE_OFFSET;
  const ownershipHeightFor = (wx: number, wy: number): number => terrainLayer.surfaceHeightAt(wx, wy) + OWNERSHIP_SURFACE_OFFSET;

  const mountainJitter = (_wx: number, _wy: number): { x: number; z: number; y: number } => {
    return {
      x: 0,
      z: 0,
      y: 0.14
    };
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
  const toroidDelta = (from: number, to: number, dim: number): number => {
    let delta = to - from;
    if (delta > dim / 2) delta -= dim;
    if (delta < -dim / 2) delta += dim;
    return delta;
  };
  const syncHighlightMarker = (marker: LineSegments, tile: { x: number; y: number } | undefined): void => {
    if (!tile) {
      marker.visible = false;
      return;
    }
    const dx = toroidDelta(deps.state.camX, tile.x, WORLD_WIDTH);
    const dy = toroidDelta(deps.state.camY, tile.y, WORLD_HEIGHT);
    marker.position.set(dx + TILE_CENTER_OFFSET, markerHeightFor(tile.x, tile.y), dy + TILE_CENTER_OFFSET);
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
        marker.position.set(sx + TILE_CENTER_OFFSET, markerHeightFor(wx, wy), sy + TILE_CENTER_OFFSET);
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
    yOffset: number
  ): void => {
    hideLineMarkerPool(pool);
    let index = 0;
    for (const tile of tiles) {
      if (index >= pool.length) break;
      const { marker } = pool[index]!;
      const dx = toroidDelta(deps.state.camX, tile.x, WORLD_WIDTH);
      const dy = toroidDelta(deps.state.camY, tile.y, WORLD_HEIGHT);
      marker.position.set(dx + TILE_CENTER_OFFSET, markerHeightFor(tile.x, tile.y) + (yOffset - MARKER_SURFACE_OFFSET), dy + TILE_CENTER_OFFSET);
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
    placeLineMarkers(queuedActionMarkers, actionTiles, MARKER_SURFACE_OFFSET);
    const settlementTiles: Array<{ x: number; y: number }> = [];
    const buildTiles: Array<{ x: number; y: number }> = [];
    for (const entry of deps.state.developmentQueue) {
      if (!entry) continue;
      if (!Number.isFinite(entry.x) || !Number.isFinite(entry.y)) continue;
      if (entry.kind === "SETTLE") settlementTiles.push({ x: entry.x, y: entry.y });
      if (entry.kind === "BUILD") buildTiles.push({ x: entry.x, y: entry.y });
    }
    placeLineMarkers(queuedSettlementMarkers, settlementTiles, MARKER_SURFACE_OFFSET);
    placeLineMarkers(queuedBuildMarkers, buildTiles, MARKER_SURFACE_OFFSET);
  };

  const applyCamera = (): void => {
    const size = Math.max(1, deps.state.zoom);
    const width = Math.max(1, deps.canvas.width);
    const height = Math.max(1, deps.canvas.height);
    const halfW = Math.max(1, Math.floor(width / size / 2));
    const halfH = Math.max(1, Math.floor(height / size / 2));
    // Use pixel-space frustum + zoom so 1 world unit == 1 tile exactly.
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.zoom = size;
    const centerOffsetX = width / (2 * size) - halfW;
    const centerOffsetZ = height / (2 * size) - halfH;
    const tiltRadians = (CAMERA_TILT_DEGREES_FROM_VERTICAL * Math.PI) / 180;
    const cameraDepthOffset = Math.tan(tiltRadians) * CAMERA_HEIGHT;
    camera.position.set(centerOffsetX, CAMERA_HEIGHT, centerOffsetZ + cameraDepthOffset);
    camera.far = 2500;
    cameraTarget.set(centerOffsetX, 0, centerOffsetZ);
    camera.lookAt(cameraTarget);
    camera.updateProjectionMatrix();
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
    const halfW = Math.floor(deps.canvas.width / size / 2);
    const halfH = Math.floor(deps.canvas.height / size / 2);

    terrainLayer.updateVisibleChunks(deps.state.camX, deps.state.camY, halfW, halfH);

    let mountainPeakCount = 0;
    let mountainSnowCapCount = 0;
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
        const terrain = tile?.terrain ?? deps.terrainAt(wx, wy);
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
        const surfaceY = terrainLayer.surfaceHeightAt(wx, wy);
        if (terrain === "SEA") continue;
        if (terrain === "MOUNTAIN") {
          const jitter = mountainJitter(wx, wy);
          peakOffset.makeRotationY(MOUNTAIN_SQUARE_PEAK_ROTATION_RADIANS);
          tempMatrix.copy(peakOffset);
          tempMatrix.setPosition(x + jitter.x, surfaceY + 0.56 + jitter.y, z + jitter.z);
          mountainPeakMesh.setMatrixAt(mountainPeakCount, tempMatrix);
          mountainPeakCount += 1;
          tempMatrix.copy(peakOffset);
          tempMatrix.setPosition(x + jitter.x, surfaceY + 1.05 + jitter.y, z + jitter.z);
          mountainSnowCapMesh.setMatrixAt(mountainSnowCapCount, tempMatrix);
          mountainSnowCapCount += 1;
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
          tempMatrix.setPosition(x, ownershipHeightFor(wx, wy), z);
          const normalizedColor = normalizeColorForThree(deps.effectiveOverlayColor(ownerId));
          const ownerColor = new Color(normalizedColor);
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

    mountainPeakMesh.count = mountainPeakCount;
    mountainSnowCapMesh.count = mountainSnowCapCount;
    forestMesh.count = forestCount;
    forestTrunkMesh.count = forestTrunkCount;
    ownershipSettledMesh.count = ownershipSettledCount;
    ownershipFrontierMesh.count = ownershipFrontierCount;
    mountainPeakMesh.instanceMatrix.needsUpdate = true;
    mountainSnowCapMesh.instanceMatrix.needsUpdate = true;
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
    // Keep marker nearly coplanar with tile tops so tilt does not introduce screen-space offset.
    syncHighlightMarker(selectedMarker, deps.state.selected);
    syncHighlightMarker(hoverMarker, deps.state.hover);
    syncTownSupportMarkers();
    syncQueueMarkers();
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(renderLoop);
  };

  const worldTileRawFromPointer = (offsetX: number, offsetY: number): { gx: number; gy: number } => {
    const width = Math.max(1, deps.canvas.width);
    const height = Math.max(1, deps.canvas.height);
    const ndcX = (offsetX / width) * 2 - 1;
    const ndcY = -((offsetY / height) * 2 - 1);
    raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera);
    const intersections = raycaster.intersectObjects(terrainLayer.pickableObjects(), false);
    const hit = intersections[0];
    if (!hit) {
      return { gx: deps.state.camX, gy: deps.state.camY };
    }
    return {
      gx: deps.wrapX(deps.state.camX + Math.floor(hit.point.x)),
      gy: deps.wrapY(deps.state.camY + Math.floor(hit.point.z))
    };
  };

  const worldToScreen = (wx: number, wy: number): { sx: number; sy: number } => {
    const dx = toroidDelta(deps.state.camX, wx, WORLD_WIDTH) + TILE_CENTER_OFFSET;
    const dy = toroidDelta(deps.state.camY, wy, WORLD_HEIGHT) + TILE_CENTER_OFFSET;
    const projected = new Vector3(dx, terrainLayer.surfaceHeightAt(wx, wy), dy).project(camera);
    return {
      sx: (projected.x * 0.5 + 0.5) * deps.canvas.width,
      sy: (-projected.y * 0.5 + 0.5) * deps.canvas.height
    };
  };

  const stop = (): void => {
    if (rafId !== undefined) cancelAnimationFrame(rafId);
    renderer.dispose();
    terrainLayer.dispose();
    mountainPeakGeometry.dispose();
    mountainSnowCapGeometry.dispose();
    forestGeometry.dispose();
    forestTrunkGeometry.dispose();
    ownershipGeometry.dispose();
    mountainPeakMaterial.dispose();
    mountainSnowCapMaterial.dispose();
    forestCanopyMaterial.dispose();
    forestTrunkMaterial.dispose();
    ownershipSettledMaterial.dispose();
    ownershipFrontierMaterial.dispose();
    markerEdgesGeometry.dispose();
    for (const { material } of townSupportMarkers) material.dispose();
    for (const { material } of queuedActionMarkers) material.dispose();
    for (const { material } of queuedSettlementMarkers) material.dispose();
    for (const { material } of queuedBuildMarkers) material.dispose();
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
