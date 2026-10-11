// The true-3D mountain's own mesh: hard-edged, low-poly rock. A summit and
// three rings of vertices around it, with straight ridges and V-shaped
// creases running down from the summit -- every face a flat plane, every
// ridge a crisp line, one flat colour per facet (brown rock, grass on
// ledges -- client-map-3d-mountain-palette.ts). (It replaced the old hex
// base + 4-sided cone, which read as blocky, and a smooth sculpted version
// that read as soft-serve.) A few variants are instanced across the map
// (client-map-3d-mountain-massif.ts), each turned, scaled and tinted per tile.
//
// Snow is not geometry: the shader whitens whole facets above a
// per-instance snow line (attribute aSnowLine, 0 = bare) that are flat
// enough to hold it, so the snow line is a crisp facet edge too.
import { BufferAttribute, BufferGeometry, Color, MeshLambertMaterial } from "three";
import { mountainFacetColor } from "./client-map-3d-mountain-palette.js";

/** Footprint radius (tile units) of an unscaled mountain; its rim sinks below the ground. */
export const MOUNTAIN_RADIUS = 0.74;
/** Summit height above the ground of an unscaled mountain. */
export const MOUNTAIN_HEIGHT = 1.2;
// How far below the ground the rim sinks, so no gap shows on sloped terrain.
const RIM_SINK = 0.16;
// Fractions of the radius of the rings below the summit (the last is the rim).
const RINGS: readonly number[] = [0.34, 0.66, 1];

export type MountainShapeSpec = {
  /** Seed for ridge count, jitter and summit position. */
  readonly seed: number;
  /** Cut a V-shaped gully down the +z side (river mountains: the cascade runs down it). */
  readonly gully?: boolean;
};

const fract = (v: number): number => v - Math.floor(v);
const hash = (seed: number, k: number): number => fract(Math.sin(seed * 127.1 + k * 311.7) * 43758.5453);

type Vertex = { readonly x: number; readonly y: number; readonly z: number };
type Triangle = readonly [Vertex, Vertex, Vertex];

/** The shape's flat triangles (unscaled, local), built once per spec. */
const shapeTriangles = (spec: MountainShapeSpec): Triangle[] => {
  const gully = spec.gully ?? false;
  const segments = 7 + Math.floor(hash(spec.seed, 1) * 3);
  const summit: Vertex = {
    x: gully ? 0 : (hash(spec.seed, 2) - 0.5) * 0.12,
    y: MOUNTAIN_HEIGHT,
    z: gully ? 0 : (hash(spec.seed, 3) - 0.5) * 0.12
  };
  // A shoulder: one vertex on the first ring raised into a lower sub-peak.
  const shoulder = gully ? -1 : Math.floor(hash(spec.seed, 4) * segments);
  const ring = RINGS.map((fraction, i) =>
    Array.from({ length: segments }, (_, k): Vertex => {
      // Segment 0 of a gully mountain stays exactly on +z: the gully's axis.
      const jitter = gully && k === 0 ? 0 : (hash(spec.seed * 7 + i, k) - 0.5) * 0.55;
      const theta = ((k + jitter) / segments) * Math.PI * 2;
      const rim = i === RINGS.length - 1;
      const r = fraction * MOUNTAIN_RADIUS * (rim ? 0.92 + hash(spec.seed * 13, k) * 0.16 : 1);
      if (rim) return { x: Math.sin(theta) * r, y: -RIM_SINK, z: Math.cos(theta) * r };
      // Straight slopes; even segments are ridges (higher), odd are creases.
      const ridge = k % 2 === 0 ? 0.12 : -0.1;
      let h = (1 - fraction) * (1 + ridge) + (hash(spec.seed * 11 + i, k) - 0.5) * 0.04;
      if (i === 0 && k === shoulder) h = Math.max(h, 0.78);
      // The gully: a V-notch down the +z ridge line.
      const cut = gully && k === 0 ? (i === 0 ? 0.2 : 0.12) : 0;
      return { x: Math.sin(theta) * r, y: MOUNTAIN_HEIGHT * (h - cut), z: Math.cos(theta) * r };
    })
  );
  const triangles: Triangle[] = [];
  for (let k = 0; k < segments; k += 1) triangles.push([summit, ring[0]![k]!, ring[0]![(k + 1) % segments]!]);
  for (let i = 0; i + 1 < RINGS.length; i += 1) {
    for (let k = 0; k < segments; k += 1) {
      const a = ring[i]![k]!;
      const b = ring[i]![(k + 1) % segments]!;
      const c = ring[i + 1]![k]!;
      const d = ring[i + 1]![(k + 1) % segments]!;
      triangles.push([a, c, b], [b, c, d]);
    }
  }
  return triangles;
};

