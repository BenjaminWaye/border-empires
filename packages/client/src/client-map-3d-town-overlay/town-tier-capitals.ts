import {
  aetherLine,
  beam,
  block,
  blockStorey,
  box,
  cone,
  cottage,
  cyl,
  dome,
  domeOn,
  flare,
  gear,
  gearDeck,
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
import { CITY_LAYOUT, SETTLEMENT_LAYOUT, TOWN_LAYOUT } from "./town-tier-cities.js";
import type { PieceList, TownLayout, TownPiece, TownTier } from "./town-tier-shapes.js";

const GREAT_CITY_LAYOUT_PIECES = (): TownPiece[] => {
  const p: PieceList = [];

  slab(p, 0, 0, 0, { w: 0.78, h: 0.06, color: "stone" });

  // Domed civic complex — imperial government at the heart.
  box(p, 0, 0, 0.06, { w: 0.52, h: 0.3, d: 0.52, color: "stoneLight" });
  slab(p, 0, 0, 0.36, { w: 0.56, h: 0.1, color: "slate" });
  cyl(p, 0, 0, 0.46, { r: 0.24, h: 0.2, color: "stone" });
  dome(p, 0, 0, 0.66, { r: 0.3, color: "slate" });
  gearDeck(p, 0, 0, 0.98, { r: 0.16 });
  orbTopper(p, 0, 0, 1.06);

  // Twin brass towers flanking the dome.
  tower(p, -0.3, 0.22, 0.06, { h: 0.9, r: 0.1, color: "brass", cap: "brassDark" });
  tower(p, 0.3, 0.22, 0.06, { h: 0.9, r: 0.1, color: "brass", cap: "brassDark" });

  // Elevated transit loop around the civic ring.
  beam(p, -0.38, -0.38, 0.38, -0.38, 0.42, { color: "ironDark" });
  beam(p, -0.38, 0.38, 0.38, 0.38, 0.42, { color: "ironDark" });
  beam(p, -0.38, -0.38, -0.38, 0.38, 0.42, { color: "ironDark" });
  beam(p, 0.38, -0.38, 0.38, 0.38, 0.42, { color: "ironDark" });
  aetherLine(p, -0.38, -0.38, 0.38, -0.38, 0.5);
  aetherLine(p, -0.38, 0.38, 0.38, 0.38, 0.5);
  aetherLine(p, -0.38, -0.38, -0.38, 0.38, 0.5);
  aetherLine(p, 0.38, -0.38, 0.38, 0.38, 0.5);
  piston(p, -0.38, -0.38, 0.3, { h: 0.28, color: "ironDark" });
  piston(p, 0.38, -0.38, 0.3, { h: 0.28, color: "ironDark" });
  piston(p, -0.38, 0.38, 0.3, { h: 0.28, color: "ironDark" });
  piston(p, 0.38, 0.38, 0.3, { h: 0.28, color: "ironDark" });
  gear(p, -0.38, -0.38, 0.34, { r: 0.1, color: "brass" });
  gear(p, 0.38, -0.38, 0.34, { r: 0.1, color: "brass" });
  gear(p, -0.38, 0.38, 0.34, { r: 0.1, color: "brass" });
  gear(p, 0.38, 0.38, 0.34, { r: 0.1, color: "brass" });

  // Distinctive skyline landmarks.
  gearSpire(p, -0.34, -0.3, 0.06);
  aetherBeacon(p, 0.36, -0.34, 0.06);
  clockTower(p, 0.34, 0.4, 0.04);

  // Dense imperial districts.
  blockStorey(p, -0.2, -0.36, 0.06, { w: 0.24, floors: 4, color: "stone" });
  blockStorey(p, 0.2, -0.36, 0.06, { w: 0.24, floors: 3, color: "stoneLight" });
  block(p, 0.38, -0.16, 0.06, { w: 0.24, h: 0.6 });
  block(p, -0.36, -0.12, 0.06, { w: 0.24, h: 0.54 });
  block(p, -0.36, 0.2, 0.06, { w: 0.24, h: 0.5 });
  box(p, 0.36, 0.18, 0.06, { w: 0.24, h: 0.46, d: 0.24, color: "stone" });
  // Workshop belt along the loop.
  workshop(p, 0.36, -0.2, 0.06);

  // Four cross-city pipe mains.
  pipe(p, -0.46, -0.34, 0.4, 0.34, 0.24, { color: "brass" });
  pipe(p, -0.42, 0.36, 0.4, -0.36, 0.24, { color: "brass" });
  pipe(p, -0.2, -0.46, 0.2, 0.46, 0.3, { color: "brassDark" });
  pipe(p, -0.24, -0.42, 0.24, 0.42, 0.3, { color: "brass" });

  // Plaza gear + lamp ring.
  gearWall(p, -0.24, 0.06, 0.06, { w: 0.3, h: 0.2, color: "iron", gearColor: "brassLight" });
  lamp(p, -0.44, -0.18, 0.06, { h: 0.3 });
  lamp(p, 0.44, -0.16, 0.06, { h: 0.3 });
  lamp(p, -0.18, 0.44, 0.06, { h: 0.3 });
  lamp(p, 0.18, 0.44, 0.06, { h: 0.3 });
  lamp(p, 0.02, -0.48, 0.06, { h: 0.3 });

  // Rim tower at the loop intersection.
  tower(p, -0.24, -0.24, 0.06, { h: 0.72, r: 0.08, color: "brassDark", cap: "brass" });

  return p;
};

const gearSpire = (p: PieceList, x: number, z: number, y: number): void => {
  needle(p, x, z, y, { h: 1.16, color: "brass" });
  gear(p, x, z, y + 1.2, { r: 0.1, color: "brassLight" });
  orbTopper(p, x, z, y + 1.26);
};

const aetherBeacon = (p: PieceList, x: number, z: number, y: number): void => {
  cyl(p, x, z, y, { r: 0.09, h: 0.86, color: "ironDark" });
  flare(p, x, z, y + 0.86, { r: 0.14, h: 0.24, color: "brassLight" });
  orbTopper(p, x, z, y + 1.16);
};

const clockTower = (p: PieceList, x: number, z: number, y: number): void => {
  box(p, x, z, y, { w: 0.26, h: 0.5, d: 0.26, color: "stoneLight" });
  slab(p, x, z, y + 0.5, { w: 0.3, h: 0.08, color: "slate" });
  cyl(p, x, z, y + 0.58, { r: 0.06, h: 0.3, color: "brass" });
  cone(p, x, z, y + 0.88, { r: 0.1, h: 0.24, color: "brassDark" });
  gear(p, x + 0.14, z, y + 0.72, { r: 0.09, color: "brassLight" });
  orbTopper(p, x, z, y + 1.1);
};

const METROPOLIS_LAYOUT_PIECES = (): TownPiece[] => {
  const p: PieceList = [];

  slab(p, 0, 0, 0, { w: 0.92, h: 0.06, color: "stone" });

  // The Monument — a colossal three-part brass wonder rising over everything.
  monument(p);

  // Flanking pylons capped with aether lamps.
  flare(p, -0.32, 0.24, 0.06, { r: 0.18, h: 0.5, color: "brass" });
  flare(p, 0.32, -0.24, 0.06, { r: 0.16, h: 0.46, color: "brassDark" });
  cyl(p, -0.32, 0.24, 0.56, { r: 0.12, h: 0.4, color: "brass" });
  cyl(p, 0.32, -0.24, 0.52, { r: 0.11, h: 0.36, color: "brassDark" });
  gear(p, -0.32, 0.24, 1.0, { r: 0.12, color: "brassLight" });
  gear(p, 0.32, -0.24, 0.92, { r: 0.11, color: "brassLight" });
  domeOn(p, -0.32, 0.24, 1.04, { r: 0.12, color: "ironDark" });
  domeOn(p, 0.32, -0.24, 0.96, { r: 0.11, color: "ironDark" });
  lamp(p, -0.32, 0.24, 1.06, { h: 0.1 });
  lamp(p, 0.32, -0.24, 0.98, { h: 0.1 });

  // Four diagonal districts.
  district(p, 0.4, 0.4);
  district(p, -0.4, 0.4);
  district(p, 0.4, -0.4);
  district(p, -0.4, -0.4);

  // Aether conduits running the avenues.
  aetherLine(p, 0, 0, 0.42, 0.42, 0.16);
  aetherLine(p, 0, 0, -0.42, 0.42, 0.16);
  aetherLine(p, 0, 0, 0.42, -0.42, 0.16);
  aetherLine(p, 0, 0, -0.42, -0.42, 0.16);

  // Elevated transit bridges along the cardinal axes.
  beam(p, -0.12, 0, 0.3, 0, 0.5, { color: "ironDark" });
  aetherLine(p, -0.12, 0, 0.3, 0, 0.58);
  beam(p, 0.12, -0.3, 0.12, 0.3, 0.5, { color: "ironDark" });
  beam(p, 0, -0.3, 0, 0.26, 0.5, { color: "ironDark" });
  aetherLine(p, 0, -0.3, 0, 0.26, 0.58);
  beam(p, -0.3, 0.12, 0.3, 0.12, 0.5, { color: "ironDark" });
  aetherLine(p, -0.3, 0.12, 0.12, 0.12, 0.58);
  piston(p, -0.3, 0.12, 0.4, { h: 0.3, color: "ironDark" });
  piston(p, 0.12, 0.3, 0.4, { h: 0.3, color: "ironDark" });

  // Edge spokes and rim towers.
  pipe(p, 0.06, -0.44, 0.06, 0.44, 0.2, { color: "brass" });
  pipe(p, -0.06, -0.44, -0.06, 0.44, 0.2, { color: "brass" });
  tower(p, 0.44, 0.04, 0.06, { h: 0.6, r: 0.06, color: "brassDark", cap: "brassLight" });
  tower(p, -0.44, -0.04, 0.06, { h: 0.6, r: 0.06, color: "brassDark", cap: "brassLight" });
  cottage(p, 0.36, -0.3, 0.06);
  gearWall(p, -0.4, 0.28, 0.06, { w: 0.26, h: 0.18, color: "iron", gearColor: "brassLight" });
  lamp(p, -0.3, -0.4, 0.06, { h: 0.3 });
  lamp(p, 0.3, 0.4, 0.06, { h: 0.3 });
  lamp(p, 0.4, 0.32, 0.06, { h: 0.3 });
  lamp(p, -0.4, -0.32, 0.06, { h: 0.3 });

  return p;
};

const monument = (p: PieceList): void => {
  // Broad stepped base.
  slab(p, 0, 0, 0.06, { w: 0.7, h: 0.08, color: "stone" });
  dome(p, 0, 0, 0.16, { r: 0.34, color: "brassDark" });
  slab(p, 0, 0, 0.44, { w: 0.5, h: 0.08, color: "slate" });
  dome(p, 0, 0, 0.52, { r: 0.24, color: "brass" });

  // Three towering stepped shafts, each flaring brass.
  flare(p, 0, 0, 0.64, { r: 0.26, h: 0.42, color: "brass" });
  gearDeck(p, 0, 0, 0.88, { r: 0.18 });
  flare(p, 0, 0, 0.94, { r: 0.18, h: 0.36, color: "brassLight" });
  gearDeck(p, 0, 0, 1.12, { r: 0.14 });
  flare(p, 0, 0, 1.18, { r: 0.15, h: 0.34, color: "brass" });
  gearDeck(p, 0, 0, 1.36, { r: 0.12 });
  needle(p, 0, 0, 1.36, { h: 0.56, color: "brassLight" });
  dome(p, 0, 0, 1.88, { r: 0.1, color: "slate" });
  orbTopper(p, 0, 0, 2.04);
};

const district = (p: PieceList, dxr: number, dzr: number): void => {
  // A small imperial ward: tenements, workshop, spire and lamps.
  blockStorey(p, dxr * 0.7, dzr * 0.64, 0.06, { w: 0.24, floors: 3, color: "stone" });
  block(p, dxr * 0.62, dzr * 0.34, 0.06, { w: 0.26, h: 0.5 });
  block(p, dxr * 0.36, dzr * 0.72, 0.06, { w: 0.24, h: 0.44 });
  box(p, dxr * 0.4, dzr * 0.4, 0.06, { w: 0.3, h: 0.3, d: 0.3, color: "iron" });
  domeOn(p, dxr * 0.44, dzr * 0.24, 0.06, { r: 0.15, color: "ironDark" });
  tower(p, dxr * 0.26, dzr * 0.5, 0.06, { h: 0.56, r: 0.07, color: "brass", cap: "brassDark" });
  gear(p, dxr * 0.62, dzr * 0.44, 0.32, { r: 0.09, color: "brassLight" });
  aetherLine(p, dxr * 0.24, dzr * 0.24, dxr * 0.6, dzr * 0.6, 0.14);
  lamp(p, dxr * 0.5, dzr * 0.44, 0.06, { h: 0.26 });
  lamp(p, dxr * 0.42, dzr * 0.8, 0.06, { h: 0.26 });
};

export const GREAT_CITY_LAYOUT: TownLayout = {
  name: "Imperial Powerhouse",
  pieces: GREAT_CITY_LAYOUT_PIECES()
};
export const METROPOLIS_LAYOUT: TownLayout = {
  name: "Wonder of the World",
  pieces: METROPOLIS_LAYOUT_PIECES()
};

export const TOWN_LAYOUTS: Readonly<Record<TownTier, TownLayout>> = {
  SETTLEMENT: SETTLEMENT_LAYOUT,
  TOWN: TOWN_LAYOUT,
  CITY: CITY_LAYOUT,
  GREAT_CITY: GREAT_CITY_LAYOUT,
  METROPOLIS: METROPOLIS_LAYOUT
};