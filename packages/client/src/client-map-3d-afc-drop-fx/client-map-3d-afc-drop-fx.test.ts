import { Scene } from "three";
import { describe, expect, it } from "vitest";
import { AFC_JOIN_DESCENT_MS, AFC_JOIN_MODEL_OVERLAP_MS, AFC_JOIN_TOTAL_MS } from "../client-afc-join-drop/client-afc-join-drop-timeline.js";
import { createAfcDropFxLayer } from "./client-map-3d-afc-drop-fx.js";

const entryGroups = (layer: ReturnType<typeof createAfcDropFxLayer>) => layer.group.children;

describe("createAfcDropFxLayer", () => {
  it("adds one entry per drop and removes it (and its model) once the sequence ends", () => {
    const scene = new Scene();
    const layer = createAfcDropFxLayer(scene);
    const now = performance.now();
    layer.spawn(3, 4, 0, now);
    expect(entryGroups(layer)).toHaveLength(1);
    layer.update(now + 100);
    expect(entryGroups(layer)).toHaveLength(1);
    layer.update(now + AFC_JOIN_TOTAL_MS + 100);
    expect(entryGroups(layer)).toHaveLength(0);
    layer.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("lowers the model from orbit to the ground, holds it at touchdown, then retires it after the overlap", () => {
    const layer = createAfcDropFxLayer(new Scene());
    const now = performance.now();
    layer.spawn(0, 0, 0, now);
    const entry = entryGroups(layer)[0]!;
    const modelContainer = () => entry.children.find((child) => child instanceof Scene);
    layer.update(now + 10);
    const highY = modelContainer()!.position.y;
    layer.update(now + AFC_JOIN_DESCENT_MS / 2);
    const midY = modelContainer()!.position.y;
    layer.update(now + AFC_JOIN_DESCENT_MS);
    const landedY = modelContainer()!.position.y;
    expect(highY).toBeGreaterThan(midY);
    expect(midY).toBeGreaterThan(landedY);
    expect(landedY).toBeCloseTo(0, 5);
    layer.update(now + AFC_JOIN_DESCENT_MS + AFC_JOIN_MODEL_OVERLAP_MS + 10);
    expect(modelContainer()).toBeUndefined();
    layer.dispose();
  });

  it("ignores a drop whose timeline already finished (e.g. renderer switched on late)", () => {
    const layer = createAfcDropFxLayer(new Scene());
    layer.spawn(0, 0, 0, performance.now() - AFC_JOIN_TOTAL_MS - 1);
    expect(entryGroups(layer)).toHaveLength(0);
    layer.dispose();
  });

  it("clear() removes every in-flight drop", () => {
    const layer = createAfcDropFxLayer(new Scene());
    const now = performance.now();
    layer.spawn(0, 0, 0, now);
    layer.spawn(5, 5, 0, now);
    layer.clear();
    expect(entryGroups(layer)).toHaveLength(0);
    layer.dispose();
  });

  it("stays on its world tile when the scene origin moves under it (camera pan forcing a terrain rebuild)", () => {
    const layer = createAfcDropFxLayer(new Scene());
    const now = performance.now();
    const origin = { camX: 100, camY: 100 };
    const tileToScene = (x: number, y: number) => ({ sceneX: x - origin.camX, sceneZ: y - origin.camY });
    const start = tileToScene(103, 98);
    layer.spawn(start.sceneX, start.sceneZ, 0, now, { x: 103, y: 98 });
    layer.reanchor(tileToScene);
    const entry = entryGroups(layer)[0]!;
    expect([entry.position.x, entry.position.z]).toEqual([3, -2]);

    // The player pans 20 tiles east; the rebuild re-bases the scene on the camera.
    origin.camX = 120;
    layer.reanchor(tileToScene);
    layer.update(now + 2_000);
    expect([entry.position.x, entry.position.z]).toEqual([-17, -2]);
    layer.dispose();
  });
});
