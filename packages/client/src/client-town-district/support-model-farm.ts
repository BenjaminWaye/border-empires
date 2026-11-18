import type { TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { band } from "./support-model-detail.js";

// Farm Plot and its Hydrogarden Plot upgrade (docs/farm-plot-plan.md): town
// folk working kitchen beds on a plain support tile. Both share the planted
// beds and the irrigation mast; the upgrade adds Hyperfeed glasshouses over
// the beds, so the two read apart without colour.

const BED_ZS = [-0.13, 0, 0.13] as const;

const plantedBeds = (t: TownBuilders, rich: boolean): void => {
  for (const z of BED_ZS) {
    t.body.box(0.04, 0.012, z, 0.34, 0.03, 0.09, "stoneDark");
    t.body.box(0.04, 0.042, z, 0.32, 0.008, 0.075, "trunk");
    for (let i = 0; i < 6; i += 1) {
      t.body.blob(-0.1 + i * 0.056, 0.055, z, rich ? 0.026 : 0.02, i % 2 === 0 ? "foliage" : "foliageLight", 0.7);
    }
  }
};

// Windpump over a cistern: draws ground water into the bed channels.
const irrigationMast = (t: TownBuilders, x: number, z: number): void => {
  t.body.cylinder(x, 0.012, z, 0.055, 0.06, 0.07, "stoneLight", 10);
  t.body.cylinder(x, 0.08, z, 0.048, 0.048, 0.004, "water", 10);
  for (const dx of [-0.03, 0.03]) t.body.box(x + dx, 0.08, z, 0.01, 0.2, 0.01, "iron");
  t.body.box(x, 0.28, z, 0.05, 0.03, 0.04, "ironDark");
  t.body.disc(x, 0.3, z + 0.03, 0.045, 0.006, "brass");
  band(t, x, 0.18, z, 0.035);
  t.body.pipe(x, 0.06, z, 0.04, 0.03, 0.2, 0.01, "brassDark");
};

const toolShed = (t: TownBuilders, x: number, z: number): void => {
  t.body.box(x, 0.012, z, 0.1, 0.07, 0.08, "stone");
  t.body.gable(x, 0.082, z, 0.11, 0.05, 0.09, "graphite");
  t.body.box(x, 0.03, z + 0.041, 0.03, 0.045, 0.004, "window");
};

const farmPlot = (t: TownBuilders): void => {
  plantedBeds(t, false);
  irrigationMast(t, -0.2, 0.17);
  toolShed(t, -0.22, -0.16);
};

const hydrogardenPlot = (t: TownBuilders): void => {
  plantedBeds(t, true);
  irrigationMast(t, -0.2, 0.17);
  // Hyperfeed glasshouses: a lit, ribbed glass vault over each bed.
  for (const z of BED_ZS) {
    t.body.ellipsoid(0.04, 0.05, z, 0.17, 0.09, 0.05, "glassLight");
    for (const x of [-0.08, 0.04, 0.16]) t.body.box(x, 0.05, z, 0.006, 0.07, 0.1, "brassDark");
    t.glow.box(0.04, 0.14, z, 0.18, 0.004, 0.012, "lamp");
  }
  t.body.cylinder(-0.22, 0.012, -0.16, 0.05, 0.055, 0.17, "iron", 8);
  band(t, -0.22, 0.12, -0.16, 0.055);
  t.glow.gem(-0.22, 0.21, -0.16, 0.018, 0.03, "aether");
};

export const buildFarm = (t: TownBuilders, kind: string): boolean => {
  if (kind === "FARM_PLOT") { farmPlot(t); return true; }
  if (kind === "HYDROGARDEN_PLOT") { hydrogardenPlot(t); return true; }
  return false;
};
