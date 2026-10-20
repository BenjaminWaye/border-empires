// Hand-built tree models for the true-3D map (client-map-3d-forest.ts,
// client-map-3d-tropical-forest.ts): one merged geometry per species, built
// from a few cheap primitives with baked lighting cues instead of the old
// single cone / single icosahedron per tree:
//   pine   -- three stacked, star-edged needle tiers with drooping branch tips;
//   spruce -- four narrower, darker tiers;
//   leaf   -- a broadleaf crown of four jittered, overlapping leaf clumps;
//   palm   -- a curved, ring-banded trunk under a crown of creased, drooping fronds.
// Vertex colours carry the shading a texture would: each tier/clump darkens
// toward its underside and the tree's core (fake ambient occlusion) and
// lightens toward the sun-catching tips, with a little per-facet speckle so
// a canopy reads as clustered leaves rather than flat plastic.
//
// Every model stands on y = 0 (the trunk sinks 0.04 below so it never floats
// on a slope) and stays about half a mountain massif's height -- see
// client-map-3d-forest-size.test.ts. Triangle counts stay modest (~60-115 per
// tree) because a zoomed-out view draws thousands of trees, twice (colour +
// shadow pass).
import { Color, IcosahedronGeometry, type BufferGeometry } from "three";
import { createTreeGeometryBuilder, type TreeGeometryBuilder, type Vec3 } from "./client-map-3d-tree-geometry-builder.js";

const TRUNK_BASE_Y = -0.04;

// Deterministic 0..1 for model detail (facet speckle, clump jitter), so a
// species always builds the identical geometry.
const detailHash = (a: number, b: number, c: number): number => {
  const h = (Math.imul(Math.round(a * 1000), 73856093) ^ Math.imul(Math.round(b * 1000), 19349663) ^ Math.imul(Math.round(c * 1000), 83492791)) >>> 0;
  return (h % 10007) / 10007;
};

const shade = (color: Color, factor: number): Color => color.clone().multiplyScalar(factor);

type TrunkSpec = {
  readonly height: number;
  readonly baseRadius: number;
  readonly topRadius: number;
  readonly sides: number;
  readonly segments: number;
  /** Sideways (+x) drift of the top, curving in quadratically (palms). */
  readonly bend: number;
  readonly base: Color;
  readonly top: Color;
  /** Alternate rings darkened by this factor (palm bark rings); 1 = none. */
  readonly banding: number;
};

const addTrunk = (b: TreeGeometryBuilder, spec: TrunkSpec): Vec3 => {
  const ring = (i: number): { readonly points: Vec3[]; readonly color: Color; readonly center: Vec3 } => {
    const t = i / spec.segments;
    const y = TRUNK_BASE_Y + (spec.height - TRUNK_BASE_Y) * t;
    const cx = spec.bend * t * t;
    const radius = spec.baseRadius + (spec.topRadius - spec.baseRadius) * t;
    const points: Vec3[] = [];
    for (let s = 0; s < spec.sides; s += 1) {
      const angle = (s / spec.sides) * Math.PI * 2;
      points.push([cx + Math.cos(angle) * radius, y, Math.sin(angle) * radius]);
    }
    const color = spec.base.clone().lerp(spec.top, t);
    if (i % 2 === 1) color.multiplyScalar(spec.banding);
    return { points, color, center: [cx, y, 0] };
  };
  let lower = ring(0);
  for (let i = 1; i <= spec.segments; i += 1) {
    const upper = ring(i);
    for (let s = 0; s < spec.sides; s += 1) {
      const n = (s + 1) % spec.sides;
      const inside: Vec3 = [(lower.center[0] + upper.center[0]) / 2, (lower.center[1] + upper.center[1]) / 2, 0];
      b.quad(lower.points[s]!, lower.points[n]!, upper.points[n]!, upper.points[s]!, lower.color, lower.color, upper.color, upper.color, {
        inside,
        volumeBlend: 0.6,
        foliage: false
      });
    }
    lower = upper;
  }
  return lower.center;
};

type TierSpec = {
  readonly y0: number;
  readonly y1: number;
  readonly radius: number;
  /** Even: alternating branch tips and notches. */
  readonly segments: number;
  readonly turn: number;
  /** Notch radius as a fraction of the tip radius (the star-shaped edge). */
  readonly jag: number;
  /** How far branch tips hang below the tier's base. */
  readonly droop: number;
  readonly tip: Color;
  readonly apex: Color;
  readonly under: Color;
};

