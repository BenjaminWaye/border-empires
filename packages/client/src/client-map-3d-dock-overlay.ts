import { type BufferGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Scene, Texture } from "three";
import type { SlipwayFit } from "./client-harbour-slipways/client-harbour-slipways.js";
import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { applyMarbleFinish } from "./client-map-3d-muster-banner/muster-banner-marble-material.js";
import { TOWN_COLORS } from "./client-map-3d-town-overlay/town-mesh-builder.js";
import {
  buildHarbourPieceGeometries,
  HARBOUR_PIECE_KINDS,
  type HarbourPieceKind
} from "./client-map-3d-harbour/client-map-3d-harbour-parts.js";
import type { HarbourMaterial } from "./client-map-3d-harbour/harbour-model-builder.js";

// 3D harbour: the quay on a dock tile and a landing slipway on each beach of
// its landing ground (the coastal tiles a sea crossing can come ashore on, see
// packages/shared dock-landing). The models and the lore behind the look live
// in client-map-3d-harbour/. Each piece is merged into one geometry per
// material, so a placed piece is one instance on each of its material meshes,
// however detailed the model. Everything is modelled facing +z (the sea) and
// rotated at render time toward the water.

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

// Heights (in the piece's frame) of the ledges the marble walls rise from: the
// plinth foot, course, inlay and paving of the quay, the office pad, the slipway head. See applyMarbleFinish.
const MARBLE_LEDGES = [0, 0.016, 0.05, 0.058, 0.062, 0.07, 0.085, 0.105] as const;

// The shared structure palette (TOWN_COLORS): stone and metal read like the
// towns, refineries and Harbor Exchange; metals use the town overlay's metallic finish.
const createMaterials = (): Record<HarbourMaterial, MeshStandardMaterial> => {
  const flat = (color: string, roughness: number, metalness = 0) => new MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
  const metal = (color: string) => flat(color, 0.45, 0.7);
  const marble = (color: string) => {
    const material = flat(color, 0.22);
    applyMarbleFinish(material, MARBLE_LEDGES);
    return material;
  };
  const glow = (color: string, emissive: string, intensity: number) =>
    new MeshStandardMaterial({ color, roughness: 0.4, flatShading: true, emissive, emissiveIntensity: intensity });
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
    glass: flat(TOWN_COLORS.glassLight, 0.2, 0.85),
    crate: flat(TOWN_COLORS.graphite, 0.6, 0.4),
    hull: flat("#2f3238", 0.55, 0.55),
    lampGlow: glow(TOWN_COLORS.lampWarm, "#ff9a3c", 1),
    status: glow(TOWN_COLORS.aether, "#3fd8ff", 1.1)
  };
};

type PieceMeshes = { readonly meshes: InstancedMesh[]; count: number };

export const createDockOverlay = (scene: Scene, maxTiles: number, buildingEnvironmentTexture?: Texture): DockOverlay => {
  const group = new Group();
  group.name = "dock-overlay";
  scene.add(group);

  const materials = createMaterials();
  for (const material of Object.values(materials)) applyBuildingEnvMap(material, buildingEnvironmentTexture);
  const pieceGeometries = buildHarbourPieceGeometries();
  const geometries: BufferGeometry[] = [];

  // Each visible tile holds at most one harbour piece, so every piece kind
  // reserves room for maxTiles placements -- one matrix per material mesh.
  const createPiece = (kind: HarbourPieceKind): PieceMeshes => {
    const meshes = [...pieceGeometries[kind]].map(([materialKey, geometry]) => {
      geometries.push(geometry);
      const mesh = new InstancedMesh(geometry, materials[materialKey], maxTiles);
      mesh.name = `dock-${kind}-${materialKey}`;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    });
    return { meshes, count: 0 };
  };
  const pieces: Record<HarbourPieceKind, PieceMeshes> = {
    quay: createPiece("quay"),
    slipway: createPiece("slipway"),
    shrunkSlipway: createPiece("shrunkSlipway")
  };

  const placement = new Matrix4();

  const clear = (): void => {
    for (const kind of HARBOUR_PIECE_KINDS) pieces[kind].count = 0;
  };

  const place = (kind: HarbourPieceKind, centerX: number, centerZ: number, surfaceY: number, rotationY: number): void => {
    const piece = pieces[kind];
    if (piece.count >= maxTiles) return;
    // Rotate the model about the tile centre, then translate by the (unrotated)
    // tile centre: rotating the centre too would swing a turned piece around the world origin.
    placement.makeRotationY(rotationY).setPosition(centerX, surfaceY, centerZ);
    for (const mesh of piece.meshes) mesh.setMatrixAt(piece.count, placement);
    piece.count += 1;
  };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number, rotationY: number): void =>
    place("quay", centerX, centerZ, surfaceY, rotationY);

  const addSlipway = (centerX: number, centerZ: number, surfaceY: number, rotationY: number, fit: SlipwayFit): void =>
    place(fit === "full" ? "slipway" : "shrunkSlipway", centerX, centerZ, surfaceY, rotationY);

  const commit = (): void => {
    // rebuildVisibleTerrain runs only when the visible tile set changed, so
    // commit is only ever called at a moment when matrices were re-written.
    // Re-upload every non-empty mesh's used range: a dock swap keeps the same
    // counts, so a "count unchanged" skip would leave stale geometry on the
    // GPU. Partial range uploads (count * 16 floats) keep the cost low.
    for (const kind of HARBOUR_PIECE_KINDS) {
      const { meshes, count } = pieces[kind];
      for (const mesh of meshes) {
        mesh.count = count;
        mesh.instanceMatrix.clearUpdateRanges();
        if (count === 0) continue;
        mesh.instanceMatrix.addUpdateRange(0, count * 16);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  };

  const dispose = (): void => {
    scene.remove(group);
    for (const kind of HARBOUR_PIECE_KINDS) for (const mesh of pieces[kind].meshes) mesh.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of Object.values(materials)) material.dispose();
  };

  return { group, clear, addInstance, addSlipway, commit, dispose };
};
