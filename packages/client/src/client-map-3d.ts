import { AmbientLight, BoxGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, DirectionalLight, EdgesGeometry, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, MeshStandardMaterial, OrthographicCamera, RepeatWrapping, SRGBColorSpace, Scene, Vector3, WebGLRenderer } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH, landBiomeAt } from "@border-empires/shared";
import type { ClientState } from "./client-state.js";
import type { Tile, TileVisibilityState } from "./client-types.js";
import { isForestTile } from "./client-constants.js";
import { terrainShadeVariantAt } from "./client-map-3d-terrain-variation.js";

type ClientThreeTerrainRendererDeps = {
  state: ClientState;
  canvas: HTMLCanvasElement;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
};

const MAX_VISIBLE_TILES = 14000;
const MAX_FOREST_INSTANCES = MAX_VISIBLE_TILES * 5;
const UPDATE_THROTTLE_MS = 70;
const TILE_CENTER_OFFSET = 0.5;
const CAMERA_HEIGHT = 100;
const CAMERA_TILT_DEGREES_FROM_VERTICAL = 14;
const MOUNTAIN_SQUARE_PEAK_ROTATION_RADIANS = Math.PI / 4;

const LEGACY_TEXTURE_SIZE = 64;
const clamp255 = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
const tint = (r: number, g: number, b: number, delta: number): [number, number, number] => [
  clamp255(r + delta),
  clamp255(g + delta),
  clamp255(b + delta)
];

