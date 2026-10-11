// Hand-designed low-poly mountain models for the true-3D map, in the warm
// stylised look of the owner's reference: brown rock built up in tiers, each
// tier stepping in to a ledge that carries grass, and pointed peaks that can
// wear a small snow cap. Every model is authored (fixed outlines and heights
// below), not generated -- the generated surfaces read as buggy -- and one is
// placed per mountain tile (client-map-3d-mountain-massif.ts), turned and
// scaled, overlapping its neighbours a little so touching tiles read as a
// range of distinct peaks.
import { BufferAttribute, BufferGeometry, Color, DoubleSide, MeshLambertMaterial } from "three";

/** A tier: an outline ring at height `h` (tile units above the ground). */
type Tier = {
  readonly h: number;
  /** Outline radius (tile units) per side, going round. */
  readonly r: readonly number[];
  /**
   * Step in to a ledge at this height, per side: the inner ring's fraction of
   * the outline (1 = no step: the wall carries straight on). Partial,
   * irregular ledges read as layered rock; a full ring reads as stacked plates.
   */
  readonly ledge?: readonly number[];
};

/** One peak of a model: tiers bottom to top, then a point (or a flat top). */
type Part = {
  readonly x: number;
  readonly z: number;
  readonly tiers: readonly Tier[];
  /** The summit; null for a flat (grassy) top on the last tier. */
  readonly apex: { readonly x: number; readonly z: number; readonly h: number } | null;
  /** Snow line: the peak above this height is the snow cap (shown on snowy peaks). */
  readonly snowFrom?: number;
};

export type MountainModel = {
  readonly name: string;
  readonly parts: readonly Part[];
  /** Big landmark peak (summit tiles) or smaller filler (the rest of a range). */
  readonly role: "summit" | "filler";
  /** How often it's picked within its role (relative). */
  readonly weight: number;
};

// A ledge pattern for a tier: steps in to `depth` on about half its sides,
// irregularly (fixed pattern), and carries the wall straight on elsewhere.
const LEDGE_PATTERN = [1, 0, 1, 1, 0, 0, 1, 0, 1];
const L = (depth: number): readonly number[] => LEDGE_PATTERN.map((on, k) => (on ? depth - (k % 3) * 0.04 : 1));

