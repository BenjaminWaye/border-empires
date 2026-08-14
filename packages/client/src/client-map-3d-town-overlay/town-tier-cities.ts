import {
  aetherLine,
  beam,
  block,
  blockStorey,
  box,
  cone,
  cottage,
  crane,
  cyl,
  dome,
  domeOn,
  flare,
  gear,
  gearWall,
  lamp,
  needle,
  orbTopper,
  pipe,
  piston,
  slab,
  tower,
  workshop
} from "./town-tier-builders.js";
import type { PieceList, TownLayout, TownPiece } from "./town-tier-shapes.js";

const SETTLEMENT_LAYOUT_PIECES = (): TownPiece[] => {
  const p: PieceList = [];

  slab(p, 0, 0, 0, { w: 0.56, h: 0.06, color: "stone" });

  // Central aether workshop / pump house — the settlement's main silhouette.
  cyl(p, 0, 0, 0.06, { r: 0.2, h: 0.42, color: "ironDark" });
  cyl(p, 0, 0, 0.48, { r: 0.16, h: 0.14, color: "brass" });
  box(p, 0.16, 0.05, 0.62, { w: 0.16, h: 0.18, d: 0.16, color: "woodLight" });
  gear(p, 0.1, 0.18, 0.5, { r: 0.13, color: "brass" });
  piston(p, -0.12, 0.02, 0.62, { h: 0.3, color: "brassLight" });
  orbTopper(p, 0, 0, 0.72);
  dome(p, -0.05, -0.05, 0.58, { r: 0.09, color: "brass" });

  // Pressure tanks and boilers.
  cyl(p, 0.26, 0.1, 0.06, { r: 0.09, h: 0.16, color: "brassDark" });
  cyl(p, -0.24, 0.08, 0.06, { r: 0.09, h: 0.16, color: "brassDark" });
  domeOn(p, -0.19, 0.24, 0.06, { r: 0.12, color: "stone" });

  // Timber workshops.
  workshop(p, 0.18, -0.26, 0.06, { w: 0.3, h: 0.28, body: "wood" });
  workshop(p, -0.26, -0.16, 0.06, { w: 0.26, h: 0.24, body: "woodLight" });

  // Three compact frontier homesteads.
  cottage(p, -0.3, 0.26, 0.06);
  cottage(p, 0.28, 0.28, 0.06, { roofColor: "slate" });
  cottage(p, 0.02, 0.18, 0.06);

  // Pipe runs tying the workshop district together.
  pipe(p, 0.05, -0.05, 0.18, -0.26, 0.18, { color: "brass" });
  pipe(p, -0.05, 0.05, -0.26, -0.16, 0.18, { color: "brassDark" });
  pipe(p, 0.28, 0.1, 0.02, 0.18, 0.16, { color: "brass" });

  // Warm lamps along the two approaches.
  lamp(p, -0.34, -0.02, 0.06);
  lamp(p, 0.34, 0.02, 0.06);

  return p;
};

