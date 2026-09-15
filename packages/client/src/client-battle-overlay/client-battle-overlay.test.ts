import { describe, expect, it } from "vitest";

import { registerActiveBattleFromTileDelta } from "./client-battle-overlay.js";
import { APPROACH_MS } from "../client-map-3d-popup-marine/popup-marine-overlay-fx.js";

const keyFor = (x: number, y: number) => `${x},${y}`;

const combatJson = (overrides: Partial<{ attackerOwnerId: string; defenderOwnerId: string; attackerWon: boolean; originX: number; originY: number }> = {}) =>
  JSON.stringify({
    attackerOwnerId: "attacker",
    defenderOwnerId: "victim",
    attackerWon: true,
    originX: 4,
    originY: 5,
    ...overrides
  });

describe("registerActiveBattleFromTileDelta", () => {
  // Regression for the actual user-reported bug: the resolved battle used to
  // try to inherit a preceding skirmish's exact startAt/approach timing so
  // its own LINEUP/MARCH interpolation could "pick up mid-stride". That
  // chased two real problems (an attacker's own COMBAT_RESULT-vs-
  // TILE_DELTA_BATCH message race that could drop the inherited timestamp,
  // and a defender's held-open approach plateau) and, when either one bit,
  // the resolved battle would restart the full run-in-from-the-tile-edge
  // sequence from scratch. The actual fix is simpler: the resolved battle
  // never plays that approach at all — it always starts already standing at
  // the firing line, regardless of whether (or how) a skirmish preceded it.
  it("always starts already standing at the firing line, whether or not a skirmish preceded it", () => {
    const nowMs = 5000;
    const withSkirmish = { activeBattles: new Map(), skirmishSeenAt: new Map([["5,5", 1000]]) };
    const withoutSkirmish = { activeBattles: new Map(), skirmishSeenAt: new Map() };

    registerActiveBattleFromTileDelta(withSkirmish, keyFor, { x: 5, y: 5, combatJson: combatJson() }, nowMs);
    registerActiveBattleFromTileDelta(withoutSkirmish, keyFor, { x: 5, y: 5, combatJson: combatJson() }, nowMs);

    for (const state of [withSkirmish, withoutSkirmish]) {
      const battle = state.activeBattles.get("5,5")!;
      // clashAt === nowMs (the firefight is already underway this frame) and
      // startAt is far enough in the past that computeBattlePose's own
      // LINEUP_MS/MARCH_MS checks are already both false — see that
      // function's phase math in popup-marine-timeline.ts.
      expect(battle.clashAt).toBe(nowMs);
      expect(battle.startAt).toBe(nowMs - APPROACH_MS);
    }
  });

  it("still reports fromSkirmish accurately (informational only — no longer affects positioning)", () => {
    const nowMs = 5000;
    const seen = { activeBattles: new Map(), skirmishSeenAt: new Map([["5,5", 1000]]) };
    const unseen = { activeBattles: new Map(), skirmishSeenAt: new Map() };

    registerActiveBattleFromTileDelta(seen, keyFor, { x: 5, y: 5, combatJson: combatJson() }, nowMs);
    registerActiveBattleFromTileDelta(unseen, keyFor, { x: 5, y: 5, combatJson: combatJson() }, nowMs);

    expect(seen.activeBattles.get("5,5")!.fromSkirmish).toBe(true);
    expect(unseen.activeBattles.get("5,5")!.fromSkirmish).toBe(false);
  });

  it("ignores a malformed or missing combatJson", () => {
    const state = { activeBattles: new Map(), skirmishSeenAt: new Map() };

    registerActiveBattleFromTileDelta(state, keyFor, { x: 5, y: 5 }, 5000);
    registerActiveBattleFromTileDelta(state, keyFor, { x: 5, y: 5, combatJson: "not json" }, 5000);

    expect(state.activeBattles.size).toBe(0);
  });
});
