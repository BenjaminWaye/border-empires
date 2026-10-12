import { describe, expect, it } from "vitest";
import { Color, type BufferGeometry } from "three";
import { TOWN_COLORS } from "./town-mesh-builder.js";
import { getTownTierGeometry, TOWN_TIERS, type TownTier } from "./town-tier-geometry.js";

const topOf = (geometry: BufferGeometry): number => {
  geometry.computeBoundingBox();
  return geometry.boundingBox!.max.y;
};

const tierTop = (tier: TownTier): number => {
  const { body, glow } = getTownTierGeometry(tier);
  return Math.max(topOf(body), glow ? topOf(glow) : 0);
};

const hasVertexColor = (geometry: BufferGeometry, hex: string): boolean => {
  const target = new Color(hex);
  const colors = geometry.getAttribute("color");
  for (let i = 0; i < colors.count; i += 1) {
    if (
      Math.abs(colors.getX(i) - target.r) < 1e-4 &&
      Math.abs(colors.getY(i) - target.g) < 1e-4 &&
      Math.abs(colors.getZ(i) - target.b) < 1e-4
    ) return true;
  }
  return false;
};

describe("procedural town tiers", () => {
  it.each(TOWN_TIERS)("%s stays inside its own tile", (tier) => {
    const { body, glow } = getTownTierGeometry(tier);
    for (const geometry of glow ? [body, glow] : [body]) {
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      // Every tier is drawn turned by a quarter-turn, so both axes need the margin.
      for (const extent of [box.min.x, box.max.x, box.min.z, box.max.z]) {
        expect(Math.abs(extent), `${tier} footprint`).toBeLessThanOrEqual(0.49);
      }
    }
  });

  it.each(TOWN_TIERS)("%s bakes colour per vertex and has lit windows", (tier) => {
    const { body, glow } = getTownTierGeometry(tier);
    expect(body.getAttribute("color")?.count).toBe(body.getAttribute("position").count);
    expect(glow, `${tier} glow`).toBeDefined();
    expect(hasVertexColor(glow!, TOWN_COLORS.lamp), `${tier} lit windows`).toBe(true);
  });

  it.each(TOWN_TIERS)("%s stays within a per-town vertex budget", (tier) => {
    const { body, glow } = getTownTierGeometry(tier);
    const vertices = body.getAttribute("position").count + (glow?.getAttribute("position").count ?? 0);
    expect(vertices, `${tier} vertices`).toBeLessThanOrEqual(40_000);
  });

  it("grows the skyline with every tier and crowns the metropolis in aether", () => {
    const tops = TOWN_TIERS.map(tierTop);
    for (let i = 1; i < tops.length; i += 1) {
      expect(tops[i], `${TOWN_TIERS[i]} taller than ${TOWN_TIERS[i - 1]}`).toBeGreaterThan(tops[i - 1]! + 0.08);
    }
    expect(tierTop("SETTLEMENT")).toBeLessThan(0.25);
    expect(tierTop("METROPOLIS")).toBeGreaterThan(0.9);
    const metropolisGlow = getTownTierGeometry("METROPOLIS").glow!;
    expect(hasVertexColor(metropolisGlow, TOWN_COLORS.aether)).toBe(true);
  });

  it("bakes each tier once and hands every overlay the same geometry", () => {
    expect(getTownTierGeometry("CITY")).toBe(getTownTierGeometry("CITY"));
  });
});
