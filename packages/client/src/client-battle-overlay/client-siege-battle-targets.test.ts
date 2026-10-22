import { describe, expect, it } from "vitest";
import { battleIsSiegeBoosted, siegeTowerBattleTargetFor } from "./client-siege-battle-targets.js";
import type { ActiveBattleOverlay } from "./client-battle-overlay.js";
import type { Tile } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const towerTile = (x: number, y: number, ownerId: string, status: "active" | "under_construction" = "active"): Tile => ({
  x,
  y,
  terrain: "LAND",
  ownerId,
  ownershipState: "SETTLED",
  siegeBattery: { ownerId, status, variant: "SIEGE_TOWER" }
});

const battleAt = (targetX: number, targetY: number, attackerOwnerId: string, startAt: number): ActiveBattleOverlay =>
  ({ originX: targetX - 1, originY: targetY, targetX, targetY, attackerOwnerId, defenderOwnerId: "defender", attackerWon: true, startAt, clashAt: startAt, endAt: startAt + 5000, fromSkirmish: false }) as ActiveBattleOverlay;

const stateWith = (tiles: Tile[], battles: ActiveBattleOverlay[]) => ({
  tiles: new Map(tiles.map((tile) => [keyFor(tile.x, tile.y), tile])),
  activeBattles: new Map(battles.map((battle) => [keyFor(battle.targetX, battle.targetY), battle]))
});

describe("siegeTowerBattleTargetFor", () => {
  it("aims at the latest battle its owner is attacking within siege range", () => {
    const state = stateWith([towerTile(10, 10, "me")], [battleAt(12, 10, "me", 100), battleAt(10, 13, "me", 200)]);
    expect(siegeTowerBattleTargetFor(state, keyFor, 10, 10)).toEqual({ x: 10, y: 13 });
  });

  it("ignores battles fought by someone else, even the most recent one", () => {
    const state = stateWith([towerTile(10, 10, "ai-1")], [battleAt(12, 10, "me", 100)]);
    expect(siegeTowerBattleTargetFor(state, keyFor, 10, 10)).toBeUndefined();
  });

  it("ignores battles out of siege range", () => {
    const state = stateWith([towerTile(10, 10, "me")], [battleAt(16, 10, "me", 100)]);
    expect(siegeTowerBattleTargetFor(state, keyFor, 10, 10)).toBeUndefined();
  });

  it("stays idle while the tower is still being built", () => {
    const state = stateWith([towerTile(10, 10, "me", "under_construction")], [battleAt(12, 10, "me", 100)]);
    expect(siegeTowerBattleTargetFor(state, keyFor, 10, 10)).toBeUndefined();
  });
});

describe("battleIsSiegeBoosted", () => {
  it("is true only when the attacker has an active siege structure in range", () => {
    const state = stateWith([towerTile(10, 10, "me")], []);
    expect(battleIsSiegeBoosted(state, keyFor, "me", 14, 10)).toBe(true);
    expect(battleIsSiegeBoosted(state, keyFor, "ai-1", 14, 10)).toBe(false);
    expect(battleIsSiegeBoosted(state, keyFor, "me", 16, 10)).toBe(false);
  });
});
