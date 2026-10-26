import { BufferGeometry, Color, Float32BufferAttribute } from "three";

/** One sixth of the upward-facing orbital receiver, with a closed metal back. */
export const createRelayReceiverPetal = (): BufferGeometry => {
  const positions: number[] = [], colors: number[] = [], normals: number[] = [];
  const point = (r: number, a: number, back: boolean): number[] =>
    [Math.cos(a) * r, 0.20 * (r / 0.36) ** 2 - (back ? 0.009 : 0), Math.sin(a) * r];
  const triangle = (a: number[], b: number[], c: number[], color: string, surface?: "front" | "back"): void => {
    positions.push(...a, ...b, ...c);
    const rgb = new Color(color);
    for (const vertex of [a, b, c]) {
      colors.push(rgb.r, rgb.g, rgb.b);
      if (surface) {
        // Analytic paraboloid normals keep reflections continuous across triangles.
        const slope = 0.40 / (0.36 ** 2), sign = surface === "front" ? 1 : -1;
        const nx = -slope * vertex[0]!, nz = -slope * vertex[2]!, length = Math.hypot(nx, 1, nz);
        normals.push(sign * nx / length, sign / length, sign * nz / length);
      } else {
        const ux = b[0]! - a[0]!, uy = b[1]! - a[1]!, uz = b[2]! - a[2]!;
        const vx = c[0]! - a[0]!, vy = c[1]! - a[1]!, vz = c[2]! - a[2]!;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const length = Math.hypot(nx, ny, nz);
        normals.push(nx / length, ny / length, nz / length);
      }
    }
  };
  const radii = [0.035, 0.065, 0.10, 0.145, 0.19, 0.235, 0.28, 0.325, 0.352, 0.36];
  const edge = Math.PI / 6 - 0.009;
  const angles = [-edge, ...Array.from({ length: 11 }, (_, i) => -edge + 0.016 + (2 * edge - 0.032) * i / 10), edge];
  const rings = radii.length - 1, wedges = angles.length - 1;
  for (let r = 0; r < rings; r++) for (let a = 0; a < wedges; a++) {
    const r0 = radii[r]!, r1 = radii[r + 1]!;
    const a0 = angles[a]!, a1 = angles[a + 1]!;
    for (const back of [false, true]) {
      const p = point(r0, a0, back), q = point(r0, a1, back);
      const u = point(r1, a0, back), v = point(r1, a1, back);
      const color = back ? "#25282e" : r === rings - 1 || a === 0 || a === wedges - 1 ? "#b1935b" : "#6a8ea0";
      if (back) { triangle(p, u, q, color, "back"); triangle(q, u, v, color, "back"); }
      else { triangle(p, q, u, color, "front"); triangle(q, v, u, color, "front"); }
    }
    for (const [ra, aa, rb, ab, boundary] of [
      [r0, a0, r0, a1, r === 0], [r1, a1, r1, a0, r === rings - 1],
      [r1, a0, r0, a0, a === 0], [r0, a1, r1, a1, a === wedges - 1]
    ] as const) if (boundary) {
      const p = point(ra, aa, false), q = point(rb, ab, false);
      const u = point(ra, aa, true), v = point(rb, ab, true);
      triangle(p, u, q, "#8b6c3d"); triangle(q, u, v, "#8b6c3d");
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  return geometry;
};
