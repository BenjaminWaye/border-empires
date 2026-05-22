import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry
} from "three";
import type { StructurePieceBuilder } from "./client-map-3d-structure-builder.js";

export type LateGameStructureKind =
  | "BANK"
  | "AETHER_TOWER"
  | "AEGIS_DOME"
  | "WORLD_ENGINE"
  | "IMPERIAL_EXCHANGE";

export const LATE_GAME_STRUCTURE_KINDS: ReadonlySet<LateGameStructureKind> = new Set([
  "BANK", "AETHER_TOWER", "AEGIS_DOME", "WORLD_ENGINE", "IMPERIAL_EXCHANGE"
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

  // ─── Layouts ────────────────────────────────────────────────────────
  const addBank: LateGameStructureLayout = (sx, sy, sz) => {
    builder.addPiece("bankStep", sx, sy, sz, 0, 0.025, 0.14);
    builder.addPiece("bankBody", sx, sy, sz, 0, 0.13, 0);
    builder.addPiece("bankRoof", sx, sy, sz, 0, 0.27, 0, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("bankColumn", sx, sy, sz, -0.10, 0.12, 0.13);
    builder.addPiece("bankColumn", sx, sy, sz, 0.10, 0.12, 0.13);
    builder.addPiece("bankCoin", sx, sy, sz, -0.16, 0.06, 0.22);
  };

  const addAetherTower: LateGameStructureLayout = (sx, sy, sz) => {
    builder.addPiece("aetherBase", sx, sy, sz, 0, 0.025, 0);
    builder.addPiece("aetherShaft", sx, sy, sz, 0, 0.25, 0);
    builder.addPiece("aetherCrown", sx, sy, sz, 0, 0.47, 0);
    builder.addPiece("aetherCrystal", sx, sy, sz, 0, 0.55, 0, 1, 1.4, 1);
  };

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
      BANK: addBank,
      AETHER_TOWER: addAetherTower,
      AEGIS_DOME: addAegisDome,
      WORLD_ENGINE: addWorldEngine,
      IMPERIAL_EXCHANGE: addImperialExchange
    }
  };
};
