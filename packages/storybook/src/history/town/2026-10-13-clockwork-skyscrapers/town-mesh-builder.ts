// History snapshot: packages/client/src/client-map-3d-town-overlay/town-mesh-builder.ts at commit 2e4f2f72 (2026-10-13).
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
  plate: "#5e6064",
  plateDark: "#47494d",
  window: "#2c3038",
  water: "#4f8fae",
  brass: "#c9a05a",
  brassDark: "#8b6c3d",
  iron: "#3a3e46",
  ironDark: "#25282e",
  foliage: "#5f9a3c",
  foliageLight: "#86b34a",
  trunk: "#6b4a2e",
  // Glow-only colours (drawn unlit by the overlay's glow mesh).
  lamp: "#ffd58a",
  aether: "#9ff4ff"
} as const;

export type TownColor = keyof typeof TOWN_COLORS;

/** Metalwork: drawn with the metallic material, the way the AFC renders its iron and brass. */
export const TOWN_METAL_COLORS: ReadonlySet<TownColor> = new Set<TownColor>(["brass", "brassDark", "iron", "ironDark"]);

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
  readonly build: () => BufferGeometry | undefined;
};

export const createTownMeshBuilder = (): TownMeshBuilder => {
  const parts: BufferGeometry[] = [];
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();
  const yAxis = new Vector3(0, 1, 0);
  const euler = new Euler(0, 0, 0, "YXZ");
  const direction = new Vector3();

  const pushColored = (part: BufferGeometry, color: TownColor): void => {
    const tint = colorOf(color);
    const count = part.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    }
    part.setAttribute("color", new BufferAttribute(colors, 3));
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
    const part = (unit.index ? unit.toNonIndexed() : unit.clone());
    part.deleteAttribute("uv");
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
      const part = unitCylinder(radius, radius, 6).toNonIndexed();
      part.deleteAttribute("uv");
      quaternion.setFromUnitVectors(yAxis, direction.normalize());
      position.set(x0, y0, z0);
      scale.set(1, length, 1);
      part.applyMatrix4(matrix.compose(position, quaternion, scale));
      pushColored(part, color);
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

/** One builder that sends metalwork colours (TOWN_METAL_COLORS) to `metal` and
 * everything else to `matte`, so layouts never have to pick a builder. */
export const createRoutedTownBuilder = (matte: TownMeshBuilder, metal: TownMeshBuilder): TownMeshBuilder => {
  const to = (color: TownColor): TownMeshBuilder => (TOWN_METAL_COLORS.has(color) ? metal : matte);
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
    build: () => {
      throw new Error("build the matte and metal builders directly");
    }
  };
};
