import { describe, expect, it } from "vitest";
import { APPROACH_MS, CLASH_MS, MARINES_PER_SIDE, deathKitFor, dyingIndicesFor } from "./popup-marine-timeline.js";
import { battleSiegeVictim, skirmishSiegeVictim, tileHashSeed } from "./popup-marine-siege-victim.js";
import type { BattleOverlayRenderEntry, BattleOverlaySkirmishEntry } from "./popup-marine-timeline.js";

// A handful of seeds so assertions aren't accidentally pinned to one lucky
// hash roll.
const SEEDS = [1, 2, 3, 7, 42, 99, 1234];

describe("tileHashSeed", () => {
  it("matches the formula client-map-3d-capture-overlays.ts stamps onto every entry's hashSeed", () => {
    expect(tileHashSeed(5, 9)).toBe(5 * 92821 + 9);
  });
});

describe("skirmishSiegeVictim", () => {
  const makeSkirmish = (hashSeed: number, overrides: Partial<BattleOverlaySkirmishEntry> = {}): BattleOverlaySkirmishEntry => ({
    srcWorldX: -1, srcWorldZ: 0, tgtWorldX: 1, tgtWorldZ: 0, srcSurfaceY: 0, tgtSurfaceY: 0,
    attackerColor: "#4fb3ff", defenderColor: "#ff5d5d",
    startAt: 0,
    hashSeed,
    ...overrides
  });

  it("always finds a victim -- the skirmish loop always sheds exactly one defender in its first cycle", () => {
    for (const seed of SEEDS) {
      const victim = skirmishSiegeVictim(makeSkirmish(seed));
      expect(victim).toBeDefined();
      expect(victim!.index).toBeGreaterThanOrEqual(0);
      expect(victim!.index).toBeLessThan(MARINES_PER_SIDE);
    }
  });

  it("picks exactly the marine dyingIndicesFor(defender, winning=true) names, not an arbitrary one", () => {
    for (const seed of SEEDS) {
      const victim = skirmishSiegeVictim(makeSkirmish(seed))!;
      const dyingSet = dyingIndicesFor((side, i) => deathKitFor(seed, side, i), 1, true);
      expect(dyingSet.has(victim.index)).toBe(true);
      expect(dyingSet.size).toBe(1); // WINNER_DEATHS
    }
  });

  it("computes deathAtMs as combat start (startAt + approachMs), not the marine's own random death roll", () => {
    for (const seed of SEEDS) {
      const skirmish = makeSkirmish(seed, { startAt: 10_000 });
      const victim = skirmishSiegeVictim(skirmish)!;
      expect(victim.deathAtMs).toBe(10_000 + APPROACH_MS);
    }
  });

  it("respects a defender's held approach plateau (holdApproachUntilElapsed)", () => {
    const seed = 7;
    const held = makeSkirmish(seed, { startAt: 0, holdApproachUntilElapsed: APPROACH_MS + 5000 });
    const notHeld = makeSkirmish(seed, { startAt: 0 });
    const heldVictim = skirmishSiegeVictim(held)!;
    const plainVictim = skirmishSiegeVictim(notHeld)!;
    expect(heldVictim.index).toBe(plainVictim.index); // same casualty roll either way
    expect(heldVictim.deathAtMs).toBe(plainVictim.deathAtMs + 5000);
  });
});

describe("battleSiegeVictim", () => {
  const makeBattle = (hashSeed: number, overrides: Partial<BattleOverlayRenderEntry> = {}): BattleOverlayRenderEntry => ({
    srcWorldX: -1, srcWorldZ: 0, tgtWorldX: 1, tgtWorldZ: 0, srcSurfaceY: 0, tgtSurfaceY: 0,
    attackerColor: "#4fb3ff", defenderColor: "#ff5d5d",
    attackerWon: true,
    startAt: 0,
    clashAt: APPROACH_MS,
    endAt: APPROACH_MS + CLASH_MS + 950,
    fromSkirmish: false,
    hashSeed,
    ...overrides
  });

  it("returns undefined for a battle continuing a skirmish -- already attributed during that phase", () => {
    for (const seed of SEEDS) {
      expect(battleSiegeVictim(makeBattle(seed, { fromSkirmish: true }))).toBeUndefined();
    }
  });

  it("always finds a victim for a fresh (non-skirmish) battle -- the defender always loses at least WINNER_DEATHS", () => {
    for (const seed of SEEDS) {
      for (const attackerWon of [true, false]) {
        const victim = battleSiegeVictim(makeBattle(seed, { attackerWon }));
        expect(victim).toBeDefined();
      }
    }
  });

  it("uses the defender's own win/loss (not the attacker's) to size the dying set", () => {
    const seed = 42;
    // Defender wins (attacker lost) -> WINNER_DEATHS(1) for the defender.
    const defenderWinsVictim = battleSiegeVictim(makeBattle(seed, { attackerWon: false }))!;
    const dyingWhenDefenderWins = dyingIndicesFor((side, i) => deathKitFor(seed, side, i), 1, true);
    expect(dyingWhenDefenderWins.has(defenderWinsVictim.index)).toBe(true);
    expect(dyingWhenDefenderWins.size).toBe(1);

    // Defender loses (attacker won) -> LOSER_DEATHS(2) for the defender.
    const dyingWhenDefenderLoses = dyingIndicesFor((side, i) => deathKitFor(seed, side, i), 1, false);
    expect(dyingWhenDefenderLoses.size).toBe(2);
  });

  it("computes deathAtMs as combat start (clashAt), not the marine's own random death roll", () => {
    for (const seed of SEEDS) {
      const battle = makeBattle(seed, { clashAt: 20_000 });
      const victim = battleSiegeVictim(battle)!;
      expect(victim.deathAtMs).toBe(20_000);
    }
  });
});
