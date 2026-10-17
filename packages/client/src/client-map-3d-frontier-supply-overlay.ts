import {
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Scene,
  ShaderMaterial
} from "three";

import type { FrontierSupplyModel } from "./client-frontier-supply/client-frontier-supply.js";
import {
  SUPPLY_CHOKEPOINT_COLOR,
  SUPPLY_FLOW_PERIOD_MS,
  supplyChevronAlpha,
  supplyChokepointPulse
} from "./client-frontier-supply/client-frontier-supply-style.js";

// True-3D renderer for frontier supply lines (the 2D counterpart is
// client-frontier-supply/client-frontier-supply-2d.ts; both share
// client-frontier-supply-style.ts). Faint chevrons flow outward along each
// supply hop into frontier beyond the viewer's reach, amber where the hop
// leaves a chokepoint; the pinch where a fragile stretch begins gets a
// pulsing amber diamond.
//
// Chevrons are one InstancedBufferGeometry: each instance carries its hop's
// two endpoints, an opacity, a fragile flag and a phase, and the vertex shader slides it
// along the hop from a single time uniform -- per frame the CPU touches one
// uniform, not every instance. Buffers are rebuilt only when the model or the
// scene origin changes.

// Narrow (about 50 degrees open) so it still reads as an arrowhead on a
// diagonal hop; a right-angled ">" turned 45 degrees reads as an "L".
const CHEVRON_HALF_WIDTH = 0.15;
const CHEVRON_LENGTH = 0.32;
const CHEVRON_THICKNESS = 0.085;
/** Chevrons sit on the viewer's own territory colour, so lift them toward white to read against it. */
const CHEVRON_WHITE_MIX = 0.6;
const RISE_ABOVE_SURFACE = 0.03;
/** Hard bound on drawn hops, so a pathological empire can't grow GPU buffers without limit. */
export const FRONTIER_SUPPLY_MAX_LINKS = 4_000;
const CHEVRONS_PER_LINK = 2;
const MAX_CHOKEPOINTS = 512;

export type FrontierSupplyScenePoint = { sceneX: number; sceneZ: number; surfaceY: number };

export type FrontierSupplyOverlay = {
  /**
   * Call every frame. `placementKey` must change whenever `sceneFor` would
   * place tiles differently (the 3D scene origin moved); `nowMs` is any
   * monotonic clock.
   */
  readonly sync: (
    model: FrontierSupplyModel,
    sceneFor: (x: number, y: number) => FrontierSupplyScenePoint,
    placementKey: string,
    ownerColor: string,
    nowMs: number
  ) => void;
  readonly dispose: () => void;
};

/** A ">" made of two thin quads, pointing along local +Z, centred on the origin. */
const buildChevronShape = (): { positions: number[]; indices: number[] } => {
  const positions: number[] = [];
  const indices: number[] = [];
  const arm = (side: number): void => {
    const base = positions.length / 3;
    const tailX = side * CHEVRON_HALF_WIDTH;
    const tailZ = -CHEVRON_LENGTH / 2;
    const tipZ = CHEVRON_LENGTH / 2;
    const t = CHEVRON_THICKNESS / 2;
    positions.push(tailX, 0, tailZ - t, tailX, 0, tailZ + t, 0, 0, tipZ + t, 0, 0, tipZ - t);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  arm(-1);
  arm(1);
  return { positions, indices };
};

const chevronMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uFlow: { value: 0 }, uColor: { value: new Color("#ffffff") }, uWarn: { value: new Color(SUPPLY_CHOKEPOINT_COLOR) } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    vertexShader: `
      attribute vec3 aFrom;
      attribute vec3 aTo;
      attribute float aAlpha;
      attribute float aPhase;
      attribute float aFragile;
      uniform float uFlow;
      varying float vAlpha;
      varying float vFragile;
      void main() {
        float f = fract(uFlow + aPhase);
        vec2 hop = aTo.xz - aFrom.xz;
        vec2 fwd = length(hop) > 1e-4 ? normalize(hop) : vec2(0.0, 1.0);
        vec2 right = vec2(fwd.y, -fwd.x);
        vec3 centre = mix(aFrom, aTo, f);
        vec3 p = centre + vec3(right.x * position.x + fwd.x * position.z, position.y, right.y * position.x + fwd.y * position.z);
        vAlpha = aAlpha * min(1.0, min(f / 0.15, (1.0 - f) / 0.15));
        vFragile = aFragile;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uWarn;
      varying float vAlpha;
      varying float vFragile;
      void main() {
        gl_FragColor = vec4(mix(uColor, uWarn, vFragile), vAlpha);
      }
    `
  });

