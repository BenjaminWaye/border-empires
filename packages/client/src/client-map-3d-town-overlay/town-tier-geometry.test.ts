import { describe, expect, it } from "vitest";
import { Color, type BufferGeometry } from "three";
import { TOWN_COLORS, TOWN_GLASS_COLORS, TOWN_METAL_COLORS, type TownColor } from "./town-mesh-builder.js";
import { TOWN_BEACON_PHASE, TOWN_TIME_PERIOD } from "./town-animation-shaders.js";
import { TOWN_HALO_Y } from "./town-parts.js";
import { getTownTierGeometry, TOWN_TIERS, type TownTier } from "./town-tier-geometry.js";

const topOf = (geometry: BufferGeometry): number => {
  geometry.computeBoundingBox();
  return geometry.boundingBox!.max.y;
};

const partsOf = (tier: TownTier): BufferGeometry[] => {
  const { body, metal, glass, glow, halo, banner } = getTownTierGeometry(tier);
  return [body, metal, glass, glow, halo, banner].filter((part): part is BufferGeometry => part !== undefined);
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

/** Whether some vertex carries `hex` scaled by a shading factor (occlusion, sheen). */
const hasVertexHue = (geometry: BufferGeometry, hex: string): boolean => {
  const target = new Color(hex);
  const colors = geometry.getAttribute("color");
  for (let i = 0; i < colors.count; i += 1) {
    const k = colors.getX(i) / target.r;
    if (k > 0.3 && Math.abs(colors.getY(i) - target.g * k) < 1e-4 && Math.abs(colors.getZ(i) - target.b * k) < 1e-4) return true;
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
    const { body, metal, glass } = getTownTierGeometry(tier);
    let plateApothem = 0;
    const position = body.getAttribute("position");
    for (let i = 0; i < position.count; i += 1) {
      // The plate's top face; its vertices sit 22.5° off the axes, so their
      // largest z is exactly the distance to the flat edges.
      if (Math.abs(position.getY(i) + 0.008) < 1e-4) plateApothem = Math.max(plateApothem, Math.abs(position.getZ(i)));
    }
    for (const part of [body, metal, glass]) {
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
    const steam = getTownTierGeometry(tier).steam;
    const vertices = [...partsOf(tier), ...(steam ? [steam] : [])].reduce((sum, part) => sum + part.getAttribute("position").count, 0);
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

  it.each(TOWN_TIERS)("%s draws its iron and brass with the metal mesh, AFC-style, and its glass with the mirror mesh", (tier) => {
    const { body, metal, glass } = getTownTierGeometry(tier);
    expect(metal, `${tier} metalwork`).toBeDefined();
    expect(glass, `${tier} glass`).toBeDefined();
    const metalColors = [...TOWN_METAL_COLORS].map((name: TownColor) => TOWN_COLORS[name]);
    const glassColors = [...TOWN_GLASS_COLORS].map((name: TownColor) => TOWN_COLORS[name]);
    expect(metalColors.some((hex) => hasVertexColor(metal!, hex))).toBe(true);
    expect(glassColors.some((hex) => hasVertexHue(glass!, hex))).toBe(true);
    // By hue: the matte body's colours are all scaled by weathering and occlusion.
    for (const hex of metalColors) expect(hasVertexHue(body, hex), `${tier} matte body has ${hex}`).toBe(false);
    for (const hex of glassColors) {
      expect(hasVertexHue(body, hex), `${tier} matte body has glass ${hex}`).toBe(false);
      expect(hasVertexHue(metal!, hex), `${tier} metal has glass ${hex}`).toBe(false);
    }
  });

  it.each(TOWN_TIERS)("%s throws soft pools of light onto its paving", (tier) => {
    const halo = getTownTierGeometry(tier).halo;
    expect(halo, `${tier} light pools`).toBeDefined();
    const position = halo!.getAttribute("position");
    const color = halo!.getAttribute("color");
    let bright = 0;
    let dark = 0;
    for (let i = 0; i < position.count; i += 1) {
      // Flat on the ground, just over the sidewalks.
      expect(position.getY(i)).toBeCloseTo(TOWN_HALO_Y, 6);
      const value = Math.max(color.getX(i), color.getY(i), color.getZ(i));
      if (value > 0.6) bright += 1;
      if (value < 1e-3) dark += 1;
    }
    // Lit at the source and fading out to black (adding nothing) at the edge.
    expect(bright).toBeGreaterThan(0);
    expect(dark).toBeGreaterThan(0);
  });

  it.each(TOWN_TIERS)("%s flies rippling banners of white cloth, ready for the owner's dye", (tier) => {
    const banner = getTownTierGeometry(tier).banner;
    expect(banner, `${tier} banners`).toBeDefined();
    const color = banner!.getAttribute("color");
    const animA = banner!.getAttribute("animA");
    for (let i = 0; i < color.count; i += 1) {
      expect([color.getX(i), color.getY(i), color.getZ(i)]).toEqual([1, 1, 1]);
      // Rippling, and seamlessly across the shader clock's wrap.
      const turns = (animA.getW(i) * TOWN_TIME_PERIOD) / (2 * Math.PI);
      expect(animA.getW(i)).toBeGreaterThan(0);
      expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-3);
    }
  });

  it("puts blinking warning lights on the tall skylines only", () => {
    const beaconCount = (tier: TownTier): number => {
      const glow = getTownTierGeometry(tier).glow!;
      const color = glow.getAttribute("color");
      const animB = glow.getAttribute("animB");
      const beacon = new Color(TOWN_COLORS.beacon);
      let count = 0;
      for (let i = 0; i < color.count; i += 1) {
        if (Math.abs(color.getX(i) - beacon.r) < 1e-4 && Math.abs(color.getY(i) - beacon.g) < 1e-4) {
          expect(animB.getW(i), `${tier} beacon blinks`).toBeGreaterThanOrEqual(TOWN_BEACON_PHASE);
          count += 1;
        }
      }
      return count;
    };
    expect(beaconCount("SETTLEMENT")).toBe(0);
    for (const tier of ["CITY", "GREAT_CITY", "METROPOLIS"] as const) expect(beaconCount(tier), tier).toBeGreaterThan(0);
  });

  it.each(TOWN_TIERS)("%s stands on a matte stone skirt that flares towards the ground", (tier) => {
    // The skirt shows wherever the tile's corners sit below the plate; as
    // dark metal it read as a black band, so it stays lit stone and flares.
    const { body, metal } = getTownTierGeometry(tier);
    metal!.computeBoundingBox();
    expect(metal!.boundingBox!.min.y, `${tier} metal below the plate`).toBeGreaterThan(-0.03);
    // Baked occlusion darkens the foot, so check it is a shade of stoneDark
    // rather than an exact match -- and well clear of near-black.
    const stone = new Color(TOWN_COLORS.stoneDark);
    const position = body.getAttribute("position");
    const color = body.getAttribute("color");
    let footReach = 0;
    let topReach = 0;
    for (let i = 0; i < position.count; i += 1) {
      const reach = Math.hypot(position.getX(i), position.getZ(i));
      if (Math.abs(position.getY(i) + 0.1) < 1e-4) {
        footReach = Math.max(footReach, reach);
        const shade = color.getY(i) / stone.g;
        expect(shade, `${tier} skirt foot brightness`).toBeGreaterThan(0.5);
        expect(color.getX(i) / stone.r).toBeCloseTo(shade, 2);
        expect(color.getZ(i) / stone.b).toBeCloseTo(shade, 2);
      }
      if (Math.abs(position.getY(i) + 0.008) < 1e-4) topReach = Math.max(topReach, reach);
    }
    expect(footReach, `${tier} skirt foot wider than its top`).toBeGreaterThan(topReach * 1.05);
  });

  it.each(TOWN_TIERS)("%s carries animation attributes on every vertex, with turning parts", (tier) => {
    const geometry = getTownTierGeometry(tier);
    let spinningVertices = 0;
    for (const part of [geometry.body, geometry.metal, geometry.glass, geometry.glow, geometry.halo]) {
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

  it.each(TOWN_TIERS)("%s loops seamlessly when the shader clock wraps", (tier) => {
    // Every spin turns, and every steam puff cycles, a whole number of times
    // per TOWN_TIME_PERIOD -- otherwise moving parts snap once an hour.
    const { body, metal, glass, glow, halo, steam } = getTownTierGeometry(tier);
    const wholeTurns = (rate: number): boolean => Math.abs(rate - Math.round(rate)) < 1e-3;
    for (const part of [body, metal, glass, glow, halo]) {
      if (!part) continue;
      const animA = part.getAttribute("animA");
      for (let i = 0; i < animA.count; i += 1) {
        expect(wholeTurns((animA.getW(i) * TOWN_TIME_PERIOD) / (2 * Math.PI))).toBe(true);
      }
    }
    const steamA = steam!.getAttribute("animA");
    for (let i = 0; i < steamA.count; i += 1) expect(wholeTurns(steamA.getW(i) * TOWN_TIME_PERIOD)).toBe(true);
  });

  it("bakes each tier once and hands every overlay the same geometry", () => {
    expect(getTownTierGeometry("CITY")).toBe(getTownTierGeometry("CITY"));
  });
});
