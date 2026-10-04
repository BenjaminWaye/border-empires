import { describe, expect, it, vi } from "vitest";
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Scene } from "three";

// Every tier "loads" a 2 wide x 4 tall x 1 deep box whose centre sits at
// (1, 3, 0), unless its url is in `failing`.
const failing = new Set<string>();
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load(url: string, onLoad: (gltf: { scene: Group }) => void, _p: undefined, onError: (e: unknown) => void): void {
      if (failing.has(url)) {
        queueMicrotask(() => onError(new Error("boom")));
        return;
      }
      const scene = new Group();
      const mesh = new Mesh(new BoxGeometry(2, 4, 1), new MeshStandardMaterial());
      mesh.position.set(1, 3, 0);
      scene.add(mesh);
      queueMicrotask(() => onLoad({ scene }));
    }
  }
}));

const { createTownModelOverlay, TOWN_MODEL_FOOTPRINT, TOWN_MODEL_URLS } = await import("./client-map-3d-town-glb.js");
const { createTownOverlay } = await import("../client-map-3d-town-overlay.js");

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const meshes = (scene: Scene): InstancedMesh[] => scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh);
const drawn = (scene: Scene): number => meshes(scene).reduce((n, m) => n + m.count, 0);

describe("town model overlay", () => {
  it("draws nothing (returns false) until the glb has loaded", async () => {
    const scene = new Scene();
    const overlay = createTownModelOverlay(scene, 8);
    expect(overlay.addInstance("TOWN", 1, 2, 0.5)).toBe(false);
    await settle();
    expect(overlay.addInstance("TOWN", 1, 2, 0.5)).toBe(true);
  });

  it("sizes each model from its bounds: footprint-wide, centred, resting on the surface", async () => {
    const scene = new Scene();
    const overlay = createTownModelOverlay(scene, 8);
    await settle();
    overlay.clear();
    overlay.addInstance("METROPOLIS", 5, 7, 0.5);
    overlay.commit();

    const mesh = meshes(scene).find((m) => m.count === 1)!;
    const e = mesh.instanceMatrix.array;
    const scale = TOWN_MODEL_FOOTPRINT / 2; // longer ground side is 2
    expect(e[0]).toBeCloseTo(scale, 5);
    // The box spans y 1..5, so it is lowered by scale * 1 to put its lowest point on the surface.
    expect(e[13]).toBeCloseTo(0.5 - scale * 1, 5);
    expect([e[12], e[14]]).toEqual([5, 7]);
    // Centred on the tile: the box centre was offset +1 in x, which is baked out of the geometry.
    mesh.geometry.computeBoundingBox();
    expect((mesh.geometry.boundingBox!.min.x + mesh.geometry.boundingBox!.max.x) / 2).toBeCloseTo(0, 5);
  });

  it("returns false for tiers without a model and when its buffer is full", async () => {
    const scene = new Scene();
    const overlay = createTownModelOverlay(scene, 2);
    await settle();
    expect(overlay.addInstance("SETTLEMENT", 0, 0, 0)).toBe(false);
    expect(overlay.addInstance("CITY", 0, 0, 0)).toBe(true);
    expect(overlay.addInstance("CITY", 1, 0, 0)).toBe(true);
    expect(overlay.addInstance("CITY", 2, 0, 0)).toBe(false);
    overlay.commit();
    expect(drawn(scene)).toBe(2);
    overlay.clear();
    overlay.commit();
    expect(drawn(scene)).toBe(0);
  });

  it("keeps a tier procedural when its own glb fails to load", async () => {
    // Fresh module: loaded models are cached per tier at module level.
    vi.resetModules();
    failing.add(TOWN_MODEL_URLS.GREAT_CITY);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { createTownModelOverlay: createFresh } = await import("./client-map-3d-town-glb.js");
    const overlay = createFresh(new Scene(), 4);
    await settle();
    expect(overlay.addInstance("GREAT_CITY", 0, 0, 0)).toBe(false);
    expect(overlay.addInstance("CITY", 0, 0, 0)).toBe(true);
    error.mockRestore();
    failing.clear();
  });
});

describe("town overlay model routing", () => {
  it("draws modelled tiers from their glb once loaded, and SETTLEMENT procedurally", async () => {
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 64);
    const procedural = (): number => overlay.group.children.reduce((n, c) => n + ((c as InstancedMesh).count ?? 0), 0);

    overlay.clear();
    overlay.addInstance(0, 0, 0, "CITY");
    overlay.commit();
    expect(drawn(scene)).toBe(0);
    expect(procedural()).toBeGreaterThan(0);

    await settle();
    for (const tier of ["TOWN", "CITY", "GREAT_CITY", "METROPOLIS"] as const) {
      overlay.clear();
      overlay.addInstance(0, 0, 0, tier);
      overlay.commit();
      expect(drawn(scene)).toBe(1);
      expect(procedural()).toBe(0);
    }

    overlay.clear();
    overlay.addInstance(0, 0, 0, "SETTLEMENT");
    overlay.commit();
    expect(drawn(scene)).toBe(0);
    expect(procedural()).toBeGreaterThan(0);
  });
});
