// Siege engines razed in a capture (see client-capture-aftermath.ts), built
// from the standing machines' own parts and proportions:
//   - SIEGE_BATTERY (client-map-3d-siege-machine-overlay.ts): the undercarriage
//     still on its feet but its struts snapped, the armoured hull blown off and
//     lying on its side, the siege cannon thrown clear with its brass bands and
//     muzzle brake, the engine stacks and targeting head scattered, the head's
//     lens cracked and still flickering.
//   - SIEGE_TOWER / DREAD_TOWER (client-map-3d-siege-tower-pieces.ts): the
//     base block with two legs snapped short and two down across the tile,
//     braces strewn about, the platform crashed onto the heap and the great
//     aether lens shattered in its fallen gimbal rings.
import { aetherSpark, at3, collar, ember, octagonFrame, pipeBetween, scorch, shards, smokeColumn, wreckRandom, type Vec3, type WreckBuilders } from "./wreck-kit.js";

export type SiegeWreckVariant = "SIEGE_BATTERY" | "SIEGE_TOWER" | "DREAD_TOWER";

const embers = (t: WreckBuilders, count: number, spread: number, random: () => number): void => {
  for (let i = 0; i < count; i += 1) {
    const [x, , z] = at3(0.05 + random() * spread, random() * 360, 0);
    ember(t, x, 0.01, z, 0.007 + random() * 0.007, random, i < 3);
  }
};

const siegeBatteryWreck = (t: WreckBuilders, random: () => number): void => {
  scorch(t, 0, 0.02, 0.4, random);
  // Undercarriage, slewed and sagging on two broken feet.
  t.body.tiltedBox(0, 0.075, -0.03, 0.72, 0.1, 0.78, "ironDark", 0.12, 0.06);
  t.body.tiltedBox(-0.33, 0.07, -0.03, 0.05, 0.1, 0.74, "graphite", 0.12, 0.06);
  for (const [x, z, standing] of [[-0.335, 0.35, true], [0.335, -0.35, true], [0.42, 0.3, false], [-0.4, -0.42, false]] as const) {
    if (standing) t.body.cylinder(x, 0, z, 0.045, 0.06, 0.06, "ironDark", 8);
    else pipeBetween(t, [x, 0.04, z], [x + 0.05, 0.035, z + 0.04], 0.05, "ironDark");
  }
  // Stabiliser struts: one still braced, the rest snapped and lying.
  pipeBetween(t, [-0.3, 0.12, 0.3], [-0.335, 0.05, 0.35], 0.028, "brass");
  pipeBetween(t, [0.29, 0.13, -0.3], [0.2, 0.2, -0.36], 0.028, "brassDark");
  pipeBetween(t, [0.36, 0.02, 0.16], [0.47, 0.02, 0.0], 0.026, "brass");
  // Armoured hull torn off the chassis and lying on its side.
  const hullYaw = 0.5;
  t.body.tiltedBox(-0.12, 0.2, 0.08, 0.56, 0.22, 0.6, "ironDark", hullYaw, 1.32);
  t.body.tiltedBox(-0.02, 0.2, 0.14, 0.5, 0.1, 0.42, "iron", hullYaw, 1.32);
  t.body.tiltedBox(-0.24, 0.33, 0.0, 0.54, 0.04, 0.05, "brass", hullYaw, 1.32);
  t.body.tiltedBox(0.1, 0.06, -0.2, 0.52, 0.03, 0.28, "iron", -0.4, 0.15);
  // The siege cannon, thrown clear: barrel, brass bands, muzzle brake, breech block.
  const breech: Vec3 = [0.06, 0.07, 0.26];
  const muzzle: Vec3 = [0.44, 0.06, 0.02];
  pipeBetween(t, breech, muzzle, 0.056, "iron");
  collar(t, breech, muzzle, 0.25, 0.03, 0.066, "brass");
  collar(t, breech, muzzle, 0.62, 0.03, 0.066, "brass");
  collar(t, breech, muzzle, 0.97, 0.05, 0.07, "ironDark");
  t.body.tiltedBox(0.0, 0.06, 0.3, 0.16, 0.12, 0.3, "ironDark", 0.95, 0.25);
  pipeBetween(t, [0.08, 0.02, 0.32], [0.3, 0.015, 0.4], 0.013, "iron");
  // Engine stacks and the rear deck's targeting head knocked about.
  pipeBetween(t, [-0.3, 0.035, -0.28], [-0.22, 0.035, -0.36], 0.032, "iron");
  t.body.ring(-0.24, 0.006, -0.34, 0.042, "brass");
  pipeBetween(t, [0.22, 0.04, 0.33], [0.28, 0.06, 0.36], 0.045, "brass");
  t.body.dome(0.3, 0.0, 0.42, 0.05, "brassDark", 10, 0.5);
  t.body.gem(0.28, 0.03, 0.4, 0.017, 0.02, "glassLight");
  aetherSpark(t, 0.28, 0.035, 0.4, 0.012, random);
  shards(t, 0.0, 0.0, 0.42, 14, 0.035, "iron", random);
  shards(t, 0.1, -0.1, 0.35, 8, 0.022, "brassDark", random);
  embers(t, 8, 0.4, random);
  smokeColumn(t, -0.1, 0.3, 0.1, 6, 0.85, random, 0.05);
  smokeColumn(t, 0.25, 0.1, -0.15, 4, 0.5, random, 0.035);
};

