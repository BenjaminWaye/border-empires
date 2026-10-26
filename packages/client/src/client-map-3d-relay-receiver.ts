import { BufferGeometry, Color, Float32BufferAttribute } from "three";

/** One sixth of the upward-facing orbital receiver, with a closed metal back. */
export const createRelayReceiverPetal = (): BufferGeometry => {
  const positions: number[] = [], colors: number[] = [];
  const point = (r: number, a: number, back: boolean): number[] =>
    [Math.cos(a) * r, 0.20 * (r / 0.36) ** 2 - (back ? 0.009 : 0), Math.sin(a) * r];
  const triangle = (a: number[], b: number[], c: number[], color: string): void => {
    positions.push(...a, ...b, ...c);
    const rgb = new Color(color);
    for (let i = 0; i < 3; i++) colors.push(rgb.r, rgb.g, rgb.b);
  };
  const rings = 6, wedges = 8, edge = Math.PI / 6 - 0.012;
  for (let r = 0; r < rings; r++) for (let a = 0; a < wedges; a++) {
    const r0 = 0.035 + 0.325 * r / rings, r1 = 0.035 + 0.325 * (r + 1) / rings;
    const a0 = -edge + 2 * edge * a / wedges, a1 = -edge + 2 * edge * (a + 1) / wedges;
    for (const back of [false, true]) {
      const p = point(r0, a0, back), q = point(r0, a1, back);
      const u = point(r1, a0, back), v = point(r1, a1, back);
      const color = back ? "#25282e" : r === rings - 1 || a === 0 || a === wedges - 1 ? "#b1935b" : "#6a8ea0";
      if (back) { triangle(p, u, q, color); triangle(q, u, v, color); }
      else { triangle(p, q, u, color); triangle(q, v, u, color); }
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
  geometry.computeVertexNormals();
  return geometry;
};
