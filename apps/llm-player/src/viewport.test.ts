import { describe, expect, it } from "vitest";
import type { GameInitState, GameTile } from "./game-socket.js";
import { buildTileIndex, buildViewportFrontier } from "./viewport.js";

const PLAYER = "me";
const RIVAL = "rival";

const stateWithTiles = (tiles: GameTile[]): GameInitState => ({
  playerId: PLAYER,
  playerName: "",
  gold: 0,
  manpower: 0,
  manpowerCap: 0,
  manpowerRegenPerMinute: 0,
  tiles,
  eventLog: []
});

// Mirrors apps/simulation/src/runtime-frontier-command.ts's actual EXPAND
// validation: isInReach(me, target) || isEnemyBorderContact. A tile with no
// reachOwnerId at all satisfies neither and must be excluded -- offering it
// as a frontier target would get rejected server-side as OUT_OF_REACH.
describe("buildViewportFrontier reach gating", () => {
  it("excludes a neutral tile with no reachOwnerId at all", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER, reachOwnerId: PLAYER },
      { x: 1, y: 0 } // no ownerId, no reachOwnerId
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const frontier = buildViewportFrontier(index, { x: 0, y: 0 }, PLAYER);
    expect(frontier.find((tile) => tile.x === 1 && tile.y === 0)).toBeUndefined();
  });

  it("includes a neutral tile within my own reach", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER, reachOwnerId: PLAYER },
      { x: 1, y: 0, reachOwnerId: PLAYER }
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const frontier = buildViewportFrontier(index, { x: 0, y: 0 }, PLAYER);
    expect(frontier.find((tile) => tile.x === 1 && tile.y === 0)).toBeDefined();
  });

  it("includes a neutral tile inside a rival's reach when the origin is inside my own (border contact)", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER, reachOwnerId: PLAYER },
      { x: 1, y: 0, reachOwnerId: RIVAL }
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const frontier = buildViewportFrontier(index, { x: 0, y: 0 }, PLAYER);
    expect(frontier.find((tile) => tile.x === 1 && tile.y === 0)).toBeDefined();
  });

  it("excludes a neutral tile inside a rival's reach when the origin is NOT inside my own reach", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER }, // owned, but no reach of my own here
      { x: 1, y: 0, reachOwnerId: RIVAL }
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const frontier = buildViewportFrontier(index, { x: 0, y: 0 }, PLAYER);
    expect(frontier.find((tile) => tile.x === 1 && tile.y === 0)).toBeUndefined();
  });

  it("never reach-gates an enemy-owned tile (ATTACK is not reach-gated)", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER, reachOwnerId: PLAYER },
      { x: 1, y: 0, ownerId: RIVAL } // no reachOwnerId at all
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const frontier = buildViewportFrontier(index, { x: 0, y: 0 }, PLAYER);
    expect(frontier.find((tile) => tile.x === 1 && tile.y === 0)?.ownerId).toBe(RIVAL);
  });
});
