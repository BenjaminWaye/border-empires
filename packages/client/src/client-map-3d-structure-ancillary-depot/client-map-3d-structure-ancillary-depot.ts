import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry } from "three";
import type { StructurePieceBuilder } from "../client-map-3d-structure-builder.js";

export type AncillaryDepotStructureLayout = (
  sceneX: number,
  surfaceY: number,
  sceneZ: number
) => void;

// Port of ancillary-depot-redo's twelve-pod model, scaled to a single tile.
// Keep the sealed drum, brass collars and small seam lights; instancing lets
// the map share geometry and gives construction/teardown the usual gates.
export const DEPOT_POD_COUNT = 12;
const MODEL_SCALE = 0.14;
const DRUM_RADIUS = 1.25 * MODEL_SCALE;
const DRUM_HEIGHT = 1.6 * MODEL_SCALE;
const POD_RING_RADIUS = 1.43 * MODEL_SCALE;
const POD_WIDTH = 0.36 * MODEL_SCALE;
const POD_DEPTH = 0.42 * MODEL_SCALE;
const POD_HEIGHT = 1.9 * MODEL_SCALE;
const COLLAR_HEIGHT = 0.08 * MODEL_SCALE;

export const createAncillaryDepotLayout = (
  builder: StructurePieceBuilder
): AncillaryDepotStructureLayout => {
  const iron = new MeshStandardMaterial({ color: "#0f1113", roughness: 0.9, metalness: 0.08, flatShading: true });
  const brass = new MeshStandardMaterial({ color: "#bfa46a", roughness: 0.8, metalness: 0.12, flatShading: true });
  const aether = new MeshStandardMaterial({ color: "#3df9ff", emissive: "#3df9ff", emissiveIntensity: 0.25, roughness: 0.5, metalness: 0.05 });
  const pod = new BoxGeometry(POD_WIDTH, POD_HEIGHT, POD_DEPTH);
  // Inset the front corners just as in the reference's chunky pod shell.
  const positions = pod.getAttribute("position");
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    if (positions.getZ(vertex) < POD_DEPTH / 2 - 0.001 * MODEL_SCALE) continue;
    const y = positions.getY(vertex);
    const inset = 0.08 * (y > POD_HEIGHT * 0.28 ? 1.15 : y < -POD_HEIGHT * 0.25 ? 0.45 : 1);
    positions.setX(vertex, positions.getX(vertex) * (1 - inset * 0.35));
    positions.setZ(vertex, POD_DEPTH / 2 - inset * 0.85 * MODEL_SCALE);
  }
  positions.needsUpdate = true;
  pod.computeVertexNormals();

  // The prototype's uncapped cylinder exposes its interior. Use a closed
  // cylinder here so the depot reads as a sealed reserve storehouse.
  builder.makeSlot("adDrum", new CylinderGeometry(DRUM_RADIUS, DRUM_RADIUS, DRUM_HEIGHT, 8), iron, builder.maxTiles);
  const rim = new CylinderGeometry(DRUM_RADIUS + 0.02 * MODEL_SCALE, DRUM_RADIUS + 0.02 * MODEL_SCALE, COLLAR_HEIGHT, 8, 1, true);
  builder.makeSlot("adBand", rim, brass, builder.maxTiles * 2);
  builder.makeSlot("adPod", pod, iron, builder.maxTiles * DEPOT_POD_COUNT);
  builder.makeSlot("adCollar", new BoxGeometry(POD_WIDTH + 0.05 * MODEL_SCALE, COLLAR_HEIGHT, POD_DEPTH + 0.05 * MODEL_SCALE), brass, builder.maxTiles * DEPOT_POD_COUNT);
  builder.makeSlot("adLight", new SphereGeometry(0.035 * MODEL_SCALE, 6, 4), aether, builder.maxTiles * DEPOT_POD_COUNT * 2);

  return (sx, sy, sz) => {
    builder.addPiece("adDrum", sx, sy, sz, 0, DRUM_HEIGHT / 2, 0);
    builder.addPiece("adBand", sx, sy, sz, 0, COLLAR_HEIGHT / 2, 0);
    builder.addPiece("adBand", sx, sy, sz, 0, DRUM_HEIGHT - COLLAR_HEIGHT / 2, 0);
    for (let i = 0; i < DEPOT_POD_COUNT; i += 1) {
      const angle = i / DEPOT_POD_COUNT * Math.PI * 2;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      builder.addPiece("adPod", sx, sy, sz, sin * POD_RING_RADIUS, POD_HEIGHT / 2, cos * POD_RING_RADIUS, 1, 1, 1, angle);
      builder.addPiece("adCollar", sx, sy, sz, sin * POD_RING_RADIUS, POD_HEIGHT + COLLAR_HEIGHT / 2, cos * POD_RING_RADIUS, 1, 1, 1, angle);
      // The prototype puts the lights inside opaque pods. Seat them on the
      // outer seam instead so their tiny cyan glints remain visible.
      const lightRadius = POD_RING_RADIUS + POD_DEPTH / 2 - 0.002 * MODEL_SCALE;
      for (const height of [0.22, 0.95]) {
        builder.addPiece("adLight", sx, sy, sz, sin * lightRadius, height * MODEL_SCALE, cos * lightRadius);
      }
    }
  };
};
