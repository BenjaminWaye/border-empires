// History snapshot: packages/client/src/client-map-3d-town-overlay/town-mesh-builder.ts at commit fc4288dd (2026-10-20).
// Frozen for Storybook's History/Town Progression; edit only to keep it compiling.
// Vertex-coloured primitive kit the procedural towns are assembled from.
//
// Every primitive is baked into one merged, flat-shaded BufferGeometry per
// tier (see town-tier-geometry.ts), so a town costs one draw call however much
// detail it carries -- the same trick the farmland/fishing models use, with
// the colour carried per vertex instead of per material.
//
// Local frame: one tile is 1 x 1, centred on the origin; y = 0 is the terrain
// surface. +z faces the camera (it always looks north), so fronts face +z.
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Clockwork-city palette: grey stone and graphite skyscrapers trimmed in the
// AFC's (client-map-3d-fabrication-complex.ts) aged brass and blackened iron,
// lit by warm lamplight with cyan aether for the stranger machinery. Colours
// in TOWN_METAL_COLORS are drawn with the overlay's metallic material, like
// the AFC's metalwork.
export const TOWN_COLORS = {
  stone: "#777a80",
  stoneLight: "#8b8e94",
  stoneDark: "#5d6066",
  graphite: "#4a4d53",
  plate: "#a3a4a6",
  // Warm flagstone sidewalks and plazas, and dark streets between them.
  paving: "#aaa69c",
  asphalt: "#5a5d63",
  window: "#2c3038",
  // Curtain-wall glass: drawn with the metallic material so it mirrors the sky.
  glass: "#56788a",
  glassLight: "#6a8ea0",
  steam: "#e9e6df",
  water: "#4f8fae",
  brass: "#c9a05a",
  brassDark: "#8b6c3d",
  iron: "#3a3e46",
  ironDark: "#25282e",
  foliage: "#5f9a3c",
  foliageLight: "#86b34a",
  blossom: "#d9789a",
  blossomGold: "#e9c45a",
  // Banner cloth: white, so the owner's colour (instanceColor) shows true.
  cloth: "#ffffff",
  trunk: "#6b4a2e",
  // Glow-only colours (drawn unlit by the overlay's glow and halo meshes).
  lamp: "#ffd58a",
  shopfront: "#ffbe72",
  aether: "#9ff4ff",
  // Aircraft-warning lights on the tallest spires (they blink; see townBeacon).
  beacon: "#ff4a3a"
} as const;

export type TownColor = keyof typeof TOWN_COLORS;

/** Metalwork: drawn with the metallic material, the way the AFC renders its iron and brass. */
export const TOWN_METAL_COLORS: ReadonlySet<TownColor> = new Set<TownColor>(["brass", "brassDark", "iron", "ironDark"]);

/** Curtain-wall glass and still water: drawn with their own near-mirror material so they reflect the sky. */
export const TOWN_GLASS_COLORS: ReadonlySet<TownColor> = new Set<TownColor>(["glass", "glassLight", "water"]);

/** Baked ambient occlusion: everything darkens towards the street, to this
 * share of its colour at y = 0 and below, and is fully lit from
 * TOWN_OCCLUSION_HEIGHT up -- so towers stand on the plate instead of
 * floating over it. Parts thinner than TOWN_PAVING_THICKNESS (paving, plates,
 * water, bands) lie flat and keep their colour. */
export const TOWN_OCCLUSION_FLOOR = 0.6;
export const TOWN_OCCLUSION_HEIGHT = 0.11;
const TOWN_PAVING_THICKNESS = 0.009;

/** Share (0..1) of a vertex's colour left by the baked occlusion at height y. */
export const townOcclusionAt = (y: number): number => {
  const t = Math.min(1, Math.max(0, y / TOWN_OCCLUSION_HEIGHT));
  return TOWN_OCCLUSION_FLOOR + (1 - TOWN_OCCLUSION_FLOOR) * t * t * (3 - 2 * t);
};

const UNIT_BOX = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const UNIT_BOX_CENTRED = new BoxGeometry(1, 1, 1);
const UNIT_PANEL = new PlaneGeometry(1, 1);
const UNIT_PYRAMID = new ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);

