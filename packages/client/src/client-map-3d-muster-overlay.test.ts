import { Color, InstancedMesh, Scene } from "three";
import { describe, expect, it } from "vitest";

import { BANNER_CLOTH, bannerRestPoint, MUSTER_PLINTH_RADIUS, MUSTER_PLINTH_TOP_Y } from "./client-map-3d-muster-banner/muster-banner-geometry.js";
import { createMusterOverlay } from "./client-map-3d-muster-overlay.js";

const meshNamed = (scene: Scene, name: string): InstancedMesh => {
  const mesh = scene.getObjectByName(name);
  if (!(mesh instanceof InstancedMesh)) throw new Error(`missing ${name}`);
  return mesh;
};

describe("3d muster banner overlay", () => {
  it("draws the banner as lit, depth-tested, shadow-casting pieces like the towns", () => {
    // The ownership overlay depth-tests now (client-map-3d-ownership-overlay.ts),
    // so a depth-tested piece is no longer painted over by the territory tint.
    const scene = new Scene();
    const overlay = createMusterOverlay(scene);
    for (const name of ["body", "metal", "enamel", "cloth"]) {
      const mesh = meshNamed(scene, `muster-banner-${name}`);
      const material = mesh.material as { depthTest: boolean; transparent: boolean };
      expect(material.depthTest).toBe(true);
      expect(material.transparent).toBe(false);
      expect(mesh.castShadow).toBe(true);
      expect(mesh.customDepthMaterial).toBeDefined();
    }
    overlay.dispose();
  });

  it("puts one banner on each mustering tile, tinted in the owner's colour", () => {
    const scene = new Scene();
    const overlay = createMusterOverlay(scene);
    const body = meshNamed(scene, "muster-banner-body");
    const enamel = meshNamed(scene, "muster-banner-enamel");
    const cloth = meshNamed(scene, "muster-banner-cloth");
    const soldiers = scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh && !c.name)!;

    overlay.addMuster(1, 2, 0.3, 0.5, "#ff0000", false, 1, 2);
    overlay.addMuster(4, 5, 0.1, 0.5, "#00ff00", true, 4, 5);
    overlay.commit();
    overlay.tick(0);

    expect(body.count).toBe(2);
    expect(enamel.count).toBe(2);
    expect(cloth.count).toBe(2);
    // All four parts share the body's transforms.
    expect(cloth.instanceMatrix).toBe(body.instanceMatrix);
    expect(soldiers.count).toBeGreaterThanOrEqual(6);

    const color = new Color();
    cloth.getColorAt(0, color);
    expect(color.getHexString()).toBe("ff0000");
    // ADVANCE lifts the colour toward white and whips the banner faster.
    cloth.getColorAt(1, color);
    expect(color.r).toBeGreaterThan(0.2);
    const wind = cloth.geometry.getAttribute("aBannerWind");
    expect(wind.getY(0)).toBe(1);
    expect(wind.getY(1)).toBeGreaterThan(1);

    overlay.clear();
    overlay.commit();
    overlay.tick(0);
    expect(body.count).toBe(0);
    expect(cloth.count).toBe(0);
    expect(soldiers.count).toBe(0);
    overlay.dispose();
  });

  it("hangs the banner from its crossbar to a pointed tail, clear of the plinth and inside its tile", () => {
    const tip = bannerRestPoint(0.5, 0);
    const corner = bannerRestPoint(0, 0);
    // The middle of the hem hangs lowest: the gonfalon's pointed tail.
    expect(tip.y).toBeLessThan(corner.y);
    // Even with the wind swinging it out, the tail stays well above the plinth top.
    expect(tip.y).toBeGreaterThan(MUSTER_PLINTH_TOP_Y + 0.2);
    expect(bannerRestPoint(0, 1).y).toBe(BANNER_CLOTH.topY);
    expect(Math.abs(bannerRestPoint(1, 0.5).x)).toBeLessThan(0.5);
    expect(MUSTER_PLINTH_RADIUS * 1.03).toBeLessThan(0.5);
  });

  it("rings a besieged flag in red and stands its soldiers guard until the siege ends", () => {
    const scene = new Scene();
    const overlay = createMusterOverlay(scene);
    const ring = meshNamed(scene, "muster-siege-ring");
    const now = Date.now();
    overlay.addMuster(1, 2, 0.3, 0.5, "#ff0000", false, 1, 2, now + 60_000);
    overlay.addMuster(4, 5, 0.1, 0.5, "#00ff00", false, 4, 5);
    overlay.commit();
    overlay.tick(0);
    expect(ring.count).toBe(1);
    overlay.clear();
    overlay.addMuster(1, 2, 0.3, 0.5, "#ff0000", false, 1, 2, now - 1);
    overlay.commit();
    overlay.tick(0);
    expect(ring.count).toBe(0);
    overlay.dispose();
  });

  it("floats a progress badge over flags the badge lookup knows, and none over the rest", () => {
    const scene = new Scene();
    const overlay = createMusterOverlay(scene, undefined, () => (key) =>
      key === "1,2" ? { ratio: 0.4, kind: "attack", staged: 40, required: 100 } : undefined
    );
    overlay.addMuster(1, 2, 0.3, 0.5, "#ff0000", false, 1, 2);
    overlay.addMuster(4, 5, 0.1, 0.5, "#00ff00", false, 4, 5);
    overlay.commit();
    overlay.tick(0);

    const badges = scene.children.filter((c) => c.name === "muster-progress-badge" && c.visible);
    expect(badges).toHaveLength(1);
    expect(badges[0]!.position.x).toBe(1);
    expect(badges[0]!.position.z).toBe(2);
    expect(badges[0]!.position.y).toBeGreaterThan(0.3 + 1);
    overlay.dispose();
  });
});

