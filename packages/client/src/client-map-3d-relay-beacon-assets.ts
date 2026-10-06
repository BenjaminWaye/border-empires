import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Scene,
  SphereGeometry,
  Texture,
  TorusGeometry
} from "three";
import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { geometryHalfExtents, type HalfExtents } from "./client-map-3d-construction/client-map-3d-vertical-extent.js";

// Materials, geometries and the per-piece InstancedMesh slots for the 3D Relay
// Beacon overlay, split out of client-map-3d-relay-beacon-overlay.ts (layout +
// animation) to keep both files under the repo's 500-line cap.
export const MIRRORS_PER_BEACON = 6;
export const GEARS_PER_BEACON = 2;

export type BeaconSlot = { mesh: InstancedMesh; count: number; cap: number; extents: HalfExtents };

export type RelayBeaconAssets = {
  readonly slots: Map<string, BeaconSlot>;
  readonly dispose: () => void;
};

export const createRelayBeaconAssets = (scene: Scene, C: number, buildingEnvironmentTexture?: Texture): RelayBeaconAssets => {
  // ─── Materials (shared by piece type) ───────────────────────────────
  const ironMaterial = new MeshStandardMaterial({
    color: "#2c2e34",
    roughness: 0.55,
    metalness: 0.55,
    flatShading: true
  });
  const steelMaterial = new MeshStandardMaterial({
    color: "#1a1b20",
    roughness: 0.62,
    metalness: 0.5,
    flatShading: true
  });
  const brassMaterial = new MeshStandardMaterial({
    color: "#8a6b3c",
    roughness: 0.42,
    metalness: 0.85,
    flatShading: true
  });
  const brassBrightMaterial = new MeshStandardMaterial({
    color: "#a5864d",
    roughness: 0.3,
    metalness: 0.92,
    flatShading: true
  });
  const mechMaterial = new MeshStandardMaterial({
    color: "#4a443c",
    roughness: 0.72,
    metalness: 0.3,
    flatShading: true
  });
  const glassMaterial = new MeshStandardMaterial({
    color: "#22303a",
    roughness: 0.12,
    metalness: 0.55,
    flatShading: true
  });
  const lampGlowMaterial = new MeshStandardMaterial({
    color: "#4a2a10",
    roughness: 0.4,
    metalness: 0.15,
    flatShading: true,
    emissive: "#ff9d3d",
    emissiveIntensity: 1.4
  });
  for (const mat of [
    ironMaterial,
    steelMaterial,
    brassMaterial,
    brassBrightMaterial,
    mechMaterial,
    glassMaterial,
    lampGlowMaterial
  ]) {
    applyBuildingEnvMap(mat, buildingEnvironmentTexture);
  }

  // ─── Geometries (shared) ────────────────────────────────────────────
  const anchorGeo = new BoxGeometry(0.13, 0.035, 0.13);
  const baseBoxGeo = new BoxGeometry(0.34, 0.1, 0.26);
  const baseVentGeo = new BoxGeometry(0.08, 0.045, 0.015);
  const legGeo = new BoxGeometry(0.03, 1, 0.03);
  const braceGeo = new BoxGeometry(0.02, 1, 0.02);
  const columnGeo = new CylinderGeometry(0.03, 0.055, 1, 8);
  const columnBandGeo = new TorusGeometry(0.05, 0.011, 6, 10);
  const pipeGeo = new CylinderGeometry(0.016, 0.016, 1, 6);
  const pipeJointGeo = new TorusGeometry(0.019, 0.009, 5, 8);
  const platformGeo = new CylinderGeometry(0.17, 0.19, 0.035, 10);
  const railGeo = new CylinderGeometry(0.175, 0.175, 0.05, 10, 1, true);
  const obsBoxGeo = new BoxGeometry(0.13, 0.11, 0.13);
  const obsWindowGeo = new BoxGeometry(0.07, 0.045, 0.012);
  const periscopeTubeGeo = new CylinderGeometry(0.024, 0.024, 1, 8);
  const periscopeEyepieceGeo = new CylinderGeometry(0.032, 0.036, 0.035, 8);
  const periscopeLensGeo = new CylinderGeometry(0.03, 0.03, 0.012, 10);
  const periscopeGearGeo = new CylinderGeometry(0.028, 0.028, 0.025, 8);
  const spindleGeo = new CylinderGeometry(0.015, 0.018, 1, 8);
  const hubGeo = new CylinderGeometry(0.045, 0.05, 0.05, 10);
  const arrayRingGeo = new TorusGeometry(0.16, 0.014, 6, 16);
  const arrayGearGeo = new CylinderGeometry(0.03, 0.03, 0.03, 8);
  const mirrorGeo = new BoxGeometry(0.16, 0.05, 0.012);
  const lampBracketGeo = new BoxGeometry(0.016, 0.11, 0.016);
  const lampHousingGeo = new CylinderGeometry(0.033, 0.028, 0.055, 8);
  const lampGlowGeo = new SphereGeometry(0.022, 8, 6);
  const lampCageGeo = new TorusGeometry(0.04, 0.006, 5, 8);
  const tankGeo = new CylinderGeometry(0.05, 0.05, 0.34, 10);
  const tankBandGeo = new TorusGeometry(0.052, 0.009, 6, 10);
  const tankCapGeo = new CylinderGeometry(0.05, 0.05, 0.018, 10);
  const tankValveGeo = new CylinderGeometry(0.014, 0.014, 0.05, 6);
  const valveWheelGeo = new BoxGeometry(0.05, 0.01, 0.05);

  // ─── InstancedMesh registry ────────────────────────────────────────
  const slots = new Map<string, BeaconSlot>();

  const make = (key: string, geo: BufferGeometry, mat: MeshStandardMaterial, cap: number): void => {
    const mesh = new InstancedMesh(geo, mat, cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    slots.set(key, { mesh, count: 0, cap, extents: geometryHalfExtents(geo) });
  };

  make("anchor", anchorGeo, steelMaterial, C * 4);
  make("baseBox", baseBoxGeo, ironMaterial, C);
  make("baseVent", baseVentGeo, brassMaterial, C);
  make("leg", legGeo, ironMaterial, C * 4);
  make("brace", braceGeo, ironMaterial, C * 4);
  make("column", columnGeo, ironMaterial, C);
  make("columnBand", columnBandGeo, brassMaterial, C);
  make("pipe", pipeGeo, brassMaterial, C * 2);
  make("pipeJoint", pipeJointGeo, brassMaterial, C * 3);
  make("platform", platformGeo, ironMaterial, C);
  make("rail", railGeo, steelMaterial, C);
  make("obsBox", obsBoxGeo, steelMaterial, C);
  make("obsWindow", obsWindowGeo, glassMaterial, C);
  make("periscopeTube", periscopeTubeGeo, brassMaterial, C * 3);
  make("periscopeEyepiece", periscopeEyepieceGeo, brassMaterial, C * 3);
  make("periscopeLens", periscopeLensGeo, glassMaterial, C * 3);
  make("periscopeGear", periscopeGearGeo, mechMaterial, C * 3);
  make("spindle", spindleGeo, brassBrightMaterial, C);
  make("hub", hubGeo, brassBrightMaterial, C);
  make("arrayRing", arrayRingGeo, brassMaterial, C);
  make("arrayGear", arrayGearGeo, mechMaterial, C * GEARS_PER_BEACON);
  make("mirror", mirrorGeo, brassBrightMaterial, C * MIRRORS_PER_BEACON);
  make("lampBracket", lampBracketGeo, ironMaterial, C * 3);
  make("lampHousing", lampHousingGeo, brassMaterial, C * 3);
  make("lampGlow", lampGlowGeo, lampGlowMaterial, C * 3);
  make("lampCage", lampCageGeo, ironMaterial, C * 3);
  make("tank", tankGeo, ironMaterial, C);
  make("tankBand", tankBandGeo, brassMaterial, C * 2);
  make("tankCap", tankCapGeo, steelMaterial, C);
  make("tankValve", tankValveGeo, steelMaterial, C);
  make("valveWheel", valveWheelGeo, brassMaterial, C);

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    [
      anchorGeo, baseBoxGeo, baseVentGeo, legGeo, braceGeo, columnGeo, columnBandGeo,
      pipeGeo, pipeJointGeo, platformGeo, railGeo, obsBoxGeo, obsWindowGeo,
      periscopeTubeGeo, periscopeEyepieceGeo, periscopeLensGeo, periscopeGearGeo,
      spindleGeo, hubGeo, arrayRingGeo, arrayGearGeo, mirrorGeo, lampBracketGeo,
      lampHousingGeo, lampGlowGeo, lampCageGeo, tankGeo, tankBandGeo, tankCapGeo,
      tankValveGeo, valveWheelGeo
    ].forEach((g) => g.dispose());
    [
      ironMaterial, steelMaterial, brassMaterial, brassBrightMaterial,
      mechMaterial, glassMaterial, lampGlowMaterial
    ].forEach((m) => m.dispose());
  };

  return { slots, dispose };
};
