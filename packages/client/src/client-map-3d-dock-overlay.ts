import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Scene,
  Texture,
  Vector3
} from "three";
import type { SlipwayFit } from "./client-harbour-slipways/client-harbour-slipways.js";
import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { applyMarbleFinish } from "./client-map-3d-muster-banner/muster-banner-marble-material.js";
import { TOWN_COLORS } from "./client-map-3d-town-overlay/town-mesh-builder.js";
import {
  HARBOUR_SLOT_LOOKS,
  type HarbourPart,
  type HarbourShape,
  QUAY_PARTS,
  SHRUNK_SLIPWAY_SCALE,
  SHRUNK_SLIPWAY_SEAWARD_OFFSET,
  SLIPWAY_PARTS
} from "./client-map-3d-harbour/client-map-3d-harbour-parts.js";

// 3D harbour: the quay on a dock tile and a landing slipway on each beach of
// its landing ground (the coastal tiles a sea crossing can come ashore on, see
// packages/shared dock-landing). Part tables and the lore behind the look live
// in client-map-3d-harbour/client-map-3d-harbour-parts.ts. Everything is
// modelled facing +z (the sea) and rotated at render time toward the water.


export type DockOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (
    centerX: number,
    centerZ: number,
    surfaceY: number,
    /** Rotation in radians. The quay is modelled facing +z (south); pass
     *  the angle that turns +z toward the adjacent water tile. */
    rotationY: number,
    worldX: number,
    worldZ: number
  ) => void;
  /** A landing slipway on a beach beside a dock; `shrunk` when the beach also holds another structure. */
  readonly addSlipway: (centerX: number, centerZ: number, surfaceY: number, rotationY: number, fit: SlipwayFit) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

const countBySlot = (parts: readonly HarbourPart[]): number[] => {
  const counts = new Array<number>(HARBOUR_SLOT_LOOKS.length).fill(0);
  for (const piece of parts) counts[piece.slot] = (counts[piece.slot] ?? 0) + 1;
  return counts;
};

// Each visible tile holds at most one harbour piece (a quay or a slipway), so
// a slot needs room for maxTiles of whichever piece uses it most.
const QUAY_PER_SLOT = countBySlot(QUAY_PARTS);
const SLIPWAY_PER_SLOT = countBySlot(SLIPWAY_PARTS);
const SHRUNK_SLIPWAY_PARTS = SLIPWAY_PARTS.filter((piece) => piece.core);

const createGeometry = (shape: HarbourShape): BufferGeometry =>
  shape === "box" ? new BoxGeometry(1, 1, 1) : new CylinderGeometry(0.5, 0.5, 1, 10);

// Ledges (in the unit box's frame) the marble walls rise from: see applyMarbleFinish.
const MARBLE_LEDGES = [-0.5] as const;

// The shared structure palette (TOWN_COLORS): stone and metal read like the
// towns, refineries and Harbor Exchange; metals use the town overlay's metallic finish.
const createMaterials = (): Record<string, MeshStandardMaterial> => {
  const flat = (color: string, roughness: number, metalness = 0) => new MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
  const metal = (color: string) => flat(color, 0.45, 0.7);
  const marble = (color: string) => {
    const material = flat(color, 0.22);
    applyMarbleFinish(material, MARBLE_LEDGES);
    return material;
  };
  return {
    // The marble shader picks black-and-gold for dark base colours and charcoal for light ones;
    // the base colour is what the flat 2D projection (harbour-overlay-svg.ts) draws.
    blackMarble: marble("#26272b"),
    charcoalMarble: marble(TOWN_COLORS.stoneLight),
    stone: flat(TOWN_COLORS.stoneDark, 0.82, 0.02),
    plate: flat(TOWN_COLORS.graphite, 0.6, 0.35),
    iron: metal(TOWN_COLORS.iron),
    ironDark: metal(TOWN_COLORS.ironDark),
    brass: metal(TOWN_COLORS.brass),
    brassDark: metal(TOWN_COLORS.brassDark),
    crate: flat(TOWN_COLORS.graphite, 0.6, 0.4),
    hull: flat("#2f3238", 0.55, 0.55),
    glass: flat(TOWN_COLORS.glassLight, 0.2, 0.85),
    status: new MeshStandardMaterial({ color: TOWN_COLORS.aether, roughness: 0.4, flatShading: true, emissive: "#3fd8ff", emissiveIntensity: 1.1 }),
    lampGlow: new MeshStandardMaterial({ color: TOWN_COLORS.lampWarm, roughness: 0.4, flatShading: true, emissive: "#ff9a3c", emissiveIntensity: 1 })
  };
};

