// The High-noble standard's regalia: the gilded extras a muster flag carries
// when its owner shows that cosmetic (docs/cosmetics.md). They are added on
// top of the standard banner, which is drawn unchanged underneath:
//
//   - an aureole behind the head of the standard: a full ring of gold rays
//     that turns slowly (its own geometry, spun by the overlay), round a gold
//     boss set with a gem in the owner's colour;
//   - a pair of gilded wings spread from the crossbar's cap;
//   - a streamer in the owner's colour from each end of the crossbar, banded
//     and tasselled in gold;
//   - four gold posts on the plinth, each topped with a gem in the owner's
//     colour and joined by gold chains, inside a double gold rim.
//
// Cosmetic rule: the regalia stays inside the standard plinth's footprint and
// adds nothing a rival reads state from. The cloth, the soldiers, the siege
// ring and the progress badge are untouched.
import { BufferGeometry, ConeGeometry, CylinderGeometry, OctahedronGeometry, SphereGeometry, TorusGeometry, BoxGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BANNER_CLOTH, MUSTER_CROSSBAR_Y, MUSTER_PLINTH_RADIUS, MUSTER_PLINTH_TOP_Y } from "./muster-banner-geometry.js";

/** Centre of the aureole, just above the crossbar's gabled cap and behind the spear finial. */
export const AUREOLE_Y = MUSTER_CROSSBAR_Y + 0.085;
export const AUREOLE_Z = -0.02;
const RAY_COUNT = 24;
const RAY_BASE = 0.05; // rays start at the boss's rim
const RAY_LONG = 0.128;
const RAY_SHORT = 0.08;
/** How far a streamer hangs outside the cloth's edge. */
const STREAMER_X = BANNER_CLOTH.width / 2 + 0.05;
const STREAMER_LENGTH = 0.4;
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
  /** The ring of rays, gold, centred on the origin so the overlay can spin it about z. */
  readonly aureole: BufferGeometry;
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

const buildBossAndWings = (gold: BufferGeometry[], tinted: BufferGeometry[]): void => {
  gold.push(new CylinderGeometry(0.05, 0.05, 0.014, 20).rotateX(Math.PI / 2).translate(0, AUREOLE_Y, AUREOLE_Z + 0.008));
  gold.push(new TorusGeometry(0.05, 0.007, 6, 20).translate(0, AUREOLE_Y, AUREOLE_Z + 0.014));
  tinted.push(new SphereGeometry(0.028, 12, 8).scale(1, 1, 0.55).translate(0, AUREOLE_Y, AUREOLE_Z + 0.02));
  // Wings: feathers fanned from the cap, longest lowest, like a spread eagle's.
  for (const side of [-1, 1]) {
    for (let f = 0; f < WING_FEATHERS; f += 1) {
      const t = f / (WING_FEATHERS - 1);
      const length = 0.2 - 0.07 * t;
      const lift = 0.02 + 0.62 * t; // radians above horizontal: swept out sideways, clear of the rays
      const feather = new ConeGeometry(0.026 - 0.008 * t, length, 4).scale(1, 1, 0.3);
      feather.translate(0, length / 2, 0).rotateZ(-side * (Math.PI / 2 - lift));
      gold.push(feather.translate(side * 0.05, MUSTER_CROSSBAR_Y + 0.026 + 0.011 * f, 0.006 + 0.003 * f));
    }
  }
};

const buildStreamers = (gold: BufferGeometry[], tinted: BufferGeometry[]): void => {
  for (const side of [-1, 1]) {
    const top = MUSTER_CROSSBAR_Y - 0.03;
    // Hangs a touch outwards, like a ribbon lifted by the same breeze as the cloth.
    const lean = side * 0.07;
    const ribbon = new BoxGeometry(0.04, STREAMER_LENGTH, 0.004).translate(0, -STREAMER_LENGTH / 2, 0);
    ribbon.rotateZ(lean).translate(side * STREAMER_X, top, 0.012);
    tinted.push(ribbon);
    // Two gold bands sewn across it.
    for (const along of [0.12, 0.3]) {
      const band = new BoxGeometry(0.044, 0.012, 0.006).translate(0, -along, 0);
      band.rotateZ(lean).translate(side * STREAMER_X, top, 0.012);
      gold.push(band);
    }
    const dropX = side * STREAMER_X + Math.sin(lean) * STREAMER_LENGTH;
    const dropY = top - Math.cos(lean) * STREAMER_LENGTH;
    gold.push(new ConeGeometry(0.02, 0.05, 4).rotateX(Math.PI).scale(1, 1, 0.4).translate(dropX, dropY - 0.02, 0.012));
    gold.push(new SphereGeometry(0.011, 8, 6).translate(dropX, dropY - 0.052, 0.012));
    tinted.push(new ConeGeometry(0.012, 0.04, 6).translate(dropX, dropY - 0.08, 0.012));
    gold.push(new SphereGeometry(0.012, 8, 6).translate(side * STREAMER_X, top + 0.004, 0.012));
  }
};

const buildPlinthGilding = (gold: BufferGeometry[], tinted: BufferGeometry[]): void => {
  gold.push(new TorusGeometry(MUSTER_PLINTH_RADIUS * 1.05, 0.007, 6, 32).rotateX(Math.PI / 2).translate(0, 0.046, 0));
  gold.push(new TorusGeometry(MUSTER_PLINTH_RADIUS * 0.94, 0.004, 5, 32).rotateX(Math.PI / 2).translate(0, 0.054, 0));
  const chainY = MUSTER_PLINTH_TOP_Y + 0.022;
  for (let k = 0; k < 4; k += 1) {
    // A chain of gold beads sagging from each post to the next.
    const from = (k * Math.PI) / 2;
    for (let bead = 1; bead <= 6; bead += 1) {
      const t = bead / 7;
      const angle = from + (t * Math.PI) / 2;
      const sag = 0.028 * Math.sin(t * Math.PI);
      gold.push(new OctahedronGeometry(0.008).translate(Math.cos(angle) * POST_RADIUS, chainY - sag, Math.sin(angle) * POST_RADIUS));
    }
  }
  for (let k = 0; k < 4; k += 1) {
    const angle = (k * Math.PI) / 2;
    const [x, z] = [Math.cos(angle) * POST_RADIUS, Math.sin(angle) * POST_RADIUS];
    const baseY = MUSTER_PLINTH_TOP_Y - 0.05;
    gold.push(new CylinderGeometry(0.011, 0.016, 0.075, 8).translate(x, baseY + 0.0375, z));
    gold.push(new CylinderGeometry(0.018, 0.012, 0.008, 8).translate(x, baseY + 0.079, z));
    tinted.push(new OctahedronGeometry(0.019).scale(1, 1.25, 1).translate(x, baseY + 0.106, z));
  }
};

let cached: MusterBannerRegaliaGeometry | undefined;

/** Built once per page and shared; the regalia never changes shape. */
export const getMusterBannerRegaliaGeometry = (): MusterBannerRegaliaGeometry => {
  if (cached) return cached;
  const gold: BufferGeometry[] = [];
  const tinted: BufferGeometry[] = [];
  buildBossAndWings(gold, tinted);
  buildStreamers(gold, tinted);
  buildPlinthGilding(gold, tinted);
  cached = { gold: merge(gold, "gold"), tinted: merge(tinted, "tinted"), aureole: merge(buildAureole(), "aureole") };
  return cached;
};
