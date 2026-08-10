import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry
} from "three";
import type { StructurePieceBuilder } from "./client-map-3d-structure-builder.js";

export type LateGameStructureKind =
  | "AEGIS_DOME"
  | "WORLD_ENGINE"
  | "IMPERIAL_EXCHANGE";

export const LATE_GAME_STRUCTURE_KINDS: ReadonlySet<LateGameStructureKind> = new Set([
  "AEGIS_DOME", "WORLD_ENGINE", "IMPERIAL_EXCHANGE"
]);

export type LateGameStructureLayout = (sceneX: number, surfaceY: number, sceneZ: number) => void;

export type LateGameHandle = {
  readonly layouts: Record<LateGameStructureKind, LateGameStructureLayout>;
};

export const registerLateGameStructures = (
  builder: StructurePieceBuilder
): LateGameHandle => {
  const C = builder.maxTiles;

  // ─── Materials ──────────────────────────────────────────────────────
  const bankWallMaterial = new MeshStandardMaterial({ color: "#cabb98", roughness: 0.9, metalness: 0, flatShading: true });
  const bankTrimMaterial = new MeshStandardMaterial({ color: "#ece2cf", roughness: 0.88, metalness: 0, flatShading: true });
  const bankCoinMaterial = new MeshStandardMaterial({ color: "#e7c14a", roughness: 0.4, metalness: 0.65, flatShading: true, emissive: "#8a6512", emissiveIntensity: 0.25 });
  const aetherStoneMaterial = new MeshStandardMaterial({ color: "#4a4258", roughness: 0.9, metalness: 0.05, flatShading: true });
  const aetherCrownMaterial = new MeshStandardMaterial({ color: "#7a6a96", roughness: 0.6, metalness: 0.4, flatShading: true });
  const aetherCrystalMaterial = new MeshStandardMaterial({ color: "#b888ff", roughness: 0.3, metalness: 0.2, flatShading: true, emissive: "#7a3acc", emissiveIntensity: 0.85 });
  const aegisStoneMaterial = new MeshStandardMaterial({ color: "#8c8c92", roughness: 0.92, metalness: 0, flatShading: true });
  const aegisCoreMaterial = new MeshStandardMaterial({ color: "#2c2e34", roughness: 0.5, metalness: 0.6, flatShading: true });
  const aegisDomeMaterial = new MeshStandardMaterial({ color: "#7ad9f0", roughness: 0.35, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.45, emissive: "#2a9ec0", emissiveIntensity: 0.55, depthWrite: false });
  const aegisCrystalMaterial = new MeshStandardMaterial({ color: "#9ce8f8", roughness: 0.3, metalness: 0.2, flatShading: true, emissive: "#2a9ec0", emissiveIntensity: 0.8 });
  const worldEngineStoneMaterial = new MeshStandardMaterial({ color: "#8a7a5a", roughness: 0.94, metalness: 0.02, flatShading: true });
  const worldEngineDarkMaterial = new MeshStandardMaterial({ color: "#2a241e", roughness: 0.86, metalness: 0.1, flatShading: true });
  const worldEngineCoreMaterial = new MeshStandardMaterial({ color: "#ffd34a", roughness: 0.25, metalness: 0.4, flatShading: true, emissive: "#d68a18", emissiveIntensity: 0.95 });
  const exchangeMarbleMaterial = new MeshStandardMaterial({ color: "#eee6d2", roughness: 0.78, metalness: 0.05, flatShading: true });
  const exchangeColumnMaterial = new MeshStandardMaterial({ color: "#f6f0df", roughness: 0.76, metalness: 0.05, flatShading: true });
  const exchangeDomeMaterial = new MeshStandardMaterial({ color: "#e8b840", roughness: 0.35, metalness: 0.65, flatShading: true, emissive: "#7a5210", emissiveIntensity: 0.18 });
  const shieldLatticeFrameMaterial = new MeshStandardMaterial({ color: "#1e1f22", roughness: 0.9, metalness: 0.7, flatShading: true });
  const shieldLatticeBrassMaterial = new MeshStandardMaterial({ color: "#b8956a", roughness: 0.7, metalness: 0.55, flatShading: true });
  const shieldLatticePanelMaterial = new MeshStandardMaterial({ color: "#5a5a5e", roughness: 0.85, metalness: 0.15, flatShading: true });
  const shieldLatticeActiveMaterial = new MeshStandardMaterial({ color: "#7ad9f0", roughness: 0.25, metalness: 0.1, flatShading: true, emissive: "#2a9ec0", emissiveIntensity: 0.9, transparent: true, opacity: 0.85, depthWrite: false });
  const wardAnchorIronMaterial = new MeshStandardMaterial({ color: "#1a1b1e", roughness: 0.88, metalness: 0.75, flatShading: true });
  const wardAnchorBrassMaterial = new MeshStandardMaterial({ color: "#b8956a", roughness: 0.65, metalness: 0.5, flatShading: true });
  const wardAnchorFittingMaterial = new MeshStandardMaterial({ color: "#4a4a4e", roughness: 0.82, metalness: 0.2, flatShading: true });
  const wardAnchorOrbMaterial = new MeshStandardMaterial({ color: "#7ad9f0", roughness: 0.3, metalness: 0.1, flatShading: true, emissive: "#2a9ec0", emissiveIntensity: 1.0, transparent: true, opacity: 0.9, depthWrite: false });
  const aegisCrownIronMaterial = new MeshStandardMaterial({ color: "#1e1f22", roughness: 0.9, metalness: 0.7, flatShading: true });
  const aegisCrownBrassMaterial = new MeshStandardMaterial({ color: "#b8956a", roughness: 0.6, metalness: 0.55, flatShading: true });
  const aegisCrownRingMaterial = new MeshStandardMaterial({ color: "#5a5a5e", roughness: 0.8, metalness: 0.2, flatShading: true });
  const aegisCrownDomeMaterial = new MeshStandardMaterial({ color: "#7ad9f0", roughness: 0.3, metalness: 0.1, flatShading: true, emissive: "#2a9ec0", emissiveIntensity: 0.85, transparent: true, opacity: 0.7, depthWrite: false });

  // ─── Geometries ─────────────────────────────────────────────────────
  const bankBodyGeo = new BoxGeometry(0.32, 0.18, 0.22);
  const bankStepGeo = new BoxGeometry(0.38, 0.04, 0.10);
  const bankRoofGeo = new ConeGeometry(0.22, 0.10, 4);
  const bankColumnGeo = new CylinderGeometry(0.022, 0.022, 0.16, 10);
  const bankCoinGeo = new CylinderGeometry(0.04, 0.04, 0.025, 12);
  const aetherBaseGeo = new CylinderGeometry(0.10, 0.12, 0.05, 12);
  const aetherShaftGeo = new CylinderGeometry(0.06, 0.075, 0.40, 10);
  const aetherCrownGeo = new CylinderGeometry(0.085, 0.07, 0.035, 12);
  const aetherCrystalGeo = new OctahedronGeometry(0.05, 0);
  const aegisBaseGeo = new CylinderGeometry(0.22, 0.24, 0.04, 18);
  const aegisCoreGeo = new BoxGeometry(0.10, 0.08, 0.10);
  const aegisDomeGeo = new SphereGeometry(0.20, 18, 9, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const aegisPylonGeo = new CylinderGeometry(0.018, 0.022, 0.10, 6);
  const aegisPylonTipGeo = new OctahedronGeometry(0.028, 0);
  const worldEngineTier1Geo = new BoxGeometry(0.44, 0.10, 0.32);
  const worldEngineTier2Geo = new BoxGeometry(0.30, 0.10, 0.22);
  const worldEngineTier3Geo = new BoxGeometry(0.18, 0.10, 0.14);
  const worldEngineSpireGeo = new CylinderGeometry(0.022, 0.045, 0.22, 8);
  const worldEngineCoreGeo = new OctahedronGeometry(0.08, 0);
  const exchangeBaseGeo = new CylinderGeometry(0.22, 0.24, 0.04, 18);
  const exchangeDrumGeo = new CylinderGeometry(0.16, 0.16, 0.18, 18);
  const exchangeDomeGeo = new SphereGeometry(0.16, 18, 9, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const exchangeColumnGeo = new CylinderGeometry(0.020, 0.020, 0.18, 8);
  const exchangeFinialGeo = new ConeGeometry(0.030, 0.06, 12);
  const shieldLatticePanelGeo = new CylinderGeometry(0.22, 0.22, 0.12, 6, 1, true, 0, Math.PI * 0.6);
  const shieldLatticeCellGeo = new CylinderGeometry(0.035, 0.035, 0.025, 6);
  const shieldLatticeActiveCellGeo = new CylinderGeometry(0.035, 0.035, 0.025, 6);
  const shieldLatticeFrameGeo = new TorusGeometry(0.22, 0.012, 6, 12, Math.PI * 0.6);
  const wardAnchorSpikeGeo = new ConeGeometry(0.045, 0.35, 8);
  const wardAnchorBandGeo = new CylinderGeometry(0.05, 0.05, 0.015, 8);
  const wardAnchorCageGeo = new CylinderGeometry(0.08, 0.08, 0.12, 8, 1, true);
  const wardAnchorOrbGeo = new OctahedronGeometry(0.045, 0);
  const aegisCrownDomeGeo = new SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45);
  const aegisCrownRingGeo = new CylinderGeometry(0.14, 0.14, 0.025, 16);
  const aegisCrownSpikeGeo = new ConeGeometry(0.018, 0.10, 6);
  const aegisCrownBaseGeo = new CylinderGeometry(0.18, 0.20, 0.04, 16);

  // ─── Slots ─────────────────────────────────────────────────────────
  builder.makeSlot("bankBody", bankBodyGeo, bankWallMaterial, C);
  builder.makeSlot("bankStep", bankStepGeo, bankTrimMaterial, C);
  builder.makeSlot("bankRoof", bankRoofGeo, bankTrimMaterial, C);
  builder.makeSlot("bankColumn", bankColumnGeo, bankTrimMaterial, C * 2);
  builder.makeSlot("bankCoin", bankCoinGeo, bankCoinMaterial, C);
  builder.makeSlot("aetherBase", aetherBaseGeo, aetherCrownMaterial, C);
  builder.makeSlot("aetherShaft", aetherShaftGeo, aetherStoneMaterial, C);
  builder.makeSlot("aetherCrown", aetherCrownGeo, aetherCrownMaterial, C);
  builder.makeSlot("aetherCrystal", aetherCrystalGeo, aetherCrystalMaterial, C);
  builder.makeSlot("aegisBase", aegisBaseGeo, aegisStoneMaterial, C);
  builder.makeSlot("aegisCore", aegisCoreGeo, aegisCoreMaterial, C);
  builder.makeSlot("aegisDome", aegisDomeGeo, aegisDomeMaterial, C);
  builder.makeSlot("aegisPylon", aegisPylonGeo, aegisStoneMaterial, C * 4);
  builder.makeSlot("aegisPylonTip", aegisPylonTipGeo, aegisCrystalMaterial, C * 4);
  builder.makeSlot("worldEngineTier1", worldEngineTier1Geo, worldEngineStoneMaterial, C);
  builder.makeSlot("worldEngineTier2", worldEngineTier2Geo, worldEngineStoneMaterial, C);
  builder.makeSlot("worldEngineTier3", worldEngineTier3Geo, worldEngineStoneMaterial, C);
  builder.makeSlot("worldEngineSpire", worldEngineSpireGeo, worldEngineDarkMaterial, C);
  builder.makeSlot("worldEngineCore", worldEngineCoreGeo, worldEngineCoreMaterial, C);
  builder.makeSlot("exchangeBase", exchangeBaseGeo, exchangeMarbleMaterial, C);
  builder.makeSlot("exchangeDrum", exchangeDrumGeo, exchangeMarbleMaterial, C);
  builder.makeSlot("exchangeDome", exchangeDomeGeo, exchangeDomeMaterial, C);
  builder.makeSlot("exchangeColumn", exchangeColumnGeo, exchangeColumnMaterial, C * 4);
  builder.makeSlot("exchangeFinial", exchangeFinialGeo, exchangeDomeMaterial, C);
  builder.makeSlot("shieldLatticePanel", shieldLatticePanelGeo, shieldLatticePanelMaterial, C);
  builder.makeSlot("shieldLatticeCell", shieldLatticeCellGeo, shieldLatticeBrassMaterial, C * 12);
  builder.makeSlot("shieldLatticeActiveCell", shieldLatticeActiveCellGeo, shieldLatticeActiveMaterial, C);
  builder.makeSlot("shieldLatticeFrame", shieldLatticeFrameGeo, shieldLatticeFrameMaterial, C * 2);
  builder.makeSlot("wardAnchorSpike", wardAnchorSpikeGeo, wardAnchorIronMaterial, C);
  builder.makeSlot("wardAnchorBand", wardAnchorBandGeo, wardAnchorFittingMaterial, C * 4);
  builder.makeSlot("wardAnchorCage", wardAnchorCageGeo, wardAnchorBrassMaterial, C);
  builder.makeSlot("wardAnchorOrb", wardAnchorOrbGeo, wardAnchorOrbMaterial, C);
  builder.makeSlot("aegisCrownDome", aegisCrownDomeGeo, aegisCrownDomeMaterial, C);
  builder.makeSlot("aegisCrownRing", aegisCrownRingGeo, aegisCrownRingMaterial, C);
  builder.makeSlot("aegisCrownSpike", aegisCrownSpikeGeo, aegisCrownBrassMaterial, C * 8);
  builder.makeSlot("aegisCrownBase", aegisCrownBaseGeo, aegisCrownIronMaterial, C);

  // ─── Layouts ────────────────────────────────────────────────────────
  const addAegisDome: LateGameStructureLayout = (sx, sy, sz) => {
    builder.addPiece("aegisBase", sx, sy, sz, 0, 0.02, 0);
    builder.addPiece("aegisCore", sx, sy, sz, 0, 0.08, 0);
    builder.addPiece("aegisDome", sx, sy, sz, 0, 0.06, 0);
    const pylonOffsets: ReadonlyArray<readonly [number, number]> = [
      [-0.17, -0.17],
      [0.17, -0.17],
      [-0.17, 0.17],
      [0.17, 0.17]
    ];
    for (const [ox, oz] of pylonOffsets) {
      builder.addPiece("aegisPylon", sx, sy, sz, ox, 0.07, oz);
      builder.addPiece("aegisPylonTip", sx, sy, sz, ox, 0.135, oz);
    }

    // Shield Lattice — three curved lattice fragments ringing the dome.
    const latticeAngles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
    for (const angle of latticeAngles) {
      const panelX = Math.sin(angle) * 0.24;
      const panelZ = Math.cos(angle) * 0.24;
      builder.addPiece("shieldLatticePanel", sx, sy, sz, panelX, 0.14, panelZ, 1, 1, 1, angle + Math.PI / 2);
      for (let col = 0; col < 2; col += 1) {
        for (let row = 0; row < 3; row += 1) {
          const cellX = (col - 1) * 0.07;
          const cellY = 0.14 + (row - 0.5) * 0.055;
          const cellZ = 0;
          const isActive = angle === 0 && col === 1 && row === 1;
          builder.addPiece(
            isActive ? "shieldLatticeActiveCell" : "shieldLatticeCell",
            sx, sy, sz,
            panelX + cellX, cellY, panelZ + cellZ
          );
        }
      }
      builder.addPiece("shieldLatticeFrame", sx, sy, sz, panelX, 0.14, panelZ, 1, 1, 1, angle + Math.PI / 2);
    }

    // Ward Anchors — four heavy ground anchors pinning the field.
    const anchorOffsets: ReadonlyArray<readonly [number, number]> = [
      [-0.28, -0.28],
      [0.28, -0.28],
      [-0.28, 0.28],
      [0.28, 0.28]
    ];
    for (const [ox, oz] of anchorOffsets) {
      builder.addPiece("wardAnchorSpike", sx, sy, sz, ox, 0.175, oz);
      for (const bandY of [0.05, 0.11, 0.17, 0.23]) {
        builder.addPiece("wardAnchorBand", sx, sy, sz, ox, bandY, oz);
      }
      builder.addPiece("wardAnchorCage", sx, sy, sz, ox, 0.20, oz);
      builder.addPiece("wardAnchorOrb", sx, sy, sz, ox, 0.20, oz);
    }

    // Aegis Crown — the ceremonial apex crowning the dome.
    builder.addPiece("aegisCrownBase", sx, sy, sz, 0, 0.28, 0);
    builder.addPiece("aegisCrownRing", sx, sy, sz, 0, 0.30, 0);
    builder.addPiece("aegisCrownDome", sx, sy, sz, 0, 0.31, 0);
    for (let i = 0; i < 8; i += 1) {
      const spikeAngle = (i / 8) * Math.PI * 2;
      const spikeX = Math.sin(spikeAngle) * 0.14;
      const spikeZ = Math.cos(spikeAngle) * 0.14;
      builder.addPiece("aegisCrownSpike", sx, sy, sz, spikeX, 0.34, spikeZ, 1, 1, 1, spikeAngle);
    }
  };

  const addWorldEngine: LateGameStructureLayout = (sx, sy, sz) => {
    builder.addPiece("worldEngineTier1", sx, sy, sz, 0, 0.05, 0);
    builder.addPiece("worldEngineTier2", sx, sy, sz, 0, 0.15, 0);
    builder.addPiece("worldEngineTier3", sx, sy, sz, 0, 0.25, 0);
    builder.addPiece("worldEngineSpire", sx, sy, sz, 0, 0.41, 0);
    builder.addPiece("worldEngineCore", sx, sy, sz, 0, 0.56, 0, 1, 1.2, 1, Math.PI * 0.125, 0, 0);
  };

  const addImperialExchange: LateGameStructureLayout = (sx, sy, sz) => {
    builder.addPiece("exchangeBase", sx, sy, sz, 0, 0.02, 0);
    builder.addPiece("exchangeDrum", sx, sy, sz, 0, 0.13, 0);
    builder.addPiece("exchangeDome", sx, sy, sz, 0, 0.22, 0);
    builder.addPiece("exchangeFinial", sx, sy, sz, 0, 0.41, 0);
    const colOffsets: ReadonlyArray<readonly [number, number]> = [
      [0.20, 0],
      [-0.20, 0],
      [0, 0.20],
      [0, -0.20]
    ];
    for (const [ox, oz] of colOffsets) {
      builder.addPiece("exchangeColumn", sx, sy, sz, ox, 0.13, oz);
    }
  };

  return {
    layouts: {
      AEGIS_DOME: addAegisDome,
      WORLD_ENGINE: addWorldEngine,
      IMPERIAL_EXCHANGE: addImperialExchange
    }
  };
};
