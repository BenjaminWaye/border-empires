import {
  Color,
  DataTexture,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RedFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  type Scene
} from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";
import type { TerrainWindow } from "../client-map-3d-terrain-window/client-map-3d-terrain-window.js";
import { UNEXPLORED_STORM_DARK, UNEXPLORED_STORM_LIGHT, UNEXPLORED_STORM_MID } from "../client-unexplored-storm/client-unexplored-storm-palette.js";

// Unexplored territory in the true-3D map is a bank of drifting storm cloud
// lying level with the land (just above plains/grass, ~0.18-0.2), so the
// explored world doesn't sit in a void or above a pit -- the fog is on the
// same plane as the ground it hides. A per-tile explored mask (rebuilt with
// the terrain window) cuts it away over explored tiles with a soft, cloudy
// edge that creeps a little way over the border, and faint tile-edge lines
// show through the cloud so the grid it hides is still hinted.
// 2D counterpart: client-unexplored-storm-2d.ts.
export const UNEXPLORED_STORM_Y = 0.24;
// Well past the farthest ground point the fixed-tilt camera can see at max
// zoom-out, but inside PERSPECTIVE_FAR (4000).
const STORM_PLANE_SIZE = 3600;
// Wraps the animation clock so float precision never degrades the drift.
const STORM_TIME_WRAP_SECONDS = 3600;

const STORM_VERTEX_SHADER = `
varying vec2 vSceneXZ;
varying vec2 vWorldXZ;
uniform vec2 uWorldOrigin;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vSceneXZ = wp.xz;
  vWorldXZ = wp.xz + uWorldOrigin;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const STORM_FRAGMENT_SHADER = `
varying vec2 vSceneXZ;
varying vec2 vWorldXZ;
uniform float uTime;
uniform vec3 uDark;
uniform vec3 uMid;
uniform vec3 uLight;
uniform sampler2D uMask;
uniform vec2 uMaskMin;
uniform vec2 uMaskSize;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; }
  return v / 0.9375;
}
void main() {
  vec2 w = vWorldXZ;
  vec2 drift = vec2(uTime * 0.09, uTime * 0.035);
  float body = fbm(w * 0.17 + drift * 0.17);
  float mass = fbm(w * 0.08 - drift * 0.05 + body * 0.6);

  // 1 = unexplored. Outside the built terrain window nothing is drawn, so
  // it's all fog. Bilinear filtering puts 0.5 on the tile border; the cloud
  // noise roughens that line into a billowing edge.
  vec2 uv = (vSceneXZ - uMaskMin) / uMaskSize;
  float unexplored = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? 1.0 : texture2D(uMask, uv).r;
  float coverage = smoothstep(0.3, 0.7, unexplored + (body - 0.5) * 0.35);
  if (coverage < 0.01) discard;

  vec3 col = mix(uDark, uMid, smoothstep(0.3, 0.75, (body + mass) * 0.5));
  float bright = smoothstep(0.6, 0.85, body);
  col = mix(col, uLight, bright * 0.55);
  // Slight per-tile tone so the hidden tiles read as tiles.
  col *= 0.97 + hash(floor(w)) * 0.06;

  // Faint tile-edge lines, dimmed where the cloud is thickest so they read
  // as being under it, and faded once they'd shrink under a pixel.
  vec2 edgeDist = abs(fract(w + 0.5) - 0.5);
  vec2 lineWidth = fwidth(w) * 1.2 + 0.02;
  float line = 1.0 - min(smoothstep(0.0, lineWidth.x, edgeDist.x), smoothstep(0.0, lineWidth.y, edgeDist.y));
  float lineAa = clamp(1.0 - max(fwidth(w).x, fwidth(w).y) * 6.0, 0.0, 1.0);
  col = mix(col, uDark * 0.7, line * lineAa * (0.4 - bright * 0.25));

  // Diagonal rain streaks under the densest cloud.
  float phase = (w.x - w.y) * 2.4 + fbm(w * 0.35) * 2.5 - uTime * 0.6;
  float aa = clamp(1.0 - fwidth(phase) * 0.6, 0.0, 1.0);
  float streak = smoothstep(0.86, 1.0, abs(sin(phase))) * smoothstep(0.45, 0.7, mass) * aa;
  col = mix(col, uDark * 0.8, streak * 0.4);
  gl_FragColor = vec4(col, coverage);
  #include <colorspace_fragment>
}
`;

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

const wrap = (v: number, size: number): number => ((v % size) + size) % size;

const createMaskTexture = (width: number, height: number, data: Uint8Array): DataTexture => {
  const texture = new DataTexture(data, width, height, RedFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
};

export const createUnexploredStormLayer = (scene: Scene, nowMs: () => number = () => performance.now()): UnexploredStormLayer => {
  const geometry = new PlaneGeometry(STORM_PLANE_SIZE, STORM_PLANE_SIZE);
  geometry.rotateX(-Math.PI / 2);
  let mask = createMaskTexture(1, 1, new Uint8Array([255]));
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
    // Tile (dx, dy) spans scene [dx, dx + 1] x [dy, dy + 1]; texel (i, j)
    // holds tile dx = i - halfW - 1, dy = j - halfH - 1.
    const width = window.halfW * 2 + 3;
    const height = window.halfH * 2 + 3;
    const data = new Uint8Array(width * height);
    for (let j = 0; j < height; j += 1) {
      const wy = wrap(window.camY + j - window.halfH - 1, WORLD_HEIGHT);
      for (let i = 0; i < width; i += 1) {
        const wx = wrap(window.camX + i - window.halfW - 1, WORLD_WIDTH);
        data[j * width + i] = isExploredAt(wx, wy) ? 0 : 255;
      }
    }
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
