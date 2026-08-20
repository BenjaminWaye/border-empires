import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  SphereGeometry
} from "three";

const MAX_SMOKE_VILLAGES = 1024;
const SMOKE_PUFFS_PER_VILLAGE = 4;
const MAX_SMOKE_PUFFS = MAX_SMOKE_VILLAGES * SMOKE_PUFFS_PER_VILLAGE;
const SMOKE_PUFF_RADIUS = 0.06;
const SMOKE_RISE_HEIGHT = 1.7;
const SMOKE_BASE_Y = 0.35;
// Slower cycle so each puff drifts upward at a calmer pace.
const SMOKE_CYCLE_MS = 8500;

// Three dark grey smoke columns for recently captured towns. Distinct mesh so
// the material/opacity can read as "burning / unstable" without affecting the
// pale owned-village puffs.
const MAX_CAPTURED_TOWNS = 512;
const CAPTURED_COLUMNS_PER_TOWN = 3;
const CAPTURED_PUFFS_PER_COLUMN = 6;
const CAPTURED_PUFFS_PER_TOWN = CAPTURED_COLUMNS_PER_TOWN * CAPTURED_PUFFS_PER_COLUMN;
const MAX_CAPTURED_PUFFS = MAX_CAPTURED_TOWNS * CAPTURED_PUFFS_PER_TOWN;
const CAPTURED_PUFF_RADIUS = 0.075;
const CAPTURED_RISE_HEIGHT = 2.6;
const CAPTURED_BASE_Y = 0.32;
const CAPTURED_CYCLE_MS = 6500;
const CAPTURED_COLUMN_RADIUS = 0.22;

const MAX_CAPITAL_BANNERS = 256;
const BANNER_POLE_HEIGHT = 1.55;
const BANNER_POLE_BASE_Y = 0.1;
const BANNER_PLANE_WIDTH = 1.05;
const BANNER_PLANE_HEIGHT = 0.62;
const BANNER_OFFSET_X = 0.32;
const BANNER_OFFSET_Y = 1.05;
const BANNER_FLUTTER_SEGMENTS_X = 6;
const BANNER_FLUTTER_SEGMENTS_Y = 3;

