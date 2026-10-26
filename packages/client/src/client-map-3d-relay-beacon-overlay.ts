// Relay Beacon: batched communications-mast architecture plus a native
// tracking orbital receiver. Construction clipping, stable animation slots and
// per-instance disabled poses are shared by the production map and review.

import { Euler, Matrix4, Quaternion, Scene, Texture, Vector3 } from "three";
import { createRelayBeaconAssets, GEARS_PER_BEACON, MIRRORS_PER_BEACON } from "./client-map-3d-relay-beacon-assets.js";
import { CONSTRUCTION_PHASES, type ConstructionSite } from "./client-construction-phase/client-construction-phase.js";
import { createDistrictOverlay } from "./client-town-district/district-overlay.js";
import { verticalHalfExtent } from "./client-map-3d-construction/client-map-3d-vertical-extent.js";

export type RelayBeaconOverlay = {
  readonly clear: () => void;
  // `site` is set while the beacon is being built or removed
  // (docs/construction-animation-plan.md): it is laid out band by band.
  readonly addInstance: (
    sceneX: number,
    sceneZ: number,
    surfaceY: number,
    worldTileX: number,
    worldTileY: number,
    disabled?: boolean,
    site?: ConstructionSite
  ) => void;
  // True once a phase boundary passed that changes what a construction site laid out in the last rebuild would show.
  readonly constructionBoundaryPassed: () => boolean;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

const PI_2 = Math.PI / 2;
const ARRAY_SPEED = 0.0006;
const HUB_Y = 1.58;

// Tall, upward pieces that grow with the build instead of appearing whole: a
// full-height leg or column in phase 1 would make the tower look finished.
const GROWING_PIECES: ReadonlySet<string> = new Set(["leg", "column", "pipe", "spindle"]);
const MIN_GROWING_SLOPE = 0.2;

// Receiver petals and drive hubs share a slow tracking rotation. Their fixed
// local transforms keep all six curved sectors joined into one skyward bowl.
type ArrayPiece = {
  readonly key: "mirror" | "arrayGear";
  readonly slotIndex: number;
  readonly lx: number;
  readonly ly: number;
  readonly lz: number;
  readonly baseYaw: number;
  readonly rotX: number;
  readonly rotZ: number;
};

const buildArrayPieces = (): ArrayPiece[] => {
  const pieces: ArrayPiece[] = [];
  for (let i = 0; i < MIRRORS_PER_BEACON; i += 1) {
    const baseA = (i * Math.PI) / 3;
    pieces.push({
      key: "mirror",
      slotIndex: i,
      lx: 0,
      ly: 0,
      lz: 0,
      baseYaw: baseA,
      rotX: 0,
      rotZ: 0
    });
  }
  pieces.push({ key: "arrayGear", slotIndex: 0, lx: 0.055, ly: 0.004, lz: 0, baseYaw: 0.3, rotX: 0, rotZ: 0 });
  pieces.push({ key: "arrayGear", slotIndex: 1, lx: -0.055, ly: 0.004, lz: 0, baseYaw: 1.9, rotX: 0, rotZ: 0 });
  return pieces;
};

const arrayPieces = buildArrayPieces();

type RelayBeaconInstance = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly phase: number;
  readonly disabled: boolean;
  // False while the orbital receiver array is not built yet; its slots are held as zero-scale placeholders, so update() must not animate them.
  readonly arrayVisible: boolean;
  readonly underConstruction: boolean;
};

