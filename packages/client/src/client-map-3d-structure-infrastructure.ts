import {
  BoxGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  SphereGeometry
} from "three";
import type { StructurePieceBuilder } from "./client-map-3d-structure-builder.js";

export type InfrastructureStructureKind =
  | "AIRPORT"
  | "RAIL_DEPOT"
  | "RADAR_SYSTEM";

export const INFRASTRUCTURE_STRUCTURE_KINDS: ReadonlySet<InfrastructureStructureKind> = new Set([
  "AIRPORT", "RAIL_DEPOT", "RADAR_SYSTEM"
]);

export type InfrastructureStructureLayout = (sceneX: number, surfaceY: number, sceneZ: number) => void;

export type InfrastructureHandle = {
  readonly layouts: Record<InfrastructureStructureKind, InfrastructureStructureLayout>;
};

export const registerInfrastructureStructures = (
  builder: StructurePieceBuilder
): InfrastructureHandle => {
  const C = builder.maxTiles;

  // ─── Materials ──────────────────────────────────────────────────────
  const airportHangarMaterial = new MeshStandardMaterial({ color: "#aab2b8", roughness: 0.78, metalness: 0.15, flatShading: true });
  const airportRoofMaterial = new MeshStandardMaterial({ color: "#7e858a", roughness: 0.82, metalness: 0.18, flatShading: true });
  const airportTowerMaterial = new MeshStandardMaterial({ color: "#e8ecef", roughness: 0.75, metalness: 0.08, flatShading: true });
  const airportGlassMaterial = new MeshStandardMaterial({ color: "#3a6680", roughness: 0.3, metalness: 0.55, flatShading: true, emissive: "#0e2030", emissiveIntensity: 0.25 });
  const airportRunwayMaterial = new MeshStandardMaterial({ color: "#2a2a2e", roughness: 0.94, metalness: 0, flatShading: true });
  const airportStripeMaterial = new MeshStandardMaterial({ color: "#e8e4d6", roughness: 0.88, metalness: 0, flatShading: true });
  const railWallMaterial = new MeshStandardMaterial({ color: "#8a4836", roughness: 0.9, metalness: 0, flatShading: true });
  const railRoofMaterial = new MeshStandardMaterial({ color: "#4a4842", roughness: 0.88, metalness: 0, flatShading: true });
  const railIronMaterial = new MeshStandardMaterial({ color: "#2a2c2e", roughness: 0.6, metalness: 0.5, flatShading: true });
  const railSleeperMaterial = new MeshStandardMaterial({ color: "#3a2e22", roughness: 0.92, metalness: 0, flatShading: true });
  const railSignalLightMaterial = new MeshStandardMaterial({ color: "#ff5a3a", roughness: 0.4, metalness: 0, flatShading: true, emissive: "#c2261a", emissiveIntensity: 0.85 });
  const radarBodyMaterial = new MeshStandardMaterial({ color: "#dde2e6", roughness: 0.6, metalness: 0.35, flatShading: true });
  const radarPylonMaterial = new MeshStandardMaterial({ color: "#4a4e52", roughness: 0.5, metalness: 0.55, flatShading: true });
  const radarDishMaterial = new MeshStandardMaterial({ color: "#e8ecf0", roughness: 0.4, metalness: 0.4, flatShading: true });

  // ─── Geometries ─────────────────────────────────────────────────────
  const airportHangarGeo = new BoxGeometry(0.30, 0.10, 0.18);
  const airportRoofGeo = new BoxGeometry(0.32, 0.025, 0.20);
  const airportTowerGeo = new CylinderGeometry(0.035, 0.045, 0.32, 8);
  const airportCabGeo = new BoxGeometry(0.07, 0.04, 0.07);
  const airportRunwayGeo = new BoxGeometry(0.40, 0.008, 0.06);
  const airportStripeGeo = new BoxGeometry(0.03, 0.010, 0.012);
  const railBodyGeo = new BoxGeometry(0.30, 0.12, 0.16);
  const railRoofGeo = new BoxGeometry(0.34, 0.025, 0.20);
  const railRailGeo = new BoxGeometry(0.34, 0.008, 0.010);
  const railSleeperGeo = new BoxGeometry(0.020, 0.005, 0.07);
  const railSignalMastGeo = new CylinderGeometry(0.008, 0.008, 0.14, 5);
  const railSignalLightGeo = new BoxGeometry(0.022, 0.022, 0.018);
  const radarBodyGeo = new BoxGeometry(0.12, 0.10, 0.12);
  const radarTopGeo = new BoxGeometry(0.13, 0.02, 0.13);
  const radarPylonGeo = new CylinderGeometry(0.012, 0.014, 0.22, 8);
  // SphereGeometry top-cap clipped to a shallow bowl, rotated to face up.
  const radarDishGeo = new SphereGeometry(0.10, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const radarAntennaGeo = new CylinderGeometry(0.0055, 0.0055, 0.08, 5);

  // ─── Slots ─────────────────────────────────────────────────────────
  builder.makeSlot("airportHangar", airportHangarGeo, airportHangarMaterial, C);
  builder.makeSlot("airportRoof", airportRoofGeo, airportRoofMaterial, C);
  builder.makeSlot("airportTower", airportTowerGeo, airportTowerMaterial, C);
  builder.makeSlot("airportCab", airportCabGeo, airportGlassMaterial, C);
  builder.makeSlot("airportRunway", airportRunwayGeo, airportRunwayMaterial, C);
  builder.makeSlot("airportStripe", airportStripeGeo, airportStripeMaterial, C * 3);
  builder.makeSlot("railBody", railBodyGeo, railWallMaterial, C);
  builder.makeSlot("railRoof", railRoofGeo, railRoofMaterial, C);
  builder.makeSlot("railRail", railRailGeo, railIronMaterial, C * 2);
  builder.makeSlot("railSleeper", railSleeperGeo, railSleeperMaterial, C * 4);
  builder.makeSlot("railSignalMast", railSignalMastGeo, railIronMaterial, C);
  builder.makeSlot("railSignalLight", railSignalLightGeo, railSignalLightMaterial, C);
  builder.makeSlot("radarBody", radarBodyGeo, radarBodyMaterial, C);
  builder.makeSlot("radarTop", radarTopGeo, radarPylonMaterial, C);
  builder.makeSlot("radarPylon", radarPylonGeo, radarPylonMaterial, C);
  builder.makeSlot("radarDish", radarDishGeo, radarDishMaterial, C);
  builder.makeSlot("radarAntenna", radarAntennaGeo, radarPylonMaterial, C);

  // ─── Layouts ────────────────────────────────────────────────────────
  const addAirport: InfrastructureStructureLayout = (sx, sy, sz) => {
    builder.addPiece("airportHangar", sx, sy, sz, -0.04, 0.07, -0.10);
    builder.addPiece("airportRoof", sx, sy, sz, -0.04, 0.135, -0.10);
    builder.addPiece("airportTower", sx, sy, sz, 0.20, 0.18, -0.06);
    builder.addPiece("airportCab", sx, sy, sz, 0.20, 0.36, -0.06);
    builder.addPiece("airportRunway", sx, sy, sz, 0, 0.008, 0.18);
    builder.addPiece("airportStripe", sx, sy, sz, -0.12, 0.014, 0.18);
    builder.addPiece("airportStripe", sx, sy, sz, 0, 0.014, 0.18);
    builder.addPiece("airportStripe", sx, sy, sz, 0.12, 0.014, 0.18);
  };

  const addRailDepot: InfrastructureStructureLayout = (sx, sy, sz) => {
    builder.addPiece("railBody", sx, sy, sz, 0, 0.07, -0.10);
    builder.addPiece("railRoof", sx, sy, sz, 0, 0.143, -0.10);
    builder.addPiece("railRail", sx, sy, sz, 0, 0.012, 0.16);
    builder.addPiece("railRail", sx, sy, sz, 0, 0.012, 0.22);
    builder.addPiece("railSleeper", sx, sy, sz, -0.12, 0.005, 0.19);
    builder.addPiece("railSleeper", sx, sy, sz, -0.04, 0.005, 0.19);
    builder.addPiece("railSleeper", sx, sy, sz, 0.04, 0.005, 0.19);
    builder.addPiece("railSleeper", sx, sy, sz, 0.12, 0.005, 0.19);
    builder.addPiece("railSignalMast", sx, sy, sz, 0.18, 0.08, 0.10);
    builder.addPiece("railSignalLight", sx, sy, sz, 0.18, 0.16, 0.10);
  };

  const addRadarSystem: InfrastructureStructureLayout = (sx, sy, sz) => {
    builder.addPiece("radarBody", sx, sy, sz, -0.08, 0.05, 0.05);
    builder.addPiece("radarTop", sx, sy, sz, -0.08, 0.11, 0.05);
    builder.addPiece("radarPylon", sx, sy, sz, 0.06, 0.13, -0.04);
    // Dish tilted ~40° backward (rotX negative) and rotated to scan one
    // direction. Y offset places it just above the pylon top.
    builder.addPiece("radarDish", sx, sy, sz, 0.06, 0.26, -0.04, 1, 1, 1, 0, -Math.PI * 0.22, 0);
    builder.addPiece("radarAntenna", sx, sy, sz, 0.06, 0.30, -0.04);
  };

  return {
    layouts: {
      AIRPORT: addAirport,
      RAIL_DEPOT: addRailDepot,
      RADAR_SYSTEM: addRadarSystem
    }
  };
};