const addConeTier = (b: TreeGeometryBuilder, spec: TierSpec): void => {
  const rim: Vec3[] = [];
  for (let i = 0; i < spec.segments; i += 1) {
    const angle = spec.turn + (i / spec.segments) * Math.PI * 2;
    const isTip = i % 2 === 0;
    const radius = spec.radius * (isTip ? 1 : spec.jag);
    rim.push([Math.cos(angle) * radius, spec.y0 - (isTip ? spec.droop : 0), Math.sin(angle) * radius]);
  }
  const apex: Vec3 = [0, spec.y1, 0];
  // Underside rises into the tier, so from below it's a dark hollow, not a flat lid.
  const underApex: Vec3 = [0, spec.y0 + (spec.y1 - spec.y0) * 0.15, 0];
  const inside: Vec3 = [0, spec.y0 - spec.radius * 0.6, 0];
  const notch = shade(spec.tip, 0.78);
  for (let i = 0; i < spec.segments; i += 1) {
    const a = rim[i]!;
    const c = rim[(i + 1) % spec.segments]!;
    const ca = i % 2 === 0 ? spec.tip : notch;
    const cc = i % 2 === 0 ? notch : spec.tip;
    b.tri(a, c, apex, ca, cc, spec.apex, { inside, volumeBlend: 0.4, foliage: true });
    b.tri(a, c, underApex, spec.under, spec.under, shade(spec.under, 0.8), { inside: [0, spec.y1 + 1, 0], volumeBlend: 0, foliage: true });
  }
};

type ClumpSpec = {
  readonly center: Vec3;
  readonly radius: number;
  readonly seed: number;
};

type CanopySpec = {
  readonly clumps: readonly ClumpSpec[];
  /** Point the leaf normals radiate from, so the clumps light as one crown. */
  readonly crownCenter: Vec3;
  readonly bottomY: number;
  readonly topY: number;
  readonly low: Color;
  readonly high: Color;
};

const addCanopy = (b: TreeGeometryBuilder, spec: CanopySpec): void => {
  const ico = new IcosahedronGeometry(1, 0);
  const unit = ico.getAttribute("position");
  for (const clump of spec.clumps) {
    const vertexAt = (index: number): Vec3 => {
      const dx = unit.getX(index);
      const dy = unit.getY(index);
      const dz = unit.getZ(index);
      // Keyed on the direction, so the corners neighbouring faces share move
      // together and the clump stays watertight.
      const radius = clump.radius * (0.84 + detailHash(dx, dy, dz + clump.seed) * 0.3);
      const flatten = dy < -0.3 ? 0.7 : 1; // leaf clumps sit flatter underneath
      return [clump.center[0] + dx * radius, clump.center[1] + dy * radius * flatten, clump.center[2] + dz * radius];
    };
    for (let i = 0; i < unit.count; i += 3) {
      const corners = [vertexAt(i), vertexAt(i + 1), vertexAt(i + 2)] as const;
      const speckle = 0.86 + detailHash(i, clump.seed, 7) * 0.2;
      const [ca, cb, cc] = corners.map((p) => {
        const height = Math.min(1, Math.max(0, (p[1] - spec.bottomY) / (spec.topY - spec.bottomY)));
        // Inner-crown occlusion: the side of a clump turned toward the
        // crown's centre is buried among the other clumps, so it goes dark,
        // and the gaps between clumps read as depth.
        const fromClump = [p[0] - clump.center[0], p[1] - clump.center[1], p[2] - clump.center[2]];
        const fromCrown = [p[0] - spec.crownCenter[0], p[1] - spec.crownCenter[1], p[2] - spec.crownCenter[2]];
        const facing = (fromClump[0]! * fromCrown[0]! + fromClump[1]! * fromCrown[1]! + fromClump[2]! * fromCrown[2]!) /
          ((Math.hypot(fromClump[0]!, fromClump[1]!, fromClump[2]!) * Math.hypot(fromCrown[0]!, fromCrown[1]!, fromCrown[2]!)) || 1);
        const t = Math.min(1, Math.max(0, height * 0.65 + (facing * 0.5 + 0.5) * 0.45 - 0.05));
        return spec.low.clone().lerp(spec.high, t * t * (3 - 2 * t)).multiplyScalar(speckle);
      }) as [Color, Color, Color];
      b.tri(corners[0], corners[1], corners[2], ca, cb, cc, { inside: clump.center, volumeBlend: 0.35, volumeCenter: spec.crownCenter, foliage: true });
    }
  }
  ico.dispose();
};

type FrondSpec = {
  readonly crown: Vec3;
  readonly angle: number;
  readonly length: number;
  readonly width: number;
  readonly rise: number;
  readonly droop: number;
  readonly segments: number;
  readonly base: Color;
  readonly tip: Color;
};

const addFrond = (b: TreeGeometryBuilder, spec: FrondSpec): void => {
  const dx = Math.cos(spec.angle);
  const dz = Math.sin(spec.angle);
  const spine = (t: number): Vec3 => [
    spec.crown[0] + dx * spec.length * t,
    spec.crown[1] + spec.rise * t - spec.droop * t * t,
    spec.crown[2] + dz * spec.length * t
  ];
  // Narrow at the stem, widest just past the middle, pointed at the tip; the
  // edges hang below the spine so each frond is a shallow tent that catches
  // the light on one slope and shades on the other.
  const edge = (t: number, side: number): Vec3 => {
    const halfWidth = spec.width * Math.sin(Math.PI * (0.12 + 0.88 * t));
    const s = spine(t);
    return [s[0] - dz * halfWidth * side, s[1] - halfWidth * 0.35, s[2] + dx * halfWidth * side];
  };
  for (let i = 0; i < spec.segments; i += 1) {
    const t0 = i / spec.segments;
    const t1 = (i + 1) / spec.segments;
    const c0 = spec.base.clone().lerp(spec.tip, t0);
    const c1 = spec.base.clone().lerp(spec.tip, t1);
    const s0 = spine(t0);
    const s1 = spine(t1);
    for (const side of [-1, 1]) {
      const edgeShade = side < 0 ? 0.82 : 1;
      b.quad(s0, s1, edge(t1, side), edge(t0, side), c0, c1, shade(c1, edgeShade), shade(c0, edgeShade), {
        inside: [s0[0], s0[1] - 1, s0[2]],
        volumeBlend: 0.25,
        volumeCenter: [spec.crown[0], spec.crown[1] - 0.2, spec.crown[2]],
        foliage: true
      });
    }
  }
};

