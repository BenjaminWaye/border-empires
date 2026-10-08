import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { Group, type Object3D, Scene, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import { createAnchoredFxRoot } from "./client-map-3d-anchored-fx-root.js";

/** Scene position of a tile measured from a scene origin, the way the 3D map places things. */
const sceneXZ = (origin: { camX: number; camY: number }, x: number, y: number) => ({
  sceneX: toroidDelta(origin.camX, x, WORLD_WIDTH),
  sceneZ: toroidDelta(origin.camY, y, WORLD_HEIGHT)
});

/** Spawns a marker on a tile the way an effect layer would, and returns a reader for its scene position. */
const spawnOnTile = (root: ReturnType<typeof createAnchoredFxRoot>, origin: { camX: number; camY: number }, x: number, y: number, parent: Object3D = root.group) => {
  const { sceneX, sceneZ } = sceneXZ(origin, x, y);
  const local = root.toLocal(sceneX, sceneZ, origin);
  const marker = new Group();
  marker.position.set(local.x, 0, local.z);
  parent.add(marker);
  return (): { x: number; z: number } => {
    root.group.updateMatrixWorld(true);
    const world = marker.getWorldPosition(new Vector3());
    return { x: world.x, z: world.z };
  };
};

describe("createAnchoredFxRoot", () => {
  it("keeps an effect on its world tile as the scene origin follows the camera", () => {
    const root = createAnchoredFxRoot(new Scene());
    const origin = { camX: 100, camY: 100 };
    root.follow(origin);
    const at = spawnOnTile(root, origin, 103, 98);
    expect(at()).toEqual({ x: 3, z: -2 });

    // A pan forces a rebuild: the origin jumps 20 tiles east and 5 south.
    origin.camX = 120;
    origin.camY = 105;
    root.follow(origin);
    const expected = sceneXZ(origin, 103, 98);
    expect(at()).toEqual({ x: expected.sceneX, z: expected.sceneZ });
  });

  it("stays on its tile when the camera pans across the world's wrap seam", () => {
    const root = createAnchoredFxRoot(new Scene());
    const origin = { camX: WORLD_WIDTH - 4, camY: 10 };
    root.follow(origin);
    const at = spawnOnTile(root, origin, WORLD_WIDTH - 1, 10);
    for (const camX of [WORLD_WIDTH - 1, 2, 6]) {
      origin.camX = camX;
      root.follow(origin);
      const expected = sceneXZ(origin, WORLD_WIDTH - 1, 10);
      expect(at().x).toBeCloseTo(expected.sceneX, 9);
    }
  });

  it("places an effect correctly when spawned against an origin newer than the last follow()", () => {
    const root = createAnchoredFxRoot(new Scene());
    root.follow({ camX: 50, camY: 50 });
    // A rebuild re-based the scene this frame and something spawned before follow() ran.
    const rebuilt = { camX: 62, camY: 47 };
    const at = spawnOnTile(root, rebuilt, 60, 40);
    root.follow(rebuilt);
    expect(at()).toEqual({ x: -2, z: -7 });
  });

  it("shows a registered layer's effect on its tile again after the camera laps the whole world", () => {
    const root = createAnchoredFxRoot(new Scene());
    const layerGroup = new Group();
    root.group.add(layerGroup);
    root.registerLayerGroup(layerGroup);
    const origin = { camX: 0, camY: 0 };
    root.follow(origin);
    const at = spawnOnTile(root, origin, 5, 5, layerGroup);
    // Three long minimap jumps that add up to one full lap east.
    const jump = Math.floor(WORLD_WIDTH * 0.47);
    for (const step of [jump, jump, WORLD_WIDTH - 2 * jump]) {
      origin.camX = (origin.camX + step) % WORLD_WIDTH;
      root.follow(origin);
    }
    expect(origin.camX).toBe(0);
    expect(at().x).toBeCloseTo(5, 9);
  });

  it("refuses to register a layer group that is not parented to the root", () => {
    const root = createAnchoredFxRoot(new Scene());
    expect(() => root.registerLayerGroup(new Group())).toThrow(/must be parented/);
  });

  it("removes its group from the scene on dispose", () => {
    const scene = new Scene();
    const root = createAnchoredFxRoot(scene);
    expect(scene.children).toContain(root.group);
    root.dispose();
    expect(scene.children).not.toContain(root.group);
  });
});
