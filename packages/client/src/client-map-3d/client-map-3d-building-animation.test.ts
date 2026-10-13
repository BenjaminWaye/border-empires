import { describe, expect, it } from "vitest";
import { IcosahedronGeometry, InstancedMesh, Scene, TorusGeometry } from "three";
import { createTradeNexusOverlay } from "../client-map-3d-trade-nexus-overlay.js";
import { createAmbaricTransformerOverlay } from "../client-map-3d-ambaric-transformer-overlay.js";
import { createUmbriteWeaponsFactoryOverlay } from "../client-map-3d-umbrite-weapons-factory.js";
import { createSiegeTowerOverlay } from "../client-map-3d-siege-tower-overlay.js";

type Overlay = {
  addInstance: (x: number, z: number, y: number, wx: number, wy: number, frozen?: boolean) => void;
  clear: () => void;
  commit: () => void;
  update: (now: number) => void;
  dispose: () => void;
};
const siegeFactory = (variant: "SIEGE_TOWER" | "DREAD_TOWER") => (scene: Scene): Overlay => {
  const overlay = createSiegeTowerOverlay(scene, 2, () => "structure");
  return { ...overlay,
    addInstance: (x, z, y, wx, wy, frozen) => overlay.addInstance(x, z, y, wx, wy, variant, frozen),
    update: (now) => overlay.update(now, { x: 8, y: 8 })
  };
};
const factories: Array<[string, (scene: Scene) => Overlay]> = [
  ["tradeNexus", (scene) => createTradeNexusOverlay(scene, 2)],
  ["observatory", (scene) => createAmbaricTransformerOverlay(scene, 2)],
  ["weapons factory", (scene) => createUmbriteWeaponsFactoryOverlay(scene, 2)],
  ["siege tower", siegeFactory("SIEGE_TOWER")],
  ["dread tower", siegeFactory("DREAD_TOWER")]
];
const meshes = (scene: Scene): InstancedMesh[] => scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh && child.count > 0);
const snapshot = (scene: Scene): number[][] => meshes(scene).map((mesh) => Array.from(mesh.instanceMatrix.array.slice(0, mesh.count * 16)));

describe.each(factories)("%s construction animation", (_name, create) => {
  it("keeps construction poses while a finished neighbor animates, then starts on completion", () => {
    const scene = new Scene();
    const overlay = create(scene);
    overlay.addInstance(0, 0, 0, 0, 0, true);
    overlay.addInstance(4, 0, 0, 4, 0);
    overlay.commit();
    const before = snapshot(scene);
    overlay.update(1000);
    overlay.update(2500);
    const after = snapshot(scene);
    for (let i = 0; i < before.length; i++) {
      const half = before[i]!.length / 2;
      expect(after[i]!.slice(0, half)).toEqual(before[i]!.slice(0, half));
    }
    expect(after.some((values, i) => values.slice(values.length / 2).some((value, j) => value !== before[i]![values.length / 2 + j]))).toBe(true);
    overlay.clear();
    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();
    const completed = snapshot(scene);
    overlay.update(5000);
    expect(snapshot(scene)).not.toEqual(completed);
    overlay.dispose();
  });
});

it("does not link or synchronize an observatory under construction", () => {
  const scene = new Scene();
  const overlay = createAmbaricTransformerOverlay(scene, 3);
  overlay.addInstance(0, 0, 0, 0, 0, true);
  overlay.addInstance(1.2, 0, 0, 1, 0);
  overlay.addInstance(0.6, 1.04, 0, 1, 1);
  overlay.commit();
  // The two finished towers still link; the construction tower has no animated network.
  const all = scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);
  const nodes = all.find((mesh) => mesh.geometry.type === "IcosahedronGeometry" && (mesh.geometry as IcosahedronGeometry).parameters.radius === 0.026)!;
  const clusters = all.find((mesh) => mesh.geometry.type === "TorusGeometry" && (mesh.geometry as TorusGeometry).parameters.radius === 0.44)!;
  expect(nodes.count).toBe(3); // one link between the two finished towers
  expect(clusters.count).toBe(0); // the frozen third tower cannot form a cluster
  const before = snapshot(scene);
  overlay.update(1000);
  expect(snapshot(scene)).not.toEqual(before);
  overlay.dispose();
});

it("construction observatories cannot consume finished towers' link capacity", () => {
  const scene = new Scene();
  const overlay = createAmbaricTransformerOverlay(scene, 8);
  overlay.addInstance(0, 0, 0, 0, 0);
  overlay.addInstance(1.2, 0, 0, 1, 0);
  for (let i = 0; i < 6; i++) overlay.addInstance(0.04 + i * 0.04, 0, 0, i + 2, 0, true);
  overlay.commit();
  const nodes = scene.children.find((child): child is InstancedMesh => child instanceof InstancedMesh && child.geometry.type === "IcosahedronGeometry" && (child.geometry as IcosahedronGeometry).parameters.radius === 0.026)!;
  expect(nodes.count).toBe(3);
  overlay.dispose();
});
