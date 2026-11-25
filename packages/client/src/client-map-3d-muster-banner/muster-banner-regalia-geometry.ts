// The High-noble standard's regalia: the gilded extras a muster flag carries
// when its owner shows that cosmetic (docs/cosmetics.md). They are added on
// top of the standard banner, which is drawn unchanged underneath:
//
//   - an aureole behind the head of the standard: a full ring of gold rays
//     that turns slowly, inside a studded halo that turns the other way (each
//     its own geometry, spun by muster-banner-regalia.ts), round a gold boss
//     set with a gem in the owner's colour;
//   - a pair of gilded wings spread from the crossbar's cap;
//   - a long swallow-tailed streamer in the owner's colour from each end of
//     the crossbar, edged and banded in gold, that ripples in the wind;
//   - four tall gold posts on the plinth, each topped with a gem in the
//     owner's colour and joined by gold chains, inside a double gold rim.
//
// Cosmetic rule: the regalia stays inside the standard plinth's footprint and
// adds nothing a rival reads state from. The cloth, the soldiers, the siege
// ring and the progress badge are untouched.
import { BufferAttribute, BufferGeometry, ConeGeometry, CylinderGeometry, OctahedronGeometry, SphereGeometry, TorusGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BANNER_CLOTH, MUSTER_CROSSBAR_Y, MUSTER_PLINTH_RADIUS, MUSTER_PLINTH_TOP_Y } from "./muster-banner-geometry.js";

/** Centre of the aureole, just above the crossbar's gabled cap and behind the spear finial. */
export const AUREOLE_Y = MUSTER_CROSSBAR_Y + 0.112;
export const AUREOLE_Z = -0.02;
const RAY_COUNT = 24;
const RAY_BASE = 0.055; // rays start at the boss's rim
const RAY_LONG = 0.138;
const RAY_SHORT = 0.085;
/** The counter-turning halo sits among the rays. */
const HALO_RADIUS = 0.158;
/** How far a streamer hangs outside the cloth's edge. */
export const STREAMER_X = BANNER_CLOTH.width / 2 + 0.052;
export const STREAMER_TOP_Y = MUSTER_CROSSBAR_Y - 0.03;
export const STREAMER_LENGTH = 0.5;
export const STREAMER_WIDTH = 0.05;
export const STREAMER_OUTER_OFFSET = 0.046;
const STREAMER_SEGMENTS = 16;
const POST_RADIUS = MUSTER_PLINTH_RADIUS * 0.76;
const WING_FEATHERS = 6;

/** Highest point of the regalia, for tests: the tip of a long ray pointing up. */
export const REGALIA_TOP_Y = AUREOLE_Y + RAY_BASE + RAY_LONG;
/** Widest point of the regalia from the pole, for tests: the outer gold rim. */
export const REGALIA_MAX_RADIUS = MUSTER_PLINTH_RADIUS * 1.05 + 0.007;

export type MusterBannerRegaliaGeometry = {
  /** Gilded metalwork; one colour, from its material. */
  readonly gold: BufferGeometry;
  /** Parts in the owner's colour, from instanceColor. */
  readonly tinted: BufferGeometry;
  /** The ring of rays, gold, centred on the origin so it can be spun about z. */
  readonly aureole: BufferGeometry;
  /** The studded halo, gold, centred on the origin; spun the other way. */
  readonly halo: BufferGeometry;
  /**
   * Both streamers as flat ribbons at rest. `uv` is (across 0..1, along 0..1
   * from the crossbar down) and `aStreamerSide` is -1 or 1; the material
   * (muster-banner-regalia-materials.ts) ripples them and paints the gold.
   */
  readonly streamers: BufferGeometry;
};

const merge = (parts: BufferGeometry[], label: string): BufferGeometry => {
  const merged = mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)), false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error(`muster banner regalia produced no ${label} geometry`);
  merged.deleteAttribute("uv");
  return merged;
};

const buildAureole = (): BufferGeometry[] => {
  const rays: BufferGeometry[] = [];
  for (let i = 0; i < RAY_COUNT; i += 1) {
    const long = i % 2 === 0;
    const length = long ? RAY_LONG : RAY_SHORT;
    // A flat, four-sided ray pointing up, pushed out from the boss, then swung to its place in the ring.
    const ray = new ConeGeometry(long ? 0.016 : 0.011, length, 4).scale(1, 1, 0.45);
    rays.push(ray.translate(0, RAY_BASE + length / 2, 0).rotateZ((i / RAY_COUNT) * Math.PI * 2));
  }
  rays.push(new TorusGeometry(RAY_BASE + 0.004, 0.005, 5, 24));
  return rays;
};

