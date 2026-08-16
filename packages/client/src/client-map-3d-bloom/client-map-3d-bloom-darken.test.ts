import { BoxGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Sprite, SpriteMaterial } from "three";
import { describe, expect, it } from "vitest";
import { BLOOM_LAYER } from "./client-map-3d-bloom-layer.js";
import { createDarkenController, isMaterialBearer, originalDepthWrite } from "./client-map-3d-bloom-darken.js";

const geometry = new BoxGeometry(1, 1, 1);

describe("isMaterialBearer", () => {
  it("accepts a Mesh", () => {
    expect(isMaterialBearer(new Mesh(geometry, new MeshBasicMaterial()))).toBe(true);
  });

  it("accepts a Sprite", () => {
    expect(isMaterialBearer(new Sprite(new SpriteMaterial()))).toBe(true);
  });

  // Line/LineSegments (selection outlines, gridlines, targeting borders) are
  // deliberately excluded — see the comment in client-map-3d-bloom-darken.ts.
  it("rejects a plain Object3D (and, by the same isMesh/isSprite check, any Line-type object)", () => {
    expect(isMaterialBearer(new Object3D())).toBe(false);
  });
});

describe("originalDepthWrite", () => {
  it("reads depthWrite off a single material", () => {
    expect(originalDepthWrite(new MeshBasicMaterial({ depthWrite: true }))).toBe(true);
    expect(originalDepthWrite(new MeshBasicMaterial({ depthWrite: false }))).toBe(false);
  });

  it("reads depthWrite off the first material of an array", () => {
    expect(originalDepthWrite([new MeshBasicMaterial({ depthWrite: false }), new MeshBasicMaterial({ depthWrite: true })])).toBe(
      false
    );
  });
});

describe("createDarkenController", () => {
  it("swaps an untagged mesh to a dark material and restores the original", () => {
    const darken = createDarkenController();
    const originalMaterial = new MeshStandardMaterial({ color: "#ff0000" });
    const mesh = new Mesh(geometry, originalMaterial);

    darken.darkenNonBloomed(mesh);
    expect(mesh.material).not.toBe(originalMaterial);
    expect((mesh.material as unknown as MeshBasicMaterial).color.getHex()).toBe(0x000000);

    darken.restoreMaterial(mesh);
    expect(mesh.material).toBe(originalMaterial);

    darken.dispose();
  });

  it("leaves a BLOOM_LAYER-tagged mesh's material untouched", () => {
    const darken = createDarkenController();
    const originalMaterial = new MeshStandardMaterial({ emissive: "#00ffff", emissiveIntensity: 1 });
    const mesh = new Mesh(geometry, originalMaterial);
    mesh.layers.enable(BLOOM_LAYER);

    darken.darkenNonBloomed(mesh);
    expect(mesh.material).toBe(originalMaterial);

    darken.dispose();
  });

  // The regression this exists for: an ownership tint / fog quad / badge is
  // normally depthWrite:false so it never occludes anything behind it. If
  // the dark stand-in were always depthWrite:true, swapping it in for just
  // the bloom-source pass could wrongly cull a bloom-tagged object (the
  // water, say) sitting behind it in that one render.
  it("preserves depthWrite:false on the dark stand-in for a normally non-occluding material", () => {
    const darken = createDarkenController();
    const mesh = new Mesh(geometry, new MeshBasicMaterial({ transparent: true, depthWrite: false }));

    darken.darkenNonBloomed(mesh);
    expect((mesh.material as unknown as MeshBasicMaterial).depthWrite).toBe(false);

    darken.dispose();
  });

  it("preserves depthWrite:true on the dark stand-in for a normally occluding material", () => {
    const darken = createDarkenController();
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ depthWrite: true }));

    darken.darkenNonBloomed(mesh);
    expect((mesh.material as unknown as MeshBasicMaterial).depthWrite).toBe(true);

    darken.dispose();
  });

  it("does nothing on restore for an object that was never darkened", () => {
    const darken = createDarkenController();
    const originalMaterial = new MeshStandardMaterial();
    const mesh = new Mesh(geometry, originalMaterial);

    darken.restoreMaterial(mesh);
    expect(mesh.material).toBe(originalMaterial);

    darken.dispose();
  });

  it("ignores non-material-bearing objects without throwing", () => {
    const darken = createDarkenController();
    const obj = new Object3D();
    expect(() => darken.darkenNonBloomed(obj)).not.toThrow();
    expect(() => darken.restoreMaterial(obj)).not.toThrow();
    darken.dispose();
  });
});
