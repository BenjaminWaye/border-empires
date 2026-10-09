import {
  Color,
  DataTexture,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RGFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  type Scene
} from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";
import type { TerrainWindow } from "../client-map-3d-terrain-window/client-map-3d-terrain-window.js";
import {
  UNEXPLORED_FOAM,
  UNEXPLORED_PARCHMENT,
  UNEXPLORED_PARCHMENT_INK,
  UNEXPLORED_STORM_DARK,
  UNEXPLORED_STORM_INK,
  UNEXPLORED_STORM_LIGHT,
  UNEXPLORED_STORM_MID
} from "../client-unexplored-storm/client-unexplored-storm-palette.js";
import { STORM_FRAGMENT_SHADER, STORM_VERTEX_SHADER } from "./client-map-3d-unexplored-storm-shader.js";
import { buildUnexploredStormMask } from "./client-unexplored-storm-mask.js";

// Unexplored territory in the true-3D map is a bank of hatched storm cloud
// lying level with the land (just above plains/grass, ~0.18-0.2), so the
// explored world doesn't sit in a void or above a pit -- the fog is on the
// same plane as the ground it hides. A per-tile explored mask (rebuilt with
// the terrain window) cuts it away over explored tiles, edged with a foam
// rim and a parchment band; faint tile-edge lines show through the cloud so
// the grid it hides is still hinted. Look and layering:
// client-map-3d-unexplored-storm-shader.ts.
// 2D counterpart: client-unexplored-storm-2d.ts.
export const UNEXPLORED_STORM_Y = 0.24;
// Well past the farthest ground point the fixed-tilt camera can see at max
// zoom-out, but inside PERSPECTIVE_FAR (4000).
const STORM_PLANE_SIZE = 3600;
// Wraps the animation clock so float precision never degrades the drift.
const STORM_TIME_WRAP_SECONDS = 3600;

export type UnexploredStormLayer = {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  /** Keeps the sheet under the camera's live look-at point (scene coords). */
  readonly recenter: (sceneX: number, sceneZ: number) => void;
  /**
   * Re-anchors the clouds to the new scene origin (the window's camX/camY)
   * and rebuilds the explored mask over the window plus a one-tile ring.
   */
  readonly rebuild: (window: TerrainWindow, isExploredAt: (wx: number, wy: number) => boolean) => void;
  readonly dispose: () => void;
};

const createMaskTexture = (width: number, height: number, data: Uint8Array): DataTexture => {
  const texture = new DataTexture(data, width, height, RGFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.unpackAlignment = 1; // RG8 rows of odd width are not 4-byte aligned
  texture.needsUpdate = true;
  return texture;
};

export const createUnexploredStormLayer = (scene: Scene, nowMs: () => number = () => performance.now()): UnexploredStormLayer => {
  const geometry = new PlaneGeometry(STORM_PLANE_SIZE, STORM_PLANE_SIZE);
  geometry.rotateX(-Math.PI / 2);
  let mask = createMaskTexture(1, 1, new Uint8Array([255, 255]));
  const material = new ShaderMaterial({
    toneMapped: false,
    fog: false,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uWorldOrigin: { value: new Vector2(0, 0) },
      uDark: { value: new Color(UNEXPLORED_STORM_DARK) },
      uMid: { value: new Color(UNEXPLORED_STORM_MID) },
      uLight: { value: new Color(UNEXPLORED_STORM_LIGHT) },
      uInk: { value: new Color(UNEXPLORED_STORM_INK) },
      uParchment: { value: new Color(UNEXPLORED_PARCHMENT) },
      uParchmentInk: { value: new Color(UNEXPLORED_PARCHMENT_INK) },
      uFoam: { value: new Color(UNEXPLORED_FOAM) },
      uMask: { value: mask },
      uMaskMin: { value: new Vector2(-1e6, -1e6) },
      uMaskSize: { value: new Vector2(2e6, 2e6) }
    },
    vertexShader: STORM_VERTEX_SHADER,
    fragmentShader: STORM_FRAGMENT_SHADER
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.y = UNEXPLORED_STORM_Y;
  mesh.frustumCulled = false;
  mesh.renderOrder = RENDER_ORDER.unexploredStorm;
  mesh.onBeforeRender = () => {
    material.uniforms.uTime!.value = (nowMs() / 1000) % STORM_TIME_WRAP_SECONDS;
  };
  scene.add(mesh);

  const rebuild = (window: TerrainWindow, isExploredAt: (wx: number, wy: number) => boolean): void => {
    (material.uniforms.uWorldOrigin!.value as Vector2).set(window.camX, window.camY);
    // Tile (dx, dy) spans scene [dx, dx + 1] x [dy, dy + 1].
    const { width, height, data } = buildUnexploredStormMask(window, WORLD_WIDTH, WORLD_HEIGHT, isExploredAt);
    mask.dispose();
    mask = createMaskTexture(width, height, data);
    material.uniforms.uMask!.value = mask;
    (material.uniforms.uMaskMin!.value as Vector2).set(-window.halfW - 1, -window.halfH - 1);
    (material.uniforms.uMaskSize!.value as Vector2).set(width, height);
  };

  return {
    mesh,
    material,
    recenter: (sceneX, sceneZ) => {
      mesh.position.x = sceneX;
      mesh.position.z = sceneZ;
    },
    rebuild,
    dispose: () => {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      mask.dispose();
    }
  };
};
