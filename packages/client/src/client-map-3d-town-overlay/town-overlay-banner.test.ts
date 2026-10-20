import { describe, expect, it } from "vitest";
import { Color, FrontSide, Scene, type InstancedMesh, type MeshStandardMaterial } from "three";
import { createTownOverlay, TOWN_UNOWNED_BANNER_COLOR } from "../client-map-3d-town-overlay.js";
import { normalizeColorForThree } from "../client-three-color/client-three-color.js";

const bannerOf = (scene: Scene, tier: string): InstancedMesh =>
  scene.children.find((child) => child.name === `town-${tier}-banner`) as InstancedMesh;

describe("town banners", () => {
  it("dye each town's banners in its owner's colour, and undyed canvas when nobody owns it", () => {
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, "CITY", 3, 4, "#3d7fd6");
    overlay.addInstance(1, 0, 0, "CITY", 5, 6);
    overlay.commit();
    const banner = bannerOf(scene, "CITY");
    expect(banner.count).toBe(2);
    const dye = new Color();
    banner.getColorAt(0, dye);
    expect(dye.getHexString()).toBe("3d7fd6");
    banner.getColorAt(1, dye);
    expect(`#${dye.getHexString()}`).toBe(TOWN_UNOWNED_BANNER_COLOR);
    // Shares the body's transforms, so the banners stand on their own town.
    expect(banner.instanceMatrix).toBe((scene.children.find((child) => child.name === "town-CITY") as InstancedMesh).instanceMatrix);
    overlay.dispose();
  });

  it("dyes banners in owner colours given as CSS hsl(), not in the previous town's colour", () => {
    // fallbackOwnerColor (client-owner-colors.ts) hands out space-separated hsl(), which three cannot parse.
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, "TOWN", 1, 1, "#3d7fd6");
    overlay.addInstance(1, 0, 0, "TOWN", 2, 2, "hsl(120 70% 48%)");
    overlay.addInstance(2, 0, 0, "TOWN", 3, 3, "not a colour");
    overlay.commit();
    const banner = bannerOf(scene, "TOWN");
    const dye = new Color();
    banner.getColorAt(1, dye);
    expect(`#${dye.getHexString()}`).toBe(normalizeColorForThree("hsl(120 70% 48%)"));
    expect(dye.getHexString()).not.toBe("3d7fd6");
    banner.getColorAt(2, dye);
    expect(`#${dye.getHexString()}`).toBe(TOWN_UNOWNED_BANNER_COLOR);
    overlay.dispose();
  });
});

describe("town overlay meshes", () => {
  it("cast shadows from front faces, since the tier geometry has no undersides", () => {
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 4);
    for (const name of ["town-CITY", "town-CITY-metal", "town-CITY-glass"]) {
      const mesh = scene.children.find((child) => child.name === name) as InstancedMesh;
      expect((mesh.material as MeshStandardMaterial).shadowSide, name).toBe(FrontSide);
    }
    overlay.dispose();
  });

  it("hide a tier with no town on screen, so it costs no draw calls", () => {
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, "CITY");
    overlay.commit();
    const town = (name: string): InstancedMesh => scene.children.find((child) => child.name === name) as InstancedMesh;
    expect(town("town-CITY").visible).toBe(true);
    expect(town("town-CITY-banner").visible).toBe(true);
    expect(town("town-METROPOLIS").visible).toBe(false);
    expect(town("town-METROPOLIS-glow").visible).toBe(false);
    overlay.clear();
    overlay.commit();
    expect(town("town-CITY").visible).toBe(false);
    overlay.dispose();
  });
});
