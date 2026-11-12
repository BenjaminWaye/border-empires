import { Color, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry, type Material, type Scene } from "three";

// Shared helpers for the road-concept prototypes (RoadConcepts.stories.ts).
// Storybook-only: these are design spikes, not shipped client code.

export type ConceptPath = { readonly pts: readonly Vector3[]; readonly cum: readonly number[]; readonly length: number };

export const makePath = (pts: readonly Vector3[]): ConceptPath => {
  const cum = [0];
  for (let i = 1; i < pts.length; i += 1) cum.push(cum[i - 1]! + pts[i]!.distanceTo(pts[i - 1]!));
  return { pts, cum, length: cum[cum.length - 1] ?? 0 };
};

export const pointAt = (path: ConceptPath, s: number, out: Vector3, tangent?: Vector3): Vector3 => {
  const d = Math.min(Math.max(s, 0), path.length);
  let i = 1;
  while (i < path.pts.length - 1 && path.cum[i]! < d) i += 1;
  const a = path.pts[i - 1]!, b = path.pts[i]!;
  const seg = path.cum[i]! - path.cum[i - 1]!;
  const t = seg > 0 ? (d - path.cum[i - 1]!) / seg : 0;
  out.copy(a).lerp(b, t);
  if (tangent) tangent.subVectors(b, a).normalize();
  return out;
};

// An InstancedMesh with a running cursor, so builders can just `put` pieces.
export type Batch = {
  readonly mesh: InstancedMesh;
  readonly between: (a: Vector3, b: Vector3, radius: number) => number;
  readonly at: (pos: Vector3, sx: number, sy: number, sz: number, dir?: Vector3) => number;
  readonly done: () => void;
  cursor: number;
};

const UP = new Vector3(0, 1, 0);
const WHITE = new Color("#ffffff");
const X_AXIS = new Vector3(1, 0, 0);
const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), sc = new Vector3(), d = new Vector3();

export const batch = (scene: Scene, geometry: BufferGeometry, material: Material, capacity: number, colored = false): Batch => {
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false;
  // Per-instance colours must exist before the first draw, or the compiled
  // shader never reads them.
  if (colored) for (let i = 0; i < capacity; i += 1) mesh.setColorAt(i, WHITE);
  mesh.count = 0;
  scene.add(mesh);
  const b: Batch = {
    mesh,
    cursor: 0,
    // Cylinder geometry (unit height on Y) stretched from a to b.
    between: (a, c, radius) => {
      d.subVectors(c, a);
      const len = d.length();
      q.setFromUnitVectors(UP, d.normalize());
      p.copy(a).add(c).multiplyScalar(0.5);
      sc.set(radius, Math.max(0.0001, len), radius);
      mesh.setMatrixAt(b.cursor, m.compose(p, q, sc));
      return b.cursor++;
    },
    // Unit geometry at pos, long axis (X) along dir when given.
    at: (pos, sx, sy, sz, dir) => {
      if (dir) q.setFromUnitVectors(X_AXIS, d.copy(dir).setY(0).normalize());
      else q.identity();
      sc.set(sx, sy, sz);
      mesh.setMatrixAt(b.cursor, m.compose(pos, q, sc));
      return b.cursor++;
    },
    done: () => {
      mesh.count = b.cursor;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };
  return b;
};

// Distinct path vertices (shared junction points appear once).
export const uniquePoints = (paths: readonly ConceptPath[]): Vector3[] => {
  const seen = new Map<string, Vector3>();
  for (const path of paths) for (const pt of path.pts) seen.set(`${pt.x.toFixed(3)},${pt.z.toFixed(3)}`, pt);
  return [...seen.values()];
};
