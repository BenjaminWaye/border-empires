import { describe, expect, it } from "vitest";
import { isDiagonalStep, scoutExpandScore, type PlannerTile } from "./frontier-scoring.js";

const tile = (x: number, y: number, extra: Partial<PlannerTile> = {}): PlannerTile => ({
  x,
  y,
  terrain: "LAND",
  ...extra
});

describe("isDiagonalStep", () => {
  it("is true when both x and y change", () => {
    expect(isDiagonalStep(tile(10, 10), tile(11, 11))).toBe(true);
    expect(isDiagonalStep(tile(10, 10), tile(9, 11))).toBe(true);
  });

  it("is false for a purely orthogonal step", () => {
    expect(isDiagonalStep(tile(10, 10), tile(11, 10))).toBe(false);
    expect(isDiagonalStep(tile(10, 10), tile(10, 11))).toBe(false);
  });
});

describe("scoutExpandScore diagonal fog-efficiency bonus", () => {
  // Mirrored layouts: an orthogonal target (11,10) and a diagonal target
  // (11,11) from the same origin (10,10), each surrounded by an identical
  // ring of genuinely novel unclaimed LAND tiles beyond them, so the only
  // difference between the two candidates is the direction of the step.
  const origin = tile(10, 10, { ownerId: "ai-1" });

  const buildTiles = (targetKey: string, novelNeighborKeys: string[]): Map<string, PlannerTile> => {
    const tiles = new Map<string, PlannerTile>();
    tiles.set("10,10", origin);
    const [tx, ty] = targetKey.split(",").map(Number);
    tiles.set(targetKey, tile(tx!, ty!));
    for (const key of novelNeighborKeys) {
      const [nx, ny] = key.split(",").map(Number);
      tiles.set(key, tile(nx!, ny!));
    }
    return tiles;
  };

  it("does not bias toward diagonal steps by default (preferFogEfficientExpansion off)", () => {
    const orthogonalTiles = buildTiles("11,10", ["12,10", "12,9", "12,11"]);
    const diagonalTiles = buildTiles("11,11", ["12,12", "12,11", "11,12"]);

    const orthogonalScore = scoutExpandScore(
      orthogonalTiles,
      origin,
      orthogonalTiles.get("11,10")!,
      "ai-1",
      new Set()
    );
    const diagonalScore = scoutExpandScore(
      diagonalTiles,
      origin,
      diagonalTiles.get("11,11")!,
      "ai-1",
      new Set()
    );

    // Both candidates have one owned neighbor (the origin) and three novel
    // neighbor tiles — symmetric setups should score identically without
    // the opt-in flag (legacy/barbarian-safe behavior).
    expect(diagonalScore).toBe(orthogonalScore);
  });

  it("biases toward diagonal steps when preferFogEfficientExpansion is enabled", () => {
    const orthogonalTiles = buildTiles("11,10", ["12,10", "12,9", "12,11"]);
    const diagonalTiles = buildTiles("11,11", ["12,12", "12,11", "11,12"]);

    const orthogonalScore = scoutExpandScore(
      orthogonalTiles,
      origin,
      orthogonalTiles.get("11,10")!,
      "ai-1",
      new Set(),
      undefined,
      true
    );
    const diagonalScore = scoutExpandScore(
      diagonalTiles,
      origin,
      diagonalTiles.get("11,11")!,
      "ai-1",
      new Set(),
      undefined,
      true
    );

    expect(diagonalScore).toBeGreaterThan(orthogonalScore);
  });

  it("never adds the diagonal bonus when there is no new frontier/fog to reveal", () => {
    // Target has zero novel neighbors — nothing beyond it to reveal — so
    // even a diagonal step must not get the fog-efficiency bonus.
    const tiles = buildTiles("11,11", []);
    const score = scoutExpandScore(tiles, origin, tiles.get("11,11")!, "ai-1", new Set(), undefined, true);
    // 1 owned neighbor (origin) * -25, no other terms — no bonus applied.
    expect(score).toBe(-25);
  });
});
