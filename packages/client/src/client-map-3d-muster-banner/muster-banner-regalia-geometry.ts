// The High-noble standard's regalia: the gilded extras a muster flag carries
// when its owner shows that cosmetic (docs/cosmetics.md). They are added on
// top of the standard banner, which is drawn unchanged underneath:
//
//   - a sunburst behind the finial: a fan of gold rays round a gold boss set
//     with a gem in the owner's colour;
//   - a streamer in the owner's colour from each end of the crossbar, weighted
//     with a gold drop;
//   - four gold posts on the plinth, each topped with a gem in the owner's
//     colour, inside a gold rim round the slab.
//
// Cosmetic rule: the regalia stays inside the standard plinth's footprint and
// adds nothing a rival reads state from. The cloth, the soldiers, the siege
// ring and the progress badge are untouched.
import { BufferGeometry, ConeGeometry, CylinderGeometry, OctahedronGeometry, SphereGeometry, TorusGeometry, BoxGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BANNER_CLOTH, MUSTER_CROSSBAR_Y, MUSTER_PLINTH_RADIUS, MUSTER_PLINTH_TOP_Y } from "./muster-banner-geometry.js";

/** Centre of the sunburst, just above the crossbar's gabled cap and behind the spear finial. */
const SUN_Y = MUSTER_CROSSBAR_Y + 0.085;
const SUN_Z = -0.012;
const RAY_COUNT = 13;
const RAY_BASE = 0.044; // rays start at the boss's rim
const RAY_LONG = 0.125;
const RAY_SHORT = 0.085;
const RAY_SPREAD = (Math.PI * 5) / 6; // the fan opens 150 degrees, upwards
/** How far a streamer hangs outside the cloth's edge. */
const STREAMER_X = BANNER_CLOTH.width / 2 + 0.05;
const STREAMER_LENGTH = 0.4;
const POST_RADIUS = MUSTER_PLINTH_RADIUS * 0.76;

/** Highest point of the regalia, for tests: the tip of the longest ray. */
export const REGALIA_TOP_Y = SUN_Y + RAY_BASE + RAY_LONG;
/** Widest point of the regalia from the pole, for tests: the gold rim. */
export const REGALIA_MAX_RADIUS = MUSTER_PLINTH_RADIUS * 1.05 + 0.007;

export type MusterBannerRegaliaGeometry = {
  /** Gilded metalwork; one colour, from its material. */
  readonly gold: BufferGeometry;
  /** Parts in the owner's colour, from instanceColor. */
  readonly tinted: BufferGeometry;
};

const merge = (parts: BufferGeometry[], label: string): BufferGeometry => {
  const merged = mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)), false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error(`muster banner regalia produced no ${label} geometry`);
  merged.deleteAttribute("uv");
  return merged;
};

const buildSunburst = (gold: BufferGeometry[], tinted: BufferGeometry[]): void => {
  for (let i = 0; i < RAY_COUNT; i += 1) {
    const angle = -RAY_SPREAD / 2 + (RAY_SPREAD * i) / (RAY_COUNT - 1); // 0 = straight up
    const long = i % 2 === 0;
    const length = long ? RAY_LONG : RAY_SHORT;
    // A flat, four-sided ray pointing up, pushed out from the boss, then swung to its angle.
    const ray = new ConeGeometry(long ? 0.017 : 0.012, length, 4).scale(1, 1, 0.45);
    ray.translate(0, RAY_BASE + length / 2, 0).rotateZ(-angle).translate(0, SUN_Y, SUN_Z);
    gold.push(ray);
  }
  gold.push(new CylinderGeometry(0.05, 0.05, 0.014, 20).rotateX(Math.PI / 2).translate(0, SUN_Y, SUN_Z));
  gold.push(new TorusGeometry(0.05, 0.007, 6, 20).translate(0, SUN_Y, SUN_Z + 0.005));
  tinted.push(new SphereGeometry(0.028, 12, 8).scale(1, 1, 0.55).translate(0, SUN_Y, SUN_Z + 0.01));
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
    gold.push(new SphereGeometry(0.012, 8, 6).translate(side * STREAMER_X, top + 0.004, 0.012));
  }
};

const buildPlinthGilding = (gold: BufferGeometry[], tinted: BufferGeometry[]): void => {
  gold.push(new TorusGeometry(MUSTER_PLINTH_RADIUS * 1.05, 0.007, 6, 32).rotateX(Math.PI / 2).translate(0, 0.046, 0));
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
  buildSunburst(gold, tinted);
  buildStreamers(gold, tinted);
  buildPlinthGilding(gold, tinted);
  cached = { gold: merge(gold, "gold"), tinted: merge(tinted, "tinted") };
  return cached;
};
