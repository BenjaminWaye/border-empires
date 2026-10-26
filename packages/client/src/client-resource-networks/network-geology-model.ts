import { BufferAttribute, BufferGeometry, Color } from "three";
import type { TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";

/** Irregular fractured host rock with thin copper-oxide catalyst strata. */
export const catalystOutcrop = (t: TownBuilders, x: number, z: number, size: number): void => {
  const vertices: number[] = [], colors: number[] = [];
  const segments = 7;
  const rings = [0, 0.3, 0.32, 0.69, 0.71, 1];
  const point = (i: number, ring: number): readonly number[] => {
    const a = i * Math.PI * 2 / segments + 0.17;
    const radius = size * (1 - ring * 0.42) * (0.86 + 0.17 * Math.sin(i * 7.3 + 1));
    return [x + Math.cos(a) * radius + ring * size * 0.18,
      size * (ring * 0.94 + 0.045 * Math.sin(i * 5.1)), z + Math.sin(a) * radius * 0.78];
  };
  const triangle = (a: readonly number[], b: readonly number[], c: readonly number[], tint: string): void => {
    vertices.push(...a, ...c, ...b);
    const color = new Color(tint);
    for (let i = 0; i < 3; i += 1) colors.push(color.r, color.g, color.b);
  };
  for (let r = 0; r < rings.length - 1; r += 1) for (let i = 0; i < segments; i += 1) {
    const a = point(i, rings[r]!), b = point(i + 1, rings[r]!), c = point(i + 1, rings[r + 1]!), d = point(i, rings[r + 1]!);
    const tint = r === 1 || r === 3 ? "#a07d50" : i % 3 === 0 ? "#665e61" : "#4c5054";
    triangle(a, b, c, tint); triangle(a, c, d, tint);
  }
  for (let i = 0; i < segments; i += 1)
    triangle(point(i, 1), point(i + 1, 1), [x + size * 0.18, size * 0.94, z], i % 2 ? "#777171" : "#65666b");
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geometry.computeVertexNormals();
  t.body.authored(geometry); geometry.dispose();
};
