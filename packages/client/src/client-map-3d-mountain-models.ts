// Low-poly mountains for the true-3D map, in the style of the owner's
// reference: each mountain is a cluster of faceted grey rocks -- one big
// rounded peak with two or three smaller rocks huddled round its foot --
// built from an irregular faceted cone-dome (a subdivided icosahedron, flat at
// the base and tapering steadily upward -- always broadest at the base, or it
// reads as a boulder -- jittered so the facets read as broken stone). No ledges, no grass on the rock: one neutral stone colour,
// lit by the sun, with snow on the upper facets only in cold country.
//
// One cluster is placed per mountain tile (client-map-3d-mountain-massif.ts),
// turned and scaled per tile; summit tiles get the big clusters, the rest of
// a range the smaller ones. Every rock is a deterministic function of its
// spec below, so a cluster always looks the same.
import { BufferAttribute, BufferGeometry, Color, DoubleSide, IcosahedronGeometry, MeshLambertMaterial } from "three";

/** One rock of a cluster, in tile units from the tile centre. */
type Rock = {
  readonly x: number;
  readonly z: number;
  /** Footprint radius. */
  readonly r: number;
  /** Height above the ground. */
  readonly h: number;
  /** Seed for its facet jitter. */
  readonly seed: number;
};

export type MountainModel = {
  readonly name: string;
  readonly rocks: readonly Rock[];
  /** Big landmark peak (summit tiles) or smaller filler (the rest of a range). */
  readonly role: "summit" | "filler";
  /** How often it's picked within its role (relative). */
  readonly weight: number;
};

