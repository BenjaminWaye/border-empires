import { describe, expect, it } from "vitest";
import { createFleetHullMesh, disposeFleetHullMesh } from "./client-space-fleet-hull-mesh.js";
import { FLEET_HULL_CLASS_IDS } from "../../client-fleet-panel/client-fleet-panel-html.js";

describe("createFleetHullMesh", () => {
  it("builds a non-empty group for every hull class", () => {
    for (const hullId of FLEET_HULL_CLASS_IDS) {
      const entry = createFleetHullMesh(hullId);
      expect(entry.hullId).toBe(hullId);
      expect(entry.group.children.length).toBeGreaterThan(0);
    }
  });

  it("gives distinct hull classes visually distinct models (different mesh counts or geometry types)", () => {
    const scout = createFleetHullMesh("SCOUT");
    const dreadnought = createFleetHullMesh("DREADNOUGHT");
    // A Dreadnought (hull + nose + 2 spikes) should never collapse to the
    // same mesh count as a Scout (nose + one small body) -- if it ever did,
    // the "distinct overlay per vessel type" the models exist for would be
    // silently lost.
    expect(dreadnought.group.children.length).not.toBe(scout.group.children.length);
  });
});

describe("disposeFleetHullMesh", () => {
  it("does not throw for any hull class", () => {
    for (const hullId of FLEET_HULL_CLASS_IDS) {
      expect(() => disposeFleetHullMesh(createFleetHullMesh(hullId))).not.toThrow();
    }
  });
});
