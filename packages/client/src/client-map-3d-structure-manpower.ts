import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry
} from "three";
import type { StructurePieceBuilder } from "./client-map-3d-structure-builder.js";

export type ManpowerStructureKind =
  | "QUARTERMASTERS_OFFICE"
  | "LOGISTICS_GUILD"
  | "ASSEMBLY_WORKS"
  | "POPULATION_BUREAU"
  | "IRON_LEVY"
  | "ANCILLARY_FACTORY"
  | "INCUBATION_ENGINE"
  | "AMBARIC_TOWER";

export const MANPOWER_STRUCTURE_KINDS: ReadonlySet<ManpowerStructureKind> = new Set([
  "QUARTERMASTERS_OFFICE", "LOGISTICS_GUILD", "ASSEMBLY_WORKS", "POPULATION_BUREAU",
  "IRON_LEVY", "ANCILLARY_FACTORY", "INCUBATION_ENGINE", "AMBARIC_TOWER"
]);

export type ManpowerStructureLayout = (sceneX: number, surfaceY: number, sceneZ: number) => void;

export type ManpowerHandle = {
  readonly layouts: Record<ManpowerStructureKind, ManpowerStructureLayout>;
};

export const registerManpowerStructures = (
  builder: StructurePieceBuilder
): ManpowerHandle => {
  const C = builder.maxTiles;

  // ─── Shared branch palette ──────────────────────────────────────────
  // The Manpower branch's steampunk language: bronze/brass trim, gunmetal
  // steel, soot-dark iron, riveted ash-grey stone, steam white, and a
  // single warm-amber glow (the "warm heart") per building.
  const mpStoneMaterial = new MeshStandardMaterial({ color: "#8a8078", roughness: 0.88, metalness: 0, flatShading: true });
  const mpStoneDarkMaterial = new MeshStandardMaterial({ color: "#6e6459", roughness: 0.9, metalness: 0, flatShading: true });
  const mpIronMaterial = new MeshStandardMaterial({ color: "#2a241e", roughness: 0.82, metalness: 0.3, flatShading: true });
  const mpSteelMaterial = new MeshStandardMaterial({ color: "#3e4248", roughness: 0.72, metalness: 0.45, flatShading: true });
  const mpSteelLightMaterial = new MeshStandardMaterial({ color: "#5a5e62", roughness: 0.65, metalness: 0.5, flatShading: true });
  const mpBrassMaterial = new MeshStandardMaterial({ color: "#b3833a", roughness: 0.45, metalness: 0.6, flatShading: true });
  const mpBrassDarkMaterial = new MeshStandardMaterial({ color: "#7a5a26", roughness: 0.5, metalness: 0.55, flatShading: true });
  const mpSteamMaterial = new MeshStandardMaterial({ color: "#e8e6df", roughness: 0.8, metalness: 0.1, flatShading: true });
  // Warm amber "signature light" — used sparingly, one focal piece per
  // building (windows/ports of the Incubation Engine use the dim variant).
  const mpAmberGlowMaterial = new MeshStandardMaterial({ color: "#ffb347", roughness: 0.3, metalness: 0.15, flatShading: true, emissive: "#d68a18", emissiveIntensity: 0.95 });
  const mpAmberDimMaterial = new MeshStandardMaterial({ color: "#d98a3a", roughness: 0.4, metalness: 0.1, flatShading: true, emissive: "#b36a18", emissiveIntensity: 0.4 });
  // Subdued red ember for The Iron Levy — held "in reserve".
  const mpEmberMaterial = new MeshStandardMaterial({ color: "#c85a3a", roughness: 0.35, metalness: 0.1, flatShading: true, emissive: "#8a1a0a", emissiveIntensity: 0.55 });

  // ─── Geometries ─────────────────────────────────────────────────────
  const mpPipeGeo = new CylinderGeometry(0.009, 0.009, 0.20, 6);
  const mpVentCapGeo = new ConeGeometry(0.014, 0.022, 6);
  const mpFigureBodyGeo = new BoxGeometry(0.014, 0.030, 0.014);
  const mpFigureHeadGeo = new ConeGeometry(0.009, 0.013, 6);
  const qmBaseGeo = new BoxGeometry(0.40, 0.03, 0.26);
  const qmBodyGeo = new BoxGeometry(0.38, 0.12, 0.24);
  const qmRoofGeo = new ConeGeometry(0.22, 0.06, 4);
  const qmChimneyGeo = new BoxGeometry(0.05, 0.07, 0.05);
  const qmCounterGeo = new BoxGeometry(0.14, 0.02, 0.06);
  const qmCrateGeo = new BoxGeometry(0.034, 0.034, 0.034);
  const qmCrateLidGeo = new BoxGeometry(0.04, 0.008, 0.04);
  const qmLampGeo = new BoxGeometry(0.018, 0.018, 0.018);
  const qmRailStubGeo = new BoxGeometry(0.03, 0.012, 0.10);
  const lgStepGeo = new BoxGeometry(0.30, 0.03, 0.20);
  const lgBodyGeo = new BoxGeometry(0.26, 0.15, 0.20);
  const lgRoofGeo = new ConeGeometry(0.19, 0.10, 4);
  const lgTurretGeo = new BoxGeometry(0.10, 0.10, 0.10);
  const lgDialGeo = new CylinderGeometry(0.042, 0.042, 0.022, 12);
  const lgWhistleGeo = new CylinderGeometry(0.011, 0.011, 0.05, 6);
  const lgPylonGeo = new CylinderGeometry(0.012, 0.012, 0.26, 6);
  const lgLanternGeo = new BoxGeometry(0.022, 0.026, 0.022);
  const lgLampGeo = new BoxGeometry(0.016, 0.016, 0.016);
  const lgAnnexGeo = new BoxGeometry(0.20, 0.07, 0.12);
  const lgAnnexRoofGeo = new BoxGeometry(0.21, 0.012, 0.13);
  const awColumnGeo = new BoxGeometry(0.022, 0.13, 0.022);
  const awFloorGeo = new BoxGeometry(0.42, 0.02, 0.32);
  const awRoofGeo = new BoxGeometry(0.46, 0.035, 0.36);
  const awGantryGeo = new BoxGeometry(0.02, 0.016, 0.30);
  const awWheelGeo = new CylinderGeometry(0.016, 0.016, 0.012, 10);
  const awChamberGeo = new CylinderGeometry(0.05, 0.05, 0.16, 12);
  const awChamberCapGeo = new ConeGeometry(0.052, 0.035, 12);
  const awGearGeo = new CylinderGeometry(0.055, 0.055, 0.014, 14);
  const awToothGeo = new BoxGeometry(0.014, 0.014, 0.012);
  const awValveGeo = new CylinderGeometry(0.013, 0.013, 0.035, 6);
  const awValveCapGeo = new ConeGeometry(0.015, 0.024, 6);
  const awLineGeo = new BoxGeometry(0.05, 0.014, 0.86);
  const awPartGeo = new BoxGeometry(0.026, 0.028, 0.026);
  const pbStepGeo = new BoxGeometry(0.44, 0.045, 0.30);
  const pbTierGeo = new BoxGeometry(0.36, 0.12, 0.24);
  const pbTier2Geo = new BoxGeometry(0.28, 0.11, 0.18);
  const pbTier3Geo = new BoxGeometry(0.20, 0.10, 0.13);
  const pbDrumGeo = new CylinderGeometry(0.065, 0.065, 0.13, 16);
  const pbDrumGlowGeo = new CylinderGeometry(0.032, 0.032, 0.008, 14);
  const pbDomeGeo = new SphereGeometry(0.05, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const pbColumnGeo = new CylinderGeometry(0.022, 0.022, 0.34, 10);
  const pbColumnRingGeo = new CylinderGeometry(0.027, 0.027, 0.009, 10);
  const pbRegisterRingGeo = new CylinderGeometry(0.06, 0.06, 0.014, 14);
  const pbTickLampGeo = new OctahedronGeometry(0.011, 0);
  const ilDrumGeo = new CylinderGeometry(0.15, 0.165, 0.17, 6);
  const ilBandGeo = new CylinderGeometry(0.155, 0.155, 0.014, 6);
  const ilRingGeo = new CylinderGeometry(0.19, 0.19, 0.012, 14);
  const ilProngGeo = new CylinderGeometry(0.004, 0.004, 0.022, 4);
  const ilColumnGeo = new CylinderGeometry(0.02, 0.028, 0.20, 10);
  const ilHornGeo = new CylinderGeometry(0.065, 0.012, 0.09, 12);
  const ilEmberGeo = new SphereGeometry(0.016, 10, 8);
  const afColumnGeo = new BoxGeometry(0.018, 0.12, 0.018);
  const afFloorGeo = new BoxGeometry(0.36, 0.02, 0.28);
  const afRoofGeo = new BoxGeometry(0.38, 0.03, 0.30);
  const afGantryGeo = new BoxGeometry(0.018, 0.012, 0.22);
  const afShaftGeo = new CylinderGeometry(0.008, 0.008, 0.20, 6);
  const afGearGeo = new CylinderGeometry(0.02, 0.02, 0.01, 10);
  const afHopperGeo = new BoxGeometry(0.09, 0.09, 0.09);
  const afTowerUpperGeo = new BoxGeometry(0.07, 0.10, 0.07);
  const afTowerTopGeo = new BoxGeometry(0.055, 0.06, 0.055);
  const afChuteGeo = new CylinderGeometry(0.02, 0.038, 0.04, 8);
  const afVentGeo = new CylinderGeometry(0.012, 0.012, 0.03, 6);
  const afVentCapGeo = new ConeGeometry(0.014, 0.022, 6);
  const ieBaseGeo = new BoxGeometry(0.44, 0.03, 0.30);
  const ieBodyGeo = new BoxGeometry(0.42, 0.14, 0.28);
  const ieRoofGeo = new CylinderGeometry(0.16, 0.16, 0.44, 16, 1, true);
  const ieRoofCapGeo = new CylinderGeometry(0.16, 0.16, 0.02, 16);
  const iePortGeo = new CylinderGeometry(0.022, 0.022, 0.008, 10);
  const ieBundleGeo = new BoxGeometry(0.016, 0.02, 0.012);
  const ieTendingPortGeo = new CylinderGeometry(0.05, 0.05, 0.008, 14);
  const ieChimneyGeo = new BoxGeometry(0.05, 0.09, 0.05);
  const atBaseGeo = new CylinderGeometry(0.14, 0.16, 0.05, 12);
  const atBase2Geo = new CylinderGeometry(0.10, 0.11, 0.04, 10);
  const atShaftGeo = new CylinderGeometry(0.024, 0.04, 0.34, 10);
  const atCoilGeo = new CylinderGeometry(0.032, 0.032, 0.014, 8);
  const atCrownGeo = new CylinderGeometry(0.075, 0.05, 0.025, 14);
  const atCrystalGeo = new OctahedronGeometry(0.045, 0);
  const atArmGeo = new CylinderGeometry(0.008, 0.008, 0.07, 6);
  const atEmberGeo = new OctahedronGeometry(0.014, 0);

  // ─── Slots ─────────────────────────────────────────────────────────
  builder.makeSlot("mpPipe", mpPipeGeo, mpSteelLightMaterial, C * 2);
  builder.makeSlot("mpVentCap", mpVentCapGeo, mpSteamMaterial, C * 4);
  builder.makeSlot("mpFigureBody", mpFigureBodyGeo, mpSteelLightMaterial, C * 4);
  builder.makeSlot("mpFigureHead", mpFigureHeadGeo, mpSteamMaterial, C * 4);
  builder.makeSlot("qmBase", qmBaseGeo, mpStoneDarkMaterial, C);
  builder.makeSlot("qmBody", qmBodyGeo, mpStoneMaterial, C);
  builder.makeSlot("qmRoof", qmRoofGeo, mpIronMaterial, C);
  builder.makeSlot("qmChimney", qmChimneyGeo, mpStoneDarkMaterial, C * 2);
  builder.makeSlot("qmCounter", qmCounterGeo, mpBrassMaterial, C);
  builder.makeSlot("qmCrate", qmCrateGeo, mpIronMaterial, C * 2);
  builder.makeSlot("qmCrateLid", qmCrateLidGeo, mpBrassDarkMaterial, C * 2);
  builder.makeSlot("qmLamp", qmLampGeo, mpAmberGlowMaterial, C);
  builder.makeSlot("qmRailStub", qmRailStubGeo, mpSteelMaterial, C);
  builder.makeSlot("lgStep", lgStepGeo, mpStoneDarkMaterial, C);
  builder.makeSlot("lgBody", lgBodyGeo, mpStoneMaterial, C);
  builder.makeSlot("lgRoof", lgRoofGeo, mpIronMaterial, C);
  builder.makeSlot("lgTurret", lgTurretGeo, mpStoneMaterial, C);
  builder.makeSlot("lgDial", lgDialGeo, mpBrassMaterial, C);
  builder.makeSlot("lgWhistle", lgWhistleGeo, mpSteelLightMaterial, C);
  builder.makeSlot("lgLamp", lgLampGeo, mpAmberGlowMaterial, C);
  builder.makeSlot("lgPylon", lgPylonGeo, mpSteelMaterial, C);
  builder.makeSlot("lgLantern", lgLanternGeo, mpBrassMaterial, C);
  builder.makeSlot("lgAnnex", lgAnnexGeo, mpSteelMaterial, C);
  builder.makeSlot("lgAnnexRoof", lgAnnexRoofGeo, mpIronMaterial, C);
  builder.makeSlot("awColumn", awColumnGeo, mpSteelMaterial, C * 4);
  builder.makeSlot("awFloor", awFloorGeo, mpIronMaterial, C);
  builder.makeSlot("awRoof", awRoofGeo, mpIronMaterial, C);
  builder.makeSlot("awGantry", awGantryGeo, mpSteelLightMaterial, C);
  builder.makeSlot("awWheel", awWheelGeo, mpBrassMaterial, C * 3);
  builder.makeSlot("awChamber", awChamberGeo, mpSteelMaterial, C * 3);
  builder.makeSlot("awChamberCap", awChamberCapGeo, mpSteelLightMaterial, C * 3);
  builder.makeSlot("awGear", awGearGeo, mpBrassMaterial, C);
  builder.makeSlot("awTooth", awToothGeo, mpBrassDarkMaterial, C * 4);
  builder.makeSlot("awValve", awValveGeo, mpAmberGlowMaterial, C);
  builder.makeSlot("awValveCap", awValveCapGeo, mpAmberGlowMaterial, C);
  builder.makeSlot("awLine", awLineGeo, mpIronMaterial, C);
  builder.makeSlot("awPart", awPartGeo, mpSteelLightMaterial, C * 5);
  builder.makeSlot("pbStep", pbStepGeo, mpStoneDarkMaterial, C);
  builder.makeSlot("pbTier", pbTierGeo, mpStoneMaterial, C);
  builder.makeSlot("pbTier2", pbTier2Geo, mpStoneMaterial, C);
  builder.makeSlot("pbTier3", pbTier3Geo, mpStoneMaterial, C);
  builder.makeSlot("pbDrum", pbDrumGeo, mpBrassMaterial, C);
  builder.makeSlot("pbDrumGlow", pbDrumGlowGeo, mpAmberGlowMaterial, C);
  builder.makeSlot("pbDome", pbDomeGeo, mpBrassDarkMaterial, C);
  builder.makeSlot("pbColumn", pbColumnGeo, mpBrassMaterial, C * 2);
  builder.makeSlot("pbColumnRing", pbColumnRingGeo, mpBrassDarkMaterial, C * 6);
  builder.makeSlot("pbRegisterRing", pbRegisterRingGeo, mpBrassDarkMaterial, C * 3);
  builder.makeSlot("pbTickLamp", pbTickLampGeo, mpAmberGlowMaterial, C * 3);
  builder.makeSlot("ilDrum", ilDrumGeo, mpStoneMaterial, C);
  builder.makeSlot("ilBand", ilBandGeo, mpIronMaterial, C * 2);
  builder.makeSlot("ilRing", ilRingGeo, mpIronMaterial, C);
  builder.makeSlot("ilProng", ilProngGeo, mpIronMaterial, C * 4);
  builder.makeSlot("ilColumn", ilColumnGeo, mpIronMaterial, C);
  builder.makeSlot("ilHorn", ilHornGeo, mpIronMaterial, C);
  builder.makeSlot("ilEmber", ilEmberGeo, mpEmberMaterial, C);
  builder.makeSlot("afColumn", afColumnGeo, mpSteelMaterial, C * 4);
  builder.makeSlot("afFloor", afFloorGeo, mpIronMaterial, C);
  builder.makeSlot("afRoof", afRoofGeo, mpIronMaterial, C);
  builder.makeSlot("afGantry", afGantryGeo, mpSteelLightMaterial, C);
  builder.makeSlot("afShaft", afShaftGeo, mpBrassMaterial, C);
  builder.makeSlot("afGear", afGearGeo, mpBrassMaterial, C * 3);
  builder.makeSlot("afTowerLower", afHopperGeo, mpIronMaterial, C);
  builder.makeSlot("afTowerUpper", afTowerUpperGeo, mpSteelMaterial, C);
  builder.makeSlot("afTowerTop", afTowerTopGeo, mpIronMaterial, C);
  builder.makeSlot("afChute", afChuteGeo, mpIronMaterial, C);
  builder.makeSlot("afVent", afVentGeo, mpAmberGlowMaterial, C);
  builder.makeSlot("afVentCap", afVentCapGeo, mpAmberGlowMaterial, C);
  builder.makeSlot("ieBase", ieBaseGeo, mpStoneDarkMaterial, C);
  builder.makeSlot("ieBody", ieBodyGeo, mpStoneMaterial, C);
  builder.makeSlot("ieRoof", ieRoofGeo, mpIronMaterial, C);
  builder.makeSlot("ieRoofCap", ieRoofCapGeo, mpIronMaterial, C * 2);
  builder.makeSlot("iePort", iePortGeo, mpAmberDimMaterial, C * 3);
  builder.makeSlot("ieBundle", ieBundleGeo, mpSteamMaterial, C * 3);
  builder.makeSlot("ieTendingPort", ieTendingPortGeo, mpAmberGlowMaterial, C);
  builder.makeSlot("ieChimney", ieChimneyGeo, mpStoneDarkMaterial, C * 2);
  builder.makeSlot("atBase", atBaseGeo, mpStoneDarkMaterial, C);
  builder.makeSlot("atBase2", atBase2Geo, mpStoneMaterial, C);
  builder.makeSlot("atShaft", atShaftGeo, mpIronMaterial, C);
  builder.makeSlot("atCoil", atCoilGeo, mpBrassMaterial, C * 4);
  builder.makeSlot("atCrown", atCrownGeo, mpBrassMaterial, C);
  builder.makeSlot("atCrystal", atCrystalGeo, mpAmberGlowMaterial, C);
  builder.makeSlot("atArm", atArmGeo, mpBrassMaterial, C * 3);
  builder.makeSlot("atEmber", atEmberGeo, mpAmberGlowMaterial, C * 3);

  // ─── Layouts ────────────────────────────────────────────────────────
  const addQuartermastersOffice: ManpowerStructureLayout = (sx, sy, sz) => {
    // Low wide ledger-hall: supply-coordination post. Stone block body,
    // shallow hipped roof, two gable chimneys, a brass supply-board
    // counter beside the door stacked with supply crates, and a thin
    // supply pipe dropping from the roofline into a rail-siding stub —
    // the "-within-20-tiles provisioning" flavour. One small amber lamp
    // over the counter only.
    builder.addPiece("qmBase", sx, sy, sz, 0, 0.015, 0);
    builder.addPiece("qmBody", sx, sy, sz, 0, 0.09, 0);
    builder.addPiece("qmRoof", sx, sy, sz, 0, 0.175, 0, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("qmChimney", sx, sy, sz, -0.14, 0.22, -0.05);
    builder.addPiece("qmChimney", sx, sy, sz, 0.14, 0.22, -0.05);
    builder.addPiece("qmCounter", sx, sy, sz, -0.15, 0.05, 0.13, 1, 1, 1, 0, -0.35, 0);
    builder.addPiece("qmCrate", sx, sy, sz, -0.15, 0.075, 0.13);
    builder.addPiece("qmCrateLid", sx, sy, sz, -0.15, 0.095, 0.13);
    builder.addPiece("qmCrate", sx, sy, sz, -0.19, 0.05, 0.11);
    builder.addPiece("qmCrateLid", sx, sy, sz, -0.19, 0.07, 0.11);
    builder.addPiece("qmLamp", sx, sy, sz, -0.15, 0.12, 0.15);
    builder.addPiece("mpPipe", sx, sy, sz, 0.18, 0.18, 0.12);
    builder.addPiece("qmRailStub", sx, sy, sz, 0.20, 0.006, 0.12);
  };

  const addLogisticsGuild: ManpowerStructureLayout = (sx, sy, sz) => {
    // Taller civic hall crowned by a brass schedule-tower: a square
    // turret with an hour-drums dial face and a steam whistle stack.
    // A rail pylon at one corner reads "linked by rail"; a low train-hall
    // annex juts off the back. One amber lamp in the turret face.
    builder.addPiece("lgStep", sx, sy, sz, 0, 0.015, 0.12);
    builder.addPiece("lgBody", sx, sy, sz, 0, 0.12, 0);
    builder.addPiece("lgRoof", sx, sy, sz, 0, 0.245, 0, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("lgTurret", sx, sy, sz, 0, 0.345, 0);
    builder.addPiece("lgDial", sx, sy, sz, 0, 0.35, 0.06, 1, 1, 1, 0, Math.PI * 0.5);
    builder.addPiece("lgLamp", sx, sy, sz, 0, 0.35, 0.073);
    builder.addPiece("lgWhistle", sx, sy, sz, 0, 0.435, 0);
    builder.addPiece("mpVentCap", sx, sy, sz, 0, 0.47, 0);
    builder.addPiece("lgPylon", sx, sy, sz, 0.20, 0.13, 0.14);
    builder.addPiece("lgLantern", sx, sy, sz, 0.20, 0.285, 0.14);
    builder.addPiece("lgAnnex", sx, sy, sz, -0.02, 0.055, -0.13);
    builder.addPiece("lgAnnexRoof", sx, sy, sz, -0.02, 0.098, -0.13);
  };

  const addAssemblyWorks: ManpowerStructureLayout = (sx, sy, sz) => {
    // Industrial shed with an open front like a factory line: wide steel
    // roof on riveted columns, an overhead gantry running front-to-back
    // with a chain of small drive-wheels, and three identical gunmetal
    // piston-chambers marching down the tile. Signature: the main
    // drive-shaft gear on the gantry centre + one amber exhaust valve.
    // A floor-level assembly line runs into and out of the shed along Z,
    // carrying a stream of small components between neighbouring tiles.
    builder.addPiece("awFloor", sx, sy, sz, 0, 0.01, 0);
    builder.addPiece("awColumn", sx, sy, sz, -0.19, 0.085, -0.14);
    builder.addPiece("awColumn", sx, sy, sz, 0.19, 0.085, -0.14);
    builder.addPiece("awColumn", sx, sy, sz, -0.19, 0.085, 0.14);
    builder.addPiece("awColumn", sx, sy, sz, 0.19, 0.085, 0.14);
    builder.addPiece("awRoof", sx, sy, sz, 0, 0.165, 0);
    builder.addPiece("awGantry", sx, sy, sz, 0, 0.115, 0);
    builder.addPiece("awWheel", sx, sy, sz, 0, 0.086, -0.10);
    builder.addPiece("awWheel", sx, sy, sz, 0, 0.086, 0);
    builder.addPiece("awWheel", sx, sy, sz, 0, 0.086, 0.10);
    builder.addPiece("awChamber", sx, sy, sz, -0.13, 0.10, -0.10);
    builder.addPiece("awChamberCap", sx, sy, sz, -0.13, 0.195, -0.10);
    builder.addPiece("awChamber", sx, sy, sz, -0.13, 0.10, 0.02);
    builder.addPiece("awChamberCap", sx, sy, sz, -0.13, 0.195, 0.02);
    builder.addPiece("awChamber", sx, sy, sz, -0.13, 0.10, 0.14);
    builder.addPiece("awChamberCap", sx, sy, sz, -0.13, 0.195, 0.14);
    builder.addPiece("awGear", sx, sy, sz, 0.09, 0.115, 0, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("awTooth", sx, sy, sz, 0.09, 0.165, 0);
    builder.addPiece("awTooth", sx, sy, sz, 0.09, 0.065, 0);
    builder.addPiece("awTooth", sx, sy, sz, 0.145, 0.115, 0);
    builder.addPiece("awTooth", sx, sy, sz, 0.035, 0.115, 0);
    builder.addPiece("awLine", sx, sy, sz, 0, 0.016, 0);
    builder.addPiece("awPart", sx, sy, sz, 0, 0.037, -0.30);
    builder.addPiece("awPart", sx, sy, sz, 0, 0.037, -0.15);
    builder.addPiece("awPart", sx, sy, sz, 0, 0.037, 0);
    builder.addPiece("awPart", sx, sy, sz, 0, 0.037, 0.15);
    builder.addPiece("awPart", sx, sy, sz, 0, 0.037, 0.30);
    builder.addPiece("awValve", sx, sy, sz, 0.20, 0.15, -0.17);
    builder.addPiece("awValveCap", sx, sy, sz, 0.20, 0.175, -0.17);
  };

  const addPopulationBureau: ManpowerStructureLayout = (sx, sy, sz) => {
    // Monument: grand, vertical. Three stacked, shrinking civic-hall
    // tiers on a wide stepped base, twin brass census-columns flanking
    // them, crowned by a large brass tabulating-drum under a small dome.
    // Signature: three concentric register-rings stacked above, each
    // topped by a tiny amber tick-lamp; one warm glow in the drum face.
    builder.addPiece("pbStep", sx, sy, sz, 0, 0.0225, 0);
    builder.addPiece("pbTier", sx, sy, sz, 0, 0.105, 0);
    builder.addPiece("pbTier2", sx, sy, sz, 0, 0.22, 0);
    builder.addPiece("pbTier3", sx, sy, sz, 0, 0.325, 0);
    builder.addPiece("pbColumn", sx, sy, sz, -0.205, 0.17, -0.06);
    builder.addPiece("pbColumn", sx, sy, sz, 0.205, 0.17, -0.06);
    builder.addPiece("pbColumnRing", sx, sy, sz, -0.205, 0.10, -0.06);
    builder.addPiece("pbColumnRing", sx, sy, sz, -0.205, 0.22, -0.06);
    builder.addPiece("pbColumnRing", sx, sy, sz, -0.205, 0.34, -0.06);
    builder.addPiece("pbColumnRing", sx, sy, sz, 0.205, 0.10, -0.06);
    builder.addPiece("pbColumnRing", sx, sy, sz, 0.205, 0.22, -0.06);
    builder.addPiece("pbColumnRing", sx, sy, sz, 0.205, 0.34, -0.06);
    builder.addPiece("pbDrum", sx, sy, sz, 0, 0.42, 0, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("pbDrumGlow", sx, sy, sz, 0, 0.42, 0.07, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("pbDome", sx, sy, sz, 0, 0.52, 0);
    builder.addPiece("pbRegisterRing", sx, sy, sz, 0, 0.575, 0, 1.28, 1, 1.28, Math.PI * 0.1);
    builder.addPiece("pbTickLamp", sx, sy, sz, 0.077, 0.59, 0);
    builder.addPiece("pbRegisterRing", sx, sy, sz, 0, 0.615, 0, 0.92, 1, 0.92, Math.PI * 0.06);
    builder.addPiece("pbTickLamp", sx, sy, sz, 0.055, 0.63, 0);
    builder.addPiece("pbRegisterRing", sx, sy, sz, 0, 0.655, 0, 0.58, 1, 0.58);
    builder.addPiece("pbTickLamp", sx, sy, sz, 0.035, 0.67, 0);
  };

  const addIronLevy: ManpowerStructureLayout = (sx, sy, sz) => {
    // Monument: austere and menacing. A squat hexagonal stone drum with
    // riveted iron bands, wrapped by a tilted conscription ledger-ring
    // holding tiny iron-rod prongs. Signature: a standing-army silhouette
    // — a vertical iron column topped by a wide conical orders-horn
    // (speaking-horn, not a bell) with a dull red ember in its mouth,
    // kept subdued: held in reserve, one trigger.
    builder.addPiece("ilDrum", sx, sy, sz, 0, 0.085, 0);
    builder.addPiece("ilBand", sx, sy, sz, 0, 0.035, 0);
    builder.addPiece("ilBand", sx, sy, sz, 0, 0.14, 0);
    builder.addPiece("ilRing", sx, sy, sz, 0, 0.10, 0, 1, 1, 1, Math.PI * 0.14, 0.55, 0);
    builder.addPiece("ilProng", sx, sy, sz, 0, 0.115, 0.19);
    builder.addPiece("ilProng", sx, sy, sz, 0, 0.115, -0.19);
    builder.addPiece("ilProng", sx, sy, sz, 0.19, 0.115, 0);
    builder.addPiece("ilProng", sx, sy, sz, -0.19, 0.115, 0);
    builder.addPiece("ilColumn", sx, sy, sz, 0, 0.29, 0);
    builder.addPiece("ilHorn", sx, sy, sz, 0, 0.435, 0);
    builder.addPiece("ilEmber", sx, sy, sz, 0, 0.49, 0);
  };

  const addAncillaryFactory: ManpowerStructureLayout = (sx, sy, sz) => {
    // Workforce-manufactory, built in quantity: a compact open-sided
    // workshop whose read is the tall hopper-tower at one end — the lift
    // where laborers "come out" — a flared chute at its base with a
    // two-figure output line queued at it, a short drive-shaft with three
    // small gear-stages under the eaves, and one amber vent lamp glowing
    // on the tower top. Deliberately distinct from the rare Assembly
    // Works' long open line: this is the standard, mass-produced unit.
    builder.addPiece("afFloor", sx, sy, sz, 0, 0.01, 0);
    builder.addPiece("afColumn", sx, sy, sz, -0.14, 0.055, -0.11);
    builder.addPiece("afColumn", sx, sy, sz, 0.14, 0.055, -0.11);
    builder.addPiece("afColumn", sx, sy, sz, -0.14, 0.055, 0.11);
    builder.addPiece("afColumn", sx, sy, sz, 0.14, 0.055, 0.11);
    builder.addPiece("afRoof", sx, sy, sz, 0, 0.115, 0);
    builder.addPiece("afGantry", sx, sy, sz, -0.04, 0.085, 0);
    builder.addPiece("afShaft", sx, sy, sz, -0.04, 0.07, 0, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("afGear", sx, sy, sz, -0.04, 0.075, -0.06);
    builder.addPiece("afGear", sx, sy, sz, -0.04, 0.075, 0);
    builder.addPiece("afGear", sx, sy, sz, -0.04, 0.075, 0.06);
    builder.addPiece("afTowerLower", sx, sy, sz, 0.13, 0.065, 0.05);
    builder.addPiece("afTowerUpper", sx, sy, sz, 0.13, 0.16, 0.05);
    builder.addPiece("afTowerTop", sx, sy, sz, 0.13, 0.24, 0.05);
    builder.addPiece("afChute", sx, sy, sz, 0.13, 0.02, 0.09);
    builder.addPiece("mpFigureBody", sx, sy, sz, 0.13, 0.03, 0.14);
    builder.addPiece("mpFigureHead", sx, sy, sz, 0.13, 0.05, 0.14);
    builder.addPiece("mpFigureBody", sx, sy, sz, 0.13, 0.03, 0.18);
    builder.addPiece("mpFigureHead", sx, sy, sz, 0.13, 0.05, 0.18);
    builder.addPiece("afVent", sx, sy, sz, 0.13, 0.285, 0.05);
    builder.addPiece("afVentCap", sx, sy, sz, 0.13, 0.31, 0.05);
  };

  const addIncubationEngine: ManpowerStructureLayout = (sx, sy, sz) => {
    // The Steam Ward: a low, long, glass-fronted nursery hall with a
    // barrel-vaulted roof. Round port-windows at bed height each show a
    // tiny swaddled bundle with a dim amber glow; a larger tending-port
    // at the gable end is the warm heart. A steam-heating pipe runs the
    // roofline feeding small ridge vents; two low chimneys at the back.
    builder.addPiece("ieBase", sx, sy, sz, 0, 0.015, 0);
    builder.addPiece("ieBody", sx, sy, sz, 0, 0.10, 0);
    builder.addPiece("ieRoof", sx, sy, sz, 0, 0.17, 0, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("ieRoofCap", sx, sy, sz, 0, 0.17, -0.21, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("ieRoofCap", sx, sy, sz, 0, 0.17, 0.21, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("iePort", sx, sy, sz, -0.12, 0.10, 0.145);
    builder.addPiece("ieBundle", sx, sy, sz, -0.12, 0.095, 0.138);
    builder.addPiece("iePort", sx, sy, sz, 0, 0.10, 0.145);
    builder.addPiece("ieBundle", sx, sy, sz, 0, 0.095, 0.138);
    builder.addPiece("iePort", sx, sy, sz, 0.12, 0.10, 0.145);
    builder.addPiece("ieBundle", sx, sy, sz, 0.12, 0.095, 0.138);
    builder.addPiece("ieTendingPort", sx, sy, sz, 0.20, 0.10, 0.155);
    builder.addPiece("mpPipe", sx, sy, sz, 0, 0.335, 0, 1, 2.2, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("mpVentCap", sx, sy, sz, -0.12, 0.345, 0);
    builder.addPiece("mpVentCap", sx, sy, sz, 0, 0.345, 0);
    builder.addPiece("mpVentCap", sx, sy, sz, 0.12, 0.345, 0);
    builder.addPiece("ieChimney", sx, sy, sz, -0.16, 0.19, -0.10);
    builder.addPiece("ieChimney", sx, sy, sz, 0.16, 0.19, -0.10);
  };

  const addAmbaricTower: ManpowerStructureLayout = (sx, sy, sz) => {
    // Power-relay spire: a tall tapered iron shaft on a stepped stone
    // base, wrapped by two brass ambaric coils spiralling up, capped by
    // a wide brass ambaric crown with an amber octahedron floating above.
    // Signature: three short relay arms near the crown, each tipped with
    // a small amber ember — the current "channeled across the region".
    // Warm amber glow throughout, brighter than the rest of the branch.
    builder.addPiece("atBase", sx, sy, sz, 0, 0.025, 0);
    builder.addPiece("atBase2", sx, sy, sz, 0, 0.07, 0);
    builder.addPiece("atShaft", sx, sy, sz, 0, 0.26, 0);
    builder.addPiece("atCoil", sx, sy, sz, 0, 0.15, 0, 1, 1, 1, Math.PI * 0.35, 0.62, 0);
    builder.addPiece("atCoil", sx, sy, sz, 0, 0.22, 0, 1, 1, 1, Math.PI * 0.12, -0.62, 0);
    builder.addPiece("atCoil", sx, sy, sz, 0, 0.30, 0, 1, 1, 1, Math.PI * 0.32, 0.62, 0);
    builder.addPiece("atCoil", sx, sy, sz, 0, 0.38, 0, 1, 1, 1, Math.PI * 0.08, -0.62, 0);
    builder.addPiece("atCrown", sx, sy, sz, 0, 0.47, 0);
    builder.addPiece("atArm", sx, sy, sz, 0, 0.44, 0, 1, 1, 1, Math.PI * 0.5, 0, 0);
    builder.addPiece("atArm", sx, sy, sz, 0, 0.44, 0, 1, 1, 1, Math.PI * 0.5, 0, Math.PI * 0.67);
    builder.addPiece("atArm", sx, sy, sz, 0, 0.44, 0, 1, 1, 1, Math.PI * 0.5, 0, Math.PI * 1.33);
    builder.addPiece("atEmber", sx, sy, sz, 0.09, 0.44, 0);
    builder.addPiece("atEmber", sx, sy, sz, -0.045, 0.44, 0.078);
    builder.addPiece("atEmber", sx, sy, sz, -0.045, 0.44, -0.078);
    builder.addPiece("atCrystal", sx, sy, sz, 0, 0.555, 0, 1, 1.35, 1);
  };

  return {
    layouts: {
      QUARTERMASTERS_OFFICE: addQuartermastersOffice,
      LOGISTICS_GUILD: addLogisticsGuild,
      ASSEMBLY_WORKS: addAssemblyWorks,
      POPULATION_BUREAU: addPopulationBureau,
      IRON_LEVY: addIronLevy,
      ANCILLARY_FACTORY: addAncillaryFactory,
      INCUBATION_ENGINE: addIncubationEngine,
      AMBARIC_TOWER: addAmbaricTower
    }
  };
};
