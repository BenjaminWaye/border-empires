import type { DomainTileState } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";
import { findShieldForDefender, shieldMatchAmount } from "./runtime-shield-flags.js";

const DEFENDER = "player-defender";
const OTHER = "player-other";

const flagTile = (x: number, y: number, mode: "HOLD" | "ADVANCE" | "MARCH", amount: number, ownerId = DEFENDER): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId,
  ownershipState: "SETTLED",
  muster: { ownerId, amount, mode, updatedAt: 0 }
});

describe("findShieldForDefender", () => {
  it("finds a HOLD-mode flag within radius 3 of the target", () => {
    const tiles = new Map([["10,12", flagTile(10, 12, "HOLD", 200)]]);
    const musterTilesByOwner = new Map([[DEFENDER, new Set(["10,12"])]]);
    const shield = findShieldForDefender(musterTilesByOwner, tiles, DEFENDER, "10,11", 10, 11);
    expect(shield).toEqual({ tileKey: "10,12", amount: 200 });
  });

  it("does not shield a target beyond radius 3", () => {
    const tiles = new Map([["10,15", flagTile(10, 15, "HOLD", 200)]]);
    const musterTilesByOwner = new Map([[DEFENDER, new Set(["10,15"])]]);
    expect(findShieldForDefender(musterTilesByOwner, tiles, DEFENDER, "10,11", 10, 11)).toBeUndefined();
  });

  it("shields the flag's own tile regardless of mode (self-shield)", () => {
    const tiles = new Map([["10,11", flagTile(10, 11, "ADVANCE", 80)]]);
    const musterTilesByOwner = new Map([[DEFENDER, new Set(["10,11"])]]);
    const shield = findShieldForDefender(musterTilesByOwner, tiles, DEFENDER, "10,11", 10, 11);
    expect(shield).toEqual({ tileKey: "10,11", amount: 80 });
  });

  it("does not treat a non-HOLD flag elsewhere in range as an area shield", () => {
    const tiles = new Map([["10,12", flagTile(10, 12, "MARCH", 200)]]);
    const musterTilesByOwner = new Map([[DEFENDER, new Set(["10,12"])]]);
    expect(findShieldForDefender(musterTilesByOwner, tiles, DEFENDER, "10,11", 10, 11)).toBeUndefined();
  });

  it("picks only the largest of two overlapping shields, never their sum", () => {
    const tiles = new Map([
      ["10,12", flagTile(10, 12, "HOLD", 100)],
      ["10,13", flagTile(10, 13, "HOLD", 120)]
    ]);
    const musterTilesByOwner = new Map([[DEFENDER, new Set(["10,12", "10,13"])]]);
    const shield = findShieldForDefender(musterTilesByOwner, tiles, DEFENDER, "10,11", 10, 11);
    expect(shield).toEqual({ tileKey: "10,13", amount: 120 });
  });

  it("ignores a flag owned by a different player, or one already empty", () => {
    const tiles = new Map([
      ["10,12", flagTile(10, 12, "HOLD", 100, OTHER)],
      ["10,13", flagTile(10, 13, "HOLD", 0)]
    ]);
    const musterTilesByOwner = new Map([[DEFENDER, new Set(["10,12", "10,13"])]]);
    expect(findShieldForDefender(musterTilesByOwner, tiles, DEFENDER, "10,11", 10, 11)).toBeUndefined();
  });
});

describe("shieldMatchAmount", () => {
  it("matches up to what the shield holds, never more", () => {
    expect(shieldMatchAmount(40, 180)).toBe(40);
  });

  it("matches up to the attacker's commitment when the shield holds more", () => {
    expect(shieldMatchAmount(500, 120)).toBe(120);
  });
});
