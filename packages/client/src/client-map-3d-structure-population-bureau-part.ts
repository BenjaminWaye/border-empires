import {
  BoxGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  OctahedronGeometry
} from "three";
import type { StructurePieceBuilder } from "./client-map-3d-structure-builder.js";

// The Population Bureau is built from three uniquely-named components,
// each a real, distinct wire type (unique-monument-components rewrite):
// POPULATION_BUREAU_PART_1 (Census Engine), POPULATION_BUREAU_PART_2
// (Registry Vault), POPULATION_BUREAU_PART_3 (Levy Charter).
export type PopulationBureauPartStructureKind =
  | "POPULATION_BUREAU_PART_1"
  | "POPULATION_BUREAU_PART_2"
  | "POPULATION_BUREAU_PART_3";

export const POPULATION_BUREAU_PART_STRUCTURE_KINDS: ReadonlySet<PopulationBureauPartStructureKind> = new Set([
  "POPULATION_BUREAU_PART_1",
  "POPULATION_BUREAU_PART_2",
  "POPULATION_BUREAU_PART_3"
]);

export type PopulationBureauPartStructureLayout = (
  sceneX: number,
  surfaceY: number,
  sceneZ: number
) => void;

export type PopulationBureauPartHandle = {
  readonly layouts: Record<PopulationBureauPartStructureKind, PopulationBureauPartStructureLayout>;
};

