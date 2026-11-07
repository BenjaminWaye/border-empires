import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HILLS_DEFENSE_MULT, RIVER_CROSSING_ATTACK_MULT, WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { isHillsTileAt } from "../hills-terrain/hills-terrain.js";
import { wrapX, wrapY } from "../math/math.js";
import { riverEdgeKey } from "../worldgen/worldgen-rivers-edge.js";
import { riverEdgeKeysForCurrentSeed } from "../worldgen/worldgen-rivers.js";
import { CURRENT_WORLDGEN_VERSION } from "../worldgen/worldgen-version.js";
import { getWorldSeed, setWorldSeed, worldStyle } from "../worldgen/worldgen.js";
import { attackCrossesRiver, hillsDefenseModifiersAt, terrainCombatModifiers } from "./terrain-combat.js";

const SEED = 4242;

// Decodes a riverEdgeKey back into the two tiles it separates.
const tilesOfEdge = (key: number): [{ x: number; y: number }, { x: number; y: number }] => {
  const vertical = key % 2 === 1;
  const corner = Math.floor(key / 2);
  const x = corner % WORLD_WIDTH;
  const y = Math.floor(corner / WORLD_WIDTH);
  return vertical
    ? [{ x: wrapX(x - 1, WORLD_WIDTH), y }, { x, y }]
    : [{ x, y: wrapY(y - 1, WORLD_HEIGHT) }, { x, y }];
};

describe("terrain combat", () => {
  let previous: { seed: number; style: ReturnType<typeof worldStyle> };
  beforeAll(() => {
    previous = { seed: getWorldSeed(), style: worldStyle() };
    setWorldSeed(SEED, "continents", CURRENT_WORLDGEN_VERSION);
  });
  afterAll(() => setWorldSeed(previous.seed, previous.style));

  it("counts an orthogonal attack across a river edge, in both directions", () => {
    const rivers = riverEdgeKeysForCurrentSeed();
    expect(rivers.size).toBeGreaterThan(0);
    for (const key of [...rivers].slice(0, 50)) {
      const [a, b] = tilesOfEdge(key);
      expect(attackCrossesRiver(a, b)).toBe(true);
      expect(attackCrossesRiver(b, a)).toBe(true);
      expect(terrainCombatModifiers(a, b).riverCrossingAttackMult).toBe(RIVER_CROSSING_ATTACK_MULT);
    }
  });

  it("does not count an orthogonal attack along a river (parallel to it)", () => {
    const rivers = riverEdgeKeysForCurrentSeed();
    let checked = 0;
    for (const key of rivers) {
      const [a, b] = tilesOfEdge(key);
      // Step sideways along the river edge: both tiles stay on the same side.
      const along = key % 2 === 1 ? { x: b.x, y: wrapY(b.y + 1, WORLD_HEIGHT) } : { x: wrapX(b.x + 1, WORLD_WIDTH), y: b.y };
      const sharedKey = key % 2 === 1 ? riverEdgeKey(b.x, b.y + 1, "H") : riverEdgeKey(b.x + 1, b.y, "V");
      if (rivers.has(sharedKey)) continue; // river turns here; the step genuinely crosses it
      expect(attackCrossesRiver(b, along)).toBe(false);
      void a;
      checked += 1;
      if (checked >= 20) break;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("counts a diagonal attack only when both routes around the corner cross a river", () => {
    const rivers = riverEdgeKeysForCurrentSeed();
    let sawCrossing = false;
    let sawTouchOnly = false;
    for (let y = 0; y < WORLD_HEIGHT && !(sawCrossing && sawTouchOnly); y += 1) {
      for (let x = 0; x < WORLD_WIDTH; x += 1) {
        // Diagonal (x, y) -> (x + 1, y + 1) around corner (x + 1, y + 1).
        const routeA = rivers.has(riverEdgeKey(x + 1, y, "V")) || rivers.has(riverEdgeKey(x + 1, y + 1, "H"));
        const routeB = rivers.has(riverEdgeKey(x, y + 1, "H")) || rivers.has(riverEdgeKey(x + 1, y + 1, "V"));
        if (!routeA && !routeB) continue;
        const crosses = attackCrossesRiver({ x, y }, { x: x + 1, y: y + 1 });
        expect(crosses).toBe(routeA && routeB);
        expect(attackCrossesRiver({ x: x + 1, y: y + 1 }, { x, y })).toBe(crosses);
        if (crosses) sawCrossing = true;
        else sawTouchOnly = true;
      }
    }
    expect(sawCrossing).toBe(true);
    expect(sawTouchOnly).toBe(true);
  });

  it("never counts non-adjacent pairs (dock crossings) or the same tile", () => {
    const [a] = tilesOfEdge([...riverEdgeKeysForCurrentSeed()][0]!);
    expect(attackCrossesRiver(a, a)).toBe(false);
    expect(attackCrossesRiver(a, { x: a.x + 5, y: a.y })).toBe(false);
  });

  it("gives the hills defense term exactly on hills tiles", () => {
    let hills = 0;
    let flat = 0;
    for (let x = 0; x < WORLD_WIDTH && (hills < 5 || flat < 5); x += 1) {
      const y = 40;
      const onHills = isHillsTileAt(x, y);
      expect(hillsDefenseModifiersAt(x, y).hillsDefenseMult).toBe(onHills ? HILLS_DEFENSE_MULT : undefined);
      expect(terrainCombatModifiers({ x: x - 1, y }, { x, y }).hillsDefenseMult).toBe(onHills ? HILLS_DEFENSE_MULT : undefined);
      if (onHills) hills += 1;
      else flat += 1;
    }
    expect(flat).toBeGreaterThan(0);
  });
});
