import { gear, spinning, steamVent, type TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { hall } from "./support-model-core.js";

export const buildUtility = (t: TownBuilders, kind: string): boolean => {
  switch (kind) {
    case "HYDROWORKS":
      hall(t, -0.08, -0.1, 0.25, 0.12, 0.18);
      t.body.cylinder(0.14, 0.015, 0.06, 0.1, 0.11, 0.09, "stoneLight", 12);
      t.body.cylinder(0.14, 0.106, 0.06, 0.083, 0.083, 0.004, "water", 12);
      t.body.pipe(-0.07, 0.07, 0.06, 0.14, 0.07, 0.06, 0.015, "brass");
      gear(t, -0.12, 0.12, 0.14, 0.075, 0, 0.4);
      return true;
    case "ORE_REFINERY":
      hall(t, -0.06, -0.07, 0.31, 0.16, 0.23);
      for (const x of [0.13, 0.22]) {
        t.body.cylinder(x, 0.02, -0.04, 0.038, 0.05, 0.23, "iron", 8);
        t.body.cone(x, 0.25, -0.04, 0.05, 0.06, "graphite", 8);
        t.body.ring(x, 0.18, -0.04, 0.045, "brass", 0.08);
      }
      t.body.box(-0.05, 0.02, 0.16, 0.28, 0.025, 0.1, "iron");
      for (const x of [-0.15, -0.05, 0.05]) t.body.blob(x, 0.06, 0.16, 0.035, "stoneDark");
      steamVent(t, -0.16, 0.25, -0.13, 0.13);
      return true;
    case "SKY_DOCK":
      hall(t, -0.13, 0.06, 0.15, 0.12, 0.22);
      t.body.box(0.06, 0.02, -0.04, 0.26, 0.035, 0.37, "iron");
      for (const x of [-0.06, 0.18]) {
        t.body.box(x, 0.055, -0.04, 0.02, 0.14, 0.34, "brassDark");
        t.glow.pipe(x, 0.2, -0.2, x, 0.2, 0.12, 0.004, "lamp");
      }
      spinning(t, 0.06, 0.25, -0.04, [0, 1, 0], 0.12, () => {
        t.body.ellipsoid(0.06, 0.25, -0.04, 0.17, 0.05, 0.06, "stoneLight", Math.PI / 2);
        t.body.box(0.06, 0.18, -0.04, 0.04, 0.03, 0.08, "brass");
      });
      return true;
    case "AMBARIC_TRANSFORMER":
      hall(t, 0, 0.18, 0.25, 0.09, 0.1);
      for (const x of [-0.13, 0.13]) {
        t.body.cylinder(x, 0.015, -0.04, 0.045, 0.055, 0.22, "iron", 10);
        for (let i = 0; i < 5; i += 1) t.body.ring(x, 0.055 + i * 0.035, -0.04, 0.06, "brass", 0.07);
        t.glow.gem(x, 0.26, -0.04, 0.022, 0.045, "aether");
      }
      t.body.pipe(-0.13, 0.12, -0.04, 0.13, 0.12, -0.04, 0.022, "ironDark");
      return true;
    case "RELAY_BEACON":
      t.body.cylinder(0, 0.015, 0, 0.1, 0.15, 0.08, "stoneLight", 8);
      t.body.cylinder(0, 0.095, 0, 0.045, 0.075, 0.17, "iron", 8);
      t.body.cone(0, 0.265, 0, 0.09, 0.065, "brass", 8);
      for (const y of [0.11, 0.2, 0.26]) t.body.ring(0, y, 0, 0.075, "brass", 0.06);
      t.glow.gem(0, 0.35, 0, 0.037, 0.09, "aether");
      for (const x of [-0.16, 0.16]) {
        t.body.box(x, 0.015, 0.04, 0.07, 0.065, 0.11, "iron");
        t.body.pipe(x, 0.065, 0.04, 0, 0.065, 0, 0.01, "brass");
      }
      return true;
    case "OBSERVATORY":
      hall(t, 0, 0.15, 0.27, 0.09, 0.1);
      t.body.cylinder(0, 0.015, -0.05, 0.075, 0.13, 0.08, "stoneLight", 8);
      t.body.cylinder(0, 0.095, -0.05, 0.05, 0.075, 0.24, "iron", 8);
      for (const y of [0.12, 0.23, 0.32]) t.body.ring(0, y, -0.05, 0.082, "brass", 0.06);
      t.glow.gem(0, 0.385, -0.05, 0.05, 0.095, "aether");
      spinning(t, 0, 0.38, -0.05, [0, 1, 0], 0.35, () => {
        t.body.ring(0, 0.38, -0.05, 0.12, "brass", 0.05);
        for (const x of [-0.12, 0.12]) t.glow.gem(x, 0.38, -0.05, 0.012, 0.025, "aether");
      });
      return true;
    default: return false;
  }
};
