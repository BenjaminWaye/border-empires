import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, Scene, ShaderMaterial } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import type { FrontierSupplyModel } from "./client-frontier-supply/client-frontier-supply.js";
import { supplyRoutesFor, type SupplyRoute } from "./client-frontier-supply/client-frontier-supply-routes.js";
import {
  SUPPLY_CUT_RING_ALPHA,
  SUPPLY_CUT_RING_RADIUS,
  SUPPLY_CUT_RING_WIDTH,
  SUPPLY_DASH_GAP,
  SUPPLY_DASH_LENGTH,
  SUPPLY_LINE_ALPHA,
  SUPPLY_LINE_WHITE_MIX,
  SUPPLY_LINE_WIDTH
} from "./client-frontier-supply/client-frontier-supply-style.js";

// True-3D renderer for fragile frontier supply lines (the 2D counterpart is
// client-frontier-supply/client-frontier-supply-2d.ts; both draw the routes
// from client-frontier-supply-routes.ts in the look defined by
// client-frontier-supply-style.ts).
//
// Every route is one thin ribbon, and every cut tile one flat ring, in a
// single merged mesh. The fragment shader cuts the ribbon into dashes from a
// per-vertex distance-along-the-line attribute, so dashes run on unbroken
// through a fork. Nothing animates: geometry is rebuilt only when the model
// or the scene origin changes.

const RISE_ABOVE_SURFACE = 0.035;
const RING_SEGMENTS = 24;
/** Hard bound on vertices, so a pathological empire can't grow GPU buffers without limit. */
export const FRONTIER_SUPPLY_MAX_VERTICES = 60_000;

export type FrontierSupplyScenePoint = { sceneX: number; sceneZ: number; surfaceY: number };

export type FrontierSupplyOverlay = {
  /**
   * Call every frame. `placementKey` must change whenever `sceneFor` would
   * place tiles differently (the 3D scene origin moved).
   */
  readonly sync: (
    model: FrontierSupplyModel,
    sceneFor: (x: number, y: number) => FrontierSupplyScenePoint,
    placementKey: string,
    ownerColor: string
  ) => void;
  readonly dispose: () => void;
};

const supplyMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color("#ffffff") },
      uLineAlpha: { value: SUPPLY_LINE_ALPHA },
      uRingAlpha: { value: SUPPLY_CUT_RING_ALPHA },
      uDash: { value: SUPPLY_DASH_LENGTH },
      uPeriod: { value: SUPPLY_DASH_LENGTH + SUPPLY_DASH_GAP }
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    vertexShader: `
      attribute float aDistance;
      attribute float aRing;
      varying float vDistance;
      varying float vRing;
      void main() {
        vDistance = aDistance; vRing = aRing;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uLineAlpha;
      uniform float uRingAlpha;
      uniform float uDash;
      uniform float uPeriod;
      varying float vDistance;
      varying float vRing;
      void main() {
        if (vRing > 0.5) {
          gl_FragColor = vec4(uColor, uRingAlpha);
          return;
        }
        if (mod(vDistance, uPeriod) >= uDash) discard;
        gl_FragColor = vec4(uColor, uLineAlpha);
      }
    `
  });

type SupplyBuffers = {
  positions: number[];
  distance: number[];
  ring: number[];
  indices: number[];
};

const wrapCoord = (v: number, size: number): number => ((Math.round(v) % size) + size) % size;

const vertexCount = (out: SupplyBuffers): number => out.positions.length / 3;

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
  const half = SUPPLY_LINE_WIDTH / 2;
  for (let i = 0; i < points.length; i += 1) {
    const prev = scene[Math.max(0, i - 1)]!;
    const next = scene[Math.min(points.length - 1, i + 1)]!;
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    const s = scene[i]!;
    out.positions.push(s.x - tz * half, s.y, s.z + tx * half, s.x + tz * half, s.y, s.z - tx * half);
    out.distance.push(points[i]!.distance, points[i]!.distance);
    out.ring.push(0, 0);
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
    out.positions.push(at.sceneX + cx * inner, y, at.sceneZ + sz * inner, at.sceneX + cx * outer, y, at.sceneZ + sz * outer);
    out.distance.push(0, 0);
    out.ring.push(1, 1);
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
    const out: SupplyBuffers = { positions: [], distance: [], ring: [], indices: [] };
    let room = true;
    for (const cut of model.cuts) if (!(room = appendCutRing(out, sceneFor(cut.x, cut.y)))) break;
    if (room) for (const route of supplyRoutesFor(model)) if (!appendRoute(out, route, sceneFor)) break;
    geometry.setAttribute("position", new Float32BufferAttribute(out.positions, 3));
    geometry.setAttribute("aDistance", new Float32BufferAttribute(out.distance, 1));
    geometry.setAttribute("aRing", new Float32BufferAttribute(out.ring, 1));
    geometry.setIndex(out.indices);
  };

  const sync: FrontierSupplyOverlay["sync"] = (model, sceneFor, placementKey, ownerColor) => {
    if (model !== lastModel || placementKey !== lastPlacementKey) {
      rebuild(model, sceneFor);
      lastModel = model;
      lastPlacementKey = placementKey;
    }
    (material.uniforms.uColor!.value as Color).set(ownerColor).lerp(white, SUPPLY_LINE_WHITE_MIX);
    mesh.visible = (geometry.index?.count ?? 0) > 0;
  };

  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  };

  return { sync, dispose };
};