export const MOUNTAIN_MODELS: readonly MountainModel[] = [
  {
    name: "peak",
    role: "summit",
    weight: 3,
    rocks: [
      { x: 0, z: 0, r: 0.56, h: 1.28, seed: 1 },
      { x: 0.38, z: 0.24, r: 0.2, h: 0.36, seed: 2 },
      { x: -0.34, z: 0.3, r: 0.15, h: 0.24, seed: 3 }
    ]
  },
  {
    name: "twin",
    role: "summit",
    weight: 2,
    rocks: [
      { x: -0.14, z: -0.04, r: 0.48, h: 1.2, seed: 4 },
      { x: 0.26, z: 0.08, r: 0.36, h: 0.78, seed: 5 },
      { x: 0.02, z: 0.4, r: 0.16, h: 0.26, seed: 6 }
    ]
  },
  {
    name: "broad",
    role: "summit",
    weight: 2,
    rocks: [
      { x: 0.04, z: 0, r: 0.6, h: 1.12, seed: 7 },
      { x: -0.4, z: -0.2, r: 0.22, h: 0.4, seed: 8 },
      { x: 0.42, z: -0.26, r: 0.17, h: 0.28, seed: 9 },
      { x: -0.22, z: 0.4, r: 0.14, h: 0.2, seed: 10 }
    ]
  },
  {
    name: "knoll",
    role: "filler",
    weight: 3,
    rocks: [
      { x: 0, z: 0.02, r: 0.44, h: 0.66, seed: 11 },
      { x: 0.32, z: -0.22, r: 0.17, h: 0.26, seed: 12 }
    ]
  },
  {
    name: "pair",
    role: "filler",
    weight: 3,
    rocks: [
      { x: -0.16, z: 0.06, r: 0.38, h: 0.58, seed: 13 },
      { x: 0.22, z: -0.1, r: 0.27, h: 0.44, seed: 14 },
      { x: 0.1, z: 0.34, r: 0.13, h: 0.18, seed: 15 }
    ]
  },
  {
    name: "rubble",
    role: "filler",
    weight: 2,
    rocks: [
      { x: -0.1, z: -0.12, r: 0.28, h: 0.42, seed: 16 },
      { x: 0.26, z: 0.12, r: 0.22, h: 0.34, seed: 17 },
      { x: -0.24, z: 0.28, r: 0.18, h: 0.26, seed: 18 },
      { x: 0.3, z: -0.3, r: 0.12, h: 0.16, seed: 19 }
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
type Facet = readonly [V, V, V];

const fract = (v: number): number => v - Math.floor(v);
// Deterministic jitter keyed on the (rounded) unit-sphere position, so the
// copies of a vertex shared by neighbouring facets move together (no cracks).
const jitter = (seed: number, x: number, y: number, z: number, salt: number): number =>
  fract(Math.sin(seed * 91.7 + Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719 + salt * 3.1) * 43758.5453) - 0.5;

// Below this height on the unit sphere the rock is cut flat (its base, sunk
// just under the ground).
const BASE_CUT = -0.25;
const SINK = 0.05;
// Width falls off with height as (1 - t)^PROFILE_POWER: under 1 bulges the
// slopes out a little (a solid shoulder), but the base is always the widest
// part -- a rock wider anywhere above its base reads as a boulder.
const PROFILE_POWER = 0.8;
// Facet jitter: the base ring stays close to its footprint; above it, the
// rock may wobble more but never out past this fraction of the base.
const BASE_WOBBLE = 0.06;
const SLOPE_WOBBLE = 0.24;
// The summit leans off-centre by up to this fraction of the footprint (asymmetric peaks).
const LEAN = 0.22;
const MAX_ABOVE_BASE = 1 - BASE_WOBBLE - 0.02;

/** A rock's facets: an irregular faceted cone-dome, broadest at its base. */
const rockFacets = (rock: Rock): Facet[] => {
  const sphere = new IcosahedronGeometry(1, 1).getAttribute("position");
  const shape = (i: number): V => {
    const ux = sphere.getX(i);
    const uy = Math.max(BASE_CUT, sphere.getY(i));
    const uz = sphere.getZ(i);
    // 0 at the base, 1 at the top.
    const t = (uy - BASE_CUT) / (1 - BASE_CUT);
    // Radius depends on height only (along this vertex's compass direction).
    const flat = Math.hypot(ux, uz) || 1;
    const profile = (1 - t) ** PROFILE_POWER;
    const radius =
      t <= 0
        ? 1 + BASE_WOBBLE * 2 * jitter(rock.seed, ux, uy, uz, 1)
        : Math.min(MAX_ABOVE_BASE, profile * (1 + SLOPE_WOBBLE * 2 * jitter(rock.seed, ux, uy, uz, 1)));
    const lift = t > 0 ? 1 + 0.16 * jitter(rock.seed, ux, uy, uz, 2) : 1;
    // Higher up, the rock drifts toward its lean: an off-centre, asymmetric summit.
    const leanX = LEAN * rock.r * jitter(rock.seed, 0, 0, 0, 3) * 2 * t;
    const leanZ = LEAN * rock.r * jitter(rock.seed, 0, 0, 0, 4) * 2 * t;
    let ox = (ux / flat) * rock.r * radius + leanX;
    let oz = (uz / flat) * rock.r * radius + leanZ;
    // Above the base nothing may reach out past it (lean included).
    const reach = Math.hypot(ox, oz);
    if (t > 0 && reach > MAX_ABOVE_BASE * rock.r) {
      ox *= (MAX_ABOVE_BASE * rock.r) / reach;
      oz *= (MAX_ABOVE_BASE * rock.r) / reach;
    }
    return {
      x: rock.x + ox,
      y: t > 0 ? Math.min(1, t * lift) * rock.h - SINK : -SINK,
      z: rock.z + oz
    };
  };
  const facets: Facet[] = [];
  for (let i = 0; i < sphere.count; i += 3) {
    const a = shape(i);
    const b = shape(i + 1);
    const c = shape(i + 2);
    // Faces entirely in the flattened base are never seen.
    if (a.y <= -SINK && b.y <= -SINK && c.y <= -SINK) continue;
    facets.push([a, b, c]);
  }
  return facets;
};

const modelFacets = (model: MountainModel): Facet[] => model.rocks.flatMap(rockFacets);

/**
 * Height of a model's surface above its ground at local (x, z) (unscaled,
 * unturned), or -Infinity outside it -- for anything that must sit on the
 * drawn rock (the river cascade).
 */
export const mountainModelHeight = (model: MountainModel, x: number, z: number): number => {
  let best = -Infinity;
  for (const [a, b, c] of modelFacets(model)) {
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

// Neutral stone: a touch lighter on facets that face up, so the tops catch
// the light the way the reference's do. Cold-country stone is a little
// cooler and paler.
const PALETTES = {
  temperate: { side: new Color("#9d9ca2"), top: new Color("#bdbcc1") },
  alpine: { side: new Color("#a0a3aa"), top: new Color("#c4c8ce") }
} as const;
// Facets this flat (normal's upward component) count as top facets.
const TOP_FLATNESS = 0.7;
// Snow (cold country) covers facets at least this high, as a fraction of their rock's height.
const SNOW_FROM = 0.62;

/**
 * Builds a model's geometry, unindexed so every facet is flat with one
 * colour, plus a per-facet aCap attribute (1 where snow can settle) for the
 * snow shader (createMountainModelMaterial).
 */
export const createMountainModelGeometry = (model: MountainModel, climate: "temperate" | "alpine"): BufferGeometry => {
  const palette = PALETTES[climate];
  const facets: { readonly f: Facet; readonly cap: boolean }[] = model.rocks.flatMap((rock) =>
    rockFacets(rock).map((f) => ({ f, cap: (f[0].y + f[1].y + f[2].y) / 3 >= rock.h * SNOW_FROM }))
  );
  const positions = new Float32Array(facets.length * 9);
  const colors = new Float32Array(facets.length * 9);
  const caps = new Float32Array(facets.length * 3);
  const color = new Color();
  facets.forEach(({ f: [a, b, c], cap }, i) => {
    [a, b, c].forEach((p, j) => positions.set([p.x, p.y, p.z], i * 9 + j * 3));
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    const ny = uz * vx - ux * vz;
    const flat = Math.abs(ny) / (Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx) || 1);
    color.copy(flat >= TOP_FLATNESS ? palette.top : palette.side);
    for (let j = 0; j < 3; j += 1) {
      colors.set([color.r, color.g, color.b], i * 9 + j * 3);
      caps[i * 3 + j] = cap && flat >= 0.35 ? 1 : 0;
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
 * Matte, flat-shaded stone (no specular highlights), multiplied by the
 * per-instance tint; snow shows white on the cap facets where the
 * instance's aSnowLine (InstancedBufferAttribute) is non-zero.
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
