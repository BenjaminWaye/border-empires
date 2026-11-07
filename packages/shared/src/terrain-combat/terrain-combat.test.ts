import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HILLS_DEFENSE_MULT, RIVER_CROSSING_ATTACK_MULT, WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { isHillsTileAt } from "../hills-terrain/hills-terrain.js";
import { wrapX, wrapY } from "../math/math.js";
import { riverEdgeKey } from "../worldgen/worldgen-rivers-edge.js";
import { riverEdgeKeysForCurrentSeed } from "../worldgen/worldgen-rivers.js";
import { CURRENT_WORLDGEN_VERSION } from "../worldgen/worldgen-version.js";
import { getWorldSeed, setWorldSeed, terrainAt, worldStyle } from "../worldgen/worldgen.js";
import { worldgenVersion } from "../worldgen/worldgen-version.js";
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
  let previous: { seed: number; style: ReturnType<typeof worldStyle>; version: number };
  beforeAll(() => {
    previous = { seed: getWorldSeed(), style: worldStyle(), version: worldgenVersion() };
    setWorldSeed(SEED, "continents", CURRENT_WORLDGEN_VERSION);
  });
  afterAll(() => setWorldSeed(previous.seed, previous.style, previous.version));

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

  it("counts a diagonal attack only when there is no dry way round the corner", () => {
    // Independent oracle: decode every river edge into the tile pair it
    // separates (tilesOfEdge), then judge each diagonal by tile pairs alone.
    const pairKey = (a: { x: number; y: number }, b: { x: number; y: number }): string =>
      [`${a.x},${a.y}`, `${b.x},${b.y}`].sort().join("|");
    const riverPairs = new Set([...riverEdgeKeysForCurrentSeed()].map((key) => pairKey(...tilesOfEdge(key))));
    const separated = (a: { x: number; y: number }, b: { x: number; y: number }): boolean => riverPairs.has(pairKey(a, b));
    const at = (x: number, y: number) => ({ x: wrapX(x, WORLD_WIDTH), y: wrapY(y, WORLD_HEIGHT) });
    let crossings = 0;
    let dryWayRound = 0;
    let blockedWayRound = 0;
    // Every corner a river edge touches (a diagonal around any other corner
    // can't cross a river, checked separately below).
    const corners = new Map<string, { x: number; y: number }>();
    for (const key of riverEdgeKeysForCurrentSeed()) {
      const corner = Math.floor(key / 2);
      const cx = corner % WORLD_WIDTH;
      const cy = Math.floor(corner / WORLD_WIDTH);
      const end = key % 2 === 1 ? at(cx, cy + 1) : at(cx + 1, cy);
      for (const c of [at(cx, cy), end]) corners.set(`${c.x},${c.y}`, c);
    }
    for (const { x: cx, y: cy } of corners.values()) {
      // Both diagonals around corner (cx, cy): SE from (cx-1, cy-1), SW from (cx, cy-1).
      for (const [from, to] of [[at(cx - 1, cy - 1), at(cx, cy)], [at(cx, cy - 1), at(cx - 1, cy)]] as const) {
        const viaA = at(to.x, from.y);
        const viaB = at(from.x, to.y);
        const routeA = separated(from, viaA) || separated(viaA, to);
        const routeB = separated(from, viaB) || separated(viaB, to);
        const dryA = !routeA && terrainAt(viaA.x, viaA.y) === "LAND";
        const dryB = !routeB && terrainAt(viaB.x, viaB.y) === "LAND";
        const expected = (routeA || routeB) && !dryA && !dryB;
        expect(attackCrossesRiver(from, to)).toBe(expected);
        expect(attackCrossesRiver(to, from)).toBe(expected);
        if (expected) crossings += 1;
        else dryWayRound += 1;
        if (expected && (!routeA || !routeB)) blockedWayRound += 1;
      }
    }
    // A corner no river touches never yields a crossing.
    for (let x = 0; x < WORLD_WIDTH; x += 7) {
      const c = at(x, 17);
      if (corners.has(`${c.x},${c.y}`)) continue;
      expect(attackCrossesRiver(at(x - 1, 16), c)).toBe(false);
    }
    expect(crossings).toBeGreaterThan(0);
    expect(dryWayRound).toBeGreaterThan(0);
    // River mouths/headwaters: one route is sea/mountain, still a crossing.
    expect(blockedWayRound).toBeGreaterThan(0);
  });

  it("handles crossings across the world's wrap seam", () => {
    const rivers = riverEdgeKeysForCurrentSeed();
    const verticalAtSeam = [...rivers].find((key) => key % 2 === 1 && Math.floor(key / 2) % WORLD_WIDTH === 0);
    if (verticalAtSeam === undefined) return; // this seed has no river on the seam
    const [left, right] = tilesOfEdge(verticalAtSeam);
    expect(left.x).toBe(WORLD_WIDTH - 1);
    expect(attackCrossesRiver(left, { x: right.x + WORLD_WIDTH, y: right.y })).toBe(true);
  });

  it("never counts non-adjacent pairs (dock crossings) or the same tile", () => {
    const [a] = tilesOfEdge([...riverEdgeKeysForCurrentSeed()][0]!);
    expect(attackCrossesRiver(a, a)).toBe(false);
    expect(attackCrossesRiver(a, { x: a.x + 5, y: a.y })).toBe(false);
  });

  it("gives the hills defense term exactly on hills tiles", () => {
    let hills = 0;
    let flat = 0;
    for (let y = 0; y < WORLD_HEIGHT && (hills < 5 || flat < 5); y += 3) {
      for (let x = 0; x < WORLD_WIDTH && (hills < 5 || flat < 5); x += 3) {
        const onHills = isHillsTileAt(x, y);
        const expected = onHills ? HILLS_DEFENSE_MULT : undefined;
        expect(hillsDefenseModifiersAt(x, y).hillsDefenseMult).toBe(expected);
        expect(terrainCombatModifiers({ x: x - 1, y }, { x, y }).hillsDefenseMult).toBe(expected);
        if (onHills) hills += 1;
        else flat += 1;
      }
    }
    expect(hills).toBeGreaterThan(0);
    expect(flat).toBeGreaterThan(0);
  });
});
