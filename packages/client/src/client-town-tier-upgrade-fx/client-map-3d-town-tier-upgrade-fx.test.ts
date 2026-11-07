import { Group, Mesh } from "three";
import { describe, expect, it } from "vitest";
import { createTownTierUpgradeFxLayer } from "./client-map-3d-town-tier-upgrade-fx.js";
import { townTierCelebrationProfile } from "./client-town-tier-upgrade-fx.js";

const meshCount = (group: Group): number => group.children[0]!.children.filter((child) => child instanceof Mesh).length;

describe("createTownTierUpgradeFxLayer", () => {
  it("builds a bigger celebration for a higher tier and removes it once played", () => {
    const parent = new Group();
    const layer = createTownTierUpgradeFxLayer(parent);
    layer.spawn(0, 0, 0, "TOWN", 0);
    const townMeshes = meshCount(layer.group);
    layer.clear();
    layer.spawn(0, 0, 0, "METROPOLIS", 0);
    expect(meshCount(layer.group)).toBeGreaterThan(townMeshes);

    layer.update(townTierCelebrationProfile("METROPOLIS").durationMs * 0.3);
    const visibleRings = layer.group.children[0]!.children.filter((child) => child instanceof Mesh && child.visible).length;
    expect(visibleRings).toBeGreaterThan(3);

    layer.update(townTierCelebrationProfile("METROPOLIS").durationMs + 1);
    expect(layer.group.children).toHaveLength(0);
    layer.dispose();
    expect(parent.children).toHaveLength(0);
  });
});
