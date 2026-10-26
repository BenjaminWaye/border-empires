import { octagonPlate, type TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { crate, windowStrip } from "../client-town-district/support-model-core.js";

export const INFRASTRUCTURE_MODEL_KINDS = ["MINE", "CRYSTAL_MINE", "HARBOR_EXCHANGE", "RELAY_HOUSING", "AETHER_HOUSING", "INFRASTRUCTURE_SLAB"] as const;
export type InfrastructureModelKind = typeof INFRASTRUCTURE_MODEL_KINDS[number];
export const isInfrastructureModel = (kind: string | undefined): kind is InfrastructureModelKind =>
  INFRASTRUCTURE_MODEL_KINDS.some(value => value === kind);

const mine = (t: TownBuilders, crystal: boolean): void => {
  // A recessed extraction mouth sits inside a mechanised gantry, not a timber adit.
  t.body.cylinder(-0.055, 0, -0.03, 0.18, 0.20, 0.022, "ironDark", 24);
  t.body.ring(-0.055, 0.025, -0.03, 0.165, "brassDark", 0.09);
  t.body.cylinder(-0.055, 0.026, -0.03, 0.10, 0.13, 0.065, "iron", 12);
  for (const x of [-0.205, 0.095]) {
    t.body.box(x, 0.01, -0.03, 0.06, 0.32, 0.07, "ironDark");
    t.body.box(x, 0.045, 0.009, 0.032, 0.24, 0.008, "stoneLight");
    t.glow.box(x, 0.07, 0.015, 0.006, 0.19, 0.004, "aether");
    t.body.pipe(x, 0.04, -0.19, x, 0.28, -0.03, 0.018, "brassDark");
  }
  t.body.box(-0.055, 0.32, -0.03, 0.39, 0.055, 0.115, "iron");
  t.body.box(-0.055, 0.375, -0.03, 0.16, 0.03, 0.10, "brassDark");
  t.body.pipe(-0.055, 0.08, -0.03, -0.055, 0.32, -0.03, 0.034, "brass");
  for (const y of [0.11, 0.15, 0.19]) t.body.ring(-0.055, y, -0.03, 0.045, "iron", 0.16);
  // Enclosed separation plant and visible material load identify the resource.
  t.body.box(0.215, 0.01, -0.025, 0.095, 0.17, 0.20, "stoneDark");
  t.body.box(0.215, 0.18, -0.025, 0.115, 0.018, 0.22, "brassDark");
  windowStrip(t, 0.215, 0.09, 0.08, 1);
  t.body.box(-0.015, 0.025, 0.20, 0.21, 0.055, 0.13, "ironDark");
  for (const x of [-0.128, 0.098]) t.body.box(x, 0.035, 0.17, 0.012, 0.006, 0.20, "brass");
  for (const [x, z] of [[-0.075, 0.19], [-0.005, 0.22], [0.055, 0.18]] as const) {
    if (crystal) t.body.gem(x, 0.11, z, 0.026, 0.065, "glassLight");
    else t.body.box(x, 0.08, z, 0.047, 0.023, 0.038, "plate", 0.18);
  }
  t.body.pipe(0.095, 0.13, -0.03, 0.17, 0.13, -0.03, 0.018, "iron");
};
const harbor = (t: TownBuilders): void => {
  // Quayside customs hall: stepped roofs, bonded freight and a working crane.
  t.body.box(-0.09, 0.01, -0.11, 0.29, 0.19, 0.22, "stoneDark");
  t.body.box(-0.09, 0.20, -0.11, 0.315, 0.018, 0.245, "brassDark");
  t.body.gable(-0.09, 0.218, -0.11, 0.33, 0.07, 0.25, "iron");
  for (const x of [-0.205, -0.09, 0.025]) {
    t.body.box(x, 0.01, 0.008, 0.018, 0.20, 0.024, "stoneLight");
    t.body.pipe(x, 0.222, -0.238, x, 0.292, -0.11, 0.004, "brass");
    t.body.pipe(x, 0.292, -0.11, x, 0.222, 0.018, 0.004, "brass");
  }
  for (const x of [-0.15, -0.03]) {
    t.body.box(x, 0.025, 0.012, 0.07, 0.11, 0.014, "ironDark");
    t.glow.box(x, 0.132, 0.021, 0.065, 0.007, 0.004, "lampWarm");
  }
  windowStrip(t, -0.09, 0.16, 0.025, 3);
  // Customs watch drum and enclosed gantry footing distinguish it from a factory.
  t.body.cylinder(0.205, 0.01, -0.15, 0.055, 0.068, 0.28, "stoneDark", 12);
  t.body.cylinder(0.205, 0.29, -0.15, 0.072, 0.072, 0.016, "brass", 12);
  t.body.dome(0.205, 0.306, -0.15, 0.065, "iron", 16, 0.45);
  t.body.cylinder(0.19, 0.01, 0.12, 0.052, 0.064, 0.055, "iron", 12);
  t.body.pipe(0.19, 0.06, 0.12, 0.19, 0.34, 0.12, 0.022, "brassDark");
  t.body.box(0.12, 0.33, 0.12, 0.29, 0.028, 0.04, "iron");
  t.body.pipe(0.19, 0.26, 0.12, -0.01, 0.345, 0.12, 0.012, "brass");
  t.body.pipe(-0.01, 0.33, 0.12, -0.01, 0.13, 0.12, 0.004, "iron");
  t.body.box(-0.01, 0.11, 0.12, 0.08, 0.018, 0.045, "brassDark");
  for (const x of [-0.21, -0.14, 0.14, 0.22]) crate(t, x, 0.22);
  for (const x of [-0.27, 0, 0.27]) {
    t.body.cylinder(x, 0.005, 0.30, 0.014, 0.022, 0.04, "iron", 8);
    t.body.pipe(x - 0.023, 0.04, 0.30, x + 0.023, 0.04, 0.30, 0.007, "brassDark");
  }
};
const relayHousing = (t: TownBuilders): void => {
  // Directional optical mast; its moving mirror head remains on the native
  // beacon animation path above this structural housing.
  t.body.cylinder(0, 0, 0, 0.20, 0.24, 0.09, "stoneDark", 12);
  t.body.cylinder(0, 0.09, 0, 0.18, 0.20, 0.018, "brassDark", 12);
  t.body.cylinder(0, 0.108, 0, 0.085, 0.15, 1.15, "ironDark", 12);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, x = Math.cos(a), z = Math.sin(a);
    t.body.pipe(x * 0.21, 0.02, z * 0.21, x * 0.11, 0.62, z * 0.11, 0.025, "stoneLight");
    t.body.pipe(x * 0.11, 0.62, z * 0.11, x * 0.07, 1.24, z * 0.07, 0.016, "brassDark");
    t.glow.pipe(x * 0.137, 0.25, z * 0.137, x * 0.09, 1.1, z * 0.09, 0.006, "aether");
  }
  for (const y of [0.36, 0.75, 1.16]) t.body.cylinder(0, y, 0, 0.13, 0.14, 0.025, "brassDark", 16);
  t.body.cylinder(0, 1.26, 0, 0.20, 0.14, 0.04, "iron", 16);
  t.body.cylinder(0, 1.30, 0, 0.19, 0.20, 0.025, "brassDark", 16);
  t.body.cylinder(0, 1.325, 0, 0.17, 0.17, 0.13, "glass", 16);
  t.body.cylinder(0, 1.455, 0, 0.19, 0.19, 0.02, "iron", 16);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    t.body.pipe(Math.cos(a) * 0.173, 1.325, Math.sin(a) * 0.173, Math.cos(a) * 0.173, 1.455, Math.sin(a) * 0.173, 0.007, "brass");
  }
};
const aetherHousing = (t: TownBuilders): void => {
  t.body.cylinder(0, 0, 0, 0.23, 0.28, 0.11, "stoneDark", 16);
  t.body.cylinder(0, 0.11, 0, 0.25, 0.25, 0.025, "brassDark", 16);
  // Swept structural piers surround the original moving containment rings.
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, x = Math.cos(a), z = Math.sin(a);
    const points = [[0.30, 0.10], [0.24, 0.43], [0.22, 1.06], [0.13, 1.52], [0.045, 1.83]] as const;
    for (let j = 0; j < points.length - 1; j++) {
      const p = points[j]!, q = points[j + 1]!;
      t.body.pipe(x * p[0], p[1], z * p[0], x * q[0], q[1], z * q[0], 0.022, "stoneLight");
    }
    t.body.pipe(x * 0.24, 0.40, z * 0.24, x * 0.22, 1.06, z * 0.22, 0.008, "brassDark");
  }
  for (const y of [0.38, 1.10, 1.51]) t.body.cylinder(0, y, 0, 0.23 - y * 0.07, 0.24 - y * 0.07, 0.025, "brassDark", 16);
  t.body.cylinder(0, 1.535, 0, 0.08, 0.135, 0.12, "iron", 16);
  t.body.cylinder(0, 1.655, 0, 0.025, 0.08, 0.50, "brassDark", 16);
  t.body.cylinder(0, 2.155, 0, 0.008, 0.025, 0.16, "iron", 12);
  t.glow.disc(0, 0.22, 0.27, 0.035, 0.008, "aether");
  t.body.disc(0, 0.22, 0.26, 0.045, 0.015, "brassDark");
};
export const buildInfrastructure = (t: TownBuilders, kind: InfrastructureModelKind): void => {
  switch (kind) {
    case "MINE": return mine(t, false);
    case "CRYSTAL_MINE": return mine(t, true);
    case "HARBOR_EXCHANGE": return harbor(t);
    case "RELAY_HOUSING": return relayHousing(t);
    case "AETHER_HOUSING": return aetherHousing(t);
    case "INFRASTRUCTURE_SLAB": return octagonPlate(t, 0.48, false);
  }
};
