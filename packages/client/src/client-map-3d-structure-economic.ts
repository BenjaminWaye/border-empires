import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry
} from "three";
import type { StructurePieceBuilder } from "./client-map-3d-structure-builder.js";

export type EconomicStructureKind =
  | "FARMSTEAD"
  | "WATERWORKS"
  | "MINE"
  | "TITANIUM_WORKS"
  | "MARKET"
  | "OBSERVATORY"
  | "SEED_GRANARY";

export const ECONOMIC_STRUCTURE_KINDS: ReadonlySet<EconomicStructureKind> = new Set([
  "FARMSTEAD", "WATERWORKS", "MINE", "TITANIUM_WORKS",
  "MARKET", "OBSERVATORY", "SEED_GRANARY"
]);

// Resource hint passed through `addInstance` so the MINE mesh can swap
// its cart load between titanium ore and blue crystals depending on what's
// under the structure. Other kinds ignore it.
export type StructureResourceHint = "TITANIUM" | "GEMS" | undefined;

export type EconomicStructureLayout = (
  sceneX: number,
  surfaceY: number,
  sceneZ: number,
  resource: StructureResourceHint
) => void;

// Shared visual assets that other family files (industrial.ts) reuse so
// FOUNDRY/ADVANCED_TITANIUM_WORKS render with the same forge palette as
// TITANIUM_WORKS, and the crystal synthesizers reuse the OBSERVATORY/MINE
// blue power-crystal material. Sharing keeps "this is the same
// material" readable at a glance and shrinks GPU resource count.
export type EconomicSharedAssets = {
  readonly forgeBaseMaterial: MeshStandardMaterial;
  readonly forgeStoneMaterial: MeshStandardMaterial;
  readonly forgeChimneyMaterial: MeshStandardMaterial;
  readonly forgeGlowMaterial: MeshStandardMaterial;
  readonly barnRoofMaterial: MeshStandardMaterial;
  readonly blueCrystalGeo: OctahedronGeometry;
  readonly blueCrystalMaterial: MeshStandardMaterial;
};

export type EconomicHandle = {
  readonly layouts: Record<EconomicStructureKind, EconomicStructureLayout>;
  readonly shared: EconomicSharedAssets;
};

