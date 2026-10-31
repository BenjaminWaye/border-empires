import type { NetworkVariant } from "./network-variants.js";
import { clipInlayToFacet, type UV, type UVTriangle } from "./network-surface-inlay.js";
import { BufferAttribute, BufferGeometry, Color } from "three";
import type { TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";

type Point = readonly [number, number, number];
type Surface = { readonly at: (u: number, v: number, lift?: number) => Point; readonly facets: readonly UVTriangle[] };
const mix = (a: Point, b: Point, c: Point, u: number, v: number): Point =>
  [a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v,
    a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v,
    a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v];

/** Small authored meshes keep the rock and embedded metal in separate materials. */
const mesh = (transform: (p: Point) => Point): {
  triangle: (a: Point, b: Point, c: Point, color: string) => void;
  finish: (t: TownBuilders, metallic?: boolean) => void;
} => {
  const positions: number[] = [], colors: number[] = [];
  return {
    triangle: (a, b, c, tint) => {
      positions.push(...transform(a), ...transform(b), ...transform(c));
      const color = new Color(tint);
      for (let i = 0; i < 3; i += 1) colors.push(color.r, color.g, color.b);
    },
    finish: (t, metallic = false) => {
      if (!positions.length) return;
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
      geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
      geometry.computeVertexNormals();
      t.body.authored(geometry, metallic ? "iron" : undefined);
      geometry.dispose();
    }
  };
};
type Mesh = ReturnType<typeof mesh>;

/** Clip to every crossed facet so the metallic vein never sinks into rough rock. */
const patch = (target: Mesh, surface: Surface, polygon: readonly UV[], lift: number, tint: string): void => {
  for (const facet of surface.facets) {
    const clipped = clipInlayToFacet(polygon, facet);
    for (let i = 1; i < clipped.length - 1; i += 1) {
      const point = (p: UV): Point => surface.at(p[0], p[1], lift);
      target.triangle(point(clipped[0]!), point(clipped[i]!), point(clipped[i + 1]!), tint);
    }
  }
};

/** A vein follows the rock face itself; broken edges reveal copper and silvery ore. */
const vein = (target: Mesh, surface: Surface, path: readonly UV[], width: number, lift: number, tint: string): void => {
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!, b = path[i + 1]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const du = -(b[1] - a[1]) / length * width, dv = (b[0] - a[0]) / length * width;
    for (let step = 0; step < 2; step += 1) {
      const p = step / 2, q = (step + 1) / 2;
      const at = (fraction: number, side: number): UV => {
        const w = 0.7 + 0.3 * Math.sin((i + fraction) * 4.73);
        return [a[0] + (b[0] - a[0]) * fraction + du * side * w,
          a[1] + (b[1] - a[1]) * fraction + dv * side * w];
      };
      patch(target, surface, [at(p, 1), at(p, -1), at(q, -1), at(q, 1)], lift, tint);
    }
  }
};

