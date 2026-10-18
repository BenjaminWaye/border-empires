// True-3D blackwood canopy clue: a thin purple spiral that rises out of a
// blackwood forest tile's canopy every BLACKWOOD_SWIRL_PERIOD_S seconds and
// fades out (client-prospect-clue.ts holds the shared timing). The whole
// animation runs in the vertex shader off one time uniform, so the terrain
// rebuild only writes each tile's position and phase -- nothing per frame on
// the CPU. 2D twin: drawBlackwoodSwirl in client-prospect-signature-overlay.ts.
import {
  CatmullRomCurve3,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  NormalBlending,
  Scene,
  ShaderMaterial,
  TubeGeometry,
  Vector3
} from "three";
import { BLACKWOOD_SWIRL_ACTIVE_S, BLACKWOOD_SWIRL_PERIOD_S, blackwoodSwirlPhaseS } from "../client-prospect-clue/client-prospect-clue.js";

// Above createForest's tallest canopy (~0.65 at tree scale 1.08).
const SWIRL_BASE_Y = 0.62;
const SWIRL_TURNS = 2.2;
const SWIRL_POINTS = 32;

const spiralPath = (): CatmullRomCurve3 => {
  const points: Vector3[] = [];
  for (let i = 0; i <= SWIRL_POINTS; i += 1) {
    const t = i / SWIRL_POINTS;
    const angle = t * SWIRL_TURNS * Math.PI * 2;
    // Widening as it climbs, so it reads as a wisp twisting up out of the canopy.
    const radius = 0.04 + t * 0.14;
    points.push(new Vector3(Math.cos(angle) * radius, t * 0.32, Math.sin(angle) * radius));
  }
  return new CatmullRomCurve3(points);
};

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  attribute float aPhase;
  varying float vAlpha;
  varying float vAlong;
  void main() {
    float t = mod(uTime + aPhase, ${BLACKWOOD_SWIRL_PERIOD_S.toFixed(1)});
    float k = clamp(t / ${BLACKWOOD_SWIRL_ACTIVE_S.toFixed(2)}, 0.0, 1.0);
    float angle = k * 3.0;
    float c = cos(angle);
    float s = sin(angle);
    vec3 p = position;
    p.xz = mat2(c, -s, s, c) * p.xz * (0.7 + 0.6 * k);
    p.y += k * 0.24;
    vAlpha = step(t, ${BLACKWOOD_SWIRL_ACTIVE_S.toFixed(2)}) * sin(3.14159 * k);
    vAlong = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying float vAlpha;
  varying float vAlong;
  void main() {
    float taper = smoothstep(0.0, 0.2, vAlong) * smoothstep(1.0, 0.75, vAlong);
    float alpha = vAlpha * taper * 0.85;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(0.66, 0.38, 0.95, alpha);
  }
`;

export type BlackwoodSwirls = {
  readonly clear: () => void;
  /** `canopyY`: the tile's highest point, where its forest stands. */
  readonly addTile: (sceneX: number, sceneZ: number, canopyY: number, worldX: number, worldZ: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createBlackwoodSwirls = (scene: Scene, maxTiles: number, nowS: () => number = () => performance.now() / 1000): BlackwoodSwirls => {
  const geometry = new TubeGeometry(spiralPath(), SWIRL_POINTS * 2, 0.016, 4, false);
  const phases = new InstancedBufferAttribute(new Float32Array(maxTiles), 1);
  geometry.setAttribute("aPhase", phases);
  const uniforms = { uTime: { value: 0 } };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide
  });
  const mesh = new InstancedMesh(geometry, material, maxTiles);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.onBeforeRender = () => {
    uniforms.uTime.value = nowS();
  };
  scene.add(mesh);

  const matrix = new Matrix4();
  let count = 0;

  const addTile: BlackwoodSwirls["addTile"] = (sceneX, sceneZ, canopyY, worldX, worldZ) => {
    if (count >= maxTiles) return;
    mesh.setMatrixAt(count, matrix.makeTranslation(sceneX, canopyY + SWIRL_BASE_Y, sceneZ));
    phases.setX(count, blackwoodSwirlPhaseS(worldX, worldZ));
    count += 1;
  };

  const commit = (): void => {
    mesh.count = count;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, count * 16);
    mesh.instanceMatrix.needsUpdate = true;
    phases.clearUpdateRanges();
    phases.addUpdateRange(0, count);
    phases.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  };

  return { clear: () => { count = 0; }, addTile, commit, dispose };
};
