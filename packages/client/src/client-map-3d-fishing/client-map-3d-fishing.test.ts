import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Box3, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { FISHING_FOOTPRINT, fishingModelFitMatrix, fishingWaterDirection, fishingYawFor } from "./client-map-3d-fishing.js";

describe("fishingModelFitMatrix", () => {
  it("centres the footprint, rests the base on y=0 and fits the longer side", () => {
    const bounds = new Box3(new Vector3(-0.8, -0.01, -0.8), new Vector3(0.6, 0.66, 0.65));
    const fitted = bounds.clone().applyMatrix4(fishingModelFitMatrix(bounds));
    expect(fitted.min.y).toBeCloseTo(0, 10);
    expect((fitted.min.x + fitted.max.x) / 2).toBeCloseTo(0, 10);
    expect((fitted.min.z + fitted.max.z) / 2).toBeCloseTo(0, 10);
    expect(Math.max(fitted.max.x - fitted.min.x, fitted.max.z - fitted.min.z)).toBeCloseTo(FISHING_FOOTPRINT, 10);
  });
});

describe("fishing2.glb (real checked-in asset)", () => {
  const load = async () => {
    const bytes = readFileSync(resolve(__dirname, "../../public/models/fishing2.glb"));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return new GLTFLoader().parseAsync(buffer, "");
  };

  it("has no flat ground plate — the terrain must show underneath", async () => {
    const gltf = await load();
    gltf.scene.updateMatrixWorld(true);
    // The removed floor was a ~1.5 x 1.5 slab less than 0.02 tall. No mesh may
    // be a wide, thin plate.
    gltf.scene.traverse((node) => {
      if (!("isMesh" in node)) return;
      const size = new Box3().setFromObject(node).getSize(new Vector3());
      expect(size.x > 1 && size.z > 1 && size.y < 0.05, `${node.name} looks like a floor plate`).toBe(false);
    });
  });

  it("still contains the fishing props", async () => {
    const gltf = await load();
    let meshes = 0;
    gltf.scene.traverse((node) => { if ("isMesh" in node) meshes += 1; });
    expect(meshes).toBe(27);
  });
});

describe("fishing water facing", () => {
  const waterOn = (...cells: Array<[number, number]>) => (x: number, y: number): boolean => cells.some(([cx, cy]) => cx === x && cy === y);
  // Where the model's water side (local +x) ends up after the yaw, in scene (x, z).
  const facing = (yaw: number): [number, number] => [Math.round(Math.cos(yaw)), Math.round(-Math.sin(yaw))];

  it.each([
    ["east", [11, 10], [1, 0]],
    ["south (+y)", [10, 11], [0, 1]],
    ["west", [9, 10], [-1, 0]],
    ["north (-y)", [10, 9], [0, -1]]
  ] as const)("turns the water side towards water to the %s", (_name, cell, expected) => {
    const water = fishingWaterDirection(waterOn([cell[0], cell[1]]), 10, 10);
    expect(facing(fishingYawFor(water, 10, 10))).toEqual([expected[0], expected[1]]);
  });

  it("prefers an edge-adjacent water tile over a corner one", () => {
    expect(fishingWaterDirection(waterOn([11, 11], [9, 10]), 10, 10)).toEqual({ dx: -1, dy: 0 });
  });

  it("uses a corner water tile when no edge tile is water", () => {
    expect(fishingWaterDirection(waterOn([11, 11]), 10, 10)).toEqual({ dx: 1, dy: 1 });
  });

  it("always faces one of the water neighbours when several are water, stably", () => {
    const isWater = waterOn([11, 10], [10, 11], [9, 10]);
    const first = fishingWaterDirection(isWater, 10, 10);
    expect(first).toEqual(fishingWaterDirection(isWater, 10, 10));
    expect([{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }]).toContainEqual(first);
  });

  it("has no direction, and falls back to a quarter turn, with no water nearby", () => {
    expect(fishingWaterDirection(waterOn(), 10, 10)).toBeUndefined();
    const yaw = fishingYawFor(undefined, 10, 10);
    expect(yaw / (Math.PI / 2)).toBeCloseTo(Math.round(yaw / (Math.PI / 2)), 10);
  });
});