export const registerEconomicStructures = (
  builder: StructurePieceBuilder
): EconomicHandle => {
  const C = builder.maxTiles;

  // ─── Materials ──────────────────────────────────────────────────────
  const barnRedMaterial = new MeshStandardMaterial({ color: "#a0432e", roughness: 0.88, metalness: 0, flatShading: true });
  const barnRoofMaterial = new MeshStandardMaterial({ color: "#3a261c", roughness: 0.92, metalness: 0, flatShading: true });
  const siloMaterial = new MeshStandardMaterial({ color: "#c8b890", roughness: 0.86, metalness: 0, flatShading: true });
  const woodFenceMaterial = new MeshStandardMaterial({ color: "#5e4530", roughness: 0.92, metalness: 0, flatShading: true });
  const stoneMaterial = new MeshStandardMaterial({ color: "#8a857a", roughness: 0.92, metalness: 0, flatShading: true });
  const stoneRoofMaterial = new MeshStandardMaterial({ color: "#5d574e", roughness: 0.88, metalness: 0, flatShading: true });
  const waterWheelMaterial = new MeshStandardMaterial({ color: "#6a4a32", roughness: 0.88, metalness: 0, flatShading: true });
  const waterMaterial = new MeshStandardMaterial({ color: "#3a8eb8", roughness: 0.32, metalness: 0.18, flatShading: true });
  const mineHillMaterial = new MeshStandardMaterial({ color: "#7a7268", roughness: 0.95, metalness: 0, flatShading: true });
  const mineDarkMaterial = new MeshStandardMaterial({ color: "#1c1c20", roughness: 0.95, metalness: 0, flatShading: true });
  const mineBeamMaterial = new MeshStandardMaterial({ color: "#5a4530", roughness: 0.9, metalness: 0, flatShading: true });
  const mineCartMaterial = new MeshStandardMaterial({ color: "#3a3530", roughness: 0.7, metalness: 0.25, flatShading: true });
  const mineCartWheelMaterial = new MeshStandardMaterial({ color: "#1a1a1c", roughness: 0.6, metalness: 0.3, flatShading: true });
  const oreMaterial = new MeshStandardMaterial({ color: "#8f8f8f", roughness: 0.85, metalness: 0.15, flatShading: true });
  // Titanium Works-family palette. Titanium Works is a synthesizer in border-empires
  // (matches UMBRITE/CRYSTAL_SYNTHESIZER's chamber+glow+tubes idiom rather than
  // the medieval forge-with-anvil). Same palette is reused by industrial.ts
  // for FOUNDRY + ADVANCED_TITANIUM_WORKS via the EconomicSharedAssets export.
  const forgeBaseMaterial = new MeshStandardMaterial({ color: "#3e3a36", roughness: 0.7, metalness: 0.35, flatShading: true });
  const forgeStoneMaterial = new MeshStandardMaterial({ color: "#7c726a", roughness: 0.6, metalness: 0.45, flatShading: true });
  const forgeChimneyMaterial = new MeshStandardMaterial({ color: "#3a302a", roughness: 0.7, metalness: 0.5, flatShading: true });
  const forgeGlowMaterial = new MeshStandardMaterial({ color: "#ff7a2a", roughness: 0.4, metalness: 0, flatShading: true, emissive: "#ff5318", emissiveIntensity: 0.85 });
  const marketCounterMaterial = new MeshStandardMaterial({ color: "#7a5a38", roughness: 0.9, metalness: 0, flatShading: true });
  const marketAwningRedMaterial = new MeshStandardMaterial({ color: "#c53b2c", roughness: 0.86, metalness: 0, flatShading: true });
  const marketAwningWhiteMaterial = new MeshStandardMaterial({ color: "#eadcc2", roughness: 0.86, metalness: 0, flatShading: true });
  const marketPostMaterial = new MeshStandardMaterial({ color: "#5a4530", roughness: 0.9, metalness: 0, flatShading: true });
  const marketCrateMaterial = new MeshStandardMaterial({ color: "#9a6b3a", roughness: 0.88, metalness: 0, flatShading: true });
  const marketProduceMaterial = new MeshStandardMaterial({ color: "#d97f2a", roughness: 0.78, metalness: 0, flatShading: true });
  const observatoryStoneMaterial = new MeshStandardMaterial({ color: "#9a948a", roughness: 0.92, metalness: 0, flatShading: true });
  const observatoryDomeMaterial = new MeshStandardMaterial({ color: "#4a5a72", roughness: 0.55, metalness: 0.35, flatShading: true });
  const observatorySlitMaterial = new MeshStandardMaterial({ color: "#1a1a20", roughness: 0.95, metalness: 0, flatShading: true });
  const observatoryTelescopeMaterial = new MeshStandardMaterial({ color: "#8a6a3a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const blueCrystalMaterial = new MeshStandardMaterial({ color: "#5fa7e6", roughness: 0.35, metalness: 0.2, flatShading: true, emissive: "#2a6fae", emissiveIntensity: 0.55 });
  const granaryWallMaterial = new MeshStandardMaterial({ color: "#dccaa8", roughness: 0.9, metalness: 0, flatShading: true });
  const granaryRoofMaterial = new MeshStandardMaterial({ color: "#d7a64a", roughness: 0.85, metalness: 0, flatShading: true });
  const granaryAnnexRoofMaterial = new MeshStandardMaterial({ color: "#9a9388", roughness: 0.9, metalness: 0, flatShading: true });
  const granaryBandMaterial = new MeshStandardMaterial({ color: "#a77836", roughness: 0.88, metalness: 0, flatShading: true });
  const granaryCupolaMaterial = new MeshStandardMaterial({ color: "#e3d7c6", roughness: 0.9, metalness: 0, flatShading: true });
  const granarySackMaterial = new MeshStandardMaterial({ color: "#b58541", roughness: 0.92, metalness: 0, flatShading: true });
  const seedSiloMaterial = new MeshStandardMaterial({ color: "#cfc4ac", roughness: 0.88, metalness: 0, flatShading: true });
  const seedSiloBandMaterial = new MeshStandardMaterial({ color: "#8a7e6a", roughness: 0.92, metalness: 0, flatShading: true });
  const seedSiloCapMaterial = new MeshStandardMaterial({ color: "#b0683a", roughness: 0.55, metalness: 0.5, flatShading: true });
  const seedLabWallMaterial = new MeshStandardMaterial({ color: "#7a6a52", roughness: 0.9, metalness: 0, flatShading: true });
  const seedLabRoofMaterial = new MeshStandardMaterial({ color: "#3a2e26", roughness: 0.92, metalness: 0, flatShading: true });
  const seedLabGlowMaterial = new MeshStandardMaterial({ color: "#7ad26a", roughness: 0.4, metalness: 0, flatShading: true, emissive: "#3aa648", emissiveIntensity: 0.6 });

  // ─── Geometries ─────────────────────────────────────────────────────
  const barnBodyGeo = new BoxGeometry(0.32, 0.22, 0.22);
  const barnRoofGeo = new ConeGeometry(0.22, 0.14, 4);
  const siloBodyGeo = new CylinderGeometry(0.07, 0.07, 0.28, 10);
  const siloCapGeo = new ConeGeometry(0.075, 0.07, 10);
  const fenceGeo = new BoxGeometry(0.018, 0.06, 0.16);
  const wwTowerGeo = new BoxGeometry(0.22, 0.32, 0.22);
  const wwRoofGeo = new ConeGeometry(0.18, 0.12, 4);
  const wwWheelGeo = new CylinderGeometry(0.13, 0.13, 0.05, 12);
  const wwTroughGeo = new BoxGeometry(0.42, 0.04, 0.06);
  const mineHillGeo = new ConeGeometry(0.30, 0.22, 6);
  const mineEntranceGeo = new BoxGeometry(0.18, 0.16, 0.05);
  const mineBeamGeo = new BoxGeometry(0.20, 0.022, 0.022);
  const mineSupportGeo = new BoxGeometry(0.022, 0.16, 0.022);
  const mineCartGeo = new BoxGeometry(0.13, 0.07, 0.10);
  const mineCartWheelGeo = new CylinderGeometry(0.025, 0.025, 0.022, 8);
  const oreGeo = new IcosahedronGeometry(0.04, 0);
  // Titanium Works-as-synthesizer geometries: industrial chamber on a small
  // base, hot-metal glow window on the front, exhaust tube + vent cap.
  // Same chamber idiom as UMBRITE/CRYSTAL synthesizers in industrial.ts.
  const titaniumBaseGeo = new BoxGeometry(0.20, 0.08, 0.16);
  const titaniumChamberGeo = new CylinderGeometry(0.07, 0.07, 0.18, 12);
  const titaniumChamberCapGeo = new ConeGeometry(0.075, 0.04, 12);
  const titaniumWindowGeo = new BoxGeometry(0.022, 0.10, 0.04);
  const titaniumTubeGeo = new CylinderGeometry(0.010, 0.010, 0.10, 6);
  const titaniumTubeCapGeo = new ConeGeometry(0.012, 0.022, 6);
  const marketCounterGeo = new BoxGeometry(0.40, 0.05, 0.16);
  const marketAwningGeo = new BoxGeometry(0.40, 0.012, 0.10);
  const marketPostGeo = new CylinderGeometry(0.014, 0.014, 0.22, 6);
  const marketCrateGeo = new BoxGeometry(0.07, 0.06, 0.07);
  const marketProduceGeo = new IcosahedronGeometry(0.025, 0);
  const observatoryBaseGeo = new CylinderGeometry(0.14, 0.16, 0.20, 16);
  // SphereGeometry(radius, wSeg, hSeg, phiStart, phiLength, thetaStart,
  // thetaLength) — last two args clip to the upper half for a dome.
  const observatoryDomeGeo = new SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const observatorySlitGeo = new BoxGeometry(0.04, 0.03, 0.18);
  const observatoryTelescopeGeo = new CylinderGeometry(0.018, 0.022, 0.16, 8);
  // Octahedron — same shape family as the GEMS resource overlay so the
  // crystal on the observatory and the crystals in the mine cart read
  // as the same material. Reused later by industrial.ts's crystal
  // synthesizers via the EconomicSharedAssets export.
  const blueCrystalGeo = new OctahedronGeometry(0.045, 0);
  const granaryBodyGeo = new BoxGeometry(0.34, 0.22, 0.24);
  const granaryRoofGeo = new ConeGeometry(0.26, 0.14, 4);
  const granaryBandGeo = new BoxGeometry(0.32, 0.018, 0.018);
  const granaryAnnexBodyGeo = new BoxGeometry(0.14, 0.18, 0.20);
  const granaryAnnexRoofGeo = new ConeGeometry(0.13, 0.07, 4);
  const granaryCupolaGeo = new BoxGeometry(0.05, 0.07, 0.05);
  const granaryCupolaRoofGeo = new ConeGeometry(0.045, 0.04, 4);
  const granarySackGeo = new BoxGeometry(0.06, 0.05, 0.05);
  const seedSiloBodyGeo = new CylinderGeometry(0.06, 0.065, 0.30, 12);
  const seedSiloBandGeo = new CylinderGeometry(0.064, 0.068, 0.022, 12);
  const seedSiloCapGeo = new ConeGeometry(0.07, 0.07, 12);
  const seedLabBodyGeo = new BoxGeometry(0.18, 0.14, 0.14);
  const seedLabRoofGeo = new ConeGeometry(0.13, 0.07, 4);
  const seedLabWindowGeo = new BoxGeometry(0.012, 0.06, 0.08);

  // ─── Slots ─────────────────────────────────────────────────────────
  // Farmstead
  builder.makeSlot("barnBody", barnBodyGeo, barnRedMaterial, C);
  builder.makeSlot("barnRoof", barnRoofGeo, barnRoofMaterial, C);
  builder.makeSlot("siloBody", siloBodyGeo, siloMaterial, C);
  builder.makeSlot("siloCap", siloCapGeo, siloMaterial, C);
  builder.makeSlot("fence", fenceGeo, woodFenceMaterial, C * 4);
  // Waterworks
  builder.makeSlot("wwTower", wwTowerGeo, stoneMaterial, C);
  builder.makeSlot("wwRoof", wwRoofGeo, stoneRoofMaterial, C);
  builder.makeSlot("wwWheel", wwWheelGeo, waterWheelMaterial, C);
  builder.makeSlot("wwTrough", wwTroughGeo, waterMaterial, C);
  // Mine
  builder.makeSlot("mineHill", mineHillGeo, mineHillMaterial, C);
  builder.makeSlot("mineEntrance", mineEntranceGeo, mineDarkMaterial, C);
  builder.makeSlot("mineBeam", mineBeamGeo, mineBeamMaterial, C);
  builder.makeSlot("mineSupport", mineSupportGeo, mineBeamMaterial, C * 2);
  builder.makeSlot("mineCart", mineCartGeo, mineCartMaterial, C);
  builder.makeSlot("mineCartWheel", mineCartWheelGeo, mineCartWheelMaterial, C * 2);
  builder.makeSlot("ore", oreGeo, oreMaterial, C * 3);
  // Titanium Works (synthesizer-style — same forge palette is reused by
  // industrial.ts's FOUNDRY + ADVANCED_TITANIUM_WORKS).
  builder.makeSlot("titaniumBase", titaniumBaseGeo, forgeBaseMaterial, C);
  builder.makeSlot("titaniumChamber", titaniumChamberGeo, forgeStoneMaterial, C);
  builder.makeSlot("titaniumChamberCap", titaniumChamberCapGeo, forgeStoneMaterial, C);
  builder.makeSlot("titaniumWindow", titaniumWindowGeo, forgeGlowMaterial, C);
  builder.makeSlot("titaniumTube", titaniumTubeGeo, forgeChimneyMaterial, C);
  builder.makeSlot("titaniumTubeCap", titaniumTubeCapGeo, forgeChimneyMaterial, C);
  // Market
  builder.makeSlot("marketCounter", marketCounterGeo, marketCounterMaterial, C);
  builder.makeSlot("marketAwningRed", marketAwningGeo, marketAwningRedMaterial, C);
  builder.makeSlot("marketAwningWhite", marketAwningGeo, marketAwningWhiteMaterial, C);
  builder.makeSlot("marketPost", marketPostGeo, marketPostMaterial, C * 2);
  builder.makeSlot("marketCrate", marketCrateGeo, marketCrateMaterial, C * 2);
  builder.makeSlot("marketProduce", marketProduceGeo, marketProduceMaterial, C * 2);
  // Observatory
  builder.makeSlot("observatoryBase", observatoryBaseGeo, observatoryStoneMaterial, C);
  builder.makeSlot("observatoryDome", observatoryDomeGeo, observatoryDomeMaterial, C);
  builder.makeSlot("observatorySlit", observatorySlitGeo, observatorySlitMaterial, C);
  builder.makeSlot("observatoryTelescope", observatoryTelescopeGeo, observatoryTelescopeMaterial, C);
  builder.makeSlot("observatoryCrystal", blueCrystalGeo, blueCrystalMaterial, C);
  builder.makeSlot("mineCrystal", blueCrystalGeo, blueCrystalMaterial, C * 3);
  // Granary
  builder.makeSlot("granaryBody", granaryBodyGeo, granaryWallMaterial, C);
  builder.makeSlot("granaryRoof", granaryRoofGeo, granaryRoofMaterial, C);
  builder.makeSlot("granaryBand", granaryBandGeo, granaryBandMaterial, C * 3);
  builder.makeSlot("granaryAnnexBody", granaryAnnexBodyGeo, granaryAnnexRoofMaterial, C);
  builder.makeSlot("granaryAnnexRoof", granaryAnnexRoofGeo, granaryAnnexRoofMaterial, C);
  builder.makeSlot("granaryCupola", granaryCupolaGeo, granaryCupolaMaterial, C);
  builder.makeSlot("granaryCupolaRoof", granaryCupolaRoofGeo, granaryAnnexRoofMaterial, C);
  builder.makeSlot("granarySack", granarySackGeo, granarySackMaterial, C * 2);
  // Seed granary
  builder.makeSlot("seedSiloBody", seedSiloBodyGeo, seedSiloMaterial, C * 3);
  builder.makeSlot("seedSiloBand", seedSiloBandGeo, seedSiloBandMaterial, C * 3);
  builder.makeSlot("seedSiloCap", seedSiloCapGeo, seedSiloCapMaterial, C * 3);
  builder.makeSlot("seedLabBody", seedLabBodyGeo, seedLabWallMaterial, C);
  builder.makeSlot("seedLabRoof", seedLabRoofGeo, seedLabRoofMaterial, C);
  builder.makeSlot("seedLabWindow", seedLabWindowGeo, seedLabGlowMaterial, C);

  // ─── Layouts ────────────────────────────────────────────────────────
  const addFarmstead: EconomicStructureLayout = (sx, sy, sz) => {
    // Barn + silo + back fence. The crop field comes from the FARM
    // barley field overlay (client-map-3d-barley-field.ts). Both overlays
    // render together on a farmstead tile so the in-game tile reads as
    // "barn on a farm field" — an upgraded farm, not a replacement.
    builder.addPiece("barnBody", sx, sy, sz, -0.10, 0.11, 0.04);
    builder.addPiece("barnRoof", sx, sy, sz, -0.10, 0.29, 0.04, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("siloBody", sx, sy, sz, 0.16, 0.14, 0.04);
    builder.addPiece("siloCap", sx, sy, sz, 0.16, 0.32, 0.04);
    builder.addPiece("fence", sx, sy, sz, -0.18, 0.03, -0.18);
    builder.addPiece("fence", sx, sy, sz, -0.02, 0.03, -0.18);
    builder.addPiece("fence", sx, sy, sz, 0.14, 0.03, -0.18);
    builder.addPiece("fence", sx, sy, sz, 0.30, 0.03, -0.18);
  };

  const addWaterworks: EconomicStructureLayout = (sx, sy, sz) => {
    builder.addPiece("wwTower", sx, sy, sz, -0.06, 0.16, 0);
    builder.addPiece("wwRoof", sx, sy, sz, -0.06, 0.38, 0, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("wwWheel", sx, sy, sz, 0.16, 0.14, 0, 1, 1, 1, 0, 0, Math.PI * 0.5);
    builder.addPiece("wwTrough", sx, sy, sz, 0, 0.04, 0.18);
  };

  const addMine: EconomicStructureLayout = (sx, sy, sz, resource) => {
    builder.addPiece("mineHill", sx, sy, sz, 0, 0.11, -0.10);
    builder.addPiece("mineEntrance", sx, sy, sz, 0, 0.08, 0.04);
    builder.addPiece("mineSupport", sx, sy, sz, -0.10, 0.08, 0.02);
    builder.addPiece("mineSupport", sx, sy, sz, 0.10, 0.08, 0.02);
    builder.addPiece("mineBeam", sx, sy, sz, 0, 0.165, 0.02);
    builder.addPiece("mineCart", sx, sy, sz, 0.14, 0.07, 0.22);
    builder.addPiece("mineCartWheel", sx, sy, sz, 0.08, 0.04, 0.22, 1, 1, 1, 0, 0, Math.PI * 0.5);
    builder.addPiece("mineCartWheel", sx, sy, sz, 0.20, 0.04, 0.22, 1, 1, 1, 0, 0, Math.PI * 0.5);
    if (resource === "GEMS") {
      // Three blue crystals jutting from the cart at random tilts.
      builder.addPiece("mineCrystal", sx, sy, sz, 0.10, 0.12, 0.22, 0.8, 1.2, 0.8, 0, Math.PI * 0.05, Math.PI * 0.08);
      builder.addPiece("mineCrystal", sx, sy, sz, 0.18, 0.13, 0.22, 0.9, 1.4, 0.9, 0, -Math.PI * 0.04, -Math.PI * 0.06);
      builder.addPiece("mineCrystal", sx, sy, sz, 0.14, 0.16, 0.21, 0.7, 1.0, 0.7, Math.PI * 0.15, 0, 0);
    } else {
      builder.addPiece("ore", sx, sy, sz, 0.10, 0.10, 0.22);
      builder.addPiece("ore", sx, sy, sz, 0.16, 0.10, 0.22);
      builder.addPiece("ore", sx, sy, sz, 0.13, 0.13, 0.22);
    }
  };

  const addTitaniumWorks: EconomicStructureLayout = (sx, sy, sz) => {
    // Single synthesizer chamber: dark steel base, brushed-steel
    // cylinder body with a domed cap, hot-metal orange glow window
    // facing the camera, exhaust tube + vent cap on top.
    builder.addPiece("titaniumBase", sx, sy, sz, 0, 0.04, 0);
    builder.addPiece("titaniumChamber", sx, sy, sz, 0, 0.17, 0);
    builder.addPiece("titaniumChamberCap", sx, sy, sz, 0, 0.28, 0);
    builder.addPiece("titaniumWindow", sx, sy, sz, 0.05, 0.17, 0.05);
    builder.addPiece("titaniumTube", sx, sy, sz, 0, 0.35, 0);
    builder.addPiece("titaniumTubeCap", sx, sy, sz, 0, 0.41, 0);
  };

  const addMarket: EconomicStructureLayout = (sx, sy, sz) => {
    builder.addPiece("marketCounter", sx, sy, sz, 0, 0.04, 0.04);
    builder.addPiece("marketPost", sx, sy, sz, -0.18, 0.11, 0.10);
    builder.addPiece("marketPost", sx, sy, sz, 0.18, 0.11, 0.10);
    builder.addPiece("marketAwningRed", sx, sy, sz, 0, 0.22, 0.02, 1, 1, 1, 0, Math.PI * 0.10, 0);
    builder.addPiece("marketAwningWhite", sx, sy, sz, 0, 0.24, 0.10, 1, 1, 1, 0, Math.PI * 0.10, 0);
    builder.addPiece("marketCrate", sx, sy, sz, -0.12, 0.10, -0.04);
    builder.addPiece("marketProduce", sx, sy, sz, -0.12, 0.15, -0.04);
    builder.addPiece("marketCrate", sx, sy, sz, 0.12, 0.10, -0.04);
    builder.addPiece("marketProduce", sx, sy, sz, 0.12, 0.15, -0.04);
  };

  const addObservatory: EconomicStructureLayout = (sx, sy, sz) => {
    builder.addPiece("observatoryBase", sx, sy, sz, 0, 0.10, 0);
    builder.addPiece("observatoryDome", sx, sy, sz, 0, 0.20, 0);
    builder.addPiece("observatorySlit", sx, sy, sz, 0, 0.22, 0);
    builder.addPiece("observatoryTelescope", sx, sy, sz, 0.02, 0.28, 0.05, 1, 1, 1, 0, Math.PI * 0.18, 0);
    builder.addPiece("observatoryCrystal", sx, sy, sz, -0.09, 0.27, -0.05, 0.9, 1.6, 0.9, 0, 0, -Math.PI * 0.12);
  };

  const addSeedGranary: EconomicStructureLayout = (sx, sy, sz) => {
    const silos: ReadonlyArray<readonly [number, number]> = [
      [-0.18, -0.08],
      [0.00, -0.10],
      [0.18, -0.08]
    ];
    for (const [ox, oz] of silos) {
      builder.addPiece("seedSiloBody", sx, sy, sz, ox, 0.15, oz);
      builder.addPiece("seedSiloBand", sx, sy, sz, ox, 0.22, oz);
      builder.addPiece("seedSiloCap", sx, sy, sz, ox, 0.335, oz);
    }
    builder.addPiece("seedLabBody", sx, sy, sz, 0, 0.07, 0.16);
    builder.addPiece("seedLabRoof", sx, sy, sz, 0, 0.175, 0.16, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("seedLabWindow", sx, sy, sz, 0, 0.07, 0.235);
  };

  return {
    layouts: {
      FARMSTEAD: addFarmstead,
      WATERWORKS: addWaterworks,
      MINE: addMine,
      TITANIUM_WORKS: addTitaniumWorks,
      MARKET: addMarket,
      OBSERVATORY: addObservatory,
      SEED_GRANARY: addSeedGranary
    },
    shared: {
      forgeBaseMaterial,
      forgeStoneMaterial,
      forgeChimneyMaterial,
      forgeGlowMaterial,
      barnRoofMaterial,
      blueCrystalGeo,
      blueCrystalMaterial
    }
  };
};