// Outlines are written out per side so every silhouette is deliberate and
// a little irregular. Heights: a summit peak is ~1.2-1.4, fillers lower.
export const MOUNTAIN_MODELS: readonly MountainModel[] = [
  {
    name: "spire",
    role: "summit",
    weight: 3,
    parts: [
      {
        x: 0,
        z: 0,
        tiers: [
          { h: -0.08, r: [0.72, 0.64, 0.7, 0.6, 0.74, 0.66, 0.62] },
          { h: 0.34, r: [0.58, 0.5, 0.56, 0.47, 0.6, 0.52, 0.5], ledge: L(0.78) },
          { h: 0.78, r: [0.36, 0.32, 0.38, 0.3, 0.35, 0.33, 0.3], ledge: L(0.8) }
        ],
        apex: { x: 0.03, z: 0.02, h: 1.38 },
        snowFrom: 1.02
      }
    ]
  },
  {
    name: "twin",
    role: "summit",
    weight: 2,
    parts: [
      {
        x: -0.16,
        z: 0.04,
        tiers: [
          { h: -0.08, r: [0.6, 0.54, 0.62, 0.5, 0.58, 0.55] },
          { h: 0.4, r: [0.42, 0.38, 0.44, 0.35, 0.4, 0.39], ledge: L(0.8) }
        ],
        apex: { x: 0, z: 0, h: 1.26 },
        snowFrom: 0.96
      },
      {
        x: 0.26,
        z: -0.08,
        tiers: [
          { h: -0.08, r: [0.5, 0.46, 0.52, 0.44, 0.49, 0.47] },
          { h: 0.34, r: [0.34, 0.31, 0.36, 0.3, 0.33, 0.32], ledge: L(0.8) }
        ],
        apex: { x: 0.02, z: 0, h: 0.98 },
        snowFrom: 0.8
      }
    ]
  },
  {
    name: "massif",
    role: "summit",
    weight: 2,
    parts: [
      {
        x: 0.06,
        z: 0,
        tiers: [
          { h: -0.08, r: [0.82, 0.64, 0.58, 0.66, 0.84, 0.66, 0.56, 0.62, 0.8] },
          { h: 0.3, r: [0.66, 0.52, 0.47, 0.54, 0.68, 0.53, 0.45, 0.5, 0.64], ledge: L(0.82) },
          { h: 0.64, r: [0.42, 0.33, 0.3, 0.35, 0.44, 0.34, 0.29, 0.32, 0.4], ledge: L(0.84) }
        ],
        apex: { x: 0.1, z: 0, h: 1.18 },
        snowFrom: 0.92
      },
      {
        x: -0.38,
        z: 0.06,
        tiers: [
          { h: -0.08, r: [0.38, 0.34, 0.4, 0.33, 0.36, 0.35] },
          { h: 0.3, r: [0.25, 0.22, 0.26, 0.21, 0.24, 0.23], ledge: L(0.82) }
        ],
        apex: { x: 0, z: 0, h: 0.74 }
      }
    ]
  },
  {
    name: "crag",
    role: "summit",
    weight: 2,
    parts: [
      {
        x: 0,
        z: 0,
        tiers: [
          { h: -0.08, r: [0.64, 0.56, 0.66, 0.58, 0.6] },
          { h: 0.46, r: [0.4, 0.34, 0.42, 0.36, 0.38], ledge: L(0.78) }
        ],
        apex: { x: 0.12, z: 0.08, h: 1.12 },
        snowFrom: 0.88
      }
    ]
  },
  {
    name: "mesa",
    role: "filler",
    // Rare: several flat tops together read as tree stumps.
    weight: 1,
    parts: [
      {
        x: 0,
        z: 0,
        tiers: [
          { h: -0.08, r: [0.72, 0.66, 0.74, 0.64, 0.7, 0.68, 0.73, 0.65] },
          { h: 0.26, r: [0.62, 0.56, 0.64, 0.55, 0.6, 0.58, 0.63, 0.56], ledge: L(0.84) },
          { h: 0.52, r: [0.48, 0.44, 0.5, 0.43, 0.47, 0.45, 0.49, 0.44] }
        ],
        apex: null
      }
    ]
  },
  {
    name: "knoll",
    role: "filler",
    weight: 3,
    parts: [
      {
        x: 0,
        z: 0,
        tiers: [
          { h: -0.08, r: [0.66, 0.6, 0.68, 0.58, 0.64, 0.62, 0.6] },
          { h: 0.28, r: [0.46, 0.42, 0.48, 0.4, 0.45, 0.43, 0.42], ledge: L(0.78) }
        ],
        apex: { x: -0.04, z: 0.03, h: 0.62 }
      }
    ]
  },
  {
    name: "foothill",
    role: "filler",
    weight: 3,
    parts: [
      {
        x: -0.18,
        z: 0.06,
        tiers: [
          { h: -0.08, r: [0.48, 0.42, 0.5, 0.4, 0.46, 0.44] },
          { h: 0.26, r: [0.32, 0.28, 0.34, 0.27, 0.31, 0.3], ledge: L(0.8) }
        ],
        apex: { x: 0, z: 0, h: 0.7 }
      },
      {
        x: 0.24,
        z: -0.1,
        tiers: [
          { h: -0.08, r: [0.42, 0.38, 0.44, 0.36, 0.4, 0.39] },
          { h: 0.22, r: [0.27, 0.24, 0.28, 0.23, 0.26, 0.25], ledge: L(0.8) }
        ],
        apex: { x: 0.02, z: 0, h: 0.56 }
      }
    ]
  }
];

/**
 * Indices into MOUNTAIN_MODELS by role, each repeated by its weight, for
 * placement (pick one by hash).
 */
const weighted = (role: MountainModel["role"]): number[] =>
  MOUNTAIN_MODELS.flatMap((m, i) => (m.role === role ? Array.from({ length: m.weight }, () => i) : []));
export const SUMMIT_MODELS = weighted("summit");
export const FILLER_MODELS = weighted("filler");

type V = { readonly x: number; readonly y: number; readonly z: number };
type Facet = { readonly v: readonly [V, V, V]; readonly cap: boolean };

const ringAt = (part: Part, tier: Tier, scale: (k: number) => number = () => 1, h = tier.h): V[] =>
  tier.r.map((r, k) => {
    const a = (k / tier.r.length) * Math.PI * 2;
    return { x: part.x + Math.sin(a) * r * scale(k), y: h, z: part.z + Math.cos(a) * r * scale(k) };
  });

