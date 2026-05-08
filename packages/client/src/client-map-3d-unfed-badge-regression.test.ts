import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { InstancedMesh, Scene } from "three";
import { describe, expect, it } from "vitest";

import { createUnfedBadgeOverlay } from "./client-map-3d-unfed-badge-overlay.js";
import { shouldShowTownUnfedWarning } from "./client-town-growth.js";
import type { Tile } from "./client-types.js";

type TileOverrides = Omit<Partial<Tile>, "town"> & { town?: Partial<NonNullable<Tile["town"]>> };

const ownedSettledUnfedTownTile = (overrides: TileOverrides = {}): Tile => {
  const { town: townOverrides, ...tileOverrides } = overrides;
  return {
    x: 0,
    y: 0,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "SETTLED",
    ...tileOverrides,
    town: {
      type: "FARMING",
      baseGoldPerMinute: 1,
      supportCurrent: 0,
      supportMax: 4,
      goldPerMinute: 0,
      cap: 0,
      isFed: false,
      population: 20_000,
      maxPopulation: 100_000,
      populationGrowthPerMinute: 0,
      populationTier: "TOWN",
      connectedTownCount: 0,
      connectedTownBonus: 0,
      hasMarket: false,
      marketActive: false,
      hasGranary: false,
      granaryActive: false,
      hasBank: false,
      bankActive: false,
      ...townOverrides
    }
  };
};

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d unfed-town badge regression guard", () => {
  it("wires the unfed badge overlay into the 3D renderer lifecycle", () => {
    const source = clientSource("./client-map-3d.ts");
    expect(source).toContain('createUnfedBadgeOverlay');
    expect(source).toContain('unfedBadgeOverlay.addInstance');
    expect(source).toContain('unfedBadgeOverlay.clear()');
    expect(source).toContain('unfedBadgeOverlay.commit()');
    expect(source).toContain('unfedBadgeOverlay.dispose()');
  });

  it("paints the badge through the shared shouldShowTownUnfedWarning predicate", () => {
    const source = clientSource("./client-map-3d.ts");
    // Parity with the tile-menu "Town is unfed" line: badge predicate must
    // come from shouldShowTownUnfedWarning so neutral, foreign, unsettled,
    // and SETTLEMENT-tier towns don't light up the map.
    expect(source).toContain('shouldShowTownUnfedWarning(tile)');
    expect(source).toContain('unfedBadgeOverlay.addInstance(x, z, surfaceY)');
  });

  it("paints for an owned, settled, unfed, stalled, non-SETTLEMENT town", () => {
    expect(shouldShowTownUnfedWarning(ownedSettledUnfedTownTile())).toBe(true);
  });

  it("does NOT paint on a neutral (unowned) town — matches tile-menu's 'Neutral town' branch", () => {
    const tile = ownedSettledUnfedTownTile({ ownerId: undefined, ownershipState: undefined });
    expect(shouldShowTownUnfedWarning(tile)).toBe(false);
  });

  it("does NOT paint on a foreign town with no economy data — isFed missing/non-boolean", () => {
    const tile = ownedSettledUnfedTownTile({ ownerId: "enemy" });
    // Foreign satellite-reveal payloads strip isFed, so simulate that.
    delete (tile.town as { isFed?: boolean }).isFed;
    expect(shouldShowTownUnfedWarning(tile)).toBe(false);
  });

  it("does NOT paint on a frontier (unsettled) tile we own", () => {
    expect(shouldShowTownUnfedWarning(ownedSettledUnfedTownTile({ ownershipState: "FRONTIER" }))).toBe(false);
  });

  it("does NOT paint on a SETTLEMENT-tier town — production line covers this case", () => {
    expect(shouldShowTownUnfedWarning(ownedSettledUnfedTownTile({ town: { populationTier: "SETTLEMENT" } }))).toBe(false);
  });

  it("does NOT paint when the town is fed", () => {
    expect(shouldShowTownUnfedWarning(ownedSettledUnfedTownTile({ town: { isFed: true } }))).toBe(false);
  });

  it("does NOT paint when the town is producing gold (not actually stalled)", () => {
    expect(shouldShowTownUnfedWarning(ownedSettledUnfedTownTile({ town: { goldPerMinute: 0.5 } }))).toBe(false);
  });

  it("does NOT paint when population is still growing (not actually stalled)", () => {
    expect(shouldShowTownUnfedWarning(ownedSettledUnfedTownTile({ town: { populationGrowthPerMinute: 1 } }))).toBe(false);
  });

  it("emits exactly one triangle + dot pair per unfed town and clears between frames", () => {
    const scene = new Scene();
    const overlay = createUnfedBadgeOverlay(scene, 32);
    const meshes = overlay.group.children.filter(
      (c): c is InstancedMesh => c instanceof InstancedMesh
    );
    // Triangle + dot — two InstancedMesh objects on the overlay group.
    expect(meshes).toHaveLength(2);

    overlay.clear();
    overlay.addInstance(1, 2, 0.5);
    overlay.commit();
    expect(meshes[0]!.count).toBe(1);
    expect(meshes[1]!.count).toBe(1);

    overlay.clear();
    overlay.commit();
    expect(meshes[0]!.count).toBe(0);
    expect(meshes[1]!.count).toBe(0);

    overlay.dispose();
  });
});