/** Triangular prism, ridge along x, base on y = 0, 1 x 1 x 1. Open underneath:
 * the camera never looks up at a roof. */
const createGableGeometry = (): BufferGeometry => {
  const a = [-0.5, 0, 0.5], b = [0.5, 0, 0.5], c = [0.5, 0, -0.5], d = [-0.5, 0, -0.5];
  const e = [-0.5, 1, 0], f = [0.5, 1, 0];
  const triangles = [a, b, f, a, f, e, c, d, e, c, e, f, b, c, f, d, a, e];
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(triangles.flat()), 3));
  geometry.computeVertexNormals();
  return geometry;
};
const UNIT_GABLE = createGableGeometry();

/** Sets a per-vertex "shade" (0..1) that scales the part's colour -- the
 * falloff of the light pools drawn with the halo mesh. */
const withShade = (geometry: BufferGeometry, shadeAt: (x: number, y: number, z: number) => number): BufferGeometry => {
  const position = geometry.getAttribute("position");
  const shade = new Float32Array(position.count);
  for (let i = 0; i < position.count; i += 1) shade[i] = shadeAt(position.getX(i), position.getY(i), position.getZ(i));
  geometry.setAttribute("shade", new BufferAttribute(shade, 1));
  return geometry;
};
// Flat disc of light, bright at the centre and fading to nothing at the rim.
const UNIT_POOL = withShade(new RingGeometry(0.001, 1, 10, 2).rotateX(-Math.PI / 2), (x, _y, z) => (1 - Math.min(1, Math.hypot(x, z))) ** 1.6);
// Banner cloth facing +z, hoisted at x = 0 and flying out to x = 1, cut in
// strips so it can ripple (see applyTownBanner).
const UNIT_CLOTH = new PlaneGeometry(1, 1, 8, 1).translate(0.5, 0, 0);
// Flat strip of light spilling out from a wall at z = 0 to z = 1.
const UNIT_SPILL = withShade(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), (_x, _y, z) => (1 - z) ** 1.5);
const UNIT_OCTAHEDRON = new OctahedronGeometry(1, 0);
const UNIT_ICOSAHEDRON = new IcosahedronGeometry(1, 0);
const UNIT_SMOOTH_BLOB = new IcosahedronGeometry(1, 1);
// Axis along z, so it faces +z like a panel: rotor hubs.
const UNIT_DISC = new CylinderGeometry(1, 1, 1, 12, 1).rotateX(Math.PI / 2);
// Flat rings in the xz plane (brass hoops, halos), keyed by tube/radius ratio.
const ringCache = new Map<number, BufferGeometry>();
const unitRing = (tubeRatio: number): BufferGeometry => {
  let geometry = ringCache.get(tubeRatio);
  if (!geometry) {
    geometry = new TorusGeometry(1, tubeRatio, 3, 16).rotateX(Math.PI / 2);
    ringCache.set(tubeRatio, geometry);
  }
  return geometry;
};


const cylinderCache = new Map<string, BufferGeometry>();
const unitCylinder = (radiusTop: number, radiusBottom: number, segments: number): BufferGeometry => {
  const key = `${radiusTop}:${radiusBottom}:${segments}`;
  let geometry = cylinderCache.get(key);
  if (!geometry) {
    geometry = new CylinderGeometry(radiusTop, radiusBottom, 1, segments, 1).translate(0, 0.5, 0);
    cylinderCache.set(key, geometry);
  }
  return geometry;
};

const domeCache = new Map<number, BufferGeometry>();
const unitDome = (segments: number): BufferGeometry => {
  let geometry = domeCache.get(segments);
  if (!geometry) {
    geometry = new SphereGeometry(1, segments, Math.max(3, Math.round(segments / 2)), 0, Math.PI * 2, 0, Math.PI / 2);
    domeCache.set(segments, geometry);
  }
  return geometry;
};

const colorCache = new Map<TownColor, Color>();
const colorOf = (name: TownColor): Color => {
  let color = colorCache.get(name);
  if (!color) {
    color = new Color(TOWN_COLORS[name]);
    colorCache.set(name, color);
  }
  return color;
};