const BARK = { base: new Color("#5a3d2e"), top: new Color("#8c5f4a") };

const tierColors = (tip: string, apex: string, under: string, factor: number): Pick<TierSpec, "tip" | "apex" | "under"> => ({
  tip: shade(new Color(tip), factor),
  apex: shade(new Color(apex), factor),
  under: shade(new Color(under), factor)
});

/** Pine: three star-edged needle tiers, lighter teal-green. */
export const createPineGeometry = (): BufferGeometry => {
  const b = createTreeGeometryBuilder();
  addTrunk(b, { height: 0.3, baseRadius: 0.032, topRadius: 0.016, sides: 5, segments: 1, bend: 0, ...BARK, banding: 1 });
  const tiers: ReadonlyArray<readonly [number, number, number, number]> = [
    [0.12, 0.36, 0.17, 0.8],
    [0.24, 0.47, 0.135, 0.92],
    [0.35, 0.57, 0.095, 1.06]
  ];
  tiers.forEach(([y0, y1, radius, light], i) => {
    addConeTier(b, { y0, y1, radius, segments: 8, turn: i * 0.4, jag: 0.72, droop: 0.035, ...tierColors("#3f7448", "#79a868", "#183020", light) });
  });
  return b.build(0.57);
};

/** Spruce: four narrower, deeper-green tiers -- taller and darker than pine. */
export const createSpruceGeometry = (): BufferGeometry => {
  const b = createTreeGeometryBuilder();
  addTrunk(b, { height: 0.26, baseRadius: 0.028, topRadius: 0.015, sides: 5, segments: 1, bend: 0, ...BARK, banding: 1 });
  const tiers: ReadonlyArray<readonly [number, number, number, number, number]> = [
    [0.1, 0.3, 0.135, 8, 0.78],
    [0.2, 0.4, 0.11, 8, 0.88],
    [0.3, 0.5, 0.085, 6, 0.98],
    [0.4, 0.61, 0.06, 6, 1.08]
  ];
  tiers.forEach(([y0, y1, radius, segments, light], i) => {
    addConeTier(b, { y0, y1, radius, segments, turn: i * 0.55, jag: 0.66, droop: 0.04, ...tierColors("#365c40", "#628a66", "#132419", light) });
  });
  return b.build(0.61);
};

/** Leaf/deciduous: a broad crown of four overlapping leaf clumps, warmer and lighter green. */
export const createLeafGeometry = (): BufferGeometry => {
  const b = createTreeGeometryBuilder();
  addTrunk(b, { height: 0.32, baseRadius: 0.034, topRadius: 0.018, sides: 5, segments: 1, bend: 0, ...BARK, banding: 1 });
  addCanopy(b, {
    clumps: [
      { center: [0, 0.33, 0], radius: 0.16, seed: 1 },
      { center: [0.11, 0.27, 0.06], radius: 0.12, seed: 2 },
      { center: [-0.1, 0.27, 0.07], radius: 0.105, seed: 4 },
      { center: [-0.07, 0.41, -0.05], radius: 0.12, seed: 3 }
    ],
    crownCenter: [0, 0.3, 0],
    bottomY: 0.18,
    topY: 0.53,
    low: new Color("#2b4718"),
    high: new Color("#80a443")
  });
  return b.build(0.53);
};

/** Tropical palm: a curved, ring-banded trunk under seven creased, drooping fronds. */
export const createPalmGeometry = (): BufferGeometry => {
  const b = createTreeGeometryBuilder();
  const crown = addTrunk(b, {
    height: 0.5,
    baseRadius: 0.038,
    topRadius: 0.02,
    sides: 5,
    segments: 3,
    bend: 0.07,
    base: new Color("#6e5236"),
    top: new Color("#9c7c52"),
    banding: 0.82
  });
  const fronds = 7;
  for (let i = 0; i < fronds; i += 1) {
    addFrond(b, {
      crown,
      angle: (i / fronds) * Math.PI * 2 + detailHash(i, 3, 5) * 0.4,
      length: 0.19 + detailHash(i, 9, 1) * 0.04,
      width: 0.05,
      rise: 0.06,
      droop: 0.15,
      segments: 3,
      base: new Color("#2e6630"),
      tip: new Color("#80b552")
    });
  }
  return b.build(0.5);
};