export type VillageEffects = {
  readonly smokeMesh: InstancedMesh;
  readonly bannerMesh: InstancedMesh;
  readonly poleMesh: InstancedMesh;
  readonly capturedSmokeMesh: InstancedMesh;
  readonly clear: () => void;
  readonly addOwnedVillage: (
    worldX: number,
    worldZ: number,
    surfaceY: number,
    seed: number
  ) => void;
  readonly addCapturedTownSmoke: (
    worldX: number,
    worldZ: number,
    surfaceY: number,
    seed: number
  ) => void;
  readonly addCapitalBanner: (
    worldX: number,
    worldZ: number,
    surfaceY: number,
    color: string,
    seed: number
  ) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

type SmokeRecord = {
  worldX: number;
  worldZ: number;
  surfaceY: number;
  seed: number;
};

type BannerRecord = {
  worldX: number;
  worldZ: number;
  surfaceY: number;
  seed: number;
};

// Smoke puffs used to be animated on the CPU: every frame, every puff's rise/
// drift/scale/fade was recomputed from `phase = f(nowMs, seed)` and written
// into instanceMatrix + instanceColor, then the *entire* buffer was
// re-uploaded to the GPU via bufferSubData — for up to ~7,000 combined
// instances, 60 times a second, regardless of whether the camera or game
// state had changed at all. A CPU trace confirmed WebGL buffer uploads as
// the dominant per-frame cost across the 3D renderer.
//
// Puff animation is now GPU-driven: each puff's *base* world position and a
// per-instance phase offset/seed are written once, only when the underlying
// village/captured-town list changes (i.e. from `commit()`, called from the
// throttled terrain rebuild — not every animation frame). A vertex shader
// injected via `onBeforeCompile` computes rise/drift/scale/fade from a single
// `uTime` uniform every frame instead. Advancing that uniform is one JS
// number write per material per frame — no per-instance loop, no
// bufferSubData at all on an idle-camera frame.
type SmokeAnimUniforms = {
  uTime: { value: number };
};

type SmokeAnimConfig = {
  cycleMs: number;
  riseHeight: number;
  driftXAmp: number;
  driftZAmp: number;
  scaleBase: number;
  scaleAmp: number;
  fadeMul: number;
  fadeAlphaScale: number;
  fadeAdd: number;
};

// Injects the puff rise/drift/scale/fade math into an unlit MeshBasicMaterial's
// shader. Reproduces the original CPU formulas exactly:
//   phase   = ((nowMs + phaseOffset) % cycleMs) / cycleMs
//   rise    = phase * riseHeight
//   drift   = sin(phase*2pi + seed) * driftXAmp * phase
//   driftZ  = cos(phase*2pi + seed*1.7) * driftZAmp * phase
//   scale   = scaleBase + phase * scaleAmp
//   fade    = fadeMul * (1 - phase*fadeAlphaScale) + fadeAdd
// `fade` multiplies the fragment's RGB (matching the original's per-instance
// `color.multiplyScalar(fade)` via instanceColor) rather than alpha, so the
// blended-pixel output is identical under both AdditiveBlending and
// NormalBlending.
const attachSmokeAnimation = (
  material: MeshBasicMaterial,
  config: SmokeAnimConfig
): SmokeAnimUniforms => {
  const uniforms: SmokeAnimUniforms = { uTime: { value: 0 } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float aPhaseOffset;
attribute float aSeedX;
attribute float aSeedZ;
uniform float uTime;
varying float vFade;`
      )
      .replace(
        "#include <project_vertex>",
        `float phase = mod( uTime + aPhaseOffset, ${config.cycleMs.toFixed(1)} ) / ${config.cycleMs.toFixed(1)};
float rise = phase * ${config.riseHeight.toFixed(4)};
float drift = sin( phase * 6.283185307 + aSeedX ) * ${config.driftXAmp.toFixed(4)} * phase;
float driftZ = cos( phase * 6.283185307 + aSeedZ ) * ${config.driftZAmp.toFixed(4)} * phase;
float puffScale = ${config.scaleBase.toFixed(4)} + phase * ${config.scaleAmp.toFixed(4)};
vFade = ${config.fadeMul.toFixed(4)} * ( 1.0 - phase * ${config.fadeAlphaScale.toFixed(4)} ) + ${config.fadeAdd.toFixed(4)};
vec4 mvPosition = vec4( transformed * puffScale, 1.0 );
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition.xyz += vec3( drift, rise, driftZ );
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying float vFade;`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
diffuseColor.rgb *= vFade;`
      );
  };
  // Distinguishes this material's compiled program from a plain
  // MeshBasicMaterial's — onBeforeCompile alone isn't part of three's
  // program cache key.
  material.customProgramCacheKey = () => "village-fx-smoke-anim";
  return uniforms;
};