// Each unit primitive de-indexed (and stripped of uvs) once, not per part.
const nonIndexedCache = new WeakMap<BufferGeometry, BufferGeometry>();
const nonIndexed = (unit: BufferGeometry): BufferGeometry => {
  let geometry = nonIndexedCache.get(unit);
  if (!geometry) {
    geometry = unit.index ? unit.toNonIndexed() : unit.clone();
    geometry.deleteAttribute("uv");
    nonIndexedCache.set(unit, geometry);
  }
  return geometry;
};

/** Small deterministic PRNG so every tier bakes the same town every load. */
export const createTownRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Per-vertex animation, read by the overlay's shaders (client-map-3d-town-overlay/
 * town-animation-shaders.ts). For solid parts: a = (pivot x, y, z, spin speed in
 * rad/s), b = (spin axis x, y, z, flicker phase; TOWN_BEACON_PHASE and up blinks
 * instead). For steam puffs: a = (puff centre x, y, z, cycles/s), b = (drift x,
 * drift z, rise, phase). */
export type TownAnim = {
  readonly a: readonly [number, number, number, number];
  readonly b: readonly [number, number, number, number];
};

export type TownMeshBuilder = {
  /** Box of size w x h x d standing on (x, y, z), turned ry about y. */
  readonly box: (x: number, y: number, z: number, w: number, h: number, d: number, color: TownColor, ry?: number) => void;
  /** Gable roof, ridge along the (turned) x axis. */
  readonly gable: (x: number, y: number, z: number, w: number, h: number, d: number, color: TownColor, ry?: number) => void;
  /** Four-sided hip / mansard / spire roof. */
  readonly pyramid: (x: number, y: number, z: number, w: number, h: number, d: number, color: TownColor, ry?: number) => void;
  readonly cylinder: (x: number, y: number, z: number, radiusTop: number, radiusBottom: number, h: number, color: TownColor, segments?: number, ry?: number) => void;
  readonly cone: (x: number, y: number, z: number, radius: number, h: number, color: TownColor, segments?: number) => void;
  readonly dome: (x: number, y: number, z: number, radius: number, color: TownColor, segments?: number, heightScale?: number) => void;
  /** Low-poly blob (tree crowns, bushes), centred on (x, y, z). */
  readonly blob: (x: number, y: number, z: number, radius: number, color: TownColor, squash?: number) => void;
  readonly gem: (x: number, y: number, z: number, radius: number, height: number, color: TownColor) => void;
  /** Flat quad facing +z (turned ry), centred on (x, y, z) -- windows, doors, clock faces. */
  readonly panel: (x: number, y: number, z: number, w: number, h: number, color: TownColor, ry?: number) => void;
  /** Box centred on (x, y, z), turned rz about its own z axis, then ry about y. */
  readonly tiltedBox: (x: number, y: number, z: number, w: number, h: number, d: number, color: TownColor, ry: number, rz: number) => void;
  /** Disc of the given thickness facing +z (turned ry), centred on (x, y, z). */
  readonly disc: (x: number, y: number, z: number, radius: number, thickness: number, color: TownColor, ry?: number) => void;
  /** Horizontal hoop centred on (x, y, z); `tubeRatio` is its tube radius over its radius. */
  readonly ring: (x: number, y: number, z: number, radius: number, color: TownColor, tubeRatio?: number) => void;
  /** Smooth-ish ellipsoid centred on (x, y, z), long axis along x (turned ry). */
  readonly ellipsoid: (x: number, y: number, z: number, rx: number, ry3: number, rz: number, color: TownColor, ry?: number) => void;
  /** Round pipe from (x0, y0, z0) to (x1, y1, z1). */
  readonly pipe: (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, radius: number, color: TownColor) => void;
  /** Flat pool of light on the ground at (x, y, z), fading out to `radius` (halo mesh). */
  readonly pool: (x: number, y: number, z: number, radius: number, color: TownColor) => void;
  /** Flat strip of light `w` wide spilling `depth` out from a wall at (x, y, z) facing +z (turned ry) (halo mesh). */
  readonly spill: (x: number, y: number, z: number, w: number, depth: number, color: TownColor, ry?: number) => void;
  /** Banner `w` long and `h` deep flying from a pole at (x, y, z) along the (turned) x axis; y is its centre line. */
  readonly cloth: (x: number, y: number, z: number, w: number, h: number, color: TownColor, ry?: number) => void;
  /** Draws everything inside `draw` with the given animation attributes. */
  readonly withAnim: (anim: TownAnim, draw: () => void) => void;
  readonly build: () => BufferGeometry | undefined;
};

