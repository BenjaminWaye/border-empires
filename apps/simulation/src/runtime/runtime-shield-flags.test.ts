import { describe, expect, it, vi } from "vitest";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// docs/muster-fronts-proposal.md §4 / docs/replenishment-update-plan.md
// workstream E: end-to-end coverage for shield flags -- a defender's HOLD-mode
// muster flag matching an attacker's commitment within SHIELD_RADIUS_TILES,
// and any flag (any mode) self-shielding its own tile.
describe("shield flags (workstream E)", () => {
  const ATTACKER_ID = "player-1";
  const DEFENDER_ID = "player-2";
  const ORIGIN_KEY_X = 10;
  const ORIGIN_KEY_Y = 10;
  const TARGET_X = 10;
  const TARGET_Y = 11;

  const buildRuntime = (
    defenderTiles: Array<Record<string, unknown>>,
    targetOverrides: Record<string, unknown> = {}
  ) =>
    new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [ATTACKER_ID, buildPlayer(ATTACKER_ID, { manpower: 2_000 })],
        [DEFENDER_ID, buildPlayer(DEFENDER_ID, { isAi: true, manpower: 2_000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: ORIGIN_KEY_X,
            y: ORIGIN_KEY_Y,
            terrain: "LAND",
            ownerId: ATTACKER_ID,
            ownershipState: "SETTLED",
            muster: { ownerId: ATTACKER_ID, amount: 999, mode: "HOLD", updatedAt: 0 }
          },
          {
            x: TARGET_X,
            y: TARGET_Y,
            terrain: "LAND",
            ownerId: DEFENDER_ID,
            ownershipState: "SETTLED",
            ...targetOverrides
          },
          ...defenderTiles
        ],
        activeLocks: []
      }
    }) as SimulationRuntime;

  const attackWith = async (
    runtime: SimulationRuntime,
    commitManpower: number,
    randomValue: number,
    commandId = "shield-attack-1"
  ) => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(randomValue);
    const seen = collectEvents(runtime);
    try {
      runtime.submitCommand({
        commandId,
        sessionId: "session-1",
        playerId: ATTACKER_ID,
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: ORIGIN_KEY_X, fromY: ORIGIN_KEY_Y, toX: TARGET_X, toY: TARGET_Y, commitManpower })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
      await Promise.resolve();
      return seen.find(
        (event): event is Extract<SimulationEvent, { eventType: "COMBAT_RESOLVED" }> => event.eventType === "COMBAT_RESOLVED"
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  };

  const musterAmount = (runtime: SimulationRuntime, x: number, y: number): number | undefined => {
    const tile = runtime.exportState().tiles.find((t) => t.x === x && t.y === y);
    return tile?.musterJson ? JSON.parse(tile.musterJson).amount : undefined;
  };

  it("a HOLD-mode flag within radius 3 lowers the attacker's win chance vs. no shield", async () => {
    const noShieldRuntime = buildRuntime([]);
    // A modest commit (1.5x the 60 floor) that stays under winChance's [0,1]
    // clamp on both sides, so the ratio below isn't distorted by saturation.
    const baseline = await attackWith(noShieldRuntime, 90, 0.5);

    const shieldedRuntime = buildRuntime([
      { x: 10, y: 13, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", muster: { ownerId: DEFENDER_ID, amount: 999, mode: "HOLD", updatedAt: 0 } }
    ]);
    const shielded = await attackWith(shieldedRuntime, 90, 0.5);

    expect(baseline?.combatResult?.winChance).toBeDefined();
    expect(shielded?.combatResult?.winChance).toBeDefined();
    expect(baseline!.combatResult!.winChance).toBeLessThan(1);
    // A full match (shield holds far more than 90) applies 1 + 90/60 = 2.5x
    // defense boost, dividing straight into the attack-side multiplier.
    expect(shielded!.combatResult!.winChance).toBeCloseTo(baseline!.combatResult!.winChance / 2.5, 6);
  });

  it("a HOLD-mode flag beyond radius 3 does not shield", async () => {
    const noShieldRuntime = buildRuntime([]);
    const baseline = await attackWith(noShieldRuntime, 180, 0.5);

    const farShieldRuntime = buildRuntime([
      { x: 10, y: 15, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", muster: { ownerId: DEFENDER_ID, amount: 999, mode: "HOLD", updatedAt: 0 } }
    ]);
    const farShielded = await attackWith(farShieldRuntime, 180, 0.5);

    expect(farShielded!.combatResult!.winChance).toBeCloseTo(baseline!.combatResult!.winChance, 6);
  });

  it("deducts the matched commitment from the shield flag's own tile, win or lose", async () => {
    const runtime = buildRuntime([
      { x: 10, y: 13, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", muster: { ownerId: DEFENDER_ID, amount: 40, mode: "HOLD", updatedAt: 0 } }
    ]);
    // Shield only holds 40, well under the 180 committed -- it spends all of it.
    await attackWith(runtime, 180, 0.999); // near-certain loss
    expect(musterAmount(runtime, 10, 13)).toBeCloseTo(0, 6);
  });

  it("self-shields an attacking flag's own tile even though it's ADVANCE, not HOLD", async () => {
    const noShieldRuntime = buildRuntime([]);
    const baseline = await attackWith(noShieldRuntime, 180, 0.5);

    // Attack directly into the defender's own ADVANCE-mode flag tile (self-shield).
    const selfShieldRuntime = buildRuntime([], {
      muster: { ownerId: DEFENDER_ID, amount: 999, mode: "ADVANCE", updatedAt: 0 }
    });
    const selfShielded = await attackWith(selfShieldRuntime, 180, 0.5, "shield-attack-self");

    expect(selfShielded!.combatResult!.winChance).toBeLessThan(baseline!.combatResult!.winChance);
  });

  it("only the largest of two overlapping shields is used -- they don't stack", async () => {
    const runtime = buildRuntime([
      { x: 10, y: 12, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", muster: { ownerId: DEFENDER_ID, amount: 100, mode: "HOLD", updatedAt: 0 } },
      { x: 10, y: 13, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", muster: { ownerId: DEFENDER_ID, amount: 120, mode: "HOLD", updatedAt: 0 } }
    ]);
    // Commit (180) exceeds the larger single shield (120) but not their
    // combined total (220) -- stacking and non-stacking would disagree here.
    await attackWith(runtime, 180, 0.999); // near-certain loss, so both flags survive to inspect

    expect(musterAmount(runtime, 10, 13)).toBeCloseTo(0, 6); // the larger flag: fully spent (matched 120)
    expect(musterAmount(runtime, 10, 12)).toBeCloseTo(100, 6); // the smaller flag: untouched
  });
});
