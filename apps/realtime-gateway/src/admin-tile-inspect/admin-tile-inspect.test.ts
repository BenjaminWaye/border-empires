import { describe, expect, it } from "vitest";

import { blockCentres, classifyVisibility, describeTile, isInSquare, renderGrid, tileGridChar, type WireTile } from "./admin-tile-inspect.js";

const W = 640;
const H = 320;

// Every tile the 3x3 blocks around `centres` return, mirroring FetchTileDetail's sim-side wrap.
const coveredBy = (centres: Array<{ x: number; y: number }>): Set<string> => {
  const covered = new Set<string>();
  for (const centre of centres) {
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) covered.add(`${(centre.x + dx + W) % W},${(centre.y + dy + H) % H}`);
  }
  return covered;
};

describe("blockCentres", () => {
  for (let radius = 0; radius <= 6; radius += 1) {
    it(`covers the whole square at radius ${radius}, including across both world edges`, () => {
      for (const [x, y] of [[524, 298], [0, 0], [639, 319]] as const) {
        const centres = blockCentres(x, y, radius, W, H);
        expect(centres).toHaveLength(Math.ceil((2 * radius + 1) / 3) ** 2);
        const covered = coveredBy(centres);
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) expect(covered.has(`${(x + dx + W) % W},${(y + dy + H) % H}`)).toBe(true);
        }
      }
    });
  }

  it("only sends wrapped, non-negative coordinates (proto x/y are uint32)", () => {
    for (const centre of [...blockCentres(0, 0, 6, W, H), ...blockCentres(639, 319, 6, W, H)]) {
      expect(centre.x).toBeGreaterThanOrEqual(0);
      expect(centre.x).toBeLessThan(W);
      expect(centre.y).toBeGreaterThanOrEqual(0);
      expect(centre.y).toBeLessThan(H);
    }
    expect(blockCentres(0, 0, 1, W, H)).toEqual([{ x: 0, y: 0 }]);
    expect(blockCentres(0, 0, 2, W, H)[0]).toEqual({ x: 639, y: 319 });
  });
});

describe("isInSquare", () => {
  it("measures distance around the torus", () => {
    expect(isInSquare({ x: 638, y: 5 }, 1, 5, 3, W, H)).toBe(true);
    expect(isInSquare({ x: 637, y: 5 }, 1, 5, 3, W, H)).toBe(false);
    expect(isInSquare({ x: 5, y: 318 }, 5, 1, 3, W, H)).toBe(true);
  });
});

describe("tile description and visibility", () => {
  const beacon = JSON.stringify({ type: "RELAY_BEACON", status: "active", ownerId: "p1" });
  const full: WireTile = { x: 1, y: 2, terrain: "LAND", ownerId: "p2", resource: "FARM", economicStructureJson: beacon, fortJson: "{bad" };

  it("parses every *Json field under its plain name and keeps unparsable JSON as text", () => {
    expect(describeTile(full)).toEqual({ x: 1, y: 2, terrain: "LAND", ownerId: "p2", resource: "FARM", economicStructure: JSON.parse(beacon), fort: "{bad" });
  });

  it("distinguishes not returned, unknown (failed block), stripped or altered, and fully visible", () => {
    expect(classifyVisibility(full, undefined)).toEqual({ visibility: "none", hiddenFields: [] });
    expect(classifyVisibility(full, undefined, true)).toEqual({ visibility: "unknown", hiddenFields: [] });
    expect(classifyVisibility(full, { x: 1, y: 2, terrain: "LAND", ownerId: "p2" })).toEqual({ visibility: "redacted", hiddenFields: ["resource", "economicStructure", "fort"] });
    // Same keys, different value (e.g. a district overlay whose anchor is hidden from the player).
    const altered = { ...full, economicStructureJson: JSON.stringify({ type: "RELAY_BEACON", status: "active", ownerId: "p1", supportAnchor: { x: 9, y: 9 } }) };
    expect(classifyVisibility(altered, full)).toEqual({ visibility: "redacted", hiddenFields: ["economicStructure"] });
    expect(classifyVisibility(full, { ...full })).toEqual({ visibility: "full", hiddenFields: [] });
  });

  it("picks grid characters by structure precedence, then terrain", () => {
    expect(tileGridChar({ x: 0, y: 0, terrain: "LAND", economicStructureJson: beacon })).toBe("B");
    expect(tileGridChar({ x: 0, y: 0, terrain: "LAND", economicStructureJson: '{"type":"FARMSTEAD"}' })).toBe("E");
    expect(tileGridChar({ x: 0, y: 0, terrain: "LAND", townType: "MARKET", fortJson: "{}" })).toBe("T");
    expect(tileGridChar({ x: 0, y: 0, terrain: "MOUNTAIN", watchtowerJson: "{}" })).toBe("*");
    expect(["SEA", "COASTAL_SEA", "MOUNTAIN", "LAND"].map((terrain) => tileGridChar({ x: 0, y: 0, terrain: terrain as WireTile["terrain"] }))).toEqual(["~", "c", "^", "."]);
    expect(tileGridChar({ x: 0, y: 0 })).toBe("x");
  });

  it("renders rows north to south with wrapped y labels and ? for missing tiles", () => {
    expect(renderGrid(0, 0, 1, W, H, (wx, wy) => (wx === 0 && wy === 0 ? "B" : wx === 639 ? undefined : "."))).toEqual(["319 ?..", "  0 ?B.", "  1 ?.."]);
  });
});
