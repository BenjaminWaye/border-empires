import { Color, DataTexture, LinearFilter, Mesh, PlaneGeometry, RGBAFormat, ShaderMaterial, UnsignedByteType, Vector2, type Scene } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";
import type { TerrainWindow } from "../client-map-3d-terrain-window/client-map-3d-terrain-window.js";
import type { TileVisibilityState } from "../client-types.js";
import { encodeUnexploredStormMask } from "../client-map-3d-unexplored-storm/client-unexplored-storm-mask.js";
import {
  FOGGED_MIST_HAZE,
  FOGGED_MIST_LIGHT,
  FOGGED_MIST_MAX_OPACITY,
  FOGGED_MIST_MIN_OPACITY,
  FOGGED_WASH,
  FOGGED_WASH_OPACITY
} from "../client-unexplored-storm/client-unexplored-storm-palette.js";
import { FOGGED_MIST_FRAGMENT_SHADER, FOGGED_MIST_VERTEX_SHADER } from "./client-map-3d-fogged-mist-shader.js";

// Remembered ("fogged") tiles in the true-3D map lie under a sheet of
// drifting mist, level with the land just like the unexplored storm
// (client-map-3d-unexplored-storm.ts), so trees, hills and peaks rise out of
// it. Underneath, client-map-3d.ts still dims the tiles themselves (slate
// wash, tinted features and water); the mist is what makes them read as fog.
// A per-tile mask (rebuilt with the terrain window) keeps it off tiles in
// sight; its edge bends through the first ring past them like the storm's
// coast (client-map-3d-fogged-mist-shader.ts). Unexplored tiles get mist
// too, under the storm, so none shows between the two fogs.
// 2D counterpart: client-fogged-mist-2d.ts.
// Just above the unexplored storm's plane (0.27, over the highest flat land),
// so bumpy remembered ground never pokes through it in patches.
export const FOGGED_MIST_Y = 0.29;
// Same reach as the storm sheet: past the farthest ground the camera sees.
const MIST_PLANE_SIZE = 3600;
const MIST_TIME_WRAP_SECONDS = 3600;

type VisibilityAt = (wx: number, wy: number) => TileVisibilityState;
type TileFlagAt = (wx: number, wy: number) => boolean;

export type FoggedMistLayer = {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  /** Keeps the sheet under the camera's live look-at point (scene coords). */
  readonly recenter: (sceneX: number, sceneZ: number) => void;
  /**
   * Re-anchors the mist to the window's camX/camY and rebuilds its mask over
   * the window plus a one-tile ring. `washesAt`: fogged flat land whose slate
   * wash the mist draws (cut at its edge) instead of client-map-3d.ts.
   */
  readonly rebuild: (window: TerrainWindow, visibilityAt: VisibilityAt, washesAt?: TileFlagAt) => void;
  readonly dispose: () => void;
};

/**
 * One RGBA texel per tile over the window plus a one-tile ring (texel (i, j)
 * holds tile dx = i - halfW - 1, dy = j - halfH - 1 from camX/camY), in the
 * unexplored storm's layout (client-unexplored-storm-mask.ts) with "explored"
 * read as "in sight": R 255 off sight, G the blurred field the edge is cut
 * from, B unused; A 255 where the mist draws the tile's slate wash.
 */
export const encodeFoggedMistMask = (
  window: TerrainWindow,
  worldWidth: number,
  worldHeight: number,
  visibilityAt: VisibilityAt,
  washesAt: TileFlagAt = () => false
): { readonly width: number; readonly height: number; readonly data: Uint8Array } => {
  const width = window.halfW * 2 + 3;
  const height = window.halfH * 2 + 3;
  const inSight = new Float32Array(width * height);
  const washes = new Uint8Array(width * height);
  for (let j = 0; j < height; j += 1) {
    const wy = (((window.camY + j - window.halfH - 1) % worldHeight) + worldHeight) % worldHeight;
    for (let i = 0; i < width; i += 1) {
      const wx = (((window.camX + i - window.halfW - 1) % worldWidth) + worldWidth) % worldWidth;
      inSight[j * width + i] = visibilityAt(wx, wy) === "visible" ? 1 : 0;
      washes[j * width + i] = washesAt(wx, wy) ? 255 : 0;
    }
  }
  const mask = encodeUnexploredStormMask(width, height, inSight);
  for (let t = 0; t < width * height; t += 1) mask.data[t * 4 + 3] = washes[t]!;
  return mask;
};

const createMaskTexture = (width: number, height: number, data: Uint8Array): DataTexture => {
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
};

export const createFoggedMistLayer = (scene: Scene, nowMs: () => number = () => performance.now()): FoggedMistLayer => {
  const geometry = new PlaneGeometry(MIST_PLANE_SIZE, MIST_PLANE_SIZE);
  geometry.rotateX(-Math.PI / 2);
  let mask = createMaskTexture(1, 1, new Uint8Array([0, 0, 0, 0]));
  const material = new ShaderMaterial({
    toneMapped: false,
    fog: false,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uWorldOrigin: { value: new Vector2(0, 0) },
      uHaze: { value: new Color(FOGGED_MIST_HAZE) },
      uLight: { value: new Color(FOGGED_MIST_LIGHT) },
      uWash: { value: new Color(FOGGED_WASH) },
      uWashOpacity: { value: FOGGED_WASH_OPACITY },
      uMinOpacity: { value: FOGGED_MIST_MIN_OPACITY },
      uMaxOpacity: { value: FOGGED_MIST_MAX_OPACITY },
      uMask: { value: mask },
      uMaskMin: { value: new Vector2(-1e6, -1e6) },
      uMaskSize: { value: new Vector2(2e6, 2e6) }
    },
    vertexShader: FOGGED_MIST_VERTEX_SHADER,
    fragmentShader: FOGGED_MIST_FRAGMENT_SHADER
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.y = FOGGED_MIST_Y;
  mesh.frustumCulled = false;
  mesh.renderOrder = RENDER_ORDER.foggedMist;
  mesh.onBeforeRender = () => {
    material.uniforms.uTime!.value = (nowMs() / 1000) % MIST_TIME_WRAP_SECONDS;
  };
  scene.add(mesh);

  const rebuild = (window: TerrainWindow, visibilityAt: VisibilityAt, washesAt?: TileFlagAt): void => {
    (material.uniforms.uWorldOrigin!.value as Vector2).set(window.camX, window.camY);
    const next = encodeFoggedMistMask(window, WORLD_WIDTH, WORLD_HEIGHT, visibilityAt, washesAt);
    mask.dispose();
    mask = createMaskTexture(next.width, next.height, next.data);
    material.uniforms.uMask!.value = mask;
    // Tile (dx, dy) spans scene [dx, dx + 1] x [dy, dy + 1].
    (material.uniforms.uMaskMin!.value as Vector2).set(-window.halfW - 1, -window.halfH - 1);
    (material.uniforms.uMaskSize!.value as Vector2).set(next.width, next.height);
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
