// A Relay Beacon toppled in a capture (see client-capture-aftermath.ts),
// modelled from the standing beacon's own parts (infrastructure-models.ts
// relayHousing, client-map-3d-relay-beacon-overlay.ts): the same foundation
// plate with its lamp posts knocked flat and its trees burnt, the stone
// pedestal still standing under a snapped iron column, the column's upper
// length down across the plate with its brass collars, the receiver cap
// rolled away, the three field projectors torn off their struts with their
// glass shattered, and the octagonal sensing frames bent on the ground.
// Torn aether conduits still sputter, embers smoulder and dark smoke rises.
import { octagonPlate } from "../client-map-3d-town-overlay/town-parts.js";
import { DISTRICT_PORT_RADIUS, DISTRICT_PORT_Y, DISTRICT_RADIUS } from "../client-town-district/district-catalog.js";
import {
  aetherSpark, at3, burntTree, collar, ember, fallenLampPost, lerp3, octagonFrame, pipeBetween, scorch, shards, smokeColumn, wreckRandom, type Vec3, type WreckBuilders
} from "./wreck-kit.js";

/** The beacon's foundation after the fight: plate intact, fittings wrecked. */
export const wreckedFoundation = (t: WreckBuilders, random: () => number): void => {
  octagonPlate(t, DISTRICT_RADIUS, false);
  fallenLampPost(t, -0.235, 0.23, 200, 0.08);
  fallenLampPost(t, 0.235, 0.23, 70, 0.08);
  burntTree(t, -0.26, -0.18, 0.075, random);
  burntTree(t, 0.26, -0.18, 0.07, random);
  for (let i = 0; i < 8; i += 1) {
    const angle = (i * Math.PI) / 4;
    const x = Math.sin(angle) * DISTRICT_PORT_RADIUS;
    const z = Math.cos(angle) * DISTRICT_PORT_RADIUS;
    // Half the service sockets are sheared off; the rest stand dark.
    const height = i % 2 === 0 ? DISTRICT_PORT_Y * (0.3 + random() * 0.3) : DISTRICT_PORT_Y;
    t.body.cylinder(x, 0, z, 0.022, 0.027, height, "iron", 8);
    if (i % 2 === 1) t.body.cylinder(x, height - 0.008, z, 0.028, 0.028, 0.009, "brassDark", 8);
  }
};

const STUMP_TOP = 0.36;
const FALL_DEGREES = 38;

