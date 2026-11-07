import { Group } from "three";
import { describe, expect, it, vi } from "vitest";
import { TOWN_GROW_RISE, TOWN_GROW_SINK } from "../client-map-3d-town-overlay/town-growth-shader.js";
import { addTownInstanceWithGrowth } from "./client-map-3d-town-growth.js";
import { createTownTierUpgradeFxLayer } from "./client-map-3d-town-tier-upgrade-fx.js";
import { TOWN_GROWTH_DUST_MS, TOWN_GROWTH_START_MS, TOWN_GROWTH_TRANSITION_MS } from "./client-town-tier-upgrade-fx.js";

describe("addTownInstanceWithGrowth", () => {
  const upgrade = { x: 5, y: 6, fromTier: "TOWN", tier: "CITY", startedAt: 10_000 } as const;

  it("draws the old tier sinking and the new tier growing, timed from the upgrade's start", () => {
    const overlay = { addInstance: vi.fn() };
    addTownInstanceWithGrowth(overlay, upgrade, 1, 2, 0.3, "CITY", 5, 6, 10_500, 20_000);
    expect(overlay.addInstance).toHaveBeenCalledTimes(2);
    expect(overlay.addInstance).toHaveBeenNthCalledWith(1, 1, 2, 0.3, "TOWN", 5, 6, false, { mode: TOWN_GROW_SINK, startSeconds: 19.5 });
    expect(overlay.addInstance).toHaveBeenNthCalledWith(2, 1, 2, 0.3, "CITY", 5, 6, false, { mode: TOWN_GROW_RISE, startSeconds: 19.5 });
  });

  it("draws a plain town once the transition is over, or for a tier it does not lead to", () => {
    const overlay = { addInstance: vi.fn() };
    addTownInstanceWithGrowth(overlay, upgrade, 1, 2, 0.3, "CITY", 5, 6, 10_000 + TOWN_GROWTH_TRANSITION_MS, 20_000);
    addTownInstanceWithGrowth(overlay, upgrade, 1, 2, 0.3, "GREAT_CITY", 5, 6, 10_500, 20_000);
    addTownInstanceWithGrowth(overlay, undefined, 1, 2, 0.3, "CITY", 5, 6, 10_500, 20_000);
    expect(overlay.addInstance.mock.calls.every((call) => call.length === 6)).toBe(true);
    expect(overlay.addInstance).toHaveBeenCalledTimes(3);
  });
});

describe("createTownTierUpgradeFxLayer", () => {
  it("kicks up dust while the town grows and clears it once settled", () => {
    const parent = new Group();
    const layer = createTownTierUpgradeFxLayer(parent);
    layer.spawn(0, 0, 0, "METROPOLIS", 0);
    layer.update(TOWN_GROWTH_START_MS + 1000);
    const visible = layer.group.children[0]!.children.filter((child) => child.visible).length;
    expect(visible).toBeGreaterThan(0);
    layer.update(TOWN_GROWTH_DUST_MS + 1);
    expect(layer.group.children).toHaveLength(0);
    layer.dispose();
    expect(parent.children).toHaveLength(0);
  });
});