/** Angular, fractured ore-bearing host rock, with patina around the metal inclusions. */
export const conductiveOutcrop = (t: TownBuilders, x: number, z: number, size: number, turn = 0, variant = 0): void => {
  const transform = ([px, py, pz]: Point): Point =>
    [x + size * (px * Math.cos(turn) + pz * Math.sin(turn)), size * py,
      z + size * (pz * Math.cos(turn) - px * Math.sin(turn))];
  const rock = mesh(transform), oxide = mesh(transform), metal = mesh(transform);
  const h = variant % 2 ? 0.78 : 1;
  const points: readonly Point[] = [
    [-0.92, -0.025, 0.65], [0.85, -0.02, 0.68], [0.95, 0.04, -0.58], [-0.7, -0.02, -0.8],
    [-0.66, 0.72 * h, 0.5], [0.49, 1.02 * h, 0.52], [0.65, 1.18 * h, -0.32], [-0.3, 1.32 * h, -0.5]
  ];
  const shades = ["#373c43", "#3c4148", "#343940", "#444950", "#3a3e46"];
  const face = (corners: readonly [number, number, number, number], outward: Point, seed: number): Surface => {
    const count = 5;
    const base = (u: number, v: number): Point => u + v <= 1
      ? mix(points[corners[0]]!, points[corners[1]]!, points[corners[3]]!, u, v)
      : mix(points[corners[2]]!, points[corners[3]]!, points[corners[1]]!, 1 - u, 1 - v);
    const grid: Point[][] = [];
    for (let j = 0; j <= count; j += 1) {
      const row: Point[] = [];
      for (let i = 0; i <= count; i += 1) {
        const u = i / count, v = j / count, p = base(u, v);
        const roughness = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) *
          (Math.sin(i * 9.3 + j * 5.1 + seed) * 0.12 + Math.cos(j * 3 + i * 4) * 0.045);
        row.push([p[0] + outward[0] * roughness, p[1] + outward[1] * roughness, p[2] + outward[2] * roughness]);
      }
      grid.push(row);
    }
    const facets: UVTriangle[] = [];
    for (let j = 0; j < count; j += 1) for (let i = 0; i < count; i += 1) {
      const a = grid[j]![i]!, b = grid[j]![i + 1]!, c = grid[j + 1]![i + 1]!, d = grid[j + 1]![i]!;
      facets.push([[i / count, j / count], [(i + 1) / count, j / count], [i / count, (j + 1) / count]],
        [[(i + 1) / count, j / count], [(i + 1) / count, (j + 1) / count], [i / count, (j + 1) / count]]);
      rock.triangle(a, b, d, shades[(i * 3 + j * 7 + seed) % shades.length]!);
      rock.triangle(b, c, d, shades[(i * 3 + j * 7 + seed + 1) % shades.length]!);
    }
    return { facets, at: (u, v, lift = 0) => {
      const gu = Math.min(count - 0.00001, Math.max(0, u * count)), gv = Math.min(count - 0.00001, Math.max(0, v * count));
      const i = Math.floor(gu), j = Math.floor(gv), fu = gu - i, fv = gv - j;
      const p = fu + fv <= 1 ? mix(grid[j]![i]!, grid[j]![i + 1]!, grid[j + 1]![i]!, fu, fv)
        : mix(grid[j + 1]![i + 1]!, grid[j + 1]![i]!, grid[j]![i + 1]!, 1 - fu, 1 - fv);
      return [p[0] + outward[0] * lift, p[1] + outward[1] * lift, p[2] + outward[2] * lift];
    } };
  };
  const front = face([0, 1, 5, 4], [0, 0, 1], variant);
  const top = face([4, 5, 6, 7], [0, 1, 0], variant + 2);
  face([1, 2, 6, 5], [1, 0, 0], variant + 3);
  face([2, 3, 7, 6], [0, 0, -1], variant + 4);
  face([3, 0, 4, 7], [-1, 0, 0], variant + 1);
  const primary: readonly UV[] = [[0.17, 0.04], [0.3, 0.25], [0.27, 0.44], [0.52, 0.62], [0.6, 0.79], [0.76, 0.98]];
  const branch: readonly UV[] = [[0.28, 0.44], [0.59, 0.36], [0.82, 0.49], [0.96, 0.43]];
  for (const path of [primary, branch]) {
    vein(oxide, front, path, 0.063, 0.004, "#376961");
    vein(metal, front, path, 0.029, 0.007, "#a99778");
    vein(metal, front, path, 0.009, 0.01, "#cad0c8");
  }
  const cap: readonly UV[] = [[0.76, 0.02], [0.56, 0.22], [0.6, 0.49], [0.31, 0.76], [0.25, 0.94]];
  vein(oxide, top, cap, 0.06, 0.004, "#3c6b65");
  vein(metal, top, cap, 0.028, 0.007, "#ae9f83");
  // Hairline fractures and small exposed metallic plates break up the broad faces.
  vein(rock, front, [[0.07, 0.61], [0.21, 0.71], [0.32, 0.95]], 0.009, 0.003, "#1c232a");
  vein(rock, front, [[0.62, 0.06], [0.74, 0.21], [0.71, 0.37]], 0.012, 0.003, "#20272e");
  for (const [u, v] of [[0.42, 0.57], [0.67, 0.82], [0.81, 0.47]] as const) {
    patch(metal, front, [[u - 0.065, v], [u + 0.04, v - 0.02], [u + 0.025, v + 0.08]], 0.012, "#b7b9a9");
  }
  rock.finish(t); oxide.finish(t); metal.finish(t, true);
};

/** One dominant vein-bearing ridge, split companions, and freshly broken scree. */
export const buildConductiveField = (t: TownBuilders, variant: NetworkVariant = 0): void => {
  if (variant === 1) {
    for (const [x,z,size,turn,salt] of [[-0.16,-0.1,0.215,0.45,4],[0.15,0.10,0.205,-0.75,5],[0.22,-0.21,0.085,0.9,2],[-0.22,0.21,0.075,-0.3,3],[-0.28,-0.25,0.035,0.2,1],[0.11,0.28,0.04,-0.2,2]] as const)
      conductiveOutcrop(t,x,z,size,turn,salt);
    return;
  }
  if (variant === 2) {
    for (const [x,z,size,turn,salt] of [[-0.21,-0.12,0.16,-0.2,6],[0.02,0.0,0.18,0.9,7],[0.22,0.14,0.145,-0.45,2],[-0.19,0.20,0.09,0.3,3],[0.19,-0.22,0.07,-0.3,1],[-0.04,-0.29,0.035,0.4,2]] as const)
      conductiveOutcrop(t,x,z,size,turn,salt);
    return;
  }
  conductiveOutcrop(t, -0.06, -0.055, 0.255, -0.21, 0);
  conductiveOutcrop(t, 0.23, 0.14, 0.135, -0.52, 1);
  conductiveOutcrop(t, -0.24, 0.16, 0.105, 0.39, 2);
  conductiveOutcrop(t, 0.2, -0.21, 0.095, 0.62, 3);
  for (const [x, z, size, turn] of [[-0.11, 0.29, 0.045, 0.7], [0.07, 0.27, 0.035, -0.5], [-0.31, -0.12, 0.039, 0.3]] as const)
    conductiveOutcrop(t, x, z, size, turn, 1);
};
