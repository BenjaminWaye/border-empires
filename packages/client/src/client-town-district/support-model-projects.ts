import { gear, spinning, type TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { crate, hall } from "./support-model-core.js";
import type { DistrictBuildingKind } from "./district-catalog.js";

type PartBuilder = (t: TownBuilders) => void;
// Each preparation has its own recognizable machine; shared architectural
// fittings do not erase the names/roles of these commissioned project parts.
const PARTS: Readonly<Partial<Record<DistrictBuildingKind, PartBuilder>>> = {
  IMPERIAL_EXCHANGE_PART_1: t => {
    hall(t, 0, -0.06, 0.32, 0.14, 0.24);
    t.body.box(0, 0.02, 0.15, 0.21, 0.06, 0.09, "brassDark");
    for (let i = 0; i < 6; i += 1) t.body.box(0, 0.08 + i * 0.008, 0.15, 0.17, 0.004, 0.075, "brass");
    t.body.pyramid(0, 0.25, -0.06, 0.13, 0.07, 0.13, "brass");
  },
  IMPERIAL_EXCHANGE_PART_2: t => {
    hall(t, 0, -0.14, 0.24, 0.12, 0.11);
    for (const x of [-0.17, -0.055, 0.055, 0.17]) {
      t.body.box(x, 0.02, 0.03, 0.055, 0.12, 0.18, "iron");
      gear(t, x, 0.18, 0.06, 0.054, 0, x > 0 ? 0.4 : -0.4);
    }
  },
  IMPERIAL_EXCHANGE_PART_3: t => {
    hall(t, 0, -0.15, 0.26, 0.1, 0.1);
    t.body.cylinder(0, 0.02, 0.06, 0.095, 0.13, 0.08, "stoneLight", 8);
    t.body.disc(0, 0.2, 0.06, 0.1, 0.035, "brass");
    t.body.disc(0, 0.2, 0.081, 0.07, 0.01, "iron");
    t.glow.gem(0, 0.2, 0.09, 0.035, 0.06, "lamp");
  },
  SOVEREIGN_SIEGE_ENGINE_PART_1: t => {
    for (const x of [-0.2, 0.2]) t.body.box(x, 0.02, 0, 0.055, 0.12, 0.17, "stoneLight");
    t.body.pipe(-0.24, 0.18, 0, 0.24, 0.18, 0, 0.055, "iron");
    for (const x of [-0.18, 0, 0.18]) t.body.pipe(x - 0.012, 0.18, 0, x + 0.012, 0.18, 0, 0.063, "brass");
    hall(t, 0, 0.19, 0.23, 0.085, 0.09);
  },
  SOVEREIGN_SIEGE_ENGINE_PART_2: t => {
    t.body.cylinder(0, 0.015, 0, 0.13, 0.16, 0.065, "iron", 8);
    t.body.gem(0, 0.2, 0, 0.08, 0.24, "ironDark");
    for (const x of [-0.14, 0.14]) {
      t.body.box(x, 0.05, 0, 0.03, 0.24, 0.08, "brassDark");
      t.glow.pipe(x, 0.1, 0.045, x, 0.27, 0.045, 0.006, "lampWarm");
    }
    t.body.ring(0, 0.3, 0, 0.13, "brass", 0.06);
  },
  SOVEREIGN_SIEGE_ENGINE_PART_3: t => {
    hall(t, 0, 0.11, 0.28, 0.12, 0.15);
    t.body.cylinder(0, 0.02, -0.08, 0.028, 0.06, 0.27, "iron", 8);
    t.body.disc(0, 0.31, -0.08, 0.09, 0.025, "brass");
    t.body.disc(0, 0.31, -0.062, 0.065, 0.01, "glass");
    for (const x of [-0.2, 0.2]) t.body.pipe(x, 0.02, -0.12, x, 0.22, -0.12, 0.007, "brass");
  },
  AEGIS_DOME_PART_1: t => {
    for (const x of [-0.16, 0, 0.16]) for (const z of [-0.15, 0, 0.15]) {
      t.body.cylinder(x, 0.01, z, 0.018, 0.027, 0.12, "iron", 6);
      t.glow.gem(x, 0.15, z, 0.013, 0.025, "aether");
      if (x < 0.16) t.body.pipe(x, 0.1, z, x + 0.16, 0.1, z, 0.008, "brass");
      if (z < 0.15) t.body.pipe(x, 0.1, z, x, 0.1, z + 0.15, 0.008, "brass");
    }
  },
  AEGIS_DOME_PART_2: t => {
    t.body.cylinder(0, 0.01, 0, 0.12, 0.16, 0.09, "stoneLight", 8);
    t.body.cylinder(0, 0.1, 0, 0.055, 0.09, 0.23, "iron", 8);
    for (const y of [0.12, 0.2, 0.3]) t.body.ring(0, y, 0, 0.095, "brass", 0.06);
    t.glow.gem(0, 0.35, 0, 0.04, 0.07, "aether");
  },
  AEGIS_DOME_PART_3: t => {
    t.body.cylinder(0, 0.01, 0, 0.15, 0.18, 0.05, "stoneLight", 8);
    t.body.dome(0, 0.06, 0, 0.14, "glass", 12, 0.8);
    t.body.ring(0, 0.11, 0, 0.15, "brass", 0.05);
    for (let i = 0; i < 8; i += 1) {
      const a = i * Math.PI / 4;
      t.body.cone(Math.sin(a) * 0.145, 0.1, Math.cos(a) * 0.145, 0.014, 0.14, "brass", 6);
    }
  },
  ASTRAL_DOCK_PART_1: t => {
    t.body.box(0, 0.01, 0, 0.32, 0.05, 0.33, "iron");
    for (const x of [-0.13, 0.13]) {
      t.body.box(x, 0.06, 0, 0.035, 0.16, 0.3, "brassDark");
      t.body.pipe(x, 0.23, -0.15, x, 0.23, 0.15, 0.012, "brass");
    }
    t.body.ellipsoid(0, 0.13, 0, 0.2, 0.05, 0.055, "stoneLight", Math.PI / 2);
  },
  ASTRAL_DOCK_PART_2: t => {
    hall(t, 0, 0.17, 0.24, 0.09, 0.1);
    t.body.cylinder(0, 0.01, -0.06, 0.04, 0.075, 0.25, "iron", 8);
    spinning(t, 0, 0.28, -0.06, [0, 1, 0], 0.35, () => {
      for (const x of [-0.14, 0.14]) t.body.box(x, 0.27, -0.06, 0.2, 0.015, 0.14, "glass");
      t.body.pipe(-0.23, 0.27, -0.06, 0.23, 0.27, -0.06, 0.007, "brass");
    });
  },
  ASTRAL_DOCK_PART_3: t => {
    t.body.box(0, 0.02, 0, 0.29, 0.04, 0.24, "stoneLight");
    t.body.pipe(0, 0.06, 0, 0, 0.36, 0, 0.008, "brass");
    for (const x of [-0.12, 0.12]) {
      t.body.panel(x, 0.22, 0, 0.19, 0.22, "glass");
      t.body.pipe(x * 2, 0.1, 0, x * 2, 0.34, 0, 0.006, "brassDark");
    }
    t.glow.gem(0, 0.37, 0, 0.02, 0.04, "aether");
  },
  CENSUS_DIRECTORATE_PART_1: t => {
    hall(t, 0, -0.12, 0.3, 0.14, 0.14);
    for (const x of [-0.13, 0, 0.13]) {
      t.body.box(x, 0.02, 0.08, 0.065, 0.15, 0.14, "iron");
      gear(t, x, 0.2, 0.11, 0.045, 0, 0.5);
      t.glow.box(x, 0.05, 0.155, 0.04, 0.04, 0.005, "lamp");
    }
  },
  CENSUS_DIRECTORATE_PART_2: t => {
    hall(t, 0, -0.02, 0.35, 0.2, 0.28);
    t.body.disc(0, 0.13, 0.13, 0.067, 0.02, "iron");
    t.body.disc(0, 0.13, 0.145, 0.052, 0.008, "brass");
    t.body.box(0, 0.125, 0.153, 0.07, 0.01, 0.012, "ironDark");
  },
  CENSUS_DIRECTORATE_PART_3: t => {
    hall(t, 0, -0.08, 0.28, 0.12, 0.19);
    t.body.box(0, 0.015, 0.15, 0.18, 0.035, 0.1, "stoneLight");
    for (const x of [-0.05, 0.05]) t.body.box(x, 0.05, 0.15, 0.07, 0.008, 0.06, "paving");
    t.body.cylinder(0, 0.24, -0.08, 0.007, 0.01, 0.12, "brass", 6);
    t.body.panel(0.038, 0.32, -0.08, 0.07, 0.05, "stoneLight");
  },
  TITANIUM_LEVY_PART_1: t => {
    hall(t, 0, 0.12, 0.28, 0.11, 0.17);
    t.body.cylinder(0, 0.01, -0.08, 0.025, 0.045, 0.27, "iron", 8);
    for (const side of [-1, 1]) t.body.pipe(side * 0.02, 0.29, -0.08, side * 0.15, 0.29, -0.08, 0.035, "brass");
  },
  TITANIUM_LEVY_PART_2: t => {
    t.body.cylinder(0, 0.01, 0, 0.1, 0.16, 0.08, "stoneLight", 8);
    t.body.cylinder(0, 0.09, 0, 0.01, 0.015, 0.3, "brass", 8);
    t.body.panel(0.055, 0.3, 0, 0.12, 0.12, "iron");
    t.body.panel(0.055, 0.3, 0.002, 0.075, 0.075, "stoneLight");
    for (const x of [-0.2, 0.2]) crate(t, x, 0.1);
  },
  TITANIUM_LEVY_PART_3: t => {
    hall(t, 0, -0.03, 0.36, 0.13, 0.25);
    for (const x of [-0.12, 0, 0.12]) {
      t.body.box(x, 0.015, 0.16, 0.07, 0.04, 0.08, "brassDark");
      t.body.box(x, 0.055, 0.16, 0.055, 0.006, 0.06, "paving");
    }
    t.body.gem(0, 0.25, -0.03, 0.034, 0.06, "brass");
  }
};

export const buildProjectPart = (t: TownBuilders, kind: DistrictBuildingKind): boolean => {
  const draw = PARTS[kind];
  if (!draw) return false;
  draw(t);
  return true;
};