export type TownMeshBuilderOptions = {
  /** Bake ambient occlusion into the vertex colours (see townOcclusionAt). */
  readonly occlusion?: boolean;
  /** Up to this share of brightness varied building by building, so stone isn't uniform. */
  readonly weathering?: number;
  /** Brightens by up to this share towards the skyline: glass catching more sky the higher it rises. */
  readonly sheen?: number;
  /** Drop static parts' undersides (see dropUndersides); the mesh must then cast with shadowSide = FrontSide. */
  readonly cullUndersides?: boolean;
};

/** Drops a static part's downward-facing triangles: the map camera always
 * looks down from far above, so it never sees the underside of a box, a
 * cylinder or a cap. three's shadow pass draws a FrontSide material's BACK
 * faces by default -- undersides included -- so a mesh built this way must
 * cast with `shadowSide = FrontSide` (the town overlay's materials do).
 * Turning parts keep every face, since they roll undersides into view. */
const dropUndersides = (part: BufferGeometry): BufferGeometry => {
  const position = part.getAttribute("position");
  const keep: number[] = [];
  for (let i = 0; i + 2 < position.count; i += 3) {
    const ax = position.getX(i + 1) - position.getX(i), ay = position.getY(i + 1) - position.getY(i), az = position.getZ(i + 1) - position.getZ(i);
    const bx = position.getX(i + 2) - position.getX(i), by = position.getY(i + 2) - position.getY(i), bz = position.getZ(i + 2) - position.getZ(i);
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz);
    if (length === 0 || ny / length > -0.99) keep.push(i);
  }
  if (keep.length * 3 === position.count) return part;
  const trimmed = new BufferGeometry();
  for (const [name, attribute] of Object.entries(part.attributes)) {
    const size = attribute.itemSize;
    const array = new Float32Array(keep.length * 3 * size);
    keep.forEach((first, t) => {
      for (let v = 0; v < 3; v += 1) {
        for (let c = 0; c < size; c += 1) array[(t * 3 + v) * size + c] = attribute.getComponent(first + v, c);
      }
    });
    trimmed.setAttribute(name, new BufferAttribute(array, size));
  }
  part.dispose();
  return trimmed;
};

/** Deterministic 0..1 per ground position: every part of one building shares it. */
const weatherAt = (x: number, z: number): number => {
  const h = Math.sin(Math.round(x * 400) * 12.9898 + Math.round(z * 400) * 78.233) * 43758.5453;
  return h - Math.floor(h);
};