const TOWN_LAYOUT_PIECES = (): TownPiece[] => {
  const p: PieceList = [];

  slab(p, 0, 0, 0, { w: 0.62, h: 0.06, color: "stone" });

  // Clockwork assembly hall — the civic heart of the community.
  box(p, 0, 0, 0.06, { w: 0.4, h: 0.3, d: 0.4, color: "stoneLight" });
  slab(p, 0, 0, 0.36, { w: 0.44, h: 0.08, color: "slate" });
  cyl(p, 0, 0, 0.44, { r: 0.13, h: 0.24, color: "iron" });
  gearWall(p, 0, 0.22, 0.06, { w: 0.4, h: 0.22, color: "ironDark", gearColor: "brassLight" });
  gearWall(p, 0.22, 0, 0.06, { w: 0.4, h: 0.22, color: "ironDark", gearColor: "brassLight" });
  cone(p, 0, 0, 0.68, { r: 0.15, h: 0.26, color: "slate" });
  orbTopper(p, 0, 0, 0.98);

  // Civic blocks.
  block(p, -0.32, 0.18, 0.06, { w: 0.3, h: 0.42 });
  block(p, 0.32, -0.1, 0.06, { w: 0.28, h: 0.4 });

  // Workshops + industrial sheds.
  workshop(p, -0.3, -0.24, 0.06, { w: 0.3, h: 0.32, body: "stone" });
  box(p, 0.28, 0.26, 0.06, { w: 0.3, h: 0.24, d: 0.3, color: "woodLight" });
  box(p, -0.08, -0.3, 0.06, { w: 0.28, h: 0.22, d: 0.28, color: "wood" });

  // Homesteads.
  cottage(p, -0.34, -0.02, 0.06, { roofColor: "slate" });
  cottage(p, 0.2, -0.18, 0.06);
  cottage(p, -0.18, 0.34, 0.06, { roofColor: "slate" });
  cottage(p, 0.36, 0.12, 0.06);
  cottage(p, -0.02, 0.24, 0.06, { roofColor: "slate" });

  // A mechanical lifting crane on the dockside.
  crane(p, -0.08, 0.3, 0.06, { h: 0.56, reach: 0.26 });

  // Elevated walkway linking the hall roof to a storehouse.
  beam(p, -0.05, 0.15, -0.32, 0.18, 0.5, { color: "woodLight" });
  piston(p, -0.32, 0.18, 0.4, { h: 0.3, color: "ironDark" });
  piston(p, -0.05, 0.15, 0.4, { h: 0.62, color: "ironDark" });

  // Brass pipe network.
  pipe(p, -0.12, 0.08, -0.32, -0.2, 0.2, { color: "brass" });
  pipe(p, 0.1, -0.04, 0.28, -0.16, 0.2, { color: "brassDark" });
  pipe(p, 0, 0.14, 0.02, 0.3, 0.24, { color: "brass" });

  // Street lamps.
  lamp(p, 0.18, 0.34, 0.06, { h: 0.3 });
  lamp(p, -0.36, 0.06, 0.06, { h: 0.3 });
  lamp(p, 0.16, -0.34, 0.06, { h: 0.3 });
  lamp(p, -0.28, -0.3, 0.06, { h: 0.3 });

  return p;
};

