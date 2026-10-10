// The true-3D mountain's own mesh (replacing the old hex base + 4-sided
// cone + snow cone, which read as blocky): a jittered polar grid shaped by a
// height function -- a summit and sub-peaks, ridges and gullies running down
// from it -- flat-shaded into irregular rock facets that sit with the map's
// low-poly trees, creases darker than ridges. A few variants (different ridge patterns and
// summits) are instanced across the map (client-map-3d-mountain-massif.ts),
// each turned, scaled and tinted per tile.
//
// Snow is not geometry: the shader whitens the surface above a per-instance
// snow line (attribute aSnowLine, 0 = bare) where the slope is gentle enough
// to hold it, so snow follows the ridges instead of sitting as a cap.
import { BufferAttribute, BufferGeometry, Color, MeshStandardMaterial } from "three";

/** Footprint radius (tile units) of an unscaled mountain; its rim sinks below the ground. */
export const MOUNTAIN_RADIUS = 0.74;
/** Summit height above the ground of an unscaled mountain. */
export const MOUNTAIN_HEIGHT = 1.2;
// How far below the ground the rim sinks, so no gap shows on sloped terrain.
const RIM_SINK = 0.16;
const RINGS = 9;
const SEGMENTS = 26;

export type MountainShapeSpec = {
  /** Seed for ridge count, phases and summit position. */
  readonly seed: number;
  /** Cut a gully down the +z side (river mountains: the cascade runs down it). */
  readonly gully?: boolean;
};

const fract = (v: number): number => v - Math.floor(v);
const hash = (seed: number, k: number): number => fract(Math.sin(seed * 127.1 + k * 311.7) * 43758.5453);

type Lobe = { readonly x: number; readonly z: number; readonly height: number; readonly width: number };

type ShapeParams = {
  readonly lobes: readonly Lobe[];
  readonly ridges: ReadonlyArray<{ readonly count: number; readonly phase: number; readonly weight: number }>;
  readonly crag: number;
  readonly gully: boolean;
};

// A massif, not a cone: a main summit and one or two lower sub-peaks, each
// a concave-sided lobe, scored by ridges radiating from the summit.
const shapeParams = (spec: MountainShapeSpec): ShapeParams => {
  const gully = spec.gully ?? false;
  const lobes: Lobe[] = [
    // A gully mountain keeps its summit centred so the gully runs straight down.
    { x: gully ? 0 : (hash(spec.seed, 6) - 0.5) * 0.14, z: gully ? 0 : (hash(spec.seed, 7) - 0.5) * 0.14, height: 1, width: 0.66 }
  ];
  const extra = 1 + Math.floor(hash(spec.seed, 8) * 2);
  for (let i = 0; i < extra; i += 1) {
    // Gully mountains keep their sub-peaks off the +z (gully) side.
    const angle = gully ? Math.PI * (0.55 + 0.9 * hash(spec.seed, 9 + i)) : hash(spec.seed, 9 + i) * Math.PI * 2 + i * 2.4;
    const distance = 0.22 + hash(spec.seed, 12 + i) * 0.12;
    lobes.push({ x: Math.sin(angle) * distance, z: Math.cos(angle) * distance, height: 0.5 + hash(spec.seed, 15 + i) * 0.25, width: 0.42 });
  }
  return {
    lobes,
    ridges: [
      { count: 5 + Math.floor(hash(spec.seed, 1) * 3), phase: hash(spec.seed, 2) * Math.PI * 2, weight: 0.6 },
      { count: 9 + Math.floor(hash(spec.seed, 3) * 4), phase: hash(spec.seed, 4) * Math.PI * 2, weight: 0.4 }
    ],
    crag: hash(spec.seed, 5) * Math.PI * 2,
    gully
  };
};

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0 in a crease between ridges, 1 on a ridge line. */
const ridgeness = (p: ShapeParams, theta: number): number => {
  let sum = 0;
  for (const r of p.ridges) sum += r.weight * (1 - Math.abs(Math.sin((r.count * theta) / 2 + r.phase))) ** 3;
  return sum;
};

const gullyDepth = (p: ShapeParams, rho: number, theta: number): number => {
  if (!p.gully) return 0;
  const across = Math.exp(-((theta / 0.3) ** 2));
  return 0.2 * across * smoothstep(0.12, 0.38, rho) * (1 - rho) ** 0.4;
};

/**
 * Height (unscaled units, 0 = ground) of a spec's surface at local (x, z),
 * tile units from the mountain's centre; -RIM_SINK at and past the rim.
 */
export const mountainShapeHeight = (spec: MountainShapeSpec, x: number, z: number): number => shapeHeight(shapeParams(spec), x, z);