export const createTownMeshBuilder = (options: TownMeshBuilderOptions = {}): TownMeshBuilder => {
  const parts: BufferGeometry[] = [];
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();
  const yAxis = new Vector3(0, 1, 0);
  const euler = new Euler(0, 0, 0, "YXZ");
  const direction = new Vector3();
  let anim: TownAnim | undefined;

  const pushColored = (whole: BufferGeometry, color: TownColor): void => {
    const turning = anim !== undefined && anim.a[3] !== 0;
    const part = options.cullUndersides && !turning ? dropUndersides(whole) : whole;
    const tint = colorOf(color);
    const position = part.getAttribute("position");
    const count = position.count;
    const shade = part.getAttribute("shade");
    part.computeBoundingBox();
    const bounds = part.boundingBox!;
    // A part turning about a tilted axis (an upright cog) would carry its baked
    // shading round with it, so only static and upright-turning parts take occlusion.
    const tumbling = turning && Math.abs(anim?.b[1] ?? 1) < 0.999;
    const occluded = options.occlusion === true && !tumbling && bounds.max.y - bounds.min.y >= TOWN_PAVING_THICKNESS;
    const weather = options.weathering
      ? 1 - options.weathering / 2 + options.weathering * weatherAt((bounds.min.x + bounds.max.x) / 2, (bounds.min.z + bounds.max.z) / 2)
      : 1;
    const colors = new Float32Array(count * 3);
    const animA = new Float32Array(count * 4);
    const animB = new Float32Array(count * 4);
    // Static parts still get a flicker phase, staggered part by part.
    const a = anim?.a ?? [0, 0, 0, 0];
    const b = anim?.b ?? [0, 0, 0, (parts.length * 0.618034) % 1];
    for (let i = 0; i < count; i += 1) {
      const y = position.getY(i);
      const sky = options.sheen ? 1 + options.sheen * Math.min(1, Math.max(0, (y - 0.05) / 0.45)) : 1;
      const k = weather * sky * (occluded ? townOcclusionAt(y) : 1) * (shade ? shade.getX(i) : 1);
      colors.set([Math.min(1, tint.r * k), Math.min(1, tint.g * k), Math.min(1, tint.b * k)], i * 3);
      animA.set(a, i * 4);
      animB.set(b, i * 4);
    }
    // Every merged part must carry the same attributes; the shade is baked in now.
    if (shade) part.deleteAttribute("shade");
    part.setAttribute("color", new BufferAttribute(colors, 3));
    part.setAttribute("animA", new BufferAttribute(animA, 4));
    part.setAttribute("animB", new BufferAttribute(animB, 4));
    parts.push(part);
  };

  const push = (
    unit: BufferGeometry,
    color: TownColor,
    x: number, y: number, z: number,
    sx: number, sy: number, sz: number,
    ry: number,
    rz = 0
  ): void => {
    const part = nonIndexed(unit).clone();
    quaternion.setFromEuler(euler.set(0, ry, rz, "YXZ"));
    position.set(x, y, z);
    scale.set(sx, sy, sz);
    part.applyMatrix4(matrix.compose(position, quaternion, scale));
    pushColored(part, color);
  };

  return {
    box: (x, y, z, w, h, d, color, ry = 0) => push(UNIT_BOX, color, x, y, z, w, h, d, ry),
    gable: (x, y, z, w, h, d, color, ry = 0) => push(UNIT_GABLE, color, x, y, z, w, h, d, ry),
    pyramid: (x, y, z, w, h, d, color, ry = 0) => push(UNIT_PYRAMID, color, x, y, z, w, h, d, ry),
    cylinder: (x, y, z, radiusTop, radiusBottom, h, color, segments = 8, ry = 0) =>
      push(unitCylinder(radiusTop, radiusBottom, segments), color, x, y, z, 1, h, 1, ry),
    cone: (x, y, z, radius, h, color, segments = 8) => push(unitCylinder(0, radius, segments), color, x, y, z, 1, h, 1, 0),
    dome: (x, y, z, radius, color, segments = 10, heightScale = 1) =>
      push(unitDome(segments), color, x, y, z, radius, radius * heightScale, radius, 0),
    blob: (x, y, z, radius, color, squash = 0.85) =>
      push(UNIT_ICOSAHEDRON, color, x, y, z, radius, radius * squash, radius, (x * 7.1 + z * 3.3) % Math.PI),
    gem: (x, y, z, radius, height, color) => push(UNIT_OCTAHEDRON, color, x, y, z, radius, height, radius, Math.PI / 4),
    panel: (x, y, z, w, h, color, ry = 0) => push(UNIT_PANEL, color, x, y, z, w, h, 1, ry),
    tiltedBox: (x, y, z, w, h, d, color, ry, rz) => push(UNIT_BOX_CENTRED, color, x, y, z, w, h, d, ry, rz),
    disc: (x, y, z, radius, thickness, color, ry = 0) => push(UNIT_DISC, color, x, y, z, radius, radius, thickness, ry),
    ring: (x, y, z, radius, color, tubeRatio = 0.14) => push(unitRing(tubeRatio), color, x, y, z, radius, radius, radius, 0),
    ellipsoid: (x, y, z, rx, ry3, rz, color, ry = 0) => push(UNIT_SMOOTH_BLOB, color, x, y, z, rx, ry3, rz, ry),
    pipe: (x0, y0, z0, x1, y1, z1, radius, color) => {
      direction.set(x1 - x0, y1 - y0, z1 - z0);
      const length = direction.length();
      if (length <= 0) return;
      const part = nonIndexed(unitCylinder(radius, radius, 6)).clone();
      quaternion.setFromUnitVectors(yAxis, direction.normalize());
      position.set(x0, y0, z0);
      scale.set(1, length, 1);
      part.applyMatrix4(matrix.compose(position, quaternion, scale));
      pushColored(part, color);
    },
    pool: (x, y, z, radius, color) => push(UNIT_POOL, color, x, y, z, radius, 1, radius, 0),
    spill: (x, y, z, w, depth, color, ry = 0) => push(UNIT_SPILL, color, x, y, z, w, 1, depth, ry),
    cloth: (x, y, z, w, h, color, ry = 0) => push(UNIT_CLOTH, color, x, y, z, w, h, 1, ry),
    withAnim: (next, draw) => {
      const previous = anim;
      anim = next;
      try {
        draw();
      } finally {
        anim = previous;
      }
    },
    build: () => {
      if (parts.length === 0) return undefined;
      const merged = mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      parts.length = 0;
      return merged ?? undefined;
    }
  };
};

