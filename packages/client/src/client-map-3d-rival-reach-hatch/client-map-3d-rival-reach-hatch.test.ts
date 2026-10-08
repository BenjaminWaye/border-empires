import { Color, Scene } from "three";
import { describe, expect, it } from "vitest";
import { createHatchTexture, createRivalReachHatch, rivalReachHatchOwnerId } from "./client-map-3d-rival-reach-hatch.js";

const addAt = (hatch: ReturnType<typeof createRivalReachHatch>, x: number, color = new Color("#ff0000")): boolean =>
  hatch.addTile(x - 0.5, x + 0.5, -0.5, 0.5, 0.2, 0.2, 0.2, 0.2, color);

describe("createRivalReachHatch", () => {
  it("is hidden until tiles are committed, then draws six indices per tile", () => {
    const scene = new Scene();
    const hatch = createRivalReachHatch(scene, 4);
    expect(hatch.mesh.visible).toBe(false);
    addAt(hatch, 0);
    addAt(hatch, 1);
    hatch.commit();
    expect(hatch.mesh.visible).toBe(true);
    expect(hatch.mesh.geometry.drawRange.count).toBe(12);
    hatch.dispose();
  });

  it("writes the owner colour and a 0..1 uv per corner", () => {
    const hatch = createRivalReachHatch(new Scene(), 2);
    addAt(hatch, 0, new Color("#00ff00"));
    hatch.commit();
    const color = hatch.mesh.geometry.getAttribute("color");
    const uv = hatch.mesh.geometry.getAttribute("uv");
    expect([color.getX(0), color.getY(0), color.getZ(0)]).toEqual([0, 1, 0]);
    expect([uv.getX(3), uv.getY(3)]).toEqual([1, 1]);
    hatch.dispose();
  });

  it("stops drawing once the buffer is full instead of overflowing", () => {
    const hatch = createRivalReachHatch(new Scene(), 1);
    expect(addAt(hatch, 0)).toBe(true);
    expect(addAt(hatch, 1)).toBe(false);
    hatch.commit();
    expect(hatch.mesh.geometry.drawRange.count).toBe(6);
    hatch.dispose();
  });

  it("clear empties and hides it again, and tiles can be re-added", () => {
    const hatch = createRivalReachHatch(new Scene(), 2);
    addAt(hatch, 0);
    hatch.commit();
    hatch.clear();
    expect(hatch.mesh.visible).toBe(false);
    expect(hatch.mesh.geometry.drawRange.count).toBe(0);
    addAt(hatch, 0);
    hatch.commit();
    expect(hatch.mesh.geometry.drawRange.count).toBe(6);
    hatch.dispose();
  });

  it("removes its mesh from the scene on dispose", () => {
    const scene = new Scene();
    const hatch = createRivalReachHatch(scene, 1);
    expect(scene.children).toContain(hatch.mesh);
    hatch.dispose();
    expect(scene.children).not.toContain(hatch.mesh);
  });
});

describe("createHatchTexture", () => {
  it("has both stripe and gap texels and tiles seamlessly across the diagonal", () => {
    const data = createHatchTexture().image.data as Uint8Array;
    const alphaAt = (x: number, y: number): number => data[(y * 32 + x) * 4 + 3] ?? -1;
    const alphas = new Set<number>();
    for (let i = 0; i < 32; i += 1) alphas.add(alphaAt(i, 5));
    expect([...alphas].sort()).toEqual([0, 255]);
    // Wrapping one full texture width/height lands on the same stripe phase.
    expect(alphaAt(0, 0)).toBe(alphaAt(16, 0));
    expect(alphaAt(3, 0)).toBe(alphaAt(3, 16));
  });
});

describe("rivalReachHatchOwnerId", () => {
  it("hatches unowned land inside another empire's reach", () => {
    expect(rivalReachHatchOwnerId({ terrain: "LAND", reachOwnerId: "rival-1" }, "me")).toBe("rival-1");
  });
  it("skips owned land, your own reach, barbarian reach, water and no reach", () => {
    expect(rivalReachHatchOwnerId({ terrain: "LAND", ownerId: "rival-1", reachOwnerId: "rival-1" }, "me")).toBeUndefined();
    expect(rivalReachHatchOwnerId({ terrain: "LAND", reachOwnerId: "me" }, "me")).toBeUndefined();
    expect(rivalReachHatchOwnerId({ terrain: "LAND", reachOwnerId: "barbarian-1" }, "me")).toBeUndefined();
    expect(rivalReachHatchOwnerId({ terrain: "SEA", reachOwnerId: "rival-1" }, "me")).toBeUndefined();
    expect(rivalReachHatchOwnerId({ terrain: "LAND" }, "me")).toBeUndefined();
  });
});
