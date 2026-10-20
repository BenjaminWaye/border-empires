import { describe, expect, it } from "vitest";
import { Color, Scene, type InstancedMesh } from "three";
import { createTownOverlay, TOWN_UNOWNED_BANNER_COLOR } from "../client-map-3d-town-overlay.js";

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
});
