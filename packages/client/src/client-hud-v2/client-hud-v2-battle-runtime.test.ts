// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { battleRowPlan, liveBattleBreakdown, liveBattleTarget } from "./client-hud-v2-battle-runtime.js";

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

describe("each side's strength on a reopened battle", () => {
  const side = (effective: number) => ({ base: 10, infrastructure: [], infrastructureMult: 1, effectiveBase: 10, battle: [{ label: "Fort", mult: 1.5 }], battleMult: 1.5, effective });
  const snapshot = { winChance: 0.62, attackerEffective: 30, defenderEffective: 18, defenderOwnerId: "elin" };

  // Regression: reopening a live battle from the tracker left both side cards on "Reading the odds…" for the whole fight.
  it("uses the modifiers captured at launch", () => {
    const breakdown = { winChance: 0.62, attacker: side(30), defender: side(18) };
    expect(liveBattleBreakdown({ ...snapshot, breakdown })).toEqual(breakdown);
  });

  // The server's locked result includes the committed effort; the cards must agree with the odds shown beside them.
  it("shows the snapshot's locked strengths over the launch preview's", () => {
    const breakdown = { winChance: 0.62, attacker: side(30), defender: side(18) };
    const locked = { ...snapshot, winChance: 0.78, attackerEffective: 41, breakdown };
    expect(liveBattleBreakdown(locked)).toMatchObject({ winChance: 0.78, attacker: { effective: 41, battle: [{ label: "Fort" }] }, defender: { effective: 18 } });
  });

  it("falls back to each side's effective strength", () => {
    expect(liveBattleBreakdown(snapshot)).toMatchObject({ winChance: 0.62, attacker: { effective: 30, battle: [] }, defender: { effective: 18 } });
  });

  it("is unknown without the attacker's strength, but an undefended target is a real 0", () => {
    expect(liveBattleBreakdown(undefined)).toBeUndefined();
    expect(liveBattleBreakdown({ ...snapshot, attackerEffective: 0 })).toBeUndefined();
    expect(liveBattleBreakdown({ ...snapshot, defenderEffective: 0 })).toMatchObject({ defender: { effective: 0 } });
  });
});

describe("pressing the tracker's battle row", () => {
  // Regression: with any other screen up the row only centred the map -- no zoom, no battle screen.
  it("clears another screen out of the way", () => {
    expect(battleRowPlan("chronicle", undefined, "4,5")).toBe("close");
    expect(battleRowPlan("town", undefined, "4,5")).toBe("close");
    expect(battleRowPlan(null, undefined, "4,5")).toBe("open");
  });

  it("keeps this fight's battle screen but replaces another fight's", () => {
    expect(battleRowPlan("battle", "4,5", "4,5")).toBe("keep");
    expect(battleRowPlan("battle", "9,9", "4,5")).toBe("close");
  });
});
