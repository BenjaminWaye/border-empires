import { describe, expect, it, vi } from "vitest";
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Scene } from "three";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load(_url: string, onLoad: (gltf: { scene: Group }) => void): void {
      const scene = new Group();
      scene.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
      queueMicrotask(() => onLoad({ scene }));
    }
  }
}));

const { createTownModelOverlay, TOWN_MODEL_BASE_LIFT } = await import("./client-map-3d-town-glb.js");
const { createTownOverlay } = await import("../client-map-3d-town-overlay.js");

const modelMesh = (scene: Scene): InstancedMesh | undefined =>
  scene.children.find((child): child is InstancedMesh => child instanceof InstancedMesh);

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("town model overlay", () => {
  it("ignores instances until the glb has loaded, then draws them lifted onto the terrain", async () => {
    const scene = new Scene();
    const overlay = createTownModelOverlay(scene, 8);
    expect(overlay.isReady()).toBe(false);
    overlay.addInstance(1, 2, 0.5);
    overlay.commit();
    expect(modelMesh(scene)).toBeUndefined();

    await settle();
    expect(overlay.isReady()).toBe(true);
    overlay.clear();
    overlay.addInstance(1, 2, 0.5);
    overlay.commit();

    const mesh = modelMesh(scene)!;
    expect(mesh.count).toBe(1);
    const e = mesh.instanceMatrix.array;
    expect([e[12], e[13], e[14]]).toEqual([1, 0.5 + TOWN_MODEL_BASE_LIFT, 2].map((n) => expect.closeTo(n, 5)));
  });

  it("clears and respects capacity", async () => {
    const scene = new Scene();
    const overlay = createTownModelOverlay(scene, 2);
    await settle();
    for (let i = 0; i < 5; i += 1) overlay.addInstance(i, i, 0);
    overlay.commit();
    expect(modelMesh(scene)!.count).toBe(2);
    overlay.clear();
    overlay.commit();
    expect(modelMesh(scene)!.count).toBe(0);
  });
});

describe("town overlay model routing", () => {
  it("draws TOWN with the glb once loaded, and other tiers procedurally", async () => {
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 64);
    await settle();
    const glbMesh = (): InstancedMesh => scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh)!;

    overlay.clear();
    overlay.addInstance(0, 0, 0, "TOWN");
    overlay.commit();
    expect(glbMesh().count).toBe(1);
    const procedural = (): number =>
      overlay.group.children.reduce((n, c) => n + ((c as InstancedMesh).count ?? 0), 0);
    expect(procedural()).toBe(0);

    overlay.clear();
    overlay.addInstance(0, 0, 0, "CITY");
    overlay.commit();
    expect(glbMesh().count).toBe(0);
    expect(procedural()).toBeGreaterThan(0);
  });
});