const buildHalo = (): BufferGeometry[] => {
  const parts: BufferGeometry[] = [new TorusGeometry(HALO_RADIUS, 0.0045, 6, 40)];
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    parts.push(new OctahedronGeometry(i % 3 === 0 ? 0.014 : 0.009).translate(Math.cos(angle) * HALO_RADIUS, Math.sin(angle) * HALO_RADIUS, 0));
  }
  return parts;
};

const buildStreamerRibbons = (): BufferGeometry => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const sides: number[] = [];
  const indices: number[] = [];
  // Per side: a long ribbon by the cloth and a shorter, narrower one outside and behind it.
  for (const [side, outer] of [[-1, 0], [1, 0], [-1, 1], [1, 1]] as const) {
    const base = positions.length / 3;
    const x = side * (STREAMER_X + outer * STREAMER_OUTER_OFFSET);
    const [width, length] = outer ? [STREAMER_WIDTH * 0.7, STREAMER_LENGTH * 0.62] : [STREAMER_WIDTH, STREAMER_LENGTH];
    for (let j = 0; j <= STREAMER_SEGMENTS; j += 1) {
      const along = j / STREAMER_SEGMENTS;
      for (const across of [0, 0.5, 1]) {
        positions.push(x + (across - 0.5) * width, STREAMER_TOP_Y - along * length, outer ? -0.004 : 0.012);
        uvs.push(across, along);
        sides.push(side * (outer ? 1.6 : 1)); // the outer pair flies a little wider and out of step
      }
    }
    for (let j = 0; j < STREAMER_SEGMENTS; j += 1) {
      for (let i = 0; i < 2; i += 1) {
        const a = base + j * 3 + i;
        indices.push(a, a + 1, a + 4, a, a + 4, a + 3);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute("aStreamerSide", new BufferAttribute(new Float32Array(sides), 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const buildBossAndWings = (gold: BufferGeometry[], tinted: BufferGeometry[]): void => {
  gold.push(new CylinderGeometry(0.055, 0.055, 0.016, 24).rotateX(Math.PI / 2).translate(0, AUREOLE_Y, AUREOLE_Z + 0.008));
  gold.push(new TorusGeometry(0.055, 0.008, 8, 24).translate(0, AUREOLE_Y, AUREOLE_Z + 0.014));
  tinted.push(new OctahedronGeometry(0.036, 1).scale(1, 1, 0.5).translate(0, AUREOLE_Y, AUREOLE_Z + 0.02));
  // Wings: feathers fanned from the cap, longest lowest, like a spread eagle's.
  for (const side of [-1, 1]) {
    for (let f = 0; f < WING_FEATHERS; f += 1) {
      const t = f / (WING_FEATHERS - 1);
      const length = 0.215 - 0.07 * t;
      const lift = 0.02 + 0.62 * t; // radians above horizontal: swept out sideways, clear of the rays
      const feather = new ConeGeometry(0.026 - 0.008 * t, length, 4).scale(1, 1, 0.3);
      feather.translate(0, length / 2, 0).rotateZ(-side * (Math.PI / 2 - lift));
      gold.push(feather.translate(side * 0.05, MUSTER_CROSSBAR_Y + 0.026 + 0.011 * f, 0.006 + 0.003 * f));
    }
  }
};

/** The gold knobs the streamers hang from; the ribbons themselves are `streamers`. */
const buildStreamerKnobs = (gold: BufferGeometry[]): void => {
  for (const side of [-1, 1]) {
    gold.push(new SphereGeometry(0.014, 10, 8).translate(side * STREAMER_X, STREAMER_TOP_Y + 0.004, 0.012));
    gold.push(new SphereGeometry(0.011, 10, 8).translate(side * (STREAMER_X + STREAMER_OUTER_OFFSET), STREAMER_TOP_Y + 0.004, -0.004));
    gold.push(new CylinderGeometry(0.005, 0.005, STREAMER_OUTER_OFFSET + 0.02, 6).rotateZ(Math.PI / 2).translate(side * (STREAMER_X + STREAMER_OUTER_OFFSET / 2), STREAMER_TOP_Y + 0.004, 0.004));
  }
};

const buildPlinthGilding = (gold: BufferGeometry[], tinted: BufferGeometry[]): void => {
  gold.push(new TorusGeometry(MUSTER_PLINTH_RADIUS * 1.05, 0.007, 6, 32).rotateX(Math.PI / 2).translate(0, 0.046, 0));
  gold.push(new TorusGeometry(MUSTER_PLINTH_RADIUS * 0.94, 0.004, 5, 32).rotateX(Math.PI / 2).translate(0, 0.054, 0));
  const chainY = MUSTER_PLINTH_TOP_Y + 0.06;
  for (let k = 0; k < 4; k += 1) {
    // A chain of gold beads sagging from each post to the next.
    const from = (k * Math.PI) / 2;
    for (let bead = 1; bead <= 6; bead += 1) {
      const t = bead / 7;
      const angle = from + (t * Math.PI) / 2;
      const sag = 0.04 * Math.sin(t * Math.PI);
      gold.push(new OctahedronGeometry(0.008).translate(Math.cos(angle) * POST_RADIUS, chainY - sag, Math.sin(angle) * POST_RADIUS));
    }
  }
  for (let k = 0; k < 4; k += 1) {
    const angle = (k * Math.PI) / 2;
    const [x, z] = [Math.cos(angle) * POST_RADIUS, Math.sin(angle) * POST_RADIUS];
    const baseY = MUSTER_PLINTH_TOP_Y - 0.05;
    gold.push(new CylinderGeometry(0.02, 0.024, 0.014, 8).translate(x, baseY + 0.007, z));
    gold.push(new CylinderGeometry(0.01, 0.015, 0.1, 8).translate(x, baseY + 0.064, z));
    gold.push(new CylinderGeometry(0.02, 0.011, 0.01, 8).translate(x, baseY + 0.119, z));
    tinted.push(new OctahedronGeometry(0.022).scale(1, 1.5, 1).translate(x, baseY + 0.158, z));
  }
};

let cached: MusterBannerRegaliaGeometry | undefined;

/** Built once per page and shared; the regalia never changes shape. */
export const getMusterBannerRegaliaGeometry = (): MusterBannerRegaliaGeometry => {
  if (cached) return cached;
  const gold: BufferGeometry[] = [];
  const tinted: BufferGeometry[] = [];
  buildBossAndWings(gold, tinted);
  buildStreamerKnobs(gold);
  buildPlinthGilding(gold, tinted);
  cached = {
    gold: merge(gold, "gold"), tinted: merge(tinted, "tinted"), aureole: merge(buildAureole(), "aureole"),
    halo: merge(buildHalo(), "halo"), streamers: buildStreamerRibbons()
  };
  return cached;
};

/**
 * Where the gilding catches the light: local points on the regalia that the
 * sparkles (muster-banner-regalia.ts) twinkle at.
 */
export const REGALIA_SPARKLE_POINTS: ReadonlyArray<readonly [number, number, number]> = [
  [0, AUREOLE_Y + RAY_BASE + RAY_LONG, AUREOLE_Z],
  [-(RAY_BASE + RAY_LONG) * 0.71, AUREOLE_Y + (RAY_BASE + RAY_LONG) * 0.71, AUREOLE_Z],
  [(RAY_BASE + RAY_LONG) * 0.71, AUREOLE_Y + (RAY_BASE + RAY_LONG) * 0.71, AUREOLE_Z],
  [0, AUREOLE_Y, AUREOLE_Z + 0.04],
  [-0.25, MUSTER_CROSSBAR_Y + 0.04, 0.01],
  [0.25, MUSTER_CROSSBAR_Y + 0.04, 0.01],
  [-STREAMER_X, STREAMER_TOP_Y, 0.03],
  [STREAMER_X, STREAMER_TOP_Y, 0.03],
  [POST_RADIUS, MUSTER_PLINTH_TOP_Y + 0.13, 0],
  [-POST_RADIUS, MUSTER_PLINTH_TOP_Y + 0.13, 0],
  [0, MUSTER_PLINTH_TOP_Y + 0.13, POST_RADIUS],
  [0, MUSTER_PLINTH_TOP_Y + 0.13, -POST_RADIUS]
];

/** Local centres of the gems: the boss gem first, then the four post gems. Each gets a glow in the owner's colour. */
export const REGALIA_GEM_POINTS: ReadonlyArray<readonly [number, number, number]> = [
  [0, AUREOLE_Y, AUREOLE_Z + 0.03],
  [POST_RADIUS, MUSTER_PLINTH_TOP_Y + 0.108, 0],
  [-POST_RADIUS, MUSTER_PLINTH_TOP_Y + 0.108, 0],
  [0, MUSTER_PLINTH_TOP_Y + 0.108, POST_RADIUS],
  [0, MUSTER_PLINTH_TOP_Y + 0.108, -POST_RADIUS]
];
