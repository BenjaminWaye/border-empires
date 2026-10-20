import { describe, expect, it } from "vitest";
import { Color, type BufferGeometry } from "three";
import { createTownMeshBuilder, TOWN_COLORS, TOWN_OCCLUSION_FLOOR, townOcclusionAt } from "./town-mesh-builder.js";

const stone = new Color(TOWN_COLORS.stone);

const colorAtY = (geometry: BufferGeometry, y: number): number[] => {
  const position = geometry.getAttribute("position");
  const color = geometry.getAttribute("color");
  for (let i = 0; i < position.count; i += 1) {
    if (Math.abs(position.getY(i) - y) < 1e-6) return [color.getX(i), color.getY(i), color.getZ(i)];
  }
  throw new Error(`no vertex at y = ${y}`);
};

describe("town mesh builder", () => {
  it("bakes ambient occlusion into tall parts, darkest at the street", () => {
    const builder = createTownMeshBuilder({ occlusion: true });
    builder.box(0, 0, 0, 0.1, 0.3, 0.1, "stone");
    const geometry = builder.build()!;
    expect(colorAtY(geometry, 0)[0]).toBeCloseTo(stone.r * TOWN_OCCLUSION_FLOOR, 5);
    expect(colorAtY(geometry, 0.3)[0]).toBeCloseTo(stone.r, 5);
    expect(townOcclusionAt(-0.05)).toBe(TOWN_OCCLUSION_FLOOR);
    expect(townOcclusionAt(0.5)).toBe(1);
  });

  it("leaves flat paving unshaded", () => {
    const builder = createTownMeshBuilder({ occlusion: true });
    builder.box(0, 0, 0, 0.1, 0.005, 0.1, "stone");
    expect(colorAtY(builder.build()!, 0.005)[0]).toBeCloseTo(stone.r, 5);
  });

  it("drops the never-seen undersides of static parts but keeps them on turning parts", () => {
    const flat = createTownMeshBuilder();
    flat.box(0, 0, 0, 0.1, 0.1, 0.1, "stone");
    expect(flat.build()!.getAttribute("position").count).toBe(30);
    const turning = createTownMeshBuilder();
    turning.withAnim({ a: [0, 0, 0, 1], b: [0, 0, 1, 0] }, () => turning.box(0, 0, 0, 0.1, 0.1, 0.1, "stone"));
    expect(turning.build()!.getAttribute("position").count).toBe(36);
  });

  it("fades light pools from their centre to nothing at the rim", () => {
    const builder = createTownMeshBuilder();
    builder.pool(0, 0.01, 0, 0.05, "lamp");
    const geometry = builder.build()!;
    expect(geometry.getAttribute("shade")).toBeUndefined();
    const position = geometry.getAttribute("position");
    const color = geometry.getAttribute("color");
    const lamp = new Color(TOWN_COLORS.lamp);
    for (let i = 0; i < position.count; i += 1) {
      const radius = Math.hypot(position.getX(i), position.getZ(i));
      expect(position.getY(i)).toBeCloseTo(0.01, 6);
      if (radius > 0.0499) expect(color.getX(i)).toBeCloseTo(0, 5);
      if (radius < 0.001) expect(color.getX(i)).toBeCloseTo(lamp.r, 2);
    }
  });
});
