import { describe, expect, it } from "vitest";
import { Scene } from "three";
import { createBombardFxLayer } from "./client-map-3d-bombard-fx.js";

describe("bombard FX layer", () => {
  it("spawns 9 tile effects for a 3x3 area", () => {
    const scene = new Scene();
    const fx = createBombardFxLayer(scene);

    expect(fx.group.children.length).toBe(0);

    fx.spawn(10, 20, 0.5);

    expect(fx.group.children.length).toBe(1);
    const entry = fx.group.children[0]!;
    expect(entry.type).toBe("Group");

    const tileCount = entry.children.filter((c) => c.type === "Group").length;
    expect(tileCount).toBe(9);

    fx.dispose();
    expect(fx.group.children.length).toBe(0);
  });

  it("removes expired entries on update", () => {
    const scene = new Scene();
    const fx = createBombardFxLayer(scene);

    fx.spawn(0, 0, 0);
    expect(fx.group.children.length).toBe(1);

    fx.update(performance.now() + 2000);

    expect(fx.group.children.length).toBe(0);

    fx.dispose();
  });
});
