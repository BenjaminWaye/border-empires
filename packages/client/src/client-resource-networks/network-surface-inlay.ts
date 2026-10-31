export type UV = readonly [number, number];
export type UVTriangle = readonly [UV, UV, UV];

/** Clips a flat ore inlay to one host-rock facet, keeping both on the same plane. */
export const clipInlayToFacet = (polygon: readonly UV[], facet: UVTriangle): readonly UV[] => {
  let clipped = [...polygon];
  for (let edge = 0; edge < 3; edge += 1) {
    const a = facet[edge]!, b = facet[(edge + 1) % 3]!;
    const distance = (p: UV): number => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const output: UV[] = [];
    for (let i = 0; i < clipped.length; i += 1) {
      const p = clipped[i]!, q = clipped[(i + 1) % clipped.length]!;
      const dp = distance(p), dq = distance(q), inside = dp >= -1e-9, nextInside = dq >= -1e-9;
      if (inside) output.push(p);
      if (inside !== nextInside) {
        const t = dp / (dp - dq);
        output.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    clipped = output;
    if (clipped.length < 3) return [];
  }
  return clipped;
};
