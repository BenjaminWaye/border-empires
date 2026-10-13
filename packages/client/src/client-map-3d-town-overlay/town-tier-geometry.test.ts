import { describe, expect, it } from "vitest";
import { Color, type BufferGeometry } from "three";
import { TOWN_COLORS, TOWN_METAL_COLORS, type TownColor } from "./town-mesh-builder.js";
import { getTownTierGeometry, TOWN_TIERS, type TownTier } from "./town-tier-geometry.js";

const topOf = (geometry: BufferGeometry): number => {
  geometry.computeBoundingBox();
  return geometry.boundingBox!.max.y;
};

const partsOf = (tier: TownTier): BufferGeometry[] => {
  const { body, metal, glow } = getTownTierGeometry(tier);
  return [body, metal, glow].filter((part): part is BufferGeometry => part !== undefined);
};

const tierTop = (tier: TownTier): number => Math.max(...partsOf(tier).map(topOf));

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
    for (const geometry of partsOf(tier)) {
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      // Every tier is drawn turned by a quarter-turn, so both axes need the margin.
      for (const extent of [box.min.x, box.max.x, box.min.z, box.max.z]) {
        expect(Math.abs(extent), `${tier} footprint`).toBeLessThanOrEqual(0.49);
      }
    }
  });

  it.each(TOWN_TIERS)("%s keeps everything standing at street level on its octagonal plate", (tier) => {
    // The plate is the widest thing on the ground; anything at street level
    // further out than its edge hangs off it.
    const { body, metal } = getTownTierGeometry(tier);
    let plateApothem = 0;
    const position = body.getAttribute("position");
    for (let i = 0; i < position.count; i += 1) {
      // The plate's top face; its vertices sit 22.5° off the axes, so their
      // largest z is exactly the distance to the flat edges.
      if (Math.abs(position.getY(i) + 0.008) < 1e-4) plateApothem = Math.max(plateApothem, Math.abs(position.getZ(i)));
    }
    for (const part of [body, metal]) {
      if (!part) continue;
      const p = part.getAttribute("position");
      for (let i = 0; i < p.count; i += 1) {
        const y = p.getY(i);
        if (y < 0.004 || y > 0.03) continue;
        for (let k = 0; k < 4; k += 1) {
          const angle = (k * Math.PI) / 4;
          const reach = Math.abs(p.getX(i) * Math.cos(angle) + p.getZ(i) * Math.sin(angle));
          expect(reach, `${tier} vertex at (${p.getX(i).toFixed(3)}, ${y.toFixed(3)}, ${p.getZ(i).toFixed(3)})`).toBeLessThanOrEqual(plateApothem + 0.002);
        }
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
    const vertices = partsOf(tier).reduce((sum, part) => sum + part.getAttribute("position").count, 0);
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

  it.each(TOWN_TIERS)("%s draws its iron and brass with the metal mesh, AFC-style, and nothing else there", (tier) => {
    const { body, metal } = getTownTierGeometry(tier);
    expect(metal, `${tier} metalwork`).toBeDefined();
    const metalColors = [...TOWN_METAL_COLORS].map((name: TownColor) => TOWN_COLORS[name]);
    expect(metalColors.some((hex) => hasVertexColor(metal!, hex))).toBe(true);
    for (const hex of metalColors) expect(hasVertexColor(body, hex), `${tier} matte body has metal ${hex}`).toBe(false);
  });

  it.each(TOWN_TIERS)("%s carries animation attributes on every vertex, with turning parts", (tier) => {
    const geometry = getTownTierGeometry(tier);
    let spinningVertices = 0;
    for (const part of [geometry.body, geometry.metal, geometry.glow]) {
      if (!part) continue;
      const animA = part.getAttribute("animA");
      expect(animA.count, `${tier} animA`).toBe(part.getAttribute("position").count);
      expect(part.getAttribute("animB").count, `${tier} animB`).toBe(part.getAttribute("position").count);
      for (let i = 0; i < animA.count; i += 1) if (animA.getW(i) !== 0) spinningVertices += 1;
    }
    // Every tier has at least a turning cog.
    expect(spinningVertices, `${tier} spinning vertices`).toBeGreaterThan(0);
  });

  it.each(["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"] as const)("%s has steam rising from its stacks", (tier) => {
    const steam = getTownTierGeometry(tier).steam;
    expect(steam, `${tier} steam`).toBeDefined();
    const animA = steam!.getAttribute("animA");
    // Every puff loops (non-zero cycle rate) and rises (positive rise).
    for (let i = 0; i < animA.count; i += 1) {
      expect(animA.getW(i)).toBeGreaterThan(0);
      expect(steam!.getAttribute("animB").getZ(i)).toBeGreaterThan(0);
    }
  });

  it("bakes each tier once and hands every overlay the same geometry", () => {
    expect(getTownTierGeometry("CITY")).toBe(getTownTierGeometry("CITY"));
  });
});
