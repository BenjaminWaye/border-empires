import { Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

// A minimal stand-in for the real marine .glb -- the real asset is covered
// separately by popup-marine-asset.test.ts. Mirrors the mock pattern in
// popup-marine-overlay-fx.test.ts (a real SkinnedMesh/Skeleton is required
// -- firstSkinnedMesh() throws on a template with none, which an empty
// THREE.Group() is).
vi.mock("./client-map-3d-popup-marine/popup-marine-asset.js", async () => {
  const THREE = await import("three");
  const makeTemplate = () => {
    const hips = new THREE.Bone();
    hips.name = "Hips";
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 1, 0, 0], 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
    const root = new THREE.Group();
    root.add(mesh);
    root.add(hips);
    mesh.bind(new THREE.Skeleton([hips]));
    const standClip = new THREE.AnimationClip("PistolIdle", 1, []);
    return { root, clips: new Map([["PistolIdle", standClip]]) };
  };
  return {
    MARINE_CLIP_NAMES: { run: "PistolRun", stand: "PistolIdle", kneel: "PistolKneelingIdle" },
    firstSkinnedMesh: (root: import("three").Object3D) => {
      let found: InstanceType<typeof THREE.SkinnedMesh> | undefined;
      root.traverse((child) => {
        if (!found && child instanceof THREE.SkinnedMesh) found = child;
      });
      if (!found) throw new Error("test template has no SkinnedMesh");
      return found;
    },
    loadPopupMarineTemplate: () => Promise.resolve(makeTemplate())
  };
});

import { createColossusMarineSkirmish, type SkirmishFight } from "./client-map-3d-colossus-marine-skirmish.js";

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const visibleMarines = (scene: Scene) => scene.children.filter((c) => c.visible && c.type === "Group");

describe("createColossusMarineSkirmish", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("spawns a squad around the colossus position for a new fight", async () => {
    const scene = new Scene();
    const skirmish = createColossusMarineSkirmish(scene);
    await flush();

    const fights = new Map<string, SkirmishFight>([["t1", { colossusWorldX: 5, colossusWorldZ: 5, colossusSurfaceY: 0, startAt: 0, endAt: 5000, colossusWins: true }]]);
    skirmish.sync(fights, 0);
    skirmish.tick(0);

    expect(visibleMarines(scene)).toHaveLength(4);
    skirmish.dispose();
  });

  it("kills marines one by one over the fight window when the colossus wins", async () => {
    const scene = new Scene();
    const skirmish = createColossusMarineSkirmish(scene);
    await flush();

    const fights = new Map<string, SkirmishFight>([["t1", { colossusWorldX: 0, colossusWorldZ: 0, colossusSurfaceY: 0, startAt: 0, endAt: 4000, colossusWins: true }]]);
    skirmish.sync(fights, 0);
    skirmish.tick(0);
    expect(visibleMarines(scene)).toHaveLength(4);

    // Ticking well past several kill intervals should reduce the living count.
    skirmish.sync(fights, 3500);
    skirmish.tick(3500);
    expect(visibleMarines(scene).length).toBeLessThan(4);
    skirmish.dispose();
  });

  it("keeps all marines alive for the whole window when the colossus loses", async () => {
    const scene = new Scene();
    const skirmish = createColossusMarineSkirmish(scene);
    await flush();

    const fights = new Map<string, SkirmishFight>([["t1", { colossusWorldX: 0, colossusWorldZ: 0, colossusSurfaceY: 0, startAt: 0, endAt: 4000, colossusWins: false }]]);
    skirmish.sync(fights, 0);
    skirmish.tick(0);

    skirmish.sync(fights, 3900);
    skirmish.tick(3900);
    expect(visibleMarines(scene)).toHaveLength(4);
    skirmish.dispose();
  });

  it("retires the squad once the fight's endAt passes", async () => {
    const scene = new Scene();
    const skirmish = createColossusMarineSkirmish(scene);
    await flush();

    const fights = new Map<string, SkirmishFight>([["t1", { colossusWorldX: 0, colossusWorldZ: 0, colossusSurfaceY: 0, startAt: 0, endAt: 1000, colossusWins: false }]]);
    skirmish.sync(fights, 0);
    skirmish.tick(0);
    expect(visibleMarines(scene)).toHaveLength(4);

    skirmish.sync(new Map(), 1001);
    skirmish.tick(1001);
    expect(visibleMarines(scene)).toHaveLength(0);
    skirmish.dispose();
  });
});
