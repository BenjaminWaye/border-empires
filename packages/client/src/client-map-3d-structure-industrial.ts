import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  OctahedronGeometry
} from "three";
import type { StructurePieceBuilder } from "./client-map-3d-structure-builder.js";
import type { EconomicSharedAssets } from "./client-map-3d-structure-economic.js";

export type IndustrialStructureKind =
  | "FOUNDRY"
  | "ADVANCED_IRONWORKS"
  | "FUR_SYNTHESIZER"
  | "ADVANCED_FUR_SYNTHESIZER"
  | "CRYSTAL_SYNTHESIZER"
  | "ADVANCED_CRYSTAL_SYNTHESIZER"
  | "ASTRAL_DOCK";

export const INDUSTRIAL_STRUCTURE_KINDS: ReadonlySet<IndustrialStructureKind> = new Set([
  "FOUNDRY",
  "ADVANCED_IRONWORKS",
  "FUR_SYNTHESIZER",
  "ADVANCED_FUR_SYNTHESIZER",
  "CRYSTAL_SYNTHESIZER",
  "ADVANCED_CRYSTAL_SYNTHESIZER",
  "ASTRAL_DOCK"
]);

export type IndustrialStructureLayout = (sceneX: number, surfaceY: number, sceneZ: number) => void;

export type IndustrialHandle = {
  readonly layouts: Record<IndustrialStructureKind, IndustrialStructureLayout>;
};

