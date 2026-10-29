import { describe, expect, it } from "vitest";
import {
  AETHER_TOWER_SHOT_HISTORY_CAP,
  AETHER_TOWER_SHOT_REFILL_MS,
  aetherTowerMaxShots,
  aetherTowerNextRefillAt,
  aetherTowerNextShotAt,
  aetherTowerShotsRemaining,
  spendAetherTowerShot
} from "./aether-tower-shots.js";

const DAY = AETHER_TOWER_SHOT_REFILL_MS;

describe("aether tower shots", () => {
  it("holds 3 shots, doubled to 6 by a x2 shots effect", () => {
    expect(aetherTowerMaxShots(1)).toBe(3);
    expect(aetherTowerMaxShots(2)).toBe(6);
  });

  it("allows three shots, then waits until the first one refills 24h after it fired", () => {
    let tower: { shotsUsedAt?: number[]; cooldownUntil?: number | undefined } = {};
    for (const at of [1_000, 2_000]) {
      tower = spendAetherTowerShot(tower, 3, at);
      expect(tower.cooldownUntil).toBeUndefined();
    }
    tower = spendAetherTowerShot(tower, 3, 3_000);
    expect(aetherTowerShotsRemaining(tower, 3, 3_000)).toBe(0);
    expect(tower.cooldownUntil).toBe(1_000 + DAY);
    expect(aetherTowerNextShotAt(tower, 3, 3_000)).toBe(1_000 + DAY);
    expect(aetherTowerShotsRemaining(tower, 3, 1_000 + DAY - 1)).toBe(0);
    expect(aetherTowerShotsRemaining(tower, 3, 1_000 + DAY)).toBe(1);
    expect(aetherTowerShotsRemaining(tower, 3, 3_000 + DAY)).toBe(3);
    expect(aetherTowerNextRefillAt(tower, 3_000 + DAY)).toBeUndefined();
  });

  it("drops refilled shots from the stored history", () => {
    const tower = spendAetherTowerShot({ shotsUsedAt: [0, 10] }, 3, DAY + 5);
    expect(tower.shotsUsedAt).toEqual([10, DAY + 5]);
  });

  it("reads remaining shots against the owner's current capacity", () => {
    const tower = { shotsUsedAt: [1, 2, 3, 4] };
    expect(aetherTowerShotsRemaining(tower, 6, 10)).toBe(2);
    expect(aetherTowerShotsRemaining(tower, 3, 10)).toBe(0);
    // Losing the x2 effect with 4 spent: two of them must refill first.
    expect(aetherTowerNextShotAt(tower, 3, 10)).toBe(2 + DAY);
  });

  it("bounds the stored history", () => {
    let tower: { shotsUsedAt?: number[] } = {};
    for (let at = 1; at <= AETHER_TOWER_SHOT_HISTORY_CAP + 5; at += 1) tower = spendAetherTowerShot(tower, 100, at);
    expect(tower.shotsUsedAt).toHaveLength(AETHER_TOWER_SHOT_HISTORY_CAP);
  });
});
