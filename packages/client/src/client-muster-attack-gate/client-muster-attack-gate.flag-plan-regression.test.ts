import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { setMusterFlagPlan } from "../client-muster-flag-plan/client-muster-flag-plan.js";
import { parkOrReuseMusterFlagForAttack } from "./client-muster-attack-gate.js";
import { processPendingMusterAttacks } from "../client-queue-logic/client-queue-logic.js";
import { requiredMusterWithCommit } from "../client-attack-commit/client-attack-commit.js";
import type { Tile } from "../client-types.js";

// docs/launch-attack-flag-placement-plan.md: a manual attack with no flag
// near used to raise its new flag on the firing tile -- the border tile next
// to the target, the first one an enemy captures. A spot chosen in the Launch
// Attack sheet must be where the flag is raised instead.

const land = (x: number, ownerId: string, extra: Partial<Tile> = {}): Tile =>
  ({ x, y: 0, terrain: "LAND", ownerId, ownershipState: "SETTLED", ...extra }) as Tile;

const setup = () => {
  const state = createInitialState();
  state.me = "me";
  state.musterFlagLimit = 2;
  for (let x = 10; x <= 16; x += 1) state.tiles.set(`${x},0`, land(x, "me"));
  state.tiles.set("17,0", land(17, "enemy"));
  const deps = {
    keyFor: (x: number, y: number) => `${x},${y}`,
    pushFeed: vi.fn(),
    renderHud: vi.fn(),
    sendSetMuster: vi.fn(),
    sendGameMessage: vi.fn(() => true)
  };
  const park = (targetX = 17) =>
    parkOrReuseMusterFlagForAttack(state, { from: state.tiles.get("16,0")!, to: state.tiles.get(`${targetX},0`)!, closest: undefined }, deps);
  return { state, deps, park };
};

describe("parkOrReuseMusterFlagForAttack with a planned flag spot", () => {
  it("raises the new flag on the planned spot, not the firing tile, and parks the attack on it", () => {
    const { state, deps, park } = setup();
    setMusterFlagPlan(state, { x: 17, y: 0 }, { x: 13, y: 0 });
    park();
    expect(deps.sendSetMuster).toHaveBeenCalledWith(13, 0, "HOLD");
    expect(state.pendingMusterAttacks).toEqual([
      expect.objectContaining({ targetX: 17, targetY: 0, fromX: 16, fromY: 0, musterTileKey: "13,0", musterRequestedAt: expect.any(Number) })
    ]);
    expect(deps.pushFeed).toHaveBeenCalledWith(expect.stringContaining("Raising a flag at (13, 0)"), "combat", "info");
    expect(state.musterFlagPlanByTargetKey.size).toBe(0);
  });

  it("keeps the old firing-tile flag when no spot was planned", () => {
    const { deps, park } = setup();
    park();
    expect(deps.sendSetMuster).toHaveBeenCalledWith(16, 0, "HOLD");
  });

  it("reuses a flag that appeared nearby since the launch instead of raising the planned one", () => {
    const { state, deps, park } = setup();
    state.tiles.get("11,0")!.muster = { ownerId: "me", amount: 0, mode: "HOLD", updatedAt: Date.now() } as Tile["muster"];
    setMusterFlagPlan(state, { x: 17, y: 0 }, { x: 13, y: 0 });
    park();
    expect(deps.sendSetMuster).not.toHaveBeenCalled();
    expect(state.pendingMusterAttacks[0]?.musterTileKey).toBe("11,0");
  });

  it("raises one flag for several attacks planned on the same spot", () => {
    const { state, deps, park } = setup();
    state.tiles.set("17,1", { ...land(17, "enemy"), y: 1 } as Tile);
    setMusterFlagPlan(state, { x: 17, y: 0 }, { x: 13, y: 0 });
    setMusterFlagPlan(state, { x: 17, y: 1 }, { x: 13, y: 0 });
    park(17);
    parkOrReuseMusterFlagForAttack(state, { from: state.tiles.get("16,0")!, to: state.tiles.get("17,1")!, closest: undefined }, deps);
    expect(deps.sendSetMuster).toHaveBeenCalledTimes(1);
    expect(state.pendingMusterAttacks.map((e) => e.musterTileKey)).toEqual(["13,0", "13,0"]);
  });

  it("ignores a planned spot the player no longer owns", () => {
    const { state, deps, park } = setup();
    state.tiles.get("13,0")!.ownerId = "enemy";
    setMusterFlagPlan(state, { x: 17, y: 0 }, { x: 13, y: 0 });
    park();
    expect(deps.sendSetMuster).toHaveBeenCalledWith(16, 0, "HOLD");
  });

  it("launches the parked attack once the flag set back from the border has filled", () => {
    const { state, deps, park } = setup();
    setMusterFlagPlan(state, { x: 17, y: 0 }, { x: 13, y: 0 });
    park();
    const required = requiredMusterWithCommit(state, state.tiles.get("17,0"));
    state.tiles.get("13,0")!.muster = { ownerId: "me", amount: required, mode: "HOLD", updatedAt: Date.now() } as Tile["muster"];
    processPendingMusterAttacks(state, {
      keyFor: deps.keyFor,
      isAdjacent: (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by)) === 1,
      pushFeed: deps.pushFeed,
      sendGameMessage: deps.sendGameMessage
    });
    expect(state.actionQueue).toEqual([{ x: 17, y: 0 }]);
    expect(state.pendingMusterAttacks).toHaveLength(0);
  });
});