const shapeHeight = (p: ShapeParams, x: number, z: number): number => {
  const rho = Math.min(1, Math.hypot(x, z) / MOUNTAIN_RADIUS);
  const theta = Math.atan2(x, z);
  const ridge = ridgeness(p, theta);
  let mass = 0;
  for (const lobe of p.lobes) {
    // Rounded shoulders near the top, spreading foot below (not a cone).
    const d = Math.hypot(x - lobe.x, z - lobe.z) / lobe.width;
    if (d < 1) mass = Math.max(mass, lobe.height * (1 - d ** 1.7) ** 1.5);
  }
  // Ridges run further out than the creases between them, so the foot is
  // lobed rather than a circle; everything fades out by the rim.
  const reach = 0.8 + 0.2 * Math.min(1, ridge * 1.5);
  mass *= 1 - smoothstep(reach - 0.22, reach, rho);
  const ridgeAmp = 0.32 * Math.sin(Math.PI * Math.min(1, rho * 1.2));
  const crag = 0.06 * Math.sin(9 * theta + 11 * rho + p.crag) * Math.sin(13 * rho - 5 * theta) * Math.min(1, rho * 3);
  const h = mass * (1 + ridgeAmp * (ridge - 0.45) + crag) - gullyDepth(p, rho, theta);
  return MOUNTAIN_HEIGHT * Math.max(0, h) - RIM_SINK * rho ** 3;
};

// Rock colours (sRGB), crease to ridge, and the wet dark rock of a gully.
const CREASE = new Color("#4a474c");
const RIDGE = new Color("#8a8389");
const FOOT = new Color("#6b6152");
const GULLY = new Color("#353438");

/**
 * Builds one variant's geometry: position, normal, colour (rock, creases
 * darker), and aHeight (0 at the ground, 1 at the summit) / aFlat (normal's
 * upward component) for the snow shader.
 */
export const createMountainShapeGeometry = (spec: MountainShapeSpec): BufferGeometry => {
  const p = shapeParams(spec);
  const positions: number[] = [0, shapeHeight(p, 0, 0), 0];
  for (let i = 1; i <= RINGS; i += 1) {
    const rho = (i / RINGS) ** 0.9;
    for (let k = 0; k < SEGMENTS; k += 1) {
      // Jittered off the regular polar grid (not on the rim) so the facets
      // are irregular, like broken rock, instead of a pleated cone.
      const jitter = i < RINGS ? 1 : 0;
      const theta = ((k + (hash(spec.seed * 31 + i, k) - 0.5) * 0.6 * jitter) / SEGMENTS) * Math.PI * 2;
      const r = Math.min(1, rho + (hash(spec.seed * 17 + k, i) - 0.5) * 0.07 * jitter);
      const x = Math.sin(theta) * r * MOUNTAIN_RADIUS;
      const z = Math.cos(theta) * r * MOUNTAIN_RADIUS;
      positions.push(x, shapeHeight(p, x, z), z);
    }
  }
  const at = (i: number, k: number): number => (i === 0 ? 0 : 1 + (i - 1) * SEGMENTS + (k % SEGMENTS));
  const indices: number[] = [];
  for (let k = 0; k < SEGMENTS; k += 1) indices.push(0, at(1, k), at(1, k + 1));
  for (let i = 1; i < RINGS; i += 1) {
    for (let k = 0; k < SEGMENTS; k += 1) indices.push(at(i, k), at(i + 1, k), at(i, k + 1), at(i, k + 1), at(i + 1, k), at(i + 1, k + 1));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal");
  const count = positions.length / 3;
  const colors = new Float32Array(count * 3);
  const heights = new Float32Array(count);
  const flats = new Float32Array(count);
  const color = new Color();
  for (let v = 0; v < count; v += 1) {
    const x = positions[v * 3]!;
    const y = positions[v * 3 + 1]!;
    const z = positions[v * 3 + 2]!;
    const rho = Math.min(1, Math.hypot(x, z) / MOUNTAIN_RADIUS);
    const theta = Math.atan2(x, z);
    color.copy(CREASE).lerp(RIDGE, Math.min(1, ridgeness(p, theta) * 1.4));
    color.lerp(FOOT, smoothstep(0.7, 1, rho) * 0.6);
    if (p.gully) color.lerp(GULLY, Math.min(1, gullyDepth(p, rho, theta) * 8));
    colors[v * 3] = color.r;
    colors[v * 3 + 1] = color.g;
    colors[v * 3 + 2] = color.b;
    heights[v] = Math.max(0, y) / MOUNTAIN_HEIGHT;
    flats[v] = normals.getY(v);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setAttribute("aHeight", new BufferAttribute(heights, 1));
  geometry.setAttribute("aFlat", new BufferAttribute(flats, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

/**
 * Faceted rock with vertex colours, multiplied by the per-instance tint,
 * plus shader snow above each instance's aSnowLine (InstancedBufferAttribute;
 * 0 = no snow) on slopes gentle enough to hold it.
 */
export const createMountainMaterial = (): MeshStandardMaterial => {
  const material = new MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aHeight;\nattribute float aFlat;\nattribute float aSnowLine;\nvarying float vHeight;\nvarying float vFlat;\nvarying float vSnowLine;"
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvHeight = aHeight;\nvFlat = aFlat;\nvSnowLine = aSnowLine;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vHeight;\nvarying float vFlat;\nvarying float vSnowLine;")
      .replace(
        "#include <color_fragment>",
        [
          "#include <color_fragment>",
          "float snowEdge = vSnowLine + 0.05 * sin(vHeight * 40.0 + vFlat * 13.0);",
          "float snow = step(0.001, vSnowLine) * smoothstep(snowEdge, snowEdge + 0.07, vHeight) * smoothstep(0.15, 0.45, vFlat);",
          "diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.99), snow);"
        ].join("\n")
      );
  };
  material.customProgramCacheKey = () => "mountain-shape-snow";
  return material;
};
