import { describe, expect, it } from "vitest";
import { requiredMusterForTarget } from "@border-empires/shared";
import {
  ATTACK_COMMIT_MAX_ENTRIES,
  ATTACK_COMMIT_TTL_MS,
  attackCommitForTarget,
  attackWireMessage,
  noteWaypointStepEnqueued,
  requiredMusterWithCommit,
  setAttackCommit
} from "./client-attack-commit.js";
import type { ClientWaypoint } from "../client-state/client-waypoint-state.js";
import type { Tile } from "../client-types.js";

const settledEnemy = (x: number, y: number): Tile => ({ x, y, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" }) as Tile;

const makeState = (tiles: Tile[] = []) => ({
  attackCommitByTargetKey: new Map(),
  tiles: new Map(tiles.map((t) => [`${t.x},${t.y}`, t] as const))
});

describe("attack commit store", () => {
  it("returns the recorded commitment only while the target is SETTLED and non-barbarian", () => {
    const tile = settledEnemy(2, 3);
    const state = makeState([tile]);
    setAttackCommit(state, 2, 3, 150);
    expect(attackCommitForTarget(state, 2, 3)).toBe(150);

    tile.ownershipState = "FRONTIER";
    expect(attackCommitForTarget(state, 2, 3)).toBeUndefined();

    tile.ownershipState = "SETTLED";
    tile.ownerId = "barbarian-1";
    expect(attackCommitForTarget(state, 2, 3)).toBeUndefined();
  });

  it("expires entries after the TTL", () => {
    const state = makeState([settledEnemy(1, 1)]);
    setAttackCommit(state, 1, 1, 150, 1_000);
    expect(attackCommitForTarget(state, 1, 1, 1_000 + ATTACK_COMMIT_TTL_MS)).toBe(150);
    expect(attackCommitForTarget(state, 1, 1, 1_001 + ATTACK_COMMIT_TTL_MS)).toBeUndefined();
    expect(state.attackCommitByTargetKey.size).toBe(0);
  });

  it("stays bounded, evicting the oldest entry", () => {
    const state = makeState();
    for (let i = 0; i <= ATTACK_COMMIT_MAX_ENTRIES; i += 1) setAttackCommit(state, i, 0, 100, 5_000);
    expect(state.attackCommitByTargetKey.size).toBe(ATTACK_COMMIT_MAX_ENTRIES);
    expect(state.attackCommitByTargetKey.has("0,0")).toBe(false);
    expect(state.attackCommitByTargetKey.has(`${ATTACK_COMMIT_MAX_ENTRIES},0`)).toBe(true);
  });

  it("raises the muster requirement to the commitment so a floor-only flag isn't treated as funding it", () => {
    const tile = settledEnemy(4, 4);
    const state = makeState([tile]);
    expect(requiredMusterWithCommit(state, tile)).toBe(requiredMusterForTarget(tile));
    setAttackCommit(state, 4, 4, requiredMusterForTarget(tile) * 2);
    expect(requiredMusterWithCommit(state, tile)).toBe(requiredMusterForTarget(tile) * 2);
  });

  it("adds the recorded commitment to the ATTACK wire message, and omits it when none is recorded", () => {
    const state = makeState([settledEnemy(5, 5)]);
    const args = { fromX: 4, fromY: 5, toX: 5, toY: 5, commandId: "c1", clientSeq: 7 };
    expect(attackWireMessage(state, args)).not.toHaveProperty("commitManpower");
    setAttackCommit(state, 5, 5, 175);
    expect(attackWireMessage(state, args)).toEqual({ type: "ATTACK", ...args, commitManpower: 175 });
    expect(attackWireMessage(state, { ...args, commitManpower: 200 }).commitManpower).toBe(200);
  });

  it("records a waypoint's effort only when its final ATTACK leg on the waypoint target is handed to the queue", () => {
    const state = makeState([settledEnemy(9, 9), settledEnemy(8, 9)]);
    const waypoint = { target: { x: 9, y: 9 }, plan: { reachable: true }, commitManpower: 160 } as unknown as ClientWaypoint;

    noteWaypointStepEnqueued(state, waypoint, { target: { x: 8, y: 9 }, action: "ATTACK" }, "8,9");
    expect(waypoint.lastEnqueuedKey).toBe("8,9");
    expect(attackCommitForTarget(state, 8, 9)).toBeUndefined();

    noteWaypointStepEnqueued(state, waypoint, { target: { x: 9, y: 9 }, action: "ATTACK" }, "9,9");
    expect(attackCommitForTarget(state, 9, 9)).toBe(160);
  });
});
