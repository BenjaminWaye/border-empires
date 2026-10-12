// Regression tests for the Ancillary Depot (GARRISON_HALL) 3D asset.
//
// These pin the read of the new dedicated drum + body-pod storehouse art:
// the central storage drum with its brass bands and cyan core, the eight
// body-pods arranged evenly around it like cartridges in a revolver
// cylinder, and a humanoid silhouette + cyan visor on each pod's front —
// so a future refactor can't silently shrink it to a handful of rings.

import { describe, expect, it } from "vitest";
import { Scene } from "three";
import { createStructurePieceBuilder, type StructurePieceBuilder } from "./client-map-3d-structure-builder.js";
import { DEPOT_POD_COUNT, createAncillaryDepotLayout } from "./client-map-3d-structure-ancillary-depot.js";

const build = (): { meshCount: (key: string) => number; positionAt: (key: string, index: number) => [number, number, number]; } => {
  const scene = new Scene();
  const { builder, commit } = createStructurePieceBuilder(scene, 4);
  createAncillaryDepotLayout(builder)(0, 0, 0);
  commit();
  return {
    meshCount: (key) => {
      const mesh = builder.getMesh(key);
      return mesh ? mesh.count : -1;
    },
    positionAt: (key, index) => {
      const mesh = builder.getMesh(key);
      expect(mesh).not.toBeUndefined();
      const array = mesh!.instanceMatrix.array;
      return [array[index * 16 + 12]!, array[index * 16 + 13]!, array[index * 16 + 14]!];
    }
  };
};

const allocForMeasure = (): { builder: StructurePieceBuilder; } => {
  const { builder } = createStructurePieceBuilder(new Scene(), 4);
  return { builder };
};

describe("ancillary depot construction", () => {
  it("places the storage drum, brass bands, cap and cyan core", () => {
    const { meshCount } = build();
    expect(meshCount("adBase")).toBe(1);
    expect(meshCount("adDrum")).toBe(1);
    expect(meshCount("adBand")).toBe(2);
    expect(meshCount("adCap")).toBe(1);
    expect(meshCount("adHub")).toBe(1);
  });

  it("rings the drum with evenly-spaced body pods", () => {
    const { meshCount, positionAt } = build();
    expect(meshCount("adPod")).toBe(DEPOT_POD_COUNT);
    expect(meshCount("adPodPanel")).toBe(DEPOT_POD_COUNT);
    expect(meshCount("adTorso")).toBe(DEPOT_POD_COUNT);
    expect(meshCount("adHead")).toBe(DEPOT_POD_COUNT);
    expect(meshCount("adVisor")).toBe(DEPOT_POD_COUNT);

    const podZ = positionAt("adPod", 0)[2];
    const oppositePodZ = positionAt("adPod", Math.floor(DEPOT_POD_COUNT / 2))[2];
    expect(podZ).toBeGreaterThan(0);
    expect(oppositePodZ).toBeLessThan(0);
  });

  it("places the humanoid figure and cyan visor proud of each pod's front", () => {
    const { positionAt } = build();
    const podRadius = positionAt("adPod", 0)[2];
    const torsoRadius = positionAt("adTorso", 0)[2];
    const visorRadius = positionAt("adVisor", 0)[2];
    expect(torsoRadius).toBeGreaterThan(podRadius);
    expect(visorRadius).toBeGreaterThan(torsoRadius);
  });

  it("measures a tall silhouette dominated by the cartridge pods", () => {
    const { builder } = allocForMeasure();
    const height = builder.measure(() => createAncillaryDepotLayout(builder)(0, 0, 0));
    // Pods reach 0.20 + 0.17 (half of a 0.34 pod); the drum core is lower.
    expect(height).toBeCloseTo(0.37, 2);
  });
});