import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, Scene, ShaderMaterial } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import type { FrontierSupplyModel } from "./client-frontier-supply/client-frontier-supply.js";
import { supplyRoutesFor, type SupplyRoute } from "./client-frontier-supply/client-frontier-supply-routes.js";
import {
  SUPPLY_CORE_WHITE_MIX,
  SUPPLY_CUT_RING_RADIUS,
  SUPPLY_CUT_RING_WIDTH,
  SUPPLY_PULSE_SPACING,
  SUPPLY_PULSE_SPEED,
  SUPPLY_ROUTE_ALPHA,
  SUPPLY_ROUTE_REST_ALPHA,
  SUPPLY_ROUTE_WIDTH,
  SUPPLY_SHADOW_PULSE_LIFT,
  SUPPLY_SHADOW_REST_ALPHA,
  supplyCutRingAlpha
} from "./client-frontier-supply/client-frontier-supply-style.js";

// True-3D renderer for fragile frontier supply lines (the 2D counterpart is
// client-frontier-supply/client-frontier-supply-2d.ts; both draw the routes
// from client-frontier-supply-routes.ts in the look defined by
// client-frontier-supply-style.ts).
//
// Every route is one ribbon, and every cut tile one flat ring, in a single
// merged mesh. The ribbon is wider than the visible route by RIBBON_EXTENT so
// the fragment shader can draw, from the across-ribbon coordinate alone: a
// bright core, the empire-tinted body, and a soft dark shadow edge. All of it
// stays pale at rest and comes up only where a pulse is passing, so the
// player reads the route from the travelling pulses rather than the ribbon
// itself. Pulses travel along a per-vertex distance-from-supply attribute, so
// per frame the CPU sets the time and ring-breath uniforms only. Geometry is
// rebuilt only when the model or the scene origin changes.

const RISE_ABOVE_SURFACE = 0.035;
/** Ribbon half-width as a multiple of the visible route's half-width: the rest is the soft shadow edge. */
const RIBBON_EXTENT = 1.9;
const RING_SEGMENTS = 24;
/** aKind values: which part of the mesh a vertex belongs to. */
const KIND_ROUTE = 0;
const KIND_RING = 1;
/** Hard bound on vertices, so a pathological empire can't grow GPU buffers without limit. */
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

const supplyMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTimeS: { value: 0 },
      uBody: { value: new Color("#ffffff") },
      uCore: { value: new Color("#ffffff") },
      uExtent: { value: RIBBON_EXTENT },
      uSpeed: { value: SUPPLY_PULSE_SPEED },
      uSpacing: { value: SUPPLY_PULSE_SPACING },
      uRouteAlpha: { value: SUPPLY_ROUTE_ALPHA },
      uRestAlpha: { value: SUPPLY_ROUTE_REST_ALPHA },
      uShadowRestAlpha: { value: SUPPLY_SHADOW_REST_ALPHA },
      uShadowLift: { value: SUPPLY_SHADOW_PULSE_LIFT },
      uRingAlpha: { value: 0 }
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    vertexShader: `
      attribute float aAcross;
      attribute float aDistance;
      attribute float aKind;
      varying float vAcross;
      varying float vDistance;
      varying float vKind;
      void main() {
        vAcross = aAcross; vDistance = aDistance; vKind = aKind;
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
      uniform float uRouteAlpha;
      uniform float uRestAlpha;
      uniform float uShadowRestAlpha;
      uniform float uShadowLift;
      uniform float uRingAlpha;
      varying float vAcross;
      varying float vDistance;
      varying float vKind;
      void main() {
        if (vKind > 0.5) {
          gl_FragColor = vec4(uCore, uRingAlpha);
          return;
        }
        // Pulse: sharp head moving outward, soft tail back toward supply (see supplyPulseAt).
        float t = (vDistance - uTimeS * uSpeed) / uSpacing;
        float behind = 1.0 - fract(t);
        float pulse = min(1.0, behind / 0.04) * max(0.0, 1.0 - behind / 0.45);
        // Pale at rest (SUPPLY_ROUTE_REST_ALPHA), full where a pulse is passing.
        float lit = mix(uRestAlpha, 1.0, pulse);
        float a = abs(vAcross) * uExtent; // 1.0 at the visible route edge
        float inBody = 1.0 - smoothstep(0.78, 1.0, a);
        float inShadow = (1.0 - smoothstep(1.0, uExtent, a)) * (1.0 - inBody);
        float inCore = 1.0 - smoothstep(0.0, 0.5, a);
        vec3 color = mix(mix(uBody, uCore, min(1.0, inCore * 0.7 + pulse * 0.9)), vec3(0.02, 0.03, 0.05), inShadow);
        float alpha = (inBody * lit + inShadow * (uShadowRestAlpha + uShadowLift * pulse)) * uRouteAlpha;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });

type SupplyBuffers = {
  positions: number[];
  across: number[];
  distance: number[];
  kind: number[];
  indices: number[];
};

const wrapCoord = (v: number, size: number): number => ((Math.round(v) % size) + size) % size;

const vertexCount = (out: SupplyBuffers): number => out.positions.length / 3;

const pushVertex = (out: SupplyBuffers, x: number, y: number, z: number, across: number, distance: number, kind: number): void => {
  out.positions.push(x, y, z);
  out.across.push(across);
  out.distance.push(distance);
  out.kind.push(kind);
};

/** Appends one route's ribbon to the merged buffers. Returns false once the vertex cap is hit. */
const appendRoute = (out: SupplyBuffers, route: SupplyRoute, sceneFor: (x: number, y: number) => FrontierSupplyScenePoint): boolean => {
  const points = route.points;
  if (points.length < 2) return true;
  if (vertexCount(out) + points.length * 2 > FRONTIER_SUPPLY_MAX_VERTICES) return false;
  const first = points[0]!;
  const anchor = sceneFor(first.x, first.y);
  const scene = points.map((p) => ({
    x: anchor.sceneX + (p.x - first.x),
    z: anchor.sceneZ + (p.y - first.y),
    y: sceneFor(wrapCoord(p.x, WORLD_WIDTH), wrapCoord(p.y, WORLD_HEIGHT)).surfaceY + RISE_ABOVE_SURFACE
  }));
  const base = vertexCount(out);
  const half = (SUPPLY_ROUTE_WIDTH / 2) * RIBBON_EXTENT;
  for (let i = 0; i < points.length; i += 1) {
    const prev = scene[Math.max(0, i - 1)]!;
    const next = scene[Math.min(points.length - 1, i + 1)]!;
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    const s = scene[i]!;
    pushVertex(out, s.x - tz * half, s.y, s.z + tx * half, -1, points[i]!.distance, KIND_ROUTE);
    pushVertex(out, s.x + tz * half, s.y, s.z - tx * half, 1, points[i]!.distance, KIND_ROUTE);
    if (i > 0) {
      const a = base + (i - 1) * 2;
      out.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  return true;
};

/** Appends a flat ring on a cut tile. Returns false once the vertex cap is hit. */
const appendCutRing = (out: SupplyBuffers, at: FrontierSupplyScenePoint): boolean => {
  if (vertexCount(out) + RING_SEGMENTS * 2 > FRONTIER_SUPPLY_MAX_VERTICES) return false;
  const inner = SUPPLY_CUT_RING_RADIUS - SUPPLY_CUT_RING_WIDTH / 2;
  const outer = SUPPLY_CUT_RING_RADIUS + SUPPLY_CUT_RING_WIDTH / 2;
  const y = at.surfaceY + RISE_ABOVE_SURFACE;
  const base = vertexCount(out);
  for (let i = 0; i < RING_SEGMENTS; i += 1) {
    const angle = (i / RING_SEGMENTS) * Math.PI * 2;
    const cx = Math.cos(angle);
    const sz = Math.sin(angle);
    pushVertex(out, at.sceneX + cx * inner, y, at.sceneZ + sz * inner, 0, 0, KIND_RING);
    pushVertex(out, at.sceneX + cx * outer, y, at.sceneZ + sz * outer, 0, 0, KIND_RING);
    const a = base + i * 2;
    const b = base + ((i + 1) % RING_SEGMENTS) * 2;
    out.indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  return true;
};

export const createFrontierSupplyOverlay = (scene: Scene): FrontierSupplyOverlay => {
  const geometry = new BufferGeometry();
  const material = supplyMaterial();
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false; // rebuilt in place; bounds would only lag behind
  mesh.renderOrder = 24;
  scene.add(mesh);

  const white = new Color("#ffffff");
  let lastModel: FrontierSupplyModel | undefined;
  let lastPlacementKey = "";

  const rebuild = (model: FrontierSupplyModel, sceneFor: (x: number, y: number) => FrontierSupplyScenePoint): void => {
    const out: SupplyBuffers = { positions: [], across: [], distance: [], kind: [], indices: [] };
    let room = true;
    for (const cut of model.cuts) if (!(room = appendCutRing(out, sceneFor(cut.x, cut.y)))) break;
    if (room) for (const route of supplyRoutesFor(model)) if (!appendRoute(out, route, sceneFor)) break;
    geometry.setAttribute("position", new Float32BufferAttribute(out.positions, 3));
    geometry.setAttribute("aAcross", new Float32BufferAttribute(out.across, 1));
    geometry.setAttribute("aDistance", new Float32BufferAttribute(out.distance, 1));
    geometry.setAttribute("aKind", new Float32BufferAttribute(out.kind, 1));
    geometry.setIndex(out.indices);
  };

  const sync: FrontierSupplyOverlay["sync"] = (model, sceneFor, placementKey, ownerColor, nowMs) => {
    if (model !== lastModel || placementKey !== lastPlacementKey) {
      rebuild(model, sceneFor);
      lastModel = model;
      lastPlacementKey = placementKey;
    }
    (material.uniforms.uBody!.value as Color).set(ownerColor).lerp(white, 0.2);
    (material.uniforms.uCore!.value as Color).set(ownerColor).lerp(white, SUPPLY_CORE_WHITE_MIX);
    material.uniforms.uTimeS!.value = nowMs / 1000;
    material.uniforms.uRingAlpha!.value = supplyCutRingAlpha(nowMs);
    mesh.visible = (geometry.index?.count ?? 0) > 0;
  };

  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  };

  return { sync, dispose };
};
