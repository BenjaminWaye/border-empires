import { describe, expect, it } from "vitest";
import {
  hostileObservatoryProtectingTileAt,
  observatoryBackedAbilityCooldownRemainingMs,
  ownedObservatoryCastStateForTarget,
  observatoryProtectionActive,
  readyOwnedObservatoryCooldownRemainingMs
} from "./client-observatory-cooldown.js";
import type { Tile } from "./client-types.js";

const baseTile = (x: number, y: number): Tile => ({ x, y, terrain: "LAND" });

describe("client observatory cooldown helpers", () => {
  it("drops protection while an observatory cooldown is active", () => {
    expect(observatoryProtectionActive({ cooldownUntil: 200 }, 100)).toBe(false);
    expect(observatoryProtectionActive({ cooldownUntil: 200 }, 200)).toBe(true);
  });

  it("ignores cooling hostile observatories when checking protection", () => {
    const target = { ...baseTile(20, 20), ownerId: "enemy" } as Tile;
    const blocked = hostileObservatoryProtectingTileAt(
      [
        {
          ...baseTile(22, 22),
          ownerId: "enemy",
          observatory: { ownerId: "enemy", status: "active", cooldownUntil: 400 }
        } as Tile
      ],
      "me",
      [],
      target,
      100
    );

    expect(blocked).toBeUndefined();
  });

  it("returns the shortest remaining cooldown among owned observatories in range", () => {
    const target = baseTile(30, 30);
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
        100
      )
    ).toBe(150);
  });

  it("reports when no owned observatory is in cast range", () => {
    expect(
      ownedObservatoryCastStateForTarget(
        [
          {
            ...baseTile(80, 80),
            ownerId: "me",
            observatory: { ownerId: "me", status: "active", cooldownUntil: 250 }
          } as Tile
        ],
        "me",
        baseTile(10, 10),
        100
      )
    ).toEqual({ hasInRange: false, cooldownRemainingMs: 0 });
  });

  it("falls back to the synced ability cooldown when observatory tile cooldown data is missing", () => {
    expect(
      observatoryBackedAbilityCooldownRemainingMs(
        { hasInRange: true, cooldownRemainingMs: 0 },
        900,
        100
      )
    ).toBe(800);
  });
});
