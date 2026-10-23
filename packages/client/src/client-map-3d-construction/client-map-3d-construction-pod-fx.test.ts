import { describe, expect, it } from "vitest";
import { InstancedMesh, Matrix4, Scene } from "three";
import { podMeshName, type PodMeshKey } from "./client-map-3d-construction-pod-assets.js";
import { dronesDrawn, podsDrawn } from "./client-map-3d-construction-pod.test-helpers.js";
import { POD_UNPACK_MS, planPodFlight } from "./client-map-3d-construction-pod-flight.js";
import { createConstructionPodFxLayer } from "./client-map-3d-construction-pod-fx.js";

const mesh = (scene: Scene, key: PodMeshKey): InstancedMesh => scene.getObjectByName(podMeshName(key)) as InstancedMesh;

describe("construction pod fx", () => {
  it("follows the delivery plan from the AFC's chamber to the site's stack", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    const plan = planPodFlight(-6, -4);
    layer.spawn("s", 10, 20, 0.5, 1_000, { dx: -6, dz: -4 });
    expect(layer.activeCount()).toBe(1);

    const start = layer.snapshot(1_000)[0]!;
    expect(start.stage).toBe("fabricate");
    expect(start.x).toBeCloseTo(4, 5);
    expect(start.z).toBeCloseTo(16, 5);
    expect(start.droneStage).toBe("spool");
    const carried = layer.snapshot(1_000 + (plan.cruiseAtMs + plan.lowerAtMs) / 2)[0]!;
    expect(carried.drone.y).toBeGreaterThan(carried.y); // hanging under the drone
    const landing = layer.snapshot(1_000 + plan.touchdownAtMs)[0]!;
    expect(landing.x).toBeCloseTo(10, 5);
    expect(landing.y).toBeCloseTo(0.5, 5);
    expect(landing.z).toBeCloseTo(20, 5);
    expect(landing.drone.x).toBeCloseTo(10, 5); // hovering straight above it
    layer.dispose();
  });

  it("draws every pod through the same fixed set of instanced meshes", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    const meshCount = scene.children.length;
    for (let i = 0; i < 5; i += 1) layer.spawn(`s${i}`, i, 0, 0, 0, { dx: -3, dz: 0 });
    layer.update(1_300); // all five on their way
    expect(scene.children).toHaveLength(meshCount); // no per-delivery objects or draw calls
    expect(podsDrawn(scene)).toBe(5);
    expect(dronesDrawn(scene)).toBe(5);
    expect(mesh(scene, "line").count).toBe(5); // each pod on its drone's line
    expect(mesh(scene, "glow").count).toBeGreaterThanOrEqual(20); // rotor blur discs
    layer.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("lowers, unpacks and retires itself once the drone is home, hiding its meshes again", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    const plan = planPodFlight(-4, -4);
    layer.spawn("s", 1, 2, 0, 1_000, { dx: -4, dz: -4 });
    layer.update(1_000 + plan.touchdownAtMs - 300);
    expect(mesh(scene, "dust").count).toBeGreaterThan(0); // rotor wash over the site
    // The walls fold open: a wall's top swings out and down, close to the ground.
    layer.update(1_000 + plan.touchdownAtMs + 660);
    const m = new Matrix4();
    const panels = mesh(scene, "panel");
    expect(panels.count).toBe(4);
    panels.getMatrixAt(0, m);
    expect(Math.abs(m.elements[5]!)).toBeLessThan(0.2); // the wall's up axis now lies nearly flat

    // The pod is gone but its drone is still flying home.
    layer.update(1_000 + plan.touchdownAtMs + POD_UNPACK_MS + 10);
    expect(plan.dockAtMs).toBeGreaterThan(plan.touchdownAtMs + POD_UNPACK_MS + 10);
    expect(podsDrawn(scene)).toBe(0);
    expect(dronesDrawn(scene)).toBe(1);
    layer.update(1_000 + plan.endAtMs + 1);
    expect(layer.activeCount()).toBe(0);
    for (const child of scene.children) expect(child.visible).toBe(false);
    layer.dispose();
  });

  it("keeps the crates back until the pod has set them down", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    const plan = planPodFlight(-6, 0);
    layer.spawn("a", 0, 0, 0, 0, { dx: -6, dz: 0 });
    expect(layer.awaitingDelivery("a", 0)).toBe(true);
    expect(layer.awaitingDelivery("a", plan.touchdownAtMs - 1)).toBe(true);
    expect(layer.awaitingDelivery("a", plan.touchdownAtMs + 100)).toBe(false);
    expect(layer.awaitingDelivery("b", 0)).toBe(false); // other sites are unaffected
    layer.dispose();
  });

  it("caps concurrent pods and clear() removes everything", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    for (let i = 0; i < 100; i += 1) layer.spawn("s", i, 0, 0, 0, { dx: -3, dz: 0 });
    expect(layer.activeCount()).toBe(24);
    layer.update(1_300);
    expect(podsDrawn(scene)).toBe(24);
    layer.clear();
    layer.update(1_300);
    expect(layer.activeCount()).toBe(0);
    expect(podsDrawn(scene)).toBe(0);
    layer.dispose();
  });

  it("never runs the flight backwards when the frame timestamp precedes the spawn time", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    layer.spawn("s", 0, 0, 0, 1_000, { dx: -6, dz: -4 });
    const p = layer.snapshot(990)[0]!; // the frame started 10 ms before the pod was spawned
    expect(p.stage).toBe("fabricate");
    expect(p.x).toBeCloseTo(-6, 5);
    expect(p.z).toBeCloseTo(-4, 5);
    expect(() => layer.update(990)).not.toThrow();
    layer.dispose();
  });

  // Regression: a rebuild re-anchors the scene, and in-flight pods used to land at the old position.
  it("relocate moves a site's pods to its new landing point and leaves other sites' alone", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    const plan = planPodFlight(-6, 0);
    layer.spawn("a", 10, 20, 0, 0, { dx: -6, dz: 0 });
    layer.spawn("b", 50, 50, 0, 0, { dx: -6, dz: 0 });
    layer.relocate("a", 3, 4, 0.5);
    const [a, b] = layer.snapshot(plan.touchdownAtMs);
    expect([a!.x, a!.y, a!.z]).toEqual([3, 0.5, 4]);
    expect([b!.x, b!.y, b!.z]).toEqual([50, 0, 50]);
    layer.dispose();
  });

  it("retainOnly drops the pods of sites no longer laid out", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    layer.spawn("a", 0, 0, 0, 0, { dx: -6, dz: 0 });
    layer.spawn("b", 0, 0, 0, 0, { dx: -6, dz: 0 });
    layer.retainOnly(new Set(["b"]));
    expect(layer.activeCount()).toBe(1);
    expect(layer.snapshot(0).map((p) => p.siteKey)).toEqual(["b"]);
    layer.dispose();
  });
});