/** One builder that sends metalwork colours (TOWN_METAL_COLORS) to `metal`,
 * glass (TOWN_GLASS_COLORS) to `glass` (or, without one, to `metal`) and
 * everything else to `matte`, so layouts never have to pick a builder. */
export const createRoutedTownBuilder = (matte: TownMeshBuilder, metal: TownMeshBuilder, glass: TownMeshBuilder = metal): TownMeshBuilder => {
  const to = (color: TownColor): TownMeshBuilder => (TOWN_METAL_COLORS.has(color) ? metal : TOWN_GLASS_COLORS.has(color) ? glass : matte);
  return {
    box: (x, y, z, w, h, d, color, ry) => to(color).box(x, y, z, w, h, d, color, ry),
    gable: (x, y, z, w, h, d, color, ry) => to(color).gable(x, y, z, w, h, d, color, ry),
    pyramid: (x, y, z, w, h, d, color, ry) => to(color).pyramid(x, y, z, w, h, d, color, ry),
    cylinder: (x, y, z, radiusTop, radiusBottom, h, color, segments, ry) =>
      to(color).cylinder(x, y, z, radiusTop, radiusBottom, h, color, segments, ry),
    cone: (x, y, z, radius, h, color, segments) => to(color).cone(x, y, z, radius, h, color, segments),
    dome: (x, y, z, radius, color, segments, heightScale) => to(color).dome(x, y, z, radius, color, segments, heightScale),
    blob: (x, y, z, radius, color, squash) => to(color).blob(x, y, z, radius, color, squash),
    gem: (x, y, z, radius, height, color) => to(color).gem(x, y, z, radius, height, color),
    panel: (x, y, z, w, h, color, ry) => to(color).panel(x, y, z, w, h, color, ry),
    tiltedBox: (x, y, z, w, h, d, color, ry, rz) => to(color).tiltedBox(x, y, z, w, h, d, color, ry, rz),
    disc: (x, y, z, radius, thickness, color, ry) => to(color).disc(x, y, z, radius, thickness, color, ry),
    ring: (x, y, z, radius, color, tubeRatio) => to(color).ring(x, y, z, radius, color, tubeRatio),
    ellipsoid: (x, y, z, rx, ry3, rz, color, ry) => to(color).ellipsoid(x, y, z, rx, ry3, rz, color, ry),
    pipe: (x0, y0, z0, x1, y1, z1, radius, color) => to(color).pipe(x0, y0, z0, x1, y1, z1, radius, color),
    pool: (x, y, z, radius, color) => to(color).pool(x, y, z, radius, color),
    spill: (x, y, z, w, depth, color, ry) => to(color).spill(x, y, z, w, depth, color, ry),
    cloth: (x, y, z, w, h, color, ry) => to(color).cloth(x, y, z, w, h, color, ry),
    withAnim: (anim, draw) =>
      matte.withAnim(anim, () => metal.withAnim(anim, () => (glass === metal ? draw() : glass.withAnim(anim, draw)))),
    build: () => {
      throw new Error("build the matte, metal and glass builders directly");
    }
  };
};
