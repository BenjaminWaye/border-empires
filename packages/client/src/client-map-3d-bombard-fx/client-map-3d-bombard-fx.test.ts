import { describe, expect, it } from "vitest";
import { Scene } from "three";
import { createBombardFxLayer, type BombardTileOutcome } from "./client-map-3d-bombard-fx.js";

const grid3x3: BombardTileOutcome[] = [];
for (let dy = -1; dy <= 1; dy += 1) {
  for (let dx = -1; dx <= 1; dx += 1) {
    grid3x3.push({ dx, dy, outcome: (dx + dy) % 2 === 0 ? "hit" : "miss" });
  }
}

describe("bombard FX layer", () => {
  it("spawns one tile effect per reported outcome", () => {
    const scene = new Scene();
    const fx = createBombardFxLayer(scene);

    expect(fx.group.children.length).toBe(0);

    fx.spawn(10, 20, 0.5, grid3x3);

    expect(fx.group.children.length).toBe(1);
    const entry = fx.group.children[0]!;
    expect(entry.type).toBe("Group");

    const tileCount = entry.children.filter((c) => c.type === "Group").length;
    expect(tileCount).toBe(9);

    fx.dispose();
    expect(fx.group.children.length).toBe(0);
  });

  it("renders only hit tiles with a ring/flash explosion", () => {
    const scene = new Scene();
    const fx = createBombardFxLayer(scene);

    fx.spawn(0, 0, 0, [{ dx: 0, dy: 0, outcome: "hit" }]);

    const entry = fx.group.children[0]!;
    const tileGroup = entry.children[0]!;
    const meshTypes = tileGroup.children.map((c) => c.type);
    expect(meshTypes.filter((t) => t === "Mesh").length).toBe(2);

    fx.dispose();
  });

  it("renders miss tiles with smoke puffs instead of an explosion", () => {
    const scene = new Scene();
    const fx = createBombardFxLayer(scene);

    fx.spawn(0, 0, 0, [{ dx: 0, dy: 0, outcome: "miss" }]);

    const entry = fx.group.children[0]!;
    const tileGroup = entry.children[0]!;
    expect(tileGroup.children.length).toBe(3);

    fx.dispose();
  });

  it("removes expired entries on update", () => {
    const scene = new Scene();
    const fx = createBombardFxLayer(scene);

    fx.spawn(0, 0, 0, grid3x3);
    expect(fx.group.children.length).toBe(1);

    fx.update(performance.now() + 2000);

    expect(fx.group.children.length).toBe(0);

    fx.dispose();
  });
});
