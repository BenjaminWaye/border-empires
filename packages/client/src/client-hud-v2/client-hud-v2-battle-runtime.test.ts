// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { liveBattleTarget } from "./client-hud-v2-battle-runtime.js";

type Input = Parameters<typeof liveBattleTarget>[0];
const state = (capture: Partial<NonNullable<ClientState["capture"]>> | undefined, tiles: Tile[] = []): Input => ({
  me: "me",
  tiles: new Map(tiles.map((t) => [`${t.x},${t.y}`, t])),
  capture: capture ? ({ startAt: 0, resolvesAt: 60_000, target: { x: 4, y: 5 }, ...capture } as NonNullable<ClientState["capture"]>) : undefined
});
const enemyTile = { x: 4, y: 5, ownerId: "elin" } as Tile;

describe("reopening the live battle from the tracker", () => {
  // Regression: the tracker said "Battle at" for a fight with a combat snapshot but no actionType, and pressing it only centred the map.
  it("treats any capture the tracker calls a battle as a live fight", () => {
    expect(liveBattleTarget(state({ combatSnapshot: { winChance: 0.6 } as never }, [enemyTile]))).toMatchObject({ x: 4, y: 5, tile: enemyTile });
    expect(liveBattleTarget(state({ actionType: "ATTACK" }, [enemyTile]))).toMatchObject({ x: 4, y: 5 });
  });

  it("still opens when the target tile is not loaded", () => {
    expect(liveBattleTarget(state({ actionType: "ATTACK" }))).toEqual({ x: 4, y: 5, tile: undefined });
  });

  it("does not open for an expansion, no capture, or a tile already yours", () => {
    expect(liveBattleTarget(state({ actionType: "EXPAND" }, [enemyTile]))).toBeUndefined();
    expect(liveBattleTarget(state(undefined))).toBeUndefined();
    expect(liveBattleTarget(state({ actionType: "ATTACK" }, [{ ...enemyTile, ownerId: "me" }]))).toBeUndefined();
  });
});