export const createRelayBeaconOverlay = (
  scene: Scene,
  maxTiles: number,
  buildingEnvironmentTexture?: Texture
): RelayBeaconOverlay => {
  const C = maxTiles;

  const { slots, dispose: disposeAssets } = createRelayBeaconAssets(scene, C, buildingEnvironmentTexture);

  // ─── Helpers ────────────────────────────────────────────────────────
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const identityQuat = new Quaternion();
  const tmpEuler = new Euler();
  const tmpQuat = new Quaternion();
  const tmpDir = new Vector3();
  const yAxis = new Vector3(0, 1, 0);

  const presentation = createDistrictOverlay(scene, C, buildingEnvironmentTexture);
  // Construction state while one beacon is being laid out. `cutY` is the height of the
  // built part (undefined = fully built); `measuring` dry-runs the layout to find the finished height.
  let cutY: number | undefined;
  let measuring = false;
  let measuredTop = 0;
  let keepHiddenSlots = false;

  // Returns true when the piece was placed visibly.
  const addPiece = (
    key: string,
    wx: number,
    sy: number,
    wz: number,
    ox: number,
    oy: number,
    oz: number,
    sx = 1,
    sz = 1,
    sy2 = 1,
    rotY = 0,
    rotX = 0,
    rotZ = 0
  ): boolean => {
    const slot = slots.get(key);
    if (!slot || (!measuring && slot.count >= slot.cap)) return false;
    position.set(wx + ox, sy + oy, wz + oz);
    scale.set(sx, sy2, sz);
    if (rotX === 0 && rotY === 0 && rotZ === 0) {
      matrix.compose(position, identityQuat, scale);
    } else {
      tmpEuler.set(rotX, rotY, rotZ, "XYZ");
      tmpQuat.setFromEuler(tmpEuler);
      matrix.compose(position, tmpQuat, scale);
    }
    if (measuring || cutY !== undefined) {
      const half = verticalHalfExtent(matrix.elements, slot.extents);
      if (measuring) {
        measuredTop = Math.max(measuredTop, oy + half);
        return false;
      }
      if (oy - half > (cutY as number)) {
        if (!keepHiddenSlots) return false;
        // A zero-scale placeholder keeps the animated pieces' slot indices aligned across beacons.
        matrix.compose(position, identityQuat, scale.set(0, 0, 0));
        slot.mesh.setMatrixAt(slot.count, matrix);
        slot.count += 1;
        return false;
      }
    }
    slot.mesh.setMatrixAt(slot.count, matrix);
    slot.count += 1;
    return true;
  };

  const eulerFromDir = (dx: number, dy: number, dz: number): { rx: number; ry: number; rz: number } => {
    tmpDir.set(dx, dy, dz).normalize();
    tmpQuat.setFromUnitVectors(yAxis, tmpDir);
    tmpEuler.setFromQuaternion(tmpQuat);
    return { rx: tmpEuler.x, ry: tmpEuler.y, rz: tmpEuler.z };
  };

  const addPieceAlong = (
    key: string,
    wx: number,
    sy: number,
    wz: number,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    len: number
  ): void => {
    if (cutY !== undefined && !measuring && GROWING_PIECES.has(key)) {
      tmpDir.set(dx, dy, dz).normalize();
      if (tmpDir.y > MIN_GROWING_SLOPE) {
        const half = (tmpDir.y * len) / 2;
        const bottom = oy - half;
        const top = oy + half;
        if (bottom >= cutY) return;
        if (top > cutY) {
          // Cut the piece at the build height, keeping its bottom end fixed.
          const newLen = (len * (cutY - bottom)) / (top - bottom);
          const shift = (len - newLen) / 2;
          ox -= tmpDir.x * shift;
          oy -= tmpDir.y * shift;
          oz -= tmpDir.z * shift;
          len = newLen;
        }
      }
    }
    const e = eulerFromDir(dx, dy, dz);
    addPiece(key, wx, sy, wz, ox, oy, oz, 1, 1, len, e.ry, e.rx, e.rz);
  };

  // ─── Beacon placement ───────────────────────────────────────────────
  // Returns whether the orbital receiver array was built (it is the last thing up the tower).
  const addBeacon = (wx: number, sy: number, wz: number): boolean => {
    // Orbital receiver spindle, hub and array disc (static; plates animate).
    addPieceAlong("spindle", wx, sy, wz, 0, 1.68, 0, 0, 1, 0, 0.35);
    addPiece("hub", wx, sy, wz, 0, HUB_Y, 0);
    addPiece("arrayRing", wx, sy, wz, 0, 1.78, 0, 1, 1, 1, 0, PI_2, 0);
    // The animated pieces are addressed by slot index (i * perBeacon + slotIndex), so a
    // gated-out one still takes its slot as a zero-scale placeholder.
    let arrayBuilt = false;
    keepHiddenSlots = true;
    try {
      for (const piece of arrayPieces) {
        if (addPiece(piece.key, wx, sy, wz, piece.lx, HUB_Y + piece.ly, piece.lz, 1, 1, 1, piece.baseYaw, piece.rotX, piece.rotZ)) arrayBuilt = true;
      }
    } finally {
      keepHiddenSlots = false;
    }

    return arrayBuilt;
  };


  // Dry run of the finished beacon (nothing is placed) to learn its height.
  measuring = true;
  addBeacon(0, 0, 0);
  measuring = false;
  const totalHeight = measuredTop;

  const instances: RelayBeaconInstance[] = [];

  // ─── Public API ─────────────────────────────────────────────────────
  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
    instances.length = 0;
    presentation.clear();
  };

  const addInstance = (
    sceneX: number,
    sceneZ: number,
    surfaceY: number,
    worldTileX: number,
    worldTileY: number,
    disabled = false,
    site: ConstructionSite | undefined = undefined
  ): void => {
    // The mirror/gear animation buffers (and every static-piece buffer) are
    // preallocated for `C` beacons; instances beyond that would index past
    // the InstancedMesh's typed arrays in update(), so drop the excess here
    // rather than let addPiece's per-slot cap silently desync from `instances`.
    if (instances.length >= C) return;
    const hash = ((worldTileX * 92_821) ^ (worldTileY * 68_917)) >>> 0;
    const phase = ((hash % 1000) / 1000) * Math.PI * 2;
    let arrayVisible: boolean;
    if (site) {
      cutY = (totalHeight * site.visibleBands) / CONSTRUCTION_PHASES;
      try {
        arrayVisible = addBeacon(sceneX, surfaceY, sceneZ);
      } finally {
        cutY = undefined; // never leave the cut on for the next beacon
      }

    } else {
      arrayVisible = addBeacon(sceneX, surfaceY, sceneZ);
    }
    presentation.add({ kind: "RELAY_HOUSING", x: sceneX, y: surfaceY, z: sceneZ, foundation: true, operational: !disabled && !site, ...(site ? { site } : {}) });
    instances.push({ x: sceneX, y: surfaceY, z: sceneZ, phase, disabled, arrayVisible, underConstruction: site !== undefined });
  };

  const commit = (): void => {
    presentation.commit();
    for (const slot of slots.values()) {
      const { mesh, count } = slot;
      mesh.count = count;
      if (count === 0) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const update = (nowMs: number): void => {
    presentation.update(nowMs);
    const count = instances.length;
    if (count === 0) return;
    const mirrorSlot = slots.get("mirror");
    const gearSlot = slots.get("arrayGear");
    for (let i = 0; i < count; i += 1) {
      const t = instances[i]!;
      if (!t.arrayVisible || t.underConstruction) continue; // preserve the placed construction pose
      const angle = t.disabled ? t.phase : nowMs * ARRAY_SPEED + t.phase;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const baseX = t.x;
      const baseY = t.y + HUB_Y;
      const baseZ = t.z;
      for (const piece of arrayPieces) {
        const slot = piece.key === "mirror" ? mirrorSlot : gearSlot;
        if (!slot) continue;
        const wx = baseX + piece.lx * cosA - piece.lz * sinA;
        const wz = baseZ + piece.lx * sinA + piece.lz * cosA;
        position.set(wx, baseY + piece.ly, wz);
        scale.set(1, 1, 1);
        tmpEuler.set(piece.rotX, piece.baseYaw + angle, piece.rotZ, "XYZ");
        tmpQuat.setFromEuler(tmpEuler);
        matrix.compose(position, tmpQuat, scale);
        const perKey = piece.key === "mirror" ? MIRRORS_PER_BEACON : GEARS_PER_BEACON;
        slot.mesh.setMatrixAt(i * perKey + piece.slotIndex, matrix);
      }
    }
    if (mirrorSlot && mirrorSlot.count > 0) {
      mirrorSlot.mesh.instanceMatrix.clearUpdateRanges();
      mirrorSlot.mesh.instanceMatrix.addUpdateRange(0, mirrorSlot.count * 16);
      mirrorSlot.mesh.instanceMatrix.needsUpdate = true;
    }
    if (gearSlot && gearSlot.count > 0) {
      gearSlot.mesh.instanceMatrix.clearUpdateRanges();
      gearSlot.mesh.instanceMatrix.addUpdateRange(0, gearSlot.count * 16);
      gearSlot.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    presentation.dispose();
    disposeAssets();
  };

  return { clear, addInstance, constructionBoundaryPassed: presentation.boundaryPassed, commit, update, dispose };
};
