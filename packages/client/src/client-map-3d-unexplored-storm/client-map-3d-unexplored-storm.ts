import { Color, Mesh, PlaneGeometry, ShaderMaterial, Vector2, type Scene } from "three";
import { UNEXPLORED_STORM_DARK, UNEXPLORED_STORM_LIGHT, UNEXPLORED_STORM_MID } from "../client-unexplored-storm/client-unexplored-storm-palette.js";

// Unexplored territory in the true-3D map is simply not drawn, so whatever
// sits under the terrain shows through there. This is that layer: a huge
// horizontal sheet of drifting storm clouds just below the land and sea
// skirts (SKIRT_BOTTOM_Y = -0.6), so explored ground reads as standing above
// a cloud bank instead of floating in a black void. Depth testing hides it
// under every drawn tile; it only shows where nothing else is drawn.
// 2D counterpart: client-unexplored-storm-2d.ts.
export const UNEXPLORED_STORM_Y = -0.72;
// Well past the farthest ground point the fixed-tilt camera can see at max
// zoom-out, but inside PERSPECTIVE_FAR (4000).
const STORM_PLANE_SIZE = 3600;
// Wraps the animation clock so float precision never degrades the drift.
const STORM_TIME_WRAP_SECONDS = 3600;

const STORM_VERTEX_SHADER = `
varying vec2 vWorldXZ;
uniform vec2 uWorldOrigin;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldXZ = wp.xz + uWorldOrigin;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const STORM_FRAGMENT_SHADER = `
varying vec2 vWorldXZ;
uniform float uTime;
uniform vec3 uDark;
uniform vec3 uMid;
uniform vec3 uLight;
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
  vec3 col = mix(uDark, uMid, smoothstep(0.3, 0.75, (body + mass) * 0.5));
  col = mix(col, uLight, smoothstep(0.6, 0.85, body) * 0.55);
  // Diagonal rain streaks under the densest cloud, faded out once they
  // shrink below a pixel or two so a zoomed-out view doesn't moire.
  float phase = (w.x - w.y) * 2.4 + fbm(w * 0.35) * 2.5 - uTime * 0.6;
  float aa = clamp(1.0 - fwidth(phase) * 0.6, 0.0, 1.0);
  float streak = smoothstep(0.86, 1.0, abs(sin(phase))) * smoothstep(0.45, 0.7, mass) * aa;
  col = mix(col, uDark * 0.8, streak * 0.4);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export type UnexploredStormLayer = {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  /** Keeps the sheet under the camera's live look-at point (scene coords). */
  readonly recenter: (sceneX: number, sceneZ: number) => void;
  /** World tile coords of the scene origin, so the clouds stay world-anchored across re-anchors. */
  readonly setWorldOrigin: (worldX: number, worldZ: number) => void;
  readonly dispose: () => void;
};

export const createUnexploredStormLayer = (scene: Scene, nowMs: () => number = () => performance.now()): UnexploredStormLayer => {
  const geometry = new PlaneGeometry(STORM_PLANE_SIZE, STORM_PLANE_SIZE);
  geometry.rotateX(-Math.PI / 2);
  const material = new ShaderMaterial({
    toneMapped: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uWorldOrigin: { value: new Vector2(0, 0) },
      uDark: { value: new Color(UNEXPLORED_STORM_DARK) },
      uMid: { value: new Color(UNEXPLORED_STORM_MID) },
      uLight: { value: new Color(UNEXPLORED_STORM_LIGHT) }
    },
    vertexShader: STORM_VERTEX_SHADER,
    fragmentShader: STORM_FRAGMENT_SHADER
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.y = UNEXPLORED_STORM_Y;
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.onBeforeRender = () => {
    material.uniforms.uTime!.value = (nowMs() / 1000) % STORM_TIME_WRAP_SECONDS;
  };
  scene.add(mesh);

  return {
    mesh,
    material,
    recenter: (sceneX, sceneZ) => {
      mesh.position.x = sceneX;
      mesh.position.z = sceneZ;
    },
    setWorldOrigin: (worldX, worldZ) => {
      (material.uniforms.uWorldOrigin!.value as Vector2).set(worldX, worldZ);
    },
    dispose: () => {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    }
  };
};