export const createVillageEffects = (scene: Scene): VillageEffects => {
  const smokeGeometry = new SphereGeometry(SMOKE_PUFF_RADIUS, 8, 6);
  smokeGeometry.setAttribute("aPhaseOffset", new InstancedBufferAttribute(new Float32Array(MAX_SMOKE_PUFFS), 1));
  smokeGeometry.setAttribute("aSeedX", new InstancedBufferAttribute(new Float32Array(MAX_SMOKE_PUFFS), 1));
  smokeGeometry.setAttribute("aSeedZ", new InstancedBufferAttribute(new Float32Array(MAX_SMOKE_PUFFS), 1));
  const smokeMaterial = new MeshBasicMaterial({ toneMapped: false,
    color: "#d8d3c4",
    transparent: true,
    opacity: 0.32,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const smokeUniforms = attachSmokeAnimation(smokeMaterial, {
    cycleMs: SMOKE_CYCLE_MS,
    riseHeight: SMOKE_RISE_HEIGHT,
    driftXAmp: 0.18,
    driftZAmp: 0.12,
    scaleBase: 0.6,
    scaleAmp: 1.6,
    fadeMul: 0.55,
    fadeAlphaScale: 1,
    fadeAdd: 0.18
  });
  const smokeMesh = new InstancedMesh(smokeGeometry, smokeMaterial, MAX_SMOKE_PUFFS);
  smokeMesh.frustumCulled = false;
  smokeMesh.count = 0;

  // Captured-town smoke: darker, more opaque, no additive blend so columns
  // read as solid soot against the sky rather than the wispy pale puffs above.
  const capturedSmokeGeometry = new SphereGeometry(CAPTURED_PUFF_RADIUS, 8, 6);
  capturedSmokeGeometry.setAttribute(
    "aPhaseOffset",
    new InstancedBufferAttribute(new Float32Array(MAX_CAPTURED_PUFFS), 1)
  );
  capturedSmokeGeometry.setAttribute(
    "aSeedX",
    new InstancedBufferAttribute(new Float32Array(MAX_CAPTURED_PUFFS), 1)
  );
  capturedSmokeGeometry.setAttribute(
    "aSeedZ",
    new InstancedBufferAttribute(new Float32Array(MAX_CAPTURED_PUFFS), 1)
  );
  const capturedSmokeMaterial = new MeshBasicMaterial({ toneMapped: false,
    color: "#3a3a3a",
    transparent: true,
    opacity: 0.7,
    depthWrite: false
  });
  const capturedSmokeUniforms = attachSmokeAnimation(capturedSmokeMaterial, {
    cycleMs: CAPTURED_CYCLE_MS,
    riseHeight: CAPTURED_RISE_HEIGHT,
    driftXAmp: 0.12,
    driftZAmp: 0.1,
    scaleBase: 0.7,
    scaleAmp: 1.4,
    fadeMul: 0.85,
    fadeAlphaScale: 0.7,
    fadeAdd: 0
  });
  const capturedSmokeMesh = new InstancedMesh(capturedSmokeGeometry, capturedSmokeMaterial, MAX_CAPTURED_PUFFS);
  capturedSmokeMesh.frustumCulled = false;
  capturedSmokeMesh.count = 0;

  const poleGeometry = new CylinderGeometry(0.025, 0.03, BANNER_POLE_HEIGHT, 5);
  const poleMaterial = new MeshStandardMaterial({
    color: "#3a2c20",
    roughness: 0.85,
    metalness: 0,
    flatShading: true
  });
  const poleMesh = new InstancedMesh(poleGeometry, poleMaterial, MAX_CAPITAL_BANNERS);
  poleMesh.frustumCulled = false;
  poleMesh.count = 0;

  const bannerGeometry = new PlaneGeometry(
    BANNER_PLANE_WIDTH,
    BANNER_PLANE_HEIGHT,
    BANNER_FLUTTER_SEGMENTS_X,
    BANNER_FLUTTER_SEGMENTS_Y
  );
  const bannerPositionAttr = bannerGeometry.attributes.position as BufferAttribute | undefined;
  let bannerBaseXY: Float32Array | undefined;
  if (bannerPositionAttr) {
    const arr = bannerPositionAttr.array as Float32Array;
    bannerBaseXY = new Float32Array(arr.length);
    bannerBaseXY.set(arr);
  }
  const bannerMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.78,
    metalness: 0,
    side: DoubleSide,
    flatShading: false
  });
  const bannerMesh = new InstancedMesh(bannerGeometry, bannerMaterial, MAX_CAPITAL_BANNERS);
  bannerMesh.frustumCulled = false;
  bannerMesh.count = 0;

  scene.add(poleMesh, bannerMesh, smokeMesh, capturedSmokeMesh);

  const villages: SmokeRecord[] = [];
  const capturedTowns: SmokeRecord[] = [];
  const banners: Array<BannerRecord & { color: Color }> = [];

  const tempMatrix = new Matrix4();

  const clear = (): void => {
    villages.length = 0;
    capturedTowns.length = 0;
    banners.length = 0;
  };

  const addOwnedVillage = (worldX: number, worldZ: number, surfaceY: number, seed: number): void => {
    if (villages.length >= MAX_SMOKE_VILLAGES) return;
    villages.push({ worldX, worldZ, surfaceY, seed });
  };

  const addCapturedTownSmoke = (worldX: number, worldZ: number, surfaceY: number, seed: number): void => {
    if (capturedTowns.length >= MAX_CAPTURED_TOWNS) return;
    capturedTowns.push({ worldX, worldZ, surfaceY, seed });
  };

  const addCapitalBanner = (
    worldX: number,
    worldZ: number,
    surfaceY: number,
    color: string,
    seed: number
  ): void => {
    if (banners.length >= MAX_CAPITAL_BANNERS) return;
    banners.push({ worldX, worldZ, surfaceY, seed, color: new Color(color) });
  };

  // Flushes the three per-instance shader input attributes (base position via
  // instanceMatrix, phase offset, seedX/seedZ) for a smoke mesh after its
  // puff count and per-puff values have been written into `mesh`'s
  // attributes by the caller. Only runs once per village/captured-town list
  // change (from commit()) — not every animation frame.
  const flushSmokeAttributes = (mesh: InstancedMesh, puffCount: number): void => {
    mesh.count = puffCount;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
    mesh.instanceMatrix.needsUpdate = true;
    for (const attrName of ["aPhaseOffset", "aSeedX", "aSeedZ"] as const) {
      const attr = mesh.geometry.getAttribute(attrName) as InstancedBufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, mesh.count);
      attr.needsUpdate = true;
    }
  };

  // Writes each owned-village puff's static base position + per-instance
  // shader inputs. Mirrors the original per-frame CPU loop exactly, just
  // computed once (here) instead of every animation frame.
  const commitVillageSmoke = (): void => {
    const phaseOffsetAttr = smokeMesh.geometry.getAttribute("aPhaseOffset") as InstancedBufferAttribute;
    const seedXAttr = smokeMesh.geometry.getAttribute("aSeedX") as InstancedBufferAttribute;
    const seedZAttr = smokeMesh.geometry.getAttribute("aSeedZ") as InstancedBufferAttribute;
    let puff = 0;
    for (const v of villages) {
      for (let i = 0; i < SMOKE_PUFFS_PER_VILLAGE; i += 1) {
        if (puff >= MAX_SMOKE_PUFFS) break;
        const phaseOffset = (v.seed * 73 + i * 1100) % SMOKE_CYCLE_MS;
        tempMatrix.makeTranslation(v.worldX, v.surfaceY + SMOKE_BASE_Y, v.worldZ);
        smokeMesh.setMatrixAt(puff, tempMatrix);
        phaseOffsetAttr.setX(puff, phaseOffset);
        seedXAttr.setX(puff, v.seed);
        seedZAttr.setX(puff, v.seed * 1.7);
        puff += 1;
      }
    }
    flushSmokeAttributes(smokeMesh, puff);
  };

  // Writes each captured-town smoke column's puffs. Mirrors the original
  // per-frame CPU loop (including its column layout) exactly.
  const commitCapturedSmoke = (): void => {
    const phaseOffsetAttr = capturedSmokeMesh.geometry.getAttribute("aPhaseOffset") as InstancedBufferAttribute;
    const seedXAttr = capturedSmokeMesh.geometry.getAttribute("aSeedX") as InstancedBufferAttribute;
    const seedZAttr = capturedSmokeMesh.geometry.getAttribute("aSeedZ") as InstancedBufferAttribute;
    let capturedPuff = 0;
    for (const town of capturedTowns) {
      for (let col = 0; col < CAPTURED_COLUMNS_PER_TOWN; col += 1) {
        const columnAngle = (col / CAPTURED_COLUMNS_PER_TOWN) * Math.PI * 2 + town.seed * 0.13;
        const columnX = town.worldX + Math.cos(columnAngle) * CAPTURED_COLUMN_RADIUS;
        const columnZ = town.worldZ + Math.sin(columnAngle) * CAPTURED_COLUMN_RADIUS;
        for (let i = 0; i < CAPTURED_PUFFS_PER_COLUMN; i += 1) {
          if (capturedPuff >= MAX_CAPTURED_PUFFS) break;
          const phaseOffset = (town.seed * 53 + col * 1900 + i * 1100) % CAPTURED_CYCLE_MS;
          tempMatrix.makeTranslation(columnX, town.surfaceY + CAPTURED_BASE_Y, columnZ);
          capturedSmokeMesh.setMatrixAt(capturedPuff, tempMatrix);
          phaseOffsetAttr.setX(capturedPuff, phaseOffset);
          seedXAttr.setX(capturedPuff, town.seed + col);
          seedZAttr.setX(capturedPuff, town.seed * 1.3 + col);
          capturedPuff += 1;
        }
      }
    }
    flushSmokeAttributes(capturedSmokeMesh, capturedPuff);
  };

  const commit = (): void => {
    let pole = 0;
    for (const b of banners) {
      tempMatrix.makeTranslation(
        b.worldX,
        b.surfaceY + BANNER_POLE_BASE_Y + BANNER_POLE_HEIGHT * 0.5,
        b.worldZ
      );
      poleMesh.setMatrixAt(pole, tempMatrix);
      pole += 1;
    }
    poleMesh.count = pole;
    poleMesh.instanceMatrix.clearUpdateRanges();
    poleMesh.instanceMatrix.addUpdateRange(0, poleMesh.count * 16);
    poleMesh.instanceMatrix.needsUpdate = true;

    bannerMesh.count = banners.length;
    for (let i = 0; i < banners.length; i += 1) {
      const b = banners[i]!;
      bannerMesh.setColorAt(i, b.color);
      // Static per-banner position (doesn't depend on nowMs) — used to only
      // get written every frame from update(); banners don't move, so this
      // only needs to run when the banner list itself changes.
      tempMatrix.makeTranslation(
        b.worldX + BANNER_OFFSET_X,
        b.surfaceY + BANNER_OFFSET_Y + BANNER_POLE_BASE_Y,
        b.worldZ
      );
      bannerMesh.setMatrixAt(i, tempMatrix);
    }
    if (bannerMesh.instanceColor) {
      bannerMesh.instanceColor.clearUpdateRanges();
      bannerMesh.instanceColor.addUpdateRange(0, bannerMesh.count * 3);
      bannerMesh.instanceColor.needsUpdate = true;
    }
    bannerMesh.instanceMatrix.clearUpdateRanges();
    bannerMesh.instanceMatrix.addUpdateRange(0, bannerMesh.count * 16);
    bannerMesh.instanceMatrix.needsUpdate = true;

    commitVillageSmoke();
    commitCapturedSmoke();
  };

  // Only the banner flutter remains here: a small (~28-vertex), shared,
  // per-frame vertex wobble on the banner plane geometry — not per-instance,
  // so it was never part of the bufferSubData blowup the smoke puffs caused.
  const update = (nowMs: number): void => {
    // Wrap on the CPU (float64-exact) before handing the value to the GPU.
    // uTime is performance.now()-based and grows unboundedly over a session;
    // GPU floats are 32-bit, so a multi-hour session's raw ms value would
    // eventually lose enough precision in the shader's `mod()` to visibly
    // jitter the animation. Modulo by the material's own cycle length keeps
    // the value small and bounded forever, without changing the phase math.
    smokeUniforms.uTime.value = nowMs % SMOKE_CYCLE_MS;
    capturedSmokeUniforms.uTime.value = nowMs % CAPTURED_CYCLE_MS;

    if (bannerPositionAttr && bannerBaseXY) {
      const arr = bannerPositionAttr.array as Float32Array;
      const t = nowMs * 0.0028;
      for (let i = 0; i < arr.length; i += 3) {
        const baseX = bannerBaseXY[i] ?? 0;
        const baseY = bannerBaseXY[i + 1] ?? 0;
        const baseZ = bannerBaseXY[i + 2] ?? 0;
        const fluttering = (baseX + BANNER_PLANE_WIDTH / 2) / BANNER_PLANE_WIDTH;
        const wave = Math.sin(baseX * 4 + t) * 0.06 * fluttering;
        arr[i] = baseX;
        arr[i + 1] = baseY;
        arr[i + 2] = baseZ + wave;
      }
      bannerPositionAttr.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    scene.remove(poleMesh, bannerMesh, smokeMesh, capturedSmokeMesh);
    smokeGeometry.dispose();
    smokeMaterial.dispose();
    capturedSmokeGeometry.dispose();
    capturedSmokeMaterial.dispose();
    poleGeometry.dispose();
    poleMaterial.dispose();
    bannerGeometry.dispose();
    bannerMaterial.dispose();
  };

  return {
    smokeMesh,
    bannerMesh,
    poleMesh,
    capturedSmokeMesh,
    clear,
    addOwnedVillage,
    addCapturedTownSmoke,
    addCapitalBanner,
    commit,
    update,
    dispose
  };
};
