import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry
} from "three";
import type { StructurePieceBuilder } from "./client-map-3d-structure-builder.js";

export type CivicStructureKind =
  | "CARAVANARY"
  | "CLEARING_HOUSE"
  | "CUSTOMS_HOUSE"
  | "EXCHANGE_HOUSE"
  | "GARRISON_HALL"
  | "GOVERNORS_OFFICE"
  | "CENSUS_HALL";

export const CIVIC_STRUCTURE_KINDS: ReadonlySet<CivicStructureKind> = new Set([
  "CARAVANARY", "CLEARING_HOUSE", "CUSTOMS_HOUSE", "EXCHANGE_HOUSE", "GARRISON_HALL", "GOVERNORS_OFFICE",
  "CENSUS_HALL"
]);

export type CivicStructureLayout = (sceneX: number, surfaceY: number, sceneZ: number) => void;

export type CivicHandle = {
  readonly layouts: Record<CivicStructureKind, CivicStructureLayout>;
};

export const registerCivicStructures = (
  builder: StructurePieceBuilder
): CivicHandle => {
  const C = builder.maxTiles;

  // ─── Materials ──────────────────────────────────────────────────────
  // Caravanary (caravanserai): a fortified roadside inn for merchant
  // caravans. Square stone courtyard with corner watchtowers, a pair
  // of gate towers flanking the front entrance, a central well, and
  // stacked cargo against the inner walls. No tents — caravanserais
  // gave travelers built rooms in the perimeter, not pitched canvas.
  const caravanaryStoneMaterial = new MeshStandardMaterial({ color: "#c9a972", roughness: 0.92, metalness: 0, flatShading: true });
  const caravanaryTowerMaterial = new MeshStandardMaterial({ color: "#b8986a", roughness: 0.92, metalness: 0, flatShading: true });
  const caravanaryTowerCapMaterial = new MeshStandardMaterial({ color: "#7a3026", roughness: 0.88, metalness: 0, flatShading: true });
  const caravanaryWellMaterial = new MeshStandardMaterial({ color: "#7a6a52", roughness: 0.92, metalness: 0, flatShading: true });
  const caravanaryCargoMaterial = new MeshStandardMaterial({ color: "#6a4a30", roughness: 0.9, metalness: 0, flatShading: true });
  const caravanarySackMaterial = new MeshStandardMaterial({ color: "#a5783e", roughness: 0.92, metalness: 0, flatShading: true });
  const customsWallMaterial = new MeshStandardMaterial({ color: "#dccab0", roughness: 0.9, metalness: 0, flatShading: true });
  const customsRoofMaterial = new MeshStandardMaterial({ color: "#7a3026", roughness: 0.88, metalness: 0, flatShading: true });
  const customsGateRedMaterial = new MeshStandardMaterial({ color: "#c63a2c", roughness: 0.84, metalness: 0, flatShading: true });
  const customsGateWhiteMaterial = new MeshStandardMaterial({ color: "#ece2cf", roughness: 0.84, metalness: 0, flatShading: true });
  const customsBollardMaterial = new MeshStandardMaterial({ color: "#3a3530", roughness: 0.78, metalness: 0.2, flatShading: true });
  const exchangeHouseWallMaterial = new MeshStandardMaterial({ color: "#d8cca8", roughness: 0.88, metalness: 0, flatShading: true });
  const exchangeHouseTrimMaterial = new MeshStandardMaterial({ color: "#f0e6d0", roughness: 0.86, metalness: 0, flatShading: true });
  const exchangeHouseSignMaterial = new MeshStandardMaterial({ color: "#e0b850", roughness: 0.4, metalness: 0.55, flatShading: true, emissive: "#7a5818", emissiveIntensity: 0.2 });
  const clearingHouseWallMaterial = new MeshStandardMaterial({ color: "#d6cfbd", roughness: 0.86, metalness: 0, flatShading: true });
  const clearingHouseRoofMaterial = new MeshStandardMaterial({ color: "#587080", roughness: 0.74, metalness: 0.08, flatShading: true });
  const clearingHouseTrimMaterial = new MeshStandardMaterial({ color: "#efe3c3", roughness: 0.82, metalness: 0, flatShading: true });
  const clearingHouseLedgerMaterial = new MeshStandardMaterial({ color: "#2f3f4f", roughness: 0.8, metalness: 0.12, flatShading: true });
  const clearingHouseSealMaterial = new MeshStandardMaterial({ color: "#d7b756", roughness: 0.42, metalness: 0.45, flatShading: true, emissive: "#6f5517", emissiveIntensity: 0.16 });
  const clearingHouseScaleMaterial = new MeshStandardMaterial({ color: "#e5c35f", roughness: 0.38, metalness: 0.5, flatShading: true, emissive: "#70551a", emissiveIntensity: 0.14 });
  const garrisonWallMaterial = new MeshStandardMaterial({ color: "#5e6a52", roughness: 0.9, metalness: 0, flatShading: true });
  const garrisonRoofMaterial = new MeshStandardMaterial({ color: "#3a342a", roughness: 0.92, metalness: 0, flatShading: true });
  const garrisonSandbagMaterial = new MeshStandardMaterial({ color: "#a89878", roughness: 0.94, metalness: 0, flatShading: true });
  const garrisonPoleMaterial = new MeshStandardMaterial({ color: "#3a3530", roughness: 0.78, metalness: 0.18, flatShading: true });
  const garrisonBannerMaterial = new MeshStandardMaterial({ color: "#b22d2a", roughness: 0.82, metalness: 0, flatShading: true });
  const governorWallMaterial = new MeshStandardMaterial({ color: "#cdb78a", roughness: 0.88, metalness: 0, flatShading: true });
  const governorRoofMaterial = new MeshStandardMaterial({ color: "#9c4030", roughness: 0.88, metalness: 0, flatShading: true });
  const governorCupolaMaterial = new MeshStandardMaterial({ color: "#e8dcc2", roughness: 0.88, metalness: 0, flatShading: true });
  const governorFlagMaterial = new MeshStandardMaterial({ color: "#c83a2a", roughness: 0.82, metalness: 0, flatShading: true });
  // Census Hall — a steampunk "tabulating office": dark iron-grey body
  // under an oxidized-copper dome, with a brass tally drum punched into
  // the facade, twin brass ear-trumpet intake horns flanking the
  // entrance, riveted brass banding, and a gearbox housing on the side
  // wall (the actual rotating gears + chimney steam live in the
  // companion client-map-3d-census-hall-fx.ts animated layer; this
  // static layout just builds their mounting points).
  const censusWallMaterial = new MeshStandardMaterial({ color: "#3c3a3e", roughness: 0.72, metalness: 0.25, flatShading: true });
  const censusDomeMaterial = new MeshStandardMaterial({ color: "#4f8f78", roughness: 0.5, metalness: 0.45, flatShading: true });
  const censusBrassMaterial = new MeshStandardMaterial({ color: "#c8943f", roughness: 0.35, metalness: 0.75, flatShading: true });
  const censusBrassDarkMaterial = new MeshStandardMaterial({ color: "#8a6526", roughness: 0.4, metalness: 0.7, flatShading: true });
  const censusGlassMaterial = new MeshStandardMaterial({ color: "#0e1f24", roughness: 0.25, metalness: 0.1, flatShading: true, emissive: "#1f5a52", emissiveIntensity: 0.35 });
  const censusStepMaterial = new MeshStandardMaterial({ color: "#6a6660", roughness: 0.88, metalness: 0, flatShading: true });
  const censusGearboxMaterial = new MeshStandardMaterial({ color: "#2c2a2c", roughness: 0.6, metalness: 0.4, flatShading: true });

  // ─── Geometries ─────────────────────────────────────────────────────
  // Walls taller and slightly thicker than v1 so the perimeter reads
  // as defensible stone, not garden fencing.
  const caravanaryWallGeo = new BoxGeometry(0.32, 0.14, 0.035);
  // 4 corner watchtowers (cylinders) + 4 conical caps so the silhouette
  // reads as fortified from any orbit angle.
  const caravanaryTowerGeo = new CylinderGeometry(0.045, 0.05, 0.20, 8);
  const caravanaryTowerCapGeo = new ConeGeometry(0.052, 0.05, 8);
  const caravanaryWellGeo = new CylinderGeometry(0.04, 0.045, 0.06, 10);
  // Cargo crates and a single grain sack inside the courtyard, stacked
  // along the back wall.
  const caravanaryCargoGeo = new BoxGeometry(0.05, 0.05, 0.07);
  const caravanarySackGeo = new BoxGeometry(0.055, 0.045, 0.05);
  const customsBodyGeo = new BoxGeometry(0.20, 0.13, 0.16);
  const customsRoofGeo = new ConeGeometry(0.15, 0.08, 4);
  const customsGatePoleGeo = new CylinderGeometry(0.011, 0.011, 0.14, 6);
  const customsGateArmGeo = new BoxGeometry(0.22, 0.014, 0.014);
  const customsGateStripeGeo = new BoxGeometry(0.055, 0.016, 0.016);
  const customsBollardGeo = new CylinderGeometry(0.016, 0.018, 0.05, 6);
  const exchangeHouseStepGeo = new BoxGeometry(0.26, 0.04, 0.18);
  const exchangeHouseBodyGeo = new BoxGeometry(0.22, 0.12, 0.16);
  const exchangeHouseRoofGeo = new ConeGeometry(0.16, 0.08, 4);
  const exchangeHouseColumnGeo = new CylinderGeometry(0.018, 0.018, 0.12, 8);
  const exchangeHouseSignGeo = new OctahedronGeometry(0.025, 0);
  const clearingHouseBaseGeo = new BoxGeometry(0.40, 0.055, 0.26);
  const clearingHouseBodyGeo = new BoxGeometry(0.33, 0.155, 0.20);
  const clearingHouseWingGeo = new BoxGeometry(0.11, 0.12, 0.16);
  const clearingHouseRoofGeo = new BoxGeometry(0.38, 0.05, 0.24);
  const clearingHouseColumnGeo = new CylinderGeometry(0.016, 0.018, 0.155, 8);
  const clearingHouseLedgerGeo = new BoxGeometry(0.13, 0.026, 0.075);
  const clearingHouseSealGeo = new CylinderGeometry(0.038, 0.038, 0.012, 16);
  const clearingHouseScalePoleGeo = new CylinderGeometry(0.006, 0.006, 0.18, 6);
  const clearingHouseScaleBeamGeo = new BoxGeometry(0.18, 0.01, 0.01);
  const clearingHouseScalePanGeo = new CylinderGeometry(0.028, 0.035, 0.012, 10);
  const garrisonBodyGeo = new BoxGeometry(0.34, 0.13, 0.18);
  const garrisonRoofGeo = new ConeGeometry(0.22, 0.10, 4);
  const garrisonSandbagGeo = new BoxGeometry(0.07, 0.035, 0.035);
  const garrisonPoleGeo = new CylinderGeometry(0.007, 0.007, 0.22, 5);
  const garrisonBannerGeo = new BoxGeometry(0.07, 0.05, 0.004);
  const governorStepGeo = new BoxGeometry(0.32, 0.04, 0.16);
  const governorBodyGeo = new BoxGeometry(0.28, 0.14, 0.20);
  const governorRoofGeo = new ConeGeometry(0.22, 0.10, 4);
  const governorCupolaGeo = new BoxGeometry(0.07, 0.08, 0.07);
  const governorCupolaRoofGeo = new ConeGeometry(0.055, 0.05, 4);
  const governorFlagGeo = new BoxGeometry(0.05, 0.035, 0.004);
  const censusStepGeo = new BoxGeometry(0.30, 0.035, 0.16);
  const censusBodyGeo = new BoxGeometry(0.26, 0.18, 0.20);
  // Half-dome, same construction as the observatory dome (clipped sphere).
  const censusDomeGeo = new SphereGeometry(0.135, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const censusDomeRingGeo = new CylinderGeometry(0.14, 0.145, 0.03, 16);
  const censusFinialPoleGeo = new CylinderGeometry(0.008, 0.008, 0.10, 6);
  const censusFinialCapGeo = new OctahedronGeometry(0.028, 0);
  // Tally drum: a brass cylinder embedded sideways into the front
  // facade, like a printing-press/odometer drum reading out the census.
  const censusDrumGeo = new CylinderGeometry(0.075, 0.075, 0.10, 14);
  const censusDrumRingGeo = new CylinderGeometry(0.082, 0.082, 0.012, 14);
  const censusPortholeRimGeo = new CylinderGeometry(0.032, 0.032, 0.018, 12);
  const censusPortholeGlassGeo = new CylinderGeometry(0.024, 0.024, 0.02, 12);
  // Ear-trumpet intake horns flanking the steps — flared brass cones,
  // the building's whimsical "ear to the population" detail.
  const censusHornGeo = new ConeGeometry(0.05, 0.11, 10, 1, true);
  const censusHornBellGeo = new CylinderGeometry(0.05, 0.05, 0.012, 10);
  const censusBandGeo = new BoxGeometry(0.27, 0.018, 0.018);
  // Side gearbox housing — static mounting block; the visible rotating
  // gears are layered on top of it by client-map-3d-census-hall-fx.ts.
  const censusGearboxGeo = new BoxGeometry(0.07, 0.10, 0.05);
  const censusChimneyGeo = new CylinderGeometry(0.022, 0.026, 0.16, 8);
  const censusChimneyCapGeo = new CylinderGeometry(0.030, 0.030, 0.02, 8);

  // ─── Slots ─────────────────────────────────────────────────────────
  builder.makeSlot("caravanaryWall", caravanaryWallGeo, caravanaryStoneMaterial, C * 4);
  builder.makeSlot("caravanaryTower", caravanaryTowerGeo, caravanaryTowerMaterial, C * 4);
  builder.makeSlot("caravanaryTowerCap", caravanaryTowerCapGeo, caravanaryTowerCapMaterial, C * 4);
  builder.makeSlot("caravanaryWell", caravanaryWellGeo, caravanaryWellMaterial, C);
  builder.makeSlot("caravanaryCargo", caravanaryCargoGeo, caravanaryCargoMaterial, C * 3);
  builder.makeSlot("caravanarySack", caravanarySackGeo, caravanarySackMaterial, C * 2);
  builder.makeSlot("customsBody", customsBodyGeo, customsWallMaterial, C);
  builder.makeSlot("customsRoof", customsRoofGeo, customsRoofMaterial, C);
  builder.makeSlot("customsGatePole", customsGatePoleGeo, customsBollardMaterial, C);
  builder.makeSlot("customsGateArm", customsGateArmGeo, customsGateRedMaterial, C);
  builder.makeSlot("customsGateStripe", customsGateStripeGeo, customsGateWhiteMaterial, C);
  builder.makeSlot("customsBollard", customsBollardGeo, customsBollardMaterial, C * 2);
  builder.makeSlot("exchangeHouseStep", exchangeHouseStepGeo, exchangeHouseTrimMaterial, C);
  builder.makeSlot("exchangeHouseBody", exchangeHouseBodyGeo, exchangeHouseWallMaterial, C);
  builder.makeSlot("exchangeHouseRoof", exchangeHouseRoofGeo, exchangeHouseTrimMaterial, C);
  builder.makeSlot("exchangeHouseColumn", exchangeHouseColumnGeo, exchangeHouseTrimMaterial, C * 2);
  builder.makeSlot("exchangeHouseSign", exchangeHouseSignGeo, exchangeHouseSignMaterial, C);
  builder.makeSlot("clearingHouseBase", clearingHouseBaseGeo, clearingHouseTrimMaterial, C);
  builder.makeSlot("clearingHouseBody", clearingHouseBodyGeo, clearingHouseWallMaterial, C);
  builder.makeSlot("clearingHouseWing", clearingHouseWingGeo, clearingHouseWallMaterial, C * 2);
  builder.makeSlot("clearingHouseRoof", clearingHouseRoofGeo, clearingHouseRoofMaterial, C);
  builder.makeSlot("clearingHouseColumn", clearingHouseColumnGeo, clearingHouseTrimMaterial, C * 4);
  builder.makeSlot("clearingHouseLedger", clearingHouseLedgerGeo, clearingHouseLedgerMaterial, C * 2);
  builder.makeSlot("clearingHouseSeal", clearingHouseSealGeo, clearingHouseSealMaterial, C);
  builder.makeSlot("clearingHouseScalePole", clearingHouseScalePoleGeo, clearingHouseScaleMaterial, C);
  builder.makeSlot("clearingHouseScaleBeam", clearingHouseScaleBeamGeo, clearingHouseScaleMaterial, C);
  builder.makeSlot("clearingHouseScalePan", clearingHouseScalePanGeo, clearingHouseScaleMaterial, C * 2);
  builder.makeSlot("garrisonBody", garrisonBodyGeo, garrisonWallMaterial, C);
  builder.makeSlot("garrisonRoof", garrisonRoofGeo, garrisonRoofMaterial, C);
  builder.makeSlot("garrisonSandbag", garrisonSandbagGeo, garrisonSandbagMaterial, C * 3);
  builder.makeSlot("garrisonPole", garrisonPoleGeo, garrisonPoleMaterial, C);
  builder.makeSlot("garrisonBanner", garrisonBannerGeo, garrisonBannerMaterial, C);
  builder.makeSlot("governorStep", governorStepGeo, governorCupolaMaterial, C);
  builder.makeSlot("governorBody", governorBodyGeo, governorWallMaterial, C);
  builder.makeSlot("governorRoof", governorRoofGeo, governorRoofMaterial, C);
  builder.makeSlot("governorCupola", governorCupolaGeo, governorCupolaMaterial, C);
  builder.makeSlot("governorCupolaRoof", governorCupolaRoofGeo, governorRoofMaterial, C);
  builder.makeSlot("governorFlag", governorFlagGeo, governorFlagMaterial, C);
  builder.makeSlot("censusStep", censusStepGeo, censusStepMaterial, C);
  builder.makeSlot("censusBody", censusBodyGeo, censusWallMaterial, C);
  builder.makeSlot("censusDome", censusDomeGeo, censusDomeMaterial, C);
  builder.makeSlot("censusDomeRing", censusDomeRingGeo, censusBrassMaterial, C);
  builder.makeSlot("censusFinialPole", censusFinialPoleGeo, censusBrassDarkMaterial, C);
  builder.makeSlot("censusFinialCap", censusFinialCapGeo, censusBrassMaterial, C);
  builder.makeSlot("censusDrum", censusDrumGeo, censusBrassMaterial, C);
  builder.makeSlot("censusDrumRing", censusDrumRingGeo, censusBrassDarkMaterial, C * 2);
  builder.makeSlot("censusPortholeRim", censusPortholeRimGeo, censusBrassMaterial, C * 2);
  builder.makeSlot("censusPortholeGlass", censusPortholeGlassGeo, censusGlassMaterial, C * 2);
  builder.makeSlot("censusHorn", censusHornGeo, censusBrassMaterial, C * 2);
  builder.makeSlot("censusHornBell", censusHornBellGeo, censusBrassDarkMaterial, C * 2);
  builder.makeSlot("censusBand", censusBandGeo, censusBrassMaterial, C * 2);
  builder.makeSlot("censusGearbox", censusGearboxGeo, censusGearboxMaterial, C);
  builder.makeSlot("censusChimney", censusChimneyGeo, censusGearboxMaterial, C);
  builder.makeSlot("censusChimneyCap", censusChimneyCapGeo, censusBrassMaterial, C);

  // ─── Layouts ────────────────────────────────────────────────────────
  const addCaravanary: CivicStructureLayout = (sx, sy, sz) => {
    // 4 perimeter walls. North/south keep default orientation; east/west
    // rotate 90° around Y. Wall height 0.14 reads as fortified.
    builder.addPiece("caravanaryWall", sx, sy, sz, 0, 0.07, -0.16);
    builder.addPiece("caravanaryWall", sx, sy, sz, 0, 0.07, 0.16);
    builder.addPiece("caravanaryWall", sx, sy, sz, -0.16, 0.07, 0, 1, 1, 1, Math.PI * 0.5);
    builder.addPiece("caravanaryWall", sx, sy, sz, 0.16, 0.07, 0, 1, 1, 1, Math.PI * 0.5);
    // 4 corner watchtowers (cylinder + conical cap). The two front
    // towers (positive Z) also function as the gate-tower pair flanking
    // the entrance.
    const towerOffsets: ReadonlyArray<readonly [number, number]> = [
      [-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]
    ];
    for (const [ox, oz] of towerOffsets) {
      builder.addPiece("caravanaryTower", sx, sy, sz, ox, 0.10, oz);
      builder.addPiece("caravanaryTowerCap", sx, sy, sz, ox, 0.225, oz, 1, 1, 1, Math.PI * 0.125);
    }
    // Central courtyard well.
    builder.addPiece("caravanaryWell", sx, sy, sz, 0, 0.03, 0);
    // Cargo stacked against the inner back wall + one along the side.
    builder.addPiece("caravanaryCargo", sx, sy, sz, -0.08, 0.025, -0.10);
    builder.addPiece("caravanaryCargo", sx, sy, sz, -0.02, 0.025, -0.10);
    builder.addPiece("caravanaryCargo", sx, sy, sz, 0.04, 0.025, -0.10);
    // A pair of grain sacks slumped beside the well.
    builder.addPiece("caravanarySack", sx, sy, sz, 0.08, 0.022, 0.06);
    builder.addPiece("caravanarySack", sx, sy, sz, 0.10, 0.022, 0.00);
  };

  const addCustomsHouse: CivicStructureLayout = (sx, sy, sz) => {
    builder.addPiece("customsBody", sx, sy, sz, -0.06, 0.085, -0.04);
    builder.addPiece("customsRoof", sx, sy, sz, -0.06, 0.20, -0.04, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("customsGatePole", sx, sy, sz, 0.16, 0.07, 0.10);
    builder.addPiece("customsGateArm", sx, sy, sz, 0.05, 0.14, 0.10);
    builder.addPiece("customsGateStripe", sx, sy, sz, 0.05, 0.14, 0.10);
    builder.addPiece("customsBollard", sx, sy, sz, -0.16, 0.025, 0.20);
    builder.addPiece("customsBollard", sx, sy, sz, 0.16, 0.025, 0.20);
  };

  const addExchangeHouse: CivicStructureLayout = (sx, sy, sz) => {
    builder.addPiece("exchangeHouseStep", sx, sy, sz, 0, 0.025, 0.12);
    builder.addPiece("exchangeHouseBody", sx, sy, sz, 0, 0.105, 0);
    builder.addPiece("exchangeHouseRoof", sx, sy, sz, 0, 0.21, 0, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("exchangeHouseColumn", sx, sy, sz, -0.08, 0.105, 0.10);
    builder.addPiece("exchangeHouseColumn", sx, sy, sz, 0.08, 0.105, 0.10);
    builder.addPiece("exchangeHouseSign", sx, sy, sz, 0, 0.17, 0.085, 1, 1.4, 1);
  };

  const addClearingHouse: CivicStructureLayout = (sx, sy, sz) => {
    builder.addPiece("clearingHouseBase", sx, sy, sz, 0, 0.025, 0.03);
    builder.addPiece("clearingHouseBody", sx, sy, sz, 0, 0.132, -0.005);
    builder.addPiece("clearingHouseWing", sx, sy, sz, -0.195, 0.10, 0.005);
    builder.addPiece("clearingHouseWing", sx, sy, sz, 0.195, 0.10, 0.005);
    builder.addPiece("clearingHouseRoof", sx, sy, sz, 0, 0.235, -0.005);
    builder.addPiece("clearingHouseColumn", sx, sy, sz, -0.125, 0.112, 0.125);
    builder.addPiece("clearingHouseColumn", sx, sy, sz, -0.042, 0.112, 0.125);
    builder.addPiece("clearingHouseColumn", sx, sy, sz, 0.042, 0.112, 0.125);
    builder.addPiece("clearingHouseColumn", sx, sy, sz, 0.125, 0.112, 0.125);
    builder.addPiece("clearingHouseLedger", sx, sy, sz, -0.08, 0.04, 0.19, 1, 1, 1, -0.18);
    builder.addPiece("clearingHouseLedger", sx, sy, sz, 0.08, 0.04, 0.19, 1, 1, 1, 0.18);
    builder.addPiece("clearingHouseSeal", sx, sy, sz, 0, 0.17, 0.122, 1, 1, 1, 0, Math.PI * 0.5);
    builder.addPiece("clearingHouseScalePole", sx, sy, sz, 0, 0.335, 0.018);
    builder.addPiece("clearingHouseScaleBeam", sx, sy, sz, 0, 0.405, 0.018);
    builder.addPiece("clearingHouseScalePan", sx, sy, sz, -0.075, 0.37, 0.018);
    builder.addPiece("clearingHouseScalePan", sx, sy, sz, 0.075, 0.37, 0.018);
  };

  const addGarrisonHall: CivicStructureLayout = (sx, sy, sz) => {
    builder.addPiece("garrisonBody", sx, sy, sz, 0, 0.085, -0.02);
    builder.addPiece("garrisonRoof", sx, sy, sz, 0, 0.21, -0.02, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("garrisonSandbag", sx, sy, sz, -0.12, 0.0175, 0.16);
    builder.addPiece("garrisonSandbag", sx, sy, sz, 0, 0.0175, 0.16);
    builder.addPiece("garrisonSandbag", sx, sy, sz, 0.12, 0.0175, 0.16);
    builder.addPiece("garrisonPole", sx, sy, sz, 0.18, 0.13, -0.16);
    builder.addPiece("garrisonBanner", sx, sy, sz, 0.21, 0.20, -0.16);
  };

  const addGovernorsOffice: CivicStructureLayout = (sx, sy, sz) => {
    builder.addPiece("governorStep", sx, sy, sz, 0, 0.025, 0.12);
    builder.addPiece("governorBody", sx, sy, sz, 0, 0.115, 0);
    builder.addPiece("governorRoof", sx, sy, sz, 0, 0.235, 0, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("governorCupola", sx, sy, sz, 0, 0.325, 0);
    builder.addPiece("governorCupolaRoof", sx, sy, sz, 0, 0.39, 0, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("governorFlag", sx, sy, sz, 0.025, 0.44, 0);
  };

  const addCensusHall: CivicStructureLayout = (sx, sy, sz) => {
    builder.addPiece("censusStep", sx, sy, sz, 0, 0.0225, 0.12);
    builder.addPiece("censusBody", sx, sy, sz, 0, 0.135, -0.01);
    // Riveted brass bands wrap the body near the base and the eaves.
    builder.addPiece("censusBand", sx, sy, sz, 0, 0.07, -0.01);
    builder.addPiece("censusBand", sx, sy, sz, 0, 0.22, -0.01);
    builder.addPiece("censusDomeRing", sx, sy, sz, 0, 0.235, -0.01);
    builder.addPiece("censusDome", sx, sy, sz, 0, 0.235, -0.01);
    builder.addPiece("censusFinialPole", sx, sy, sz, 0, 0.40, -0.01);
    builder.addPiece("censusFinialCap", sx, sy, sz, 0, 0.455, -0.01);
    // Brass tally drum punched into the front facade above the door.
    builder.addPiece("censusDrum", sx, sy, sz, 0, 0.155, 0.105, 1, 1, 1, 0, 0, Math.PI * 0.5);
    builder.addPiece("censusDrumRing", sx, sy, sz, 0, 0.155, 0.155, 1, 1, 1, 0, 0, Math.PI * 0.5);
    builder.addPiece("censusDrumRing", sx, sy, sz, 0, 0.155, 0.06, 1, 1, 1, 0, 0, Math.PI * 0.5);
    // Twin porthole windows flanking the drum.
    builder.addPiece("censusPortholeRim", sx, sy, sz, -0.085, 0.165, 0.105, 1, 1, 1, 0, 0, Math.PI * 0.5);
    builder.addPiece("censusPortholeGlass", sx, sy, sz, -0.085, 0.165, 0.105, 1, 1, 1, 0, 0, Math.PI * 0.5);
    builder.addPiece("censusPortholeRim", sx, sy, sz, 0.085, 0.165, 0.105, 1, 1, 1, 0, 0, Math.PI * 0.5);
    builder.addPiece("censusPortholeGlass", sx, sy, sz, 0.085, 0.165, 0.105, 1, 1, 1, 0, 0, Math.PI * 0.5);
    // Twin ear-trumpet intake horns flanking the entrance steps, bells
    // flared outward and upward as if listening for the next census tick.
    builder.addPiece("censusHorn", sx, sy, sz, -0.16, 0.075, 0.155, 1, 1, 1, 0, -Math.PI * 0.18, Math.PI * 0.18);
    builder.addPiece("censusHornBell", sx, sy, sz, -0.175, 0.125, 0.18, 1, 1, 1, 0, -Math.PI * 0.18, Math.PI * 0.18);
    builder.addPiece("censusHorn", sx, sy, sz, 0.16, 0.075, 0.155, 1, 1, 1, 0, Math.PI * 0.18, -Math.PI * 0.18);
    builder.addPiece("censusHornBell", sx, sy, sz, 0.175, 0.125, 0.18, 1, 1, 1, 0, Math.PI * 0.18, -Math.PI * 0.18);
    // Side gearbox housing + roof chimney — anchor points for the
    // animated rotating gears and rising steam in the fx companion layer.
    builder.addPiece("censusGearbox", sx, sy, sz, -0.155, 0.10, -0.07);
    builder.addPiece("censusChimney", sx, sy, sz, 0.12, 0.30, -0.08);
    builder.addPiece("censusChimneyCap", sx, sy, sz, 0.12, 0.385, -0.08);
  };

  return {
    layouts: {
      CARAVANARY: addCaravanary,
      CLEARING_HOUSE: addClearingHouse,
      CUSTOMS_HOUSE: addCustomsHouse,
      EXCHANGE_HOUSE: addExchangeHouse,
      GARRISON_HALL: addGarrisonHall,
      GOVERNORS_OFFICE: addGovernorsOffice,
      CENSUS_HALL: addCensusHall
    }
  };
};
