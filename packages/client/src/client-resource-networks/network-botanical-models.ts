import { BufferAttribute, BufferGeometry, Color } from "three";
import { createLeafGeometry } from "../client-map-3d-trees/client-map-3d-tree-models.js";
import type { TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";

/** The map's broadleaf asset, including its baked facet colours and soft normals. */
export const resinTree = (t: TownBuilders, x: number, z: number, height: number): void => {
  const scale = height / 0.53;
  const tree = createLeafGeometry();
  tree.scale(scale, scale, scale).translate(x, 0, z);
  t.body.authored(tree);
  tree.dispose();
  // Amber sits in narrow bark wounds; it is sap, not fruit hanging off branches.
  for (const [dx, y, length] of [[0.012, 0.12, 0.055], [-0.009, 0.21, 0.033]] as const) {
    t.body.pipe(x + dx * scale, y * scale, z + 0.027 * scale,
      x + (dx + 0.005) * scale, (y + length) * scale, z + 0.023 * scale, 0.004 * scale, "brassDark");
    t.body.pipe(x + dx * scale, y * scale, z + 0.03 * scale,
      x + dx * scale, (y + length * 0.72) * scale, z + 0.027 * scale, 0.0025 * scale, "lampWarm");
  }
};

/** Folded, tapering ribbon leaves: an organic silhouette instead of spheres. */
const leaf = (t: TownBuilders, x: number, z: number, size: number, angle: number, rise: number, tint: string): void => {
  const vertices: number[] = [], colors: number[] = [];
  const low = new Color(tint), high = low.clone().multiplyScalar(1.22);
  const point = (u: number, side: number): number[] => {
    const width = Math.sin(u * Math.PI) * size * 0.19 * side;
    const along = u * size;
    return [x + Math.sin(angle) * along + Math.cos(angle) * width,
      0.018 + size * (Math.sin(u * Math.PI * 0.84) * rise + (side === 0 ? 0.045 : 0)),
      z + Math.cos(angle) * along - Math.sin(angle) * width];
  };
  for (let step = 0; step < 4; step += 1) {
    const a = step / 4, b = (step + 1) / 4;
    for (const side of [-1, 1]) {
      for (const [u, edge] of [[a, 0], [a, side], [b, side], [a, 0], [b, side], [b, 0]] as const) {
        vertices.push(...point(u, edge));
        const c = edge === 0 ? high : low;
        colors.push(c.r, c.g, c.b);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geometry.computeVertexNormals();
  t.body.authored(geometry);
  geometry.dispose();
};

/** Fragrant native rosettes, waxy blue-green leaves and wine-coloured scent bracts. */
export const luxuryPlant = (t: TownBuilders, x: number, z: number, size: number): void => {
  for (let i = 0; i < 7; i += 1) {
    const angle = i * Math.PI * 2 / 7;
    leaf(t, x, z, size * (i % 2 ? 0.84 : 1), angle, 0.55, i % 2 ? "#376a59" : "#537b59");
  }
  t.body.pipe(x, 0.015, z, x + size * 0.08, size * 0.96, z, 0.007, "trunk");
  for (let i = 0; i < 5; i += 1) {
    const angle = i * Math.PI * 2 / 5 + 0.3;
    leaf(t, x, z, size * 0.45, angle, 1.9, "#8c4768");
  }
  // Upright cream stamens hold the aromatic pollen sought by Core perfumers.
  for (const dx of [-0.018, 0.006, 0.021]) {
    t.body.pipe(x + dx, size * 0.6, z, x + dx * 0.6, size * 1.02, z, 0.003, "brassDark");
    t.body.ellipsoid(x + dx * 0.6, size * 1.02, z, 0.007, 0.014, 0.007, "paving");
  }
};
