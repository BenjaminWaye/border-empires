import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { OBSERVATORY_PROTECTION_RADIUS } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import { collectShieldingTowers, isObservatoryShielding, isTileShieldedByOwnersIndexedTowers, isTileShieldedByOwnersObservatory, type ShieldingTower } from "./aether-shield.js";
import { AetherShieldBroadcaster, TowerCoverageGrid, VISIBLE_TILE_BUDGET_PER_TICK, shieldingTowersVisibleTo, tileIndexFromKey, type AetherShieldsPayload } from "./aether-shield-broadcast.js";

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
    // The index-driven variant agrees.
    const indexed = (owner: string, x: number): boolean => isTileShieldedByOwnersIndexedTowers(tiles, [key(0, 10)], shielding, owner, x, 10);
    expect([indexed("a", WORLD_WIDTH - r), indexed("a", r + 1), indexed("b", 3), indexed("a", 4)]).toEqual([true, false, false, false]);
  });
});

describe("collectShieldingTowers", () => {
  it("reads the active-Observatory index and drops towers on cooldown or unpowered", () => {
    const tiles = tileMap([tower(1, 1, "a"), tower(2, 2, "a", { cooldownUntil: NOW + 1 }), tower(3, 3, "b")]);
    const index = new Map([["a", new Set([key(1, 1), key(2, 2)])], ["b", new Set([key(3, 3)])]]);
    expect(collectShieldingTowers(index, tiles, NOW, (owner) => owner === "b")).toEqual([{ x: 1, y: 1, ownerId: "a" }]);
  });
});

describe("AETHER_SHIELDS broadcast", () => {
  const enemyTower: ShieldingTower = { x: 10, y: 10, ownerId: "enemy" };
  const tiles = tileMap([tower(10, 10, "enemy"), land(12, 10, "enemy"), land(14, 10, "third"), land(40, 40, "viewer")]);
  const sees = (visible: string[]) => (_viewer: string, visit: (tileKey: string) => void): void => visible.forEach(visit);

  it("sends a tower only to viewers who can see land it shields, never their own", () => {
    const grid = new TowerCoverageGrid();
    grid.rebuild([enemyTower]);
    const visibleTo = (viewer: string, visible: string[], fullVision = false): ShieldingTower[] =>
      shieldingTowersVisibleTo(viewer, grid, tiles, sees(visible), fullVision).towers;
    // The tower tile itself hidden in fog, its land in view: still sent.
    expect(visibleTo("viewer", [key(12, 10)])).toEqual([enemyTower]);
    // Someone else's land inside the square doesn't count -- the tower doesn't shield it.
    expect(visibleTo("viewer", [key(14, 10)])).toEqual([]);
    expect(visibleTo("viewer", [key(40, 40)])).toEqual([]);
    expect(visibleTo("viewer", [], true)).toEqual([enemyTower]);
    expect(visibleTo("enemy", [key(12, 10)], true)).toEqual([]);
    expect(shieldingTowersVisibleTo("viewer", grid, tiles, sees([key(12, 10), key(40, 40)]), false).visitedTiles).toBe(2);
  });

  it("coverage grid wraps across the world seams and clears old stamps on rebuild", () => {
    const grid = new TowerCoverageGrid();
    const r = OBSERVATORY_PROTECTION_RADIUS;
    const seam: ShieldingTower = { x: 0, y: 0, ownerId: "a" };
    grid.rebuild([seam]);
    const covering = (x: number, y: number): ShieldingTower[] => {
      const out: ShieldingTower[] = [];
      grid.forEachCovering(tileIndexFromKey(key(x, y)), (t) => out.push(t));
      return out;
    };
    expect(covering(WORLD_WIDTH - r, 0)).toEqual([seam]);
    expect(covering(WORLD_WIDTH - r - 1, 0)).toEqual([]);
    const moved: ShieldingTower = { x: 100, y: 100, ownerId: "a" };
    grid.rebuild([moved]);
    expect(covering(0, 0)).toEqual([]);
    expect(covering(100 + r, 100 - r)).toEqual([moved]);
  });

  it("parses tile keys to world indices, rejecting malformed or out-of-world ones", () => {
    expect(tileIndexFromKey("12,3")).toBe(3 * WORLD_WIDTH + 12);
    expect(tileIndexFromKey("0,0")).toBe(0);
    for (const bad of ["", ",", "1,", ",1", "a,1", "1,b", "-1,2", `${WORLD_WIDTH},0`, `0,${WORLD_HEIGHT}`]) expect(tileIndexFromKey(bad)).toBe(-1);
  });

  it("only sends when a player's list changes, pushes on demand for a fresh subscribe, and forgets offline players", () => {
    const sent: Array<{ playerId: string; payload: AetherShieldsPayload }> = [];
    let online = ["viewer"];
    let towers: ShieldingTower[] = [enemyTower];
    const broadcaster = new AetherShieldBroadcaster({
      tiles,
      viewerIds: () => online,
      shieldingTowers: () => [...towers],
      forEachVisibleKey: sees([key(12, 10)]),
      hasFullVision: () => false,
      emitPlayerMessage: (command, payload) => sent.push({ playerId: command.playerId, payload })
    });
    expect(broadcaster.tick()).toBe(1);
    expect(sent[0]).toEqual({ playerId: "viewer", payload: { type: "AETHER_SHIELDS", towers: [enemyTower] } });
    expect(broadcaster.tick()).toBe(0); // unchanged stays silent: no periodic refresh
    broadcaster.sendTo("viewer"); // a fresh live subscribe gets it anyway
    expect(sent).toHaveLength(2);
    towers = []; // tower went on cooldown
    expect(broadcaster.tick()).toBe(1);
    expect(sent[2]?.payload.towers).toEqual([]);
    online = [];
    broadcaster.tick();
    expect(broadcaster.size()).toBe(0);
  });

  it("caps the visible tiles walked per tick, carrying the rest of the viewers round-robin to the next tick", () => {
    const viewers = ["a", "b", "c"];
    const walked: string[] = [];
    const bigVision = Array.from({ length: VISIBLE_TILE_BUDGET_PER_TICK }, (_, i) => `${i % 600},${Math.floor(i / 600)}`);
    const broadcaster = new AetherShieldBroadcaster({
      tiles,
      viewerIds: () => viewers,
      shieldingTowers: () => [enemyTower],
      forEachVisibleKey: (viewer, visit) => {
        walked.push(viewer);
        bigVision.forEach(visit);
      },
      hasFullVision: () => false,
      emitPlayerMessage: () => {}
    });
    broadcaster.tick();
    expect(walked).toEqual(["a"]);
    broadcaster.tick();
    broadcaster.tick();
    broadcaster.tick();
    expect(walked).toEqual(["a", "b", "c", "a"]);
  });
});