export const createFrontierSupplyOverlay = (scene: Scene): FrontierSupplyOverlay => {
  const shape = buildChevronShape();
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(shape.positions, 3));
  geometry.setIndex(shape.indices);
  const capacity = FRONTIER_SUPPLY_MAX_LINKS * CHEVRONS_PER_LINK;
  const aFrom = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const aTo = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const aAlpha = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  const aPhase = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  const aFragile = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  geometry.setAttribute("aFrom", aFrom);
  geometry.setAttribute("aTo", aTo);
  geometry.setAttribute("aAlpha", aAlpha);
  geometry.setAttribute("aPhase", aPhase);
  geometry.setAttribute("aFragile", aFragile);
  geometry.instanceCount = 0;
  const material = chevronMaterial();
  const chevrons = new Mesh(geometry, material);
  chevrons.frustumCulled = false; // instance positions live in attributes, not the base geometry's bounds
  chevrons.renderOrder = 24;
  scene.add(chevrons);

  const ringGeometry = new RingGeometry(0.3, 0.38, 4, 1, 0); // 4 segments from angle 0: a diamond, matching the 2D marker
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new MeshBasicMaterial({
    toneMapped: false,
    color: SUPPLY_CHOKEPOINT_COLOR,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide
  });
  const rings = new InstancedMesh(ringGeometry, ringMaterial, MAX_CHOKEPOINTS);
  rings.count = 0;
  rings.frustumCulled = false;
  rings.renderOrder = 25;
  scene.add(rings);

  const tmpMatrix = new Matrix4();
  const white = new Color("#ffffff");
  let lastModel: FrontierSupplyModel | undefined;
  let lastPlacementKey = "";

  const rebuild = (model: FrontierSupplyModel, sceneFor: (x: number, y: number) => FrontierSupplyScenePoint): void => {
    let n = 0;
    for (const link of model.links) {
      if (n / CHEVRONS_PER_LINK >= FRONTIER_SUPPLY_MAX_LINKS) break;
      const from = sceneFor(link.from.x, link.from.y);
      const to = sceneFor(link.to.x, link.to.y);
      const alpha = supplyChevronAlpha(link.depthBeyondReach);
      for (let c = 0; c < CHEVRONS_PER_LINK; c += 1) {
        aFrom.setXYZ(n, from.sceneX, from.surfaceY + RISE_ABOVE_SURFACE, from.sceneZ);
        aTo.setXYZ(n, to.sceneX, to.surfaceY + RISE_ABOVE_SURFACE, to.sceneZ);
        aAlpha.setX(n, alpha);
        aPhase.setX(n, c / CHEVRONS_PER_LINK);
        aFragile.setX(n, link.fragile ? 1 : 0);
        n += 1;
      }
    }
    geometry.instanceCount = n;
    for (const attribute of [aFrom, aTo, aAlpha, aPhase, aFragile]) attribute.needsUpdate = true;

    let r = 0;
    for (const choke of model.chokepoints.values()) {
      if (r >= MAX_CHOKEPOINTS) break;
      if (!choke.pinch) continue;
      const at = sceneFor(choke.x, choke.y);
      tmpMatrix.makeTranslation(at.sceneX, at.surfaceY + RISE_ABOVE_SURFACE, at.sceneZ);
      rings.setMatrixAt(r, tmpMatrix);
      r += 1;
    }
    rings.count = r;
    rings.instanceMatrix.needsUpdate = true;
  };

  const sync: FrontierSupplyOverlay["sync"] = (model, sceneFor, placementKey, ownerColor, nowMs) => {
    if (model !== lastModel || placementKey !== lastPlacementKey) {
      rebuild(model, sceneFor);
      lastModel = model;
      lastPlacementKey = placementKey;
    }
    (material.uniforms.uColor!.value as Color).set(ownerColor).lerp(white, CHEVRON_WHITE_MIX);
    material.uniforms.uFlow!.value = (nowMs / SUPPLY_FLOW_PERIOD_MS) % 1;
    const pulse = supplyChokepointPulse(nowMs);
    ringMaterial.opacity = 0.45 + 0.45 * pulse;
    chevrons.visible = geometry.instanceCount > 0;
    rings.visible = rings.count > 0;
  };

  const dispose = (): void => {
    scene.remove(chevrons);
    scene.remove(rings);
    geometry.dispose();
    material.dispose();
    ringGeometry.dispose();
    ringMaterial.dispose();
    rings.dispose();
  };

  return { sync, dispose };
};

