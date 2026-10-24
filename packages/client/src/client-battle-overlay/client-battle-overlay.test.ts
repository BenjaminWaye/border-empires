import { describe, expect, it } from "vitest";

import { knownSquadGearFor, registerActiveBattleFromTileDelta, squadGearFields } from "./client-battle-overlay.js";
import type { SquadGear } from "../client-map-3d-popup-marine/popup-marine-gear.js";
import { APPROACH_MS } from "../client-map-3d-popup-marine/popup-marine-overlay-fx.js";

const keyFor = (x: number, y: number) => `${x},${y}`;

const combatJson = (
  overrides: Partial<{
    attackerOwnerId: string;
    defenderOwnerId: string;
    attackerWon: boolean;
    originX: number;
    originY: number;
    shield: { x: number; y: number };
    attackerGear: { titaniumArmor?: boolean; umbriteArms?: boolean };
    defenderGear: { titaniumArmor?: boolean; umbriteArms?: boolean };
  }> = {}
) =>
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
    const withSkirmish = { activeBattles: new Map(), skirmishSeenAt: new Map([["5,5", 1000]]), squadGearByOwner: new Map<string, SquadGear>() };
    const withoutSkirmish = { activeBattles: new Map(), skirmishSeenAt: new Map(), squadGearByOwner: new Map<string, SquadGear>() };

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
    const seen = { activeBattles: new Map(), skirmishSeenAt: new Map([["5,5", 1000]]), squadGearByOwner: new Map<string, SquadGear>() };
    const unseen = { activeBattles: new Map(), skirmishSeenAt: new Map(), squadGearByOwner: new Map<string, SquadGear>() };

    registerActiveBattleFromTileDelta(seen, keyFor, { x: 5, y: 5, combatJson: combatJson() }, nowMs);
    registerActiveBattleFromTileDelta(unseen, keyFor, { x: 5, y: 5, combatJson: combatJson() }, nowMs);

    expect(seen.activeBattles.get("5,5")!.fromSkirmish).toBe(true);
    expect(unseen.activeBattles.get("5,5")!.fromSkirmish).toBe(false);
  });

  it("ignores a malformed or missing combatJson", () => {
    const state = { activeBattles: new Map(), skirmishSeenAt: new Map(), squadGearByOwner: new Map<string, SquadGear>() };

    registerActiveBattleFromTileDelta(state, keyFor, { x: 5, y: 5 }, 5000);
    registerActiveBattleFromTileDelta(state, keyFor, { x: 5, y: 5, combatJson: "not json" }, 5000);

    expect(state.activeBattles.size).toBe(0);
  });

  // Reactive shield reveal (docs/replenishment-update-plan.md workstream E):
  // the server names the defender's shield tile (coordinates only, never the
  // matched amount) instead of correcting the pre-attack odds preview.
  it("carries the shield tile's coordinates through when present", () => {
    const state = { activeBattles: new Map(), skirmishSeenAt: new Map(), squadGearByOwner: new Map<string, SquadGear>() };

    registerActiveBattleFromTileDelta(state, keyFor, { x: 5, y: 5, combatJson: combatJson({ shield: { x: 5, y: 8 } }) }, 5000);

    const battle = state.activeBattles.get("5,5")!;
    expect(battle.shieldX).toBe(5);
    expect(battle.shieldY).toBe(8);
  });

  it("leaves shieldX/shieldY undefined when no shield fired", () => {
    const state = { activeBattles: new Map(), skirmishSeenAt: new Map(), squadGearByOwner: new Map<string, SquadGear>() };

    registerActiveBattleFromTileDelta(state, keyFor, { x: 5, y: 5, combatJson: combatJson() }, 5000);

    const battle = state.activeBattles.get("5,5")!;
    expect(battle.shieldX).toBeUndefined();
    expect(battle.shieldY).toBeUndefined();
  });

  // War gear: one flag per weapons factory type an empire owns (server's
  // CombatBroadcastPayload.attackerGear/defenderGear), which
  // popup-marine-units.ts turns into specialist slots in its squad.
  it("reads each side's war gear from the broadcast", () => {
    const state = { activeBattles: new Map(), skirmishSeenAt: new Map(), squadGearByOwner: new Map<string, SquadGear>() };

    registerActiveBattleFromTileDelta(
      state,
      keyFor,
      { x: 5, y: 5, combatJson: combatJson({ attackerGear: { titaniumArmor: true, umbriteArms: true } }) },
      5000
    );

    const battle = state.activeBattles.get("5,5")!;
    expect(battle.attackerGear).toEqual({ titanium: true, umbrite: true });
    expect(battle.defenderGear).toEqual({});
  });

  it("remembers an owner's gear for later skirmishes, and forgets it once a broadcast shows none", () => {
    const state = { activeBattles: new Map(), skirmishSeenAt: new Map(), squadGearByOwner: new Map<string, SquadGear>() };

    registerActiveBattleFromTileDelta(state, keyFor, { x: 5, y: 5, combatJson: combatJson({ defenderGear: { umbriteArms: true } }) }, 5000);
    expect(knownSquadGearFor(state, "victim")).toEqual({ umbrite: true });
    expect(knownSquadGearFor(state, "attacker")).toEqual({});
    // A skirmish has no broadcast of its own yet, so it falls back to what is known.
    expect(squadGearFields(state, "attacker", "victim")).toEqual({ attackerGear: {}, defenderGear: { umbrite: true } });

    // The same empire later fights without a factory (lost its last one).
    registerActiveBattleFromTileDelta(state, keyFor, { x: 6, y: 6, combatJson: combatJson({ attackerOwnerId: "victim", defenderOwnerId: "other" }) }, 6000);
    expect(knownSquadGearFor(state, "victim")).toEqual({});
    expect(state.squadGearByOwner.has("victim")).toBe(false);
  });

  it("prefers a resolved battle's own gear over the per-owner memory", () => {
    const state = { squadGearByOwner: new Map<string, SquadGear>([["attacker", { titanium: true }]]) };

    expect(squadGearFields(state, "attacker", "victim", { attackerGear: {}, defenderGear: { titanium: true } })).toEqual({
      attackerGear: {},
      defenderGear: { titanium: true }
    });
  });
});
