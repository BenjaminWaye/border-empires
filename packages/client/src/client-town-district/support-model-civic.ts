import { spinning, type TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { crate, windowStrip } from "./support-model-core.js";
import { band, gantry, housing, loadingDoor, ribs } from "./support-model-detail.js";

export const buildCivic = (t: TownBuilders, kind: string): boolean => {
  switch (kind) {
    case "CENSUS_HALL":
      // Tall record tower above two stepped archive wings.
      for (const x of [-0.15, 0.15]) housing(t, x, 0, 0.12, 0.13, 0.26);
      housing(t, 0, -0.035, 0.135, 0.31, 0.19);
      t.body.pyramid(0, 0.363, -0.035, 0.18, 0.075, 0.22, "graphite");
      t.body.disc(0, 0.29, 0.067, 0.04, 0.012, "brass");
      t.glow.disc(0, 0.29, 0.075, 0.03, 0.004, "lamp");
      t.body.box(0, 0.005, 0.175, 0.16, 0.025, 0.11, "paving");
      for (const x of [-0.065, 0.065]) t.body.box(x, 0.03, 0.145, 0.015, 0.14, 0.025, "stoneLight");
      t.body.gable(0, 0.17, 0.145, 0.18, 0.04, 0.09, "stoneLight");
      return true;
    case "CLEARING_HOUSE":
      // Round exchange rotunda, broad drum and radial colonnade.
      t.body.cylinder(0, 0.015, -0.025, 0.19, 0.22, 0.035, "stoneLight", 12);
      t.body.cylinder(0, 0.05, -0.025, 0.14, 0.14, 0.17, "stoneDark", 12);
      for (let i = 0; i < 8; i += 1) {
        const angle = i * Math.PI / 4;
        const x = Math.sin(angle) * 0.175, z = -0.025 + Math.cos(angle) * 0.175;
        t.body.cylinder(x, 0.05, z, 0.012, 0.016, 0.18, "stoneLight", 6);
      }
      band(t, 0, 0.225, -0.025, 0.195);
      t.body.dome(0, 0.234, -0.025, 0.18, "graphite", 12, 0.7);
      t.body.cylinder(0, 0.36, -0.025, 0.035, 0.045, 0.035, "brass", 8);
      t.body.box(0, 0.005, 0.21, 0.13, 0.027, 0.075, "paving");
      for (const x of [-0.065, 0, 0.065]) t.glow.box(x, 0.095, 0.112, 0.025, 0.075, 0.008, "lampWarm");
      return true;
    case "MINISTRY_HALL":
      // U-shaped administrative palace with an open ceremonial forecourt.
      housing(t, 0, -0.15, 0.4, 0.23, 0.12);
      for (const x of [-0.17, 0.17]) {
        housing(t, x, 0.045, 0.1, 0.18, 0.29);
        t.body.pyramid(x, 0.233, 0.045, 0.13, 0.055, 0.32, "graphite");
      }
      windowStrip(t, 0, 0.18, -0.084, 5);
      t.body.box(0, 0.005, 0.09, 0.18, 0.018, 0.2, "paving");
      t.body.cylinder(0, 0.025, 0.1, 0.04, 0.055, 0.03, "stoneLight", 8);
      t.body.gem(0, 0.095, 0.1, 0.022, 0.065, "brass");
      t.body.box(0, 0.283, -0.15, 0.12, 0.05, 0.06, "stoneLight");
      t.glow.box(0, 0.298, -0.115, 0.075, 0.008, 0.004, "aether");
      return true;
    case "QUARTERMASTERS_OFFICE":
      // Long logistics shed with a projecting watch cabin and supply racks.
      housing(t, -0.035, -0.07, 0.38, 0.1, 0.21);
      housing(t, 0.15, -0.1, 0.12, 0.24, 0.13);
      t.body.gable(0.15, 0.293, -0.1, 0.15, 0.05, 0.16, "graphite");
      loadingDoor(t, -0.09, 0.042, 0.13, 0.09);
      for (const x of [-0.17, -0.04, 0.09]) {
        crate(t, x, 0.18);
        t.body.box(x, 0.063, 0.18, 0.08, 0.008, 0.085, "iron");
        t.body.box(x, 0.015, 0.21, 0.009, 0.12, 0.009, "brassDark");
      }
      return true;
    case "TRADE_NEXUS":
      // Open cargo-transfer portal, paired warehouses and suspended freight.
      for (const x of [-0.17, 0.17]) {
        housing(t, x, -0.075, 0.1, 0.12, 0.24);
        loadingDoor(t, x, 0.052, 0.065, 0.09);
      }
      gantry(t, 0, -0.035, 0.35, 0.37, 0.055);
      t.body.box(0.04, 0.373, -0.035, 0.09, 0.045, 0.08, "brassDark");
      t.body.pipe(0.04, 0.37, -0.035, 0.04, 0.19, -0.035, 0.003, "ironDark");
      t.body.box(0.04, 0.12, -0.035, 0.095, 0.07, 0.08, "stoneLight");
      for (const x of [-0.15, 0, 0.15]) crate(t, x, 0.18);
      return true;
    case "RESONANCE_GRID":
      // A square tuning frame around a suspended horizontal resonator.
      for (const x of [-0.18, 0.18]) {
        t.body.box(x, 0.015, -0.02, 0.065, 0.29, 0.09, "iron");
        for (const y of [0.07, 0.15, 0.23]) t.body.box(x, y, -0.02, 0.09, 0.014, 0.12, "brassDark");
        t.glow.box(x, 0.08, 0.032, 0.014, 0.16, 0.006, "aether");
      }
      t.body.box(0, 0.305, -0.02, 0.42, 0.024, 0.1, "brass");
      spinning(t, 0, 0.19, -0.02, [1, 0, 0], 0.35, () => {
        t.body.pipe(-0.115, 0.19, -0.02, 0.115, 0.19, -0.02, 0.055, "ironDark");
        for (const x of [-0.07, 0, 0.07]) t.body.pipe(x - 0.008, 0.19, -0.02, x + 0.008, 0.19, -0.02, 0.075, "brass");
      });
      ribs(t, 0, 0.015, 0.16, 0.25, 6, 0.08, 0.09);
      return true;
    default: return false;
  }
};
