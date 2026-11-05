import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createDistrictOverlay } from "./district-overlay.js";

const placement = { kind: "MANUFACTORY", x: 0, y: 0, z: 0, foundation: true, operational: true } as const;
const meshes = (scene: Scene): InstancedMesh[] => scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

describe("production district instances", () => {
  it("allocates only visible model slots, caps placements, and clears stale instances", () => {
    const scene = new Scene(), overlay = createDistrictOverlay(scene, 2);
    expect(meshes(scene)).toHaveLength(0);
    overlay.add(placement); overlay.add({ ...placement, x: 1 }); overlay.add({ ...placement, x: 2 });
    overlay.commit();
    expect(overlay.diagnostics).toEqual({ instances: 2, overflow: 1, slots: 1 });
    expect(meshes(scene).every(mesh => mesh.count === 2 && mesh.instanceMatrix.count === 2)).toBe(true);
    overlay.clear(); overlay.commit();
    expect(meshes(scene).every(mesh => mesh.count === 0)).toBe(true);
    overlay.dispose();
    expect(scene.children).toHaveLength(0);
  });
  it("stores dormant state per instance without dimming active neighbours", () => {
    const scene = new Scene(), overlay = createDistrictOverlay(scene, 8);
    overlay.add(placement); overlay.add({ ...placement, operational: false }); overlay.commit();
    const state = meshes(scene)[0]!.geometry.getAttribute("districtState");
    expect(state.getX(0)).toBe(1);
    expect(state.getX(1)).toBe(0);
    overlay.clear(); overlay.add({ ...placement, operational: false }); overlay.commit();
    expect(state.getX(0)).toBe(0);
    expect(meshes(scene).every(mesh => mesh.count === 1)).toBe(true);
    overlay.dispose();
  });
  it("omits animated atmosphere layers on reduced quality devices", () => {
    const scene = new Scene(), overlay = createDistrictOverlay(scene, 8, undefined, 1);
    overlay.add(placement); overlay.commit();
    expect(meshes(scene).some(mesh => mesh.name.endsWith("-body"))).toBe(true);
    expect(meshes(scene).some(mesh => /-(steam|halo)$/.test(mesh.name))).toBe(false);
    overlay.dispose();
  });
});
