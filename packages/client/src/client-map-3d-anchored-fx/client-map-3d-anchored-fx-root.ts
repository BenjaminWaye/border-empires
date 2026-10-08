import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { Group, type Object3D } from "three";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";

// World-anchored parent for the 3D map's one-shot effects (bombard, unsettle,
// aegis lock field, AFC drop, floating "-N pop" text, ...).
//
// The 3D map keeps scene coordinates relative to a floating origin
// (client-map-3d.ts's `sceneOrigin`) that jumps to the camera whenever a pan
// forces a terrain rebuild. Terrain and tile overlays are rebuilt against the
// new origin, but an effect is positioned once, when it spawns; left as a
// direct child of the scene it would keep its old coordinates and appear to
// slide with the viewport after every such jump. Effects live under this
// group instead, which follow() shifts opposite to every origin move, so
// anything inside it stays on its world tile with no per-layer bookkeeping.
//
// Contract for a registered layer group: each direct child is one effect
// instance whose x/z is set once, at spawn, from toLocal(); the layer may
// animate y, rotation, scale and the instance's own children freely. follow()
// re-wraps instance x/z by whole world widths so each one shows its copy
// nearest the camera, which keeps long effects (the 15-minute aegis lock
// field) on their tile even after the camera laps the world.

export type SceneOriginRef = { readonly camX: number; readonly camY: number };

export type AnchoredFxRoot = {
  /** Parent every one-shot effect layer's group to this, never to the scene. */
  readonly group: Object3D;
  /** Registers a layer's own group (already parented to `group`) so follow() can keep its instances on the nearest world copy. */
  readonly registerLayerGroup: (layerGroup: Object3D) => void;
  /** Call once per frame, after any rebuild has moved the scene origin and before effects spawn or update. */
  readonly follow: (origin: SceneOriginRef) => void;
  /** Converts a scene position measured from `relativeTo` (usually the current scene origin) into this group's local space, for spawning. */
  readonly toLocal: (sceneX: number, sceneZ: number, relativeTo: SceneOriginRef) => { readonly x: number; readonly z: number };
  readonly dispose: () => void;
};

export const createAnchoredFxRoot = (scene: Object3D): AnchoredFxRoot => {
  const group = new Group();
  group.name = "anchored-fx-root";
  scene.add(group);
  // The origin the group's offset currently compensates for; unset until the first follow().
  let syncedOrigin: { camX: number; camY: number } | undefined;
  const layerGroups: Object3D[] = [];

  /** `value` moved by whole `size` steps into [-size/2, size/2); arithmetic, so a non-finite input cannot spin a loop. */
  const wrapCentered = (value: number, size: number): number => {
    if (!Number.isFinite(value)) return value;
    return value - size * Math.floor((value + size / 2) / size);
  };
  const wrapNearest = (local: number, offset: number, size: number): number => wrapCentered(local + offset, size) - offset;

  const rewrapInstances = (): void => {
    // Keep the root's own offset within half a world: it would otherwise grow by a world width per lap, and
    // the instance re-wrap below then never moves anything that is not genuinely half a world from the camera.
    group.position.x = wrapCentered(group.position.x, WORLD_WIDTH);
    group.position.z = wrapCentered(group.position.z, WORLD_HEIGHT);
    for (const layerGroup of layerGroups) {
      const offsetX = group.position.x + layerGroup.position.x;
      const offsetZ = group.position.z + layerGroup.position.z;
      for (const instance of layerGroup.children) {
        instance.position.x = wrapNearest(instance.position.x, offsetX, WORLD_WIDTH);
        instance.position.z = wrapNearest(instance.position.z, offsetZ, WORLD_HEIGHT);
      }
    }
  };

  const follow = (origin: SceneOriginRef): void => {
    if (!syncedOrigin) {
      syncedOrigin = { camX: origin.camX, camY: origin.camY };
      return;
    }
    if (origin.camX === syncedOrigin.camX && origin.camY === syncedOrigin.camY) return;
    // Origin moves are small (one rebuild's worth of pan), so the shortest
    // toroidal step is the real one, including across the world's wrap seam.
    // Accumulating those steps (rather than recomputing from a fixed anchor)
    // keeps every effect on its tile however far the camera travels.
    group.position.x -= toroidDelta(syncedOrigin.camX, origin.camX, WORLD_WIDTH);
    group.position.z -= toroidDelta(syncedOrigin.camY, origin.camY, WORLD_HEIGHT);
    syncedOrigin.camX = origin.camX;
    syncedOrigin.camY = origin.camY;
    rewrapInstances();
  };

  const toLocal = (sceneX: number, sceneZ: number, relativeTo: SceneOriginRef): { x: number; z: number } => {
    if (!syncedOrigin) follow(relativeTo);
    const synced = syncedOrigin ?? relativeTo;
    // Re-express the point against the origin the group is synced to, then remove the group's offset.
    const x = sceneX + toroidDelta(synced.camX, relativeTo.camX, WORLD_WIDTH);
    const z = sceneZ + toroidDelta(synced.camY, relativeTo.camY, WORLD_HEIGHT);
    return { x: x - group.position.x, z: z - group.position.z };
  };

  const dispose = (): void => {
    scene.remove(group);
  };

  const registerLayerGroup = (layerGroup: Object3D): void => {
    if (layerGroup.parent !== group) throw new Error(`anchored fx layer "${layerGroup.name}" must be parented to the anchored fx root`);
    layerGroups.push(layerGroup);
  };

  return { group, registerLayerGroup, follow, toLocal, dispose };
};
