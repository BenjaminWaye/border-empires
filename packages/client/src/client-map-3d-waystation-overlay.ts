// Holo-Locked Stack waystation (client-waystation-holo-crates/): three armoured
// crates on an anti-grav pad under a floating hologram padlock. Every part is
// instanced; per frame only the live padlocks bob and turn and the cyan
// lights pulse. Remembered (fogged) sites use their own still materials.
import { Group, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3, type Material, type Scene, type Texture } from "three";
import {
  createHoloCrateGeometries, createHoloCrateMaterials, DOOR_HINGE, HOLO_CRATE_PARTS, holoPartSlot, LOCK_ANCHOR,
  type HoloCratePart, type HoloMaterialKey
} from "./client-waystation-holo-crates/holo-crate-model-3d.js";

export type WaystationOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number,
    worldX: number, worldZ: number, waystation: { activated: boolean }, frozen?: boolean) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

/** Materials whose look animates; remembered sites get a still copy of each. */
const ANIMATED: ReadonlySet<HoloMaterialKey> = new Set(["glow", "holo", "holoBeam"]);

/** Padlock pose for a site at `nowMs`: a slow bob and turn, phase-shifted per tile so neighbours don't move in lockstep. */
export const holoLockMatrix = (out: Matrix4, siteX: number, siteY: number, siteZ: number, nowMs: number, phase: number, still: boolean): Matrix4 => {
  const bob = still ? 0 : Math.sin(nowMs * 0.0021 + phase) * 0.018;
  const turn = still ? 0.35 : nowMs * 0.0006 + phase;
  return out.compose(
    new Vector3(siteX + LOCK_ANCHOR.x, siteY + LOCK_ANCHOR.y + bob, siteZ + LOCK_ANCHOR.z),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.sin(turn) * 0.6),
    new Vector3(1, 1, 1)
  );
};

export const createWaystationOverlay = (scene: Scene, maxTiles: number, buildingEnvironmentTexture?: Texture): WaystationOverlay => {
  const group = new Group();
  group.name = "waystation-overlay";
  scene.add(group);
  const geometries = createHoloCrateGeometries();
  const live = createHoloCrateMaterials(buildingEnvironmentTexture);
  const still: Partial<Record<HoloMaterialKey, Material>> = {};
  for (const key of ANIMATED) still[key] = live[key].clone();
  const materialFor = (key: HoloMaterialKey, frozen: boolean): Material => (frozen && still[key]) || live[key];

  type Slot = { mesh: InstancedMesh; count: number; capacity: number };
  const slots = new Map<string, Slot>();
  const slotKey = (part: HoloCratePart, frozen: boolean): string => `${holoPartSlot(part)}${frozen && ANIMATED.has(part.material) ? "|still" : ""}`;
  for (const frozen of [false, true]) {
    const perSite = new Map<string, number>();
    for (const part of HOLO_CRATE_PARTS) perSite.set(slotKey(part, frozen), (perSite.get(slotKey(part, frozen)) ?? 0) + 1);
    for (const [key, count] of perSite) {
      if (slots.has(key)) continue;
      const [geometryKey, materialKey] = key.split("|")[0]!.split(":") as [keyof typeof geometries, HoloMaterialKey];
      const capacity = Math.max(1, maxTiles * count);
      const mesh = new InstancedMesh(geometries[geometryKey], materialFor(materialKey, key.endsWith("|still")), capacity);
      mesh.name = `holo-crate-${key}`;
      mesh.count = 0;
      mesh.frustumCulled = false;
      if (materialKey === "holo" || materialKey === "holoBeam") mesh.renderOrder = 2;
      group.add(mesh);
      slots.set(key, { mesh, count: 0, capacity });
    }
  }

  const lockParts = HOLO_CRATE_PARTS.filter((part) => part.role === "lock");
  const lockSlotKeys = new Set(lockParts.flatMap((part) => [slotKey(part, false), slotKey(part, true)]));
  type LockSite = { x: number; y: number; z: number; phase: number; frozen: boolean };
  let lockSites: LockSite[] = [];
  let sites = 0;
  const site = new Matrix4();
  const anchor = new Matrix4();
  const matrix = new Matrix4();
  const put = (key: string, m: Matrix4): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.capacity) return;
    slot.mesh.setMatrixAt(slot.count++, m);
  };
  const placeLocks = (nowMs: number): void => {
    for (const key of lockSlotKeys) { const slot = slots.get(key); if (slot) slot.count = 0; }
    for (const lock of lockSites) {
      holoLockMatrix(anchor, lock.x, lock.y, lock.z, nowMs, lock.phase, lock.frozen);
      for (const part of lockParts) put(slotKey(part, lock.frozen), matrix.multiplyMatrices(anchor, part.matrix));
    }
    for (const key of lockSlotKeys) {
      const slot = slots.get(key);
      if (!slot) continue;
      slot.mesh.count = slot.count;
      if (slot.count) slot.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  return {
    group,
    clear() { sites = 0; lockSites = []; for (const slot of slots.values()) slot.count = 0; },
    addInstance(x, z, y, worldX, worldZ, waystation, frozen = false) {
      if (sites >= maxTiles) return;
      sites += 1;
      site.makeTranslation(x, y, z);
      for (const part of HOLO_CRATE_PARTS) {
        if (part.role === "lock") continue;
        if (part.role === "door") put(slotKey(part, frozen), matrix.multiplyMatrices(site, DOOR_HINGE).multiply(part.matrix));
        else put(slotKey(part, frozen), matrix.multiplyMatrices(site, part.matrix));
      }
      if (!waystation.activated) lockSites.push({ x, y, z, phase: ((worldX * 7919 + worldZ * 104729) % 628) / 100, frozen });
    },
    commit() {
      placeLocks(performance.now());
      for (const { mesh, count } of slots.values()) {
        mesh.count = count;
        if (!count) continue;
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, count * 16);
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
    update(nowMs) {
      const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.0024);
      (live.glow as MeshStandardMaterial).emissiveIntensity = 0.8 + 0.45 * pulse;
      // Hologram flicker: a steady shimmer plus a rare, brief dropout.
      const dropout = Math.sin(nowMs * 0.0131) > 0.985 ? 0.45 : 1;
      (live.holo as MeshBasicMaterial).opacity = (0.36 + 0.1 * Math.sin(nowMs * 0.019)) * dropout;
      (live.holoBeam as MeshBasicMaterial).opacity = 0.06 + 0.05 * pulse;
      if (lockSites.length) placeLocks(nowMs);
    },
    dispose() {
      scene.remove(group);
      for (const slot of slots.values()) slot.mesh.dispose();
      for (const geometry of Object.values(geometries)) geometry.dispose();
      for (const material of [...Object.values(live), ...Object.values(still)]) material?.dispose();
      slots.clear();
    }
  };
};
