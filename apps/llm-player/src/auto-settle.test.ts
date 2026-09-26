import { describe, expect, it } from "vitest";
import { SETTLE_MANPOWER_COST } from "@border-empires/shared";
import type { GameInitState, GameTile } from "./game-socket.js";
import { buildTileIndex } from "./viewport.js";
import { selectAutoSettlementTargets } from "./auto-settle.js";

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
  eventLog: [],
  autoSettlementQueue: [],
  techIds: [],
  resourceSlots: { supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } }
});

describe("selectAutoSettlementTargets", () => {
  it("includes an owned FRONTIER tile from the queue", () => {
    const tiles: GameTile[] = [{ x: 1, y: 0, ownerId: PLAYER, ownershipState: "FRONTIER" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const targets = selectAutoSettlementTargets([{ x: 1, y: 0 }], index, PLAYER, SETTLE_MANPOWER_COST);
    expect(targets).toEqual([{ x: 1, y: 0 }]);
  });

  it("excludes a tile that is already SETTLED", () => {
    const tiles: GameTile[] = [{ x: 1, y: 0, ownerId: PLAYER, ownershipState: "SETTLED" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const targets = selectAutoSettlementTargets([{ x: 1, y: 0 }], index, PLAYER, SETTLE_MANPOWER_COST);
    expect(targets).toHaveLength(0);
  });

  it("excludes a tile no longer owned by the player", () => {
    const tiles: GameTile[] = [{ x: 1, y: 0, ownerId: RIVAL, ownershipState: "FRONTIER" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const targets = selectAutoSettlementTargets([{ x: 1, y: 0 }], index, PLAYER, SETTLE_MANPOWER_COST);
    expect(targets).toHaveLength(0);
  });

  it("excludes an entry with no known tile at all", () => {
    const index = buildTileIndex(stateWithTiles([]));
    const targets = selectAutoSettlementTargets([{ x: 1, y: 0 }], index, PLAYER, SETTLE_MANPOWER_COST);
    expect(targets).toHaveLength(0);
  });

  it("stops once the manpower budget runs out, taking entries front-to-back", () => {
    const tiles: GameTile[] = [
      { x: 1, y: 0, ownerId: PLAYER, ownershipState: "FRONTIER" },
      { x: 2, y: 0, ownerId: PLAYER, ownershipState: "FRONTIER" },
      { x: 3, y: 0, ownerId: PLAYER, ownershipState: "FRONTIER" }
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const targets = selectAutoSettlementTargets(
      [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 }
      ],
      index,
      PLAYER,
      SETTLE_MANPOWER_COST * 2
    );
    expect(targets).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ]);
  });

  it("skips a stale entry without consuming budget, still taking a later valid one", () => {
    const tiles: GameTile[] = [
      { x: 1, y: 0, ownerId: PLAYER, ownershipState: "SETTLED" },
      { x: 2, y: 0, ownerId: PLAYER, ownershipState: "FRONTIER" }
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const targets = selectAutoSettlementTargets(
      [
        { x: 1, y: 0 },
        { x: 2, y: 0 }
      ],
      index,
      PLAYER,
      SETTLE_MANPOWER_COST
    );
    expect(targets).toEqual([{ x: 2, y: 0 }]);
  });

  // A tile SETTLE was already sent for in an earlier turn stays FRONTIER
  // client-side while the 60s server-side settle resolves (no delta marks
  // "in progress") -- pendingTileKeys is how the caller avoids resending it
  // every turn until it actually flips to SETTLED.
  it("excludes a tile already pending from an earlier drain, without consuming its budget", () => {
    const tiles: GameTile[] = [
      { x: 1, y: 0, ownerId: PLAYER, ownershipState: "FRONTIER" },
      { x: 2, y: 0, ownerId: PLAYER, ownershipState: "FRONTIER" }
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const targets = selectAutoSettlementTargets(
      [
        { x: 1, y: 0 },
        { x: 2, y: 0 }
      ],
      index,
      PLAYER,
      SETTLE_MANPOWER_COST,
      new Set(["1,0"])
    );
    expect(targets).toEqual([{ x: 2, y: 0 }]);
  });
});
