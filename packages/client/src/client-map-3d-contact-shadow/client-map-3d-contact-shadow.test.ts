import { InstancedMesh, Matrix4, Quaternion, Scene, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createContactShadowOverlay } from "./client-map-3d-contact-shadow.js";

const shadowMesh = (scene: Scene): InstancedMesh => {
  const mesh = scene.children.find((child): child is InstancedMesh => child instanceof InstancedMesh);
  if (!mesh) throw new Error("contact shadow mesh was not added to the scene");
  return mesh;
};

const decompose = (mesh: InstancedMesh, index: number): { position: Vector3; scale: Vector3 } => {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  const position = new Vector3();
  const scale = new Vector3();
  matrix.decompose(position, new Quaternion(), scale);
  return { position, scale };
};

describe("contact shadow overlay", () => {
  it("draws nothing until shadows are added and committed", () => {
    const scene = new Scene();
    createContactShadowOverlay(scene, 8);
    expect(shadowMesh(scene).count).toBe(0);
  });

  it("commits one instance per structure", () => {
    const scene = new Scene();
    const overlay = createContactShadowOverlay(scene, 8);
    overlay.addShadow(1, 2, 0.5, 0.42);
    overlay.addShadow(3, 4, 0.5, 0.42);
    overlay.commit();
    expect(shadowMesh(scene).count).toBe(2);
  });

  it("resets on clear so a pan rebuild doesn't accumulate blobs", () => {
    const scene = new Scene();
    const overlay = createContactShadowOverlay(scene, 8);
    overlay.addShadow(1, 2, 0.5, 0.42);
    overlay.commit();
    overlay.clear();
    overlay.commit();
    expect(shadowMesh(scene).count).toBe(0);
  });

  // The InstancedMesh is allocated at maxTiles; writing past it would throw.
  it("stops at the instance cap instead of overflowing the buffer", () => {
    const scene = new Scene();
    const overlay = createContactShadowOverlay(scene, 2);
    for (let i = 0; i < 10; i += 1) overlay.addShadow(i, i, 0, 0.42);
    overlay.commit();
    expect(shadowMesh(scene).count).toBe(2);
  });

  it("sits just above the surface so it wins the depth test against its tile", () => {
    const scene = new Scene();
    const overlay = createContactShadowOverlay(scene, 4);
    overlay.addShadow(5, 7, 1.25, 0.42);
    overlay.commit();
    const { position } = decompose(shadowMesh(scene), 0);
    expect(position.y).toBeGreaterThan(1.25);
    // Close enough to the surface that it reads as contact, not a floating disc.
    expect(position.y - 1.25).toBeLessThan(0.05);
  });

  it("scales the decal to the requested radius", () => {
    const scene = new Scene();
    const overlay = createContactShadowOverlay(scene, 4);
    overlay.addShadow(0, 0, 0, 0.5);
    overlay.commit();
    const { scale } = decompose(shadowMesh(scene), 0);
    expect(scale.x).toBeCloseTo(1, 5);
    expect(scale.z).toBeCloseTo(1, 5);
  });

  it("ignores a non-positive radius rather than committing a degenerate quad", () => {
    const scene = new Scene();
    const overlay = createContactShadowOverlay(scene, 4);
    overlay.addShadow(0, 0, 0, 0);
    overlay.commit();
    expect(shadowMesh(scene).count).toBe(0);
  });

  // Ground overlays (settle tint and friends) sit at renderOrder 5; the
  // shadow has to sort under them or it paints over a selection highlight.
  it("renders in the transparent pass beneath the ground-overlay band", () => {
    const scene = new Scene();
    createContactShadowOverlay(scene, 4);
    const mesh = shadowMesh(scene);
    const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
    expect(mesh.renderOrder).toBeLessThan(5);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it("removes and disposes its mesh so a renderer teardown leaks nothing", () => {
    const scene = new Scene();
    const overlay = createContactShadowOverlay(scene, 4);
    overlay.dispose();
    expect(scene.children.some((child) => child instanceof InstancedMesh)).toBe(false);
  });
});