export const registerPopulationBureauPartStructures = (
  builder: StructurePieceBuilder
): PopulationBureauPartHandle => {
  const C = builder.maxTiles;

  // ─── Part palette ───────────────────────────────────────────────────
  // The Population Bureau's administrative machines share the monument
  // set's visual language: soot-dark iron, warm grey stone, aged brass
  // (duller than the manpower branch's brighter trim), muted parchment,
  // and exactly one restrained emissive accent per asset — the Census
  // Engine's processing-green card, the Registry Vault's warm amber
  // interior strip, and the Levy Charter's muted gold sigil.
  const pbIronMaterial = new MeshStandardMaterial({ color: "#2a241e", roughness: 0.82, metalness: 0.3, flatShading: true });
  const pbIronDarkMaterial = new MeshStandardMaterial({ color: "#1f1b16", roughness: 0.85, metalness: 0.35, flatShading: true });
  const pbStoneMaterial = new MeshStandardMaterial({ color: "#8a8078", roughness: 0.88, metalness: 0, flatShading: true });
  const pbStoneDarkMaterial = new MeshStandardMaterial({ color: "#6e6459", roughness: 0.9, metalness: 0, flatShading: true });
  const pbBrassMaterial = new MeshStandardMaterial({ color: "#9e7130", roughness: 0.55, metalness: 0.55, flatShading: true });
  const pbBrassDarkMaterial = new MeshStandardMaterial({ color: "#6e521f", roughness: 0.6, metalness: 0.5, flatShading: true });
  const pbParchmentMaterial = new MeshStandardMaterial({ color: "#cfc6a8", roughness: 0.92, metalness: 0.05, flatShading: true });
  const pbSteelMaterial = new MeshStandardMaterial({ color: "#3e4248", roughness: 0.72, metalness: 0.45, flatShading: true });
  const pbGreenGlowMaterial = new MeshStandardMaterial({ color: "#4d7a3a", roughness: 0.3, metalness: 0.1, flatShading: true, emissive: "#2f5c24", emissiveIntensity: 0.75 });
  const pbAmberGlowMaterial = new MeshStandardMaterial({ color: "#ffb347", roughness: 0.3, metalness: 0.15, flatShading: true, emissive: "#d68a18", emissiveIntensity: 0.9 });
  const pbGoldMaterial = new MeshStandardMaterial({ color: "#c99a3f", roughness: 0.45, metalness: 0.35, flatShading: true, emissive: "#8a6512", emissiveIntensity: 0.6 });

  // ─── Geometries ─────────────────────────────────────────────────────
  // Census engine
  const ceBaseGeo = new BoxGeometry(0.34, 0.02, 0.20);
  const ceFrameGeo = new BoxGeometry(0.03, 0.10, 0.22);
  const ceDrumGeo = new CylinderGeometry(0.055, 0.055, 0.19, 14);
  const ceBandGeo = new CylinderGeometry(0.059, 0.059, 0.012, 14);
  const ceAxleGeo = new CylinderGeometry(0.007, 0.007, 0.05, 6);
  const ceHousingGeo = new BoxGeometry(0.10, 0.05, 0.04);
  const ceWheelGeo = new CylinderGeometry(0.02, 0.02, 0.012, 10);
  const ceCardGeo = new BoxGeometry(0.012, 0.06, 0.05);
  const ceGlowGeo = new BoxGeometry(0.01, 0.016, 0.005);
  // Registry vault
  const rvBaseGeo = new BoxGeometry(0.34, 0.025, 0.24);
  const rvBodyGeo = new BoxGeometry(0.30, 0.16, 0.20);
  const rvCornerGeo = new BoxGeometry(0.04, 0.14, 0.04);
  const rvLidGeo = new BoxGeometry(0.32, 0.035, 0.22);
  const rvGlowGeo = new BoxGeometry(0.14, 0.008, 0.006);
  const rvLockGeo = new BoxGeometry(0.028, 0.045, 0.012);
  const rvHingeGeo = new BoxGeometry(0.035, 0.028, 0.012);
  // Levy charter
  const lcPedestalGeo = new CylinderGeometry(0.065, 0.075, 0.02, 10);
  const lcCapGeo = new CylinderGeometry(0.052, 0.052, 0.025, 10);
  const lcRollGeo = new CylinderGeometry(0.048, 0.048, 0.30, 10);
  const lcBandGeo = new CylinderGeometry(0.052, 0.052, 0.012, 10);
  const lcTongueGeo = new BoxGeometry(0.085, 0.006, 0.05);
  const lcSigilGeo = new OctahedronGeometry(0.011, 0);

  builder.makeSlot("ceBase", ceBaseGeo, pbIronMaterial, C);
  builder.makeSlot("ceFrame", ceFrameGeo, pbIronMaterial, C * 2);
  builder.makeSlot("ceDrum", ceDrumGeo, pbBrassMaterial, C);
  builder.makeSlot("ceBand", ceBandGeo, pbIronDarkMaterial, C * 2);
  builder.makeSlot("ceAxle", ceAxleGeo, pbSteelMaterial, C);
  builder.makeSlot("ceHousing", ceHousingGeo, pbIronDarkMaterial, C);
  builder.makeSlot("ceWheel", ceWheelGeo, pbBrassMaterial, C);
  builder.makeSlot("ceCard", ceCardGeo, pbParchmentMaterial, C * 6);
  builder.makeSlot("ceGlow", ceGlowGeo, pbGreenGlowMaterial, C);
  builder.makeSlot("rvBase", rvBaseGeo, pbStoneDarkMaterial, C);
  builder.makeSlot("rvBody", rvBodyGeo, pbIronMaterial, C);
  builder.makeSlot("rvCorner", rvCornerGeo, pbBrassMaterial, C * 4);
  builder.makeSlot("rvLid", rvLidGeo, pbBrassMaterial, C);
  builder.makeSlot("rvGlow", rvGlowGeo, pbAmberGlowMaterial, C);
  builder.makeSlot("rvLock", rvLockGeo, pbSteelMaterial, C);
  builder.makeSlot("rvHinge", rvHingeGeo, pbBrassDarkMaterial, C * 2);
  builder.makeSlot("lcPedestal", lcPedestalGeo, pbIronMaterial, C);
  builder.makeSlot("lcCap", lcCapGeo, pbBrassMaterial, C * 2);
  builder.makeSlot("lcRoll", lcRollGeo, pbParchmentMaterial, C);
  builder.makeSlot("lcBand", lcBandGeo, pbIronMaterial, C);
  builder.makeSlot("lcTongue", lcTongueGeo, pbParchmentMaterial, C);
  builder.makeSlot("lcSigil", lcSigilGeo, pbGoldMaterial, C);

  const addCensusEngine: PopulationBureauPartStructureLayout = (sx, sy, sz) => {
    // A compact horizontal brass drum on an iron frame: the drum lies
    // across the tile, held by two side plates, with a front bearing
    // housing, a brass tally-wheel on one frame, and a fanned rack of
    // parchment record cards leaning out of the drum's slot. The single
    // separated card is pulled up and forward, carrying the asset's only
    // accent — a small muted green glow, "actively processing".
    builder.addPiece("ceBase", sx, sy, sz, 0, 0.01, 0);
    builder.addPiece("ceFrame", sx, sy, sz, -0.155, 0.065, 0);
    builder.addPiece("ceFrame", sx, sy, sz, 0.155, 0.065, 0);
    builder.addPiece("ceDrum", sx, sy, sz, 0, 0.095, 0, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("ceBand", sx, sy, sz, 0, 0.095, -0.065, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("ceBand", sx, sy, sz, 0, 0.095, 0.065, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("ceAxle", sx, sy, sz, 0, 0.095, 0.098, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("ceHousing", sx, sy, sz, 0, 0.055, 0.085);
    builder.addPiece("ceWheel", sx, sy, sz, 0.155, 0.10, 0, 1, 1, 1, 0, 0, Math.PI * 0.5);
    builder.addPiece("ceCard", sx, sy, sz, -0.075, 0.14, 0.05, 1, 1, 1, 0, 0.3, -0.35);
    builder.addPiece("ceCard", sx, sy, sz, -0.037, 0.145, 0.06, 1, 1, 1, 0, 0.35, -0.18);
    builder.addPiece("ceCard", sx, sy, sz, 0, 0.15, 0.07, 1, 1, 1, 0, 0.4, 0);
    builder.addPiece("ceCard", sx, sy, sz, 0.037, 0.145, 0.06, 1, 1, 1, 0, 0.35, 0.18);
    builder.addPiece("ceCard", sx, sy, sz, 0.075, 0.14, 0.05, 1, 1, 1, 0, 0.3, 0.35);
    builder.addPiece("ceCard", sx, sy, sz, 0.02, 0.175, 0.10, 1, 1, 1, 0, 0.5, -0.1);
    builder.addPiece("ceGlow", sx, sy, sz, 0.02, 0.19, 0.135);
  };

  const addRegistryVault: PopulationBureauPartStructureLayout = (sx, sy, sz) => {
    // A squat, chunky iron strongbox: wide stone plinth, thick corner
    // reinforcements, heavy brass hinges at the back, and a thick brass
    // lid tilted open just enough to show a gap. The single accent is a
    // narrow warm amber strip glowing out from the gap — the imperial
    // archives sealed inside a miniature fortress.
    builder.addPiece("rvBase", sx, sy, sz, 0, 0.0125, 0);
    builder.addPiece("rvBody", sx, sy, sz, 0, 0.105, 0);
    builder.addPiece("rvCorner", sx, sy, sz, -0.145, 0.105, -0.095);
    builder.addPiece("rvCorner", sx, sy, sz, 0.145, 0.105, -0.095);
    builder.addPiece("rvCorner", sx, sy, sz, -0.145, 0.105, 0.095);
    builder.addPiece("rvCorner", sx, sy, sz, 0.145, 0.105, 0.095);
    builder.addPiece("rvLid", sx, sy, sz, 0, 0.212, 0, 1, 1, 1, 0, Math.PI * -0.08, 0);
    builder.addPiece("rvGlow", sx, sy, sz, 0, 0.175, 0.096);
    builder.addPiece("rvLock", sx, sy, sz, 0, 0.10, 0.108);
    builder.addPiece("rvHinge", sx, sy, sz, -0.10, 0.175, -0.105);
    builder.addPiece("rvHinge", sx, sy, sz, 0.10, 0.175, -0.105);
  };

  const addLevyCharter: PopulationBureauPartStructureLayout = (sx, sy, sz) => {
    // An upright rolled imperial decree: a heavy parchment cylinder with
    // thick brass caps top and bottom, an iron pedestal ring seating it,
    // and a dark iron band around its middle. Near the lower-middle a
    // short section is unrolled into a small parchment tongue carrying
    // the compact geometric sigil — the only accent, a subtle muted gold
    // glow on the sigil.
    builder.addPiece("lcPedestal", sx, sy, sz, 0, 0.01, 0);
    builder.addPiece("lcCap", sx, sy, sz, 0, 0.0325, 0);
    builder.addPiece("lcRoll", sx, sy, sz, 0, 0.185, 0);
    builder.addPiece("lcBand", sx, sy, sz, 0, 0.185, 0);
    builder.addPiece("lcCap", sx, sy, sz, 0, 0.3375, 0);
    builder.addPiece("lcTongue", sx, sy, sz, 0, 0.115, 0.055, 1, 1, 1, 0, Math.PI * 0.12, 0);
    builder.addPiece("lcSigil", sx, sy, sz, 0, 0.12, 0.062);
  };

  return {
    layouts: {
      POPULATION_BUREAU_PART_1: addCensusEngine,
      POPULATION_BUREAU_PART_2: addRegistryVault,
      POPULATION_BUREAU_PART_3: addLevyCharter
    }
  };
};
