import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { RuntimePlayer } from "../runtime-types.js";
import { isTileVisibleToPlayer, type MusterVisibilityDeps } from "./muster-visibility.js";

const tile = (x: number, y: number, extra: Partial<DomainTileState> = {}): [string, DomainTileState] =>
  [`${x},${y}`, { x, y, terrain: "LAND", ...extra } as DomainTileState];

const deps = (homeDock: Partial<DomainTileState>, covered: string[] = [], allies: string[] = []): MusterVisibilityDeps => ({
  players: new Map([["player-1", { id: "player-1", allies: new Set(allies) } as unknown as RuntimePlayer]]),
  tiles: new Map([tile(10, 10, { dockId: "dock-a", ...homeDock }), tile(80, 80, { dockId: "dock-b" })]),
  dockLinksByDockTileKey: new Map([["10,10", ["80,80"]], ["80,80", ["10,10"]]]),
  visibilityCoverage: { isVisible: (_viewer, key) => covered.includes(key) }
});

describe("isTileVisibleToPlayer", () => {
  it("reads the coverage cache", () => {
    expect(isTileVisibleToPlayer(deps({}, ["5,5"]), "player-1", 5, 5)).toBe(true);
    expect(isTileVisibleToPlayer(deps({}), "player-1", 5, 5)).toBe(false);
  });

  it("sees radius 1 around the far end of a SETTLED owned dock", () => {
    const d = deps({ ownerId: "player-1", ownershipState: "SETTLED" });
    expect(isTileVisibleToPlayer(d, "player-1", 80, 80)).toBe(true);
    expect(isTileVisibleToPlayer(d, "player-1", 81, 79)).toBe(true);
    expect(isTileVisibleToPlayer(d, "player-1", 82, 80)).toBe(false);
  });

  it("does not see through a FRONTIER dock, but does through an ally's settled one", () => {
    expect(isTileVisibleToPlayer(deps({ ownerId: "player-1", ownershipState: "FRONTIER" }), "player-1", 80, 80)).toBe(false);
    expect(isTileVisibleToPlayer(deps({ ownerId: "player-3", ownershipState: "SETTLED" }), "player-1", 80, 80)).toBe(false);
    expect(isTileVisibleToPlayer(deps({ ownerId: "player-3", ownershipState: "SETTLED" }, [], ["player-3"]), "player-1", 80, 80)).toBe(true);
  });
});
