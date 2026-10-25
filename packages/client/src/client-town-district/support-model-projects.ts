import { spinning, type TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { band, gantry, housing, ribs } from "./support-model-detail.js";
import type { DistrictBuildingKind } from "./district-catalog.js";

type PartBuilder = (t: TownBuilders) => void;
// Each named commission has a large identifying object and its own massing.
// Detail supports that object instead of hiding it inside another generic hall.
const PARTS: Readonly<Partial<Record<DistrictBuildingKind, PartBuilder>>> = {
  IMPERIAL_EXCHANGE_PART_1: t => {
    // Golden Ledger: broad terraced archive and a luminous data ledger.
    housing(t, 0, -0.09, 0.37, 0.12, 0.22);
    t.body.box(0, 0.173, -0.09, 0.24, 0.035, 0.18, "brassDark");
    for (const side of [-1, 1]) {
      t.body.box(side * 0.06, 0.21, -0.09, 0.115, 0.015, 0.16, "glassLight");
      for (const z of [-0.13, -0.09, -0.05]) t.glow.box(side * 0.06, 0.226, z, 0.075, 0.003, 0.006, "aether");
    }
    t.body.box(0, 0.205, -0.09, 0.012, 0.035, 0.19, "brass");
    for (const x of [-0.12, 0.12]) ribs(t, x, 0.015, 0.16, 0.13, 4, 0.065, 0.09);
  },
  IMPERIAL_EXCHANGE_PART_2: t => {
    // Counting Engine: three magnetic computing drums, low stepped silhouette.
    t.body.box(0, 0.015, 0, 0.43, 0.04, 0.3, "stoneLight");
    for (const [x, y, r] of [[-0.15, 0.14, 0.075], [0, 0.2, 0.105], [0.16, 0.13, 0.06]] as const) {
      t.body.box(x, 0.055, -0.035, 0.045, y, 0.055, "iron");
      spinning(t, x, y, 0.015, [0, 0, 1], x > 0 ? 0.4 : -0.4, () => {
        t.body.disc(x, y, 0.015, r, 0.06, "iron");
        t.body.disc(x, y, 0.05, r * 0.83, 0.009, "brassDark");
        t.body.disc(x, y, 0.058, r * 0.62, 0.006, "glassLight");
        t.glow.disc(x, y, 0.063, r * 0.24, 0.003, "aether");
      });
    }
    t.body.pipe(-0.21, 0.08, -0.1, 0.21, 0.08, -0.1, 0.02, "brassDark");
    ribs(t, 0.02, 0.04, 0.15, 0.23, 7, 0.045, 0.06);
  },
  IMPERIAL_EXCHANGE_PART_3: t => {
    // Sovereign Seal: huge vertical stamped medallion in an A-frame stand.
    t.body.box(0, 0.012, 0, 0.34, 0.035, 0.25, "stoneLight");
    for (const x of [-0.15, 0.15]) t.body.pipe(x, 0.047, 0.08, x * 0.5, 0.24, -0.035, 0.018, "iron");
    t.body.disc(0, 0.25, -0.035, 0.135, 0.04, "brassDark");
    t.body.disc(0, 0.25, -0.009, 0.108, 0.015, "brass");
    t.body.disc(0, 0.25, 0.002, 0.075, 0.008, "ironDark");
    t.body.gem(0, 0.25, 0.018, 0.045, 0.07, "brass");
    t.glow.box(0, 0.08, 0.12, 0.15, 0.008, 0.035, "lamp");
  },
  SOVEREIGN_SIEGE_ENGINE_PART_1: t => {
    // Long Barrel: horizontal gun tube, broad trunnions and exposed breech.
    for (const x of [-0.15, 0.15]) {
      t.body.box(x, 0.015, 0, 0.07, 0.025, 0.25, "stoneLight");
      t.body.box(x, 0.04, 0, 0.04, 0.15, 0.12, "iron");
    }
    t.body.pipe(-0.25, 0.2, 0, 0.25, 0.2, 0, 0.055, "iron");
    for (const x of [-0.2, 0.04, 0.2]) t.body.pipe(x - 0.012, 0.2, 0, x + 0.012, 0.2, 0, 0.068, "brassDark");
    t.body.box(-0.2, 0.15, 0, 0.09, 0.12, 0.15, "ironDark");
    t.body.pipe(0.24, 0.2, 0, 0.255, 0.2, 0, 0.038, "ironDark");
    ribs(t, -0.03, 0.015, 0.18, 0.2, 5, 0.055, 0.06);
  },
  SOVEREIGN_SIEGE_ENGINE_PART_2: t => {
    // Fracture Core: split crystal under four inward-leaning containment claws.
    t.body.cylinder(0, 0.015, 0, 0.16, 0.19, 0.045, "stoneLight", 8);
    t.body.gem(0, 0.22, 0, 0.09, 0.27, "ironDark");
    for (let i = 0; i < 4; i += 1) {
      const a = i * Math.PI / 2;
      const x = Math.sin(a), z = Math.cos(a);
      t.body.pipe(x * 0.16, 0.06, z * 0.16, x * 0.17, 0.27, z * 0.17, 0.02, "iron");
      t.body.pipe(x * 0.17, 0.27, z * 0.17, x * 0.07, 0.38, z * 0.07, 0.016, "brassDark");
      t.glow.pipe(x * 0.075, 0.17, z * 0.075, x * 0.075, 0.28, z * 0.075, 0.005, "lampWarm");
    }
  },
  SOVEREIGN_SIEGE_ENGINE_PART_3: t => {
    // Sky-Marking Array: three inclined sighting tubes on a fan-shaped base.
    housing(t, 0, 0.15, 0.29, 0.07, 0.1);
    for (const x of [-0.17, 0, 0.17]) {
      t.body.cylinder(x, 0.015, -0.06, 0.025, 0.045, 0.14, "iron", 8);
      t.body.pipe(x, 0.17, 0.015, x, 0.3, -0.17, x ? 0.025 : 0.04, "brassDark");
      t.body.pipe(x, 0.3, -0.17, x, 0.32, -0.2, x ? 0.03 : 0.047, "brass");
      t.glow.gem(x, 0.32, -0.205, 0.016, 0.025, "aether");
    }
    t.body.pipe(-0.2, 0.07, -0.06, 0.2, 0.07, -0.06, 0.009, "iron");
  },
  AEGIS_DOME_PART_1: t => {
    // Shield Lattice: raised square field of connected diagonal emitters.
    for (const x of [-0.17, 0, 0.17]) for (const z of [-0.17, 0, 0.17]) {
      t.body.cylinder(x, 0.015, z, 0.02, 0.035, 0.04, "stoneLight", 6);
      t.body.box(x, 0.055, z, 0.025, 0.1, 0.025, "iron", Math.PI / 4);
      t.glow.gem(x, 0.17, z, 0.018, 0.025, "aether");
      if (x < 0.17) t.body.pipe(x, 0.13, z, x + 0.17, 0.13, z, 0.008, "brass");
      if (z < 0.17) t.body.pipe(x, 0.13, z, x, 0.13, z + 0.17, 0.008, "brass");
    }
    t.body.pipe(-0.17, 0.13, -0.17, 0.17, 0.13, 0.17, 0.006, "iron");
    t.body.pipe(-0.17, 0.13, 0.17, 0.17, 0.13, -0.17, 0.006, "iron");
  },
  AEGIS_DOME_PART_2: t => {
    // Ward Anchor: heavy stepped obelisk and four broad flying buttresses.
    t.body.box(0, 0.015, 0, 0.29, 0.04, 0.29, "stoneLight");
    t.body.box(0, 0.055, 0, 0.11, 0.28, 0.11, "iron");
    t.body.pyramid(0, 0.335, 0, 0.14, 0.12, 0.14, "brassDark");
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      t.body.pipe(x * 0.15, 0.055, z * 0.15, x * 0.065, 0.24, z * 0.065, 0.022, "stoneDark");
    }
    t.glow.box(0, 0.11, 0.058, 0.022, 0.19, 0.005, "aether");
    for (const y of [0.08, 0.3]) t.body.box(0, y, 0, 0.14, 0.014, 0.14, "brass");
  },
  AEGIS_DOME_PART_3: t => {
    // Aegis Crown: a low open crown with eight inward-pointing shield petals.
    t.body.cylinder(0, 0.015, 0, 0.17, 0.2, 0.04, "stoneLight", 8);
    band(t, 0, 0.12, 0, 0.17);
    for (let i = 0; i < 8; i += 1) {
      const a = i * Math.PI / 4, x = Math.sin(a), z = Math.cos(a);
      t.body.pipe(x * 0.16, 0.055, z * 0.16, x * 0.19, 0.17, z * 0.19, 0.012, "brass");
      t.body.pipe(x * 0.19, 0.17, z * 0.19, x * 0.1, 0.29, z * 0.1, 0.012, "brass");
      t.glow.gem(x * 0.1, 0.3, z * 0.1, 0.012, 0.024, "aether");
    }
    t.body.dome(0, 0.055, 0, 0.11, "glass", 10, 0.55);
  },
  ASTRAL_DOCK_PART_1: t => {
    // Launch Cradle: empty keel bed and four tall inward-leaning supports.
    t.body.box(0, 0.015, 0, 0.32, 0.035, 0.4, "stoneLight");
    for (const x of [-0.14, 0.14]) for (const z of [-0.14, 0.14]) {
      t.body.pipe(x, 0.05, z, x, 0.23, z, 0.02, "iron");
      t.body.pipe(x, 0.23, z, x * 0.5, 0.29, z, 0.017, "brassDark");
    }
    for (const x of [-0.065, 0.065]) t.body.box(x, 0.06, 0, 0.018, 0.018, 0.38, "brass");
    ribs(t, 0, 0.05, 0, 0.12, 5, 0.025, 0.29);
  },
  ASTRAL_DOCK_PART_2: t => {
    // Orbital Array: four oversized horizontal collectors around a raised hub.
    t.body.cylinder(0, 0.015, 0, 0.065, 0.12, 0.09, "stoneLight", 8);
    t.body.cylinder(0, 0.105, 0, 0.025, 0.05, 0.18, "iron", 8);
    spinning(t, 0, 0.3, 0, [0, 1, 0], 0.18, () => {
      for (const [x, z] of [[-0.16, 0], [0.16, 0], [0, -0.16], [0, 0.16]] as const) {
        t.body.box(x, 0.3, z, x ? 0.16 : 0.1, 0.012, x ? 0.1 : 0.16, "brassDark");
        t.body.box(x, 0.314, z, x ? 0.145 : 0.085, 0.004, x ? 0.085 : 0.145, "glassLight");
        t.body.pipe(0, 0.3, 0, x, 0.3, z, 0.009, "brass");
      }
      t.body.dome(0, 0.3, 0, 0.045, "brass", 8, 0.7);
    });
  },
  ASTRAL_DOCK_PART_3: t => {
    // Aether Sail: two tall diamond sails and a narrow mast.
    t.body.box(0, 0.015, 0, 0.27, 0.035, 0.2, "stoneLight");
    t.body.pipe(0, 0.05, 0, 0, 0.44, 0, 0.009, "brass");
    for (const side of [-1, 1]) {
      t.body.gem(side * 0.11, 0.255, 0, 0.11, 0.3, "glassLight");
      t.body.pipe(0, 0.1, 0, side * 0.22, 0.255, 0, 0.005, "brassDark");
      t.body.pipe(side * 0.22, 0.255, 0, 0, 0.42, 0, 0.005, "brassDark");
    }
    t.glow.gem(0, 0.46, 0, 0.015, 0.025, "aether");
  },
  CENSUS_DIRECTORATE_PART_1: t => {
    // Census Engine: three tall sealed data cabinets with an elevated optical bus.
    for (const x of [-0.16, 0, 0.16]) {
      housing(t, x, -0.04, 0.1, 0.2 + (x === 0 ? 0.09 : 0), 0.2);
      for (const y of [0.08, 0.13, 0.18]) t.glow.box(x, y, 0.068, 0.07, 0.006, 0.014, "aether");
      t.body.box(x, 0.015, 0.16, 0.09, 0.025, 0.075, "glassLight");
    }
    t.body.box(0, 0.34, -0.04, 0.065, 0.035, 0.08, "brass");
    t.body.pipe(-0.16, 0.24, -0.04, 0.16, 0.24, -0.04, 0.012, "iron");
  },
  CENSUS_DIRECTORATE_PART_2: t => {
    // Registry Vault: squat armoured bunker and oversized circular vault door.
    housing(t, 0, -0.035, 0.36, 0.2, 0.3);
    for (const x of [-0.17, 0.17]) t.body.box(x, 0.03, 0.025, 0.045, 0.25, 0.25, "stoneLight");
    t.body.box(0, 0.253, -0.035, 0.29, 0.025, 0.25, "iron");
    t.body.disc(0, 0.13, 0.13, 0.09, 0.035, "brassDark");
    t.body.disc(0, 0.13, 0.153, 0.07, 0.015, "iron");
    for (const a of [0, Math.PI / 2]) t.body.box(0, 0.125, 0.165, 0.105, 0.012, 0.01, "brass", a);
    t.body.box(0, 0.005, 0.21, 0.15, 0.025, 0.06, "paving");
  },
  CENSUS_DIRECTORATE_PART_3: t => {
    // Levy Charter: open civic lectern beneath a narrow pointed canopy.
    gantry(t, 0, -0.07, 0.26, 0.28, 0.045);
    t.body.pyramid(0, 0.34, -0.07, 0.34, 0.08, 0.19, "glass");
    t.body.box(0, 0.015, 0.06, 0.25, 0.03, 0.24, "stoneLight");
    t.body.box(0, 0.045, 0.075, 0.06, 0.12, 0.07, "brassDark");
    t.body.box(0, 0.165, 0.075, 0.16, 0.015, 0.1, "glassLight");
    t.glow.box(0, 0.185, 0.075, 0.11, 0.003, 0.07, "aether");
    for (const x of [-0.12, 0.12]) t.body.cylinder(x, 0.02, 0.15, 0.012, 0.018, 0.13, "stoneLight", 6);
  },
  TITANIUM_LEVY_PART_1: t => {
    // Muster Klaxon: three flared horns, conspicuous from both ends.
    t.body.cylinder(0, 0.015, 0, 0.075, 0.13, 0.045, "stoneLight", 8);
    t.body.box(0, 0.06, 0, 0.065, 0.18, 0.09, "iron");
    for (const [y, z] of [[0.22, -0.1], [0.3, 0], [0.22, 0.1]] as const) {
      t.body.pipe(-0.19, y, z, 0.19, y, z, 0.02, "brassDark");
      for (const side of [-1, 1]) {
        t.body.pipe(side * 0.12, y, z, side * 0.23, y, z, 0.055, "brass");
        t.body.pipe(side * 0.23, y, z, side * 0.242, y, z, 0.04, "ironDark");
      }
    }
    ribs(t, 0, 0.02, 0.19, 0.14, 4, 0.055, 0.06);
  },
  TITANIUM_LEVY_PART_2: t => {
    // Titanium Standard: one broad metal banner on a braced ceremonial pole.
    t.body.box(0, 0.015, 0, 0.29, 0.035, 0.21, "stoneLight");
    t.body.box(-0.1, 0.05, 0, 0.018, 0.37, 0.018, "brass");
    t.body.box(0.02, 0.22, 0, 0.23, 0.17, 0.016, "iron");
    t.body.box(0.02, 0.233, 0.011, 0.19, 0.14, 0.008, "stoneLight");
    t.body.gem(0.02, 0.3, 0.025, 0.03, 0.055, "brass");
    t.body.pipe(-0.19, 0.05, 0.065, -0.1, 0.21, 0, 0.009, "iron");
    t.body.gem(-0.1, 0.445, 0, 0.015, 0.03, "brass");
  },
  TITANIUM_LEVY_PART_3: t => {
    // Levy Writ: a armoured authorization press with an overhead magnetic actuator.
    housing(t, 0, -0.15, 0.27, 0.075, 0.075);
    gantry(t, 0, 0.045, 0.23, 0.21, 0.085);
    t.body.box(0, 0.045, 0.07, 0.19, 0.035, 0.18, "brassDark");
    t.body.box(0, 0.08, 0.07, 0.15, 0.006, 0.14, "glassLight");
    t.body.cylinder(0, 0.09, 0.045, 0.014, 0.014, 0.24, "iron", 8);
    for (const y of [0.19, 0.23, 0.27]) band(t, 0, y, 0.045, 0.025);
    t.body.cylinder(0, 0.315, 0.045, 0.06, 0.06, 0.03, "brassDark", 10);
    t.glow.box(0, 0.11, 0.095, 0.08, 0.007, 0.008, "aether");
  }
};

export const buildProjectPart = (t: TownBuilders, kind: DistrictBuildingKind): boolean => {
  const draw = PARTS[kind];
  if (!draw) return false;
  draw(t);
  return true;
};
