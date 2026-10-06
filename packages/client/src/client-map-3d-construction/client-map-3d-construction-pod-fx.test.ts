import { describe, expect, it } from "vitest";
import { Scene, Vector3 } from "three";
import { createConstructionPodFxLayer } from "./client-map-3d-construction-pod-fx.js";

// Parts are fabricated at the owner's AFC and flown to the site; nothing drops from orbit.
const pod = (scene: Scene) => scene.children[0]!.children[0]!;
// A snapshot: the pod's position vector is mutated on every update.
const where = (scene: Scene) => pod(scene).position.clone();

describe("construction pod fx", () => {
  it("launches at the AFC, arcs over the ground, and lands on the site's stack", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    layer.spawn("s", 10, 20, 0, 1_000, { dx: -6, dz: -4 });
    expect(layer.activeCount()).toBe(1);

    layer.update(1_000);
    const start = where(scene);
    // Local to the landing point: at the AFC (6 west, 4 north of the site), low, as it leaves.
    expect(start.x).toBeCloseTo(-6, 1);
    expect(start.z).toBeCloseTo(-4, 1);
    expect(start.y).toBeLessThan(0.5);

    // Mid-flight: roughly half way along the ground and higher than either end (an arc).
    layer.update(1_000 + 900);
    const mid = where(scene);
    expect(Math.abs(mid.x)).toBeLessThan(6);
    expect(Math.abs(mid.x)).toBeGreaterThan(0);
    expect(mid.y).toBeGreaterThan(start.y + 0.3);

    // Just before touchdown: at the stack.
    layer.update(1_000 + 2_050); // flight is about 2.1 s for a site 7 tiles from its AFC
    const end = where(scene);
    expect(Math.hypot(end.x, end.z)).toBeLessThan(0.6);
    expect(end.y).toBeLessThan(0.4);
    layer.dispose();
  });

  it("never comes from orbit: the pod never rises above the arc's own peak", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    layer.spawn("s", 0, 0, 0, 0, { dx: -3, dz: 0 });
    let highest = 0;
    for (let t = 0; t < 4_000; t += 20) {
      layer.update(t);
      if (scene.children[0]) highest = Math.max(highest, pod(scene).position.y);
    }
    expect(highest).toBeLessThan(1.5); // a short hop, nowhere near the 3 tile drop height it used to start from
    layer.dispose();
  });

  it("flies farther sites for longer, and arcs higher", () => {
    const flightEnd = (dx: number): number => {
      const scene = new Scene();
      const layer = createConstructionPodFxLayer(scene);
      layer.spawn("s", 0, 0, 0, 0, { dx, dz: 0 });
      let t = 0;
      while (layer.activeCount() > 0 && t < 10_000) {
        t += 25;
        layer.update(t);
      }
      layer.dispose();
      return t;
    };
    expect(flightEnd(-12)).toBeGreaterThan(flightEnd(-2));
  });

  it("still hops (does not teleport) when the AFC is right next to the site", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    layer.spawn("s", 0, 0, 0, 0, { dx: -1, dz: 0 });
    layer.update(450);
    expect(pod(scene).position.y).toBeGreaterThan(0.1);
    layer.dispose();
  });

  it("retires itself after touchdown", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    layer.spawn("s", 1, 2, 0, 1_000, { dx: -4, dz: -4 });
    layer.update(1_000 + 10_000);
    expect(layer.activeCount()).toBe(0);
    expect(scene.children).toHaveLength(0);
    layer.dispose();
  });

  it("caps concurrent pods and clear() removes everything", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    for (let i = 0; i < 100; i += 1) layer.spawn("s", i, 0, 0, 0, { dx: -3, dz: 0 });
    expect(layer.activeCount()).toBe(24);
    layer.clear();
    expect(layer.activeCount()).toBe(0);
    expect(scene.children).toHaveLength(0);
    layer.dispose();
  });

  it("aims the trail at launch too: no stray default-orientation streak on the first frame", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    layer.spawn("s", 10, 20, 0, 1_000, { dx: -6, dz: 0 });
    layer.update(1_000); // age exactly 0: the case a backward sample could not orient
    const trail = scene.children[0]!.children[1]!;
    // The trail lies along the flight direction (west to east here), not the default vertical cylinder at the landing point.
    expect(Math.abs(trail.position.x + 6)).toBeLessThan(1);
    expect(trail.position.x).toBeLessThan(0);
    const up = new Vector3(0, 1, 0).applyQuaternion(trail.quaternion);
    expect(Math.abs(up.x)).toBeGreaterThan(0.5); // tilted along x, not standing upright
    layer.dispose();
  });

  it("never runs the flight backwards when the frame timestamp precedes the spawn time", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    layer.spawn("s", 0, 0, 0, 1_000, { dx: -6, dz: -4 });
    layer.update(990); // the frame started 10 ms before the pod was spawned
    const p = scene.children[0]!.children[0]!.position;
    expect(p.x).toBeCloseTo(-6, 5);
    expect(p.z).toBeCloseTo(-4, 5);
    expect(p.y).toBeCloseTo(0.3, 5); // still at the AFC's launch height
    layer.dispose();
  });

  // The flight shows how far the parts travel: no cap, so a distant AFC means a visibly longer trip.
  it("does not cap the flight time for a distant AFC", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    layer.spawn("s", 0, 0, 0, 0, { dx: -100, dz: 0 });
    layer.update(10_000);
    expect(pod(scene).visible).toBe(true); // 100 tiles takes ~18 s; the old cap landed it by 3.2 s
    expect(pod(scene).position.x).toBeLessThan(-1);
    layer.dispose();
  });

  // Regression: a rebuild re-anchors the scene, and in-flight pods used to land at the old position.
  it("relocate moves a site's pods to its new landing point and leaves other sites' alone", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    layer.spawn("a", 10, 20, 0, 0, { dx: -6, dz: 0 });
    layer.spawn("b", 50, 50, 0, 0, { dx: -6, dz: 0 });
    layer.relocate("a", 3, 4, 0.5);
    expect(scene.children[0]!.position.toArray()).toEqual([3, 0.5, 4]);
    expect(scene.children[1]!.position.toArray()).toEqual([50, 0, 50]);
    layer.dispose();
  });

  it("retainOnly drops the pods of sites no longer laid out", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    layer.spawn("a", 0, 0, 0, 0, { dx: -6, dz: 0 });
    layer.spawn("b", 0, 0, 0, 0, { dx: -6, dz: 0 });
    layer.retainOnly(new Set(["b"]));
    expect(layer.activeCount()).toBe(1);
    expect(scene.children).toHaveLength(1);
    layer.dispose();
  });
});
