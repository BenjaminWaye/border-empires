import { createRelayReceiverSegment } from "./client-map-3d-relay-receiver.js";
import {
  BufferGeometry,
  CylinderGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Scene,
  Texture,
  TorusGeometry
} from "three";
import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { geometryHalfExtents, type HalfExtents } from "./client-map-3d-construction/client-map-3d-vertical-extent.js";

// Materials, geometries and the per-piece InstancedMesh slots for the 3D Relay
// Beacon overlay, split out of client-map-3d-relay-beacon-overlay.ts (layout +
// animation) to keep both files under the repo's 500-line cap.
export const SENSOR_SEGMENTS_PER_BEACON = 6;
export const GEARS_PER_BEACON = 2;

export type BeaconSlot = { mesh: InstancedMesh; count: number; cap: number; extents: HalfExtents };

export type RelayBeaconAssets = {
  readonly slots: Map<string, BeaconSlot>;
  readonly dispose: () => void;
};

export const createRelayBeaconAssets = (scene: Scene, C: number, buildingEnvironmentTexture?: Texture): RelayBeaconAssets => {
  const material = new MeshStandardMaterial({ color: "#b1935b", roughness: 0.28, metalness: 0.88 });
  applyBuildingEnvMap(material, buildingEnvironmentTexture);
  const sensorMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.78 });
  applyBuildingEnvMap(sensorMaterial, buildingEnvironmentTexture);
  const definitions: readonly [string, BufferGeometry, number][] = [
    ["spindle", new CylinderGeometry(0.015, 0.018, 1, 12), C],
    ["hub", new CylinderGeometry(0.032, 0.04, 0.12, 8), C],
    ["arrayRing", new TorusGeometry(0.08, 0.009, 8, 24), C],
    ["arrayGear", new CylinderGeometry(0.03, 0.03, 0.03, 8), C * GEARS_PER_BEACON],
    ["sensorSegment", createRelayReceiverSegment(), C * SENSOR_SEGMENTS_PER_BEACON]
  ];
  const slots = new Map<string, BeaconSlot>();
  for (const [key, geometry, cap] of definitions) {
    const mesh = new InstancedMesh(geometry, key === "sensorSegment" ? sensorMaterial : material, cap);
    mesh.name = `relay-${key}`;
    mesh.count = 0; mesh.frustumCulled = false;
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    slots.set(key, { mesh, count: 0, cap, extents: geometryHalfExtents(geometry) });
  }
  return { slots, dispose: () => {
    for (const slot of slots.values()) { scene.remove(slot.mesh); slot.mesh.dispose(); slot.mesh.geometry.dispose(); }
    material.dispose(); sensorMaterial.dispose();
  } };
};