const CITY_LAYOUT_PIECES = (): TownPiece[] => {
  const p: PieceList = [];

  slab(p, 0, 0, 0, { w: 0.7, h: 0.06, color: "stone" });

  // Central civic machinery — the city's aether engine.
  box(p, 0, 0, 0.06, { w: 0.46, h: 0.26, d: 0.46, color: "stoneLight" });
  slab(p, 0, 0, 0.32, { w: 0.5, h: 0.1, color: "slate" });
  flare(p, 0, 0, 0.42, { r: 0.22, h: 0.34, color: "brass" });
  flare(p, 0, 0, 0.76, { r: 0.17, h: 0.3, color: "brassLight" });
  cyl(p, 0, 0, 1.06, { r: 0.12, h: 0.18, color: "ironDark" });
  gearWall(p, 0, 0.24, 0.32, { w: 0.34, h: 0.2, color: "ironDark", gearColor: "brass" });
  gearWall(p, 0.24, 0, 0.32, { w: 0.34, h: 0.2, color: "ironDark", gearColor: "brass" });
  gear(p, 0, 0, 1.28, { r: 0.09, color: "brassLight" });

  // Factories with chimneys.
  const factory = (fx: number, fz: number): void => {
    box(p, fx, fz, 0.06, { w: 0.32, h: 0.34, d: 0.32, color: "iron" });
    slab(p, fx, fz, 0.4, { w: 0.36, h: 0.06, color: "slate" });
    cyl(p, fx - 0.1, fz - 0.1, 0.4, { r: 0.04, h: 0.4, color: "brassDark" });
    cone(p, fx - 0.1, fz - 0.1, 0.8, { r: 0.06, h: 0.1, color: "ironDark" });
    piston(p, fx + 0.12, fz + 0.1, 0.42, { h: 0.24, color: "brass" });
  };
  factory(-0.34, -0.3);
  factory(0.36, -0.32);
  factory(-0.36, 0.32);

  // Brass observation towers.
  tower(p, 0.34, 0.34, 0.06, { h: 0.7, r: 0.09, color: "brass", cap: "brassDark" });
  tower(p, -0.36, -0.04, 0.06, { h: 0.62, r: 0.08, color: "brassLight", cap: "brass" });
  tower(p, 0.14, -0.36, 0.06, { h: 0.66, r: 0.09, color: "brassDark", cap: "slate" });

  // Multi-story tenements.
  blockStorey(p, 0.32, -0.14, 0.06, { w: 0.3, floors: 3 });
  blockStorey(p, -0.2, -0.24, 0.06, { w: 0.28, floors: 3 });
  blockStorey(p, -0.18, 0.2, 0.06, { w: 0.3, floors: 2, color: "stoneLight" });
  block(p, 0.14, 0.16, 0.06, { w: 0.3, h: 0.5 });

  // Aether needle mast.
  needle(p, 0.2, -0.06, 0.06, { h: 1.1, color: "brass" });
  orbTopper(p, 0.2, -0.06, 1.16);

  // Elevated bridges between districts.
  beam(p, -0.3, 0.02, 0.26, 0.02, 0.52, { color: "ironDark" });
  aetherLine(p, -0.3, 0.02, 0.26, 0.02, 0.6);
  beam(p, 0.02, -0.3, 0.02, 0.26, 0.52, { color: "ironDark" });
  aetherLine(p, 0.02, -0.3, 0.02, 0.26, 0.6);
  piston(p, -0.3, 0.02, 0.42, { h: 0.3, color: "ironDark" });
  piston(p, 0.26, 0.02, 0.42, { h: 0.44, color: "ironDark" });

  // Steam vents.
  const vent = (vx: number, vz: number): void => {
    cyl(p, vx, vz, 0.06, { r: 0.07, h: 0.34, color: "slateLight" });
    gear(p, vx, vz, 0.46, { r: 0.09, color: "brass" });
    dome(p, vx, vz, 0.44, { r: 0.05, color: "brassDark" });
  };
  vent(0.32, 0.16);
  vent(-0.3, 0.08);
  vent(0.06, 0.34);

  // Cross-city pipe mains.
  pipe(p, -0.36, 0.04, 0.36, 0.04, 0.18, { color: "brass" });
  pipe(p, 0.04, -0.36, 0.04, 0.36, 0.18, { color: "brass" });
  pipe(p, -0.3, -0.2, 0.28, 0.2, 0.14, { color: "brassDark" });

  // Lamps + mobile cranes.
  lamp(p, 0.4, -0.2, 0.06, { h: 0.32 });
  lamp(p, -0.4, 0.18, 0.06, { h: 0.32 });
  lamp(p, 0.2, 0.4, 0.06, { h: 0.32 });
  lamp(p, -0.2, -0.4, 0.06, { h: 0.32 });
  lamp(p, -0.06, 0.44, 0.06, { h: 0.32 });
  crane(p, 0.06, -0.16, 0.06, { h: 0.62, reach: 0.3 });
  crane(p, -0.18, 0.44, 0, { h: 0.6, reach: 0.28 });

  return p;
};

export const SETTLEMENT_LAYOUT: TownLayout = {
  name: "Frontier Spark",
  pieces: SETTLEMENT_LAYOUT_PIECES()
};
export const TOWN_LAYOUT: TownLayout = {
  name: "Growing Industry",
  pieces: TOWN_LAYOUT_PIECES()
};
export const CITY_LAYOUT: TownLayout = {
  name: "Industrial Metropolis",
  pieces: CITY_LAYOUT_PIECES()
};