const createLegacyTerrainTexture = (
  base: [number, number, number],
  options: { grain: number; waveA?: number; waveB?: number; crack?: number; grass?: boolean; rock?: boolean }
): CanvasTexture => {
  const size = LEGACY_TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("failed to create legacy terrain texture canvas context");
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const [br, bg, bb] = base;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const wave =
        Math.sin((x + y * 0.8) * (options.waveA ?? 0)) * 0.5 +
        Math.cos((y - x * 0.6) * (options.waveB ?? 0)) * 0.5;
      const grain =
        Math.sin((x * 12.9898 + y * 78.233) * 0.017) * 0.5 +
        Math.sin((x * 93.17 - y * 51.11) * 0.021) * 0.5;
      let delta = grain * options.grain + wave * (options.waveA ? 10 : 0);
      if (options.crack) {
        const crack = Math.sin((x * 0.9 + y * 0.2) * 0.25) + Math.cos((y * 1.1 - x * 0.3) * 0.21);
        delta -= Math.max(0, crack) * options.crack;
      }
      if (options.grass) {
        const blade = Math.sin((x * 0.7 + y * 1.3) * 0.33) * 8 + Math.cos((x * 1.1 - y * 0.8) * 0.27) * 6;
        delta += blade * 0.25;
      }
      if (options.rock) {
        const pebble = Math.sin((x * 0.42 + y * 0.58) * 0.9) * Math.cos((x * 0.66 - y * 0.31) * 0.8);
        delta += pebble * 14;
      }
      const [r, g, b] = tint(br, bg, bb, delta);
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.needsUpdate = true;
  return texture;
};

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

  const grassLightTexture = createLegacyTerrainTexture([111, 165, 89], { grain: 8, waveA: 0.22, waveB: 0.18, grass: true });
  const grassDarkTexture = createLegacyTerrainTexture([89, 140, 71], { grain: 8, waveA: 0.22, waveB: 0.18, grass: true });
  const sandTexture = createLegacyTerrainTexture([214, 184, 135], { grain: 11, waveA: 0.18, waveB: 0.14 });
  const seaDeepTexture = createLegacyTerrainTexture([71, 128, 158], { grain: 9, waveA: 0.34, waveB: 0.28 });
  const seaCoastTexture = createLegacyTerrainTexture([103, 154, 182], { grain: 8, waveA: 0.31, waveB: 0.26 });

  const seaMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    map: seaDeepTexture,
    roughness: 0.5,
    roughnessMap: seaDeepTexture,
    bumpMap: seaDeepTexture,
    bumpScale: 0.018,
    metalness: 0.02,
    flatShading: true
  });
  const coastSeaMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    map: seaCoastTexture,
    roughness: 0.5,
    roughnessMap: seaCoastTexture,
    bumpMap: seaCoastTexture,
    bumpScale: 0.016,
    metalness: 0.02,
    flatShading: true
  });
  const landMaterialA = new MeshStandardMaterial({
    color: "#ffffff",
    map: grassLightTexture,
    roughness: 0.78,
    roughnessMap: grassLightTexture,
    bumpMap: grassLightTexture,
    bumpScale: 0.02,
    metalness: 0.01,
    flatShading: true
  });
  const landMaterialB = new MeshStandardMaterial({
    color: "#ffffff",
    map: grassDarkTexture,
    roughness: 0.79,
    roughnessMap: grassDarkTexture,
    bumpMap: grassDarkTexture,
    bumpScale: 0.02,
    metalness: 0.01,
    flatShading: true
  });
  const landMaterialC = new MeshStandardMaterial({
    color: "#ffffff",
    map: grassLightTexture,
    roughness: 0.78,
    roughnessMap: grassLightTexture,
    bumpMap: grassLightTexture,
    bumpScale: 0.02,
    metalness: 0.01,
    flatShading: true
  });
  const sandMaterialA = new MeshStandardMaterial({
    color: "#ffffff",
    map: sandTexture,
    roughness: 0.73,
    roughnessMap: sandTexture,
    bumpMap: sandTexture,
    bumpScale: 0.017,
    metalness: 0.01,
    flatShading: true
  });
  const sandMaterialB = new MeshStandardMaterial({
    color: "#ffffff",
    map: sandTexture,
    roughness: 0.73,
    roughnessMap: sandTexture,
    bumpMap: sandTexture,
    bumpScale: 0.017,
    metalness: 0.01,
    flatShading: true
  });
  const sandMaterialC = new MeshStandardMaterial({
    color: "#ffffff",
    map: sandTexture,
    roughness: 0.73,
    roughnessMap: sandTexture,
    bumpMap: sandTexture,
    bumpScale: 0.017,
    metalness: 0.01,
    flatShading: true
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

  const seaGeometry = new BoxGeometry(1, 0.2, 1);
  const coastSeaGeometry = new BoxGeometry(1, 0.2, 1);
  const landGeometry = new BoxGeometry(1, 0.46, 1);
  const sandGeometry = new BoxGeometry(1, 0.46, 1);
  const mountainPeakGeometry = new ConeGeometry(0.715, 1.24, 4, 1, false);
  const mountainSnowCapGeometry = new ConeGeometry(0.19, 0.34, 4, 1, false);
  const forestGeometry = new ConeGeometry(0.22, 0.92, 5, 1, false);
  const forestTrunkGeometry = new CylinderGeometry(0.075, 0.085, 0.7, 6);

  const seaMesh = new InstancedMesh(seaGeometry, seaMaterial, MAX_VISIBLE_TILES);
  const coastSeaMesh = new InstancedMesh(coastSeaGeometry, coastSeaMaterial, MAX_VISIBLE_TILES);
  const landMeshA = new InstancedMesh(landGeometry, landMaterialA, MAX_VISIBLE_TILES);
  const landMeshB = new InstancedMesh(landGeometry, landMaterialB, MAX_VISIBLE_TILES);
  const landMeshC = new InstancedMesh(landGeometry, landMaterialC, MAX_VISIBLE_TILES);
  const sandMeshA = new InstancedMesh(sandGeometry, sandMaterialA, MAX_VISIBLE_TILES);
  const sandMeshB = new InstancedMesh(sandGeometry, sandMaterialB, MAX_VISIBLE_TILES);
  const sandMeshC = new InstancedMesh(sandGeometry, sandMaterialC, MAX_VISIBLE_TILES);
  const mountainPeakMesh = new InstancedMesh(mountainPeakGeometry, mountainPeakMaterial, MAX_VISIBLE_TILES);
  const mountainSnowCapMesh = new InstancedMesh(mountainSnowCapGeometry, mountainSnowCapMaterial, MAX_VISIBLE_TILES);
  const forestMesh = new InstancedMesh(forestGeometry, forestCanopyMaterial, MAX_FOREST_INSTANCES);
  const forestTrunkMesh = new InstancedMesh(forestTrunkGeometry, forestTrunkMaterial, MAX_FOREST_INSTANCES);
  const markerEdgesGeometry = new EdgesGeometry(new BoxGeometry(1, 0.04, 1));
  const selectedMarker = new LineSegments(
    markerEdgesGeometry,
    new LineBasicMaterial({ color: "#f6f0d5", transparent: true, opacity: 0.88 })
  );
  const hoverMarker = new LineSegments(
    markerEdgesGeometry,
    new LineBasicMaterial({ color: "#d5ecff", transparent: true, opacity: 0.65 })
  );
  selectedMarker.visible = false;
  hoverMarker.visible = false;

  seaMesh.count = 0;
  coastSeaMesh.count = 0;
  landMeshA.count = 0;
  landMeshB.count = 0;
  landMeshC.count = 0;
  sandMeshA.count = 0;
  sandMeshB.count = 0;
  sandMeshC.count = 0;
  mountainPeakMesh.count = 0;
  mountainSnowCapMesh.count = 0;
  forestMesh.count = 0;
  forestTrunkMesh.count = 0;
  scene.add(
    seaMesh,
    coastSeaMesh,
    landMeshA,
    landMeshB,
    landMeshC,
    sandMeshA,
    sandMeshB,
    sandMeshC,
    mountainPeakMesh,
    mountainSnowCapMesh,
    forestMesh,
    forestTrunkMesh,
    selectedMarker,
    hoverMarker
  );

  const tempMatrix = new Matrix4();
  const peakOffset = new Matrix4();
  const forestCanopyScaleMatrix = new Matrix4();
  const forestTrunkScaleMatrix = new Matrix4();
  const lastUpdate = { camX: Number.NaN, camY: Number.NaN, zoom: Number.NaN, width: 0, height: 0, at: 0 };
  let rafId: number | undefined;

  const mountainJitter = (_wx: number, _wy: number): { x: number; z: number; y: number } => {
    return {
      x: 0,
      z: 0,
      y: 0.14
    };
  };

  const terrainForWorldTile = (wx: number, wy: number): Tile["terrain"] => {
    const tile = deps.state.tiles.get(deps.keyFor(wx, wy));
    return tile?.terrain ?? deps.terrainAt(wx, wy);
  };
  const isCoastalSea = (wx: number, wy: number): boolean => {
    if (terrainForWorldTile(wx, wy) !== "SEA") return false;
    const neighbors = [
      terrainForWorldTile(deps.wrapX(wx), deps.wrapY(wy - 1)),
      terrainForWorldTile(deps.wrapX(wx + 1), deps.wrapY(wy)),
      terrainForWorldTile(deps.wrapX(wx), deps.wrapY(wy + 1)),
      terrainForWorldTile(deps.wrapX(wx - 1), deps.wrapY(wy))
    ];
    return neighbors.some((neighbor) => neighbor === "LAND" || neighbor === "MOUNTAIN");
  };
  const isSandTile = (wx: number, wy: number): boolean => {
    if (terrainForWorldTile(wx, wy) !== "LAND") return false;
    const biome = landBiomeAt(wx, wy);
    return biome === "SAND" || biome === "COASTAL_SAND";
  };
  const isSandAdjacentToMountain = (wx: number, wy: number): boolean => {
    const neighbors = [
      { x: deps.wrapX(wx), y: deps.wrapY(wy - 1) },
      { x: deps.wrapX(wx + 1), y: deps.wrapY(wy) },
      { x: deps.wrapX(wx), y: deps.wrapY(wy + 1) },
      { x: deps.wrapX(wx - 1), y: deps.wrapY(wy) }
    ];
    for (const neighbor of neighbors) {
      if (isSandTile(neighbor.x, neighbor.y)) return true;
    }
    return false;
  };
  const toroidDelta = (from: number, to: number, dim: number): number => {
    let delta = to - from;
    if (delta > dim / 2) delta -= dim;
    if (delta < -dim / 2) delta += dim;
    return delta;
  };
  const syncHighlightMarker = (
    marker: LineSegments,
    tile: { x: number; y: number } | undefined,
    height: number
  ): void => {
    if (!tile) {
      marker.visible = false;
      return;
    }
    const dx = toroidDelta(deps.state.camX, tile.x, WORLD_WIDTH);
    const dy = toroidDelta(deps.state.camY, tile.y, WORLD_HEIGHT);
    marker.position.set(dx + TILE_CENTER_OFFSET, height, dy + TILE_CENTER_OFFSET);
    marker.visible = true;
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

    let seaCount = 0;
    let coastSeaCount = 0;
    let landCountA = 0;
    let landCountB = 0;
    let landCountC = 0;
    let sandCountA = 0;
    let sandCountB = 0;
    let sandCountC = 0;
    let mountainPeakCount = 0;
    let mountainSnowCapCount = 0;
    let forestCount = 0;
    let forestTrunkCount = 0;

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
        if (terrain === "SEA") {
          tempMatrix.makeTranslation(x, -0.1, z);
          if (isCoastalSea(wx, wy)) {
            coastSeaMesh.setMatrixAt(coastSeaCount, tempMatrix);
            coastSeaCount += 1;
          } else {
            seaMesh.setMatrixAt(seaCount, tempMatrix);
            seaCount += 1;
          }
          continue;
        }
        if (terrain === "MOUNTAIN") {
          const variant = terrainShadeVariantAt(wx, wy);
          tempMatrix.makeTranslation(x, 0.14, z);
          if (isSandAdjacentToMountain(wx, wy)) {
            if (variant === 0) {
              sandMeshA.setMatrixAt(sandCountA, tempMatrix);
              sandCountA += 1;
            } else if (variant === 1) {
              sandMeshB.setMatrixAt(sandCountB, tempMatrix);
              sandCountB += 1;
            } else {
              sandMeshC.setMatrixAt(sandCountC, tempMatrix);
              sandCountC += 1;
            }
          } else {
            if (variant === 0) {
              landMeshA.setMatrixAt(landCountA, tempMatrix);
              landCountA += 1;
            } else if (variant === 1) {
              landMeshB.setMatrixAt(landCountB, tempMatrix);
              landCountB += 1;
            } else {
              landMeshC.setMatrixAt(landCountC, tempMatrix);
              landCountC += 1;
            }
          }
          const jitter = mountainJitter(wx, wy);
          peakOffset.makeRotationY(MOUNTAIN_SQUARE_PEAK_ROTATION_RADIANS);
          tempMatrix.copy(peakOffset);
          tempMatrix.setPosition(x + jitter.x, 0.86 + jitter.y, z + jitter.z);
          mountainPeakMesh.setMatrixAt(mountainPeakCount, tempMatrix);
          mountainPeakCount += 1;
          tempMatrix.copy(peakOffset);
          tempMatrix.setPosition(x + jitter.x, 1.38 + jitter.y, z + jitter.z);
          mountainSnowCapMesh.setMatrixAt(mountainSnowCapCount, tempMatrix);
          mountainSnowCapCount += 1;
          continue;
        }
        tempMatrix.makeTranslation(x, 0.14, z);
        const variant = terrainShadeVariantAt(wx, wy);
        if (isSandTile(wx, wy)) {
          if (variant === 0) {
            sandMeshA.setMatrixAt(sandCountA, tempMatrix);
            sandCountA += 1;
          } else if (variant === 1) {
            sandMeshB.setMatrixAt(sandCountB, tempMatrix);
            sandCountB += 1;
          } else {
            sandMeshC.setMatrixAt(sandCountC, tempMatrix);
            sandCountC += 1;
          }
        } else {
          if (variant === 0) {
            landMeshA.setMatrixAt(landCountA, tempMatrix);
            landCountA += 1;
          } else if (variant === 1) {
            landMeshB.setMatrixAt(landCountB, tempMatrix);
            landCountB += 1;
          } else {
            landMeshC.setMatrixAt(landCountC, tempMatrix);
            landCountC += 1;
          }
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
            tempMatrix.setPosition(x + tree.ox, tree.trunkY, z + tree.oz + trunkOzBias);
            forestTrunkMesh.setMatrixAt(forestTrunkCount, tempMatrix);
            forestTrunkCount += 1;

            forestCanopyScaleMatrix.makeScale(tree.canopyScale, tree.canopyScale, tree.canopyScale);
            tempMatrix.copy(forestCanopyScaleMatrix);
            tempMatrix.setPosition(x + tree.ox, tree.canopyY, z + tree.oz);
            forestMesh.setMatrixAt(forestCount, tempMatrix);
            forestCount += 1;
          }
        }
      }
    }

    seaMesh.count = seaCount;
    coastSeaMesh.count = coastSeaCount;
    landMeshA.count = landCountA;
    landMeshB.count = landCountB;
    landMeshC.count = landCountC;
    sandMeshA.count = sandCountA;
    sandMeshB.count = sandCountB;
    sandMeshC.count = sandCountC;
    mountainPeakMesh.count = mountainPeakCount;
    mountainSnowCapMesh.count = mountainSnowCapCount;
    forestMesh.count = forestCount;
    forestTrunkMesh.count = forestTrunkCount;
    seaMesh.instanceMatrix.needsUpdate = true;
    coastSeaMesh.instanceMatrix.needsUpdate = true;
    landMeshA.instanceMatrix.needsUpdate = true;
    landMeshB.instanceMatrix.needsUpdate = true;
    landMeshC.instanceMatrix.needsUpdate = true;
    sandMeshA.instanceMatrix.needsUpdate = true;
    sandMeshB.instanceMatrix.needsUpdate = true;
    sandMeshC.instanceMatrix.needsUpdate = true;
    mountainPeakMesh.instanceMatrix.needsUpdate = true;
    mountainSnowCapMesh.instanceMatrix.needsUpdate = true;
    forestMesh.instanceMatrix.needsUpdate = true;
    forestTrunkMesh.instanceMatrix.needsUpdate = true;
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
    syncHighlightMarker(selectedMarker, deps.state.selected, 0.39);
    syncHighlightMarker(hoverMarker, deps.state.hover, 0.385);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(renderLoop);
  };

  const worldTileRawFromPointer = (offsetX: number, offsetY: number): { gx: number; gy: number } => {
    const width = Math.max(1, deps.canvas.width);
    const height = Math.max(1, deps.canvas.height);
    const size = Math.max(1, deps.state.zoom);
    const halfW = Math.floor(width / size / 2);
    const halfH = Math.floor(height / size / 2);
    const dx = Math.floor(offsetX / size) - halfW;
    const dy = Math.floor(offsetY / size) - halfH;
    return {
      gx: deps.state.camX + dx,
      gy: deps.state.camY + dy
    };
  };

  const stop = (): void => {
    if (rafId !== undefined) cancelAnimationFrame(rafId);
    renderer.dispose();
    seaGeometry.dispose();
    coastSeaGeometry.dispose();
    landGeometry.dispose();
    sandGeometry.dispose();
    mountainPeakGeometry.dispose();
    mountainSnowCapGeometry.dispose();
    forestGeometry.dispose();
    forestTrunkGeometry.dispose();
    seaMaterial.dispose();
    coastSeaMaterial.dispose();
    landMaterialA.dispose();
    landMaterialB.dispose();
    landMaterialC.dispose();
    sandMaterialA.dispose();
    sandMaterialB.dispose();
    sandMaterialC.dispose();
    grassLightTexture.dispose();
    grassDarkTexture.dispose();
    sandTexture.dispose();
    seaDeepTexture.dispose();
    seaCoastTexture.dispose();
    mountainPeakMaterial.dispose();
    mountainSnowCapMaterial.dispose();
    forestCanopyMaterial.dispose();
    forestTrunkMaterial.dispose();
    markerEdgesGeometry.dispose();
    glCanvas.remove();
    delete deps.canvas.dataset.renderer;
  };

  resize();
  rafId = requestAnimationFrame(renderLoop);

  return {
    resize,
    stop,
    worldTileRawFromPointer
  };
};
