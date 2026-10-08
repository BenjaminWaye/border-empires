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
});
