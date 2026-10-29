import { describe, expect, it } from "vitest";
import { AETHER_TOWER_SHOT_REFILL_MS } from "@border-empires/shared";
import {
  observatoryProtectionActive,
  ownTowerReadyInMs,
  ownTowerShotReadyInMs,
  readyOwnedObservatoryCooldownRemainingMs
} from "./client-observatory-cooldown.js";
import type { Tile } from "../client-types.js";

const baseTile = (x: number, y: number): Tile => ({ x, y, terrain: "LAND" });

describe("client observatory cooldown helpers", () => {
  it("drops protection while an observatory cooldown is active", () => {
    expect(observatoryProtectionActive({ cooldownUntil: 200 }, 100)).toBe(false);
    expect(observatoryProtectionActive({ cooldownUntil: 200 }, 200)).toBe(true);
  });

  it("returns the shortest remaining cooldown among owned observatories in range", () => {
    const target = baseTile(30, 30);
    // Base range 20: tiles at distance 1 and 2 are both in range.
    expect(
      readyOwnedObservatoryCooldownRemainingMs(
        [
          {
            ...baseTile(31, 31),
            ownerId: "me",
            observatory: { ownerId: "me", status: "active", cooldownUntil: 500 }
          } as Tile,
          {
            ...baseTile(32, 32),
            ownerId: "me",
            observatory: { ownerId: "me", status: "active", cooldownUntil: 250 }
          } as Tile
        ],
        "me",
        target,
        100,
        20
      )
    ).toBe(150);
  });

  it("returns 0 when no owned observatory is within the given cast radius", () => {
    const target = baseTile(30, 30);
    // Observatory at distance 5 is outside a radius-3 cast window.
    expect(
      readyOwnedObservatoryCooldownRemainingMs(
        [
          {
            ...baseTile(35, 35),
            ownerId: "me",
            observatory: { ownerId: "me", status: "active", cooldownUntil: 500 }
          } as Tile
        ],
        "me",
        target,
        100,
        3
      )
    ).toBe(0);
  });

  it("reads own-tower readiness from its shots, doubled by Resonance Governor", () => {
    const tower = { ...baseTile(31, 31), ownerId: "me", observatory: { ownerId: "me", status: "active", shotsUsedAt: [100, 200, 300] } } as Tile;
    const state = (domainIds: string[]) => ({ me: "me", tiles: new Map([["31,31", tower]]), techIds: [], techCatalog: [], domainIds, domainCatalog: [] });
    expect(ownTowerReadyInMs(state([]), baseTile(30, 30), 1_000)).toBe(100 + AETHER_TOWER_SHOT_REFILL_MS - 1_000);
    expect(ownTowerShotReadyInMs(state([]), tower, 1_000)).toBe(100 + AETHER_TOWER_SHOT_REFILL_MS - 1_000);
    expect(ownTowerReadyInMs(state(["afc-oracle-2"]), baseTile(30, 30), 1_000)).toBe(0);
    expect(ownTowerShotReadyInMs(state([]), tower, 100 + AETHER_TOWER_SHOT_REFILL_MS)).toBe(0);
  });
});
