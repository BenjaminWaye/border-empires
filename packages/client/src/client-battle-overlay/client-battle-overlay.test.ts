import { describe, expect, it } from "vitest";

import { registerActiveBattleFromTileDelta } from "./client-battle-overlay.js";
import { APPROACH_MS } from "../client-map-3d-battle-overlay-fx.js";

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
  it("continues a skirmish's own approach trajectory instead of restarting it, when the resolution broadcast lands mid-approach", () => {
    // Regression: a naive fix that only distinguishes "was there ever a
    // skirmish here" from "was there never one" (rather than tracking exactly
    // how far its approach had gotten) forces an immediate clash the instant
    // any skirmish existed — snapping dots still interpolating in from the
    // tile edge straight to full formation. startAt must stay pinned to the
    // skirmish's own seenAt so the approach math resumes exactly where it was.
    const seenAt = 1000;
    const nowMs = seenAt + 200;
    const state = { activeBattles: new Map(), skirmishSeenAt: new Map([["5,5", seenAt]]) };

    registerActiveBattleFromTileDelta(state, keyFor, { x: 5, y: 5, combatJson: combatJson() }, nowMs);

    const battle = state.activeBattles.get("5,5")!;
    expect(battle.startAt).toBe(seenAt);
    expect(battle.clashAt).toBe(seenAt + APPROACH_MS);
    expect(battle.fromSkirmish).toBe(true);
  });

  it("skips straight to the clash phase when the skirmish's approach had already finished", () => {
    const seenAt = 1000;
    const nowMs = seenAt + APPROACH_MS + 25_000; // long past its own approach window
    const state = { activeBattles: new Map(), skirmishSeenAt: new Map([["5,5", seenAt]]) };

    registerActiveBattleFromTileDelta(state, keyFor, { x: 5, y: 5, combatJson: combatJson() }, nowMs);

    const battle = state.activeBattles.get("5,5")!;
    expect(battle.clashAt).toBe(nowMs);
    expect(battle.fromSkirmish).toBe(true);
  });

  it("plays a full fresh approach for a bystander with no preceding skirmish", () => {
    const nowMs = 5000;
    const state = { activeBattles: new Map(), skirmishSeenAt: new Map() };

    registerActiveBattleFromTileDelta(state, keyFor, { x: 5, y: 5, combatJson: combatJson() }, nowMs);

    const battle = state.activeBattles.get("5,5")!;
    expect(battle.startAt).toBe(nowMs);
    expect(battle.clashAt).toBe(nowMs + APPROACH_MS);
    expect(battle.fromSkirmish).toBe(false);
  });
});