// `shared` carries the forge palette + blueCrystal assets from the
// economic family so FOUNDRY/ADVANCED_IRONWORKS render with the same
// forge palette as IRONWORKS, and the crystal synthesizers reuse the
// OBSERVATORY/MINE crystal material.
export const registerIndustrialStructures = (
  builder: StructurePieceBuilder,
  shared: EconomicSharedAssets
): IndustrialHandle => {
  const C = builder.maxTiles;

  // ─── Materials ──────────────────────────────────────────────────────
  const slagMaterial = new MeshStandardMaterial({ color: "#5a3028", roughness: 0.86, metalness: 0.12, flatShading: true, emissive: "#ff4a12", emissiveIntensity: 0.35 });
  const synthBaseMaterial = new MeshStandardMaterial({ color: "#3e4248", roughness: 0.7, metalness: 0.35, flatShading: true });
  const synthChamberMaterial = new MeshStandardMaterial({ color: "#b6bcc0", roughness: 0.5, metalness: 0.55, flatShading: true });
  const synthTubeMaterial = new MeshStandardMaterial({ color: "#5a5e62", roughness: 0.6, metalness: 0.5, flatShading: true });
  const furGlowMaterial = new MeshStandardMaterial({ color: "#f0a662", roughness: 0.35, metalness: 0.1, flatShading: true, emissive: "#c95a18", emissiveIntensity: 0.85 });
  const crystalChamberMaterial = new MeshStandardMaterial({ color: "#9cd6e8", roughness: 0.4, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.55, emissive: "#2a8eb8", emissiveIntensity: 0.55, depthWrite: false });
  const astralPadMaterial = new MeshStandardMaterial({ color: "#221a2e", roughness: 0.84, metalness: 0.18, flatShading: true });
  const astralRingMaterial = new MeshStandardMaterial({ color: "#88d8f0", roughness: 0.4, metalness: 0.15, flatShading: true, emissive: "#2a8ec0", emissiveIntensity: 0.95 });
  const astralArchMaterial = new MeshStandardMaterial({ color: "#3a3146", roughness: 0.7, metalness: 0.35, flatShading: true });
  const astralSpireMaterial = new MeshStandardMaterial({ color: "#2c2438", roughness: 0.6, metalness: 0.55, flatShading: true });
  const astralCoreMaterial = new MeshStandardMaterial({ color: "#c08aff", roughness: 0.3, metalness: 0.25, flatShading: true, emissive: "#7a3acc", emissiveIntensity: 1.0 });

  // ─── Geometries ─────────────────────────────────────────────────────
  // ADV_IRONWORKS uses the synthesizer-chamber idiom (same as IRONWORKS
  // in economic.ts and FUR/CRYSTAL synthesizers here) so the
  // ironworks family stays visually coherent.
  const ironSynthAdvBaseGeo = new BoxGeometry(0.32, 0.10, 0.18);
  const ironSynthChamberGeo = new CylinderGeometry(0.07, 0.07, 0.18, 12);
  const ironSynthChamberCapGeo = new ConeGeometry(0.075, 0.04, 12);
  const ironSynthWindowGeo = new BoxGeometry(0.022, 0.10, 0.04);
  const ironSynthTubeGeo = new CylinderGeometry(0.010, 0.010, 0.10, 6);
  const ironSynthTubeCapGeo = new ConeGeometry(0.012, 0.022, 6);
  // FOUNDRY keeps the original forge silhouette — wider stone base,
  // pyramidal roof, tall stone furnace, twin chimneys, and a glowing
  // slag pile. Foundry and ironworks are *not* the same thing: a
  // foundry casts metal; ironworks (synthesizer) extracts/refines it.
  const foundryBaseGeo = new BoxGeometry(0.40, 0.20, 0.30);
  const foundryRoofGeo = new ConeGeometry(0.28, 0.10, 4);
  const foundryFurnaceGeo = new BoxGeometry(0.20, 0.24, 0.18);
  const foundryGlowGeo = new BoxGeometry(0.08, 0.08, 0.08);
  const foundryChimneyGeo = new BoxGeometry(0.07, 0.34, 0.07);
  const slagPileGeo = new ConeGeometry(0.08, 0.05, 6);
  const synthBaseGeo = new BoxGeometry(0.20, 0.08, 0.16);
  const synthAdvBaseGeo = new BoxGeometry(0.32, 0.10, 0.18);
  const synthChamberGeo = new CylinderGeometry(0.07, 0.07, 0.18, 12);
  const synthChamberCapGeo = new ConeGeometry(0.075, 0.04, 12);
  const synthWindowGeo = new BoxGeometry(0.022, 0.10, 0.04);
  const synthTubeGeo = new CylinderGeometry(0.010, 0.010, 0.10, 6);
  const synthTubeCapGeo = new ConeGeometry(0.012, 0.022, 6);
  const crystalChamberGeo = new CylinderGeometry(0.075, 0.075, 0.18, 12);
  const crystalCoreGeo = new OctahedronGeometry(0.045, 0);
  const astralPadGeo = new CylinderGeometry(0.22, 0.24, 0.03, 20);
  const astralRingGeo = new CylinderGeometry(0.18, 0.18, 0.014, 24);
  const astralArchGeo = new CylinderGeometry(0.012, 0.012, 0.30, 6);
  const astralSpireGeo = new ConeGeometry(0.040, 0.18, 8);
  const astralCoreGeo = new OctahedronGeometry(0.05, 0);

  // ─── Slots ─────────────────────────────────────────────────────────
  // ADV_IRONWORKS twin-chamber synthesizer slots.
  builder.makeSlot("ironSynthAdvBase", ironSynthAdvBaseGeo, shared.forgeBaseMaterial, C);
  builder.makeSlot("ironSynthChamber", ironSynthChamberGeo, shared.forgeStoneMaterial, C * 2);
  builder.makeSlot("ironSynthChamberCap", ironSynthChamberCapGeo, shared.forgeStoneMaterial, C * 2);
  builder.makeSlot("ironSynthWindow", ironSynthWindowGeo, shared.forgeGlowMaterial, C * 2);
  builder.makeSlot("ironSynthTube", ironSynthTubeGeo, shared.forgeChimneyMaterial, C * 3);
  builder.makeSlot("ironSynthTubeCap", ironSynthTubeCapGeo, shared.forgeChimneyMaterial, C * 3);
  // FOUNDRY forge-style slots — distinct silhouette from the iron-synth
  // family. Uses shared forge palette but renders as a forge building.
  builder.makeSlot("foundryBase", foundryBaseGeo, shared.forgeBaseMaterial, C);
  builder.makeSlot("foundryRoof", foundryRoofGeo, shared.barnRoofMaterial, C);
  builder.makeSlot("foundryFurnace", foundryFurnaceGeo, shared.forgeStoneMaterial, C);
  builder.makeSlot("foundryGlow", foundryGlowGeo, shared.forgeGlowMaterial, C);
  builder.makeSlot("foundryChimney", foundryChimneyGeo, shared.forgeChimneyMaterial, C * 2);
  builder.makeSlot("slagPile", slagPileGeo, slagMaterial, C);
  // Synthesizer family — caps sized for advanced (2× capacity for
  // shared pieces). Materials shared between basic and advanced.
  builder.makeSlot("synthBase", synthBaseGeo, synthBaseMaterial, C);
  builder.makeSlot("synthAdvBase", synthAdvBaseGeo, synthBaseMaterial, C);
  builder.makeSlot("synthChamber", synthChamberGeo, synthChamberMaterial, C * 2);
  builder.makeSlot("synthChamberCap", synthChamberCapGeo, synthChamberMaterial, C * 2);
  builder.makeSlot("furWindow", synthWindowGeo, furGlowMaterial, C * 2);
  builder.makeSlot("synthTube", synthTubeGeo, synthTubeMaterial, C * 3);
  builder.makeSlot("synthTubeCap", synthTubeCapGeo, synthTubeMaterial, C * 3);
  builder.makeSlot("crystalChamber", crystalChamberGeo, crystalChamberMaterial, C * 2);
  // Crystal core reuses the shared blueCrystal material from
  // OBSERVATORY/MINE so the visual language is consistent.
  builder.makeSlot("crystalCore", crystalCoreGeo, shared.blueCrystalMaterial, C * 3);
  // Astral dock
  builder.makeSlot("astralPad", astralPadGeo, astralPadMaterial, C);
  builder.makeSlot("astralRing", astralRingGeo, astralRingMaterial, C);
  builder.makeSlot("astralArch", astralArchGeo, astralArchMaterial, C * 4);
  builder.makeSlot("astralSpire", astralSpireGeo, astralSpireMaterial, C);
  builder.makeSlot("astralCore", astralCoreGeo, astralCoreMaterial, C);

  // ─── Layouts ────────────────────────────────────────────────────────
  const addIronSynthDual = (sx: number, sy: number, sz: number): void => {
    // Twin synthesizer chambers on a wide dark-steel base. Two main
    // exhaust tubes vent upward and a third smaller tube sits between
    // them as a central control vent — same pattern as
    // ADVANCED_FUR_SYNTHESIZER but with hot-iron glow windows.
    builder.addPiece("ironSynthAdvBase", sx, sy, sz, 0, 0.05, 0);
    builder.addPiece("ironSynthChamber", sx, sy, sz, -0.08, 0.19, 0);
    builder.addPiece("ironSynthChamberCap", sx, sy, sz, -0.08, 0.30, 0);
    builder.addPiece("ironSynthWindow", sx, sy, sz, -0.03, 0.19, 0.05);
    builder.addPiece("ironSynthChamber", sx, sy, sz, 0.08, 0.19, 0);
    builder.addPiece("ironSynthChamberCap", sx, sy, sz, 0.08, 0.30, 0);
    builder.addPiece("ironSynthWindow", sx, sy, sz, 0.13, 0.19, 0.05);
    builder.addPiece("ironSynthTube", sx, sy, sz, -0.08, 0.37, 0);
    builder.addPiece("ironSynthTubeCap", sx, sy, sz, -0.08, 0.43, 0);
    builder.addPiece("ironSynthTube", sx, sy, sz, 0.08, 0.37, 0);
    builder.addPiece("ironSynthTubeCap", sx, sy, sz, 0.08, 0.43, 0);
    builder.addPiece("ironSynthTube", sx, sy, sz, 0, 0.32, 0.06, 0.8, 0.6, 0.8);
  };

  const addAdvancedIronworks: IndustrialStructureLayout = (sx, sy, sz) => {
    addIronSynthDual(sx, sy, sz);
  };

  const addFoundry: IndustrialStructureLayout = (sx, sy, sz) => {
    // Classic forge: stone base + pyramidal roof + tall stone furnace
    // with a hot glow window, twin chimneys at the back, and a glowing
    // slag pile out front. Casting metal, not refining it — distinct
    // silhouette from the synthesizer-style ironworks family.
    builder.addPiece("foundryBase", sx, sy, sz, -0.08, 0.10, -0.04);
    builder.addPiece("foundryRoof", sx, sy, sz, -0.08, 0.27, -0.04, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("foundryFurnace", sx, sy, sz, 0.20, 0.12, -0.04);
    builder.addPiece("foundryGlow", sx, sy, sz, 0.20, 0.08, 0.06);
    builder.addPiece("foundryChimney", sx, sy, sz, 0.16, 0.34, -0.10);
    builder.addPiece("foundryChimney", sx, sy, sz, 0.24, 0.34, -0.10);
    builder.addPiece("slagPile", sx, sy, sz, -0.20, 0.025, 0.18);
  };

  const addFurSynthesizer: IndustrialStructureLayout = (sx, sy, sz) => {
    builder.addPiece("synthBase", sx, sy, sz, 0, 0.04, 0);
    builder.addPiece("synthChamber", sx, sy, sz, 0, 0.17, 0);
    builder.addPiece("synthChamberCap", sx, sy, sz, 0, 0.28, 0);
    builder.addPiece("furWindow", sx, sy, sz, 0.05, 0.17, 0.05);
    builder.addPiece("synthTube", sx, sy, sz, 0, 0.35, 0);
    builder.addPiece("synthTubeCap", sx, sy, sz, 0, 0.41, 0);
  };

  const addAdvancedFurSynthesizer: IndustrialStructureLayout = (sx, sy, sz) => {
    builder.addPiece("synthAdvBase", sx, sy, sz, 0, 0.05, 0);
    builder.addPiece("synthChamber", sx, sy, sz, -0.08, 0.19, 0);
    builder.addPiece("synthChamberCap", sx, sy, sz, -0.08, 0.30, 0);
    builder.addPiece("furWindow", sx, sy, sz, -0.03, 0.19, 0.05);
    builder.addPiece("synthChamber", sx, sy, sz, 0.08, 0.19, 0);
    builder.addPiece("synthChamberCap", sx, sy, sz, 0.08, 0.30, 0);
    builder.addPiece("furWindow", sx, sy, sz, 0.13, 0.19, 0.05);
    builder.addPiece("synthTube", sx, sy, sz, -0.08, 0.37, 0);
    builder.addPiece("synthTubeCap", sx, sy, sz, -0.08, 0.43, 0);
    builder.addPiece("synthTube", sx, sy, sz, 0.08, 0.37, 0);
    builder.addPiece("synthTubeCap", sx, sy, sz, 0.08, 0.43, 0);
    builder.addPiece("synthTube", sx, sy, sz, 0, 0.32, 0.06, 0.8, 0.6, 0.8);
  };

  const addCrystalSynthesizer: IndustrialStructureLayout = (sx, sy, sz) => {
    builder.addPiece("synthBase", sx, sy, sz, 0, 0.04, 0);
    builder.addPiece("crystalChamber", sx, sy, sz, 0, 0.17, 0);
    builder.addPiece("synthChamberCap", sx, sy, sz, 0, 0.28, 0);
    builder.addPiece("crystalCore", sx, sy, sz, 0, 0.16, 0, 1, 1.8, 1);
    builder.addPiece("synthTube", sx, sy, sz, 0, 0.35, 0);
    builder.addPiece("synthTubeCap", sx, sy, sz, 0, 0.41, 0);
  };

  const addAdvancedCrystalSynthesizer: IndustrialStructureLayout = (sx, sy, sz) => {
    builder.addPiece("synthAdvBase", sx, sy, sz, 0, 0.05, 0);
    builder.addPiece("crystalChamber", sx, sy, sz, -0.08, 0.19, 0);
    builder.addPiece("synthChamberCap", sx, sy, sz, -0.08, 0.30, 0);
    builder.addPiece("crystalCore", sx, sy, sz, -0.08, 0.18, 0, 1, 1.6, 1);
    builder.addPiece("crystalChamber", sx, sy, sz, 0.08, 0.19, 0);
    builder.addPiece("synthChamberCap", sx, sy, sz, 0.08, 0.30, 0);
    builder.addPiece("crystalCore", sx, sy, sz, 0.08, 0.18, 0, 1, 1.6, 1);
    builder.addPiece("crystalCore", sx, sy, sz, 0, 0.36, 0, 1.4, 1.8, 1.4, Math.PI * 0.15, 0, 0);
    builder.addPiece("synthTube", sx, sy, sz, -0.08, 0.37, 0);
    builder.addPiece("synthTubeCap", sx, sy, sz, -0.08, 0.43, 0);
    builder.addPiece("synthTube", sx, sy, sz, 0.08, 0.37, 0);
    builder.addPiece("synthTubeCap", sx, sy, sz, 0.08, 0.43, 0);
  };

  const addAstralDock: IndustrialStructureLayout = (sx, sy, sz) => {
    builder.addPiece("astralPad", sx, sy, sz, 0, 0.015, 0);
    builder.addPiece("astralRing", sx, sy, sz, 0, 0.034, 0);
    const archOffsets: ReadonlyArray<readonly [number, number, number, number]> = [
      [0.15, 0.15, -Math.PI * 0.11, -Math.PI * 0.11],
      [-0.15, 0.15, -Math.PI * 0.11, Math.PI * 0.11],
      [0.15, -0.15, Math.PI * 0.11, -Math.PI * 0.11],
      [-0.15, -0.15, Math.PI * 0.11, Math.PI * 0.11]
    ];
    for (const [ox, oz, rotX, rotZ] of archOffsets) {
      builder.addPiece("astralArch", sx, sy, sz, ox, 0.18, oz, 1, 1, 1, 0, rotX, rotZ);
    }
    builder.addPiece("astralSpire", sx, sy, sz, 0, 0.13, 0);
    builder.addPiece("astralCore", sx, sy, sz, 0, 0.28, 0, 1, 1.4, 1);
  };

  return {
    layouts: {
      FOUNDRY: addFoundry,
      ADVANCED_IRONWORKS: addAdvancedIronworks,
      FUR_SYNTHESIZER: addFurSynthesizer,
      ADVANCED_FUR_SYNTHESIZER: addAdvancedFurSynthesizer,
      CRYSTAL_SYNTHESIZER: addCrystalSynthesizer,
      ADVANCED_CRYSTAL_SYNTHESIZER: addAdvancedCrystalSynthesizer,
      ASTRAL_DOCK: addAstralDock
    }
  };
};
