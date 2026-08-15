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

  // A tile can carry both an economicStructure and an observatory, added from
  // separate call sites in client-map-3d.ts. Two decals at one position
  // composite to a visibly darker blob than the surrounding tiles.
  it("emits one decal per position when several structures share a tile", () => {
    const scene = new Scene();
    const overlay = createContactShadowOverlay(scene, 8);
    overlay.addShadow(3.5, 4.5, 0.5, 0.42);
    overlay.addShadow(3.5, 4.5, 0.5, 0.42);
    overlay.commit();
    expect(shadowMesh(scene).count).toBe(1);
  });

  it("still shadows neighbouring tiles independently", () => {
    const scene = new Scene();
    const overlay = createContactShadowOverlay(scene, 8);
    overlay.addShadow(3.5, 4.5, 0.5, 0.42);
    overlay.addShadow(4.5, 4.5, 0.5, 0.42);
    overlay.addShadow(3.5, 5.5, 0.5, 0.42);
    overlay.commit();
    expect(shadowMesh(scene).count).toBe(3);
  });

  it("frees positions on clear so the next rebuild can reshadow them", () => {
    const scene = new Scene();
    const overlay = createContactShadowOverlay(scene, 8);
    overlay.addShadow(3.5, 4.5, 0.5, 0.42);
    overlay.clear();
    overlay.addShadow(3.5, 4.5, 0.5, 0.42);
    overlay.commit();
    expect(shadowMesh(scene).count).toBe(1);
  });

  it("keeps negative tile offsets distinct from positive ones", () => {
    const scene = new Scene();
    const overlay = createContactShadowOverlay(scene, 8);
    overlay.addShadow(-3.5, -4.5, 0, 0.42);
    overlay.addShadow(3.5, 4.5, 0, 0.42);
    overlay.commit();
    expect(shadowMesh(scene).count).toBe(2);
  });

  it("ignores a non-positive radius rather than committing a degenerate quad", () => {
    const scene = new Scene();
    const overlay = createContactShadowOverlay(scene, 4);
    overlay.addShadow(0, 0, 0, 0);
    overlay.commit();
    expect(shadowMesh(scene).count).toBe(0);
  });

  // The ownership overlay (client-map-3d-ownership-overlay.ts) paints a
  // near-opaque settled/frontier tint at renderOrder 6/7 over nearly every
  // owned or visible tile. Three.js draws the transparent pass in ascending
  // renderOrder, so a shadow at or below that sorts underneath and gets
  // painted over almost everywhere — this module's first version did exactly
  // that (renderOrder 4) and was invisible in a live game as a result.
  it("renders in the transparent pass above the ownership-tint band", () => {
    const scene = new Scene();
    createContactShadowOverlay(scene, 4);
    const mesh = shadowMesh(scene);
    const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
    expect(mesh.renderOrder).toBeGreaterThan(7);
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
