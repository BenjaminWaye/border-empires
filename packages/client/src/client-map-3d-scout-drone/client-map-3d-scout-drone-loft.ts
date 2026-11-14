import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from "three";

// Hard-surface helpers for the faceted scout drone (client-map-3d-scout-drone-geometry.ts). A
// chined hull is lofted from a few cross-sections, each an eight-point ring with a ridge on top, a
// sharp chine at the widest point and a keel below, joined by flat facets. Everything is built
// non-indexed with one normal per face, so every crease catches light as a crisp edge instead of
// being smoothed over. Runs once, when the overlay is created.

/** One cross-section along the hull: half-width at the chine, ridge height, chine height, keel depth. */
export type HullStation = { z: number; halfWidth: number; top: number; chine: number; keel: number };

const ring = (s: HullStation): Array<[number, number]> => [
  [0, s.top],
  [s.halfWidth * 0.55, s.top * 0.82],
  [s.halfWidth, s.chine],
  [s.halfWidth * 0.48, s.keel * 0.85],
  [0, s.keel],
  [-s.halfWidth * 0.48, s.keel * 0.85],
  [-s.halfWidth, s.chine],
  [-s.halfWidth * 0.55, s.top * 0.82]
];

const a = new Vector3();
const b = new Vector3();
const c = new Vector3();
const n = new Vector3();
const centroid = new Vector3();

/**
 * Pushes triangle (p, q, r), wound so its face normal points away from `inside` (a point within
 * the solid), so callers need not track winding by hand.
 */
const pushFace = (out: number[], p: Vector3, q: Vector3, r: Vector3, inside: Vector3, colors?: number[], shade = 1): void => {
  n.subVectors(q, p).cross(c.subVectors(r, p));
  centroid.copy(p).add(q).add(r).multiplyScalar(1 / 3).sub(inside);
  const flip = n.dot(centroid) < 0;
  out.push(p.x, p.y, p.z, ...(flip ? [r.x, r.y, r.z, q.x, q.y, q.z] : [q.x, q.y, q.z, r.x, r.y, r.z]));
  if (colors) for (let i = 0; i < 3; i += 1) colors.push(shade, shade, shade);
};

// Two-tone panelling: the facets either side of the ridge are a touch lighter than the flanks,
// and the belly facets darker, so the hull reads as separate plates even before lighting.
const FACET_SHADE = [1, 0.78, 0.62, 0.5, 0.5, 0.62, 0.78, 1];

/** Flat (per-face) normals on a non-indexed geometry: the hard-edge look. */
export const flatNormals = (geometry: BufferGeometry): BufferGeometry => {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  flat.deleteAttribute("normal");
  flat.computeVertexNormals();
  return flat;
};

/** Lofts flat facets between consecutive stations (ordered tail to nose) and caps both ends. */
export const loftFaceted = (stations: readonly HullStation[]): BufferGeometry => {
  const out: number[] = [];
  const colors: number[] = [];
  const rings = stations.map((s) => ring(s).map(([x, y]) => new Vector3(x, y, s.z)));
  const inside = new Vector3();
  for (let i = 0; i + 1 < rings.length; i += 1) {
    const r0 = rings[i]!;
    const r1 = rings[i + 1]!;
    const s0 = stations[i]!;
    const s1 = stations[i + 1]!;
    inside.set(0, (s0.chine + s1.chine) / 2, (s0.z + s1.z) / 2);
    for (let k = 0; k < r0.length; k += 1) {
      const k1 = (k + 1) % r0.length;
      const shade = FACET_SHADE[k] ?? 1;
      pushFace(out, r0[k]!, r0[k1]!, r1[k1]!, inside, colors, shade);
      pushFace(out, r0[k]!, r1[k1]!, r1[k]!, inside, colors, shade);
    }
  }
  for (const [index, towardZ] of [[0, 1], [rings.length - 1, -1]] as const) {
    const capRing = rings[index]!;
    const s = stations[index]!;
    inside.set(0, s.chine, s.z + towardZ * 0.05);
    a.set(0, (s.top + s.keel) / 2, s.z);
    for (let k = 0; k < capRing.length; k += 1) pushFace(out, a, capRing[k]!, capRing[(k + 1) % capRing.length]!, inside, colors, 0.55);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(out, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
};

/** The chine and ridge lines of a hull, as segments, for bronze edge trim. */
export const hullEdgeLines = (stations: readonly HullStation[]): Array<[Vector3, Vector3]> => {
  const lines: Array<[Vector3, Vector3]> = [];
  for (let i = 0; i + 1 < stations.length; i += 1) {
    const r0 = ring(stations[i]!);
    const r1 = ring(stations[i + 1]!);
    const z0 = stations[i]!.z;
    const z1 = stations[i + 1]!.z;
    for (const k of [0, 2, 6]) lines.push([new Vector3(r0[k]![0], r0[k]![1], z0), new Vector3(r1[k]![0], r1[k]![1], z1)]);
  }
  return lines;
};

const up = new Vector3(0, 1, 0);
const quat = new Quaternion();
const matrix = new Matrix4();

/** A thin square-section bar from `from` to `to` (edge trim, struts), with flat normals. */
export const bar = (from: Vector3, to: Vector3, thickness: number): BufferGeometry => {
  b.subVectors(to, from);
  const length = b.length();
  const geometry = flatNormals(new BoxGeometry(thickness, length, thickness));
  quat.setFromUnitVectors(up, b.normalize());
  matrix.compose(a.copy(from).add(to).multiplyScalar(0.5), quat, n.set(1, 1, 1));
  return geometry.applyMatrix4(matrix);
};
