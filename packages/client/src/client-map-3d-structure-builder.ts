import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  Scene,
  SphereGeometry,
  Texture,
  TorusGeometry,
  Vector3
} from "three";
import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { geometryHalfExtents, verticalHalfExtent, type HalfExtents } from "./client-map-3d-construction/client-map-3d-vertical-extent.js";

export type StructurePieceGeometry =
  | BoxGeometry
  | ConeGeometry
  | CylinderGeometry
  | IcosahedronGeometry
  | OctahedronGeometry
  | SphereGeometry
  | TorusGeometry;

// halfExtent: half the geometry's bounding box, so construction gating/measuring
// can find a piece's vertical extent (docs/construction-animation-plan.md).
// `growable`: only boxes and cylinders read as "partly built" when cut in Y; a cut cone, sphere
// or torus just looks squashed (a flattened roof or dome), so those wait to appear whole. Checked by
// `type`, not instanceof: three's ConeGeometry extends CylinderGeometry.
type Slot = { mesh: InstancedMesh; count: number; cap: number; extents: HalfExtents; growable: boolean };

// Builder API used by per-family files to register their meshes and
// place instances. Families never touch the underlying slots/scene
// directly — they go through makeSlot + addPiece so the orchestrator
// owns lifecycle (commit, clear, dispose).
export type StructurePieceBuilder = {
  readonly maxTiles: number;
  readonly makeSlot: (
    key: string,
    geo: StructurePieceGeometry,
    mat: MeshStandardMaterial,
    capacity: number
  ) => void;
  readonly addPiece: (
    key: string,
    sceneX: number,
    surfaceY: number,
    sceneZ: number,
    ox: number,
    oy: number,
    oz: number,
    sx?: number,
    sy?: number,
    sz?: number,
    rotY?: number,
    rotX?: number,
    rotZ?: number
  ) => number;
  // Animation hooks: overwrite one instance's matrix after it was placed, and
  // flag just that slot's used prefix for a partial GPU re-upload. Families
  // that animate per-frame call these from their own `update(nowMs)`.
  readonly setMatrixAt: (key: string, index: number, matrix: Matrix4) => void;
  readonly uploadSlot: (key: string) => void;
  // Resolves a slot's InstancedMesh once so per-frame animation code can call
  // mesh.setMatrixAt/instanceMatrix directly instead of paying a Map lookup
  // (via setMatrixAt/uploadSlot) on every animated piece, every frame.
  readonly getMesh: (key: string) => InstancedMesh | undefined;
  // Construction support. While a gate is set, addPiece skips (returns -1 for)
  // any piece whose lowest point sits above `cutY` (offset above the surface),
  // so a structure under construction shows only the bands built so far.
  readonly setGate: (cutY: number | undefined) => void;
  // Dry-runs `run` without placing anything and returns the highest point
  // (offset above the surface) any piece would reach. Callers must undo any
  // family-local side effects of the layout they ran (e.g. animation records).
  readonly measure: (run: () => void) => number;
  // True when the last addPiece placed a piece cut short at the gate (it is still growing). A family
  // that re-poses its pieces every frame from their full rest pose must leave such a piece alone,
  // or it would pop back to full height mid-build.
  readonly lastPieceWasCut: () => boolean;
};

