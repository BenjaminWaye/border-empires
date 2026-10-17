import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, Scene, ShaderMaterial } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import type { FrontierSupplyModel } from "./client-frontier-supply/client-frontier-supply.js";
import { supplyRoutesFor, type SupplyRoute } from "./client-frontier-supply/client-frontier-supply-routes.js";
import { SUPPLY_CORE_WHITE_MIX, SUPPLY_PULSE_SPACING, SUPPLY_PULSE_SPEED } from "./client-frontier-supply/client-frontier-supply-style.js";

// True-3D renderer for frontier supply routes (the 2D counterpart is
// client-frontier-supply/client-frontier-supply-2d.ts; both draw the routes
// from client-frontier-supply-routes.ts in the look defined by
// client-frontier-supply-style.ts).
//
// Every route is one ribbon in a single merged mesh. The ribbon is wider than
// the visible route by RIBBON_EXTENT so the fragment shader can draw, from
// the across-ribbon coordinate alone: a bright core, the empire-tinted body,
// and a soft dark shadow edge that keeps it legible on any terrain. Pulses
// travel along a per-vertex distance-from-supply attribute, so per frame the
// CPU sets one time uniform. Geometry is rebuilt only when the model or the
// scene origin changes.

const RISE_ABOVE_SURFACE = 0.035;
/** Ribbon half-width as a multiple of the visible route's half-width: the rest is the soft shadow edge. */
const RIBBON_EXTENT = 1.9;
const ARROW_HALF_WIDTH_SCALE = 2.1;
const ARROW_MIN_HALF_WIDTH = 0.13;
const ARROW_BACK = 0.12;
const ARROW_FORWARD = 0.26;
/** Hard bound on route vertices, so a pathological empire can't grow GPU buffers without limit. */
export const FRONTIER_SUPPLY_MAX_VERTICES = 60_000;

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

const routeMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTimeS: { value: 0 },
      uBody: { value: new Color("#ffffff") },
      uCore: { value: new Color("#ffffff") },
      uExtent: { value: RIBBON_EXTENT },
      uSpeed: { value: SUPPLY_PULSE_SPEED },
      uSpacing: { value: SUPPLY_PULSE_SPACING }
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    vertexShader: `
      attribute float aAcross;
      attribute float aDistance;
      attribute float aAlpha;
      attribute float aTip;
      varying float vAcross;
      varying float vDistance;
      varying float vAlpha;
      varying float vTip;
      void main() {
        vAcross = aAcross; vDistance = aDistance; vAlpha = aAlpha; vTip = aTip;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTimeS;
      uniform vec3 uBody;
      uniform vec3 uCore;
      uniform float uExtent;
      uniform float uSpeed;
      uniform float uSpacing;
      varying float vAcross;
      varying float vDistance;
      varying float vAlpha;
      varying float vTip;
      void main() {
        // Pulse: sharp head moving outward, soft tail back toward supply (see supplyPulseAt).
        float t = (vDistance - uTimeS * uSpeed) / uSpacing;
        float behind = 1.0 - fract(t);
        float pulse = min(1.0, behind / 0.04) * max(0.0, 1.0 - behind / 0.45);
        if (vTip > 0.5) {
          gl_FragColor = vec4(mix(uBody, uCore, 0.3 + 0.6 * pulse), vAlpha);
          return;
        }
        float a = abs(vAcross) * uExtent; // 1.0 at the visible route edge
        float inBody = 1.0 - smoothstep(0.78, 1.0, a);
        float inShadow = (1.0 - smoothstep(1.0, uExtent, a)) * (1.0 - inBody);
        float inCore = 1.0 - smoothstep(0.0, 0.5, a);
        vec3 lit = mix(uBody, uCore, min(1.0, inCore * 0.7 + pulse * 0.9));
        vec3 color = mix(lit, vec3(0.02, 0.03, 0.05), inShadow);
        float alpha = (inBody * (0.82 + 0.18 * pulse) + inShadow * 0.38) * vAlpha;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });

type RouteBuffers = {
  positions: number[];
  across: number[];
  distance: number[];
  alpha: number[];
  tip: number[];
  indices: number[];
};

const wrapCoord = (v: number, size: number): number => ((Math.round(v) % size) + size) % size;

/** Appends one route's ribbon (and its arrowhead) to the merged buffers. Returns false once the vertex cap is hit. */
const appendRoute = (out: RouteBuffers, route: SupplyRoute, sceneFor: (x: number, y: number) => FrontierSupplyScenePoint): boolean => {
  const points = route.points;
  if (points.length < 2) return true;
  const extraVertices = points.length * 2 + (route.endsAtTip ? 3 : 0);
  if (out.positions.length / 3 + extraVertices > FRONTIER_SUPPLY_MAX_VERTICES) return false;
  const first = points[0]!;
  const anchor = sceneFor(first.x, first.y);
  const scene = points.map((p) => ({
    x: anchor.sceneX + (p.x - first.x),
    z: anchor.sceneZ + (p.y - first.y),
    y: sceneFor(wrapCoord(p.x, WORLD_WIDTH), wrapCoord(p.y, WORLD_HEIGHT)).surfaceY + RISE_ABOVE_SURFACE
  }));
  const base = out.positions.length / 3;
  for (let i = 0; i < points.length; i += 1) {
    const prev = scene[Math.max(0, i - 1)]!;
    const next = scene[Math.min(points.length - 1, i + 1)]!;
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    const half = (points[i]!.width / 2) * RIBBON_EXTENT;
    const s = scene[i]!;
    out.positions.push(s.x - tz * half, s.y, s.z + tx * half, s.x + tz * half, s.y, s.z - tx * half);
    out.across.push(-1, 1);
    for (let k = 0; k < 2; k += 1) {
      out.distance.push(points[i]!.distance);
      out.alpha.push(points[i]!.alpha);
      out.tip.push(0);
    }
    if (i > 0) {
      const a = base + (i - 1) * 2;
      out.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  if (route.endsAtTip) {
    const end = scene[scene.length - 1]!;
    const before = scene[scene.length - 2]!;
    const len = Math.hypot(end.x - before.x, end.z - before.z) || 1;
    const dx = (end.x - before.x) / len;
    const dz = (end.z - before.z) / len;
    const last = points[points.length - 1]!;
    const half = Math.max(ARROW_MIN_HALF_WIDTH, (last.width / 2) * ARROW_HALF_WIDTH_SCALE);
    const bx = end.x - dx * ARROW_BACK;
    const bz = end.z - dz * ARROW_BACK;
    const tipIndex = out.positions.length / 3;
    out.positions.push(bx - dz * half, end.y, bz + dx * half, bx + dz * half, end.y, bz - dx * half, end.x + dx * ARROW_FORWARD, end.y, end.z + dz * ARROW_FORWARD);
    for (let k = 0; k < 3; k += 1) {
      out.across.push(0);
      out.distance.push(last.distance);
      out.alpha.push(last.alpha);
      out.tip.push(1);
    }
    out.indices.push(tipIndex, tipIndex + 1, tipIndex + 2);
  }
  return true;
};

export const createFrontierSupplyOverlay = (scene: Scene): FrontierSupplyOverlay => {
  const geometry = new BufferGeometry();
  const material = routeMaterial();
  const routes = new Mesh(geometry, material);
  routes.frustumCulled = false; // rebuilt in place; bounds would only lag behind
  routes.renderOrder = 24;
  scene.add(routes);

  const white = new Color("#ffffff");
  let lastModel: FrontierSupplyModel | undefined;
  let lastPlacementKey = "";

  const rebuild = (model: FrontierSupplyModel, sceneFor: (x: number, y: number) => FrontierSupplyScenePoint): void => {
    const out: RouteBuffers = { positions: [], across: [], distance: [], alpha: [], tip: [], indices: [] };
    for (const route of supplyRoutesFor(model)) if (!appendRoute(out, route, sceneFor)) break;
    geometry.setAttribute("position", new Float32BufferAttribute(out.positions, 3));
    geometry.setAttribute("aAcross", new Float32BufferAttribute(out.across, 1));
    geometry.setAttribute("aDistance", new Float32BufferAttribute(out.distance, 1));
    geometry.setAttribute("aAlpha", new Float32BufferAttribute(out.alpha, 1));
    geometry.setAttribute("aTip", new Float32BufferAttribute(out.tip, 1));
    geometry.setIndex(out.indices);
  };

  const sync: FrontierSupplyOverlay["sync"] = (model, sceneFor, placementKey, ownerColor, nowMs) => {
    if (model !== lastModel || placementKey !== lastPlacementKey) {
      rebuild(model, sceneFor);
      lastModel = model;
      lastPlacementKey = placementKey;
    }
    (material.uniforms.uBody!.value as Color).set(ownerColor).lerp(white, 0.2);
    (material.uniforms.uCore!.value as Color).set(ownerColor).lerp(white, SUPPLY_CORE_WHITE_MIX + 0.3);
    material.uniforms.uTimeS!.value = nowMs / 1000;
    routes.visible = (geometry.index?.count ?? 0) > 0;
  };

  const dispose = (): void => {
    scene.remove(routes);
    geometry.dispose();
    material.dispose();
  };

  return { sync, dispose };
};
