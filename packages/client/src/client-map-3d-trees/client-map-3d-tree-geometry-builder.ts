// Triangle-soup builder behind the hand-made tree models
// (client-map-3d-tree-models.ts). Each tree is one merged, unindexed
// BufferGeometry -- trunk and canopy together, so a whole tree is a single
// instance in a single InstancedMesh -- carrying:
//   position / normal / color  -- vertex-coloured, no textures;
//   aTreeSway                  -- 0 at the roots, 1 at the crown: how far the
//                                 wind shader (client-map-3d-tree-material.ts)
//                                 bends that vertex;
//   aTreeFoliage               -- 1 on leaves/needles, 0 on bark: where the
//                                 material adds its soft rim light.
// Normals are each facet's own normal blended toward a "volume" normal
// pointing out of the canopy's centre -- the stylised-foliage trick that
// keeps the faceted silhouette but lights a canopy as one soft mass instead
// of a pile of hard-edged triangles.
import { BufferAttribute, BufferGeometry, type Color } from "three";

export type Vec3 = readonly [number, number, number];

export type TreeFaceOptions = {
  /** A point the face should face away from (its winding is flipped to suit). */
  readonly inside: Vec3;
  /** 0 = pure facet normal, 1 = pure volume normal (from `volumeCenter`). */
  readonly volumeBlend: number;
  /** Centre of the mass the volume normal points out of; defaults to `inside`. */
  readonly volumeCenter?: Vec3;
  readonly foliage: boolean;
};

const sub = (a: Vec3, b: Vec3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const normalize = (v: readonly number[]): [number, number, number] => {
  const length = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
  return [v[0]! / length, v[1]! / length, v[2]! / length];
};

export type TreeGeometryBuilder = {
  readonly tri: (a: Vec3, b: Vec3, c: Vec3, ca: Color, cb: Color, cc: Color, options: TreeFaceOptions) => void;
  readonly quad: (a: Vec3, b: Vec3, c: Vec3, d: Vec3, ca: Color, cb: Color, cc: Color, cd: Color, options: TreeFaceOptions) => void;
  /** `crownY`: the height that sways fully; everything above it sways the same. */
  readonly build: (crownY: number) => BufferGeometry;
};

export const createTreeGeometryBuilder = (): TreeGeometryBuilder => {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const foliage: number[] = [];

  const tri: TreeGeometryBuilder["tri"] = (a, b, c, ca, cb, cc, options) => {
    const ab = sub(b, a);
    const ac = sub(c, a);
    let facet = normalize([ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]);
    const centroid: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const outward = sub(centroid, options.inside);
    let verts: ReadonlyArray<readonly [Vec3, Color]> = [[a, ca], [b, cb], [c, cc]];
    if (facet[0] * outward[0] + facet[1] * outward[1] + facet[2] * outward[2] < 0) {
      facet = [-facet[0], -facet[1], -facet[2]];
      verts = [[a, ca], [c, cc], [b, cb]];
    }
    const center = options.volumeCenter ?? options.inside;
    const blend = options.volumeBlend;
    for (const [p, color] of verts) {
      const volume = normalize(sub(p, center));
      const n = normalize([
        facet[0] * (1 - blend) + volume[0] * blend,
        facet[1] * (1 - blend) + volume[1] * blend,
        facet[2] * (1 - blend) + volume[2] * blend
      ]);
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0], n[1], n[2]);
      colors.push(color.r, color.g, color.b);
      foliage.push(options.foliage ? 1 : 0);
    }
  };

  const quad: TreeGeometryBuilder["quad"] = (a, b, c, d, ca, cb, cc, cd, options) => {
    tri(a, b, c, ca, cb, cc, options);
    tri(a, c, d, ca, cc, cd, options);
  };

  const build = (crownY: number): BufferGeometry => {
    const sway = new Float32Array(positions.length / 3);
    for (let i = 0; i < sway.length; i += 1) {
      // Quadratic: the trunk barely moves at the roots and the crown carries
      // the motion, so the whole tree bends instead of sliding sideways.
      const t = Math.min(1, Math.max(0, positions[i * 3 + 1]! / crownY));
      sway[i] = t * t;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
    geometry.setAttribute("aTreeSway", new BufferAttribute(sway, 1));
    geometry.setAttribute("aTreeFoliage", new BufferAttribute(new Float32Array(foliage), 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  };

  return { tri, quad, build };
};