export type StructurePieceBuilderInternals = {
  readonly builder: StructurePieceBuilder;
  readonly clear: () => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createStructurePieceBuilder = (
  scene: Scene,
  maxTiles: number,
  // Baked once by client-map-3d-atmosphere.ts and given directly to each
  // structure material's own `envMap` here, rather than to `scene.environment`
  // -- see that file's AtmosphereResources doc comment for why a global
  // scene.environment would over-brighten trees/terrain (which pick up MORE
  // IBL diffuse than a metallic material does) instead of just fixing the
  // metallic buildings this targets.
  envMap?: Texture
): StructurePieceBuilderInternals => {
  const slots = new Map<string, Slot>();
  // Sets so a geo/material shared across multiple slots (e.g. a forge
  // material reused by TITANIUM_WORKS + FOUNDRY + ADVANCED_TITANIUM_WORKS, or the
  // blue crystal shared between OBSERVATORY + MINE + CRYSTAL_SYNTHESIZER)
  // is only disposed once.
  const ownedGeos = new Set<BufferGeometry>();
  const ownedMaterials = new Set<MeshStandardMaterial>();

  const makeSlot = (
    key: string,
    geo: StructurePieceGeometry,
    mat: MeshStandardMaterial,
    cap: number
  ): void => {
    const mesh = new InstancedMesh(geo, mat, cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    // Every economic/late-game/civic/infrastructure/industrial/manpower/
    // worldbreaker/imperial-exchange/astral-dock/population-bureau structure
    // piece funnels through this one factory, so casting/receiving real
    // shadows here covers all of them at once instead of touching each
    // per-family file. Town buildings, forts, watchtowers, mountains, and
    // docks build their InstancedMeshes directly rather than through this
    // shared builder, so they're each wired up separately at their own
    // construction sites. Still not covered: resource deposits (farm/fish/
    // fur/iron/gems, titanium, umbrite), Relay Beacon, Shard, Trade Nexus,
    // and the Aether Tower -- those still only get the flat contact-shadow
    // decal.
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Gives metallic materials (iron/brass/rivet finishes -- see makeSlot's
    // JSDoc-less but well-commented sibling, client-map-3d-atmosphere.ts) a
    // specular reflection source. A material with `metalness: 0` still
    // technically samples `envMap` for its (much smaller) IBL diffuse term,
    // but every family funneling through this shared builder is a genuine
    // structure, not a flat/unlit overlay, so there's no metalness:0 case
    // here worth carving out.
    applyBuildingEnvMap(mat, envMap);
    scene.add(mesh);
    slots.set(key, { mesh, count: 0, cap, extents: geometryHalfExtents(geo), growable: geo.type === "BoxGeometry" || geo.type === "CylinderGeometry" });
    ownedGeos.add(geo);
    ownedMaterials.add(mat);
  };

  let gateY: number | undefined;
  let lastCut = false;
  // Pieces at least this tall (world units) grow with the build; thinner ones appear whole.
  const MIN_GROWING_PIECE_HEIGHT = 0.1;
  // Do not draw a growing piece until at least this much of it is above its base.
  const MIN_VISIBLE_SLIVER = 0.01;
  let measuring = false;
  let measuredTop = 0;
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const identityQuat = new Quaternion();
  const tmpEuler = new Euler();
  const tmpQuat = new Quaternion();

  const addPiece = (
    key: string,
    sceneX: number,
    surfaceY: number,
    sceneZ: number,
    ox: number,
    oy: number,
    oz: number,
    sx = 1,
    sy = 1,
    sz = 1,
    rotY = 0,
    rotX = 0,
    rotZ = 0
  ): number => {
    lastCut = false;
    const slot = slots.get(key);
    if (!slot || (!measuring && slot.count >= slot.cap)) return -1;
    position.set(sceneX + ox, surfaceY + oy, sceneZ + oz);
    scale.set(sx, sy, sz);
    if (rotX === 0 && rotY === 0 && rotZ === 0) {
      matrix.compose(position, identityQuat, scale);
    } else {
      tmpEuler.set(rotX, rotY, rotZ, "XYZ");
      tmpQuat.setFromEuler(tmpEuler);
      matrix.compose(position, tmpQuat, scale);
    }
    if (measuring || gateY !== undefined) {
      const half = verticalHalfExtent(matrix.elements, slot.extents);
      if (measuring) {
        measuredTop = Math.max(measuredTop, oy + half);
        return -1;
      }
      const cut = gateY as number;
      if (oy - half > cut) return -1;
      // A tall upright piece grows with the build instead of appearing whole: without this a
      // tower made of one tall shaft would show at full height the moment its base is built.
      // Cut at the build height, base fixed. Tilted pieces and small ones still appear whole.
      const tallUpright = rotX === 0 && rotZ === 0 && 2 * half >= MIN_GROWING_PIECE_HEIGHT && oy + half > cut;
      // A shape that would only look squashed if cut (see Slot.growable) waits until the build
      // passes its top and then appears whole: a roof cone or dome goes on last.
      if (tallUpright && !slot.growable) {
        if (oy + half > cut + 1e-6) return -1;
      } else if (tallUpright) {
        const ratio = (cut - (oy - half)) / (2 * half);
        if (ratio * 2 * half < MIN_VISIBLE_SLIVER) return -1;
        position.set(sceneX + ox, surfaceY + oy - (1 - ratio) * half, sceneZ + oz);
        scale.set(sx, sy * ratio, sz);
        lastCut = true;
        if (rotY === 0) {
          matrix.compose(position, identityQuat, scale);
        } else {
          tmpEuler.set(0, rotY, 0, "XYZ");
          tmpQuat.setFromEuler(tmpEuler);
          matrix.compose(position, tmpQuat, scale);
        }
      }
    }
    const index = slot.count;
    slot.mesh.setMatrixAt(index, matrix);
    slot.count += 1;
    return index;
  };

  const setMatrixAt = (key: string, index: number, target: Matrix4): void => {
    const slot = slots.get(key);
    if (!slot || index < 0 || index >= slot.count) return;
    slot.mesh.setMatrixAt(index, target);
  };

  const uploadSlot = (key: string): void => {
    const slot = slots.get(key);
    if (!slot || slot.count === 0) return;
    slot.mesh.instanceMatrix.clearUpdateRanges();
    slot.mesh.instanceMatrix.addUpdateRange(0, slot.count * 16);
    slot.mesh.instanceMatrix.needsUpdate = true;
  };

  const getMesh = (key: string): InstancedMesh | undefined => slots.get(key)?.mesh;

  const setGate = (cutY: number | undefined): void => {
    gateY = cutY;
  };

  const measure = (run: () => void): number => {
    measuring = true;
    measuredTop = 0;
    try {
      run();
    } finally {
      measuring = false;
    }
    return measuredTop;
  };

  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
  };

  const commit = (): void => {
    for (const slot of slots.values()) {
      slot.mesh.count = slot.count;
      slot.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMaterials) m.dispose();
  };

  return {
    builder: { maxTiles, makeSlot, addPiece, setMatrixAt, uploadSlot, getMesh, setGate, measure, lastPieceWasCut: () => lastCut },
    clear,
    commit,
    dispose
  };
};
