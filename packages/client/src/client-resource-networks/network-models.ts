import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry, TorusGeometry } from "three";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS, WORLD_WIDTH, WORLD_HEIGHT, type NetworkBuilding, type NetworkResource } from "@border-empires/shared";
import type { StructurePieceBuilder } from "../client-map-3d-structure-builder.js";

type Layout = (x: number, y: number, z: number) => void;
const material = (color: string, metalness = 0.2): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, metalness, roughness: 0.65, flatShading: true });

/** Shared visual vocabulary; separate layouts for raw sites and developed installations. */
export function registerNetworkModels(builder: StructurePieceBuilder, developed: boolean): Record<NetworkResource, Layout> {
  const prefix = developed ? "network-works" : "network-deposit";
  // Deposits are sparse. Bound buffers by the generated world budget (with
  // four copies for wrapped view windows), rather than every visible terrain tile.
  const mapScale = WORLD_WIDTH * WORLD_HEIGHT / (640 * 320);
  const siteBudget = NETWORK_RESOURCES.reduce((sum, resource) => sum + RESOURCE_NETWORKS[resource].sitesPerStandardMap, 0);
  const capacity = Math.min(builder.maxTiles, Math.max(32, Math.ceil(siteBudget * mapScale) * 4));
  const layouts = {} as Record<NetworkResource, Layout>;
  const stone = material("#4b5360");
  const brass = material("#b58b50", 0.7);
  const wood = material("#49372c");
  const green = material("#456948");
  const glass = new MeshStandardMaterial({ color: "#b7ddd5", transparent: true, opacity: 0.6, roughness: 0.25, metalness: 0.2 });
  builder.makeSlot(`${prefix}-base`, new BoxGeometry(1, 1, 1), stone, capacity * 4);
  builder.makeSlot(`${prefix}-brass`, new CylinderGeometry(0.5, 0.5, 1, 8), brass, capacity * 10);
  builder.makeSlot(`${prefix}-beam`, new BoxGeometry(1, 1, 1), wood, capacity * 8);
  builder.makeSlot(`${prefix}-leaf`, new SphereGeometry(0.5, 7, 5), green, capacity * 8);
  builder.makeSlot(`${prefix}-glass`, new SphereGeometry(0.5, 10, 7), glass, capacity * 2);
  for (const resource of NETWORK_RESOURCES) {
    const color = material(RESOURCE_NETWORKS[resource].color, resource === "CONDUCTIVE_MINERALS" ? 0.8 : 0.25);
    const key = `${prefix}-${resource}`;
    const resourceCapacity = Math.min(builder.maxTiles, Math.max(8, Math.ceil(RESOURCE_NETWORKS[resource].sitesPerStandardMap * mapScale) * 4));
    builder.makeSlot(key, new SphereGeometry(0.5, 7, 5), color, resourceCapacity * 6);
    builder.makeSlot(`${key}-ring`, new TorusGeometry(0.5, 0.055, 5, 12), color, resourceCapacity * 3);
    const piece = (kind: string, x: number, y: number, z: number, ox: number, oy: number, oz: number, sx: number, sy: number, sz: number, rz = 0): void => {
      builder.addPiece(kind, x, y, z, ox, oy, oz, sx, sy, sz, 0, 0, rz);
    };
    layouts[resource] = (x, y, z) => {
      if (developed) piece(`${prefix}-base`, x,y,z, 0,0.045,0, 0.78,0.09,0.7);
      if (resource === "NEURAL_RESIN") {
        for (const ox of [-0.24, 0.18]) {
          piece(`${prefix}-beam`,x,y,z, ox,0.22,0.08, 0.07,0.44,0.07);
          piece(`${prefix}-leaf`,x,y,z, ox,0.45,0.08, 0.3,0.28,0.3);
          piece(key,x,y,z, ox + 0.045,0.19,0.045, 0.08,0.15,0.07);
        }
        if (developed) {
          piece(`${prefix}-brass`,x,y,z, 0,0.18,-0.2, 0.25,0.28,0.25);
          piece(key,x,y,z, 0,0.32,-0.2, 0.2,0.08,0.2);
          piece(`${prefix}-beam`,x,y,z, 0,0.14,0, 0.48,0.035,0.035);
        }
      } else if (resource === "LUXURY_BIOTA") {
        for (const ox of [-0.24, 0, 0.24]) for (const oz of [-0.2, 0.15]) {
          piece(`${prefix}-leaf`,x,y,z, ox,0.13,oz, 0.2,0.24,0.18);
          piece(key,x,y,z, ox,0.27,oz, 0.13,0.12,0.13);
        }
        if (developed) {
          piece(`${prefix}-glass`,x,y,z, 0,0.15,0, 0.77,0.6,0.69);
          piece(`${prefix}-beam`,x,y,z, 0,0.47,0, 0.8,0.035,0.04);
        }
      } else if (resource === "PRECURSOR_SALVAGE") {
        piece(`${prefix}-base`,x,y,z, -0.2,0.16,0.15, 0.13,0.3,0.16,0.12);
        piece(`${prefix}-base`,x,y,z, 0.15,0.21,0.04, 0.17,0.4,0.15,-0.2);
        piece(`${key}-ring`,x,y,z, 0,0.25,0.08, 0.45,0.45,0.45);
        piece(key,x,y,z, 0,0.1,-0.18, 0.35,0.12,0.2);
        if (developed) {
          piece(`${prefix}-brass`,x,y,z, 0.26,0.36,-0.2, 0.055,0.62,0.055);
          piece(`${prefix}-beam`,x,y,z, 0.02,0.65,-0.2, 0.55,0.06,0.06);
          piece(`${prefix}-brass`,x,y,z, -0.21,0.44,-0.2, 0.018,0.4,0.018);
        }
      } else {
        for (const [ox,oz,scale] of [[-0.23,0.12,0.27],[0.05,0.05,0.38],[0.25,-0.2,0.2]] as const) {
          piece(`${prefix}-base`,x,y,z, ox,0.09,oz, scale,0.18,scale);
          piece(key,x,y,z, ox,0.19,oz, scale * 0.8,0.08,scale * 0.5);
        }
        if (developed && resource === "CATALYTIC_DEPOSIT") {
          for (const ox of [-0.2,0.13]) {
            piece(`${prefix}-brass`,x,y,z, ox,0.32,-0.2, 0.18,0.48,0.18);
            piece(key,x,y,z, ox,0.58,-0.2, 0.19,0.08,0.19);
          }
        } else if (developed) {
          piece(`${prefix}-base`,x,y,z, 0,0.21,-0.18, 0.48,0.28,0.25);
          piece(`${key}-ring`,x,y,z, 0,0.34,-0.18, 0.32,0.32,0.32);
          piece(`${prefix}-brass`,x,y,z, 0.28,0.27,0.13, 0.09,0.42,0.09);
        }
      }
    };
  }
  return layouts;
}

export function registerNetworkStructures(builder: StructurePieceBuilder): { layouts: Record<NetworkBuilding, Layout> } {
  const deposits = registerNetworkModels(builder, true);
  const layouts = {} as Record<NetworkBuilding, Layout>;
  for (const resource of NETWORK_RESOURCES) layouts[RESOURCE_NETWORKS[resource].building] = deposits[resource];
  return { layouts };
}