// A handful of specs at most (the massif's shapes), so this stays tiny.
const cache = new Map<string, Triangle[]>();
const trianglesFor = (spec: MountainShapeSpec): Triangle[] => {
  const key = `${spec.seed}:${spec.gully ? 1 : 0}`;
  let triangles = cache.get(key);
  if (!triangles) {
    triangles = shapeTriangles(spec);
    cache.set(key, triangles);
  }
  return triangles;
};

/**
 * Height (unscaled units, 0 = ground) of a spec's mesh surface at local
 * (x, z), tile units from the mountain's centre -- the flat facet under that
 * point, so the river cascade lies exactly on the drawn rock. -RIM_SINK
 * outside the footprint.
 */
export const mountainShapeHeight = (spec: MountainShapeSpec, x: number, z: number): number => {
  let best = -RIM_SINK;
  for (const [a, b, c] of trianglesFor(spec)) {
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

const GULLY = new Color("#4a3a30");

/**
 * Builds one variant's geometry, unindexed so each facet is flat with its own
 * colour: position, colour, and per-facet aHeight (0 at the ground, 1 at the
 * summit) / aFlat (the facet normal's upward component) for the snow shader.
 */
export const createMountainShapeGeometry = (spec: MountainShapeSpec): BufferGeometry => {
  const triangles = trianglesFor(spec);
  const positions = new Float32Array(triangles.length * 9);
  const colors = new Float32Array(triangles.length * 9);
  const heights = new Float32Array(triangles.length * 3);
  const flats = new Float32Array(triangles.length * 3);
  const color = new Color();
  triangles.forEach(([a, b, c], t) => {
    [a, b, c].forEach((v, j) => positions.set([v.x, v.y, v.z], t * 9 + j * 3));
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const flat = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
    const mid = (a.y + b.y + c.y) / 3;
    // Snow is per instance (shader); bake rock / grass by slope.
    mountainFacetColor(color, { flat, top: Math.max(a.y, b.y, c.y), heightFraction: mid / MOUNTAIN_HEIGHT, snowLine: 0, shade: 0.5 });
    const centreX = (a.x + b.x + c.x) / 3;
    const centreZ = (a.z + b.z + c.z) / 3;
    if (spec.gully && centreZ > 0 && Math.abs(Math.atan2(centreX, centreZ)) < 0.5) color.lerp(GULLY, 0.7);
    for (let j = 0; j < 3; j += 1) {
      colors.set([color.r, color.g, color.b], t * 9 + j * 3);
      heights[t * 3 + j] = Math.max(0, mid) / MOUNTAIN_HEIGHT;
      flats[t * 3 + j] = flat;
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setAttribute("aHeight", new BufferAttribute(heights, 1));
  geometry.setAttribute("aFlat", new BufferAttribute(flats, 1));
  geometry.computeVertexNormals(); // unindexed: per-facet normals
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

/**
 * Flat-shaded rock with per-facet colours, multiplied by the per-instance
 * tint, plus whole-facet shader snow above each instance's aSnowLine
 * (InstancedBufferAttribute; 0 = no snow) on facets flat enough to hold it.
 */
export const createMountainMaterial = (): MeshLambertMaterial => {
  // Matte (Lambert: no specular highlights) and flat-shaded.
  const material = new MeshLambertMaterial({ color: "#ffffff", vertexColors: true, flatShading: true });
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
          "float snow = step(0.001, vSnowLine) * step(vSnowLine, vHeight) * step(0.3, vFlat);",
          "diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.99), snow);"
        ].join("\n")
      );
  };
  material.customProgramCacheKey = () => "mountain-shape-snow";
  return material;
};