export const buildRelayBeaconWreck = (t: WreckBuilders, variant: number): void => {
  const random = wreckRandom(101 + variant);
  wreckedFoundation(t, random);
  scorch(t, 0.08, 0.06, 0.3, random);
  // Pedestal and the lower column, still standing.
  t.body.cylinder(0, 0, 0, 0.19, 0.25, 0.10, "stoneDark", 16);
  t.body.cylinder(0, 0.10, 0, 0.18, 0.19, 0.025, "brassDark", 16);
  t.body.cylinder(0, 0.125, 0, 0.128, 0.155, STUMP_TOP - 0.125, "ironDark", 16);
  t.body.cylinder(0, 0.15, 0, 0.155, 0.16, 0.022, "brassDark", 16);
  // Service hatch blown open, hanging off one hinge.
  t.body.box(0, 0.145, 0.143, 0.10, 0.17, 0.026, "brassDark");
  t.body.tiltedBox(0.07, 0.11, 0.2, 0.078, 0.145, 0.008, "iron", 0.6, 0.5);
  // Jagged break: torn plating round the top of the stump.
  for (let i = 0; i < 9; i += 1) {
    const degrees = i * 40 + random() * 18;
    const [x, , z] = at3(0.118, degrees, 0);
    const h = 0.04 + random() * 0.1;
    t.body.tiltedBox(x, STUMP_TOP + h / 2 - 0.012, z, 0.045 + random() * 0.03, h, 0.016, "ironDark", Math.PI / 2 - (degrees * Math.PI) / 180, (random() - 0.5) * 0.7);
  }
  t.body.cylinder(0, STUMP_TOP - 0.03, 0, 0.065, 0.065, 0.045, "graphite", 10);
  aetherSpark(t, 0.03, STUMP_TOP + 0.02, -0.02, 0.012, random);
  aetherSpark(t, -0.04, STUMP_TOP - 0.01, 0.03, 0.009, random);
  // The upper column: one length leaning off the stump, a second snapped off across the plate.
  const leanFrom: Vec3 = at3(0.1, FALL_DEGREES, STUMP_TOP - 0.04);
  const leanTo: Vec3 = at3(0.62, FALL_DEGREES, 0.11);
  pipeBetween(t, leanFrom, leanTo, 0.122, "ironDark");
  collar(t, leanFrom, leanTo, 0.45, 0.024, 0.142, "brassDark");
  collar(t, leanFrom, leanTo, 0.92, 0.03, 0.135, "brassDark");
  const secondFrom: Vec3 = at3(0.5, FALL_DEGREES + 62, 0.1);
  const secondTo: Vec3 = at3(0.36, FALL_DEGREES + 128, 0.095);
  pipeBetween(t, secondFrom, secondTo, 0.108, "ironDark");
  collar(t, secondFrom, secondTo, 0.2, 0.022, 0.125, "brassDark");
  shards(t, leanTo[0], leanTo[2], 0.12, 7, 0.04, "ironDark", random, FALL_DEGREES);
  // Receiver cap rolled off on its side, its brass seat beside it.
  const cap: Vec3 = at3(0.44, -42, 0.13);
  pipeBetween(t, cap, [cap[0] + 0.1, 0.13, cap[2] + 0.06], 0.13, "iron");
  pipeBetween(t, [cap[0] - 0.03, 0.135, cap[2] - 0.02], [cap[0] - 0.005, 0.135, cap[2] - 0.005], 0.15, "brass");
  // Field projectors: one strut buckled where it stood, two torn down flat.
  for (let i = 0; i < 3; i += 1) {
    const degrees = i * 120 + 15;
    const foot: Vec3 = at3(0.2, degrees, 0.05);
    if (i === 0) {
      const knee: Vec3 = at3(0.15, degrees, 0.5);
      pipeBetween(t, foot, knee, 0.025, "stoneLight");
      pipeBetween(t, knee, at3(0.47, degrees - 18, 0.03), 0.022, "stoneLight");
    } else {
      pipeBetween(t, at3(0.21, degrees, 0.025), at3(0.62, degrees + 9, 0.022), 0.024, "stoneLight");
    }
    // The projector housing, face down in the dirt, its glass cracked off beside it.
    const housing: Vec3 = at3(0.42 + random() * 0.08, degrees + 32, 0.025);
    const yaw = random() * Math.PI;
    t.body.tiltedBox(housing[0], housing[1], housing[2], 0.30, 0.04, 0.105, "iron", yaw, (random() - 0.5) * 0.2);
    t.body.tiltedBox(housing[0] + 0.02, 0.05, housing[2] + 0.015, 0.13, 0.008, 0.07, "glassLight", yaw + 0.2, 0.25);
    t.body.tiltedBox(housing[0] - 0.07, 0.03, housing[2] + 0.03, 0.09, 0.008, 0.06, "glassLight", yaw - 0.4, -0.3);
    for (let k = 0; k < 3; k += 1) t.body.tiltedBox(housing[0] + 0.05 * (k - 1), 0.052, housing[2], 0.075, 0.006, 0.007, "brassDark", yaw + k * 0.3, 0.4);
    shards(t, housing[0], housing[2], 0.09, 5, 0.022, "glassLight", random);
  }
  // Sensing frames: the largest bent and leaning on the fallen column, the others down on the plate.
  octagonFrame(t, lerp3(leanFrom, leanTo, 0.65), 0.16, 1.05, FALL_DEGREES + 95, 0.008, "brass", 3);
  octagonFrame(t, at3(0.28, 200, 0.012), 0.12, 0.08, 210, 0.008, "brassDark");
  octagonFrame(t, at3(0.24, 285, 0.03), 0.08, 0.5, 300, 0.007, "brass", 6);
  t.body.cylinder(...at3(0.18, 250, 0), 0.03, 0.03, 0.03, "brassDark", 8);
  // Severed cabling drooping from the break to the plate.
  for (const degrees of [150, 260]) {
    const top: Vec3 = at3(0.08, degrees, STUMP_TOP - 0.02);
    const sag: Vec3 = at3(0.2, degrees + 10, 0.12);
    pipeBetween(t, top, sag, 0.006, "iron");
    pipeBetween(t, sag, at3(0.32, degrees + 22, 0.004), 0.006, "iron");
  }
  for (let i = 0; i < 7; i += 1) {
    const [x, , z] = at3(0.12 + random() * 0.4, random() * 360, 0);
    ember(t, x, 0.012, z, 0.007 + random() * 0.006, random, i < 3);
  }
  smokeColumn(t, 0, STUMP_TOP + 0.04, 0, 6, 0.9, random, 0.05);
  smokeColumn(t, leanTo[0], 0.14, leanTo[2], 4, 0.55, random, 0.035);
};