const siegeTowerWreck = (t: WreckBuilders, random: () => number, dread: boolean): void => {
  const s = dread ? 1.18 : 1;
  const legW = (dread ? 0.13 : 0.09) * 0.85;
  scorch(t, 0, 0, 0.44, random);
  // The base, cracked, with the stubs of two legs still standing at its corners.
  t.body.cylinder(0, 0, 0, 0.3 * s, 0.34 * s, 0.09, "ironDark", 8, 0.3);
  t.body.ring(0, 0.09, 0, 0.29 * s, "brassDark", 0.05);
  for (const [degrees, height] of [[45, 0.46], [225, 0.3]] as const) {
    const [x, , z] = at3(0.24 * s, degrees, 0);
    t.body.box(x, 0.09, z, legW, height * s, legW, "iron", 0.3);
    t.body.tiltedBox(x, 0.09 + height * s, z, legW * 1.2, 0.03, legW * 0.6, "iron", 0.3 + random(), 0.6);
    shards(t, x, z, 0.07, 3, 0.03, "iron", random);
  }
  // The two legs that went over, lying out across the tile with their braces still riveted on.
  for (const [degrees, length] of [[140, 0.62], [320, 0.56]] as const) {
    const from = at3(0.2 * s, degrees - 30, legW / 2);
    const to = at3((0.2 + length) * s * 0.78, degrees, legW / 2);
    t.body.pipe(from[0], from[1], from[2], to[0], to[1], to[2], legW * 0.62, "iron", 4);
    for (const f of [0.35, 0.7]) {
      const p = [from[0] + (to[0] - from[0]) * f, 0.02, from[2] + (to[2] - from[2]) * f] as const;
      t.body.tiltedBox(p[0], p[1], p[2], 0.2 * s, 0.018, 0.022, "brassDark", random() * Math.PI, 0.1);
    }
  }
  // The platform, crashed down edge-first onto the standing stub.
  t.body.tiltedBox(...at3(0.16, 20, 0.17 * s), 0.34 * s, 0.03, 0.3 * s, "ironDark", 0.8, 0.62);
  // Gimbal rings down round the great lens, which lies shattered in them, thrown clear of the heap.
  const lens: Vec3 = [-0.25, 0, 0.24];
  t.body.ring(lens[0], 0.012, lens[2], 0.2 * s, "brass", 0.07);
  octagonFrameRing(t, [lens[0], 0.08, lens[2]], 0.16 * s);
  t.body.dome(lens[0], -0.03, lens[2], 0.13 * s, "glassLight", 18, 0.55);
  shards(t, lens[0], lens[2], 0.22, 14, 0.03, "glassLight", random);
  if (dread) {
    // The Dread Tower's pale pylon, broken in two across the heap.
    pipeBetween(t, [0.05, 0.1, -0.05], [0.42, 0.08, -0.26], 0.09, "stoneLight");
    pipeBetween(t, [-0.22, 0.07, -0.22], [-0.44, 0.06, 0.06], 0.08, "stoneLight");
  }
  aetherSpark(t, lens[0], 0.06, lens[2], dread ? 0.022 : 0.016, random);
  aetherSpark(t, 0.02, 0.05, 0.2, 0.01, random);
  embers(t, 9, 0.42, random);
  smokeColumn(t, 0.1, 0.3 * s, 0.05, 6, 1.0, random, 0.055);
  smokeColumn(t, lens[0], 0.08, lens[2], 4, 0.6, random, 0.04);
};

/** The lens's inner gimbal ring, leaning in the wreck. */
const octagonFrameRing = (t: WreckBuilders, centre: Vec3, radius: number): void => octagonFrame(t, centre, radius, 1.15, 25, 0.009, "brassDark", 5);

export const buildSiegeWreck = (t: WreckBuilders, variant: SiegeWreckVariant, seed: number): void => {
  const random = wreckRandom(211 + seed);
  if (variant === "SIEGE_BATTERY") siegeBatteryWreck(t, random);
  else siegeTowerWreck(t, random, variant === "DREAD_TOWER");
};
