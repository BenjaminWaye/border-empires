import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { OBSERVATORY_PROTECTION_RADIUS } from "@border-empires/game-domain";
import { WORLD_WIDTH } from "@border-empires/shared";

import { collectReadyTowers, isObservatoryBlockingSiphon, isObservatoryShielding, isTileShieldedByOwnersObservatory, type ShieldingTower } from "./aether-shield.js";
import { AETHER_SHIELDS_REFRESH_MS, AetherShieldBroadcaster, indexTowersByShieldedKey, shieldingTowersVisibleTo, type AetherShieldsPayload } from "./aether-shield-broadcast.js";

const NOW = 50_000;
const key = (x: number, y: number): string => `${x},${y}`;
const land = (x: number, y: number, ownerId?: string): DomainTileState =>
  ({ x, y, terrain: "LAND", ...(ownerId ? { ownerId, ownershipState: "SETTLED" } : {}) }) as DomainTileState;
const tower = (x: number, y: number, ownerId: string, observatory: Record<string, unknown> = {}): DomainTileState =>
  ({ ...land(x, y, ownerId), observatory: { ownerId, status: "active", ...observatory } }) as DomainTileState;
const tileMap = (tiles: DomainTileState[]): Map<string, DomainTileState> => new Map(tiles.map((tile) => [key(tile.x, tile.y), tile]));
const notDormant = (): boolean => false;

describe("isObservatoryShielding", () => {
  it("shields only while active, held by its owner, off cooldown and not dormant", () => {
    expect(isObservatoryShielding(tower(5, 5, "a"), NOW, notDormant)).toBe(true);
    expect(isObservatoryShielding(tower(5, 5, "a", { status: "inactive" }), NOW, notDormant)).toBe(false);
    expect(isObservatoryShielding(tower(5, 5, "a", { cooldownUntil: NOW + 1 }), NOW, notDormant)).toBe(false);
    expect(isObservatoryShielding(tower(5, 5, "a", { cooldownUntil: NOW }), NOW, notDormant)).toBe(true);
    expect(isObservatoryShielding({ ...tower(5, 5, "a"), ownerId: "captor" } as DomainTileState, NOW, notDormant)).toBe(false);
    expect(isObservatoryShielding(tower(5, 5, "a"), NOW, () => true)).toBe(false);
  });

  it("blocks Siphon whether or not it is powered -- a siphon can be what starves it", () => {
    expect(isObservatoryBlockingSiphon(tower(5, 5, "a"), NOW)).toBe(true);
    expect(isObservatoryBlockingSiphon(tower(5, 5, "a", { cooldownUntil: NOW + 1 }), NOW)).toBe(false);
    expect(isObservatoryBlockingSiphon(tower(5, 5, "a", { status: "inactive" }), NOW)).toBe(false);
  });
});

describe("isTileShieldedByOwnersObservatory", () => {
  it("covers only the owner's own land inside the protection square, across the wrap seam", () => {
    const r = OBSERVATORY_PROTECTION_RADIUS;
    const tiles = tileMap([tower(0, 10, "a"), land(WORLD_WIDTH - r, 10, "a"), land(r + 1, 10, "a"), land(3, 10, "b"), land(4, 10)]);
    const shielding = (candidate: DomainTileState): boolean => isObservatoryShielding(candidate, NOW, notDormant);
    expect(isTileShieldedByOwnersObservatory(tiles, shielding, "a", WORLD_WIDTH - r, 10)).toBe(true);
    expect(isTileShieldedByOwnersObservatory(tiles, shielding, "a", r + 1, 10)).toBe(false);
    expect(isTileShieldedByOwnersObservatory(tiles, shielding, "b", 3, 10)).toBe(false);
    expect(isTileShieldedByOwnersObservatory(tiles, shielding, "a", 4, 10)).toBe(false);
  });
});

describe("collectReadyTowers", () => {
  it("reads the active-Observatory index, drops towers on cooldown and flags unpowered ones", () => {
    const tiles = tileMap([tower(1, 1, "a"), tower(2, 2, "a", { cooldownUntil: NOW + 1 }), tower(3, 3, "b")]);
    const index = new Map([["a", new Set([key(1, 1), key(2, 2)])], ["b", new Set([key(3, 3)])]]);
    expect(collectReadyTowers(index, tiles, NOW, (owner) => owner === "b")).toEqual([{ x: 1, y: 1, ownerId: "a" }, { x: 3, y: 3, ownerId: "b", dormant: true }]);
  });
});

describe("AETHER_SHIELDS broadcast", () => {
  const enemyTower: ShieldingTower = { x: 10, y: 10, ownerId: "enemy" };
  const tiles = tileMap([tower(10, 10, "enemy"), land(12, 10, "enemy"), land(40, 40, "viewer")]);

  it("sends a tower only to viewers who can see land it shields, never their own", () => {
    const index = indexTowersByShieldedKey(tiles, [enemyTower]);
    expect([...index.keys()].sort()).toEqual([key(10, 10), key(12, 10)]);
    const sees = (visible: string[]) => (_viewer: string, visit: (tileKey: string) => void): void => visible.forEach(visit);
    // The tower tile itself hidden in fog, its land in view: still sent.
    expect(shieldingTowersVisibleTo("viewer", [enemyTower], index, sees([key(12, 10)]), false)).toEqual([enemyTower]);
    expect(shieldingTowersVisibleTo("viewer", [enemyTower], index, sees([key(40, 40)]), false)).toEqual([]);
    expect(shieldingTowersVisibleTo("viewer", [enemyTower], index, sees([]), true)).toEqual([enemyTower]);
    expect(shieldingTowersVisibleTo("enemy", [enemyTower], index, sees([key(12, 10)]), true)).toEqual([]);
  });

  it("only re-sends when a player's list changes, refreshes slowly, and forgets offline players", () => {
    const sent: Array<{ playerId: string; payload: AetherShieldsPayload }> = [];
    let online = ["viewer"];
    let towers: ShieldingTower[] = [enemyTower];
    const broadcaster = new AetherShieldBroadcaster({
      tiles,
      viewerIds: () => online,
      shieldingTowers: () => [...towers],
      forEachVisibleKey: (_viewer, visit) => visit(key(12, 10)),
      hasFullVision: () => false,
      emitPlayerMessage: (command, payload) => sent.push({ playerId: command.playerId, payload })
    });
    expect(broadcaster.tick(NOW)).toBe(1);
    expect(sent[0]).toEqual({ playerId: "viewer", payload: { type: "AETHER_SHIELDS", towers: [enemyTower] } });
    expect(broadcaster.tick(NOW + 3_000)).toBe(0);
    towers = []; // tower went on cooldown
    expect(broadcaster.tick(NOW + 6_000)).toBe(1);
    expect(sent[1]?.payload.towers).toEqual([]);
    expect(broadcaster.tick(NOW + 6_000 + AETHER_SHIELDS_REFRESH_MS)).toBe(1);
    online = [];
    broadcaster.tick(NOW + 7_000 + AETHER_SHIELDS_REFRESH_MS);
    expect(broadcaster.size()).toBe(0);
  });
});
