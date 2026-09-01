import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createMountainMassifs } from "./client-map-3d-mountain-massif.js";
import { createFortOverlay } from "./client-map-3d-fort-overlay.js";
import { createWatchtowerOverlay } from "./client-map-3d-watchtower-overlay.js";
import { createDockOverlay } from "./client-map-3d-dock-overlay.js";
import { createTownOverlay } from "./client-map-3d-town-overlay.js";

// Regression for a live bug: mountains, town buildings, forts, watchtowers,
// and docks build their InstancedMeshes directly (not through the shared
// client-map-3d-structure-builder.ts factory that already casts/receives),
// so they were left out of the earlier shadow rollout and kept reading as
// flatly lit regardless of the sun's angle -- only trees and most
// structures got a real shadow. Each of these must now cast AND receive too.
const instancedMeshesIn = (scene: Scene): InstancedMesh[] =>
  scene.children.flatMap((child) =>
    child instanceof InstancedMesh ? [child] : child.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh)
  );

describe("newly shadow-wired overlays", () => {
  it("mountain massifs cast and receive shadows", () => {
    const scene = new Scene();
    const massifs = createMountainMassifs(scene, 4);
    const meshes = instancedMeshesIn(scene);
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
    }
    massifs.dispose();
  });

  it("town buildings cast and receive shadows", () => {
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 4);
    const meshes = instancedMeshesIn(scene);
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
    }
    overlay.dispose();
  });

  it("fort walls/towers and siege outpost pieces cast and receive shadows", () => {
    const scene = new Scene();
    const overlay = createFortOverlay(scene, 4);
    const meshes = instancedMeshesIn(scene);
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
    }
    overlay.dispose();
  });

  it("watchtower pieces cast and receive shadows, except the unlit alert ring", () => {
    const scene = new Scene();
    const overlay = createWatchtowerOverlay(scene, 4);
    const meshes = instancedMeshesIn(scene);
    expect(meshes.length).toBeGreaterThan(0);
    const ringMesh = meshes.find((m) => m.geometry.type === "CircleGeometry");
    const solidMeshes = meshes.filter((m) => m !== ringMesh);
    expect(ringMesh).toBeDefined();
    expect(ringMesh!.castShadow).toBe(false); // unlit alert-pulse decal, not a real surface
    expect(solidMeshes.length).toBeGreaterThan(0);
    for (const mesh of solidMeshes) {
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
    }
    overlay.dispose();
  });

  it("dock pieces cast and receive shadows", () => {
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 4);
    const meshes = instancedMeshesIn(scene);
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
    }
    overlay.dispose();
  });
});
