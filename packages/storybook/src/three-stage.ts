import {
  AmbientLight,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer
} from "three";

export type Stage = {
  readonly canvas: HTMLCanvasElement;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly dispose: () => void;
};

export type StageOptions = {
  readonly width?: number;
  readonly height?: number;
  readonly cameraDistance?: number;
  readonly cameraTilt?: number;
  readonly background?: string;
};

export const createStage = (opts: StageOptions = {}): Stage => {
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const cameraDistance = opts.cameraDistance ?? 14;
  const cameraTilt = opts.cameraTilt ?? 0.6;

  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "auto";

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  if (opts.background !== undefined) {
    renderer.setClearColor(opts.background, 1);
  }

  const scene = new Scene();

  const camera = new PerspectiveCamera(45, width / height, 0.1, 4000);
  const horizontal = Math.sin(cameraTilt) * cameraDistance;
  const vertical = Math.cos(cameraTilt) * cameraDistance;
  camera.position.set(0, vertical, horizontal);
  camera.lookAt(0, 0, 0);

  const ambient = new AmbientLight(0xffffff, 0.55);
  const sun = new DirectionalLight(0xffffff, 0.9);
  sun.position.set(8, 14, 6);
  scene.add(ambient, sun);

  let rafId = 0;
  const tick = (): void => {
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  };
  tick();

  const dispose = (): void => {
    cancelAnimationFrame(rafId);
    renderer.dispose();
  };

  return { canvas, scene, camera, renderer, dispose };
};

export type GridArgs = {
  readonly radius: number;
  readonly spacing: number;
};

export const forEachGridCell = (
  args: GridArgs,
  visit: (worldX: number, worldZ: number) => void
): void => {
  const { radius, spacing } = args;
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      visit(dx * spacing, dz * spacing);
    }
  }
};

// Matches legacy3DTerrainPalette.grassLight/grassDark in
// client-map-3d-terrain-textures.ts, without pulling in that module's full
// procedural-texture pipeline for a Storybook ground plane. Checkerboard
// shading + a thin gap between tiles reads as individual map tiles, the
// same way a wonder actually sits on one grass tile in-game.
const GRASS_LIGHT = "#778e42"; // rgb(119, 142, 66)
const GRASS_DARK = "#5e7c30"; // rgb(94, 124, 48)
const GRASS_TILE_GAP = 0.04;

/**
 * A field of grass tiles surrounding a wonder's own multi-tile ground
 * effect. `holeRadius` (in whole tiles, Chebyshev distance from center)
 * leaves that many tiles unfilled at the center so the wonder's own
 * ground shader — sized to match — can occupy them without a grass tile
 * poking through underneath. holeRadius 1 = skip the center tile plus its
 * 8 neighbors (a 3x3 hole), matching a wonder that visually spans its 8
 * neighbor tiles while only actually occupying the one center tile.
 */
export const createGrassGround = (radius: number, holeRadius = 0): { group: Group; dispose: () => void } => {
  const group = new Group();
  const geometry = new PlaneGeometry(1 - GRASS_TILE_GAP, 1 - GRASS_TILE_GAP);
  const lightMat = new MeshStandardMaterial({ color: GRASS_LIGHT, roughness: 0.95, metalness: 0 });
  const darkMat = new MeshStandardMaterial({ color: GRASS_DARK, roughness: 0.95, metalness: 0 });
  for (let gz = -radius; gz <= radius; gz += 1) {
    for (let gx = -radius; gx <= radius; gx += 1) {
      if (holeRadius > 0 && Math.max(Math.abs(gx), Math.abs(gz)) <= holeRadius) continue;
      const tile = new Mesh(geometry, (gx + gz) % 2 === 0 ? lightMat : darkMat);
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(gx, -0.01, gz);
      group.add(tile);
    }
  }
  const dispose = (): void => { geometry.dispose(); lightMat.dispose(); darkMat.dispose(); };
  return { group, dispose };
};

export const wrapWithCleanup = (stage: Stage, cleanups: ReadonlyArray<() => void>): HTMLElement => {
  const container = document.createElement("div");
  container.style.position = "relative";
  container.style.background = "#0a0e14";
  container.appendChild(stage.canvas);

  const observer = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      for (const fn of cleanups) {
        try { fn(); } catch { /* ignore */ }
      }
      stage.dispose();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return container;
};