export const createDockOverlay = (scene: Scene, maxTiles: number, buildingEnvironmentTexture?: Texture): DockOverlay => {
  const group = new Group();
  group.name = "dock-overlay";
  scene.add(group);

  const geometries = new Map<HarbourShape, BufferGeometry>();
  const materials = createMaterials();
  for (const material of Object.values(materials)) applyBuildingEnvMap(material, buildingEnvironmentTexture);

  const capacities = HARBOUR_SLOT_LOOKS.map((_, slot) => maxTiles * Math.max(QUAY_PER_SLOT[slot] ?? 0, SLIPWAY_PER_SLOT[slot] ?? 0, 1));
  const meshes = HARBOUR_SLOT_LOOKS.map(([shape, materialKey], slot) => {
    let geometry = geometries.get(shape);
    if (!geometry) {
      geometry = createGeometry(shape);
      geometries.set(shape, geometry);
    }
    const mesh = new InstancedMesh(geometry, materials[materialKey]!, capacities[slot]!);
    mesh.name = `dock-${slot}`;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  });
  const counts = new Array<number>(meshes.length).fill(0);

  const tempMatrix = new Matrix4();
  const localMatrix = new Matrix4();
  const rotationMatrix = new Matrix4();
  const scaleVec = new Vector3();
  const localEuler = new Euler(0, 0, 0, "YXZ");

  const clear = (): void => {
    counts.fill(0);
  };

  const emit = (parts: readonly HarbourPart[], centerX: number, centerZ: number, surfaceY: number, rotationY: number, scale: number, seawardOffset: number): void => {
    rotationMatrix.makeRotationY(rotationY);
    for (const piece of parts) {
      const slot = piece.slot;
      const slotCount = counts[slot] ?? 0;
      if (slotCount >= capacities[slot]!) continue;
      scaleVec.set(piece.sx * scale, piece.sy * scale, piece.sz * scale);
      localEuler.set(piece.rx, piece.ry, piece.rz, "YXZ");
      localMatrix.makeRotationFromEuler(localEuler);
      localMatrix.scale(scaleVec);
      // Rotate only the part's local offset around the tile centre, then
      // translate by the (unrotated) tile centre: rotating the centre too
      // would swing every turned piece around the world origin.
      localMatrix.setPosition(piece.cx * scale, surfaceY + piece.cy * scale, piece.cz * scale + seawardOffset);
      tempMatrix.copy(rotationMatrix);
      tempMatrix.multiply(localMatrix);
      tempMatrix.elements[12] += centerX;
      tempMatrix.elements[14] += centerZ;
      meshes[slot]!.setMatrixAt(slotCount, tempMatrix);
      counts[slot] = slotCount + 1;
    }
  };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number, rotationY: number): void =>
    emit(QUAY_PARTS, centerX, centerZ, surfaceY, rotationY, 1, 0);

  const addSlipway = (centerX: number, centerZ: number, surfaceY: number, rotationY: number, fit: SlipwayFit): void => {
    if (fit === "full") emit(SLIPWAY_PARTS, centerX, centerZ, surfaceY, rotationY, 1, 0);
    else emit(SHRUNK_SLIPWAY_PARTS, centerX, centerZ, surfaceY, rotationY, SHRUNK_SLIPWAY_SCALE, SHRUNK_SLIPWAY_SEAWARD_OFFSET);
  };

  const commit = (): void => {
    // rebuildVisibleTerrain runs only when the visible tile set changed, so
    // commit is only ever called at a moment when matrices were re-written.
    // Re-upload every non-empty slot's used range: a dock swap keeps the same
    // per-slot counts, so a "count unchanged" skip would leave stale geometry
    // on the GPU. Partial range uploads (count * 16 floats) keep the cost low.
    for (let i = 0; i < meshes.length; i += 1) {
      const mesh = meshes[i]!;
      const count = counts[i] ?? 0;
      mesh.count = count;
      mesh.instanceMatrix.clearUpdateRanges();
      if (count === 0) continue;
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    scene.remove(group);
    for (const geometry of geometries.values()) geometry.dispose();
    for (const material of Object.values(materials)) material.dispose();
  };

  return { group, clear, addInstance, addSlipway, commit, dispose };
};
