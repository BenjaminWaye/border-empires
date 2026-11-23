import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Vector3 } from "three";

export type TimberPoint = readonly [number, number, number];
export type SplitTimberOptions = {
  readonly points: readonly TimberPoint[];
  readonly baseRadius: number;
  readonly tipRadius: number;
  /** Roots narrow quickly near their parent tree, then fade into fine tips. */
  readonly taperPower?: number;
  /** World-facing direction of the torn opening: forward for a snag, up for a log. */
  readonly opening: TimberPoint;
  readonly gap?: number;
  readonly seed?: number;
  /** Narrow interrupted bark fissures, rather than one long open split. */
  readonly cracks?: boolean;
  readonly crackPhase?: number;
};
export type SplitTimberGeometry = {
  readonly bark: BufferGeometry;
  readonly heartwood: BufferGeometry;
  readonly tornEdges: BufferGeometry;
};

type Surface = { positions: number[]; uvs: number[] };

/** A curved wood shell with an irregular torn opening and inset mineral grain.
 * The shell and heartwood share their path, so the exposed core is inside the
 * timber instead of sitting on it as another cylindrical rod.
 */
export const createSplitTimberGeometry = (options: SplitTimberOptions): SplitTimberGeometry => {
  const curve = new CatmullRomCurve3(options.points.map((p) => new Vector3(...p)), false, "centripetal");
  const opening = new Vector3(...options.opening);
  const seed = options.seed ?? 0;
  const gap = options.gap ?? 1.25;
  const rings = 12;
  const sides = 12;
  const bark: Surface = { positions: [], uvs: [] };
  const heartwood: Surface = { positions: [], uvs: [] };
  const edges: Surface = { positions: [], uvs: [] };
  const quad = (surface: Surface, points: readonly [Vector3, Vector3, Vector3, Vector3], u: number, v: number): void => {
    const vertices = [0, 1, 2, 0, 2, 3] as const;
    const uv = [[u, v], [u + 1 / sides, v], [u + 1 / sides, v + 1 / rings], [u, v + 1 / rings]] as const;
    for (const i of vertices) {
      surface.positions.push(points[i].x, points[i].y, points[i].z);
      surface.uvs.push(...uv[i]);
    }
  };
  const point = (ring: number, side: number, inner: boolean): Vector3 => {
    const t = ring / rings;
    const center = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const outward = opening.clone().addScaledVector(tangent, -opening.dot(tangent));
    if (outward.lengthSq() < 0.001) outward.set(1, 0, 0).addScaledVector(tangent, -tangent.x);
    outward.normalize();
    const across = new Vector3().crossVectors(tangent, outward).normalize();
    // The torn edges widen and narrow along the wood, without a straight slot.
    const exposure = options.cracks
      ? (Math.max(0, Math.sin(t * Math.PI * 3 + 0.4 + (options.crackPhase ?? 0)) - 0.45) / 0.55) ** 2 : 1;
    const lip = gap * exposure * (1 + 0.17 * Math.sin(t * 13 + seed));
    const angle = lip / 2 + side / sides * (Math.PI * 2 - lip);
    const radius = (options.tipRadius + (options.baseRadius - options.tipRadius)
      * (1 - t) ** (options.taperPower ?? 1))
      * (1 + 0.055 * Math.sin(t * 19 + angle * 3 + seed));
    const grain = inner ? 0.68 + 0.035 * Math.cos(angle * 7 + t * 18) : 1;
    const result = center.addScaledVector(outward, Math.cos(angle) * radius * grain)
      .addScaledVector(across, Math.sin(angle) * radius * grain);
    if (ring === rings) result.addScaledVector(tangent, options.tipRadius * (0.35 * Math.sin(angle * 3 + seed) + 0.2));
    return result;
  };
  for (let ring = 0; ring < rings; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      quad(bark, [point(ring, side, false), point(ring, side + 1, false),
        point(ring + 1, side + 1, false), point(ring + 1, side, false)], side / sides, ring / rings);
      quad(heartwood, [point(ring, side + 1, true), point(ring, side, true),
        point(ring + 1, side, true), point(ring + 1, side + 1, true)], side / sides, ring / rings);
    }
    // Solid heartwood spans the torn opening. Without this inset face,
    // the open shell reads as an empty pipe rather than mineralized wood.
    quad(heartwood, [point(ring, sides, true), point(ring, 0, true),
      point(ring + 1, 0, true), point(ring + 1, sides, true)], 0, ring / rings);
    for (const side of [0, sides]) {
      quad(edges, [point(ring, side, false), point(ring, side, true),
        point(ring + 1, side, true), point(ring + 1, side, false)], 0, ring / rings);
    }
  }
  for (const ring of [0, rings]) {
    for (let side = 0; side < sides; side += 1) {
      quad(edges, [point(ring, side, false), point(ring, side + 1, false),
        point(ring, side + 1, true), point(ring, side, true)], side / sides, 0);
    }
  }
  // Close the mineral core at both broken ends. A bark rim alone leaves
  // an uncapped tube, which looks hollow from the end of a fallen trunk.
  for (const ring of [0, rings]) {
    const center = curve.getPoint(ring / rings);
    for (let side = 0; side <= sides; side += 1) {
      const a = point(ring, side, true);
      const b = point(ring, (side + 1) % (sides + 1), true);
      const triangle = ring === 0 ? [center, b, a] : [center, a, b];
      triangle.forEach((vertex) => {
        heartwood.positions.push(vertex.x, vertex.y, vertex.z);
        heartwood.uvs.push(0.5, 0.5);
      });
    }
  }
  const geometry = (surface: Surface): BufferGeometry => {
    const result = new BufferGeometry();
    result.setAttribute("position", new Float32BufferAttribute(surface.positions, 3));
    result.setAttribute("uv", new Float32BufferAttribute(surface.uvs, 2));
    result.computeVertexNormals();
    return result;
  };
  return { bark: geometry(bark), heartwood: geometry(heartwood), tornEdges: geometry(edges) };
};
