import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { InstancedMesh, Scene } from "three";
import { describe, expect, it } from "vitest";

import { createUpgradeReadyBadgeOverlay } from "./client-map-3d-upgrade-ready-badge-overlay.js";
import { shouldShowTownUpgradeReadyBadge } from "../client-town-growth/client-town-growth.js";
import type { Tile } from "../client-types.js";

type TileOverrides = Omit<Partial<Tile>, "town"> & { town?: Partial<NonNullable<Tile["town"]>> };

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

const ownedReadyTownTile = (overrides: TileOverrides = {}): Tile => {
  const { town: townOverrides, ...tileOverrides } = overrides;
  const town: NonNullable<Tile["town"]> = {
    type: "FARMING",
    baseGoldPerMinute: 1,
    supportCurrent: 0,
    supportMax: 4,
    goldPerMinute: 0,
    cap: 0,
    isFed: true,
    population: 150_000,
    maxPopulation: 1_000_000,
    populationGrowthPerMinute: 100,
    populationTier: "CITY",
    connectedTownCount: 0,
    connectedTownBonus: 0,
    hasMintworks: false,
    mintworksActive: false,
    hasGranary: false,
    granaryActive: false,
    nextPopulationTierUpgrade: {
      targetTier: "CITY",
      requiredPopulation: 100_000,
      goldCost: 40,
      available: true
    },
    ...townOverrides
  };
  return {
    x: 3,
    y: 4,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "SETTLED",
    ...tileOverrides,
    town
  };
};

describe("3d town-upgrade-ready badge regression guard", () => {
  it("wires the upgrade-ready badge overlay into the 3D renderer lifecycle", () => {
    const source = clientSource("../client-map-3d/client-map-3d.ts");
    expect(source).toContain("createUpgradeReadyBadgeOverlay");
    expect(source).toContain("upgradeReadyBadgeOverlay.addInstance(x, z, surfaceY)");
    expect(source).toContain("upgradeReadyBadgeOverlay.clear()");
    expect(source).toContain("upgradeReadyBadgeOverlay.commit()");
    expect(source).toContain("upgradeReadyBadgeOverlay.dispose()");
  });

  it("paints the badge through the shared shouldShowTownUpgradeReadyBadge predicate", () => {
    const source = clientSource("../client-map-3d/client-map-3d.ts");
    // Parity with the tile-menu "Upgrade Town to City"-style action: the badge
    // predicate must come from shouldShowTownUpgradeReadyBadge so neutral,
    // foreign, unsettled, and max-tier towns don't light up the map.
    expect(source).toContain("shouldShowTownUpgradeReadyBadge(tile, deps.state.me)");
    expect(source).toContain("upgradeReadyBadgeOverlay.addInstance(x, z, surfaceY)");
  });

  it("paints for an owned, settled, non-SETTLEMENT town that has reached its next tier", () => {
    expect(shouldShowTownUpgradeReadyBadge(ownedReadyTownTile(), "me")).toBe(true);
  });

  it("paints for a TOWN heading to CITY using the server-stamped upgrade field", () => {
    expect(shouldShowTownUpgradeReadyBadge(ownedReadyTownTile({ town: { populationTier: "TOWN" } }), "me")).toBe(true);
  });

  it("does NOT paint when the town has NOT yet reached the population threshold", () => {
    expect(
      shouldShowTownUpgradeReadyBadge(ownedReadyTownTile({ town: { nextPopulationTierUpgrade: { targetTier: "CITY", requiredPopulation: 100_000, goldCost: 40, available: false } } }), "me")
    ).toBe(false);
  });

  it("does NOT paint without a server nextPopulationTierUpgrade stamp (max tier reached)", () => {
    const tile = ownedReadyTownTile();
    delete (tile.town as { nextPopulationTierUpgrade?: unknown }).nextPopulationTierUpgrade;
    expect(shouldShowTownUpgradeReadyBadge(tile, "me")).toBe(false);
  });

  it("does NOT paint on a neutral (unowned) town", () => {
    const tile = ownedReadyTownTile();
    delete (tile as { ownerId?: string }).ownerId;
    delete (tile as { ownershipState?: Tile["ownershipState"] }).ownershipState;
    expect(shouldShowTownUpgradeReadyBadge(tile, "me")).toBe(false);
  });

  it("does NOT paint on another player's town, even though it is settled and upgrade-ready", () => {
    const tile = ownedReadyTownTile({ ownerId: "opponent" });
    expect(shouldShowTownUpgradeReadyBadge(tile, "me")).toBe(false);
  });

  it("does NOT paint on a frontier (unsettled) tile", () => {
    expect(shouldShowTownUpgradeReadyBadge(ownedReadyTownTile({ ownershipState: "FRONTIER" }), "me")).toBe(false);
  });

  it("does NOT paint on a SETTLEMENT-tier town — its Town step is filtered off the wire", () => {
    const tile = ownedReadyTownTile({ town: { populationTier: "SETTLEMENT" } });
    delete (tile.town as { nextPopulationTierUpgrade?: unknown }).nextPopulationTierUpgrade;
    expect(shouldShowTownUpgradeReadyBadge(tile, "me")).toBe(false);
  });

  it("emits exactly one badge per instance and clears between frames", () => {
    const scene = new Scene();
    const overlay = createUpgradeReadyBadgeOverlay(scene, 32);
    const meshes = overlay.group.children.filter(
      (c): c is InstancedMesh => c instanceof InstancedMesh
    );
    // Single textured plane per badge (canvas texture: green shield + ⬆
    // up-arrow). The previous primitive-only designs used 2-3 meshes; the
    // 2D-texture-on-a-plane approach is one mesh.
    expect(meshes).toHaveLength(1);

    overlay.clear();
    overlay.addInstance(1, 2, 0.5);
    overlay.commit();
    expect(meshes[0]!.count).toBe(1);

    overlay.clear();
    overlay.commit();
    expect(meshes[0]!.count).toBe(0);

    overlay.dispose();
  });
});