/** The model's facets: tier walls, flat ledges, and the peak (or flat top). */
const modelFacets = (model: MountainModel): Facet[] => {
  const facets: Facet[] = [];
  for (const part of model.parts) {
    const n = part.tiers[0]!.r.length;
    const push = (a: V, b: V, c: V): void => {
      facets.push({ v: [a, b, c], cap: false });
    };
    // Walls between rings (CCW seen from outside); quads split into two.
    const wall = (lower: V[], upper: V[]): void => {
      for (let k = 0; k < n; k += 1) {
        const a = lower[k]!;
        const b = lower[(k + 1) % n]!;
        const c = upper[k]!;
        const d = upper[(k + 1) % n]!;
        push(a, b, c);
        push(b, d, c);
      }
    };
    let below = ringAt(part, part.tiers[0]!);
    for (let t = 1; t < part.tiers.length; t += 1) {
      const tier = part.tiers[t]!;
      const outer = ringAt(part, tier);
      wall(below, outer);
      if (tier.ledge !== undefined) {
        // A ledge stepping in to the next tier's foot (where the side has one).
        const ledge = tier.ledge;
        const inner = ringAt(part, tier, (k) => ledge[k % ledge.length]!);
        for (let k = 0; k < n; k += 1) {
          push(outer[k]!, outer[(k + 1) % n]!, inner[k]!);
          push(outer[(k + 1) % n]!, inner[(k + 1) % n]!, inner[k]!);
        }
        below = inner;
      } else {
        below = outer;
      }
    }
    const top = part.tiers[part.tiers.length - 1]!;
    const apex: V = part.apex ? { x: part.x + part.apex.x, y: part.apex.h, z: part.z + part.apex.z } : { x: part.x, y: top.h, z: part.z };
    if (part.apex && part.snowFrom !== undefined && part.snowFrom > top.h && part.snowFrom < apex.y) {
      // Cut the peak at the snow line: a ring there, the cap above it.
      const t = (part.snowFrom - top.h) / (apex.y - top.h);
      const line = below.map((p) => ({ x: p.x + (apex.x - p.x) * t, y: part.snowFrom!, z: p.z + (apex.z - p.z) * t }));
      wall(below, line);
      for (let k = 0; k < n; k += 1) facets.push({ v: [line[k]!, line[(k + 1) % n]!, apex], cap: true });
    } else {
      for (let k = 0; k < n; k += 1) push(below[k]!, below[(k + 1) % n]!, apex);
    }
  }
  return facets;
};

/**
 * Height of a model's surface above its ground at local (x, z) (unscaled,
 * unturned), or -Infinity outside it -- for anything that must sit on the
 * drawn rock (the river cascade).
 */
export const mountainModelHeight = (model: MountainModel, x: number, z: number): number => {
  let best = -Infinity;
  for (const { v: [a, b, c] } of modelFacets(model)) {
    const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    if (Math.abs(d) < 1e-12) continue;
    const wa = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
    const wb = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
    const wc = 1 - wa - wb;
    if (wa < -1e-9 || wb < -1e-9 || wc < -1e-9) continue;
    best = Math.max(best, wa * a.y + wb * b.y + wc * c.y);
  }
  return best;
};

// Palettes (sRGB). Rock lightens a little toward the top; ledges and flat
// tops are grass (temperate) or pale stone (alpine, cold country).
const PALETTES = {
  temperate: { rockLow: new Color("#6d5140"), rockHigh: new Color("#9a7556"), ledge: new Color("#86b445") },
  alpine: { rockLow: new Color("#5c5f67"), rockHigh: new Color("#9b9ea6"), ledge: new Color("#b9bec4") }
} as const;
// Facets at least this flat (normal's upward component) are ledges.
const LEDGE_FLATNESS = 0.8;
const MODEL_TOP = 1.4;

/**
 * Builds a model's geometry, unindexed so every facet is flat with one
 * colour, plus a per-facet aCap attribute (1 on the snow cap) for the snow
 * shader (createMountainModelMaterial).
 */
export const createMountainModelGeometry = (model: MountainModel, climate: "temperate" | "alpine"): BufferGeometry => {
  const facets = modelFacets(model);
  const palette = PALETTES[climate];
  const positions = new Float32Array(facets.length * 9);
  const colors = new Float32Array(facets.length * 9);
  const caps = new Float32Array(facets.length * 3);
  const color = new Color();
  facets.forEach(({ v: [a, b, c], cap }, f) => {
    [a, b, c].forEach((p, j) => positions.set([p.x, p.y, p.z], f * 9 + j * 3));
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    const ny = uz * vx - ux * vz;
    const flat = Math.abs(ny) / (Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx) || 1);
    const mid = Math.max(0, (a.y + b.y + c.y) / 3);
    if (flat >= LEDGE_FLATNESS) color.copy(palette.ledge);
    else color.copy(palette.rockLow).lerp(palette.rockHigh, Math.min(1, mid / MODEL_TOP));
    for (let j = 0; j < 3; j += 1) {
      colors.set([color.r, color.g, color.b], f * 9 + j * 3);
      caps[f * 3 + j] = cap ? 1 : 0;
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setAttribute("aCap", new BufferAttribute(caps, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

/**
 * Matte, flat-shaded rock (no specular highlights), multiplied by the
 * per-instance tint; the snow cap shows white where the instance's
 * aSnowLine (InstancedBufferAttribute) is non-zero.
 */
export const createMountainModelMaterial = (): MeshLambertMaterial => {
  // Double-sided so a facet wound the other way can never drop out.
  const material = new MeshLambertMaterial({ color: "#ffffff", vertexColors: true, flatShading: true, side: DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aCap;\nattribute float aSnowLine;\nvarying float vSnow;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSnow = aCap * step(0.001, aSnowLine);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vSnow;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.95, 0.97), step(0.5, vSnow));");
  };
  material.customProgramCacheKey = () => "mountain-model-snow";
  return material;
};
